// The strict content reader: decodes a stream of drawing instructions itself,
// within caps (`decodeContent`), reads it with certainty in two streaming
// passes and edits it through a caller's editor, or leaves it exactly as it
// was at the first doubt (`editContent`). Shared by engines that change a few
// operators in a page's drawing instructions; it knows nothing of any tool's
// purpose. A pure module: no page, no network and no library of its own;
// fflate's Inflate, a resolver and a budget come in as arguments.
//
// Rules: openspec `tool-engines`, "Drawing instructions are decoded within
// caps" to "Fixed sentences only", and add-content-reader's design.
// Memory does not grow with a stream: no token or edit is kept, only a few
// numbers and the last four operands' places.

import type { Dict } from './qpdf-json';
import { isZlib, pushPieces, type InflateClass } from './zlib';

/** A decode step's output, and the per-page cap of a tool that uses the reader. */
export const maxContentBytes = 64 * 1024 * 1024;
/** An edited stream. */
export const maxEditedBytes = 3 * maxContentBytes;
/** Filters in a chain. */
export const maxSteps = 4;
/** Arrays and dictionaries open at once, together. */
export const maxNesting = 32;

/** Counts bytes against the caller's budget; throws the caller's own error once it is passed. */
export type Spend = (bytes: number) => void;
/** Follows one reference to a direct value, or gives undefined. */
export type Resolve = (value: unknown) => unknown;

export type DecodedContent = { kind: 'decoded'; data: Uint8Array } | { kind: 'too-large' } | { kind: 'not-decoded' };

// ---------------------------------------------------------------------------
// The sentences this module throws. Each is fixed and holds nothing from a stream.

const pageNumberSentence = 'A page number must be a whole number from 1 up.';
const pageTooLargeSentence = 'A page has too much drawing on it to work on here.';
const mismatchSentence = 'The edited drawing instructions did not come out as worked out.';
const pieceSentence = 'An edit to drawing instructions must be whole tokens between spaces.';

/** A page whose drawing instructions decode past `maxContentBytes`. Known to the worker by its name. */
export class PageTooLarge extends Error {
  override name = 'PageTooLarge';
  readonly page: number;
  constructor(page: number) {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error(pageNumberSentence);
    super(pageTooLargeSentence);
    this.page = page;
  }
}

// ---------------------------------------------------------------------------
// Decoding

const isDictValue = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);
const isRefValue = (value: unknown): value is string => typeof value === 'string' && /^\d+ \d+ R$/.test(value);

type StepName = 'flate' | 'runlength' | 'lzw' | 'ascii85' | 'asciihex';
const stepNames: Record<string, StepName> = {
  '/FlateDecode': 'flate',
  '/Fl': 'flate',
  '/RunLengthDecode': 'runlength',
  '/RL': 'runlength',
  '/LZWDecode': 'lzw',
  '/LZW': 'lzw',
  '/ASCII85Decode': 'ascii85',
  '/A85': 'ascii85',
  '/ASCIIHexDecode': 'asciihex',
  '/AHx': 'asciihex',
};

/** Keys PDF.js reads before or instead of qpdf's, so readers could decode the stream differently. */
const differingKeys = ['/F', '/FFilter', '/FDecodeParms', '/DP'];

/** A predictor's parameters, with the standard's defaults. */
type Predictor = { predictor: number; colors: number; bits: number; columns: number };
type Step = { name: StepName; predictor: Predictor; earlyChange: number };

/** Thrown inside a step when its output would pass the cap; never leaves this module. */
class TooLarge extends Error {}
/** Thrown inside a step when its data breaks a rule; never leaves this module. */
class NotDecoded extends Error {}

const whole = (value: unknown, least: number, most: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;

/** A step's parameters from its /DecodeParms dictionary (or none), or undefined when they cannot be taken. */
function stepOf(name: StepName, parms: unknown): Step | undefined {
  const step: Step = { name, predictor: { predictor: 1, colors: 1, bits: 8, columns: 1 }, earlyChange: 1 };
  if (parms === undefined || parms === null) return step;
  if (!isDictValue(parms)) return undefined;
  if ('/BPC' in parms) return undefined;
  const keys = Object.keys(parms);
  if (name !== 'flate' && name !== 'lzw') return keys.length === 0 ? step : undefined;
  const allowed = name === 'lzw' ? ['/Predictor', '/Colors', '/BitsPerComponent', '/Columns', '/EarlyChange'] : ['/Predictor', '/Colors', '/BitsPerComponent', '/Columns'];
  if (keys.some((key) => !allowed.includes(key))) return undefined;
  const predictor = parms['/Predictor'] ?? 1;
  const colors = parms['/Colors'] ?? 1;
  const bits = parms['/BitsPerComponent'] ?? 8;
  const columns = parms['/Columns'] ?? 1;
  const early = parms['/EarlyChange'] ?? 1;
  if (!whole(predictor, 1, 15) || (predictor > 2 && predictor < 10)) return undefined;
  if (!whole(colors, 1, 32) || !whole(columns, 1, 2 ** 24) || !whole(bits, 1, 16) || ![1, 2, 4, 8, 16].includes(bits)) return undefined;
  if (predictor === 2 && bits !== 8) return undefined;
  // PDF.js works the row out with 32-bit shifts; past this they would disagree.
  if (colors * bits * columns > 2 ** 31 - 1) return undefined;
  // A row over 1 MiB is refused, so undoing a predictor holds at most two rows of that size beside its pieces.
  if (predictor > 1 && Math.ceil((colors * bits * columns) / 8) > pieceSize) return undefined;
  if (early !== 0 && early !== 1) return undefined;
  step.predictor = { predictor, colors, bits, columns };
  step.earlyChange = early;
  return step;
}

/** The steps of a stream's filter, or undefined when the stream is not one the reader decodes. */
function stepsOf(dict: Dict, resolve: Resolve): Step[] | undefined {
  if (differingKeys.some((key) => key in dict)) return undefined;
  let filter = dict['/Filter'];
  if (isRefValue(filter)) filter = resolve(filter);
  let parms = dict['/DecodeParms'];
  if (isRefValue(parms)) parms = resolve(parms);
  let names: unknown[];
  let parmList: unknown[];
  if (typeof filter === 'string') {
    if (!(parms === undefined || parms === null || isDictValue(parms))) return undefined;
    names = [filter];
    parmList = [parms];
  } else if (Array.isArray(filter)) {
    if (filter.length < 1 || filter.length > maxSteps) return undefined;
    if (parms === undefined || parms === null) parmList = filter.map(() => null);
    else if (Array.isArray(parms) && parms.length === filter.length && parms.every((item) => item === null || isDictValue(item))) parmList = parms;
    else return undefined;
    names = filter;
  } else return undefined;
  const steps: Step[] = [];
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    const known = typeof name === 'string' ? stepNames[name] : undefined;
    if (!known) return undefined;
    const step = stepOf(known, parmList[index]);
    if (!step) return undefined;
    steps.push(step);
  }
  if (steps.length === 1) return steps[0]!.name === 'flate' || steps[0]!.name === 'runlength' ? steps : undefined;
  return steps.some((step) => step.name === 'runlength') ? steps : undefined;
}

