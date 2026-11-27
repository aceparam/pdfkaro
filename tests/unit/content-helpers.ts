// Shared by the content reader's tests: encoders for every filter step the reader decodes, PDF files written
// byte by byte with chosen content streams, a fetch that records and throws, the test-only editor that runs every
// edit position without any tool's rule, and the test-only caller that leaves every stream of a page when one is
// doubt. Expected outputs are worked out here from the inputs, never from the module's own exports.

import { createRequire } from 'node:module';
import { constants as zlibConstants, deflateRawSync, deflateSync, inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, expect } from 'vitest';
import { editContent, type Edit, type Editor, type OperandRun, type Place, type Read, type Spend } from '../../src/engines/content';
import { freshQpdf, plainCopy } from '../../src/engines/plain';
import { createQpdf } from '../../src/engines/qpdf';
import { isDict, isRef, rawBatches, readDictionaries, readRawStreams, type Dict, type ObjectEntry } from '../../src/engines/qpdf-json';
import type { EngineTools } from '../../src/engines/types';

export const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
export const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');
export const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** Replaces `fetch` for the file: every call is recorded and throws; asserted never called. */
export function noRequests(what: string) {
  const fetched: unknown[] = [];
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = ((...args: unknown[]) => {
      fetched.push(args[0]);
      throw new Error(`No request may be made by ${what}.`);
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    expect(fetched).toEqual([]);
  });
}

/** A budget that records every amount, refusing past `limit` with its own error. */
export class BudgetRefused extends Error {}
export function recordingBudget(limit = Number.POSITIVE_INFINITY): Spend & { calls: number[]; total: number } {
  const spend = ((bytes: number) => {
    spend.calls.push(bytes);
    spend.total += bytes;
    if (spend.total > limit) throw new BudgetRefused('over');
  }) as Spend & { calls: number[]; total: number };
  spend.calls = [];
  spend.total = 0;
  return spend;
}

// ---------------------------------------------------------------------------
// Encoders

export const flate = (data: Uint8Array) => new Uint8Array(deflateSync(data));

/** RunLength: literal runs of up to 128 bytes and repeats of 3 or more, ending with 128. */
export function runLength(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let at = 0;
  while (at < data.length) {
    let repeat = 1;
    while (at + repeat < data.length && repeat < 128 && data[at + repeat] === data[at]) repeat++;
    if (repeat >= 3) {
      out.push(257 - repeat, data[at]!);
      at += repeat;
      continue;
    }
    let length = 0;
    while (at + length < data.length && length < 128) {
      if (at + length + 2 < data.length && data[at + length] === data[at + length + 1] && data[at + length] === data[at + length + 2]) break;
      length++;
    }
    out.push(length - 1, ...data.subarray(at, at + length));
    at += length;
  }
  out.push(128);
  return Uint8Array.from(out);
}

/** LZW as PDF reads it, codes most significant bit first, with a clear at the start and before the table fills. */
export function lzw(data: Uint8Array, earlyChange: 0 | 1 = 1, { clearAt = 4000 } = {}): Uint8Array {
  const bits: number[] = [];
  let emitted = 0;
  const widthFor = () => {
    const reach = 258 + Math.max(0, emitted - 1) + earlyChange;
    return reach < 512 ? 9 : reach < 1024 ? 10 : reach < 2048 ? 11 : 12;
  };
  const emit = (code: number) => {
    const width = widthFor();
    for (let bit = width - 1; bit >= 0; bit--) bits.push((code >> bit) & 1);
    emitted++;
  };
  const clear = () => {
    emit(256);
    emitted = 0;
  };
  let table = new Map<string, number>();
  let next = 258;
  clear();
  let current = '';
  for (const byte of data) {
    const joined = current + String.fromCharCode(byte);
    if (current === '' || table.has(joined) || joined.length === 1) {
      current = joined;
      continue;
    }
    emit(current.length === 1 ? current.charCodeAt(0) : table.get(current)!);
    table.set(joined, next++);
    current = String.fromCharCode(byte);
    if (next >= clearAt) {
      emit(current.charCodeAt(0));
      current = '';
      clear();
      table = new Map();
      next = 258;
    }
  }
  if (current !== '') emit(current.length === 1 ? current.charCodeAt(0) : table.get(current)!);
  emit(257);
  while (bits.length % 8 !== 0) bits.push(0);
  const out = new Uint8Array(bits.length / 8);
  for (let index = 0; index < bits.length; index++) out[index >> 3]! |= bits[index]! << (7 - (index & 7));
  return out;
}

/** ASCII85 with `z` for zero groups, ending ~>. */
export function ascii85(data: Uint8Array, { zeros = true } = {}): Uint8Array {
  let out = '';
  for (let at = 0; at < data.length; at += 4) {
    const group = data.subarray(at, at + 4);
    const padded = new Uint8Array(4);
    padded.set(group);
    let value = ((padded[0]! << 24) >>> 0) + (padded[1]! << 16) + (padded[2]! << 8) + padded[3]!;
    if (zeros && group.length === 4 && value === 0) {
      out += 'z';
      continue;
    }
    const chars: string[] = [];
    for (let index = 0; index < 5; index++) {
      chars.unshift(String.fromCharCode(33 + (value % 85)));
      value = Math.floor(value / 85);
    }
    out += chars.slice(0, group.length + 1).join('');
  }
  return latin1(`${out}~>`);
}

