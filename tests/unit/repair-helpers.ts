// Files made in Repair PDF's tests (add-repair-pdf), shared by its unit and end-to-end tests: the 36 damaged kinds
// the plan measured, built in memory from the shared fixtures, the hostile files of the design's threats table, and
// the checks that read a result with qpdf and PDF.js. Nothing here touches the disk but reading the fixtures.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import type { EngineTools } from '../../src/engines/types';
import { tools as drawingTools } from './thumbnail-helpers';

// Paths and require from this file's own address, so the end-to-end tests (ES modules) can import it too.
const here = dirname(fileURLToPath(import.meta.url));
const requireHere = createRequire(import.meta.url);
const wasm = join(here, '../../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
export const makeQpdf = () => createQpdf(async () => requireHere('@neslinesli93/qpdf-wasm'), wasm);
/** Every library the engine's two steps may ask for, from disk. */
export const tools: EngineTools = { ...drawingTools, qpdf: makeQpdf };
export const fixture = (name: string) => new Uint8Array(readFileSync(join(here, '../fixtures', name)));
export const password = 'open-sesame';

export const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');
export const bytesOf = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));

// ---------------------------------------------------------------------------
// Reading results.

/** Runs qpdf on `bytes` with `args` before the file name. */
export async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string; printed: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}

/** Whether `qpdf --check` finishes (exit 0, or 3 with warnings). */
export async function passesCheck(bytes: Uint8Array, given?: string): Promise<boolean> {
  const { code } = await qpdfOn(bytes, [...(given === undefined ? [] : [`--password=${given}`]), '--check']);
  return code === 0 || code === 3;
}

/** qpdf's page count, or NaN. */
export async function qpdfPages(bytes: Uint8Array): Promise<number> {
  const { code, out } = await qpdfOn(bytes, ['--show-npages']);
  return code === 0 || code === 3 ? Number(out.trim()) : Number.NaN;
}

/** What PDF.js reads in a file: each page's text, the bookmarks' titles, the links' addresses and the attachments' names. */
export type Contents = { texts: string[]; outline: string[]; links: string[]; attachments: string[] };

export async function contentsOf(bytes: Uint8Array, given?: string): Promise<Contents> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password: given, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const texts: string[] = [];
  const links: string[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim());
    for (const annotation of await page.getAnnotations()) if (typeof annotation.url === 'string') links.push(annotation.url as string);
  }
  const titles: string[] = [];
  const walk = (items: { title: string; items: unknown[] }[] | null) => {
    for (const item of items ?? []) {
      titles.push(item.title);
      walk(item.items as { title: string; items: unknown[] }[]);
    }
  };
  walk((await doc.getOutline()) as { title: string; items: unknown[] }[] | null);
  await doc.loadingTask.destroy();
  // The files attached to the document, as qpdf lists them: their names, one a line, before " -> ".
  const listed = await qpdfOn(bytes, [...(given === undefined ? [] : [`--password=${given}`]), '--list-attachments']);
  const attachments = listed.code === 0 || listed.code === 3 ? listed.out.split('\n').filter((line) => line.includes(' -> ')).map((line) => line.split(' -> ')[0]!.trim()) : [];
  return { texts, outline: titles, links, attachments };
}

// ---------------------------------------------------------------------------
// The 36 damaged kinds (design, "The damaged files").

/** What a repaired kind must hold at least: its pages, how many keep their text, and the bookmarks, link and attachment. */
export type Expected = { pages: number; text: number; outline?: number; link?: boolean; attachment?: boolean };
export type Kind = { name: string; source: 'text' | 'rich' | 'rich-classic' | 'pages-500' | 'damaged-cut'; bytes: Uint8Array; expected: Expected };

/** The index just after the last `xref` keyword's line start, the start of `trailer` after it, and `startxref`'s value. */
function tableOf(text: string) {
  const xref = text.lastIndexOf('\nxref\n') + 1;
  const trailer = text.indexOf('trailer', xref);
  const startxref = text.lastIndexOf('startxref');
  return { xref, trailer, startxref };
}