/**
 * Whether `decodeContent` would decode a stream with this dictionary at all: its filters are one of the shapes it
 * takes. For a caller that must tell a shape it does not take from data that breaks a step (Repair PDF's sweep).
 */
export function decodesContent(dict: Dict, resolve: Resolve): boolean {
  return stepsOf(dict, resolve) !== undefined;
}

/** The largest piece a step's output grows by. */
const pieceSize = 1024 * 1024;
/** The first piece; each later one twice the one before, up to `pieceSize`, so a small stream allocates little. */
const firstPiece = 4 * 1024;

/**
 * A step's output, grown as pieces of 4 KiB doubling to at most 1 MiB, each
 * made only when a byte is written into it, and joined once (the only piece
 * itself when it is exactly full); the cap is checked before each unit is added.
 */
class Output {
  private readonly pieces: Uint8Array[] = [];
  private current: Uint8Array | undefined;
  private nextSize = firstPiece;
  private at = 0;
  total = 0;
  spendError: unknown;
  constructor(private readonly spend: Spend) {}

  /** Room for `bytes` more, or TooLarge. */
  need(bytes: number): void {
    if (this.total + bytes > maxContentBytes) throw new TooLarge();
  }

  /** Hands the piece in hand to the budget and the list; the next is made only when written to. */
  private flush(): void {
    if (!this.current || this.at === 0) return;
    const full = this.at === this.current.length ? this.current : this.current.slice(0, this.at);
    const counted = this.at;
    this.pieces.push(full);
    this.current = undefined;
    this.at = 0;
    try {
      this.spend(counted);
    } catch (error) {
      this.spendError = error;
      throw error;
    }
  }

  /** The piece to write into, with room for at least one byte. */
  private room(): Uint8Array {
    if (this.current && this.at < this.current.length) return this.current;
    this.flush();
    this.current = new Uint8Array(this.nextSize);
    this.nextSize = Math.min(pieceSize, this.nextSize * 2);
    return this.current;
  }

  byte(value: number): void {
    this.room()[this.at++] = value;
    this.total++;
  }

  /** Adds bytes already checked with `need`. */
  bytes(data: Uint8Array): void {
    let from = 0;
    while (from < data.length) {
      const piece = this.room();
      const take = Math.min(data.length - from, piece.length - this.at);
      piece.set(data.subarray(from, from + take), this.at);
      this.at += take;
      from += take;
    }
    this.total += data.length;
  }

  repeat(value: number, count: number): void {
    for (let index = 0; index < count; index++) this.byte(value);
  }

  join(): Uint8Array {
    this.flush();
    if (this.pieces.length === 1 && this.pieces[0]!.length === this.total) {
      const only = this.pieces[0]!;
      this.pieces.length = 0;
      return only;
    }
    const out = new Uint8Array(this.total);
    let at = 0;
    for (const piece of this.pieces) {
      out.set(piece, at);
      at += piece.length;
    }
    this.pieces.length = 0;
    return out;
  }
}

function inflateStep(data: Uint8Array, Inflate: InflateClass, out: Output): void {
  // An empty stream stays empty: qpdf leaves /FlateDecode on a stream with no data, which every reader draws as nothing.
  if (data.length === 0) return;
  if (!isZlib(data)) throw new NotDecoded();
  let ended = false;
  let stop: unknown;
  const inflater = new Inflate((chunk, final) => {
    try {
      out.need(chunk.length);
      out.bytes(chunk);
    } catch (error) {
      stop = error;
      throw error;
    }
    if (final) ended = true;
  });
  const raw = data.subarray(2);
  try {
    if (raw.length === 0) inflater.push(raw, true);
    pushPieces(inflater, raw, () => out.total, () => ended);
  } catch {
    if (stop !== undefined) throw stop;
    throw new NotDecoded();
  }
  // `ended` is set by the final push only (fflate's flag is the push's own), which fflate accepts only for a stream
  // that reached its final block; trailing bytes are cut short by `pushPieces`, and the checksum is not compared.
  if (!ended) throw new NotDecoded();
}

function runLengthStep(data: Uint8Array, out: Output): void {
  let at = 0;
  while (at < data.length) {
    const length = data[at++]!;
    if (length === 128) return;
    if (length < 128) {
      const count = length + 1;
      if (at + count > data.length) throw new NotDecoded();
      out.need(count);
      out.bytes(data.subarray(at, at + count));
      at += count;
    } else {
      if (at >= data.length) throw new NotDecoded();
      const count = 257 - length;
      out.need(count);
      out.repeat(data[at++]!, count);
    }
  }
  // No end mark.
  throw new NotDecoded();
}

function lzwStep(data: Uint8Array, earlyChange: number, out: Output): void {
  // Bit positions are read with 32-bit shifts, so input past 256 MiB is refused.
  if (data.length > 256 * 1024 * 1024) throw new NotDecoded();
  const prefix = new Int16Array(4096);
  const last = new Uint8Array(4096);
  const lengths = new Uint16Array(4096);
  for (let code = 0; code < 256; code++) {
    prefix[code] = -1;
    last[code] = code;
    lengths[code] = 1;
  }
  const scratch = new Uint8Array(4096);
  let next = 258;
  let width = 9;
  let previous = -1;
  let bitAt = 0;
  const totalBits = data.length * 8;
  const widthFor = (entries: number) => {
    const reach = entries + earlyChange;
    return reach < 512 ? 9 : reach < 1024 ? 10 : reach < 2048 ? 11 : 12;
  };
  /** Writes the string of `code` into scratch, from its end; gives its length. */
  const spell = (code: number): number => {
    const length = lengths[code]!;
    let at = length;
    let walk = code;
    while (at > 0) {
      scratch[--at] = last[walk]!;
      walk = prefix[walk]!;
    }
    return length;
  };
  for (;;) {
    if (bitAt + width > totalBits) throw new NotDecoded();
    let code = 0;
    for (let bit = 0; bit < width; bit++, bitAt++) code = (code << 1) | ((data[bitAt >> 3]! >> (7 - (bitAt & 7))) & 1);
    if (code === 257) return;
    if (code === 256) {
      next = 258;
      width = 9;
      previous = -1;
      continue;
    }
    if (previous === -1) {
      if (code >= 256) throw new NotDecoded();
      out.need(1);
      out.byte(code);
      previous = code;
      continue;
    }
    if (next >= 4096) throw new NotDecoded();
    let length: number;
    let first: number;
    if (code < next) {
      length = spell(code);
      first = scratch[0]!;
      out.need(length);
      out.bytes(scratch.subarray(0, length));
    } else if (code === next) {
      length = spell(previous);
      first = scratch[0]!;
      scratch[length] = first;
      out.need(length + 1);
      out.bytes(scratch.subarray(0, length + 1));
    } else throw new NotDecoded();
    prefix[next] = previous;
    last[next] = first;
    lengths[next] = lengths[previous]! + 1;
    next++;
    width = widthFor(next);
    previous = code;
  }
}

