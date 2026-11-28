// Repair PDF: recovers what can still be read from one damaged PDF into a new
// file that passes qpdf's check (the owner's decisions of 28 Nov 2026: "pdf-lib
// + pre-pass", "Drop them"; add-repair-pdf, design decisions 2 to 8).
//
// Two routes to a plain copy (decrypted, no object streams):
// - a file qpdf reads, with warnings, junk around it or no `%%EOF`, is written
//   again by qpdf; a file qpdf reads with no warning, starting with `%PDF-` and
//   ending with `%%EOF`, gives no file ("nothing to repair");
// - any other is rewritten by our linear pre-pass (rebuild.ts) and read object
//   by object by pdf-lib's reader, with the visitor's password if any, under
//   run-time guards on pdf-lib's own code (decision 4), then saved by pdf-lib
//   and written by qpdf. Objects pdf-lib could not make sense of are left out.
// Then a sweep on the plain copy (decision 7): parts of pages that point to
// nothing are removed, a damaged Flate stream keeps what still unpacks, and
// other damaged streams that our own capped decoders read are emptied. Raw data
// only: nothing decoded is ever asked for on qpdf's standard output. qpdf
// writes the final file with object streams and checks it; a file that would
// still fail the check is not given (`RepairFailed`, the `too-damaged` kind).
//
// Bounds: pdf-lib's reads and copies share one work budget, its decoders a byte
// budget, its cross-reference stream entries are never read, its object-stream
// offsets are checked, its console is silenced and its recursive page walks are
// never called (pages are counted by our own walk). The qpdf instances and the
// bytes copied into them are capped by bounds that grow with the file; past a
// bound, `OutputLimit`. The password goes only into `--password=` and pdf-lib's
// `password` option. Errors are fixed sentences; nothing of the file, its name
// or its password goes into one, and no console line is written.

import type * as PdfLib from '@cantoo/pdf-lib';
import { decodeContent, decodesContent, maxContentBytes, PageTooLarge } from '../content';
import { certificateEncrypted, readPdf } from '../inspect';
import { freshQpdf, passwordFrom } from '../plain';
import { cappedWrite, finished, oneFileLimit, OutputLimit, rewrite, type Qpdf } from '../qpdf';
import { callWithArgumentFile, entryText, isDict, isRef, opening, passwordArgsFor, rawBatches, readDictionaries, readRawStreams, type Dict, type ObjectEntry } from '../qpdf-json';
import { rebuild } from '../rebuild';
import type { Engine, EngineModule, EngineTools, InspectOutcome, Inspector } from '../types';
import { inflateReadable, isZlib, type Fflate } from '../zlib';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['qpdf', 'pdflib'], job: ['qpdf', 'pdflib', 'fflate'] };

type Options = { passwords?: unknown };