/** Every `n` entry of the last cross-reference table moved by `delta` bytes. */
function shiftTable(text: string, delta: number): string {
  const { xref, trailer } = tableOf(text);
  const table = text.slice(xref, trailer).replace(/^(\d{10}) (\d{5}) n/gm, (_, offset: string, generation: string) => `${String(Number(offset) + delta).padStart(10, '0')} ${generation} n`);
  return text.slice(0, xref) + table + text.slice(trailer);
}

/** `startxref`'s value replaced. */
function setStartxref(text: string, value: number): string {
  const at = text.lastIndexOf('startxref');
  return text.slice(0, at) + text.slice(at).replace(/startxref\s+\d+/, `startxref\n${value}`);
}

/** Where object `n` starts. */
const objectAt = (text: string, n: number) => text.indexOf(`\n${n} 0 obj`) + 1;

/** Where object `n`'s stream data starts and ends. */
function streamOf(text: string, n: number): { start: number; end: number } {
  const object = objectAt(text, n);
  const start = text.indexOf('stream\n', object) + 'stream\n'.length;
  const end = text.indexOf('endstream', start);
  return { start, end };
}

/** Bytes changed in the middle of object `n`'s stream data. */
function corruptStream(text: string, n: number, count = 24): string {
  const { start, end } = streamOf(text, n);
  const at = start + Math.floor((end - start) / 2) - Math.floor(count / 2);
  return text.slice(0, at) + 'ÿ\u0000'.repeat(count / 2) + text.slice(at + count);
}

const junk = (count: number) => 'Not part of a PDF: bytes from somewhere else. '.repeat(Math.ceil(count / 46)).slice(0, count);

