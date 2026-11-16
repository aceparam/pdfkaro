// Compress PDF: makes one PDF smaller, with our own recompression on qpdf, by
// the owner's decision of 13 Nov 2026 (no Ghostscript).
//
// First, pictures are made smaller where that saves space. Only pictures this
// file can safely redo are candidates (`canShrink`): 8-bit grey or RGB, a JPG
// (/DCTDecode) or stored without loss (/FlateDecode), with no key outside a
// short list, not a mask, and at most 50 million pixels. Everything else is
// left exactly as it was. A candidate's raw data is read in bounded batches,
// and decoded only within our own limits: a JPG's own frame must match its
// dictionary before the browser decodes it, and lossless data is inflated with
// a cap at exactly the size it should have.
//
// Then qpdf writes the whole file again without loss: object streams, every
// compressed stream compressed again at the highest level, uncompressed streams
// compressed, and resources nothing uses removed. A file opened with its
// password is written with the same password and restrictions. The file is
// written afresh, so earlier saved versions inside it are not kept and a
// digital signature stops being valid, as the page says.
//
// When the result is not at least 1% smaller, the engine gives no file, and
// the page says the file could not be made smaller.

import { inspectPdf } from '../inspect';
import { outlineDepthLimit } from '../outline';
import { inflateLimited, jpegForPdf, walkJpeg, type InflateClass } from '../picture';
import { freshQpdf, passwordFrom } from '../plain';
import { isDict, isRef, passwordArgsFor, rawBatches, readDictionaries, readRawStreams, writeUpdate, type Dict, type ObjectEntry, type StreamReplacement } from '../qpdf-json';
import { fittedSize, scaleDown, unpredict } from '../resample';
import type { CanvasMaker } from '../thumbnail';
import type { Engine, EngineTools, Inspector } from '../types';

type Options = { passwords?: unknown };

/** How sharp a picture may be, in pixels to the inch across the file's largest page. */
export const pixelsPerInch = 150;
/** The JPG quality pictures are saved at, as the canvas encoder takes it. */
export const jpegQuality = 0.75;
/** A JPG that is not too large is saved again only if that makes it at least this much smaller. */
export const jpegSaving = 0.1;
/** A result is given only if it is at most this share of the input. */
export const keepBelow = 0.99;
/** The most pixels a candidate picture may have. */
export const maxPixels = 50_000_000;

/** qpdf's options for writing the file again without loss. No --decrypt: a protected file keeps its password. */
export const losslessOptions = ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--remove-unreferenced-resources=yes'];

/** The only keys a candidate picture's dictionary may have. Anything else means it is left alone. */
const allowedKeys = new Set([
  '/Type',
  '/Subtype',
  '/Width',
  '/Height',
  '/ColorSpace',
  '/BitsPerComponent',
  '/Filter',
  '/DecodeParms',
  '/Length',
  '/Interpolate',
  '/Intent',
  '/Metadata',
  '/StructParent',
  '/ID',
  '/Name',
  '/OC',
  '/SMask',
]);

/** The keys a replaced picture does not keep from its old dictionary: they are written afresh. */
const rewrittenKeys = new Set(['/Width', '/Height', '/Filter', '/DecodeParms', '/Length']);

/** A picture that can be made smaller, as its dictionary describes it. */
export type Candidate = {
  kind: 'jpeg' | 'lossless';
  width: number;
  height: number;
  /** 1 for grey, 3 for RGB. */
  components: 1 | 3;
  /** Whether its colours are /DeviceGray, the one case whose colour space changes (to /DeviceRGB) when saved as a JPG. */
  deviceGray: boolean;
  /** Whether its lossless data has a PNG predictor, one byte in front of each row. */
  predictor: boolean;
};

/** Every object's dictionary, and the objects other pictures name as their /SMask or /Mask. */
export type PictureContext = { objects: ReadonlyMap<string, ObjectEntry>; masks: ReadonlySet<string> };