/** A library from the tools the worker or a test gives. A private copy, as grayscale-pdf.ts keeps its own. */
async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the engine.`);
  return (await make()) as T;
}

/** The file could not be repaired into one that passes qpdf's check. Known to the worker by its name (`too-damaged`). */
export class RepairFailed extends Error {
  override name = 'RepairFailed';
  constructor() {
    super('The file is too damaged to repair.');
  }
}

// ---------------------------------------------------------------------------
// The limits (decisions 4, 5 and 7; measured in task 3.3).

export type Limits = {
  /** The work budget's multiple: pdf-lib's reads, and its copies, each at most `k × (input + decoded object-stream bytes)`. */
  k: number;
  /** What one pdf-lib decoder stage may grow to. */
  streamDecode: number;
  /**
   * What every pdf-lib decoder stage of one call may allocate together. Each stage's buffer doubles as it grows, so a
   * stream allocates up to twice its decoded size: 32 MiB lets through about 16 MiB of decoded object streams a call,
   * which for the densest content (`0 `, about 33 bytes of memory a byte) peaks near 0.5 GB (task 3.3).
   */
  callDecode: number;
  /** The bytes copied into qpdf instances over a job: at most `c × input + copyBase`. */
  c: number;
  copyBase: number;
  /** Stream ids one qpdf reads raw at once. */
  batchIds: number;
  /** What the sweep's own decoders may make over the whole job: `min(sweepCeiling, sweepBase + sweepMultiple × plain copy)`. */
  sweepBase: number;
  sweepMultiple: number;
  sweepCeiling: number;
  /** A page's drawing, decoded, past which the job stops (`PageTooLarge`). */
  pageDecode: number;
};

export const limits: Limits = {
  k: 8,
  streamDecode: 64 * 1024 * 1024,
  callDecode: 32 * 1024 * 1024,
  c: 100,
  copyBase: 512 * 1024 * 1024,
  batchIds: 2000,
  sweepBase: 512 * 1024 * 1024,
  sweepMultiple: 200,
  sweepCeiling: 2 * 1024 ** 3,
  pageDecode: maxContentBytes,
};

/** The most qpdf instances a job makes: a backstop, as the copy bound is always reached first. */
export const instanceBound = (streams: number, ids: number) => 8 + Math.ceil(streams / ids);

// ---------------------------------------------------------------------------
// The guards around pdf-lib (decision 4).

/** Why a guard stopped a pdf-lib call: its work budget, its decoders' budget, or a stream inside an object stream. */
type Stop = 'work' | 'decode' | 'stream-in-object-stream';

/** One pdf-lib call's budgets and record. */
type Token = {
  input: number;
  decodedObjectStreams: number;
  limit: number;
  reads: number;
  copied: number;
  decoded: number;
  stopped: Stop | null;
  refusedObjectStreams: number;
  /** Objects pdf-lib could not parse and skipped by the pre-pass's record. */
  skipped: number;
  k: number;
  streamDecode: number;
  callDecode: number;
  /** The pre-pass's record of where each object ends (rebuild.ts), for pdf-lib's invalid-object fallback. */
  ends: ReadonlyMap<number, number> | undefined;
};

/** Thrown inside pdf-lib once a guard has stopped the call; every later read or copy throws it again. */
class Stopped extends Error {
  constructor() {
    super('A guard stopped the reader.');
  }
}

let current: Token | null = null;
let chain: Promise<unknown> = Promise.resolve();

const stop = (token: Token, why: Stop): never => {
  if (!token.stopped) token.stopped = why;
  throw new Stopped();
};

/** What the guards found in a pdf-lib call, for tests and measurements: reads and copies against the work budget. */
export type GuardRecord = Readonly<Pick<Token, 'input' | 'decodedObjectStreams' | 'reads' | 'copied' | 'decoded' | 'stopped' | 'refusedObjectStreams' | 'skipped'>>;

/** The hooks a guard needs on pdf-lib's classes; a test fails when one moves. */
export type Hooks = {
  parser: Record<string, unknown>;
  byteStream: Record<string, unknown>;
  decodeStream: Record<string, unknown>;
  objectStreamParser: Record<string, unknown>;
  xrefStreamParser: Record<string, unknown>;
};

/**
 * The prototypes and classes the guards wrap, reached through pdf-lib's exported classes: `ByteStream` (not exported)
 * through a parser's `bytes`, `DecodeStream` through a decoder `decodePDFRawStream` makes.
 */
export function pdflibHooks(lib: typeof PdfLib): Hooks {
  const parser = lib.PDFParser.forBytesWithOptions(new Uint8Array(1)) as unknown as { bytes: object };
  const byteStream = Object.getPrototypeOf(parser.bytes) as Record<string, unknown>;
  const context = lib.PDFContext.create();
  // An empty zlib stream: FlateStream reads its header as it is made.
  const raw = lib.PDFRawStream.of(context.obj({ Filter: 'FlateDecode' }), Uint8Array.of(0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01));
  let decodeStream = Object.getPrototypeOf(lib.decodePDFRawStream(raw)) as Record<string, unknown> | null;
  while (decodeStream && !Object.hasOwn(decodeStream, 'ensureBuffer')) decodeStream = Object.getPrototypeOf(decodeStream) as Record<string, unknown> | null;
  const objectStreamParser = lib.PDFObjectStreamParser.prototype as unknown as Record<string, unknown>;
  const xrefStreamParser = lib.PDFXRefStreamParser as unknown as Record<string, unknown>;
  const parserProto = lib.PDFParser.prototype as unknown as Record<string, unknown>;
  for (const [what, place, key] of [
    ['PDFParser.tryToParseInvalidIndirectObject', parserProto, 'tryToParseInvalidIndirectObject'],
    ['ByteStream.next', byteStream, 'next'],
    ['ByteStream.slice', byteStream, 'slice'],
    ['DecodeStream.ensureBuffer', decodeStream, 'ensureBuffer'],
    ['PDFObjectStreamParser.parseOffsetsAndObjectNumbers', objectStreamParser, 'parseOffsetsAndObjectNumbers'],
    ['PDFObjectStreamParser.parseDict', objectStreamParser, 'parseDict'],
    ['PDFObjectStreamParser.matchKeyword', objectStreamParser, 'matchKeyword'],
    ['PDFXRefStreamParser.forStream', xrefStreamParser, 'forStream'],
  ] as const) {
    if (!place || typeof place[key] !== 'function') throw new Error(`pdf-lib's ${what} was not found, so the reader cannot be guarded.`);
  }
  return { parser: parserProto, byteStream, decodeStream: decodeStream!, objectStreamParser, xrefStreamParser };
}

const guarded = new WeakSet<object>();
const streamWord = [0x73, 0x74, 0x72, 0x65, 0x61, 0x6d];

/**
 * Wraps pdf-lib's hooks once per library (once per worker), so every repair call to pdf-lib runs under its own token
 * (`withGuards`). The wraps do nothing outside a token, so no other step sees them.
 */
