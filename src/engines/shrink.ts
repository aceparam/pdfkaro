// The picture steps of Compress PDF, shared by every tool that makes a PDF's
// pictures smaller: which pictures a tool can safely redo (`canShrink`,
// `listCandidates`), how sharp a picture needs to be (`pixelLimit`), a JPG
// decoded once and encoded at a size and quality (`decodeJpeg`, `encodeJpeg`,
// composed as `shrinkJpeg`), a picture stored without loss inflated once and
// scaled down and stored without loss again (`decodeLossless`,
// `encodeLossless`, composed as `shrinkLossless`), and qpdf's options for writing
// the file again without loss. Pure functions: no page, no network; the
// decoder, the canvas and fflate come from `tools`.

import { outlineDepthLimit } from './outline';
import { inflateLimited, jpegForPdf, walkJpeg, type InflateClass } from './picture';
import { isDict, isRef, type Dict, type ObjectEntry, type StreamReplacement } from './qpdf-json';
import { fittedSize, scaleDown, unpredict } from './resample';
import type { JpegCanvasMaker } from './thumbnail';
import type { EngineTools } from './types';

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

/** A stream's dictionary, or undefined for an object that is not a stream. */
export const streamDict = (entry: ObjectEntry | undefined): Dict | undefined => (entry && 'stream' in entry ? entry.stream.dict : undefined);
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
 * The most pixels a picture's longer side needs: `ppi` (150 when left out) to
 * the inch across the file's largest page, each page's box scaled by its
 * /UserUnit. Undefined when no page has a usable box, so the pictures step is
 * skipped.
 */