function ascii85Step(data: Uint8Array, out: Output): void {
  let group = 0;
  let count = 0;
  for (let at = 0; at < data.length; at++) {
    const byte = data[at]!;
    if (byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a) continue;
    if (byte === 0x7e) {
      if (data[at + 1] !== 0x3e) throw new NotDecoded();
      if (count === 1) throw new NotDecoded();
      if (count > 0) {
        let value = group;
        for (let pad = count; pad < 5; pad++) value = value * 85 + 84;
        if (value > 0xffffffff) throw new NotDecoded();
        out.need(count - 1);
        for (let index = 0; index < count - 1; index++) out.byte(Math.floor(value / 256 ** (3 - index)) % 256);
      }
      return;
    }
    if (byte === 0x7a && count === 0) {
      out.need(4);
      out.repeat(0, 4);
      continue;
    }
    if (byte < 0x21 || byte > 0x75) throw new NotDecoded();
    group = group * 85 + (byte - 0x21);
    count++;
    if (count === 5) {
      if (group > 0xffffffff) throw new NotDecoded();
      out.need(4);
      out.byte(Math.floor(group / 0x1000000) % 256);
      out.byte(Math.floor(group / 0x10000) % 256);
      out.byte(Math.floor(group / 0x100) % 256);
      out.byte(group % 256);
      group = 0;
      count = 0;
    }
  }
  // No ~> at the end.
  throw new NotDecoded();
}

const hexValue = (byte: number) => (byte >= 0x30 && byte <= 0x39 ? byte - 0x30 : byte >= 0x41 && byte <= 0x46 ? byte - 0x37 : byte >= 0x61 && byte <= 0x66 ? byte - 0x57 : -1);
const isSpaceByte = (byte: number) => byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d;

function asciiHexStep(data: Uint8Array, out: Output): void {
  let high = -1;
  for (let at = 0; at < data.length; at++) {
    const byte = data[at]!;
    if (byte === 0x3e) {
      if (high >= 0) {
        out.need(1);
        out.byte(high << 4);
      }
      return;
    }
    if (isSpaceByte(byte)) continue;
    const value = hexValue(byte);
    if (value < 0) throw new NotDecoded();
    if (high < 0) high = value;
    else {
      out.need(1);
      out.byte((high << 4) | value);
      high = -1;
    }
  }
  throw new NotDecoded();
}

/** A predictor undone, a row at a time, holding two rows; refused before anything is allocated when a row is longer than its input. */
function predictStep(data: Uint8Array, { predictor, colors, bits, columns }: Predictor, out: Output): void {
  const rowBytes = Math.ceil((colors * bits * columns) / 8);
  if (predictor === 2) {
    // Refused before anything is allocated for rows.
    if (rowBytes > data.length || data.length % rowBytes !== 0) throw new NotDecoded();
    const row = new Uint8Array(rowBytes);
    for (let at = 0; at < data.length; at += rowBytes) {
      for (let index = 0; index < rowBytes; index++) row[index] = (data[at + index]! + (index >= colors ? row[index - colors]! : 0)) & 0xff;
      out.need(rowBytes);
      out.bytes(row);
    }
    return;
  }
  if (rowBytes + 1 > data.length || data.length % (rowBytes + 1) !== 0) throw new NotDecoded();
  const pixelBytes = Math.max(1, Math.ceil((colors * bits) / 8));
  let previous = new Uint8Array(rowBytes);
  let row = new Uint8Array(rowBytes);
  for (let at = 0; at < data.length; at += rowBytes + 1) {
    const tag = data[at]!;
    if (tag > 4) throw new NotDecoded();
    for (let index = 0; index < rowBytes; index++) {
      const raw = data[at + 1 + index]!;
      const left = index >= pixelBytes ? row[index - pixelBytes]! : 0;
      const up = previous[index]!;
      const upLeft = index >= pixelBytes ? previous[index - pixelBytes]! : 0;
      let value: number;
      if (tag === 0) value = raw;
      else if (tag === 1) value = raw + left;
      else if (tag === 2) value = raw + up;
      else if (tag === 3) value = raw + ((left + up) >> 1);
      else {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        value = raw + (toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft);
      }
      row[index] = value & 0xff;
    }
    out.need(rowBytes);
    out.bytes(row);
    [previous, row] = [row, previous];
  }
}

/**
 * A content stream's raw data decoded, when its filters are exactly the set
 * measured to reach the reader after the plain copy: a lone Flate, a lone
 * RunLength, or a chain of two to four of Flate, RunLength, LZW, ASCII85 and
 * ASCIIHex holding a RunLength. Each step's output is capped at
 * `maxContentBytes` (`too-large` past it, whichever step) and every byte any
 * step makes is passed to `spend`; `spend` throwing stops the decode with its
 * own error. Anything else is `not-decoded`.
 */
export function decodeContent(raw: Uint8Array, dict: Dict, resolve: Resolve, Inflate: InflateClass, spend: Spend): DecodedContent {
  const steps = stepsOf(dict, resolve);
  if (!steps) return { kind: 'not-decoded' };
  let data = raw;
  for (const step of steps) {
    const passes: ((input: Uint8Array, out: Output) => void)[] = [];
    if (step.name === 'flate') passes.push((input, out) => inflateStep(input, Inflate, out));
    else if (step.name === 'runlength') passes.push(runLengthStep);
    else if (step.name === 'lzw') passes.push((input, out) => lzwStep(input, step.earlyChange, out));
    else if (step.name === 'ascii85') passes.push(ascii85Step);
    else passes.push(asciiHexStep);
    if (step.predictor.predictor > 1) passes.push((input, out) => predictStep(input, step.predictor, out));
    for (const pass of passes) {
      const out = new Output(spend);
      try {
        pass(data, out);
      } catch (error) {
        if (out.spendError !== undefined) throw out.spendError;
        if (error instanceof TooLarge) return { kind: 'too-large' };
        if (error instanceof NotDecoded) return { kind: 'not-decoded' };
        throw error;
      }
      data = out.join();
    }
  }
  return { kind: 'decoded', data };
}

// ---------------------------------------------------------------------------
// Reading

export type OperandKind = 'number' | 'name' | 'string' | 'hex' | 'array' | 'dictionary' | 'boolean' | 'null';
export type Operand = { kind: OperandKind; start: number; end: number };
/**
 * The operands since the previous operator: how many, where the first starts, the last four (last at the end),
 * and a fixed-size summary of the whole run: how many were numbers, and a bitmask of every kind seen.
 */
export type OperandRun = { count: number; start: number; last: readonly Operand[]; numbers: number; kinds: number };

const kindList: readonly OperandKind[] = ['number', 'name', 'string', 'hex', 'array', 'dictionary', 'boolean', 'null'];
/** One bit per kind, for `kinds`. */
export const kindBit: Record<OperandKind, number> = { number: 1, name: 2, string: 4, hex: 8, array: 16, dictionary: 32, boolean: 64, null: 128 };