const streamDict = (entry: ObjectEntry | undefined): Dict | undefined => (entry && 'stream' in entry ? entry.stream.dict : undefined);
const isWhole = (value: unknown, least: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= least;

/** The objects named as another object's /SMask or /Mask, which are never scaled. */
export function pictureContext(objects: ReadonlyMap<string, ObjectEntry>): PictureContext {
  const masks = new Set<string>();
  for (const entry of objects.values()) {
    const dict = streamDict(entry);
    if (!dict) continue;
    for (const key of ['/SMask', '/Mask']) if (isRef(dict[key])) masks.add(dict[key]);
  }
  return { objects, masks };
}

/** A name, or a one-element array holding it, as a filter may be written. */
const single = (value: unknown): unknown => (Array.isArray(value) && value.length === 1 ? value[0] : value);
const absent = (value: unknown) => value === undefined || value === null || (Array.isArray(value) && value.length === 1 && value[0] === null);

/** The number of colours: 1 or 3 for /DeviceGray, /DeviceRGB, or an RGB ICC profile. Grey ICC pictures are left alone, so their tone does not change. */
function coloursOf(space: unknown, objects: ReadonlyMap<string, ObjectEntry>): { components: 1 | 3; deviceGray: boolean } | undefined {
  if (space === '/DeviceGray') return { components: 1, deviceGray: true };
  if (space === '/DeviceRGB') return { components: 3, deviceGray: false };
  if (Array.isArray(space) && space.length === 2 && space[0] === '/ICCBased' && isRef(space[1])) {
    const profile = streamDict(objects.get(space[1]));
    if (profile && profile['/N'] === 3) return { components: 3, deviceGray: false };
  }
  return undefined;
}

/**
 * Whether a picture can be made smaller, read from dictionaries only. A
 * candidate is an 8-bit grey or RGB picture, a JPG with no /DecodeParms or
 * stored with /FlateDecode with none or a matching PNG predictor, with no key
 * outside the list, not itself another picture's mask, whose own soft mask (if
 * any) has no /Matte, and of at most 50 million pixels. Anything else is null.
 */
export function canShrink(id: string, dict: Dict, all: PictureContext): Candidate | null {
  if (dict['/Subtype'] !== '/Image' || dict['/BitsPerComponent'] !== 8) return null;
  if (Object.keys(dict).some((key) => !allowedKeys.has(key))) return null;
  const width = dict['/Width'];
  const height = dict['/Height'];
  if (!isWhole(width, 1) || !isWhole(height, 1) || width * height > maxPixels) return null;
  const colours = coloursOf(dict['/ColorSpace'], all.objects);
  if (!colours) return null;
  if (all.masks.has(id)) return null;
  if ('/SMask' in dict) {
    const mask = isRef(dict['/SMask']) ? streamDict(all.objects.get(dict['/SMask'])) : undefined;
    // A /Matte ties the picture's size to its soft mask's.
    if (!mask || '/Matte' in mask) return null;
  }
  const filter = single(dict['/Filter']);
  const parms = dict['/DecodeParms'];
  if (filter === '/DCTDecode') {
    if (!absent(parms)) return null;
    return { kind: 'jpeg', width, height, ...colours, predictor: false };
  }
  if (filter === '/FlateDecode') {
    if (absent(parms)) return { kind: 'lossless', width, height, ...colours, predictor: false };
    const own = single(parms);
    if (!isDict(own)) return null;
    if (Object.keys(own).some((key) => !['/Predictor', '/Colors', '/BitsPerComponent', '/Columns'].includes(key))) return null;
    const predictor = own['/Predictor'];
    if (!isWhole(predictor, 10) || predictor > 15) return null;
    if ((own['/Colors'] ?? 1) !== colours.components || (own['/BitsPerComponent'] ?? 8) !== 8 || (own['/Columns'] ?? 1) !== width) return null;
    return { kind: 'lossless', width, height, ...colours, predictor: true };
  }
  return null;
}

/** A box of four finite numbers, as its width and height in points; undefined for anything else. */
function boxSize(box: unknown): { width: number; height: number } | undefined {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((value) => typeof value === 'number' && Number.isFinite(value))) return undefined;
  const [x1, y1, x2, y2] = box as number[];
  const width = Math.abs(x2! - x1!);
  const height = Math.abs(y2! - y1!);
  return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height) ? { width, height } : undefined;
}