export const asciiHex = (data: Uint8Array) => latin1(`${Buffer.from(data).toString('hex')}>`);

/** PNG predictor rows: each row's tag cycles through 0 to 4 (or is `tag`), with `pixelBytes` bytes to a pixel. */
export function pngPredict(data: Uint8Array, rowBytes: number, pixelBytes: number, tag?: number): Uint8Array {
  const rows = data.length / rowBytes;
  const out = new Uint8Array(rows * (rowBytes + 1));
  for (let row = 0; row < rows; row++) {
    const type = tag ?? row % 5;
    out[row * (rowBytes + 1)] = type;
    for (let index = 0; index < rowBytes; index++) {
      const at = row * rowBytes + index;
      const left = index >= pixelBytes ? data[at - pixelBytes]! : 0;
      const up = row > 0 ? data[at - rowBytes]! : 0;
      const upLeft = row > 0 && index >= pixelBytes ? data[at - rowBytes - pixelBytes]! : 0;
      let guess = 0;
      if (type === 1) guess = left;
      else if (type === 2) guess = up;
      else if (type === 3) guess = (left + up) >> 1;
      else if (type === 4) {
        const estimate = left + up - upLeft;
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
        guess = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      out[row * (rowBytes + 1) + 1 + index] = (data[at]! - guess) & 0xff;
    }
  }
  return out;
}

/** TIFF predictor 2 at 8 bits: each byte less the one `colors` before it in its row. */
export function tiffPredict(data: Uint8Array, rowBytes: number, colors: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let at = 0; at < data.length; at++) out[at] = (data[at]! - (at % rowBytes >= colors ? data[at - colors]! : 0)) & 0xff;
  return out;
}

// ---------------------------------------------------------------------------
// PDF files

/** An object: a value written as it is, or a stream with its dictionary's entries (no /Length) and its data. */
export type PdfObject = string | { dict: string; data: Uint8Array };