/**
 * Text put before the operands (or before the operator when there are none), in place of the operands
 * (from `run.start` to the end of the last operand), in place of the operator, and after it.
 * `counts: false` marks an edit that does not by itself make the stream changed (grayscale's starting black).
 */
export type Edit = { before?: string; operands?: string; operator?: string; after?: string; counts?: false };
export type Editor = {
  operators: ReadonlySet<string>;
  edit(operator: string, run: OperandRun, data: Uint8Array): Edit | null | 'doubt';
};
/** Where a stream sits: read alone (a form, pattern, glyph, appearance stream or a /DA string), or one of a page's /Contents. */
export type Place = 'alone' | 'not-last' | 'last';
/** `edits` counts only edits that count; `allEdits` counts every edit applied. */
export type Read = { kind: 'edited'; data: Uint8Array; edits: number; allEdits: number } | { kind: 'unchanged' } | { kind: 'doubt' };

/**
 * The 73 operators of ISO 32000-2 Table A.1, the same set as PDF.js 6.5.438's
 * operator table, each with PDF.js's operand count; a count in `variable` is
 * the most PDF.js takes. Written once; the PDF.js agreement tests draw each.
 */
export const operandCounts: Readonly<Record<string, number>> = {
  w: 1, J: 1, j: 1, M: 1, d: 2, ri: 1, i: 1, gs: 1, q: 0, Q: 0, cm: 6, m: 2, l: 2, c: 6, v: 4, y: 4, h: 0, re: 4,
  S: 0, s: 0, f: 0, F: 0, 'f*': 0, B: 0, 'B*': 0, b: 0, 'b*': 0, n: 0, W: 0, 'W*': 0, BT: 0, ET: 0, Tc: 1, Tw: 1,
  Tz: 1, TL: 1, Tf: 2, Tr: 1, Ts: 1, Td: 2, TD: 2, Tm: 6, 'T*': 0, Tj: 1, TJ: 1, "'": 1, '"': 3, d0: 2, d1: 6,
  CS: 1, cs: 1, SC: 4, SCN: 33, sc: 4, scn: 33, G: 1, g: 1, RG: 3, rg: 3, K: 4, k: 4, sh: 1, BI: 0, ID: 0, EI: 1,
  Do: 1, MP: 1, DP: 2, BMC: 1, BDC: 2, EMC: 0, BX: 0, EX: 0,
};
/** The operators PDF.js takes with up to their count of operands. */
export const variableOperands: ReadonlySet<string> = new Set(['SC', 'SCN', 'sc', 'scn']);

const operatorNames = Object.keys(operandCounts);
/** An operator by its bytes (at most three), packed into one number, so no string is made per token. */
const packed = (bytes: ArrayLike<number>, start: number, end: number) => {
  let code = end - start;
  for (let at = start; at < end; at++) code = code * 256 + bytes[at]!;
  return code;
};
const operatorByCode = new Map<number, number>();
operatorNames.forEach((name, index) => {
  const bytes = Array.from(name, (char) => char.charCodeAt(0));
  operatorByCode.set(packed(bytes, 0, bytes.length), index);
});
const opBI = operatorNames.indexOf('BI');
const opID = operatorNames.indexOf('ID');
const opEI = operatorNames.indexOf('EI');
const opBX = operatorNames.indexOf('BX');
const opEX = operatorNames.indexOf('EX');

// Byte classes, ISO 32000 7.2.
const WS = 1; // tab, LF, FF, CR, space (NUL is doubt outside strings)
const DELIM = 2; // ( ) < > [ ] { } / %
const REGULAR = 4; // 0x21 to 0x7E, not a delimiter
const byteClass = new Uint8Array(256);
for (const byte of [0x09, 0x0a, 0x0c, 0x0d, 0x20]) byteClass[byte] = WS;
for (let byte = 0x21; byte <= 0x7e; byte++) byteClass[byte] = REGULAR;
for (const char of '()<>[]{}/%') byteClass[char.charCodeAt(0)] = DELIM;

/** The longest number token read; a longer one is doubt. */
const maxNumberBytes = 32;
/** The longest name `nameValue` reads, once #xx is decoded, as PDF's own limit; a longer one gives undefined. */
const maxNameBytes = 127;

/** Whether bytes start..end are exactly a number: [+-]?(\d+(\.\d*)?|\.\d+), at most `maxNumberBytes` long. */
function isNumber(data: Uint8Array, start: number, end: number): boolean {
  // A number longer than this is doubt: no reader needs one, and it would be copied to be read.
  if (end - start > maxNumberBytes) return false;
  let at = start;
  if (data[at] === 0x2b || data[at] === 0x2d) at++;
  let digits = 0;
  while (at < end && data[at]! >= 0x30 && data[at]! <= 0x39) {
    at++;
    digits++;
  }
  if (at < end && data[at] === 0x2e) {
    at++;
    while (at < end && data[at]! >= 0x30 && data[at]! <= 0x39) {
      at++;
      digits++;
    }
  }
  return at === end && digits > 0;
}

function matches(data: Uint8Array, start: number, end: number, word: string): boolean {
  if (end - start !== word.length) return false;
  for (let index = 0; index < word.length; index++) if (data[start + index] !== word.charCodeAt(index)) return false;
  return true;
}
const isHexDigit = (byte: number | undefined) => byte !== undefined && hexValue(byte) >= 0;

/** A regular run's end from `start`. */
function regularEnd(data: Uint8Array, start: number): number {
  let at = start;
  while (at < data.length && byteClass[data[at]!] === REGULAR) at++;
  return at;
}

/** A name's end from its `/`, or -1 when a `#` is not followed by two hex digits. */
function nameEnd(data: Uint8Array, start: number): number {
  let at = start + 1;
  while (at < data.length && byteClass[data[at]!] === REGULAR) {
    if (data[at] === 0x23) {
      if (!isHexDigit(data[at + 1]) || !isHexDigit(data[at + 2]) || byteClass[data[at + 1]!] !== REGULAR) return -1;
      at += 3;
    } else at++;
  }
  return at;
}

/** A literal string's end (after its `)`), or -1 when it does not close. Any byte may be inside. */
function stringEnd(data: Uint8Array, start: number): number {
  let depth = 1;
  let at = start + 1;
  while (at < data.length) {
    const byte = data[at]!;
    if (byte === 0x5c) at += 2;
    else {
      if (byte === 0x28) depth++;
      else if (byte === 0x29 && --depth === 0) return at + 1;
      at++;
    }
  }
  return -1;
}

/** A hex string's end (after its `>`), or -1: hex digits and whitespace only. */
function hexEnd(data: Uint8Array, start: number): number {
  for (let at = start + 1; at < data.length; at++) {
    const byte = data[at]!;
    if (byte === 0x3e) return at + 1;
    if (!isHexDigit(byte) && byteClass[byte] !== WS) return -1;
  }
  return -1;
}