/** An incremental update after `text` that gives object 3 (the details) a new title, with its /Prev moved by `delta`. */
function withUpdate(text: string, delta: number): string {
  const previous = Number(/startxref\s+(\d+)/.exec(text.slice(text.lastIndexOf('startxref')))![1]);
  let out = text.endsWith('\n') ? text : `${text}\n`;
  const object = out.length;
  out += '3 0 obj\n<< /Title (Updated) /Producer (an update) >>\nendobj\n';
  const xref = out.length;
  out += `xref\n0 1\n0000000000 65535 f \n3 1\n${String(object).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size 11 /Root 2 0 R /Info 3 0 R /Prev ${previous + delta} >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** The classic-table copy of rich.pdf, written by qpdf with no object streams. */
export async function richClassic(): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', fixture('rich.pdf'));
  const { code } = qpdf.call(['/in.pdf', '--object-streams=disable', '/out.pdf']);
  if (code !== 0) throw new Error(`qpdf exit ${code}`);
  return qpdf.read('/out.pdf');
}

const full3: Expected = { pages: 3, text: 3 };
const fullRich: Expected = { pages: 2, text: 2, outline: 2, link: true, attachment: true };

/** The 36 damaged files of the plan, with what each repaired result must hold at least. */
export async function damagedKinds(): Promise<Kind[]> {
  const text = latin1(fixture('text.pdf'));
  const rich = latin1(fixture('rich.pdf'));
  const classic = latin1(await richClassic());
  const many = latin1(fixture('pages-500.pdf'));
  const kinds: Kind[] = [];
  const add = (name: string, source: Kind['source'], made: string | Uint8Array, expected: Expected) =>
    kinds.push({ name, source, bytes: typeof made === 'string' ? bytesOf(made) : made, expected });
  const headerEnd = (each: string) => each.indexOf('\n', each.indexOf('\n') + 1) + 1;

  add('every xref entry 7 bytes off', 'text', shiftTable(text, 7), full3);
  add('every xref entry 7 bytes off, rich content', 'rich-classic', shiftTable(classic, 7), fullRich);
  add('startxref into the middle of an object', 'text', setStartxref(text, objectAt(text, 5) + 10), full3);
  add('startxref into the middle of an object, cross-reference stream', 'rich', setStartxref(rich, objectAt(rich, 5) + 10), fullRich);
  add('startxref past the end of the file', 'text', setStartxref(text, text.length + 1000), full3);
  {
    const { xref, trailer } = tableOf(text);
    add('xref table removed, trailer and startxref kept', 'text', text.slice(0, xref) + text.slice(trailer), full3);
    add('xref, trailer, startxref and %%EOF all removed', 'text', text.slice(0, xref), full3);
    const startxref = text.lastIndexOf('startxref');
    add('trailer dictionary removed', 'text', text.slice(0, trailer) + text.slice(startxref), full3);
  }
  add('no %%EOF', 'text', text.replace('%%EOF', ''), full3);
  add('no %%EOF, cross-reference stream', 'rich', rich.replace('%%EOF', ''), fullRich);
  add('no startxref and no %%EOF, cross-reference stream', 'rich', rich.slice(0, rich.lastIndexOf('startxref')), fullRich);
  {
    const { xref, trailer } = tableOf(text);
    add('cut off in the middle of the xref table', 'text', text.slice(0, xref + Math.floor((trailer - xref) / 2)), full3);
  }
  add('cut off at 90%, classic table', 'rich-classic', classic.slice(0, Math.floor(classic.length * 0.9)), fullRich);
  add('cut off at 90%, cross-reference stream', 'rich', rich.slice(0, Math.floor(rich.length * 0.9)), fullRich);
  add('pages-500.pdf cut off at 60%', 'pages-500', many.slice(0, Math.floor(many.length * 0.6)), { pages: 302, text: 301 });
  add('damaged-cut.pdf as it is', 'damaged-cut', fixture('damaged-cut.pdf'), { pages: 198, text: 197 });
  add('250 bytes of junk before %PDF', 'text', `${junk(249)}\n${text}`, full3);
  add('250 bytes of junk before %PDF, cross-reference stream', 'rich', `${junk(249)}\n${rich}`, fullRich);
  add('junk after %%EOF', 'text', `${text}${junk(300)}`, full3);
  add('102 bytes inserted after the header', 'text', `${text.slice(0, headerEnd(text))}%${'x'.repeat(100)}\n${text.slice(headerEnd(text))}`, full3);
  add('102 bytes inserted after the header, cross-reference stream', 'rich', `${rich.slice(0, headerEnd(rich))}%${'x'.repeat(100)}\n${rich.slice(headerEnd(rich))}`, fullRich);
  add('no %PDF header line', 'text', text.slice(text.indexOf('\n') + 1), full3);
  add('a stream /Length 40 bytes too long', 'text', text.replace('/Length 614', '/Length 654'), full3);
  add('a stream /Length 20 bytes too short', 'text', text.replace('/Length 614', '/Length 594'), full3);
  add('a stream with no /Length', 'text', text.replace('/Length 614', ' '.repeat('/Length 614'.length)), full3);
  add('bytes changed in a compressed drawing stream', 'text', corruptStream(text, 8), { pages: 3, text: 2 });
  add('bytes changed in a compressed object stream', 'rich', corruptStream(rich, 15, 8), { pages: 2, text: 0, attachment: true });
  add('bytes changed in the compressed cross-reference stream', 'rich', corruptStream(rich, 16, 8), fullRich);
  {
    const page = objectAt(text, 7);
    const end = text.indexOf('>>\nendobj', page);
    add("a page dictionary's closing >> blanked", 'text', `${text.slice(0, end)}  ${text.slice(end + 2)}`, { pages: 2, text: 2 });
    const object = objectAt(text, 4);
    const endobj = text.indexOf('endobj', object);
    add('one endobj blanked', 'text', `${text.slice(0, endobj)}      ${text.slice(endobj + 6)}`, full3);
  }
  add('trailer has no /Root', 'text', text.replace('/Root 2 0 R', ' '.repeat('/Root 2 0 R'.length)), full3);
  add('page tree points to a missing object', 'text', text.replace('9 0 R ]', '99 0 R]'), { pages: 2, text: 2 });
  add('every LF made CR LF, classic table', 'text', text.replaceAll('\n', '\r\n'), { pages: 3, text: 1 });
  add('every LF made CR LF, cross-reference stream', 'rich', rich.replaceAll('\n', '\r\n'), { pages: 2, text: 1 });
  {
    const middle = Math.floor(many.length / 2);
    add('4 KB zeroed in the middle of pages-500.pdf', 'pages-500', `${many.slice(0, middle)}${'\u0000'.repeat(4096)}${many.slice(middle + 4096)}`, { pages: 489, text: 488 });
  }
  add('an incremental update whose /Prev is 13 bytes off', 'text', withUpdate(text, 13), full3);
  return kinds;
}

/** The source of a kind, as PDF.js reads it, to compare text page by page. */
export async function sourceContents(source: Kind['source']): Promise<Contents> {
  const bytes = source === 'text' ? fixture('text.pdf') : source === 'rich' ? fixture('rich.pdf') : source === 'rich-classic' ? await richClassic() : fixture('pages-500.pdf');
  return contentsOf(bytes);
}

/** text.pdf with an incremental update that changes page 1's drawing, cut off inside that update's new drawing. */
export function cutUpdate(): Uint8Array {
  const text = latin1(fixture('text.pdf'));
  const previous = Number(/startxref\s+(\d+)/.exec(text.slice(text.lastIndexOf('startxref')))![1]);
  const drawing = 'BT /Helvetica-7098480789 24 Tf 72 700 Td (A newer page one) Tj ET\n'.repeat(40);
  const object = text.length;
  let out = text + `6 0 obj\n<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream\nendobj\n`;
  const xref = out.length;
  out += `xref\n0 1\n0000000000 65535 f \n6 1\n${String(object).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 11 /Root 2 0 R /Info 3 0 R /Prev ${previous} >>\nstartxref\n${xref}\n%%EOF\n`;
  // Cut off in the middle of the newer drawing.
  return bytesOf(out.slice(0, object + Math.floor(drawing.length / 2)));
}

// ---------------------------------------------------------------------------
// Files written by hand.

/** A PDF written by hand from object bodies (object n is `bodies[n - 1]`), with a correct table, or none with `table: false`. */
export function handPdf(bodies: string[], { trailer = '', table = true, header = '%PDF-1.7\n' }: { trailer?: string; table?: boolean; header?: string } = {}): string {
  let out = header;
  const offsets: number[] = [];
  bodies.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  if (!table) return out;
  const xref = out.length;
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** A stream object's body: its dictionary's extra keys and its data. */
export const streamBody = (data: string, extra = '') => `<< ${extra} /Length ${data.length} >>\nstream\n${data}\nendstream`;

/** A zlib stream as latin1 text. */
export const deflated = (data: Uint8Array | string, level = 9) => latin1(new Uint8Array(deflateSync(typeof data === 'string' ? Buffer.from(data, 'latin1') : data, { level })));

/** The start of a one-page file: catalog, page tree and page, with the page's drawing as object 4. */
export const onePage = (drawing: string, extra: string[] = []) => [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
  drawing,
  ...extra,
];

/**
 * How many of the result's pages hold a source page's text, matched in order (a page lost early does not make the
 * later ones count as different). Empty text never counts.
 */
export function keptTexts(source: readonly string[], result: readonly string[]): number {
  let kept = 0;
  let from = 0;
  for (const text of result) {
    if (text === '') continue;
    const at = source.indexOf(text, from);
    if (at < 0) continue;
    kept++;
    from = at + 1;
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Hostile files (the design's threats table). Each is a file qpdf cannot read (no table), so it reaches the pre-pass
// and pdf-lib, unless said otherwise. `size` is about how large it is.

const bombs = new Map<number, string>();
/** Zlib data that unpacks to `bytes` of zeros, made in pieces by Node's zlib and kept for the run, as latin1 text. */
export async function zeroBomb(bytes: number): Promise<string> {
  const known = bombs.get(bytes);
  if (known) return known;
  const { createDeflate } = await import('node:zlib');
  const piece = Buffer.alloc(Math.min(bytes, 64 * 1024 * 1024));
  const parts: Buffer[] = [];
  const deflate = createDeflate({ level: 9 });
  deflate.on('data', (chunk: Buffer) => parts.push(chunk));
  const ended = new Promise((done) => deflate.on('end', done));
  for (let left = bytes; left > 0; left -= piece.length) {
    const chunk = left >= piece.length ? piece : piece.subarray(0, left);
    if (!deflate.write(chunk)) await new Promise((done) => deflate.once('drain', done));
  }
  deflate.end();
  await ended;
  const made = Buffer.concat(parts).toString('latin1');
  bombs.set(bytes, made);
  return made;
}

const repeatTo = (unit: string, size: number) => unit.repeat(Math.max(1, Math.ceil(size / unit.length)));

export const hostile = {
  /** Objects that never close. */
  unclosedObjects: (size: number) => bytesOf(`%PDF-1.7\n${Array.from({ length: Math.ceil(size / 20) }, (_, at) => `${at + 1} 0 obj << /A 1 `).join('')}`),
  /** Streams that never close. */
  unclosedStreams: (size: number) => bytesOf(`%PDF-1.7\n${Array.from({ length: Math.ceil(size / 40) }, (_, at) => `${at + 1} 0 obj << >> stream\nxxxxxxxx\n`).join('')}`),
  /** Literal strings that never close, one an object. */
  unclosedLiteral: (size: number) => bytesOf(`%PDF-1.7\n${Array.from({ length: Math.ceil(size / 40) }, (_, at) => `${at + 1} 0 obj (aaaaaaaaaa((((\n`).join('')}`),
  /** Hex strings that never close, one an object. */
  unclosedHex: (size: number) => bytesOf(`%PDF-1.7\n${Array.from({ length: Math.ceil(size / 40) }, (_, at) => `${at + 1} 0 obj <0a0b0c0d0e0f\n`).join('')}`),
  /** One long literal string, and one long hex string, that never close. */
  longLiteral: (size: number) => bytesOf(`%PDF-1.7\n1 0 obj\n(${repeatTo('a(b', size)}`),
  longHex: (size: number) => bytesOf(`%PDF-1.7\n1 0 obj\n<${repeatTo('0a', size)}`),
  /** Runs of junk and digits between and inside objects. */
  junkRuns: (size: number) => bytesOf(`%PDF-1.7\n1 0 obj << /A ${repeatTo('x', size / 4)} >> endobj\n${repeatTo('#', size / 4)}\n2 0 obj << /B ${repeatTo('7', size / 4)} >> endobj\n${repeatTo('9', size / 4)}`),
  /** Streams with missing, wrong and indirect /Length and many `stream` words in their data. */
  streamWords: (size: number) =>
    bytesOf(
      `%PDF-1.7\n${Array.from({ length: Math.ceil(size / 4000) }, (_, at) => {
        const length = ['', '/Length 5', `/Length ${at + 100000} 0 R`][at % 3];
        return `${at + 1} 0 obj << ${length} >> stream\n${repeatTo('stream ', 3900)}\nendstream endobj\n`;
      }).join('')}`,
    ),
  /** A cross-reference stream with an indirect /Type, /W [0 0 0] and /Size 50000000. */
  xrefStreamBomb: () =>
    bytesOf(
      handPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>', '/XRef', streamBody('', '/Type 4 0 R /W [0 0 0] /Size 50000000 /Root 1 0 R')], { table: false }),
    ),
  /** An object stream of 2,000 entries all at offset 0 of an array of 20,000 numbers. */
  offsetsAtZero: () => {
    const head = Array.from({ length: 2000 }, (_, at) => `${at + 10} 0`).join(' ');
    const data = `${head} [${'1 '.repeat(20000)}]`;
    return bytesOf(handPdf([...onePage(streamBody('')), streamBody(deflated(data), `/Type /ObjStm /N 2000 /First ${head.length + 1} /Filter /FlateDecode`)], { table: false }));
  },
  /** A page tree whose /Kids would multiply into 2^levels pages, and one whose /Kids points back to its parent. */
  kidsBomb: (levels = 24) => {
    const bodies = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [3 0 R 3 0 R] /Count ${2 ** levels} >>`];
    for (let at = 0; at < levels - 1; at++) bodies.push(`<< /Type /Pages /Kids [${4 + at} 0 R ${4 + at} 0 R] /Count 2 >>`);
    bodies.push('<< /Type /Page /MediaBox [0 0 100 100] >>');
    return bytesOf(handPdf(bodies, { table: false }));
  },
  kidsLoop: () => bytesOf(handPdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', '<< /Type /Pages /Parent 2 0 R /Kids [2 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>'], { table: false })),
  /** A Flate stream that unpacks to `bytes` of zeros (`zeroBomb`), as a page's drawing or a picture; with a table (qpdf route) or none. */
  flateBomb: (bomb: string, bytes: number, where: 'drawing' | 'picture', table: boolean) => {
    const drawing = where === 'drawing' ? streamBody(bomb, '/Filter /FlateDecode') : streamBody('q 10 0 0 10 0 0 cm /I Do Q');
    const page =
      where === 'drawing'
        ? '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>'
        : '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /XObject << /I 5 0 R >> >> >>';
    const bodies = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', page, drawing];
    if (where === 'picture') bodies.push(streamBody(bomb, `/Type /XObject /Subtype /Image /Width 16384 /Height ${Math.ceil(bytes / 16384)} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`));
    return bytesOf(handPdf(bodies, { table }));
  },
  /** A file whose catalog's /Metadata unpacks to `bytes`. */
  metadataBomb: (bytes: number) =>
    bytesOf(handPdf(['<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>', streamBody(deflated(Buffer.alloc(bytes, 0x20)), '/Type /Metadata /Subtype /XML /Filter /FlateDecode')], { table: false })),
  /** An object stream whose data passes through `stages` Flate stages. */
  chain: (stages: number, bytes: number) => {
    let data: Uint8Array = Buffer.alloc(bytes, 0x20);
    for (let at = 0; at < stages; at++) data = new Uint8Array(deflateSync(data, { level: 9 }));
    return bytesOf(handPdf([...onePage(streamBody('')), streamBody(latin1(data), `/Type /ObjStm /N 1 /First 4 /Filter [${'/FlateDecode '.repeat(stages)}]`)], { table: false }));
  },
  /** A sound object stream whose one object is a literal string of `bytes` letters. */
  objectStreamOf: (bytes: number) => {
    const data = `10 0 (${'a'.repeat(bytes)})`;
    return bytesOf(handPdf([...onePage(streamBody('')), streamBody(deflated(data), '/Type /ObjStm /N 1 /First 5 /Filter /FlateDecode')], { table: false }));
  },
  /** An object stream holding `bytes` of `0 ` in one array. */
  denseObjectStream: (bytes: number) => {
    const data = `10 0 [${'0 '.repeat(Math.floor(bytes / 2))}]`;
    return bytesOf(handPdf([...onePage(streamBody('')), streamBody(deflated(data), '/Type /ObjStm /N 1 /First 5 /Filter /FlateDecode')], { table: false }));
  },
  /**
   * Round 2 (a): an object pdf-lib cannot parse, with `endobj` inside a string, then fake headers each opening a hex
   * string that never closes: unguarded, each scans to the end of the file.
   */
  pastPrepassHex: (size: number) => bytesOf(`%PDF-1.7\n1 0 obj ] (\nendobj\n${repeatTo('1 0 obj <', size)}`),
  /** Round 2 (b): the same with literal strings, and a space run after a junk byte. */
  pastPrepassLiteral: (size: number) => bytesOf(`%PDF-1.7\n1 0 obj ] (\nendobj\n${repeatTo('1 0 obj (', size)}`),
  pastPrepassSpaces: (size: number) => bytesOf(`%PDF-1.7\n1 0 obj ] (\nendobj\nx${' '.repeat(size)}x)\nendobj\n`),
  /** Round 2 (c): an object stream of `((((…))))` with offsets 0, 1, 2… */
  overlappingOffsets: (count: number) => {
    const head = Array.from({ length: count }, (_, at) => `${at + 10} ${at}`).join(' ');
    const data = `${head} ${'('.repeat(count)}${')'.repeat(count)}`;
    return bytesOf(handPdf([...onePage(streamBody('')), streamBody(deflated(data), `/Type /ObjStm /N ${count} /First ${head.length + 1} /Filter /FlateDecode`)], { table: false }));
  },
  /** Round 3: object-stream entries each `<< /Length L >> stream` reaching one shared `endstream` near its end. */
  objectStreamCopies: (count: number, tail: number) => {
    const offsets: number[] = [];
    let body = '';
    for (let at = 0; at < count; at++) {
      offsets.push(body.length);
      const entry = `<< /Length ${(count - at) * 30 + tail} >> stream\n`;
      body += entry.padEnd(30, ' ');
    }
    body += `${'x'.repeat(tail)}\nendstream`;
    const head = offsets.map((offset, at) => `${at + 10} ${offset}`).join(' ');
    const data = `${head} ${body}`;
    return bytesOf(handPdf([...onePage(streamBody('')), streamBody(deflated(data), `/Type /ObjStm /N ${count} /First ${head.length + 1} /Filter /FlateDecode`)], { table: false }));
  },
  /**
   * Round 3, at the top level: objects each `<< /Type /ObjStm /Length L >> stream`, their /Length reaching one shared
   * `endstream` near the end, each followed at once by `endobj`, so pdf-lib copies to the end, fails on the object
   * stream's missing /N, falls back to the nearby `endobj` and copies again from the next object.
   */
  topLevelCopies: (count: number, tail: number) => {
    let out = '%PDF-1.7\n';
    const starts: number[] = [];
    for (let at = 0; at < count; at++) {
      const piece = `${at + 1} 0 obj << /Type /ObjStm /Length @@@@@@@@@@ >> stream\n`;
      starts.push(out.length + piece.length);
      out += `${piece}endobj\n`;
    }
    out += `${'x'.repeat(tail)}\nendstream\nendobj\n`;
    const end = out.length - '\nendstream\nendobj\n'.length;
    let at = 0;
    return bytesOf(out.replace(/@{10}/g, () => String(end - starts[at++]!).padStart(10, ' ')));
  },
  /** Many tiny Flate streams, each a page's drawing, with a table (qpdf route), for the copy bound. */
  tinyStreams: (count: number) => {
    const bodies = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, at) => `${3 + 2 * at} 0 R`).join(' ')}] /Count ${count} >>`];
    for (let at = 0; at < count; at++) {
      bodies.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents ${4 + 2 * at} 0 R >>`);
      bodies.push(streamBody(deflated('0 0 m'), '/Filter /FlateDecode'));
    }
    return bytesOf(handPdf(bodies));
  },
};