/** A page's /CropBox, or else its /MediaBox, each looked for up the /Parent chain, with a depth limit and no object visited twice. */
function pageBox(page: Dict, objects: ReadonlyMap<string, ObjectEntry>): { width: number; height: number } | undefined {
  const find = (key: string) => {
    let node: Dict | undefined = page;
    const seen = new Set<string>();
    for (let depth = 0; node && depth <= outlineDepthLimit; depth++) {
      if (key in node) return node[key];
      const parent: unknown = node['/Parent'];
      if (!isRef(parent) || seen.has(parent)) return undefined;
      seen.add(parent);
      const entry = objects.get(parent);
      node = entry && 'value' in entry && isDict(entry.value) ? entry.value : undefined;
    }
    return undefined;
  };
  return boxSize(find('/CropBox')) ?? boxSize(find('/MediaBox'));
}

/**
 * The most pixels a picture's longer side needs: 150 to the inch across the
 * file's largest page, each page's box scaled by its /UserUnit. Undefined when
 * no page has a usable box, so the pictures step is skipped.
 */
export function pixelLimit(objects: ReadonlyMap<string, ObjectEntry>): number | undefined {
  let longest = 0;
  for (const entry of objects.values()) {
    if (!('value' in entry) || !isDict(entry.value) || entry.value['/Type'] !== '/Page') continue;
    const box = pageBox(entry.value, objects);
    if (!box) continue;
    const unit = entry.value['/UserUnit'];
    const scale = typeof unit === 'number' && Number.isFinite(unit) && unit > 0 ? unit : 1;
    const side = Math.max(box.width, box.height) * scale;
    if (Number.isFinite(side)) longest = Math.max(longest, side);
  }
  if (longest <= 0) return undefined;
  return Math.max(1, Math.ceil((longest / 72) * pixelsPerInch));
}

/** The new dictionary: every allowed key of the old one but those written afresh, then the new size and filter. */
export function newDictionary(old: Dict, size: { width: number; height: number }, filter: '/DCTDecode' | '/FlateDecode', colourSpace?: string): Dict {
  const dict: Dict = {};
  for (const [key, value] of Object.entries(old)) if (allowedKeys.has(key) && !rewrittenKeys.has(key)) dict[key] = value;
  dict['/Width'] = size.width;
  dict['/Height'] = size.height;
  dict['/Filter'] = filter;
  if (colourSpace) dict['/ColorSpace'] = colourSpace;
  return dict;
}

// ---------------------------------------------------------------------------
// The tools pictures need, from the worker or a test.

/** A decoded picture. `close` lets go of its pixels. */
type Decoded = { image: unknown; close(): void };
/** The browser's image decoder, at `width` by `height`, with colours left as they are. */
export type PictureDecoder = { decode(bytes: Uint8Array, width: number, height: number, options?: { colours?: 'none' }): Promise<Decoded> };
/** A canvas maker that can also encode its canvas as a JPG. */
export type JpegCanvasMaker = CanvasMaker & { jpeg(canvas: unknown, quality: number): Promise<Uint8Array> };
/** fflate's streaming deflater. */
export type DeflateClass = new (options: { level: 9 }, ondata: (chunk: Uint8Array, final: boolean) => void) => { push(chunk: Uint8Array, final?: boolean): void };
type Fflate = { Inflate: InflateClass; Deflate: DeflateClass };
type DrawingContext = { drawImage(image: unknown, x: number, y: number, width: number, height: number): void };

