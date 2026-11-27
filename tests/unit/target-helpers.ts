// Shared by Compress to a target size's tests: PDF files written byte by byte with chosen pictures, JPG and
// lossless picture data, a JPG that passes the frame check with no real pixels, and stand-ins for the browser's
// decoder and canvas that count what they are asked for and do no pixel work.

import { deflateSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { walkJpeg } from '../../src/engines/picture';
import { zlibDeflate } from '../../src/engines/zlib';
import type { JpegCanvasMaker } from '../../src/engines/thumbnail';
import { Deflate } from 'fflate';

/** A PDF of these objects, numbered from 1 in order, with object 1 its catalog, and a plain cross-reference table. */
export function rawPdf(objects: readonly Buffer[]): Uint8Array {
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let at = parts[0]!.length;
  objects.forEach((body, index) => {
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    offsets.push(at);
    parts.push(object);
    at += object.length;
  });
  const rows = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

/** A stream object: its dictionary's entries (without /Length) and its data. */
export const streamObject = (entries: string, data: Uint8Array | Buffer) =>
  Buffer.concat([Buffer.from(`<< ${entries} /Length ${data.length} >>\nstream\n`, 'latin1'), Buffer.from(data), Buffer.from('\nendstream')]);

/** A picture to place: its dictionary's entries besides /Length, its data, and optionally a soft mask's. */
export type Placed = { entries: string; data: Uint8Array | Buffer; mask?: { entries: string; data: Uint8Array | Buffer } };

/**
 * A one-page PDF of `width` by `height` points that draws each picture over the whole page, with an optional line of
 * text in Helvetica. Objects: 1 catalog, 2 pages, 3 page, 4 contents, 5 font, then each picture (and its mask), then
 * any `unused` objects nothing refers to.
 */
export function picturePdf(width: number, height: number, pictures: readonly Placed[], text = 'Hello', unused: readonly Buffer[] = []): Uint8Array {
  const objects: Buffer[] = [];
  const names: string[] = [];
  let next = 6;
  const pictureObjects: Buffer[] = [];
  for (const [index, picture] of pictures.entries()) {
    const id = next++;
    names.push(`/Im${index} ${id} 0 R`);
    if (picture.mask) {
      const maskId = next++;
      pictureObjects.push(streamObject(`${picture.entries} /SMask ${maskId} 0 R`, picture.data));
      pictureObjects.push(streamObject(picture.mask.entries, picture.mask.data));
    } else {
      pictureObjects.push(streamObject(picture.entries, picture.data));
    }
  }
  const draw = pictures.map((_, index) => `q ${width} 0 0 ${height} 0 0 cm /Im${index} Do Q`).join('\n');
  const content = `${draw}\nBT /F1 12 Tf 10 10 Td (${text}) Tj ET`;
  objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.push(Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 5 0 R >> /XObject << ${names.join(' ')} >> >> /Contents 4 0 R >>`));
  objects.push(streamObject('', Buffer.from(content, 'latin1')));
  objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  objects.push(...pictureObjects, ...unused);
  return rawPdf(objects);
}

/** A tiny random number maker, so a test's pictures are the same on every run. */
export function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state >>> 16) / 65536;
  };
}

/** A real JPG of `width` by `height`: soft colour blobs with grain, so every step of the ladder gives a different size. */
export async function photoJpeg(width: number, height: number, quality = 92, seed = 7): Promise<Uint8Array> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const random = seeded(seed);
  context.fillStyle = '#d8c8a8';
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 160; index++) {
    context.fillStyle = `hsla(${Math.floor(random() * 360)}, 60%, ${30 + Math.floor(random() * 50)}%, 0.6)`;
    context.beginPath();
    context.arc(random() * width, random() * height, 10 + random() * width * 0.15, 0, Math.PI * 2);
    context.fill();
  }
  const image = context.getImageData(0, 0, width, height);
  for (let at = 0; at < image.data.length; at += 4) {
    const grain = (random() - 0.5) * 40;
    for (let c = 0; c < 3; c++) image.data[at + c] = Math.max(0, Math.min(255, image.data[at + c]! + grain));
  }
  context.putImageData(image, 0, 0);
  return new Uint8Array(await canvas.encode('jpeg', quality));
}

/** Lossless picture data: smooth grey or RGB gradients with some grain, deflated, with no predictor. */
export function losslessData(width: number, height: number, components: 1 | 3, seed = 3): Buffer {
  const random = seeded(seed);
  const samples = Buffer.alloc(width * height * components);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < components; c++) samples[(y * width + x) * components + c] = (x * (c + 1) + y * 2 + Math.floor(random() * 24)) & 0xff;
    }
  }
  return deflateSync(samples, { level: 6 });
}

/**
 * A JPG that passes the frame check (`walkJpeg`): a frame of `width` by `height`, one scan of `scanBytes` bytes of
 * data (no FF), and an end marker. It holds no real picture; only stand-ins decode it.
 */
export function frameOnlyJpeg(width: number, height: number, components: 1 | 3 = 3, scanBytes = 2): Uint8Array {
  const specs = components === 1 ? [1, 0x11, 0] : [1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0];
  const sof = [0xff, 0xc0, 0, 8 + 3 * components, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, components, ...specs];
  const scanSpecs = components === 1 ? [1, 0] : [1, 0, 2, 0, 3, 0];
  const sos = [0xff, 0xda, 0, 6 + 2 * components, components, ...scanSpecs, 0, 63, 0];
  const scan = Uint8Array.from({ length: scanBytes }, (_, index) => 0x10 + (index % 0xe0));
  return new Uint8Array([0xff, 0xd8, ...sof, ...sos, ...scan, 0xff, 0xd9]);
}

/** Real JPG data of one flat colour, as a real encoder writes it, so qpdf can decode it; cached by its size and colour. */
const flatCache = new Map<string, Uint8Array>();
export function flatJpeg(width: number, height: number, shade = 128): Uint8Array {
  const key = `${width}x${height}x${shade}`;
  let found = flatCache.get(key);
  if (!found) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    context.fillRect(0, 0, width, height);
    found = new Uint8Array(canvas.encodeSync('jpeg', 10));
    flatCache.set(key, found);
  }
  return found;
}

/** JPG data with a comment segment after its start, so its stored length is at least `length` bytes; the comment is never decoded. */
export function paddedJpeg(jpeg: Uint8Array, length: number): Uint8Array {
  const extra = Math.max(0, length - jpeg.length - 4);
  if (extra === 0) return jpeg;
  const parts: number[][] = [];
  for (let left = extra; left > 0; left -= 65_000) {
    const size = Math.min(65_000, left);
    parts.push([0xff, 0xfe, (size + 2) >> 8, (size + 2) & 0xff, ...new Array<number>(size).fill(0x20)]);
  }
  const comment = new Uint8Array(parts.flat());
  const out = new Uint8Array(jpeg.length + comment.length);
  out.set(jpeg.subarray(0, 2));
  out.set(comment, 2);
  out.set(jpeg.subarray(2), 2 + comment.length);
  return out;
}

/** What the counting stand-ins were asked for. */
export type Counts = { decodes: number; decodedPixels: number; encodes: number; encodedPixels: number; losslessDecodedPixels: number; losslessEncodedPixels: number };

/**
 * A decoder and a canvas that count calls and the pixels asked for, and draw or encode nothing: the decoder gives an
 * empty picture and counts the frame's pixels; the canvas counts each drawing's pixels and draws nothing, and its
 * encoder gives a tiny flat JPG of the size asked for (cached), which qpdf can check, so a job reaches the
 * replace-and-write path.
 */
export function countingStandIns(options: { throwFor?: (width: number, height: number) => boolean } = {}) {
  const counts: Counts = { decodes: 0, decodedPixels: 0, encodes: 0, encodedPixels: 0, losslessDecodedPixels: 0, losslessEncodedPixels: 0 };
  const decoder = {
    async decode(bytes: Uint8Array) {
      const walk = walkJpeg(bytes);
      if (walk.kind !== 'ok') throw new Error('not a JPG');
      if (options.throwFor?.(walk.frame.width, walk.frame.height)) throw new Error('the decoder gave up');
      counts.decodes += 1;
      counts.decodedPixels += walk.frame.width * walk.frame.height;
      return { image: {}, close: () => {} };
    },
  };
  const canvas: JpegCanvasMaker = {
    create(width: number, height: number) {
      counts.encodes += 1;
      counts.encodedPixels += width * height;
      return { canvas: { width, height }, context: { drawImage: () => {} } };
    },
    resize: () => {},
    release: () => {},
    png: async () => new Uint8Array(0),
    jpeg: async (target: unknown) => {
      const { width, height } = target as { width: number; height: number };
      return flatJpeg(width, height);
    },
  } as unknown as JpegCanvasMaker;
  return { counts, decoder, canvas };
}

/** Lossless steps that count pixels: the real inflate (counted by the picture's pixels), and a stored zero picture of the size asked for in place of the real scaling. */
export function countingLossless(counts: Counts, decode: typeof import('../../src/engines/shrink').decodeLossless) {
  return {
    decode: ((raw, candidate, Inflate) => {
      const decoded = decode(raw, candidate, Inflate);
      if (decoded) counts.losslessDecodedPixels += decoded.width * decoded.height;
      return decoded;
    }) as typeof decode,
    encode: (decoded: { components: number }, size: { width: number; height: number }) => {
      counts.losslessEncodedPixels += size.width * size.height;
      return zlibDeflate(new Uint8Array(size.width * size.height * decoded.components), Deflate);
    },
  };
}
