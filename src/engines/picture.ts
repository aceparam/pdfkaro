// Reads a JPG or a PNG from its bytes, without decoding a pixel: its size, its
// camera turn, whether it can be converted, and the parts of it that may go
// into a PDF. Shared by the Image to PDF engine and its thumbnails. A pure
// module with no library: fflate's streaming inflater comes in as an argument.
//
// Every read is bounds-checked and every loop capped. Anything that does not
// add up is `damaged`; a JPG coded in a way many PDF readers cannot draw is
// `unsupported`.

export type PictureType = 'jpeg' | 'png';

/** The camera turn, as EXIF numbers it: 1 is upright, 2 to 8 turned or mirrored. */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Picture = {
  type: PictureType;
  /** The size as stored, before the camera turn. */
  width: number;
  height: number;
  /** Colour components as stored: 1, 3 or 4 for a JPG; 1 or 3 for a PNG (3 for a palette). */
  components: number;
  orientation: Orientation;
  /** An animated PNG; only its first picture is converted. */
  animated: boolean;
};

export type PictureRead = { kind: 'ok'; picture: Picture } | { kind: 'damaged' } | { kind: 'unsupported' };

/** Above this many pixels, a PNG gets a notice and no thumbnail: decoding it could use most of a phone's memory. */
export const maxPngPixels = 50_000_000;

/** The largest colour profile kept, joined or inflated. */
export const maxProfileBytes = 4 * 1024 * 1024;

// Caps on every loop over a file's parts.
const maxJpegSegments = 65_536;
const maxPngChunks = 100_000;
const maxIfdEntries = 200;
const maxProfileTags = 200;

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u16 = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!;
const u32 = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) >>> 0) + ((bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!);
const text = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
const startsWith = (bytes: Uint8Array, at: number, mark: string) => at + mark.length <= bytes.length && text(bytes, at, mark.length) === mark;

/** The size the picture is shown at, after its camera turn: turns 5 to 8 swap width and height. */
export function shownSize(picture: Pick<Picture, 'width' | 'height' | 'orientation'>): { width: number; height: number } {
  return picture.orientation >= 5 ? { width: picture.height, height: picture.width } : { width: picture.width, height: picture.height };
}

/** Whether the page warns about this picture and draws no thumbnail of it. */
export function isHuge(picture: Picture): boolean {
  return picture.type === 'png' && picture.width * picture.height > maxPngPixels;
}

/**
 * The camera turn from an EXIF block (a TIFF header and its first directory).
 * Only tag 0x0112 is read, and only as one SHORT from 1 to 8; anything else is 1.
 */
export function readOrientation(tiff: Uint8Array): Orientation {
  if (tiff.length < 8) return 1;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49 && tiff[2] === 0x2a && tiff[3] === 0x00;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d && tiff[2] === 0x00 && tiff[3] === 0x2a;
  if (!little && !big) return 1;
  const read16 = (at: number) => (little ? tiff[at]! | (tiff[at + 1]! << 8) : u16(tiff, at));
  const read32 = (at: number) => (little ? (tiff[at]! | (tiff[at + 1]! << 8) | (tiff[at + 2]! << 16)) + tiff[at + 3]! * 0x1000000 : u32(tiff, at));
  const ifd = read32(4);
  if (ifd < 8 || ifd + 2 > tiff.length) return 1;
  const entries = Math.min(read16(ifd), maxIfdEntries);
  for (let index = 0; index < entries; index++) {
    const at = ifd + 2 + index * 12;
    if (at + 12 > tiff.length) return 1;
    if (read16(at) !== 0x0112) continue;
    const type = read16(at + 2);
    const count = read32(at + 4);
    const value = read16(at + 8);
    return type === 3 && count === 1 && value >= 1 && value <= 8 ? (value as Orientation) : 1;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// JPG

/** One part of a JPG between markers: its marker, where it starts (at FF) and ends, and where its data starts. */
type Segment = { marker: number; start: number; end: number; data: number };

type JpegWalk =
  | { kind: 'ok'; segments: Segment[]; frame: { marker: number; precision: number; width: number; height: number; components: number }; eoi: number }
  | { kind: 'damaged' }
  | { kind: 'unsupported' };

const isSof = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/**
 * Walks a JPG's markers from its start through every scan to the first end of
 * image. Inside scan data, FF00 and FFD0 to FFD7 are data and any other marker
 * starts a segment. Nothing after the first end of image is looked at.
 */
function walkJpeg(bytes: Uint8Array): JpegWalk {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { kind: 'damaged' };
  const segments: Segment[] = [{ marker: 0xd8, start: 0, end: 2, data: 2 }];
  let frame: Extract<JpegWalk, { kind: 'ok' }>['frame'] | undefined;
  let scans = 0;
  let at = 2;
  for (let count = 0; count < maxJpegSegments; count++) {
    if (at >= bytes.length || bytes[at] !== 0xff) return { kind: 'damaged' };
    // Fill bytes: any number of FF before a marker.
    let start = at;
    while (at + 1 < bytes.length && bytes[at + 1] === 0xff) at++;
    start = at;
    if (at + 1 >= bytes.length) return { kind: 'damaged' };
    const marker = bytes[at + 1]!;
    if (marker === 0xd9) {
      if (!frame || scans === 0) return { kind: 'damaged' };
      segments.push({ marker, start, end: at + 2, data: at + 2 });
      return { kind: 'ok', segments, frame, eoi: at + 2 };
    }
    if (marker === 0x00 || marker === 0xd8) return { kind: 'damaged' };
    // Markers with no length: restart markers and TEM.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      segments.push({ marker, start, end: at + 2, data: at + 2 });
      at += 2;
      continue;
    }
    if (at + 4 > bytes.length) return { kind: 'damaged' };
    const length = u16(bytes, at + 2);
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) return { kind: 'damaged' };
    const data = at + 4;
    const segment: Segment = { marker, start, end, data };
    segments.push(segment);
    // Hierarchical coding starts with DHP.
    if (marker === 0xde) return { kind: 'unsupported' };
    if (isSof(marker)) {
      if (frame) return { kind: 'damaged' };
      if (length < 8) return { kind: 'damaged' };
      const precision = bytes[data]!;
      const height = u16(bytes, data + 1);
      const width = u16(bytes, data + 3);
      const components = bytes[data + 5]!;
      if (length < 8 + 3 * components) return { kind: 'damaged' };
      // Lossless (C3), hierarchical (C5 to C7, CD to CF) and arithmetic (C9 to CB) coding.
      if (marker !== 0xc0 && marker !== 0xc1 && marker !== 0xc2) return { kind: 'unsupported' };
      if (precision === 12) return { kind: 'unsupported' };
      if (precision !== 8) return { kind: 'damaged' };
      // A height of 0 is given later by DNL, which few readers handle.
      if (width === 0 || height === 0 || components === 0) return { kind: 'damaged' };
      if (components !== 1 && components !== 3 && components !== 4) return { kind: 'unsupported' };
      frame = { marker, precision, width, height, components };
    }
    at = end;
    if (marker === 0xda) {
      if (!frame) return { kind: 'damaged' };
      scans++;
      // Scan data runs to the next marker that is not FF00 or a restart marker.
      let scan = end;
      for (;;) {
        if (scan + 1 >= bytes.length) return { kind: 'damaged' };
        if (bytes[scan] !== 0xff) {
          scan++;
          continue;
        }
        const next = bytes[scan + 1]!;
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          scan += 2;
          continue;
        }
        if (next === 0xff) {
          scan++;
          continue;
        }
        break;
      }
      segment.end = scan;
      at = scan;
    }
  }
  return { kind: 'damaged' };
}

