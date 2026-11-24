// Shared by Resize pages' tests: PDFs written by hand for them, the engine run with the real qpdf, and ways to read
// a result back through qpdf's JSON and PDF.js. Expected numbers are never taken from the engine.

import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import type { EngineTools, Progress } from '../../src/engines/types';
import { run } from '../../src/engines/tools/resize-pdf';
import { makeQpdf } from './stamp-helpers';

export const tools: EngineTools = { qpdf: makeQpdf };

type Json = Record<string, unknown>;

/** A stream object's body, with its content as it is (no filter). */
export const stream = (content: string, dict = '') => `<< /Length ${Buffer.byteLength(content, 'latin1')} ${dict} >>\nstream\n${content}\nendstream`;

/** A PDF written by hand from object bodies: `bodies[0]` is object 1, the catalog. */
export function pdf(bodies: readonly string[]): Uint8Array {
  const parts: string[] = ['%PDF-1.7\n'];
  const offsets: number[] = [];
  let size = parts[0]!.length;
  bodies.forEach((body, index) => {
    offsets[index + 1] = size;
    const text = `${index + 1} 0 obj\n${body}\nendobj\n`;
    parts.push(text);
    size += Buffer.byteLength(text, 'latin1');
  });
  const count = bodies.length + 1;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  parts.push(table, `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`);
  return new Uint8Array(Buffer.from(parts.join(''), 'latin1'));
}

/** Runs Resize pages on one file. */
export async function resize(bytes: Uint8Array, paper: unknown, given?: string, engine = run) {
  const progress: Progress[] = [];
  const outputs = await engine([bytes], { paper, passwords: given === undefined ? [] : [given] }, (step) => progress.push(step), tools);
  return { output: outputs[0], outputs, progress };
}

/** qpdf's JSON of a file: its pages and every object, with no stream data. */
export async function dictionaries(bytes: Uint8Array, given?: string) {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const args = [...(given ? [`--password=${given}`] : []), '--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=none', '/in.pdf', '/out.json'];
  const { code } = qpdf.call(args);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  const parsed = JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as {
    pages: { object: string; contents: string[] }[];
    qpdf: [Json, Record<string, { value?: unknown; stream?: { dict: Json } }>];
  };
  const objects = parsed.qpdf[1];
  const value = (id: unknown): unknown => (typeof id === 'string' && /^\d+ \d+ R$/.test(id) ? objects[`obj:${id}`]?.value : id);
  return { pages: parsed.pages, objects, value, trailer: objects.trailer?.value as Json };
}

/** Each page's own dictionary, every value resolved one level. */
export async function pageDicts(bytes: Uint8Array, given?: string): Promise<Json[]> {
  const { pages, value } = await dictionaries(bytes, given);
  return pages.map(({ object }) => {
    const dict = value(object) as Json;
    return Object.fromEntries(Object.entries(dict).map(([key, item]) => [key, value(item)]));
  });
}

/** A value with every reference replaced by "R", as qpdf numbers objects afresh when it writes. */
export const withoutRefs = (value: unknown): unknown => JSON.parse(JSON.stringify(value).replace(/"\d+ \d+ R"/g, '"R"'));

/** The `cm` matrix of a resized page's first stream: [k, tx, ty], as written, and the clip's four numbers. */
export function prefixOf(text: string): { k: number; tx: number; ty: number; clip: number[]; kText: string } {
  const match = /^q\n(\S+) 0 0 (\S+) (\S+) (\S+) cm\n(\S+) (\S+) (\S+) (\S+) re W n\n$/.exec(text);
  if (!match) throw new Error(`Not a prefix: ${JSON.stringify(text)}`);
  return { k: Number(match[1]), kText: match[1]!, tx: Number(match[3]), ty: Number(match[4]), clip: match.slice(5, 9).map(Number) };
}

const pdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
const standardFontDataUrl = join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/');

/** Opens a file in PDF.js. */
export async function openPdf(bytes: Uint8Array, given?: string) {
  return (await pdfjs()).getDocument({ data: bytes.slice(), password: given, verbosity: 0, standardFontDataUrl, disableFontFace: true, useSystemFonts: false }).promise;
}

/** Each page's viewport at scale 1 (shown points, user unit included) and annotations as PDF.js reads them. */
export async function shown(bytes: Uint8Array) {
  const doc = await openPdf(bytes);
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const annotations = (await page.getAnnotations()) as { id: string; subtype: string; rect: number[]; annotationFlags: number; popupRef?: string | null; quadPoints?: unknown; inkLists?: unknown }[];
    pages.push({ viewport, view: page.view, rotate: page.rotate, userUnit: page.userUnit, annotations });
  }
  await doc.loadingTask.destroy();
  return pages;
}

export type Picture = { data: Uint8ClampedArray; width: number; height: number };

/** One page drawn by PDF.js as shown, at `scale` pixels a shown point, on white, with annotations. */
export async function picture(bytes: Uint8Array, number: number, scale: number, given?: string): Promise<Picture> {
  const lib = await pdfjs();
  const doc = await openPdf(bytes, given);
  const page = await doc.getPage(number);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context as never, canvas: canvas as never, viewport, annotationMode: lib.AnnotationMode.ENABLE_FORMS }).promise;
  const result = { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  await doc.loadingTask.destroy();
  return result;
}

/** The box of pixels darker than 200 on any channel, in pixels [left, top, right, bottom], or null when none; `where` limits which count. */
export function inkBox(image: Picture, where: (x: number, y: number) => boolean = () => true): [number, number, number, number] | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const k = (y * image.width + x) * 4;
      if (!(image.data[k]! < 200 || image.data[k + 1]! < 200 || image.data[k + 2]! < 200) || !where(x, y)) continue;
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x + 1), Math.max(bottom, y + 1)];
    }
  }
  return left === Infinity ? null : [left, top, right, bottom];
}

/** How many pixels are mostly red (the marks drawn where content must not show). */
export function redPixels(image: Picture, where: (x: number, y: number) => boolean = () => true): number {
  let n = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const k = (y * image.width + x) * 4;
      if (image.data[k]! > 180 && image.data[k + 1]! < 90 && image.data[k + 2]! < 90 && where(x, y)) n++;
    }
  }
  return n;
}

/** The box of mostly red pixels, in pixels [left, top, right, bottom], or null when none. */
export function redBox(image: Picture): [number, number, number, number] | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const k = (y * image.width + x) * 4;
      if (image.data[k]! > 180 && image.data[k + 1]! < 90 && image.data[k + 2]! < 90) [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x + 1), Math.max(bottom, y + 1)];
    }
  }
  return left === Infinity ? null : [left, top, right, bottom];
}

/** A replacement for `fetch` that throws and records, so a test can show the engine fetched nothing. */
export function watchFetch() {
  const calls: unknown[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((...args: unknown[]) => {
    calls.push(args[0]);
    throw new Error('The engine must not fetch.');
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}