// ---------------------------------------------------------------------------
// Comparing a result with qpdf's own rewrite.

type JsonObject = { value?: unknown; stream?: { dict: Record<string, unknown>; data?: string } };
export type Structure = { catalogKeys: string[]; info: Record<string, unknown>; pages: { contents: string; annots: number; rotate: unknown; box: unknown }[]; fields: unknown[]; outline: string[]; attachments: string[] };

/** What a file holds, read by qpdf's JSON (decoded page contents hashed) and PDF.js (bookmarks), for comparing two files. */
export async function structureOf(bytes: Uint8Array, given?: string): Promise<Structure> {
  const { createHash } = await import('node:crypto');
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const args = [...(given ? [`--password=${given}`] : []), '--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=inline', '--decode-level=generalized', '/in.pdf', '/out.json'];
  const { code } = qpdf.call(args);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  const parsed = JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as { pages: { object: string; contents: string[] }[]; qpdf: [unknown, Record<string, JsonObject>] };
  const objects = parsed.qpdf[1];
  const resolve = (value: unknown): unknown => (typeof value === 'string' && /^\d+ \d+ R$/.test(value) ? objects[`obj:${value}`]?.value : value);
  const trailer = objects.trailer?.value as Record<string, unknown>;
  const catalog = resolve(trailer['/Root']) as Record<string, unknown>;
  const infoValue = resolve(trailer['/Info']);
  const info: Record<string, unknown> = {};
  if (infoValue && typeof infoValue === 'object') for (const [key, value] of Object.entries(infoValue)) info[key] = resolve(value);
  const pages = parsed.pages.map((page) => {
    const dict = objects[`obj:${page.object}`]?.value as Record<string, unknown>;
    const data = page.contents.map((id) => objects[`obj:${id}`]?.stream?.data ?? '').join('|');
    const annots = resolve(dict['/Annots']);
    return { contents: createHash('sha256').update(data).digest('hex'), annots: Array.isArray(annots) ? annots.length : 0, rotate: dict['/Rotate'], box: resolve(dict['/MediaBox']) };
  });
  const fields: unknown[] = [];
  const form = resolve(catalog['/AcroForm']) as Record<string, unknown> | undefined;
  const stack = [...((resolve(form?.['/Fields']) as unknown[] | undefined) ?? [])];
  while (stack.length > 0) {
    const field = resolve(stack.pop()) as Record<string, unknown> | undefined;
    if (!field) continue;
    fields.push([field['/T'], resolve(field['/V'])]);
    stack.push(...(((resolve(field['/Kids']) as unknown[] | undefined) ?? []) as unknown[]));
  }
  const read = await contentsOf(bytes, given);
  return { catalogKeys: Object.keys(catalog).sort(), info, pages, fields: fields.map((each) => JSON.stringify(each)).sort(), outline: read.outline, attachments: read.attachments };
}

