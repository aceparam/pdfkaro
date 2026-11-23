// Shared by the drawing step's tests, Add page numbers' and Watermark's: the same qpdf and
// pdf-lib the browser gets, PDF.js's legacy build to draw and read results, and
// ways to look at what was drawn and what was kept.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import type { EngineTools } from '../../src/engines/types';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
export const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
export const tools: EngineTools = { qpdf: makeQpdf, pdflib: async () => import('../../src/workers/pdflib') };
export const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));
export const password = 'open-sesame';

export async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}

type Json = Record<string, unknown>;
/** qpdf's JSON of a file: its pages, and every object with stream data decoded and inline. */
export async function jsonOf(bytes: Uint8Array, given?: string): Promise<{ pages: { object: string; contents: string[] }[]; objects: Record<string, { value?: unknown; stream?: { dict: Json; data?: string } }> }> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const args = [...(given ? [`--password=${given}`] : []), '--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=inline', '--decode-level=generalized', '/in.pdf', '/out.json'];
  const { code } = qpdf.call(args);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  const parsed = JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as { pages: { object: string; contents: string[] }[]; qpdf: [unknown, Record<string, { value?: unknown; stream?: { dict: Json; data?: string } }>] };
  return { pages: parsed.pages, objects: parsed.qpdf[1] };
}

/** The decoded data of a stream in `jsonOf`'s objects. */
export const streamText = (objects: Awaited<ReturnType<typeof jsonOf>>['objects'], id: string) => Buffer.from(objects[`obj:${id}`]?.stream?.data ?? '', 'base64').toString('latin1');

/**
 * qpdf's JSON of a file with stream data as stored, for a file with a stream qpdf will not decode (compress-flate-bomb.pdf);
 * each Flate stream is then inflated here, up to 1 MB, so content streams can be compared as text.
 */
export async function rawJsonOf(bytes: Uint8Array): ReturnType<typeof jsonOf> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call(['--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=inline', '--decode-level=none', '/in.pdf', '/out.json']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  const parsed = JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as { pages: { object: string; contents: string[] }[]; qpdf: [unknown, Awaited<ReturnType<typeof jsonOf>>['objects']] };
  for (const entry of Object.values(parsed.qpdf[1])) {
    if (entry.stream?.data === undefined || entry.stream.dict['/Filter'] !== '/FlateDecode') continue;
    try {
      entry.stream.data = inflateSync(Buffer.from(entry.stream.data, 'base64'), { maxOutputLength: 1 << 20 }).toString('base64');
    } catch {
      // Left as stored.
    }
  }
  return { pages: parsed.pages, objects: parsed.qpdf[1] };
}

/**
 * Each page's own content streams, decoded, as text, in page order, read with a password when one is given. Only the
 * content streams are decoded, so a file whose other streams inflate to gigabytes (compress-bomb-attachment.pdf) is
 * read as quickly as any.
 */
export async function pageStreams(bytes: Uint8Array, given?: string): Promise<string[][]> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const withPassword = given ? [`--password=${given}`] : [];
  const listed = qpdf.call([...withPassword, '--json=2', '--json-key=pages', '/in.pdf', '/pages.json']);
  if (listed.code !== 0 && listed.code !== 3) throw new Error(`qpdf exit ${listed.code}`);
  const { pages } = JSON.parse(new TextDecoder().decode(qpdf.read('/pages.json'))) as { pages: { contents: string[] }[] };
  const ids = [...new Set(pages.flatMap((page) => page.contents))];
  if (ids.length === 0) return pages.map(() => []);
  const objects = ids.map((id) => `--json-object=${id.replace(/ 0 R$/, '').replace(/ (\d+) R$/, ',$1')}`);
  const read = qpdf.call([...withPassword, '--json=2', '--json-key=qpdf', ...objects, '--json-stream-data=inline', '--decode-level=generalized', '/in.pdf', '/streams.json']);
  if (read.code !== 0 && read.code !== 3) throw new Error(`qpdf exit ${read.code}`);
  const parsed = JSON.parse(new TextDecoder().decode(qpdf.read('/streams.json'))) as { qpdf: [unknown, Awaited<ReturnType<typeof jsonOf>>['objects']] };
  return pages.map((page) => page.contents.map((id) => streamText(parsed.qpdf[1], id)));
}

/** Each page's stored values that say where it is shown, its own and up the tree, by page order. */
export async function storedPlaces(bytes: Uint8Array): Promise<Json[]> {
  const { pages, objects } = await jsonOf(bytes);
  const value = (id: unknown) => (typeof id === 'string' ? (objects[`obj:${id}`]?.value as Json | undefined) : undefined);
  return pages.map(({ object }) => {
    const found: Json = {};
    let node = value(object);
    for (let depth = 0; node && depth < 10; depth++) {
      for (const key of ['/Rotate', '/MediaBox', '/CropBox', '/TrimBox', '/BleedBox', '/ArtBox', '/UserUnit']) if (key in node && !(`${depth}${key}` in found)) found[`${depth}${key}`] = node[key];
      node = value(node['/Parent']);
    }
    return found;
  });
}

