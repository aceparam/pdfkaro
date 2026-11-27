// Files made in the test for Grayscale PDF, and the ways its results are judged: drawn by PDF.js (pixels neutral and
// at the expected grey, worked out here from the known colours), read by qpdf (dictionaries and streams), and
// compared token by token outside the edits of design decision 4, never through the engine's own exports.

import { createCanvas } from '@napi-rs/canvas';
import { deflateSync } from 'node:zlib';
import { makeRun, run } from '../../src/engines/tools/grayscale-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { latin1, pdfOf, type PdfObject } from './content-helpers';
import { jsonOf, makeQpdf } from './stamp-helpers';
import { tools as drawingTools } from './thumbnail-helpers';

export const tools: EngineTools = { ...drawingTools, qpdf: makeQpdf };

/** Runs the engine (or one made with small limits) and keeps its progress. */
export async function grey(file: Uint8Array, options: { password?: string; engine?: ReturnType<typeof makeRun>; given?: EngineTools } = {}) {
  const progress: Progress[] = [];
  const outputs = await (options.engine ?? run)([file], { passwords: options.password ? [options.password] : [] }, (step) => progress.push(step), options.given ?? tools);
  return { outputs, output: outputs[0], progress };
}

/** A failure, or null. */
export const failure = (promise: Promise<unknown>) => promise.then(() => null, (caught: unknown) => caught as Error);

export type PageSpec = { contents: (string | Uint8Array | { dict: string; data: Uint8Array })[]; resources?: string; extra?: string; size?: number };

/**
 * A PDF: object 1 the catalog, 2 the page tree, 3 on the `objects` given (so object k of them is `3 + k`), then the
 * pages, then their content streams. `catalog` and `tree` add entries to those two dictionaries.
 */