export function guardPdflib(lib: typeof PdfLib): void {
  if (guarded.has(lib)) return;
  const hooks = pdflibHooks(lib);
  type Fn = (this: unknown, ...args: unknown[]) => unknown;

  // One work budget on every byte pdf-lib's parser reads (`next`) or copies (`slice`).
  const next = hooks.byteStream.next as Fn;
  hooks.byteStream.next = function (this: unknown) {
    const token = current;
    if (token) {
      if (token.stopped) throw new Stopped();
      if (++token.reads > token.limit) stop(token, 'work');
    }
    return next.call(this);
  };
  const slice = hooks.byteStream.slice as Fn;
  hooks.byteStream.slice = function (this: unknown, start: unknown, end: unknown) {
    const token = current;
    if (token) {
      if (token.stopped) throw new Stopped();
      const size = typeof start === 'number' && typeof end === 'number' && end > start ? end - start : 0;
      token.copied += size;
      if (token.copied > token.limit) stop(token, 'work');
    }
    return slice.call(this, start, end);
  };

  // Decoders: each growth of a stage's buffer counted against the stage's cap and the call's budget.
  const ensureBuffer = hooks.decodeStream.ensureBuffer as Fn;
  hooks.decodeStream.ensureBuffer = function (this: unknown, requested: unknown) {
    const token = current;
    const stage = this as { buffer: Uint8Array; minBufferLength: number };
    if (token && typeof requested === 'number' && requested > stage.buffer.byteLength) {
      if (token.stopped) throw new Stopped();
      let size = stage.minBufferLength;
      while (size < requested) size *= 2;
      if (size > token.streamDecode) stop(token, 'decode');
      token.decoded += size;
      if (token.decoded > token.callDecode) stop(token, 'decode');
    }
    return ensureBuffer.call(this, requested);
  };

  // Object streams: /N at most a quarter of the decoded length, offsets increasing and inside the data; otherwise that
  // object stream gives no objects. Its decoded length raises the work budget.
  const offsets = hooks.objectStreamParser.parseOffsetsAndObjectNumbers as Fn;
  hooks.objectStreamParser.parseOffsetsAndObjectNumbers = function (this: unknown) {
    const token = current;
    if (!token) return offsets.call(this);
    const parser = this as { bytes: { length: number }; objectCount: unknown; firstOffset: unknown };
    const length = parser.bytes.length;
    const count = parser.objectCount;
    const first = parser.firstOffset;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > length / 4 || typeof first !== 'number' || !Number.isSafeInteger(first) || first < 0) {
      token.refusedObjectStreams++;
      return [];
    }
    const found = offsets.call(this) as { objectNumber: number; offset: number }[];
    let previous = -1;
    for (const { objectNumber, offset } of found) {
      if (!Number.isSafeInteger(objectNumber) || objectNumber < 1 || !Number.isSafeInteger(offset) || offset <= previous || first + offset >= length) {
        token.refusedObjectStreams++;
        return [];
      }
      previous = offset;
    }
    token.decodedObjectStreams += length;
    token.limit = token.k * (token.input + token.decodedObjectStreams);
    return found;
  };
  // A stream inside an object stream, which the format forbids, stops the call: its copy could reach far past the entry.
  const objectStreamProto = hooks.objectStreamParser as Record<string, unknown> & { parseDictOrStream?: Fn };
  const inherited = objectStreamProto.parseDictOrStream as Fn;
  objectStreamProto.parseDictOrStream = function (this: unknown, ref: unknown) {
    const token = current;
    if (!token) return inherited.call(this, ref);
    const parser = this as { parseDict(ref: unknown): unknown; skipWhitespaceAndComments(): void; matchKeyword(word: number[]): boolean };
    const dict = parser.parseDict(ref);
    parser.skipWhitespaceAndComments();
    if (parser.matchKeyword(streamWord)) stop(token, 'stream-in-object-stream');
    return dict;
  };

  // An object pdf-lib cannot parse: it would scan for the next raw `endobj`, even inside a string or a stream's data,
  // and walk what follows byte by byte. It skips to where the pre-pass ended that object instead.
  const invalid = hooks.parser.tryToParseInvalidIndirectObject as Fn;
  hooks.parser.tryToParseInvalidIndirectObject = function (this: unknown) {
    const token = current;
    const bytes = (this as { bytes: { offset(): number; moveTo(offset: number): void } }).bytes;
    const end = token?.ends?.get(bytes.offset());
    if (token === null || end === undefined) return invalid.call(this);
    if (token.stopped) throw new Stopped();
    token.skipped++;
    bytes.moveTo(end);
    return undefined;
  };

  // Cross-reference streams: only /Root, /Info, /Encrypt and /ID are taken; their entries are never decoded or read.
  const forStream = hooks.xrefStreamParser.forStream as Fn;
  hooks.xrefStreamParser.forStream = (raw: unknown) => {
    if (!current) return forStream.call(lib.PDFXRefStreamParser, raw);
    const { dict } = raw as PdfLib.PDFRawStream;
    return {
      parseIntoContext() {
        const context = dict.context;
        const previous = context.trailerInfo;
        context.trailerInfo = {
          ...previous,
          Root: dict.get(lib.PDFName.of('Root')) ?? previous.Root,
          Encrypt: dict.get(lib.PDFName.of('Encrypt')) ?? previous.Encrypt,
          Info: dict.get(lib.PDFName.of('Info')) ?? previous.Info,
          ID: dict.get(lib.PDFName.of('ID')) ?? previous.ID,
        };
        return [];
      },
    };
  };
  guarded.add(lib);
}

/** Console methods, replaced by no-ops for the length of each guarded call. */
function silence(): () => void {
  const saved = new Map<string, unknown>();
  const target = console as unknown as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (typeof target[key] !== 'function') continue;
    saved.set(key, target[key]);
    target[key] = () => {};
  }
  return () => {
    for (const [key, value] of saved) target[key] = value;
  };
}

/** A token's budgets for a call on `input` bytes, with the pre-pass's record of where objects end. */
function tokenFor(input: number, given: Limits, ends?: ReadonlyMap<number, number>): Token {
  return {
    ends,
    skipped: 0,
    input,
    decodedObjectStreams: 0,
    limit: given.k * input,
    reads: 0,
    copied: 0,
    decoded: 0,
    stopped: null,
    refusedObjectStreams: 0,
    k: given.k,
    streamDecode: given.streamDecode,
    callDecode: given.callDecode,
  };
}