function readJpeg(bytes: Uint8Array): PictureRead {
  const walk = walkJpeg(bytes);
  if (walk.kind !== 'ok') return walk;
  let orientation: Orientation = 1;
  for (const segment of walk.segments) {
    if (segment.marker === 0xe1 && startsWith(bytes, segment.data, 'Exif\0\0')) {
      orientation = readOrientation(bytes.subarray(segment.data + 6, segment.end));
      break;
    }
  }
  const { width, height, components } = walk.frame;
  return { kind: 'ok', picture: { type: 'jpeg', width, height, components, orientation, animated: false } };
}

/** The markers whose segments are kept: tables, the frame, scans and the end. Every other segment is left out. */
const keptJpegMarkers = new Set([0xd8, 0xdb, 0xc4, 0xcc, 0xdd, 0xc0, 0xc1, 0xc2, 0xda, 0xd9]);

export type JpegForPdf = {
  /** The JPG rebuilt from the parts needed to draw it, ending at its first end of image. */
  bytes: Uint8Array;
  /** Its colour profile, joined from its chunks and checked against the picture, if it has a whole one that fits. */
  profile?: Uint8Array;
  /** Whether it has an Adobe segment, which says how a CMYK picture's values are stored. */
  adobe: boolean;
};

/**
 * Rebuilds a JPG from a list of the parts needed to draw it, in order, wherever
 * they appear: the start, quantisation, Huffman and arithmetic tables, the
 * restart interval, the frame, each scan with its data, an Adobe segment, and
 * one end of image. Camera details, places, thumbnails, comments, every other
 * segment, and everything after the first end of image are left out.
 * Gives undefined for a JPG that `readPicture` does not pass.
 */