export function build(spec: { objects?: PdfObject[]; pages: PageSpec[]; catalog?: string; tree?: string }): Uint8Array {
  const objects = spec.objects ?? [];
  const firstPage = 3 + objects.length;
  let nextStream = firstPage + spec.pages.length;
  const pageObjects: string[] = [];
  const streams: PdfObject[] = [];
  for (const page of spec.pages) {
    const refs: string[] = [];
    for (const content of page.contents) {
      refs.push(`${nextStream++} 0 R`);
      if (typeof content === 'string') streams.push({ dict: '', data: latin1(content) });
      else if (content instanceof Uint8Array) streams.push({ dict: '', data: content });
      else streams.push(content);
    }
    const size = page.size ?? 200;
    const contents = refs.length === 1 ? refs[0] : `[${refs.join(' ')}]`;
    pageObjects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size} ${size}] ${page.resources === undefined ? '' : `/Resources ${page.resources}`} /Contents ${contents} ${page.extra ?? ''} >>`);
  }
  const kids = spec.pages.map((_, index) => `${firstPage + index} 0 R`).join(' ');
  return pdfOf([`<< /Type /Catalog /Pages 2 0 R ${spec.catalog ?? ''} >>`, `<< /Type /Pages /Kids [${kids}] /Count ${spec.pages.length} ${spec.tree ?? ''} >>`, ...objects, ...pageObjects, ...streams]);
}

/** A stream object with its data compressed by Flate. */
export const flated = (dict: string, data: string | Uint8Array) => ({ dict: `${dict} /Filter /FlateDecode`, data: new Uint8Array(deflateSync(typeof data === 'string' ? latin1(data) : data)) });

// ---------------------------------------------------------------------------
// Drawing, by PDF.js.

export type Drawn = { data: Uint8ClampedArray; width: number; height: number };

/** Each page drawn by PDF.js on white, at one pixel a point (a 200-point page is 200 pixels). */
export async function draw(bytes: Uint8Array, password?: string): Promise<Drawn[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const all: Drawn[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
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

/** The pixel at (x, y) from the top left, as [r, g, b]. */
export function at(picture: Drawn, x: number, y: number): [number, number, number] {
  const k = (Math.round(y) * picture.width + Math.round(x)) * 4;
  return [picture.data[k]!, picture.data[k + 1]!, picture.data[k + 2]!];
}

/** The PDF standard's luminosity, as the test works it out (design decision 2), never through the engine. */
export const luminosity = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
/** CMYK through the standard's simple conversion, then luminosity, on 0 to 1 components. */
export const cmykGrey = (c: number, m: number, y: number, k: number) => luminosity(1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k));

/**
 * How a result's drawing compares with the original's: the most any pixel is from neutral, and how far each pixel
 * is from the original pixel's luminosity, on average and at most.
 */
export function compare(before: Drawn, after: Drawn): { neutral: number; mean: number; most: number } {
  if (before.width !== after.width || before.height !== after.height) throw new Error('The two drawings differ in size.');
  let neutral = 0;
  let sum = 0;
  let most = 0;
  const pixels = after.width * after.height;
  for (let k = 0; k < pixels * 4; k += 4) {
    const [r, g, b] = [after.data[k]!, after.data[k + 1]!, after.data[k + 2]!];
    neutral = Math.max(neutral, Math.abs(r - g), Math.abs(g - b));
    const off = Math.abs(r - luminosity(before.data[k]!, before.data[k + 1]!, before.data[k + 2]!));
    sum += off;
    most = Math.max(most, off);
  }
  return { neutral, mean: sum / pixels, most };
}

/** Whether every pixel is neutral within `within`. */
export function allNeutral(picture: Drawn, within = 2): boolean {
  for (let k = 0; k < picture.data.length; k += 4) {
    if (Math.abs(picture.data[k]! - picture.data[k + 1]!) > within || Math.abs(picture.data[k + 1]! - picture.data[k + 2]!) > within) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Text and operators, by PDF.js.

/** Each page's text items: the string and where it is. */
export async function textItems(bytes: Uint8Array, password?: string): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[][] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? `${item.str}@${item.transform.map((n: number) => n.toFixed(2)).join(',')}` : '')));
  }
  await doc.loadingTask.destroy();
  return pages;
}

/**
 * Each page's PDF.js operator list with every colour-setting operation removed: the operator names, and the
 * arguments of the operators that place things (a transform, a path, a line width). A check that does not use the
 * engine's own reader.
 */
export async function operatorsWithoutColour(bytes: Uint8Array, password?: string): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { OPS } = pdfjs;
  const colour = new Set<number>([
    OPS.setStrokeColorSpace, OPS.setFillColorSpace, OPS.setStrokeColor, OPS.setStrokeColorN, OPS.setFillColor, OPS.setFillColorN,
    OPS.setStrokeGray, OPS.setFillGray, OPS.setStrokeRGBColor, OPS.setFillRGBColor, OPS.setStrokeCMYKColor, OPS.setFillCMYKColor,
  ]);
  const placing = new Set<number>([OPS.transform, OPS.setLineWidth, OPS.constructPath]);
  const names = Object.fromEntries(Object.entries(OPS).map(([name, code]) => [code, name]));
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[][] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const list = await (await doc.getPage(number)).getOperatorList();
    const kept: string[] = [];
    list.fnArray.forEach((fn, index) => {
      if (colour.has(fn)) return;
      kept.push(placing.has(fn) ? `${names[fn]}:${JSON.stringify(list.argsArray[index], (_, value) => (ArrayBuffer.isView(value) ? Array.from(value as unknown as number[]) : value))}` : String(names[fn]));
    });
    pages.push(kept);
  }
  await doc.loadingTask.destroy();
  return pages;
}

// ---------------------------------------------------------------------------
// Tokens.

/** A simple tokenizer for the test's comparisons: strings, hex strings, arrays' brackets, names, other runs. */
export function tokens(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  const whitespace = new Set(['\0', '\t', '\n', '\f', '\r', ' ']);
  const ws = { test: (char: string) => whitespace.has(char) };
  const delim = /[()<>[\]{}/%]/;
  while (at < text.length) {
    const char = text[at]!;
    if (ws.test(char)) {
      at++;
    } else if (char === '%') {
      while (at < text.length && text[at] !== '\n' && text[at] !== '\r') at++;
    } else if (char === '(') {
      let depth = 0;
      const start = at;
      for (; at < text.length; at++) {
        if (text[at] === '\\') at++;
        else if (text[at] === '(') depth++;
        else if (text[at] === ')' && --depth === 0) break;
      }
      out.push(text.slice(start, ++at));
    } else if (text.startsWith('<<', at) || text.startsWith('>>', at)) {
      out.push(text.slice(at, at + 2));
      at += 2;
    } else if (char === '<') {
      const end = text.indexOf('>', at);
      out.push(text.slice(at, end + 1).replace(/\s+/g, ''));
      at = end + 1;
    } else if (char === '[' || char === ']' || char === '{' || char === '}') {
      out.push(char);
      at++;
    } else {
      const start = at;
      at++;
      while (at < text.length && !ws.test(text[at]!) && !delim.test(text[at]!)) at++;
      out.push(text.slice(start, at));
    }
  }
  return out;
}

const isNumber = (token: string | undefined) => token !== undefined && /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(token);

/**
 * Tokens in a canonical form, so a stream and its grey version compare equal exactly when they differ only by the edits
 * of design decision 4: `r g b rg` as `/DeviceRGB cs r g b scn` (and RG, k, K likewise), `sc` as `scn`, the stand-in
 * names as the device names, and a `0 0 0 scn` right after a `cs` (the starting black) dropped.
 */
export function canonical(text: string, names: { rgb: string; cmyk: string } = { rgb: '/GreyRGB', cmyk: '/GreyCMYK' }): string[] {
  const input = tokens(text).map((token) => (token === names.rgb ? '/DeviceRGB' : token === names.cmyk ? '/DeviceCMYK' : token));
  const out: string[] = [];
  for (let index = 0; index < input.length; index++) {
    const token = input[index]!;
    const ops: Record<string, [number, string, string, string]> = { rg: [3, '/DeviceRGB', 'cs', 'scn'], RG: [3, '/DeviceRGB', 'CS', 'SCN'], k: [4, '/DeviceCMYK', 'cs', 'scn'], K: [4, '/DeviceCMYK', 'CS', 'SCN'] };
    const op = ops[token];
    if (op && out.length >= op[0] && out.slice(-op[0]).every(isNumber)) {
      const values = out.splice(out.length - op[0], op[0]);
      out.push(op[1], op[2], ...values, op[3]);
    } else if (token === 'sc') out.push('scn');
    else if (token === 'SC') out.push('SCN');
    else out.push(token);
  }
  // The starting black, written or not, after any selection.
  const dropped: string[] = [];
  for (let index = 0; index < out.length; index++) {
    dropped.push(out[index]!);
    const select = out[index];
    // Exactly three zeros and the operator: a CMYK black has four numbers, so out[index + 4] is not the operator.
    if ((select === 'cs' || select === 'CS') && out[index + 1] === '0' && out[index + 2] === '0' && out[index + 3] === '0' && out[index + 4] === (select === 'cs' ? 'scn' : 'SCN')) index += 4;
  }
  return dropped;
}

/** qpdf's JSON of a file, its objects by id with stream data decoded. */
export async function objectsOf(bytes: Uint8Array, password?: string) {
  return jsonOf(bytes, password);
}

/** A stream's raw data as stored, by object id, for byte-for-byte checks after the plain copy. */
export async function rawStreams(bytes: Uint8Array): Promise<Map<string, string>> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call(['--json=2', '--json-key=qpdf', '--json-stream-data=inline', '--decode-level=none', '/in.pdf', '/out.json']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  const parsed = JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as { qpdf: [unknown, Record<string, { stream?: { data?: string } }>] };
  const out = new Map<string, string>();
  for (const [key, entry] of Object.entries(parsed.qpdf[1])) if (entry.stream?.data !== undefined) out.set(key.slice(4), entry.stream.data);
  return out;
}