/**
 * Runs one pdf-lib call under its own token. Calls are serialised through one chain, which continues whether a call
 * succeeded or threw, so two reads never share or reset a token; the token is cleared and the console restored in
 * `finally`. Gives the call's result and the token's record; a guard's stop is in the record even when pdf-lib
 * swallowed it.
 */
export function withGuards<T>(token: Token, call: () => Promise<T>): Promise<{ value: T | undefined; error: unknown; record: GuardRecord }> {
  const run = chain.then(async () => {
    current = token;
    const restore = silence();
    let value: T | undefined;
    let error: unknown;
    try {
      value = await call();
    } catch (thrown) {
      error = thrown;
    } finally {
      current = null;
      restore();
    }
    return { value, error, record: { ...token } };
  });
  chain = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------------------
// Reading with pdf-lib.

/** What reading with pdf-lib found: the document and its page count, or why it could not be read. */
type Read =
  | { kind: 'read'; doc: PdfLib.PDFDocument; pages: number; record: GuardRecord }
  | { kind: 'needs-password' | 'wrong-password' | 'unsupported' | 'damaged'; record?: GuardRecord }
  | { kind: 'stopped'; record: GuardRecord };

/** pdf-lib's own words for a password problem or an encryption it does not know, pinned by the tests. */
const pdflibSays = {
  needsPassword: 'NEEDS PASSWORD',
  wrongPassword: 'Password incorrect',
  unknownMethod: 'unknown encryption method',
  unsupportedAlgorithm: 'unsupported encryption algorithm',
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : '');

/**
 * Reads `bytes` (the pre-pass's output) with pdf-lib under the guards, with the password if any. With no password and
 * `/Encrypt` seen, the first parse is with an empty password, which opens a file with restrictions only.
 */
export async function readWithPdflib(
  lib: typeof PdfLib,
  bytes: Uint8Array,
  input: number,
  password: string | undefined,
  encrypt: boolean,
  given: Limits = limits,
  ends?: ReadonlyMap<number, number>,
): Promise<Read> {
  guardPdflib(lib);
  const load = async (tried: string | undefined) =>
    withGuards(tokenFor(input, given, ends), () =>
      lib.PDFDocument.load(bytes, { password: tried, throwOnInvalidObject: false, updateMetadata: false, parseSpeed: Number.POSITIVE_INFINITY, ignoreEncryption: false }),
    );
  let tried = password ?? (encrypt ? '' : undefined);
  let loaded = await load(tried);
  if (loaded.record.stopped) return { kind: 'stopped', record: loaded.record };
  // An encryption the pre-pass did not see: tried again with an empty password.
  if (loaded.error instanceof lib.EncryptedPDFError && tried === undefined) {
    tried = '';
    loaded = await load(tried);
    if (loaded.record.stopped) return { kind: 'stopped', record: loaded.record };
  }
  if (loaded.error !== undefined || !loaded.value) {
    const message = messageOf(loaded.error);
    if (message === pdflibSays.needsPassword) return { kind: password === undefined ? 'needs-password' : 'wrong-password', record: loaded.record };
    if (message === pdflibSays.wrongPassword) return { kind: 'wrong-password', record: loaded.record };
    if (message === pdflibSays.unknownMethod || message === pdflibSays.unsupportedAlgorithm) return { kind: 'unsupported', record: loaded.record };
    if (loaded.error instanceof lib.EncryptedPDFError) return { kind: 'needs-password', record: loaded.record };
    return { kind: 'damaged', record: loaded.record };
  }
  const doc = loaded.value;
  // Objects pdf-lib could not make sense of are left out.
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) if (object instanceof lib.PDFInvalidObject) doc.context.delete(ref);
  const pages = walkPages(lib, doc.context);
  return { kind: 'read', doc, pages, record: loaded.record };
}

/**
 * Counts the pages from the catalog's /Pages with an iterative walk and a visited set (decision 5): each /Kids entry
 * is followed once, a node already reached is dropped from the /Kids it was met in, and each page-tree node's /Count
 * is set to the pages found below it, so qpdf, writing the file, sees each page once and counts as this walk does.
 * The walk takes at most twice as many steps as there are objects. A leaf with /Type /Page, or with no /Kids, counts.
 * pdf-lib's own walks are recursive with no visited set, so they are never called.
 */