export function jpegForPdf(bytes: Uint8Array): JpegForPdf | undefined {
  const walk = walkJpeg(bytes);
  if (walk.kind !== 'ok') return undefined;
  const kept: Segment[] = [];
  const chunks: { sequence: number; total: number; data: Uint8Array }[] = [];
  let adobe = false;
  for (const segment of walk.segments) {
    if (keptJpegMarkers.has(segment.marker)) kept.push(segment);
    else if (segment.marker === 0xee && startsWith(bytes, segment.data, 'Adobe')) {
      kept.push(segment);
      adobe = true;
    } else if (segment.marker === 0xe2 && startsWith(bytes, segment.data, 'ICC_PROFILE\0') && segment.data + 14 <= segment.end) {
      chunks.push({ sequence: bytes[segment.data + 12]!, total: bytes[segment.data + 13]!, data: bytes.subarray(segment.data + 14, segment.end) });
    }
  }
  const size = kept.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const segment of kept) {
    out.set(bytes.subarray(segment.start, segment.end), at);
    at += segment.end - segment.start;
  }
  const profile = joinProfile(chunks, walk.frame.components);
  return profile ? { bytes: out, profile, adobe } : { bytes: out, adobe };
}

/** Joins a JPG's ICC_PROFILE chunks in sequence order, only when every one is there once and the whole fits the picture. */
function joinProfile(chunks: { sequence: number; total: number; data: Uint8Array }[], components: number): Uint8Array | undefined {
  if (chunks.length === 0) return undefined;
  const total = chunks[0]!.total;
  if (total === 0 || chunks.length !== total || chunks.some((chunk) => chunk.total !== total)) return undefined;
  const ordered: Uint8Array[] = [];
  for (let sequence = 1; sequence <= total; sequence++) {
    const found = chunks.filter((chunk) => chunk.sequence === sequence);
    if (found.length !== 1) return undefined;
    ordered.push(found[0]!.data);
  }
  const size = ordered.reduce((sum, data) => sum + data.length, 0);
  if (size > maxProfileBytes) return undefined;
  const joined = new Uint8Array(size);
  let at = 0;
  for (const data of ordered) {
    joined.set(data, at);
    at += data.length;
  }
  return profileFits(joined, components) ? joined : undefined;
}

// ---------------------------------------------------------------------------
// PNG

type PngChunk = { type: string; start: number; data: number; length: number };

const validDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

type PngWalk = { kind: 'ok'; chunks: PngChunk[]; width: number; height: number; colourType: number } | { kind: 'damaged' };

/** Walks a PNG's chunks from IHDR to IEND. CRCs are not checked, as browsers do not refuse on them. */
function walkPng(bytes: Uint8Array): PngWalk {
  if (bytes.length < 8 + 25 || !pngSignature.every((byte, index) => bytes[index] === byte)) return { kind: 'damaged' };
  if (u32(bytes, 8) !== 13 || !startsWith(bytes, 12, 'IHDR')) return { kind: 'damaged' };
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  const depth = bytes[24]!;
  const colourType = bytes[25]!;
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) return { kind: 'damaged' };
  if (!validDepths[colourType]?.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28]! > 1) return { kind: 'damaged' };
  const chunks: PngChunk[] = [];
  let at = 8;
  for (let count = 0; count < maxPngChunks; count++) {
    if (at + 12 > bytes.length) return { kind: 'damaged' };
    const length = u32(bytes, at);
    if (length > 0x7fffffff || at + 12 + length > bytes.length) return { kind: 'damaged' };
    const type = text(bytes, at + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return { kind: 'damaged' };
    chunks.push({ type, start: at, data: at + 8, length });
    at += 12 + length;
    if (type === 'IEND') {
      if (!chunks.some((chunk) => chunk.type === 'IDAT')) return { kind: 'damaged' };
      if (colourType === 3 && !chunks.some((chunk) => chunk.type === 'PLTE')) return { kind: 'damaged' };
      return { kind: 'ok', chunks, width, height, colourType };
    }
  }
  return { kind: 'damaged' };
}

function readPng(bytes: Uint8Array): PictureRead {
  const walk = walkPng(bytes);
  if (walk.kind !== 'ok') return walk;
  const exif = walk.chunks.find((chunk) => chunk.type === 'eXIf');
  const orientation = exif ? readOrientation(bytes.subarray(exif.data, exif.data + exif.length)) : 1;
  const components = walk.colourType === 0 || walk.colourType === 4 ? 1 : 3;
  const animated = walk.chunks.some((chunk) => chunk.type === 'acTL');
  return { kind: 'ok', picture: { type: 'png', width: walk.width, height: walk.height, components, orientation, animated } };
}