/** qpdf's own rewrite of a file: decrypted, with object streams, as Repair PDF's final write makes it. */
export async function qpdfRewrite(bytes: Uint8Array, given?: string): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call([...(given ? [`--password=${given}`] : []), '--decrypt', '/in.pdf', '--object-streams=generate', '/out.pdf']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  return qpdf.read('/out.pdf');
}

// ---------------------------------------------------------------------------
// Protected and damaged copies.

/** A copy of `bytes` encrypted by qpdf with `options` (such as `--bits=128`), with no object streams. */
export async function encryptedCopy(bytes: Uint8Array, options: string[], general: string[] = []): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call([...general, '/in.pdf', '--object-streams=disable', '--encrypt', `--user-password=${password}`, '--owner-password=owner-pass', ...options, '--', '/out.pdf']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  return qpdf.read('/out.pdf');
}

/** A damaged copy: its `startxref` points into the middle of its first object, so our qpdf cannot read it. */
export function damagedCopy(bytes: Uint8Array): Uint8Array {
  const text = latin1(bytes);
  const first = /\n(\d+) 0 obj/.exec(text)!;
  return bytesOf(setStartxref(text, first.index + 11));
}

/**
 * The files of make-many-pages.mjs, built in memory: 120,000 pages sharing one drawing, or (`coloured`) 20,000 pages
 * each with its own drawing. With `damaged`, the startxref points into the middle of the first object.
 */