const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** A name operand as qpdf's JSON writes it: #xx decoded, then strict UTF-8; undefined when not valid UTF-8 or longer than 127 bytes. */
export function nameValue(data: Uint8Array, operand: Operand): string | undefined {
  // Checked before anything is copied: at most three bytes a decoded byte.
  if (operand.end - operand.start - 1 > 3 * maxNameBytes) return undefined;
  const bytes = new Uint8Array(operand.end - operand.start - 1);
  let length = 0;
  for (let at = operand.start + 1; at < operand.end; at++) {
    if (data[at] === 0x23 && isHexDigit(data[at + 1]) && isHexDigit(data[at + 2])) {
      bytes[length++] = hexValue(data[at + 1]!) * 16 + hexValue(data[at + 2]!);
      at += 2;
    } else bytes[length++] = data[at]!;
  }
  if (length > maxNameBytes) return undefined;
  try {
    return `/${textDecoder.decode(bytes.subarray(0, length))}`;
  } catch {
    return undefined;
  }
}

/** A number operand's value. */
export function numberValue(data: Uint8Array, operand: Operand): number {
  let text = '';
  for (let at = operand.start; at < operand.end; at++) text += String.fromCharCode(data[at]!);
  return Number(text);
}

/** Doubt found while reading: the stream is left. Never leaves this module. */
class Doubt extends Error {}

// ---------------------------------------------------------------------------
// Inline pictures

const inlineKeys: Record<string, string> = {
  '/W': 'W', '/Width': 'W', '/H': 'H', '/Height': 'H', '/BPC': 'BPC', '/BitsPerComponent': 'BPC', '/CS': 'CS', '/ColorSpace': 'CS',
  '/IM': 'IM', '/ImageMask': 'IM', '/F': 'F', '/Filter': 'F', '/L': 'L', '/Length': 'L', '/DP': 'DP', '/DecodeParms': 'DP',
  '/D': 'D', '/Decode': 'D', '/I': 'I', '/Interpolate': 'I',
};
const inlineColours: Record<string, number> = { '/G': 1, '/DeviceGray': 1, '/RGB': 3, '/DeviceRGB': 3, '/CMYK': 4, '/DeviceCMYK': 4 };
const inlineFilters: Record<string, 'hex' | 'a85'> = { '/AHx': 'hex', '/ASCIIHexDecode': 'hex', '/A85': 'a85', '/ASCII85Decode': 'a85' };
/** The most keys an inline picture's dictionary may have. */
const maxInlineKeys = 32;
const isAfterEnd = (byte: number) => byte === 0x20 || byte === 0x0a || byte === 0x0d;
const isAnySpace = (byte: number) => byte === 0x00 || byteClass[byte] === WS;

/** Skips whitespace (no comments) from `at`. */
function skipSpaces(data: Uint8Array, at: number): number {
  while (at < data.length && byteClass[data[at]!] === WS) at++;
  return at;
}

/** Bytes start..end are digits only, as a safe whole number, or -1. */
function wholeNumber(data: Uint8Array, start: number, end: number): number {
  if (end <= start || end - start > 15) return -1;
  let value = 0;
  for (let at = start; at < end; at++) {
    const byte = data[at]!;
    if (byte < 0x30 || byte > 0x39) return -1;
    value = value * 10 + (byte - 0x30);
  }
  return value;
}

/** One value of an inline picture's dictionary: its kind and span; for an array or dictionary, how many items and names, and its first name's span. */
type InlineValue = { kind: 'name' | 'number' | 'boolean' | 'array' | 'dictionary'; start: number; end: number; items: number; names: number; first: Operand | undefined; truth: boolean };

/** A name, number or boolean at `at`; doubt for anything else. */
function inlineScalar(data: Uint8Array, at: number): InlineValue {
  const byte = data[at];
  if (byte === undefined) throw new Doubt();
  if (byte === 0x2f) {
    const end = nameEnd(data, at);
    if (end < 0) throw new Doubt();
    return { kind: 'name', start: at, end, items: 0, names: 1, first: { kind: 'name', start: at, end }, truth: false };
  }
  if (byteClass[byte] !== REGULAR) throw new Doubt();
  const end = regularEnd(data, at);
  if (end < data.length && byteClass[data[end]!] === 0) throw new Doubt();
  if (isNumber(data, at, end)) return { kind: 'number', start: at, end, items: 0, names: 0, first: undefined, truth: false };
  if (matches(data, at, end, 'true') || matches(data, at, end, 'false')) return { kind: 'boolean', start: at, end, items: 0, names: 0, first: undefined, truth: data[at] === 0x74 };
  throw new Doubt();
}

/**
 * One value of an inline picture's dictionary at `at`: a name, number,
 * boolean, or an array or dictionary of these, at most `maxNesting` deep;
 * doubt for anything else. A loop with its own small stack, no recursion.
 */
function inlineValue(data: Uint8Array, at: number): InlineValue {
  const opens = (where: number) => data[where] === 0x5b || (data[where] === 0x3c && data[where + 1] === 0x3c);
  if (!opens(at)) return inlineScalar(data, at);
  type Frame = { dictionary: boolean; start: number; items: number; names: number; first: Operand | undefined };
  const frames: Frame[] = [];
  const open = (where: number) => {
    if (frames.length >= maxNesting) throw new Doubt();
    const dictionary = data[where] === 0x3c;
    frames.push({ dictionary, start: where, items: 0, names: 0, first: undefined });
    return where + (dictionary ? 2 : 1);
  };
  let walk = open(at);
  for (;;) {
    walk = skipSpaces(data, walk);
    if (walk >= data.length) throw new Doubt();
    const top = frames[frames.length - 1]!;
    const keyWanted = top.dictionary && top.items % 2 === 0;
    let done: InlineValue;
    if (!top.dictionary && data[walk] === 0x5d) {
      frames.pop();
      walk += 1;
      done = { kind: 'array', start: top.start, end: walk, items: top.items, names: top.names, first: top.first, truth: false };
    } else if (top.dictionary && data[walk] === 0x3e) {
      if (data[walk + 1] !== 0x3e || keyWanted === false) throw new Doubt();
      frames.pop();
      walk += 2;
      done = { kind: 'dictionary', start: top.start, end: walk, items: top.items, names: top.names, first: top.first, truth: false };
    } else if (opens(walk)) {
      if (keyWanted) throw new Doubt();
      walk = open(walk);
      continue;
    } else {
      done = inlineScalar(data, walk);
      if (keyWanted && done.kind !== 'name') throw new Doubt();
      walk = done.end;
    }
    const parent = frames[frames.length - 1];
    if (!parent) return done;
    if (done.kind === 'name') {
      if (parent.names === 0) parent.first = done.first;
      parent.names++;
    }
    parent.items++;
  }
}

/** Where PDF.js's three-state scan, run from `start`, stands just before `end`: 0, 1 or 2; -1 if it made a candidate before. */
function scanState(data: Uint8Array, start: number, end: number): number {
  let state = 0;
  for (let at = start; at < end; at++) {
    const byte = data[at]!;
    if (state === 0) state = byte === 0x45 ? 1 : 0;
    else if (state === 1) state = byte === 0x49 ? 2 : 0;
    else {
      if (isAfterEnd(byte)) return -1;
      state = 0;
    }
  }
  return state;
}