/**
 * An animated PNG with its animation chunks taken out, leaving its default
 * picture; any other PNG as it is. pdf-lib refuses animated PNGs otherwise.
 */
export function pngFirstFrame(bytes: Uint8Array): Uint8Array {
  const walk = walkPng(bytes);
  if (walk.kind !== 'ok') return bytes;
  const dropped = new Set(['acTL', 'fcTL', 'fdAT']);
  if (!walk.chunks.some((chunk) => dropped.has(chunk.type))) return bytes;
  const kept = walk.chunks.filter((chunk) => !dropped.has(chunk.type));
  const out = new Uint8Array(8 + kept.reduce((sum, chunk) => sum + 12 + chunk.length, 0));
  out.set(bytes.subarray(0, 8));
  let at = 8;
  for (const chunk of kept) {
    out.set(bytes.subarray(chunk.start, chunk.start + 12 + chunk.length), at);
    at += 12 + chunk.length;
  }
  return out;
}

/** fflate's streaming inflater, the one part of fflate used here. */
export type InflateClass = new (ondata: (chunk: Uint8Array, final: boolean) => void) => { push(chunk: Uint8Array, final?: boolean): void };

/**
 * A PNG's colour profile from its iCCP chunk, inflated with limits on what goes
 * in and what comes out, and checked against the picture as pdf-lib stores it:
 * always three-component RGB, so only an RGB profile is kept.
 */
export function pngProfile(bytes: Uint8Array, fflate: { Inflate: InflateClass }): Uint8Array | undefined {
  const walk = walkPng(bytes);
  if (walk.kind !== 'ok') return undefined;
  const chunk = walk.chunks.find((each) => each.type === 'iCCP');
  if (!chunk || chunk.length > maxProfileBytes) return undefined;
  const data = bytes.subarray(chunk.data, chunk.data + chunk.length);
  // A name of 1 to 79 bytes, a zero, the method (0), then zlib data.
  const nameEnd = data.indexOf(0);
  if (nameEnd < 1 || nameEnd > 79 || data[nameEnd + 1] !== 0) return undefined;
  const zlib = data.subarray(nameEnd + 2);
  if (zlib.length < 3 || (zlib[0]! & 0x0f) !== 8 || ((zlib[0]! << 8) | zlib[1]!) % 31 !== 0 || (zlib[1]! & 0x20) !== 0) return undefined;
  const inflated = inflateLimited(zlib.subarray(2), fflate.Inflate, maxProfileBytes);
  return inflated && profileFits(inflated, 3) ? inflated : undefined;
}

class TooLong extends Error {}

/**
 * Inflates raw deflate data, pushing it in small pieces so no one piece can
 * make much more than a megabyte, and stops as soon as the output passes `limit`.
 */
export function inflateLimited(data: Uint8Array, Inflate: InflateClass, limit: number): Uint8Array | undefined {
  const parts: Uint8Array[] = [];
  let size = 0;
  let ended = false;
  const inflater = new Inflate((chunk, final) => {
    size += chunk.length;
    if (size > limit) throw new TooLong();
    parts.push(chunk.slice());
    if (final) ended = true;
  });
  const piece = 1024;
  try {
    for (let at = 0; at < data.length && !ended; at += piece) inflater.push(data.subarray(at, at + piece), at + piece >= data.length);
  } catch {
    return undefined;
  }
  if (!ended) return undefined;
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Colour profiles

const spaceFor: Record<number, string> = { 1: 'GRAY', 3: 'RGB ', 4: 'CMYK' };
const keptClasses = new Set(['mntr', 'scnr', 'prtr', 'spac']);

/**
 * Whether a profile is whole and fits a picture of `components` colours: its
 * own size equals its bytes, it says it is a profile, its colour space matches
 * and its class is display, input, output or colour space.
 */
export function profileFits(profile: Uint8Array, components: number): boolean {
  if (profile.length < 132 || profile.length > maxProfileBytes) return false;
  if (u32(profile, 0) !== profile.length) return false;
  if (!startsWith(profile, 36, 'acsp')) return false;
  if (text(profile, 16, 4) !== spaceFor[components]) return false;
  return keptClasses.has(text(profile, 12, 4));
}

/** The tags that carry colour data. Every other tag, including descriptions, copyright and device names, is left out. */
const colourTags = new Set(['rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC', 'kTRC', 'wtpt', 'bkpt', 'chad', 'A2B0', 'A2B1', 'A2B2', 'B2A0', 'B2A1', 'B2A2', 'gamt', 'chrm']);

const ascii = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0));