export function walkPages(lib: typeof PdfLib, context: PdfLib.PDFContext): number {
  const { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef } = lib;
  const catalog = context.lookup(context.trailerInfo.Root);
  if (!(catalog instanceof PDFDict)) return 0;
  const kidsName = PDFName.of('Kids');
  const typeName = PDFName.of('Type');
  const countName = PDFName.of('Count');
  const pageName = PDFName.of('Page');
  const pagesName = PDFName.of('Pages');
  const seen = new Set<string>();
  const seenDirect = new WeakSet<object>();
  const key = (ref: PdfLib.PDFRef) => `${ref.objectNumber} ${ref.generationNumber}`;
  let steps = 2 * (context.enumerateIndirectObjects().length + 1);
  const first = catalog.get(pagesName);
  if (first === undefined) return 0;
  if (first instanceof PDFRef) seen.add(key(first));
  /** A node being walked: its dictionary, and the pages found below it so far, set as its /Count when it is left. */
  type Frame = { node: PdfLib.PDFDict; pages: number; kids: unknown[]; next: number };
  const frames: Frame[] = [];
  let total = 0;
  /** Gives a value's pages, or opens a frame for a node with kids. */
  const enter = (value: unknown): number => {
    const node = value instanceof PDFRef ? context.lookup(value) : value;
    if (!(node instanceof PDFDict)) return 0;
    if (value === node) {
      if (seenDirect.has(node)) return 0;
      seenDirect.add(node);
    }
    const kidsValue = node.get(kidsName);
    const kids = kidsValue instanceof PDFRef ? context.lookup(kidsValue) : kidsValue;
    const type = node.get(typeName);
    if (type === pageName || !(kids instanceof PDFArray)) return type === pagesName ? 0 : 1;
    // Kids already reached are dropped here, and the rest walked, in order.
    const keep: unknown[] = [];
    for (let index = 0; index < kids.size(); index++) {
      const kid = kids.get(index);
      if (kid instanceof PDFRef) {
        const id = key(kid);
        if (seen.has(id)) continue;
        seen.add(id);
      } else if (kid instanceof PDFDict && seenDirect.has(kid)) continue;
      keep.push(kid);
    }
    if (keep.length !== kids.size()) {
      while (kids.size() > 0) kids.remove(kids.size() - 1);
      for (const kid of keep) kids.push(kid as PdfLib.PDFObject);
    }
    frames.push({ node, pages: 0, kids: keep, next: 0 });
    return 0;
  };
  total += enter(first);
  while (frames.length > 0 && steps-- > 0) {
    const frame = frames[frames.length - 1]!;
    if (frame.next < frame.kids.length) {
      const pages = enter(frame.kids[frame.next++]);
      if (frames[frames.length - 1] === frame) frame.pages += pages;
      continue;
    }
    frames.pop();
    const count = frame.node.get(countName);
    if (!(count instanceof PDFNumber) || count.asNumber() !== frame.pages) frame.node.set(countName, PDFNumber.of(frame.pages));
    const parent = frames[frames.length - 1];
    if (parent) parent.pages += frame.pages;
    else total += frame.pages;
  }
  return total;
}

/** The largest JSON of pages that is parsed; a larger one keeps qpdf's /Count. */
const maxPagesJson = 64 * 1024 * 1024;

/**
 * How many pages qpdf will write from this file: the length of its JSON `pages`, written to a capped file in qpdf's
 * memory, never to standard output. Undefined when qpdf cannot list them (such as a loop in the page tree), so the
 * file is read the repair way; qpdf's /Count when the JSON passes its cap.
 */
async function pagesQpdfWrites(tools: EngineTools, file: Uint8Array, password: string | undefined): Promise<number | undefined> {
  const qpdf = await freshQpdf(tools, file);
  qpdf.capFile('/pages.json', maxPagesJson);
  const { code } = qpdf.call([...passwordArgsFor(password), '--json=2', '--json-key=pages', '/in.pdf', '/pages.json']);
  if (qpdf.refused('/pages.json')) {
    const counted = qpdf.call([...passwordArgsFor(password), '--show-npages', '/in.pdf']);
    const pages = Number(counted.out.split('\n').find((line) => /^\d+$/.test(line.trim())));
    return finished(counted.code) && Number.isInteger(pages) ? pages : undefined;
  }
  if (!finished(code)) return undefined;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(qpdf.read('/pages.json')));
    return isDict(parsed) && Array.isArray(parsed.pages) ? parsed.pages.length : undefined;
  } catch {
    return undefined;
  }
}

/** The pre-pass's budget: its copy is at most the one-file limit of the input; past it, `OutputLimit`. */
function budgetFor(input: number): (bytes: number) => void {
  return (bytes) => {
    if (bytes > oneFileLimit(input)) throw new OutputLimit();
  };
}

// ---------------------------------------------------------------------------
// Reading before the job.

/**
 * qpdf first, as every tool reads a file; a file qpdf cannot read for any reason but a password is read the repair
 * way, and only its page count leaves this function: pdf-lib's document and the rewritten bytes are let go before it
 * returns. A guard's stop is `OutputLimit`, so the page says so in the shared words.
 */
export function makeInspect(given: Limits = limits): Inspector {
  return async (file, password, tools): Promise<InspectOutcome> => {
    const { outcome, printed } = await readPdf(file, password, tools);
    if (outcome.kind === 'ready') {
      // qpdf's page count is the page tree's /Count; the pages qpdf will write are counted from its JSON instead.
      const pages = await pagesQpdfWrites(tools, file, password);
      if (pages !== undefined) return pages > 0 ? { kind: 'ready', pages } : { kind: 'damaged' };
    } else if (outcome.kind !== 'damaged') return outcome;
    if (certificateEncrypted(printed)) return { kind: 'unsupported' };
    const lib = await need<typeof PdfLib>(tools, 'pdflib');
    const rebuilt = rebuild(file, budgetFor(file.length));
    const read = await readWithPdflib(lib, rebuilt.bytes, file.length, password, rebuilt.encrypt, given, rebuilt.ends);
    if (read.kind === 'stopped') throw new OutputLimit();
    if (read.kind === 'read') return read.pages > 0 ? { kind: 'ready', pages: read.pages } : { kind: 'damaged' };
    return { kind: read.kind };
  };
}

export const inspect: Inspector = makeInspect();

// ---------------------------------------------------------------------------
// The job.