/**
 * PDF.js's look-ahead after an inline picture with no filter, from `from` (the
 * byte after the space, LF or CR that follows EI): the next 15 bytes printable
 * ASCII, LF or CR; then the first operator within 75 bytes, after numbers and
 * names only, with exactly its operand count (at most, for sc, SC, scn, SCN); or
 * only space, LF and CR to the end of a stream read alone or last.
 */
function lookAhead(data: Uint8Array, from: number, place: Place): void {
  const n = data.length;
  if (place === 'not-last' && from + 15 > n) throw new Doubt();
  for (let at = from; at < Math.min(n, from + 15); at++) {
    const byte = data[at]!;
    if (byte !== 0x0a && byte !== 0x0d && (byte < 0x20 || byte > 0x7e)) throw new Doubt();
  }
  if (from >= n) return;
  let onlySpaces = true;
  for (let at = from; at < n && onlySpaces; at++) if (!isAfterEnd(data[at]!)) onlySpaces = false;
  if (onlySpaces) {
    if (place === 'not-last') throw new Doubt();
    return;
  }
  const lookLimit = from + 75;
  let count = 0;
  let at = from;
  for (;;) {
    at = skipSpaces(data, at);
    if (at >= n || at >= lookLimit) throw new Doubt();
    const byte = data[at]!;
    let end: number;
    if (byte === 0x2f) {
      end = nameEnd(data, at);
      if (end < 0) throw new Doubt();
      count++;
    } else if (byteClass[byte] === REGULAR) {
      end = regularEnd(data, at);
      if (isNumber(data, at, end)) count++;
      else {
        const index = end - at <= 3 ? operatorByCode.get(packed(data, at, end)) : undefined;
        if (index === undefined) throw new Doubt();
        const name = operatorNames[index]!;
        const wanted = operandCounts[name]!;
        if (variableOperands.has(name) ? count > wanted : count !== wanted) throw new Doubt();
        if (end > lookLimit) throw new Doubt();
        return;
      }
    } else throw new Doubt();
    at = end;
  }
}

/**
 * Steps over an inline picture whose `BI` ends at `at`; gives the position
 * just after its `EI`. Doubt unless every reader finds the same end.
 */
function inlinePicture(data: Uint8Array, at: number, place: Place): number {
  const n = data.length;
  const seen = new Set<string>();
  const values: Record<string, InlineValue> = {};
  let keys = 0;
  let idEnd: number;
  for (;;) {
    at = skipSpaces(data, at);
    if (at >= n) throw new Doubt();
    if (data[at] === 0x49 && data[at + 1] === 0x44 && (at + 2 >= n || byteClass[data[at + 2]!] !== REGULAR)) {
      idEnd = at + 2;
      break;
    }
    if (data[at] !== 0x2f) throw new Doubt();
    const keyEnd = nameEnd(data, at);
    if (keyEnd < 0) throw new Doubt();
    const key = nameValue(data, { kind: 'name', start: at, end: keyEnd });
    if (key === undefined || ++keys > maxInlineKeys) throw new Doubt();
    const canonical = inlineKeys[key] ?? key;
    if (seen.has(canonical)) throw new Doubt();
    seen.add(canonical);
    at = skipSpaces(data, keyEnd);
    if (at >= n) throw new Doubt();
    if (data[at] === 0x49 && data[at + 1] === 0x44 && (at + 2 >= n || byteClass[data[at + 2]!] !== REGULAR)) throw new Doubt();
    const value = inlineValue(data, at);
    values[canonical] = value;
    at = value.end;
  }
  const number = (key: string): number | undefined => {
    const value = values[key];
    if (!value) return undefined;
    if (value.kind !== 'number') throw new Doubt();
    const parsed = wholeNumber(data, value.start, value.end);
    if (parsed < 0) throw new Doubt();
    return parsed;
  };
  const width = number('W');
  const height = number('H');
  let bits = number('BPC');
  const length = number('L');
  if (width === undefined || height === undefined || width < 1 || height < 1) throw new Doubt();
  const mask = values.IM;
  if (mask && mask.kind !== 'boolean') throw new Doubt();
  let colours: number;
  if (mask?.truth) {
    if (values.CS) throw new Doubt();
    if (bits !== undefined && bits !== 1) throw new Doubt();
    bits = 1;
    colours = 1;
  } else {
    const space = values.CS;
    if (!space || bits === undefined || space.kind !== 'name') throw new Doubt();
    const name = nameValue(data, space.first!);
    const found = name === undefined ? undefined : inlineColours[name];
    if (found === undefined) throw new Doubt();
    colours = found;
  }
  if (![1, 2, 4, 8, 16].includes(bits)) throw new Doubt();
  let filter: 'none' | 'hex' | 'a85' = 'none';
  const given = values.F;
  if (given) {
    // A name, a one-name array, or an empty array (no filter).
    const named = given.kind === 'name' || (given.kind === 'array' && given.items === 1 && given.names === 1);
    const name = named ? nameValue(data, given.first!) : undefined;
    if (given.kind === 'array' && given.items === 0) filter = 'none';
    else if (name !== undefined && inlineFilters[name]) filter = inlineFilters[name]!;
    else throw new Doubt();
  }
  // ID, then exactly one whitespace byte, not CR followed by LF.
  if (idEnd >= n || byteClass[data[idEnd]!] !== WS) throw new Doubt();
  if (data[idEnd] === 0x0d && data[idEnd + 1] === 0x0a) throw new Doubt();
  const start = idEnd + 1;
  let dataEnd: number;
  if (filter === 'none') {
    const left = n - start;
    const perRowBits = width * bits;
    if (perRowBits > Number.MAX_SAFE_INTEGER) throw new Doubt();
    const allBits = perRowBits * colours;
    if (allBits > Number.MAX_SAFE_INTEGER) throw new Doubt();
    const rowBytes = Math.ceil(allBits / 8);
    if (rowBytes > left || height > Math.floor(left / rowBytes)) throw new Doubt();
    dataEnd = start + rowBytes * height;
  } else if (filter === 'hex') {
    let walk = start;
    while (walk < n && data[walk] !== 0x3e) {
      if (!isHexDigit(data[walk]) && byteClass[data[walk]!] !== WS) throw new Doubt();
      walk++;
    }
    if (walk >= n) throw new Doubt();
    dataEnd = walk + 1;
  } else {
    const tilde = data.indexOf(0x7e, start);
    if (tilde < 0 || data[tilde + 1] !== 0x3e) throw new Doubt();
    dataEnd = tilde + 2;
  }
  if (length !== undefined && length !== dataEnd - start) throw new Doubt();
  const ei = skipSpaces(data, dataEnd);
  if (data[ei] !== 0x45 || data[ei + 1] !== 0x49) throw new Doubt();
  const after = ei + 2;
  if (after < n && !isAfterEnd(data[after]!)) throw new Doubt();
  // No earlier EI followed by whitespace (NUL included), a delimiter or the end.
  for (let walk = start; walk + 1 < ei; walk++) {
    if (data[walk] !== 0x45 || data[walk + 1] !== 0x49) continue;
    const next = data[walk + 2];
    if (next === undefined || isAnySpace(next) || byteClass[next] === DELIM) throw new Doubt();
  }
  if (filter === 'none') {
    // PDF.js's scan from the first data byte must reach this EI as its first candidate.
    if (scanState(data, start, ei) !== 0) throw new Doubt();
    if (after >= n) {
      if (place === 'not-last') throw new Doubt();
    } else lookAhead(data, after + 1, place);
  } else if (after >= n && place === 'not-last') throw new Doubt();
  return after;
}