/** A fixed description and an empty copyright, in the profile's own version's format, as the ICC standard requires both. */
function requiredTexts(major: number): { desc: Uint8Array; cprt: Uint8Array } {
  const description = 'Colour profile';
  if (major >= 4) {
    const mluc = (value: string) => {
      const out = new Uint8Array(28 + value.length * 2);
      out.set(ascii('mluc'));
      out.set([0, 0, 0, 1, 0, 0, 0, 12], 8);
      out.set(ascii('enUS'), 16);
      const view = new DataView(out.buffer);
      view.setUint32(20, value.length * 2);
      view.setUint32(24, 28);
      for (let index = 0; index < value.length; index++) view.setUint16(28 + index * 2, value.charCodeAt(index));
      return out;
    };
    return { desc: mluc(description), cprt: mluc('') };
  }
  // textDescriptionType: ASCII with its count, then an empty Unicode and an empty ScriptCode part.
  const desc = new Uint8Array(12 + description.length + 1 + 4 + 4 + 2 + 1 + 67);
  desc.set(ascii('desc'));
  new DataView(desc.buffer).setUint32(8, description.length + 1);
  desc.set(ascii(description), 12);
  // textType: an empty ASCII string.
  const cprt = new Uint8Array(13);
  cprt.set(ascii('text'));
  return { desc, cprt };
}

/**
 * Rebuilds a profile with only its colour data: a tag table holding only colour
 * tags, each data block copied once, and the header's date, device maker and
 * model, attributes, creator and profile ID cleared. A fixed description and an
 * empty copyright are written in their place. Gives undefined for a profile
 * that cannot be read or has no colour tags.
 */
export function profileColourOnly(profile: Uint8Array): Uint8Array | undefined {
  if (profile.length < 132 || u32(profile, 0) !== profile.length) return undefined;
  const count = u32(profile, 128);
  if (count > maxProfileTags || 132 + count * 12 > profile.length) return undefined;
  // Blocks by where they sit in the old profile, so tags that share one still share it.
  const blocks = new Map<string, { offset: number; size: number }>();
  const tags: { signature: string; key: string }[] = [];
  for (let index = 0; index < count; index++) {
    const at = 132 + index * 12;
    const signature = text(profile, at, 4);
    if (!colourTags.has(signature) || tags.some((tag) => tag.signature === signature)) continue;
    const offset = u32(profile, at + 4);
    const size = u32(profile, at + 8);
    if (size < 8 || offset < 132 || offset + size > profile.length) continue;
    const key = `${offset}:${size}`;
    blocks.set(key, { offset, size });
    tags.push({ signature, key });
  }
  if (tags.length === 0) return undefined;
  const major = profile[8]!;
  const { desc, cprt } = requiredTexts(major);
  const pad = (value: number) => (value + 3) & ~3;
  const allTags = [...tags.map((tag) => ({ signature: tag.signature, key: tag.key })), { signature: 'desc', key: 'desc' }, { signature: 'cprt', key: 'cprt' }];
  const datas = new Map<string, Uint8Array>([
    ...[...blocks].map(([key, block]) => [key, profile.subarray(block.offset, block.offset + block.size)] as [string, Uint8Array]),
    ['desc', desc],
    ['cprt', cprt],
  ]);
  let at = pad(132 + allTags.length * 12);
  const placed = new Map<string, number>();
  for (const [key, data] of datas) {
    placed.set(key, at);
    at = pad(at + data.length);
  }
  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  out.set(profile.subarray(0, 128));
  view.setUint32(0, out.length);
  // Cleared: date and time, device maker and model, attributes, creator, profile ID, and the reserved bytes.
  out.fill(0, 24, 36);
  out.fill(0, 48, 64);
  out.fill(0, 80, 128);
  view.setUint32(128, allTags.length);
  allTags.forEach((tag, index) => {
    const entry = 132 + index * 12;
    const data = datas.get(tag.key)!;
    out.set(ascii(tag.signature), entry);
    view.setUint32(entry + 4, placed.get(tag.key)!);
    view.setUint32(entry + 8, data.length);
  });
  for (const [key, data] of datas) out.set(data, placed.get(key)!);
  return out;
}

// ---------------------------------------------------------------------------

/** Reads a JPG or a PNG from its bytes, without decoding it. */
export function readPicture(bytes: Uint8Array): PictureRead {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return readJpeg(bytes);
  if (bytes.length >= 8 && pngSignature.every((byte, index) => bytes[index] === byte)) return readPng(bytes);
  return { kind: 'damaged' };
}