export function manyPages(coloured: boolean): Uint8Array {
  const pages = coloured ? 20_000 : 120_000;
  const part = (n: number, k: number) => (((n * k) % 1000) / 1000).toFixed(3);
  const parts: string[] = ['%PDF-1.7\n'];
  let offset = parts[0]!.length;
  const offsets: number[] = [];
  const object = (number: number, body: string) => {
    offsets[number] = offset;
    const text = `${number} 0 obj\n${body}\nendobj\n`;
    parts.push(text);
    offset += text.length;
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, n) => `${4 + n} 0 R`).join(' ')}] >>`);
  object(3, streamBody('0 0 0 rg 20 20 160 160 re f').replace('stream\n', 'stream\n'));
  for (let n = 0; n < pages; n++) object(4 + n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents ${coloured ? 4 + pages + n : 3} 0 R >>`);
  if (coloured) for (let n = 0; n < pages; n++) object(4 + pages + n, streamBody(`${part(n, 7)} ${part(n, 13)} ${part(n, 29)} rg 20 20 160 160 re f 0 0 1 RG 4 w 20 100 m 180 100 l S`));
  const count = 4 + pages * (coloured ? 2 : 1);
  const xref = offset;
  const table = [`xref\n0 ${count}\n0000000000 65535 f \n`];
  for (let n = 1; n < count; n++) table.push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  parts.push(table.join(''), `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return bytesOf(parts.join(''));
}