// ---------------------------------------------------------------------------
// Pieces of an edit

/** A buffer reused for checking pieces within one read. */
type Scratch = { bytes: Uint8Array; checked: Set<string> };

/** Checks a piece: empty only where removal is allowed; otherwise whole tokens between spaces. */
function checkPiece(piece: string, mayBeEmpty: boolean, scratch: Scratch): void {
  if (piece === '') {
    if (mayBeEmpty) return;
    throw new Error(pieceSentence);
  }
  if (scratch.checked.has(piece)) return;
  if (piece.charCodeAt(0) !== 0x20 || piece.charCodeAt(piece.length - 1) !== 0x20) throw new Error(pieceSentence);
  // One buffer for every piece of a read, grown to the longest, so checking makes no garbage per edit.
  if (scratch.bytes.length < piece.length) scratch.bytes = new Uint8Array(Math.max(piece.length, 2 * scratch.bytes.length));
  const bytes = scratch.bytes.subarray(0, piece.length);
  for (let index = 0; index < piece.length; index++) {
    const code = piece.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) throw new Error(pieceSentence);
    bytes[index] = code;
  }
  let at = 0;
  while (at < bytes.length) {
    const byte = bytes[at]!;
    if (byte === 0x20) {
      at++;
      continue;
    }
    let end: number;
    if (byte === 0x2f) {
      end = nameEnd(bytes, at);
      if (end < 0) throw new Error(pieceSentence);
    } else if (byteClass[byte] === REGULAR) {
      end = regularEnd(bytes, at);
      if (!isNumber(bytes, at, end) && !matches(bytes, at, end, 'true') && !matches(bytes, at, end, 'false') && !matches(bytes, at, end, 'null')) {
        const index = end - at <= 3 ? operatorByCode.get(packed(bytes, at, end)) : undefined;
        if (index === undefined || index === opBI || index === opID || index === opEI) throw new Error(pieceSentence);
      }
    } else throw new Error(pieceSentence);
    if (end < bytes.length && bytes[end] !== 0x20 && bytes[end] !== 0x2f) throw new Error(pieceSentence);
    at = end;
  }
  // Pieces already checked in this read are not checked again; a few dozen are kept.
  if (scratch.checked.size >= 64) scratch.checked.clear();
  scratch.checked.add(piece);
}

/** Where the edited copy goes: counted in pass 1, written in pass 2. */
class Writer {
  length = 0;
  copied = 0;
  hash = 0x811c9dc5;
  constructor(
    private readonly data: Uint8Array,
    private readonly buffer: Uint8Array | undefined,
  ) {}

  private mix(value: number): void {
    this.hash = Math.imul(this.hash ^ value, 0x01000193) >>> 0;
  }

  /** In pass 1, the edited length past `maxEditedBytes` is doubt at once, so nothing more is worked out. */
  private grow(count: number): void {
    this.length += count;
    if (!this.buffer && this.length > maxEditedBytes) throw new Doubt();
  }

  copyTo(position: number): void {
    const count = position - this.copied;
    if (count <= 0) return;
    if (this.buffer) {
      if (this.length + count > this.buffer.length) throw new Error(mismatchSentence);
      if (count < 64) for (let index = 0; index < count; index++) this.buffer[this.length + index] = this.data[this.copied + index]!;
      else this.buffer.set(this.data.subarray(this.copied, position), this.length);
    }
    this.grow(count);
    this.copied = position;
  }

  skipTo(position: number): void {
    this.copied = position;
  }

  write(piece: string, marker: number): void {
    this.mix(marker);
    this.mix(piece.length);
    for (let index = 0; index < piece.length; index++) this.mix(piece.charCodeAt(index));
    if (this.buffer) {
      if (this.length + piece.length > this.buffer.length) throw new Error(mismatchSentence);
      for (let index = 0; index < piece.length; index++) this.buffer[this.length + index] = piece.charCodeAt(index);
    }
    this.grow(piece.length);
  }

  mark(position: number): void {
    this.mix(position >>> 0);
    this.mix(Math.floor(position / 2 ** 32));
  }
}

/** The last operands of an empty run, shared. */
const noOperands: readonly Operand[] = Object.freeze([]);

type PassResult = { edits: number; allEdits: number; length: number; hash: number };

/**
 * One pass over a stream. Doubt is thrown as Doubt; an editor's programming
 * error as an Error with a fixed sentence. With `buffer`, the edited copy is
 * written into it.
 */