async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the engine.`);
  return (await make()) as T;
}

/** The Adler-32 checksum zlib puts after its data. */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let at = 0; at < data.length; ) {
    const end = Math.min(data.length, at + 5552);
    for (; at < end; at++) {
      a += data[at]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Data deflated at level 9 by fflate, framed as zlib data, which /FlateDecode reads. */
export function zlibDeflate(data: Uint8Array, Deflate: DeflateClass): Uint8Array {
  const parts: Uint8Array[] = [];
  const deflater = new Deflate({ level: 9 }, (chunk) => parts.push(chunk));
  const piece = 1024 * 1024;
  if (data.length === 0) deflater.push(data, true);
  for (let at = 0; at < data.length; at += piece) deflater.push(data.subarray(at, at + piece), at + piece >= data.length);
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(2 + size + 4);
  // CMF 0x78 (deflate, 32 KB window) and FLG 0xDA (best compression), which check as a multiple of 31.
  out[0] = 0x78;
  out[1] = 0xda;
  let at = 2;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  new DataView(out.buffer).setUint32(at, adler32(data));
  return out;
}

/** Whether data starts with a zlib header for deflate with no preset dictionary. */
const isZlib = (data: Uint8Array) => data.length >= 2 && (data[0]! & 0x0f) === 8 && (data[0]! >> 4) <= 7 && ((data[0]! << 8) | data[1]!) % 31 === 0 && (data[1]! & 0x20) === 0;

/**
 * A JPG picture made smaller, or undefined to leave it. Its own frame must
 * match the dictionary (one 8-bit frame, the same width, height and colours)
 * before it is decoded. It is rebuilt without camera details or a colour
 * profile, decoded at its new size, drawn, and saved at quality 75. It replaces
 * the old one when the old one was too large and the new one is smaller, or
 * when the new one is at least 10% smaller.
 */
export async function shrinkJpeg(
  raw: Uint8Array,
  dict: Dict,
  candidate: Candidate,
  limit: number,
  decoder: PictureDecoder,
  canvases: JpegCanvasMaker,
): Promise<StreamReplacement | undefined> {
  const walk = walkJpeg(raw);
  if (walk.kind !== 'ok') return undefined;
  const { precision, width, height, components } = walk.frame;
  if (precision !== 8 || width !== candidate.width || height !== candidate.height || components !== candidate.components) return undefined;
  const cleaned = jpegForPdf(raw);
  if (!cleaned) return undefined;
  const tooLarge = Math.max(width, height) > limit;
  const size = tooLarge ? fittedSize(width, height, limit) : { width, height };
  const decoded = await decoder.decode(cleaned.bytes, size.width, size.height, { colours: 'none' });
  let encoded: Uint8Array;
  try {
    const { canvas, context } = canvases.create(size.width, size.height);
    try {
      (context as DrawingContext).drawImage(decoded.image, 0, 0, size.width, size.height);
      encoded = await canvases.jpeg(canvas, jpegQuality);
    } finally {
      canvases.release(canvas);
    }
  } finally {
    decoded.close();
  }
  // What the encoder wrote, without any profile or details it added, checked before it goes in.
  const written = jpegForPdf(encoded);
  const frame = written ? walkJpeg(written.bytes) : undefined;
  if (!written || frame?.kind !== 'ok' || frame.frame.width !== size.width || frame.frame.height !== size.height) return undefined;
  const writtenComponents = frame.frame.components;
  if (writtenComponents !== 1 && writtenComponents !== 3) return undefined;
  if (candidate.components === 3 && writtenComponents !== 3) return undefined;
  // Too large: used only when smaller. Not too large: only when at least 10% smaller.
  if (written.bytes.length >= raw.length) return undefined;
  if (!tooLarge && written.bytes.length > raw.length * (1 - jpegSaving)) return undefined;
  // A grey picture comes back from the canvas as an RGB JPG; its pixels stay grey.
  const space = candidate.deviceGray && writtenComponents === 3 ? '/DeviceRGB' : undefined;
  return { dict: newDictionary(dict, size, '/DCTDecode', space), data: written.bytes };
}

/**
 * A picture stored without loss, made smaller, or undefined to leave it. Only
 * a picture too large for the page is redone: its data is inflated with a cap
 * at exactly the size it should have (with one predictor byte per row), any
 * predictor is undone, it is scaled down by area averaging, and stored without
 * loss again. It replaces the old one only when smaller.
 */
export function shrinkLossless(raw: Uint8Array, dict: Dict, candidate: Candidate, limit: number, fflate: Fflate): StreamReplacement | undefined {
  const { width, height, components, predictor } = candidate;
  if (Math.max(width, height) <= limit || !isZlib(raw)) return undefined;
  const expected = (width * components + (predictor ? 1 : 0)) * height;
  const inflated = inflateLimited(raw.subarray(2), fflate.Inflate, expected);
  if (!inflated || inflated.length !== expected) return undefined;
  const samples = predictor ? unpredict(inflated, width, height, components) : inflated;
  if (!samples) return undefined;
  const size = fittedSize(width, height, limit);
  const data = zlibDeflate(scaleDown(samples, width, height, components, size.width, size.height), fflate.Deflate);
  if (data.length >= raw.length) return undefined;
  return { dict: newDictionary(dict, size, '/FlateDecode'), data };
}

/** A stream's stated length: a number, or a reference to one. */
function statedLength(dict: Dict, objects: ReadonlyMap<string, ObjectEntry>): number | undefined {
  const length = dict['/Length'];
  if (typeof length === 'number') return length;
  if (isRef(length)) {
    const entry = objects.get(length);
    if (entry && 'value' in entry && typeof entry.value === 'number') return entry.value;
  }
  return undefined;
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Compress takes one file.');
  const passwordArgs = passwordArgsFor(passwordFrom(options));
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });

  const replacements = new Map<string, StreamReplacement>();
  let max = 0;
  // Every dictionary, with no stream data. A JSON too large, or any problem, skips the pictures; the file is still written again.
  const dicts = readDictionaries(await freshQpdf(tools, file), passwordArgs);
  const limit = dicts ? pixelLimit(dicts.objects) : undefined;
  if (dicts && limit !== undefined) {
    max = dicts.max;
    const context = pictureContext(dicts.objects);
    const candidates: { id: string; dict: Dict; candidate: Candidate }[] = [];
    for (const [id, entry] of dicts.objects) {
      const dict = streamDict(entry);
      const candidate = dict ? canShrink(id, dict, context) : null;
      if (dict && candidate) candidates.push({ id, dict, candidate });
    }
    const total = candidates.length;
    if (total > 0) {
      const byId = new Map(candidates.map((each) => [each.id, each]));
      const needsJpeg = candidates.some((each) => each.candidate.kind === 'jpeg');
      const needsLossless = candidates.some((each) => each.candidate.kind === 'lossless');
      const decoder = needsJpeg ? await need<PictureDecoder>(tools, 'decodePicture') : undefined;
      const canvases = needsJpeg ? await need<JpegCanvasMaker>(tools, 'canvas') : undefined;
      const fflate = needsLossless ? await need<Fflate>(tools, 'fflate') : undefined;
      const batches = rawBatches(candidates.map(({ id, dict }) => ({ id, length: statedLength(dict, dicts.objects) })));
      let done = 0;
      for await (const batch of readRawStreams(() => freshQpdf(tools, file), passwordArgs, batches)) {
        for (const [id, raw] of batch) {
          const found = byId.get(id);
          // readRawStreams gives only ids it was asked for; anything else is left alone.
          if (!found) continue;
          const { dict, candidate } = found;
          onProgress({ stage: 'working', unit: 'picture', done: ++done, total });
          let replacement: StreamReplacement | undefined;
          try {
            replacement =
              candidate.kind === 'jpeg' ? await shrinkJpeg(raw, dict, candidate, limit, decoder!, canvases!) : shrinkLossless(raw, dict, candidate, limit, fflate!);
          } catch {
            // A picture the browser or our code cannot redo is left as it was.
            replacement = undefined;
          }
          if (replacement) replacements.set(id, replacement);
          // The raw data is let go as soon as its picture is done.
          batch.delete(id);
        }
      }
      // Streams a batch gave no data for are left as they were, and still count, so the line reaches its total.
      if (done < total) onProgress({ stage: 'working', unit: 'picture', done: total, total });
    }
  }

  onProgress({ stage: 'writing', percent: 75 });
  // A fresh qpdf, once the reading ones are let go.
  const output = writeUpdate(await freshQpdf(tools, file), passwordArgs, max, replacements, losslessOptions);
  replacements.clear();
  onProgress({ stage: 'writing', percent: 100 });
  return output.length <= file.length * keepBelow ? [output] : [];
};

export const inspect: Inspector = inspectPdf;
