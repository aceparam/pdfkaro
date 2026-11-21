// Shared by the drawing step's tests and Add page numbers': the same qpdf and
// pdf-lib the browser gets, PDF.js's legacy build to draw and read results, and
// ways to look at what was drawn and what was kept.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
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