export function pixelLimit(objects: ReadonlyMap<string, ObjectEntry>, ppi: number = pixelsPerInch): number | undefined {
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
  return Math.max(1, Math.ceil((longest / 72) * ppi));
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
export type Decoded = { image: unknown; close(): void };
/** The browser's image decoder, at `width` by `height`, with colours left as they are. */
export type PictureDecoder = { decode(bytes: Uint8Array, width: number, height: number, options?: { colours?: 'none' }): Promise<Decoded> };
/** fflate's streaming deflater. */
export type DeflateClass = new (options: { level: 9 }, ondata: (chunk: Uint8Array, final: boolean) => void) => { push(chunk: Uint8Array, final?: boolean): void };
/** fflate's streaming inflater and deflater. */
export type Fflate = { Inflate: InflateClass; Deflate: DeflateClass };
type DrawingContext = { drawImage(image: unknown, x: number, y: number, width: number, height: number): void; imageSmoothingQuality?: string };

/** A tool from the worker or a test, by name; throws when it was not given. */
export async function need<T>(tools: EngineTools, name: string): Promise<T> {
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

/** The sentence thrown when a picture step is asked to do what it cannot. */
const cannotRedo = 'A picture step was given a picture it cannot redo.';

/** A JPG decoded at `width` by `height`, ready to be encoded once or more. Its caller closes `picture`. */
export type DecodedJpeg = { picture: Decoded; width: number; height: number };

/**
 * A JPG picture decoded at `size`, or undefined to leave it. Its own frame must
 * match the dictionary (one 8-bit frame, the same width, height and colours)
 * before it is decoded. It is rebuilt without camera details or a colour
 * profile, then decoded by the browser at `size`, with colours left as they
 * are. The caller closes what it gives.
 */
export async function decodeJpeg(
  raw: Uint8Array,
  candidate: Candidate,
  size: { width: number; height: number },
  decoder: PictureDecoder,
): Promise<DecodedJpeg | undefined> {
  const walk = walkJpeg(raw);
  if (walk.kind !== 'ok') return undefined;
  const { precision, width, height, components } = walk.frame;
  if (precision !== 8 || width !== candidate.width || height !== candidate.height || components !== candidate.components) return undefined;
  const cleaned = jpegForPdf(raw);
  if (!cleaned) return undefined;
  const picture = await decoder.decode(cleaned.bytes, size.width, size.height, { colours: 'none' });
  return { picture, width: size.width, height: size.height };
}

/**
 * A decoded JPG drawn at `size` and saved at `quality`, as JPG data ready to
 * go in with its number of colours, or undefined when what the encoder wrote
 * is not one 8-bit grey or RGB frame of exactly that size. The drawing is
 * smoothed at high quality only when `size` differs from the decoded size.
 * The decoded picture is not closed here.
 */
export async function encodeJpeg(
  decoded: DecodedJpeg,
  size: { width: number; height: number },
  quality: number,
  canvases: JpegCanvasMaker,
): Promise<{ bytes: Uint8Array; components: 1 | 3 } | undefined> {
  if (!isWhole(size.width, 1) || !isWhole(size.height, 1)) throw new Error(cannotRedo);
  let encoded: Uint8Array;
  const { canvas, context } = canvases.create(size.width, size.height);
  try {
    const drawing = context as DrawingContext;
    if (size.width !== decoded.width || size.height !== decoded.height) drawing.imageSmoothingQuality = 'high';
    drawing.drawImage(decoded.picture.image, 0, 0, size.width, size.height);
    encoded = await canvases.jpeg(canvas, quality);
  } finally {
    canvases.release(canvas);
  }
  // What the encoder wrote, without any profile or details it added, checked before it goes in.
  const written = jpegForPdf(encoded);
  const frame = written ? walkJpeg(written.bytes) : undefined;
  if (!written || frame?.kind !== 'ok' || frame.frame.width !== size.width || frame.frame.height !== size.height) return undefined;
  const components = frame.frame.components;
  if (components !== 1 && components !== 3) return undefined;
  return { bytes: written.bytes, components };
}

/**
 * A JPG picture made smaller, or undefined to leave it: decoded at its new
 * size (`decodeJpeg`), drawn and saved at quality 75 (`encodeJpeg`). It
 * replaces the old one when the old one was too large and the new one is
 * smaller, or when the new one is at least 10% smaller.
 */
export async function shrinkJpeg(
  raw: Uint8Array,
  dict: Dict,
  candidate: Candidate,
  limit: number,
  decoder: PictureDecoder,
  canvases: JpegCanvasMaker,
): Promise<StreamReplacement | undefined> {
  const { width, height } = candidate;
  const tooLarge = Math.max(width, height) > limit;
  const size = tooLarge ? fittedSize(width, height, limit) : { width, height };
  const decoded = await decodeJpeg(raw, candidate, size, decoder);
  if (!decoded) return undefined;
  let written: { bytes: Uint8Array; components: 1 | 3 } | undefined;
  try {
    written = await encodeJpeg(decoded, size, jpegQuality, canvases);
  } finally {
    decoded.picture.close();
  }
  if (!written) return undefined;
  if (candidate.components === 3 && written.components !== 3) return undefined;
  // Too large: used only when smaller. Not too large: only when at least 10% smaller.
  if (written.bytes.length >= raw.length) return undefined;
  if (!tooLarge && written.bytes.length > raw.length * (1 - jpegSaving)) return undefined;
  // A grey picture comes back from the canvas as an RGB JPG; its pixels stay grey.
  const space = candidate.deviceGray && written.components === 3 ? '/DeviceRGB' : undefined;
  return { dict: newDictionary(dict, size, '/DCTDecode', space), data: written.bytes };
}

/** A picture stored without loss, inflated: its 8-bit samples with no predictor bytes, ready to be scaled and stored once or more. */
export type DecodedLossless = { samples: Uint8Array; width: number; height: number; components: 1 | 3 };

/**
 * A picture stored without loss, inflated, or undefined to leave it: its data
 * must start with a zlib header, is inflated with a cap at exactly the size it
 * should have (with one predictor byte per row), and any predictor is undone.
 */
export function decodeLossless(raw: Uint8Array, candidate: Candidate, Inflate: InflateClass): DecodedLossless | undefined {
  const { width, height, components, predictor } = candidate;
  if (!isZlib(raw)) return undefined;
  const expected = (width * components + (predictor ? 1 : 0)) * height;
  const inflated = inflateLimited(raw.subarray(2), Inflate, expected);
  if (!inflated || inflated.length !== expected) return undefined;
  const samples = predictor ? unpredict(inflated, width, height, components) : inflated;
  if (!samples) return undefined;
  return { samples, width, height, components };
}

/**
 * An inflated picture scaled down to `size` by area averaging and stored
 * without loss again, as zlib data /FlateDecode reads. `size` is never larger
 * than the picture.
 */
export function encodeLossless(decoded: DecodedLossless, size: { width: number; height: number }, Deflate: DeflateClass): Uint8Array {
  const { samples, width, height, components } = decoded;
  if (!isWhole(size.width, 1) || !isWhole(size.height, 1) || size.width > width || size.height > height) throw new Error(cannotRedo);
  return zlibDeflate(scaleDown(samples, width, height, components, size.width, size.height), Deflate);
}

/**
 * A picture stored without loss, made smaller, or undefined to leave it. Only
 * a picture too large for the page is redone: inflated (`decodeLossless`),
 * scaled down by area averaging and stored without loss again
 * (`encodeLossless`). It replaces the old one only when smaller.
 */
export function shrinkLossless(raw: Uint8Array, dict: Dict, candidate: Candidate, limit: number, fflate: Fflate): StreamReplacement | undefined {
  const { width, height } = candidate;
  if (Math.max(width, height) <= limit) return undefined;
  const decoded = decodeLossless(raw, candidate, fflate.Inflate);
  if (!decoded) return undefined;
  const size = fittedSize(width, height, limit);
  const data = encodeLossless(decoded, size, fflate.Deflate);
  if (data.length >= raw.length) return undefined;
  return { dict: newDictionary(dict, size, '/FlateDecode'), data };
}

/** A stream's stated length: a number, or a reference to one. */
export function statedLength(dict: Dict, objects: ReadonlyMap<string, ObjectEntry>): number | undefined {
  const length = dict['/Length'];
  if (typeof length === 'number') return length;
  if (isRef(length)) {
    const entry = objects.get(length);
    if (entry && 'value' in entry && typeof entry.value === 'number') return entry.value;
  }
  return undefined;
}

/** A candidate picture with its object id and dictionary. */
export type Listed = { id: string; dict: Dict; candidate: Candidate };

/** Every stream object that `canShrink` takes, in the order the objects are listed. */
export function listCandidates(objects: ReadonlyMap<string, ObjectEntry>, context: PictureContext): Listed[] {
  const candidates: Listed[] = [];
  for (const [id, entry] of objects) {
    const dict = streamDict(entry);
    const candidate = dict ? canShrink(id, dict, context) : null;
    if (dict && candidate) candidates.push({ id, dict, candidate });
  }
  return candidates;
}