/** Counts the qpdf instances a job makes and the bytes copied into them (decision 7, step 5); past a bound, `OutputLimit`. */
export class Meter {
  instances = 0;
  copied = 0;
  /** The instance bound: a backstop, raised once the batches are planned. */
  maxInstances = 8;
  constructor(readonly copyBound: number) {}
  /** One more instance holding `bytes`. */
  add(bytes: number): void {
    this.instances++;
    this.copied += bytes;
    if (this.copied > this.copyBound || this.instances > this.maxInstances) throw new OutputLimit();
  }
}

/** The qpdf route's plain copy could not be written; the pdf-lib route is tried instead. Never leaves the engine. */
class RouteFailed extends Error {
  constructor() {
    super('qpdf could not write the plain copy.');
  }
}

const header = [0x25, 0x50, 0x44, 0x46, 0x2d];
const startsWithHeader = (file: Uint8Array) => header.every((byte, index) => file[index] === byte);
/** Whether the file ends with `%%EOF`, with nothing after it but whitespace (at most 1,024 bytes of it). */
function endsWithEof(file: Uint8Array): boolean {
  const eof = [0x25, 0x25, 0x45, 0x4f, 0x46];
  let end = file.length;
  const least = Math.max(0, file.length - 1024);
  while (end > least && [0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(file[end - 1]!)) end--;
  return end >= eof.length && eof.every((byte, index) => file[end - eof.length + index] === byte);
}

/**
 * The lines `qpdf --check` prints for itself on a sound file: its own heading, the version, the encryption and its
 * details, the linearization, and its closing words. Any other line, even with exit 0 (such as "Pages tree includes
 * non-dictionary object; ignoring"), means qpdf found something to repair. What qpdf printed stays in the worker.
 */
const checkLines = [
  /^checking /,
  /^PDF Version: /,
  /^File is not encrypted$/,
  /^R = \d+$/,
  /^P = -?\d+$/,
  /^User password = /,
  /^Supplied password is (owner|user) password$/,
  /^(extract for accessibility|extract for any purpose|print low resolution|print high resolution|modify document assembly|modify forms|modify annotations|modify other|modify anything): (allowed|not allowed)$/,
  /^(stream|string|file) encryption method: /,
  /^File is not linearized$/,
  /^File is linearized$/,
  /^no linearization errors$/,
  /^No syntax or stream encoding errors found; the file may still contain$/,
  /^errors that qpdf cannot detect$/,
];
const onlyCheckLines = (printed: string) => printed.split('\n').every((line) => line === '' || checkLines.some((pattern) => pattern.test(line)));

/** The cap on a plain copy, from the visitor's file: decrypting and unpacking object streams can grow it. */
export const plainLimit = (input: number) => 8 * input + 16 * 1024 * 1024;

/** The sweep's decoding budget over the whole job. */
const sweepBudget = (plain: number, given: Limits) => Math.min(given.sweepCeiling, given.sweepBase + given.sweepMultiple * plain);

/** A filter value as a list of names, or undefined when it is not a name or an array of names. */
function filterNames(dict: Dict): string[] | undefined {
  const filter = dict['/Filter'];
  if (filter === undefined) return [];
  if (typeof filter === 'string') return [filter];
  if (Array.isArray(filter) && filter.every((name) => typeof name === 'string')) return filter as string[];
  return undefined;
}

const loneFlate = (names: readonly string[]) => names.length === 1 && (names[0] === '/FlateDecode' || names[0] === '/Fl');
const otherKeys = ['/DecodeParms', '/DP', '/F', '/FFilter', '/FDecodeParms'];

/** How the sweep judges a stream: by `inflateReadable`, by `decodeContent`, by its stated length (no filter), or not at all. */
function judgeOf(dict: Dict): 'flate' | 'content' | 'plain' | 'none' {
  const names = filterNames(dict);
  if (!names || otherKeys.some((key) => key in dict && dict[key] !== null)) return 'none';
  if (names.length === 0) return 'plain';
  if (loneFlate(names)) return 'flate';
  return decodesContent(dict, () => undefined) ? 'content' : 'none';
}

/** The page objects of the plain copy, in order, from the catalog's /Pages: an iterative walk, each node once. */
function pagesOf(objects: ReadonlyMap<string, ObjectEntry>, trailer: Dict | null): string[] {
  const value = (id: unknown): unknown => {
    if (!isRef(id)) return id;
    const entry = objects.get(id);
    return entry && 'value' in entry ? entry.value : undefined;
  };
  const catalog = value(trailer?.['/Root']);
  if (!isDict(catalog)) return [];
  const pages: string[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [catalog['/Pages']];
  let steps = objects.size + 1;
  while (stack.length > 0 && steps-- > 0) {
    const id = stack.pop();
    if (!isRef(id) || seen.has(id)) continue;
    seen.add(id);
    const node = value(id);
    if (!isDict(node)) continue;
    const kids = value(node['/Kids']);
    if (node['/Type'] === '/Page' || !Array.isArray(kids)) {
      if (node['/Type'] !== '/Pages') pages.push(id);
      continue;
    }
    for (let index = kids.length - 1; index >= 0; index--) stack.push(kids[index]);
  }
  return pages;
}

/**
 * The sweep (decision 7) on the plain copy, written as an update into a new plain copy, even when nothing changes:
 * missing drawing removed from pages, damaged streams kept as far as they unpack or emptied, a page whose drawing
 * decodes past the cap stopping the job.
 */
async function sweep(
  plain: Uint8Array,
  fresh: (bytes: Uint8Array) => Promise<Qpdf>,
  meter: Meter,
  Inflate: Fflate['Inflate'],
  given: Limits,
  onWriting: (percent: number) => void,
): Promise<Uint8Array> {
  const dicts = readDictionaries(await fresh(plain), []);
  const objects = dicts?.objects ?? new Map<string, ObjectEntry>();
  const update = new Map<string, unknown>();
  const isStream = (id: unknown) => isRef(id) && 'stream' in (objects.get(id) ?? {});

  // Missing drawing: a page's /Contents entries that are not streams are removed (none left: a blank page).
  const pageIds = pagesOf(objects, dicts?.trailer ?? null);
  const pageOfStream = new Map<string, number>();
  const pageStreams: string[][] = [];
  for (const [index, id] of pageIds.entries()) {
    const entry = objects.get(id);
    if (!entry || !('value' in entry) || !isDict(entry.value)) {
      pageStreams.push([]);
      continue;
    }
    const dict = entry.value;
    const contents = dict['/Contents'];
    let streams: string[] = [];
    if (contents === undefined) {
      // No drawing at all: a blank page.
    } else if (isStream(contents)) streams = [contents as string];
    else {
      const indirect = isRef(contents) ? objects.get(contents) : undefined;
      const list = Array.isArray(contents) ? contents : indirect && 'value' in indirect && Array.isArray(indirect.value) ? indirect.value : undefined;
      if (list) streams = list.filter(isStream) as string[];
      if (!list || streams.length !== list.length) {
        const changed: Dict = { ...dict };
        if (streams.length === 0) delete changed['/Contents'];
        else changed['/Contents'] = streams;
        update.set(id, { value: changed });
      }
    }
    pageStreams.push(streams);
    for (const stream of streams) if (!pageOfStream.has(stream)) pageOfStream.set(stream, index + 1);
  }

  // Damaged streams: raw data judged by our own capped decoders.
  const decoded = new Map<string, number>();
  const judged: { id: string; length: number | undefined }[] = [];
  for (const [id, entry] of objects) {
    if (!('stream' in entry)) continue;
    const dict = entry.stream.dict;
    const judge = judgeOf(dict);
    const length = typeof dict['/Length'] === 'number' && Number.isFinite(dict['/Length']) && dict['/Length'] >= 0 ? dict['/Length'] : undefined;
    if (judge === 'plain' && length !== undefined) decoded.set(id, length);
    if (judge === 'flate' || judge === 'content') judged.push({ id, length });
  }
  const batches = rawBatches(judged, undefined, given.batchIds);
  // The backstop follows the batches planned (rawBatches also splits by stated bytes), so the copy bound comes first.
  meter.maxInstances = instanceBound(batches.length * given.batchIds, given.batchIds);
  let spent = 0;
  const budget = sweepBudget(plain.length, given);
  const spend = (bytes: number) => {
    spent += bytes;
    if (spent > budget) throw new OutputLimit();
  };
  const tooLarge = (id: string) => {
    const page = pageOfStream.get(id);
    if (page !== undefined) throw new PageTooLarge(page);
  };
  const replacements = new Map<string, { dict: Dict; data: Uint8Array }>();
  const replace = (id: string, dict: Dict, data: Uint8Array) => {
    const kept: Dict = { ...dict };
    for (const key of ['/Filter', '/DecodeParms', '/Length', '/DL']) delete kept[key];
    replacements.set(id, { dict: kept, data });
  };
  for await (const batch of readRawStreams(() => fresh(plain), [], batches)) {
    for (const [id, raw] of batch) {
      batch.delete(id);
      const dict = (objects.get(id) as { stream: { dict: Dict } }).stream.dict;
      if (judgeOf(dict) === 'flate') {
        if (!isZlib(raw)) {
          replace(id, dict, new Uint8Array(0));
          continue;
        }
        const read = inflateReadable(raw.subarray(2), Inflate, given.pageDecode, spend);
        if (read.kind === 'too-large') tooLarge(id);
        else {
          decoded.set(id, read.data.length);
          if (read.kind === 'cut') replace(id, dict, read.data);
        }
      } else {
        const read = decodeContent(raw, dict, () => undefined, Inflate, spend);
        if (read.kind === 'too-large') tooLarge(id);
        else if (read.kind === 'decoded') decoded.set(id, read.data.length);
        else replace(id, dict, new Uint8Array(0));
      }
    }
  }
  // A page's drawing, decoded, past the cap.
  for (const [index, streams] of pageStreams.entries()) {
    let sum = 0;
    for (const stream of streams) sum += decoded.get(stream) ?? 0;
    if (sum > given.pageDecode) throw new PageTooLarge(index + 1);
  }

  // The update, always written.
  const qpdf = await fresh(plain);
  qpdf.mkdir('/upd');
  const entries: string[] = [];
  for (const [id, entry] of update) entries.push(entryText(id, entry));
  let index = 0;
  for (const [id, { dict, data }] of replacements) {
    const datafile = `/upd/${index++}`;
    qpdf.write(datafile, data);
    entries.push(entryText(id, { stream: { dict, datafile } }));
    replacements.delete(id);
  }
  qpdf.write('/update.json', new TextEncoder().encode(`${opening(dicts?.max ?? 0)}${entries.join(',')}}]}`));
  const written = cappedWrite(
    qpdf,
    oneFileLimit(plain.length),
    (capped) => callWithArgumentFile(capped, ['--progress', '/in.pdf', '--update-from-json=/update.json', '--object-streams=disable', '/out.pdf']),
    onWriting,
  );
  if (!finished(written.code)) throw new RepairFailed();
  return qpdf.read('/out.pdf');
}

/**
 * What qpdf makes of the file, on the qpdf given (holding it as /in.pdf, let go when this returns): `sound` when its
 * check finishes with exit 0 and only its own lines, and the file starts with `%PDF-` and ends with `%%EOF` (nothing
 * to repair); `yes` when qpdf reads it otherwise (its check finishes, or it counts its pages); `no` when it cannot.
 */
function qpdfReads(checker: Qpdf, file: Uint8Array, passwordArgs: readonly string[]): 'sound' | 'yes' | 'no' {
  const checked = checker.call([...passwordArgs, '--check', '/in.pdf']);
  if (checked.code === 0 && onlyCheckLines(checked.printed) && startsWithHeader(file) && endsWithEof(file)) return 'sound';
  if (finished(checked.code)) return 'yes';
  const counted = checker.call([...passwordArgs, '--show-npages', '/in.pdf']);
  const pages = Number(counted.out.split('\n').find((line) => /^\d+$/.test(line.trim())));
  return finished(counted.code) && Number.isInteger(pages) && pages > 0 ? 'yes' : 'no';
}

/**
 * The pdf-lib route up to pdf-lib's saved bytes: the pre-pass, pdf-lib's reader and writer under the guards (a guard's
 * stop is `OutputLimit`, even when pdf-lib swallowed it). Only the saved bytes leave this function, so the rewritten
 * input and pdf-lib's document are let go before qpdf writes them.
 */
async function savedByPdflib(tools: EngineTools, file: Uint8Array, password: string | undefined, given: Limits): Promise<Uint8Array> {
  const lib = await need<typeof PdfLib>(tools, 'pdflib');
  const rebuilt = rebuild(file, budgetFor(file.length));
  const read = await readWithPdflib(lib, rebuilt.bytes, file.length, password, rebuilt.encrypt, given, rebuilt.ends);
  if (read.kind === 'stopped') throw new OutputLimit();
  if (read.kind === 'needs-password' || read.kind === 'wrong-password') throw new Error('A password did not open the file.');
  if (read.kind !== 'read' || read.pages < 1) throw new RepairFailed();
  const doc = read.doc;
  const saved = await withGuards(tokenFor(file.length, given), () =>
    doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: Number.POSITIVE_INFINITY }),
  );
  if (saved.record.stopped) throw new OutputLimit();
  if (saved.error !== undefined || !saved.value) throw new RepairFailed();
  return saved.value;
}