export const pdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');

/** Opens a result in PDF.js. */
export async function open(bytes: Uint8Array) {
  return (await pdfjs()).getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
}

/**
 * Draws each page as PDF.js shows it and finds the red mark on it: its centre
 * as a share of the shown width and of the shown height from the bottom, or
 * null when there is none.
 */
export async function marks(bytes: Uint8Array): Promise<({ x: number; fromBottom: number; width: number; height: number } | null)[]> {
  const doc = await open(bytes);
  const found = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const shown = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1, 800 / Math.max(shown.width, shown.height)) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const k = (y * canvas.width + x) * 4;
        if (data[k]! > 200 && data[k + 1]! < 60 && data[k + 2]! < 60) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    found.push(n ? { x: sx / n / canvas.width, fromBottom: 1 - sy / n / canvas.height, width: canvas.width, height: canvas.height } : null);
    page.cleanup();
  }
  await doc.loadingTask.destroy();
  return found;
}

/** Each page's text through PDF.js, as its items' strings. */
export async function texts(bytes: Uint8Array): Promise<string[][]> {
  const doc = await open(bytes);
  const all: string[][] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    all.push(content.items.map((item) => ('str' in item ? item.str : '')).filter((text) => text.trim() !== ''));
  }
  await doc.loadingTask.destroy();
  return all;
}

/** Where each page's last text item sits, as PDF.js shows the page: its centre as shares of the shown width and of the height from the bottom. */
export async function lastTextPlaces(bytes: Uint8Array): Promise<{ text: string; x: number; fromBottom: number }[]> {
  const doc = await open(bytes);
  const all = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items.filter((item) => 'str' in item && item.str.trim() !== '') as { str: string; transform: number[]; width: number; height: number }[];
    const last = items.at(-1)!;
    // The item's transform is in the page's user space: its baseline starts at (e, f), runs along (a, b) for its
    // width, and its size is along (c, d). The middle of the digits is half the width along, and a third of the size up.
    const [a, b, c, d, e, f] = last.transform as [number, number, number, number, number, number];
    const along = Math.hypot(a, b);
    const px = e + (a / along) * (last.width / 2) + c * 0.35;
    const py = f + (b / along) * (last.width / 2) + d * 0.35;
    const [cx, cy] = viewport.convertToViewportPoint(px, py) as [number, number];
    all.push({ text: last.str, x: cx / viewport.width, fromBottom: 1 - cy / viewport.height });
  }
  await doc.loadingTask.destroy();
  return all;
}

// ---------------------------------------------------------------------------
// Drawing pages to look at what changed (Watermark).

export type Picture = { data: Uint8ClampedArray; width: number; height: number };

/** Each page drawn by PDF.js as it is shown, on white, at most 800 pixels on its longer side. */
export async function pictures(bytes: Uint8Array, given?: string): Promise<Picture[]> {
  const doc = await (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: bytes.slice(), password: given, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const all: Picture[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const shown = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1, 800 / Math.max(shown.width, shown.height)) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    all.push({ data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height });
    page.cleanup();
  }
  await doc.loadingTask.destroy();
  return all;
}

/**
 * The pixels that changed between a page before and after: the box they form, as
 * shares of the shown width and of the height from the top, and the most common
 * red value among those that were white before.
 */
export function changed(before: Picture, after: Picture) {
  if (after.width !== before.width || after.height !== before.height) throw new Error('The two pictures differ in size.');
  let [left, top, right, bottom, n] = [Infinity, Infinity, -Infinity, -Infinity, 0];
  const onWhite = new Map<number, number>();
  for (let y = 0; y < after.height; y++) {
    for (let x = 0; x < after.width; x++) {
      const k = (y * after.width + x) * 4;
      if (Math.abs(after.data[k]! - before.data[k]!) + Math.abs(after.data[k + 1]! - before.data[k + 1]!) + Math.abs(after.data[k + 2]! - before.data[k + 2]!) < 24) continue;
      n++;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + 1);
      if (before.data[k] === 255 && before.data[k + 1] === 255 && before.data[k + 2] === 255) onWhite.set(after.data[k]!, (onWhite.get(after.data[k]!) ?? 0) + 1);
    }
  }
  const mode = [...onWhite.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { n, left: left / after.width, right: right / after.width, top: top / after.height, bottom: bottom / after.height, middleX: (left + right) / 2 / after.width, middleY: (top + bottom) / 2 / after.height, grey: mode };
}