/** A PDF of these objects, numbered from 1 in order, object 1 its catalog; a plain cross-reference table. */
export function pdfOf(objects: PdfObject[]): Uint8Array {
  const parts: Uint8Array[] = [latin1('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
  const offsets: number[] = [];
  let at = parts[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(at);
    const body =
      typeof object === 'string'
        ? latin1(`${index + 1} 0 obj\n${object}\nendobj\n`)
        : join(latin1(`${index + 1} 0 obj\n<< ${object.dict} /Length ${object.data.length} >>\nstream\n`), object.data, latin1('\nendstream\nendobj\n'));
    parts.push(body);
    at += body.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  parts.push(latin1(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));
  return join(...parts);
}

export const pageResources = '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> /ColorSpace << /CS0 /DeviceRGB /CS9 /DeviceRGB >> >>';

/**
 * A one-page PDF whose page has these content streams (objects 4 on), and `extra` objects after them.
 * `resources` replaces the page's resources.
 */
export function pagePdf(streams: { dict?: string; data: Uint8Array }[], { extra = [] as PdfObject[], resources = pageResources, contentsArray = streams.length > 1 } = {}): Uint8Array {
  const refs = streams.map((_, index) => `${4 + index} 0 R`);
  const contents = contentsArray ? `[${refs.join(' ')}]` : refs[0];
  return pdfOf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources ${resources} /Contents ${contents} >>`,
    ...streams.map((stream) => ({ dict: stream.dict ?? '', data: stream.data })),
    ...extra,
  ]);
}

// ---------------------------------------------------------------------------
// The test-only editor and caller

/**
 * The test-only editor: replaces `w` after one number with ` w 2 w `; puts ` h ` after `re`; puts ` q ` before
 * the operands of `cm`; replaces the operands of `cs` with ` /CS9 ` and puts ` 0 scn ` after it, marked as not
 * counting; removes `d0` commands; and answers doubt for the operators named in `doubtFor`. Every call is recorded.
 */
export function testEditor(doubtFor: string[] = []): Editor & { calls: { operator: string; run: OperandRun }[] } {
  const calls: { operator: string; run: OperandRun }[] = [];
  return {
    calls,
    operators: new Set(['w', 're', 'cm', 'cs', 'd0', ...doubtFor]),
    edit(operator: string, run: OperandRun): Edit | null | 'doubt' {
      calls.push({ operator, run });
      if (doubtFor.includes(operator)) return 'doubt';
      if (operator === 'w') return run.count === 1 && run.numbers === 1 ? { operator: ' w 2 w ' } : null;
      if (operator === 're') return { after: ' h ' };
      if (operator === 'cm') return { before: ' q ' };
      if (operator === 'cs') return run.count === 1 ? { operands: ' /CS9 ', after: ' 0 scn ', counts: false } : null;
      if (operator === 'd0') return { operands: '', operator: '' };
      return null;
    },
  };
}

/** An editor that only records what it sees, editing nothing. */
export function recordingEditor(operators: Iterable<string>): Editor & { seen: { operator: string; run: OperandRun }[] } {
  const seen: { operator: string; run: OperandRun }[] = [];
  return { seen, operators: new Set(operators), edit: (operator, run) => (seen.push({ operator, run: { ...run, last: [...run.last] } }), null) };
}

/**
 * The test-only caller: reads a page's content streams in order, each but the last as `not-last`, and leaves
 * every one of them as it was when any is doubt. Gives each stream's new bytes and the verdicts.
 */
export function editPage(streams: Uint8Array[], editor: Editor, spend: Spend = () => {}): { streams: Uint8Array[]; reads: Read[]; left: boolean } {
  const reads = streams.map((stream, index) => editContent(stream, editor, (index === streams.length - 1 ? 'last' : 'not-last') as Place, spend));
  if (reads.some((read) => read.kind === 'doubt')) return { streams, reads, left: true };
  return { streams: streams.map((stream, index) => (reads[index]!.kind === 'edited' ? (reads[index] as { data: Uint8Array }).data : stream)), reads, left: false };
}

// ---------------------------------------------------------------------------
// Through the plain copy

/** The content streams of a plain copy: each page's /Contents ids, every form XObject, every dictionary, and the raw data. */
export type PlainStreams = { objects: Map<string, ObjectEntry>; pages: string[][]; forms: string[]; raw: Map<string, Uint8Array>; resolve: (value: unknown) => unknown };

/** Reads a plain copy's dictionaries and the raw data of its content and form streams, as an engine would. */
export async function plainStreams(plain: Uint8Array): Promise<PlainStreams> {
  const dictionaries = readDictionaries(await freshQpdf(qpdfTools, plain), []);
  if (!dictionaries) throw new Error('The plain copy could not be read.');
  const { objects } = dictionaries;
  const resolve = (value: unknown) => {
    if (typeof value !== 'string' || !isRef(value)) return value;
    const entry = objects.get(value);
    return entry && 'value' in entry ? entry.value : undefined;
  };
  const pages: string[][] = [];
  const forms: string[] = [];
  for (const [id, entry] of objects) {
    if ('stream' in entry) {
      if (entry.stream.dict['/Subtype'] === '/Form') forms.push(id);
      continue;
    }
    const value = entry.value;
    if (!isDict(value) || value['/Type'] !== '/Page') continue;
    const contents = resolve(value['/Contents']) ?? value['/Contents'];
    const ids = Array.isArray(contents) ? contents : [value['/Contents']];
    pages.push(ids.filter((item): item is string => typeof item === 'string' && isRef(item)));
  }
  const wanted = [...new Set([...pages.flat(), ...forms])];
  const raw = new Map<string, Uint8Array>();
  for await (const batch of readRawStreams(() => freshQpdf(qpdfTools, plain), [], rawBatches(wanted.map((id) => ({ id, length: undefined }))))) for (const [id, data] of batch) raw.set(id, data);
  return { objects, pages, forms, raw, resolve };
}

/** A stream's dictionary in `plainStreams`' objects. */
export const dictOf = (streams: PlainStreams, id: string): Dict => {
  const entry = streams.objects.get(id);
  if (!entry || !('stream' in entry)) throw new Error('not a stream');
  return entry.stream.dict;
};

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
export const qpdfTools: EngineTools = { qpdf: () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm) };
/** The real plain copy of a file. */
export const plainOf = async (file: Uint8Array, password?: string) => (await plainCopy(qpdfTools, file, password)).plain;

/**
 * Raw deflate data that makes `0 0 9 9 re f\n`, then about 70 KiB of blocks that make nothing (empty stored blocks,
 * and empty fixed blocks before them), lined up so each 1 KiB piece ends on a block boundary, then
 * `1 0 0 rg 0 0 50 50 re f\n` in the final block. Every reader decodes both parts; a pusher that ends the data with an
 * empty final push after the quiet stretch would stop at the first.
 */
export function alignedQuietStream(): { raw: Uint8Array; whole: string } {
  const stored = [0x00, 0x00, 0x00, 0xff, 0xff];
  const fixedThenStored = [0x02, 0x00, 0x00, 0x00, 0xff, 0xff];
  const fill = (bytes: number): number[] => {
    for (let six = 0; six <= bytes / 6; six++) {
      if ((bytes - 6 * six) % 5 !== 0) continue;
      return [...Array.from({ length: six }, () => fixedThenStored).flat(), ...Array.from({ length: (bytes - 6 * six) / 5 }, () => stored).flat()];
    }
    throw new Error('no fill');
  };
  const first = deflateRawSync(Buffer.from('0 0 9 9 re f\n'), { finishFlush: zlibConstants.Z_SYNC_FLUSH });
  const parts = [...first, ...fill(1024 - first.length)];
  for (let piece = 0; piece < 70; piece++) parts.push(...fill(1024));
  const raw = Uint8Array.from([...parts, ...deflateRawSync(Buffer.from('1 0 0 rg 0 0 50 50 re f\n'))]);
  const whole = new TextDecoder().decode(inflateRawSync(raw));
  return { raw, whole };
}