/**
 * The engine, with the limits given; tests pass small ones. `route: 'pdflib'` (tests only) sends a file qpdf reads
 * through the pdf-lib route, to compare it with qpdf's own rewrite.
 */
export function makeRun(given: Limits = limits, { route }: { route?: 'pdflib' } = {}): Engine<Options> {
  return async (files, options, onProgress, tools) => {
    const file = files[0];
    if (!file || files.length !== 1) throw new Error('Repair PDF takes one file.');
    const password = passwordFrom(options);
    const passwordArgs = passwordArgsFor(password);
    onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    const meter = new Meter(given.c * file.length + given.copyBase);
    const fresh = async (bytes: Uint8Array) => {
      meter.add(bytes.length);
      return freshQpdf(tools, bytes);
    };
    const writing = (from: number, to: number) => (percent: number) => onProgress({ stage: 'writing', percent: from + ((to - from) * percent) / 100 });

    // The qpdf route: a file qpdf reads with no warning, starting with %PDF- and ending with %%EOF, has nothing to repair.
    const reads = route === undefined ? await qpdfReads(await fresh(file), file, passwordArgs) : 'no';
    if (reads === 'sound') return [];
    const readable = reads === 'yes';
    // The plain copy, held in an object so it can be let go once the sweep has written its update.
    const held: { plain?: Uint8Array } = {};
    if (readable) {
      try {
        meter.add(file.length);
        held.plain = await rewrite(tools, file, passwordArgs, ['--decrypt', '--object-streams=disable'], writing(0, 25), {
          failed: () => new RouteFailed(),
          limit: plainLimit(file.length),
        });
      } catch (error) {
        if (!(error instanceof RouteFailed)) throw error;
      }
    }

    // The pdf-lib route: the pre-pass, pdf-lib's reader and writer under the guards, then qpdf.
    if (!held.plain) {
      const bytes = await savedByPdflib(tools, file, password, given);
      meter.add(bytes.length);
      held.plain = await rewrite(tools, bytes, [], ['--object-streams=disable'], writing(0, 25), { failed: () => new RepairFailed(), limit: plainLimit(file.length) });
    }

    const { Inflate } = await need<Fflate>(tools, 'fflate');
    const swept = await sweep(held.plain, fresh, meter, Inflate, given, writing(25, 35));
    delete held.plain;

    // The final write, with object streams, and a fresh qpdf's check.
    meter.add(swept.length);
    const out = await rewrite(tools, swept, [], ['--object-streams=generate'], writing(35, 50), { failed: () => new RepairFailed(), limit: oneFileLimit(swept.length) });
    onProgress({ stage: 'writing', percent: 55 });
    const final = await fresh(out);
    if (!finished(final.call(['--check', '/in.pdf']).code)) throw new RepairFailed();
    onProgress({ stage: 'writing', percent: 95 });
    onProgress({ stage: 'writing', percent: 100 });
    return [out];
  };
}

export const run: Engine<Options> = makeRun();