function pass(data: Uint8Array, editor: Editor, place: Place, buffer: Uint8Array | undefined, scratch: Scratch): PassResult {
  const n = data.length;
  const writer = new Writer(data, buffer);
  // The operand run.
  let count = 0;
  let runStart = 0;
  let numbers = 0;
  let kinds = 0;
  const ringKind = new Uint8Array(4);
  const ringStart = new Float64Array(4);
  const ringEnd = new Float64Array(4);
  let lastEnd = 0;
  // Arrays and dictionaries: depth, and one bit per level, 1 for a dictionary.
  let depth = 0;
  let mask = 0;
  // In each open dictionary, one bit: 1 while a value is wanted after its key, 0 while a key is wanted.
  let valueMask = 0;
  let openedAt = 0;
  let bx = 0;
  let edits = 0;
  let allEdits = 0;
  let inComment = false;

  const operand = (kind: number, start: number, end: number) => {
    if (count === 0) runStart = start;
    const slot = count & 3;
    ringKind[slot] = kind;
    ringStart[slot] = start;
    ringEnd[slot] = end;
    count++;
    if (kind === 0) numbers++;
    kinds |= 1 << kind;
    lastEnd = end;
  };
  /**
   * A whole token, array or dictionary: an operand at the top level; inside a dictionary, a name key and then
   * exactly one value, in turn. PDF.js takes `>>` as the value of a key with none, and swallows what follows.
   */
  const item = (kind: number, start: number, end: number) => {
    if (depth === 0) {
      operand(kind, start, end);
      return;
    }
    const level = depth - 1;
    if (((mask >>> level) & 1) === 0) return;
    if (((valueMask >>> level) & 1) === 0 && kind !== 1) throw new Doubt();
    valueMask ^= 1 << level;
  };
  const resetRun = () => {
    count = 0;
    numbers = 0;
    kinds = 0;
  };
  const runNow = (): OperandRun => {
    if (count === 0) return { count: 0, start: 0, last: noOperands, numbers: 0, kinds: 0 };
    const last: Operand[] = [];
    for (let index = Math.max(0, count - 4); index < count; index++) {
      const slot = index & 3;
      last.push({ kind: kindList[ringKind[slot]!]!, start: ringStart[slot]!, end: ringEnd[slot]! });
    }
    return { count, start: runStart, last, numbers, kinds };
  };

  const applyEdit = (name: string, start: number, end: number) => {
    const run = runNow();
    const asked = editor.edit(name, run, data);
    if (asked === 'doubt') throw new Doubt();
    if (asked === null || asked === undefined) return;
    const { before, operands, operator, after } = asked;
    if (before === undefined && operands === undefined && operator === undefined && after === undefined) return;
    if (before !== undefined) checkPiece(before, false, scratch);
    if (operands !== undefined && count === 0) throw new Error(pieceSentence);
    // Removal: empty operands and an empty operator together (or an empty operator that has no operands); never one alone.
    if (operands === '' && operator !== '') throw new Error(pieceSentence);
    if (operator === '' && operands !== '' && count > 0) throw new Error(pieceSentence);
    if (operands !== undefined) checkPiece(operands, true, scratch);
    if (operator !== undefined) checkPiece(operator, true, scratch);
    if (after !== undefined) checkPiece(after, false, scratch);
    allEdits++;
    if (asked.counts !== false) edits++;
    writer.mark(start);
    const first = count > 0 ? runStart : start;
    writer.copyTo(first);
    if (before !== undefined) writer.write(before, 1);
    if (operands !== undefined) {
      writer.write(operands, 2);
      writer.skipTo(lastEnd);
    }
    writer.copyTo(start);
    if (operator !== undefined) {
      writer.write(operator, 3);
      writer.skipTo(end);
    } else writer.copyTo(end);
    if (after !== undefined) writer.write(after, 4);
  };

  let at = 0;
  while (at < n) {
    const byte = data[at]!;
    const kind = byteClass[byte];
    if (kind === WS) {
      at++;
      continue;
    }
    if (byte === 0x25) {
      while (at < n && data[at] !== 0x0a && data[at] !== 0x0d) at++;
      if (at >= n) inComment = true;
      continue;
    }
    if (byte === 0x28) {
      const end = stringEnd(data, at);
      if (end < 0) throw new Doubt();
      item(2, at, end);
      at = end;
      continue;
    }
    if (byte === 0x3c) {
      if (data[at + 1] === 0x3c) {
        if (depth >= maxNesting) throw new Doubt();
        if (depth === 0) openedAt = at;
        mask |= 1 << depth;
        valueMask &= ~(1 << depth);
        depth++;
        at += 2;
        continue;
      }
      const end = hexEnd(data, at);
      if (end < 0) throw new Doubt();
      item(3, at, end);
      at = end;
      continue;
    }
    if (byte === 0x3e) {
      // A dictionary closes only where a key is wanted: never right after a key with no value.
      if (data[at + 1] !== 0x3e || depth === 0 || ((mask >>> (depth - 1)) & 1) !== 1 || ((valueMask >>> (depth - 1)) & 1) !== 0) throw new Doubt();
      depth--;
      mask &= ~(1 << depth);
      at += 2;
      item(5, openedAt, at);
      continue;
    }
    if (byte === 0x5b) {
      if (depth >= maxNesting) throw new Doubt();
      if (depth === 0) openedAt = at;
      mask &= ~(1 << depth);
      depth++;
      at++;
      continue;
    }
    if (byte === 0x5d) {
      if (depth === 0 || ((mask >>> (depth - 1)) & 1) !== 0) throw new Doubt();
      depth--;
      at++;
      item(4, openedAt, at);
      continue;
    }
    if (byte === 0x2f) {
      const end = nameEnd(data, at);
      if (end < 0) throw new Doubt();
      item(1, at, end);
      at = end;
      continue;
    }
    if (kind !== REGULAR) throw new Doubt(); // braces, a stray ), control and non-ASCII bytes
    const end = regularEnd(data, at);
    const first = byte;
    if (first === 0x2b || first === 0x2d || first === 0x2e || (first >= 0x30 && first <= 0x39)) {
      if (!isNumber(data, at, end)) throw new Doubt();
      item(0, at, end);
      at = end;
      continue;
    }
    if (matches(data, at, end, 'true') || matches(data, at, end, 'false')) {
      item(6, at, end);
      at = end;
      continue;
    }
    if (matches(data, at, end, 'null')) {
      item(7, at, end);
      at = end;
      continue;
    }
    const index = end - at <= 3 ? operatorByCode.get(packed(data, at, end)) : undefined;
    if (index === undefined || depth > 0) throw new Doubt();
    if (index === opID || index === opEI) throw new Doubt();
    if (index === opBI) {
      if (count > 0) throw new Doubt();
      at = inlinePicture(data, end, place);
      resetRun();
      continue;
    }
    if (index === opBX) bx++;
    else if (index === opEX) {
      if (bx === 0) throw new Doubt();
      bx--;
    }
    const name = operatorNames[index]!;
    if (editor.operators.has(name)) applyEdit(name, at, end);
    resetRun();
    at = end;
  }
  if (depth !== 0 || count !== 0 || bx !== 0) throw new Doubt();
  if (place === 'not-last' && n > 0 && (inComment || byteClass[data[n - 1]!] !== WS)) throw new Doubt();
  writer.copyTo(n);
  return { edits, allEdits, length: writer.length, hash: writer.hash };
}

/**
 * Reads a decoded stream of drawing instructions with certainty and edits it
 * through `editor`, or leaves it: two streaming passes, the first checking the
 * stream and working out the edited length, the second writing the edited copy
 * into a buffer of exactly that length, counted with `spend` before it is
 * made. Every byte outside an edit is copied unchanged. At the first doubt the
 * result is `doubt` and nothing is made. A caller leaves every content stream
 * of a page when any of them is doubt, and reads a shared stream once, at its
 * strictest place (`not-last`, then `last`, then `alone`).
 */
export function editContent(data: Uint8Array, editor: Editor, place: Place, spend: Spend): Read {
  const scratch: Scratch = { bytes: new Uint8Array(64), checked: new Set() };
  let first: PassResult;
  try {
    first = pass(data, editor, place, undefined, scratch);
  } catch (error) {
    if (error instanceof Doubt) return { kind: 'doubt' };
    throw error;
  }
  if (first.allEdits === 0) return { kind: 'unchanged' };
  if (first.length > maxEditedBytes) return { kind: 'doubt' };
  spend(first.length);
  const buffer = new Uint8Array(first.length);
  let second: PassResult;
  try {
    second = pass(data, editor, place, buffer, scratch);
  } catch (error) {
    // The cause holds nothing from the stream: Doubt has no message, a RangeError only a length.
    if (error instanceof Doubt || error instanceof RangeError) throw new Error(mismatchSentence, { cause: error });
    throw error;
  }
  if (second.edits !== first.edits || second.allEdits !== first.allEdits || second.length !== first.length || second.hash !== first.hash) throw new Error(mismatchSentence);
  return { kind: 'edited', data: buffer, edits: first.edits, allEdits: first.allEdits };
}
