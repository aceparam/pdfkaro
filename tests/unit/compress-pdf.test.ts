// The Compress PDF engine: which pictures are candidates, the pixel limit, the
// picture steps with their limits, and real runs on every file in the test set
// and on the files made for this tool, with the same qpdf the browser uses.
// Pictures are decoded and drawn through @napi-rs/canvas in place of the
// worker's createImageBitmap and OffscreenCanvas, and pages drawn by PDF.js.
// Which side of the 10% line a JPG that is not too large falls on depends on
// the encoder, so it is not asserted here; the end-to-end test checks it in Chromium.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from '@cantoo/pdf-lib';
import { Deflate, Inflate } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import type { ObjectEntry } from '../../src/engines/qpdf-json';
import { openDocument } from '../../src/engines/thumbnail';
import {
  canShrink,
  inspect,
  keepBelow,
  losslessOptions,
  newDictionary,
  pictureContext,
  pixelLimit,
  run,
  shrinkJpeg,
  shrinkLossless,
  zlibDeflate,
  type Candidate,
} from '../../src/engines/tools/compress-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { progressFraction, progressLine } from '../../src/widget/format';
import { jpegCanvasMaker, pictureDecoder, tools as drawingTools } from './thumbnail-helpers';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));
const password = 'open-sesame';

/** Every byte fflate's Inflate gives out, counted, so a test can see no data was inflated past its limit. */
const inflated = { bytes: 0, calls: 0 };
class CountingInflate {
  private readonly inner: Inflate;
  constructor(ondata: (chunk: Uint8Array, final: boolean) => void) {
    inflated.calls++;
    this.inner = new Inflate((chunk, final) => {
      inflated.bytes += chunk.length;
      ondata(chunk, final);
    });
  }
  push(chunk: Uint8Array, final?: boolean) {
    this.inner.push(chunk, final);
  }
}
const tools: EngineTools = { ...drawingTools, qpdf: makeQpdf, fflate: async () => ({ Inflate: CountingInflate, Deflate }) };

async function compress(file: Uint8Array, passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const outputs = await run([file], { passwords }, (step) => progress.push(step), tools);
  return { output: outputs[0], outputs, progress };
}

async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string; printed: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}
const passwordArgs = (given?: string) => (given === undefined ? [] : [`--password=${given}`]);

type Stream = { id: string; dict: Record<string, unknown>; data: Buffer };
/** Every stream in a file: its dictionary and its data, raw (as stored) or decoded. */
async function streamsOf(bytes: Uint8Array, { decoded = false, given }: { decoded?: boolean; given?: string } = {}): Promise<{ streams: Stream[]; objects: Record<string, { value?: unknown; stream?: { dict: Record<string, unknown> } }> }> {
  const level = decoded ? 'generalized' : 'none';
  const { out } = await qpdfOn(bytes, [...passwordArgs(given), '--json=2', '--json-key=qpdf', `--decode-level=${level}`, '--json-stream-data=inline']);
  const objects = (JSON.parse(out) as { qpdf: [unknown, Record<string, { value?: unknown; stream?: { dict: Record<string, unknown>; data?: string } }>] }).qpdf[1];
  const streams = Object.entries(objects).flatMap(([key, entry]) => (entry.stream ? [{ id: key.slice(4), dict: entry.stream.dict, data: Buffer.from(entry.stream.data ?? '', 'base64') }] : []));
  return { streams, objects };
}
const images = (streams: Stream[]) => streams.filter((stream) => stream.dict['/Subtype'] === '/Image');
/** A dictionary without its length and with references blanked, so the same picture compares equal in two files. */
const shape = (dict: Record<string, unknown>) =>
  JSON.stringify(Object.fromEntries(Object.entries(dict).filter(([key]) => key !== '/Length').map(([key, value]) => [key, JSON.stringify(value).replace(/\d+ \d+ R/g, 'ref')])));

/** The whole file with object streams undone and its streams decoded, as text. */
async function decodedText(bytes: Uint8Array, given?: string): Promise<string> {
  const qpdf = await makeQpdf();
  qpdf.write('/r.pdf', bytes);
  qpdf.call([...passwordArgs(given), '--qdf', '--object-streams=disable', '--decode-level=generalized', '/r.pdf', '/q.pdf']);
  return Buffer.from(qpdf.read('/q.pdf')).toString('latin1');
}

/** A page drawn by PDF.js, as RGBA pixels, inside a 200 by 283 box. */
async function drawn(bytes: Uint8Array, page: number, given?: string) {
  // PDF.js takes the bytes it is given, so it gets a copy.
  const doc = await openDocument(bytes.slice(), given, drawingTools);
  try {
    const image = await loadImage(Buffer.from(await doc.render(page, { width: 200, height: 283 })));
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.getContext('2d').getImageData(0, 0, image.width, image.height);
  } finally {
    await doc.close();
  }
}
/** The mean difference of two drawings of the same size, from 0 to 255. */
function meanDifference(a: { data: Uint8ClampedArray; width: number; height: number }, b: { data: Uint8ClampedArray; width: number; height: number }) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0;
  for (let at = 0; at < a.data.length; at += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a.data[at + c]! - b.data[at + c]!);
  return sum / ((a.data.length / 4) * 3);
}

// ---------------------------------------------------------------------------

describe('which pictures are candidates', () => {
  const objects = new Map<string, ObjectEntry>([
    ['20 0 R', { stream: { dict: { '/N': 3 } } }],
    ['21 0 R', { stream: { dict: { '/N': 1 } } }],
    ['22 0 R', { stream: { dict: { '/N': 4 } } }],
    ['30 0 R', { stream: { dict: { '/Subtype': '/Image', '/Width': 10, '/Height': 10, '/ColorSpace': '/DeviceGray', '/BitsPerComponent': 8 } } }],
    ['31 0 R', { stream: { dict: { '/Subtype': '/Image', '/Width': 10, '/Height': 10, '/ColorSpace': '/DeviceGray', '/BitsPerComponent': 8, '/Matte': [0, 0, 0] } } }],
    // A picture that names 40 0 R as its soft mask and 41 0 R as its mask.
    ['50 0 R', { stream: { dict: { '/Subtype': '/Image', '/SMask': '40 0 R', '/Mask': '41 0 R' } } }],
  ]);
  const all = pictureContext(objects);
  const jpeg = { '/Type': '/XObject', '/Subtype': '/Image', '/Width': 2480, '/Height': 3508, '/ColorSpace': '/DeviceRGB', '/BitsPerComponent': 8, '/Filter': '/DCTDecode', '/Length': 9 };
  const lossless = { ...jpeg, '/Filter': '/FlateDecode' };
  const check = (dict: Record<string, unknown>, id = '9 0 R') => canShrink(id, dict, all);

  it('takes 8-bit grey and RGB JPGs, and RGB ICC profiles', () => {
    expect(check(jpeg)).toEqual<Candidate>({ kind: 'jpeg', width: 2480, height: 3508, components: 3, deviceGray: false, predictor: false });
    expect(check({ ...jpeg, '/ColorSpace': '/DeviceGray' })).toMatchObject({ kind: 'jpeg', components: 1, deviceGray: true });
    expect(check({ ...jpeg, '/ColorSpace': ['/ICCBased', '20 0 R'] })).toMatchObject({ components: 3, deviceGray: false });
    expect(check({ ...jpeg, '/Filter': ['/DCTDecode'] })).toMatchObject({ kind: 'jpeg' });
  });

  it('takes pictures stored without loss, with no predictor or a PNG predictor that matches', () => {
    expect(check(lossless)).toMatchObject({ kind: 'lossless', predictor: false });
    for (const predictor of [10, 12, 15]) {
      expect(check({ ...lossless, '/DecodeParms': { '/Predictor': predictor, '/Colors': 3, '/BitsPerComponent': 8, '/Columns': 2480 } })).toMatchObject({ kind: 'lossless', predictor: true });
    }
    expect(check({ ...lossless, '/ColorSpace': '/DeviceGray', '/DecodeParms': { '/Predictor': 15, '/Columns': 2480 } })).toMatchObject({ components: 1, predictor: true });
  });

  it('keeps the allowed keys and its own soft mask with no /Matte', () => {
    const allowed = { ...jpeg, '/Interpolate': true, '/Intent': '/Perceptual', '/Metadata': '60 0 R', '/StructParent': 3, '/ID': 'b:00', '/Name': '/Im1', '/OC': '61 0 R', '/SMask': '30 0 R' };
    expect(check(allowed)).toMatchObject({ kind: 'jpeg' });
  });

  it('leaves alone every other picture', () => {
    const refused: [string, Record<string, unknown>, string?][] = [
      ['not a picture', { ...jpeg, '/Subtype': '/Form' }],
      ['1 bit', { ...jpeg, '/BitsPerComponent': 1 }],
      ['16 bits', { ...jpeg, '/BitsPerComponent': 16 }],
      ['a colour-key mask', { ...jpeg, '/Mask': [0, 10, 0, 10, 0, 10] }],
      ['a mask picture', { ...jpeg, '/Mask': '41 0 R' }],
      ['a decode array', { ...jpeg, '/Decode': [1, 0, 1, 0, 1, 0] }],
      ['an image mask', { ...jpeg, '/ImageMask': true }],
      ['alternates', { ...jpeg, '/Alternates': [] }],
      ['OPI', { ...jpeg, '/OPI': {} }],
      ['a soft mask in its data', { ...jpeg, '/SMaskInData': 1 }],
      ['an unknown key', { ...jpeg, '/Whatever': 1 }],
      ['no width', { ...jpeg, '/Width': undefined }],
      ['a width of 0', { ...jpeg, '/Width': 0 }],
      ['a width that is not whole', { ...jpeg, '/Width': 10.5 }],
      ['a width given by reference', { ...jpeg, '/Width': '12 0 R' }],
      ['more than 50 million pixels', { ...jpeg, '/Width': 10_000, '/Height': 5_001 }],
      ['CMYK', { ...jpeg, '/ColorSpace': '/DeviceCMYK' }],
      ['indexed', { ...jpeg, '/ColorSpace': ['/Indexed', '/DeviceRGB', 1, 'b:000000ffffff'] }],
      ['a grey ICC profile', { ...jpeg, '/ColorSpace': ['/ICCBased', '21 0 R'] }],
      ['a CMYK ICC profile', { ...jpeg, '/ColorSpace': ['/ICCBased', '22 0 R'] }],
      ['an ICC profile that is not there', { ...jpeg, '/ColorSpace': ['/ICCBased', '99 0 R'] }],
      ['a colour space by reference', { ...jpeg, '/ColorSpace': '23 0 R' }],
      ['JPEG 2000', { ...jpeg, '/Filter': '/JPXDecode' }],
      ['CCITT', { ...jpeg, '/Filter': '/CCITTFaxDecode' }],
      ['JBIG2', { ...jpeg, '/Filter': '/JBIG2Decode' }],
      ['two filters', { ...jpeg, '/Filter': ['/FlateDecode', '/DCTDecode'] }],
      ['no filter', { ...jpeg, '/Filter': undefined }],
      ['a JPG with decode parameters', { ...jpeg, '/DecodeParms': { '/ColorTransform': 0 } }],
      ['a TIFF predictor', { ...lossless, '/DecodeParms': { '/Predictor': 2, '/Colors': 3, '/Columns': 2480 } }],
      ['a predictor with the wrong colours', { ...lossless, '/DecodeParms': { '/Predictor': 15, '/Colors': 1, '/Columns': 2480 } }],
      ['a predictor with the wrong columns', { ...lossless, '/DecodeParms': { '/Predictor': 15, '/Colors': 3, '/Columns': 2479 } }],
      ['a predictor with the wrong bits', { ...lossless, '/DecodeParms': { '/Predictor': 15, '/Colors': 3, '/BitsPerComponent': 16, '/Columns': 2480 } }],
      ['an unknown decode parameter', { ...lossless, '/DecodeParms': { '/Predictor': 15, '/Colors': 3, '/Columns': 2480, '/EarlyChange': 0 } }],
      ['decode parameters with no predictor', { ...lossless, '/DecodeParms': {} }],
      ['its soft mask has /Matte', { ...jpeg, '/SMask': '31 0 R' }],
      ['its soft mask is not there', { ...jpeg, '/SMask': '99 0 R' }],
      ['its soft mask is not a reference', { ...jpeg, '/SMask': '/None' }],
      ['it is another picture’s soft mask', jpeg, '40 0 R'],
      ['it is another picture’s mask', jpeg, '41 0 R'],
    ];
    for (const [what, dict, id] of refused) expect(check(dict, id), what).toBeNull();
  });
});

describe('the pixel limit', () => {
  const page = (dict: Record<string, unknown>): [string, ObjectEntry] => [`${Math.random()}`.slice(2, 6) + ' 0 R', { value: { '/Type': '/Page', ...dict } }];

  it('is 150 pixels to the inch across the largest page, rounded up', () => {
    expect(pixelLimit(new Map([page({ '/MediaBox': [0, 0, 595.28, 841.89] })]))).toBe(1754);
    expect(pixelLimit(new Map([page({ '/MediaBox': [0, 0, 72, 72] }), page({ '/MediaBox': [0, 0, 612, 792] })]))).toBe(1650);
    expect(pixelLimit(new Map([page({ '/MediaBox': [100, 100, 28, 64] })]))).toBe(150);
  });

  it('takes the crop box before the media box, either inherited, and scales by /UserUnit', () => {
    expect(pixelLimit(new Map([page({ '/MediaBox': [0, 0, 595, 842], '/CropBox': [0, 0, 72, 144] })]))).toBe(300);
    const tree = new Map<string, ObjectEntry>([
      ['1 0 R', { value: { '/Type': '/Pages', '/MediaBox': [0, 0, 144, 72], '/Parent': '2 0 R' } }],
      ['2 0 R', { value: { '/Type': '/Pages', '/CropBox': [0, 0, 36, 36] } }],
      ['3 0 R', { value: { '/Type': '/Page', '/Parent': '1 0 R' } }],
    ]);
    expect(pixelLimit(tree)).toBe(75);
    expect(pixelLimit(new Map([page({ '/MediaBox': [0, 0, 72, 72], '/UserUnit': 2 })]))).toBe(300);
  });

  it('ignores boxes that are not four finite numbers, survives a loop in the tree, and is undefined with no box', () => {
    expect(pixelLimit(new Map([page({ '/MediaBox': [0, 0, 'x', 72] }), page({ '/MediaBox': [0, 0, 72, 72] })]))).toBe(150);
    expect(pixelLimit(new Map([page({ '/MediaBox': [0, 0, Number.POSITIVE_INFINITY, 72] })]))).toBeUndefined();
    expect(pixelLimit(new Map([page({ '/MediaBox': [0, 0, 72] })]))).toBeUndefined();
    const loop = new Map<string, ObjectEntry>([
      ['1 0 R', { value: { '/Type': '/Pages', '/Parent': '2 0 R' } }],
      ['2 0 R', { value: { '/Type': '/Pages', '/Parent': '1 0 R' } }],
      ['3 0 R', { value: { '/Type': '/Page', '/Parent': '1 0 R' } }],
    ]);
    expect(pixelLimit(loop)).toBeUndefined();
    expect(pixelLimit(new Map())).toBeUndefined();
  });
});

describe('the new dictionary', () => {
  it('keeps every allowed key but those written afresh, and changes the colour space only when asked', () => {
    const old = { '/Type': '/XObject', '/Subtype': '/Image', '/Width': 9, '/Height': 9, '/ColorSpace': '/DeviceGray', '/BitsPerComponent': 8, '/Filter': '/FlateDecode', '/DecodeParms': { '/Predictor': 15 }, '/Length': 99, '/Interpolate': true, '/Metadata': '7 0 R', '/SMask': '8 0 R', '/Odd': 1 };
    expect(newDictionary(old, { width: 3, height: 4 }, '/DCTDecode', '/DeviceRGB')).toEqual({
      '/Type': '/XObject',
      '/Subtype': '/Image',
      '/Width': 3,
      '/Height': 4,
      '/ColorSpace': '/DeviceRGB',
      '/BitsPerComponent': 8,
      '/Filter': '/DCTDecode',
      '/Interpolate': true,
      '/Metadata': '7 0 R',
      '/SMask': '8 0 R',
    });
    expect(newDictionary(old, { width: 3, height: 4 }, '/FlateDecode')['/ColorSpace']).toBe('/DeviceGray');
  });
});

describe('data stored without loss', () => {
  it('is deflated by fflate and framed as zlib data', () => {
    const data = Uint8Array.from({ length: 300_000 }, (_, index) => (index * 31) & 0xff);
    const framed = zlibDeflate(data, Deflate);
    expect([framed[0], framed[1]]).toEqual([0x78, 0xda]);
    expect(new Uint8Array(inflateSync(framed))).toEqual(data);
    expect(new Uint8Array(inflateSync(zlibDeflate(new Uint8Array(0), Deflate)))).toEqual(new Uint8Array(0));
  });

  const candidate: Candidate = { kind: 'lossless', width: 400, height: 400, components: 3, deviceGray: false, predictor: false };
  const dict = { '/Subtype': '/Image', '/Width': 400, '/Height': 400, '/ColorSpace': '/DeviceRGB', '/BitsPerComponent': 8, '/Filter': '/FlateDecode' };
  const fflate = { Inflate: CountingInflate, Deflate };

  it('is inflated no further than its exact size: data that inflates to 100 MB stops just past 480,000 bytes', () => {
    inflated.bytes = 0;
    expect(shrinkLossless(new Uint8Array(deflateSync(Buffer.alloc(100 * 1024 * 1024), { level: 9 })), dict, candidate, 150, fflate)).toBeUndefined();
    expect(inflated.bytes).toBeLessThan(400 * 400 * 3 + 2 * 1024 * 1024);
  });

  it('counts one predictor byte per row, and refuses data that inflates to less or more', () => {
    const rows = Buffer.alloc((400 * 3 + 1) * 400);
    const withPredictor = { ...candidate, predictor: true };
    expect(shrinkLossless(new Uint8Array(deflateSync(rows)), dict, withPredictor, 150, fflate)).toMatchObject({ dict: { '/Width': 150, '/Height': 150 } });
    expect(shrinkLossless(new Uint8Array(deflateSync(rows)), dict, candidate, 150, fflate)).toBeUndefined();
    expect(shrinkLossless(new Uint8Array(deflateSync(rows.subarray(1))), dict, withPredictor, 150, fflate)).toBeUndefined();
    expect(shrinkLossless(new Uint8Array(deflateSync(Buffer.alloc(400 * 400 * 3 - 1))), dict, candidate, 150, fflate)).toBeUndefined();
  });

  it('is redone only when too large for the page, and only when smaller', () => {
    const data = new Uint8Array(deflateSync(Buffer.alloc(400 * 400 * 3, 7)));
    expect(shrinkLossless(data, dict, candidate, 400, fflate)).toBeUndefined();
    let seed = 1;
    const noisy = new Uint8Array(deflateSync(Buffer.from(Uint8Array.from({ length: 400 * 400 * 3 }, () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff))));
    expect(shrinkLossless(noisy, dict, candidate, 200, fflate)).toMatchObject({ dict: { '/Width': 200, '/Height': 200, '/Filter': '/FlateDecode' } });
  });
});

describe('a large JPG that would come out bigger', () => {
  it('is left as it was when saving it again at its new size makes it bigger', async () => {
    const canvas = createCanvas(400, 400);
    const context = canvas.getContext('2d');
    for (let index = 0; index < 400; index++) {
      context.fillStyle = `hsl(${(index * 37) % 360}, 70%, ${30 + (index % 40)}%)`;
      context.fillRect((index * 97) % 400, (index * 53) % 400, 40, 30);
    }
    const raw = new Uint8Array(await canvas.encode('jpeg', 10));
    const candidate: Candidate = { kind: 'jpeg', width: 400, height: 400, components: 3, deviceGray: false, predictor: false };
    const dict = { '/Subtype': '/Image', '/Width': 400, '/Height': 400, '/ColorSpace': '/DeviceRGB', '/BitsPerComponent': 8, '/Filter': '/DCTDecode' };
    // An encoder that writes far more than the old picture: quality 100 whatever it is asked for.
    const generous = { ...jpegCanvasMaker, jpeg: (target: unknown) => jpegCanvasMaker.jpeg(target, 1) };
    const scaled = createCanvas(300, 300);
    scaled.getContext('2d').drawImage(canvas, 0, 0, 300, 300);
    expect((await generous.jpeg(scaled)).length).toBeGreaterThan(raw.length);
    expect(await shrinkJpeg(raw, dict, candidate, 300, pictureDecoder, generous)).toBeUndefined();
    // The same picture with an encoder that writes less is made smaller.
    const sparing = { ...jpegCanvasMaker, jpeg: (target: unknown) => jpegCanvasMaker.jpeg(target, 0.01) };
    expect(await shrinkJpeg(raw, dict, candidate, 300, pictureDecoder, sparing)).toMatchObject({ dict: { '/Width': 300, '/Height': 300 } });
  });
});

describe('a large JPG in a file that needs a password', () => {
  it('is made smaller, and the file keeps its password and restrictions', async () => {
    const file = fixture('compress-password.pdf');
    await expect(compress(file)).rejects.toThrow();
    const { output } = await compress(file, [password]);
    expect((await qpdfOn(output!, ['--check'])).code).toBe(2);
    expect((await qpdfOn(output!, [`--password=${password}`, '--check'])).code).toBe(0);
    expect((await qpdfOn(output!, [`--password=${password}`, '--show-encryption'])).out).toBe((await qpdfOn(file, [`--password=${password}`, '--show-encryption'])).out);
    const [picture] = images((await streamsOf(output!, { given: password })).streams);
    expect(picture!.dict).toMatchObject({ '/Width': 600, '/Height': 600, '/Filter': '/DCTDecode' });
  });
});

describe('a JPG whose header disagrees with its dictionary', () => {
  it('is never decoded: a 20,000 by 20,000 frame under 100 by 100, or four colours under RGB', async () => {
    const before = pictureDecoder.calls;
    // A JPG frame that says 20,000 by 20,000, with nothing behind it.
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x4e, 0x20, 0x4e, 0x20, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]), Buffer.from([0xff, 0xda, 0, 12, 3, 1, 0, 2, 0, 3, 0, 0, 63, 0, 0x12, 0x34, 0xff, 0xd9])]);
    const small: Candidate = { kind: 'jpeg', width: 100, height: 100, components: 3, deviceGray: false, predictor: false };
    const dict = { '/Subtype': '/Image', '/Width': 100, '/Height': 100, '/ColorSpace': '/DeviceRGB', '/BitsPerComponent': 8, '/Filter': '/DCTDecode' };
    expect(await shrinkJpeg(new Uint8Array(big), dict, small, 50, pictureDecoder, jpegCanvasMaker)).toBeUndefined();
    const cmyk = new Uint8Array(readFileSync(join(__dirname, '../fixtures/pictures/cmyk.jpg')));
    expect(await shrinkJpeg(cmyk, { ...dict, '/Width': 200 }, { ...small, width: 200 }, 50, pictureDecoder, jpegCanvasMaker)).toBeUndefined();
    expect(pictureDecoder.calls).toBe(before);
  });

  it('in a file: never decoded, and the job fails at qpdf --check, which the file itself fails', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([36, 36]);
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x4e, 0x20, 0x4e, 0x20, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]), Buffer.from([0xff, 0xda, 0, 12, 3, 1, 0, 2, 0, 3, 0, 0, 63, 0, 0x12, 0x34, 0xff, 0xd9])]);
    const ref = doc.context.register(doc.context.stream(big, { Type: 'XObject', Subtype: 'Image', Width: 100, Height: 100, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' }));
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(36, 0, 0, 36, 0, 0), drawObject(page.node.newXObject('Im', ref)), popGraphicsState());
    const file = await doc.save();
    expect((await qpdfOn(file, ['--check'])).code).toBe(2);
    const before = pictureDecoder.calls;
    await expect(compress(file)).rejects.toThrow(/check/);
    expect(pictureDecoder.calls).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Real runs.

/** Each file in the test set and what compressing it gives: a smaller file, or none. */
const outcomes: [string, 'smaller' | 'none', string?][] = [
  ['text.pdf', 'smaller'],
  ['pages-500.pdf', 'smaller'],
  ['scanned.pdf', 'smaller'],
  ['password.pdf', 'smaller', password],
  ['restricted.pdf', 'smaller'],
  ['warning.pdf', 'smaller'],
  ['form.pdf', 'smaller'],
  ['mixed.pdf', 'smaller'],
  ['rich.pdf', 'smaller'],
  ['images.pdf', 'smaller'],
  ['tagged.pdf', 'smaller'],
  ['compress-scans.pdf', 'smaller'],
  ['compress-lossless.pdf', 'smaller'],
  ['compress-small-jpg.pdf', 'smaller'],
  ['compress-kinds.pdf', 'smaller'],
  ['compress-text.pdf', 'smaller'],
  ['compress-packed.pdf', 'none'],
  ['compress-jpeg-mismatch.pdf', 'smaller'],
  ['compress-flate-bomb.pdf', 'none'],
  ['compress-password.pdf', 'smaller', password],
];

describe('compressing every file in the test set', () => {
  it.each(outcomes)('%s: %s, passing qpdf --check, with the same pages', async (name, expected, given) => {
    const file = fixture(name);
    const { output, outputs } = await compress(file, [given]);
    if (expected === 'none') expect(outputs).toEqual([]);
    if (expected === 'smaller') expect(output).toBeDefined();
    if (!output) return;
    expect(output.length).toBeLessThanOrEqual(file.length * keepBelow);
    const check = await qpdfOn(output, [...passwordArgs(given), '--check']);
    expect(check.code, check.printed).toBe(0);
    const pages = async (bytes: Uint8Array) => (await qpdfOn(bytes, [...passwordArgs(given), '--show-npages'])).out.trim();
    expect(await pages(output)).toBe(await pages(file));
  }, 60_000);

  it('refuses damaged files and anything that is not a PDF', async () => {
    for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']) await expect(compress(fixture(name)), name).rejects.toThrow();
  });

  it('reads files as the other PDF tools do', async () => {
    await expect(inspect(fixture('password.pdf'), undefined, tools)).resolves.toEqual({ kind: 'needs-password' });
    await expect(inspect(fixture('compress-scans.pdf'), undefined, tools)).resolves.toEqual({ kind: 'ready', pages: 3 });
  });
});

describe('the scans', () => {
  it('scales each 300 pixels-to-the-inch scan to 150 across A4, with progress in real units that never goes back', async () => {
    const file = fixture('compress-scans.pdf');
    const before = pictureDecoder.calls;
    const { output, progress } = await compress(file);
    expect(pictureDecoder.calls - before).toBe(2);
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    expect(progress.map((step) => progressLine(step, 'Writing the compressed file'))).toEqual([
      'Reading the file',
      'Picture 1 of 3',
      'Picture 2 of 3',
      'Picture 3 of 3',
      'Writing the compressed file',
      'Writing the compressed file',
    ]);
    const fractions = progress.map(progressFraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(fractions.at(-2)).toBeCloseTo(0.8);
    const pictures = images((await streamsOf(output!)).streams).map((image) => image.dict);
    expect(pictures.map((dict) => [dict['/Width'], dict['/Height'], dict['/Filter'], dict['/ColorSpace'], dict['/DecodeParms']]).sort()).toEqual([
      [1240, 1754, '/DCTDecode', '/DeviceRGB', undefined],
      [1240, 1754, '/DCTDecode', '/DeviceRGB', undefined],
      [1240, 1754, '/FlateDecode', '/DeviceRGB', undefined],
    ]);
    // Long side 1754, as 150 pixels to the inch across A4's 841.89 points gives.
    expect(output!.length).toBeLessThan(file.length / 2);
  }, 60_000);

  it('drops the camera and place markers, and each page looks as it did; the grey scan still draws grey', async () => {
    const file = fixture('compress-scans.pdf');
    expect(Buffer.from(file).toString('latin1')).toContain('SECRET-CAMERA-MAKE');
    const { output } = await compress(file);
    const text = await decodedText(output!);
    expect(text).not.toMatch(/SECRET-|Exif/);
    for (const page of [1, 2, 3]) {
      const was = await drawn(file, page);
      const now = await drawn(output!, page);
      expect(meanDifference(was, now), `page ${page}`).toBeLessThan(4);
      if (page === 2) {
        let colour = 0;
        for (let at = 0; at < now.data.length; at += 4) colour = Math.max(colour, Math.abs(now.data[at]! - now.data[at + 1]!), Math.abs(now.data[at + 1]! - now.data[at + 2]!));
        expect(colour).toBeLessThanOrEqual(3);
      }
    }
  }, 120_000);
});

describe('pictures stored without loss', () => {
  it('a large screenshot is scaled to 150 across A4 and stored without loss again, looking as it did', async () => {
    const file = fixture('compress-lossless.pdf');
    const { output } = await compress(file);
    const [picture] = images((await streamsOf(output!)).streams);
    expect(picture!.dict).toMatchObject({ '/Width': 1754, '/Height': 987, '/Filter': '/FlateDecode', '/ColorSpace': '/DeviceRGB', '/BitsPerComponent': 8 });
    expect(picture!.dict['/DecodeParms']).toBeUndefined();
    expect(meanDifference(await drawn(file, 1), await drawn(output!, 1))).toBeLessThan(4);
  }, 60_000);
});

describe('pictures that are left alone', () => {
  it('CMYK, CCITT, an image mask, a colour-key mask, grey ICC and a soft mask with /Matte stay as they were; an RGB ICC picture is made smaller, its soft mask not', async () => {
    const file = fixture('compress-kinds.pdf');
    const before = { raw: await streamsOf(file), decoded: await streamsOf(file, { decoded: true }) };
    const { output } = await compress(file);
    const after = { raw: await streamsOf(output!), decoded: await streamsOf(output!, { decoded: true }) };
    const find = (streams: Stream[], test: (dict: Record<string, unknown>) => boolean) => {
      const found = streams.filter((stream) => test(stream.dict));
      expect(found).toHaveLength(1);
      return found[0]!;
    };
    const kinds: [string, (dict: Record<string, unknown>) => boolean, 'raw' | 'decoded'][] = [
      ['CMYK JPG', (dict) => dict['/ColorSpace'] === '/DeviceCMYK', 'raw'],
      ['CCITT scan', (dict) => dict['/Filter'] === '/CCITTFaxDecode', 'raw'],
      ['image mask', (dict) => dict['/ImageMask'] === true, 'decoded'],
      ['colour-key mask', (dict) => Array.isArray(dict['/Mask']), 'decoded'],
      ['soft mask with /Matte', (dict) => '/Matte' in dict, 'decoded'],
      ['picture over a /Matte mask', (dict) => dict['/ColorSpace'] === '/DeviceRGB' && '/SMask' in dict, 'decoded'],
      ['grey soft mask', (dict) => dict['/ColorSpace'] === '/DeviceGray' && dict['/BitsPerComponent'] === 8 && !('/Matte' in dict), 'decoded'],
    ];
    for (const [what, test, how] of kinds) {
      const was = find(images(before[how].streams), test);
      const now = find(images(after[how].streams), test);
      expect(shape(now.dict), what).toBe(shape(was.dict));
      expect(now.data.equals(was.data), what).toBe(true);
    }
    // The grey ICC picture, found by its profile's /N.
    const greyIcc = (side: typeof before.raw) =>
      find(images(side.streams), (dict) => Array.isArray(dict['/ColorSpace']) && (side.objects[`obj:${(dict['/ColorSpace'] as string[])[1]}`]?.stream?.dict['/N'] as number) === 1);
    expect(greyIcc(after.decoded).data.equals(greyIcc(before.decoded).data)).toBe(true);
    expect(greyIcc(after.raw).dict['/Width']).toBe(400);
    // The RGB ICC picture: made smaller, its profile, /Interpolate and soft mask kept.
    const rgbIcc = find(images(after.raw.streams), (dict) => Array.isArray(dict['/ColorSpace']) && (after.raw.objects[`obj:${(dict['/ColorSpace'] as string[])[1]}`]?.stream?.dict['/N'] as number) === 3);
    expect(rgbIcc.dict).toMatchObject({ '/Width': 150, '/Height': 150, '/Filter': '/FlateDecode', '/Interpolate': true });
    const mask = after.raw.objects[`obj:${rgbIcc.dict['/SMask'] as string}`]!.stream!.dict;
    expect(mask).toMatchObject({ '/Width': 400, '/Height': 400 });
  }, 60_000);

  it('JPGs whose header disagrees with the dictionary are never decoded and stay byte for byte', async () => {
    const file = fixture('compress-jpeg-mismatch.pdf');
    const was = images((await streamsOf(file)).streams);
    const before = pictureDecoder.calls;
    const { output } = await compress(file);
    expect(pictureDecoder.calls).toBe(before);
    expect(output).toBeDefined();
    const now = images((await streamsOf(output!)).streams);
    expect(now.map((image) => image.data.toString('base64')).sort()).toEqual(was.map((image) => image.data.toString('base64')).sort());
  }, 60_000);

  it('a JPEG 2000 picture stays byte for byte', async () => {
    const file = fixture('images.pdf');
    const { output } = await compress(file);
    expect(output).toBeDefined();
    const jpx = (streams: Stream[]) => images(streams).find((image) => image.dict['/Filter'] === '/JPXDecode')!.data;
    expect(jpx((await streamsOf(output!)).streams).equals(jpx((await streamsOf(file)).streams))).toBe(true);
  });
});

describe('what the file keeps', () => {
  it('text that was never compressed is compressed, and kept', async () => {
    const file = fixture('compress-text.pdf');
    const { output } = await compress(file);
    expect(output!.length).toBeLessThan(file.length / 4);
    expect(await decodedText(output!)).toContain('(Page 2, line 3: plain text in a stream that was never compressed.) Tj');
  });

  it('a file already packed gives no file', async () => {
    expect((await compress(fixture('compress-packed.pdf'))).outputs).toEqual([]);
  });

  it('rich.pdf keeps its bookmarks, link, attached file and title', async () => {
    const { output } = await compress(fixture('rich.pdf'));
    const outline = JSON.parse((await qpdfOn(output!, ['--json=2', '--json-key=outlines'])).out) as { outlines: { title: string; destpageposfrom1: number }[] };
    expect(outline.outlines.map((item) => [item.title, item.destpageposfrom1])).toEqual([['Chapter one', 1], ['Chapter two', 2]]);
    expect(Object.keys((JSON.parse((await qpdfOn(output!, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments)).toEqual(['note.txt']);
    const text = await decodedText(output!);
    expect(text).toContain('A note kept inside the PDF.');
    expect(text).toMatch(/\/Subtype \/Link/);
    expect(text).toContain('https://example.org/');
    expect((await PDFDocument.load(output!)).getTitle()).toBe('Bookmarks, a link and an attachment');
  });

  it('form.pdf keeps its fields and their values', async () => {
    const { output } = await compress(fixture('form.pdf'));
    const form = (await qpdfOn(output!, ['--json=2', '--json-key=acroform'])).out;
    expect(form).toContain('"fullname": "name"');
    expect(form).toContain('"fullname": "agree"');
    expect(form).toContain('Sample text');
  });

  it('tagged.pdf keeps everything', async () => {
    const { output } = await compress(fixture('tagged.pdf'));
    const text = await decodedText(output!);
    for (const kept of ['SECRET-PAGE-TWO-TEXT', 'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-NOTE', 'SECRET-LINK', '/StructTreeRoot']) expect(text, kept).toContain(kept);
    // Field values are written as UTF-16, so they are read through qpdf's form JSON.
    expect((await qpdfOn(output!, ['--json=2', '--json-key=acroform'])).out).toContain('SECRET-TAGGED-VALUE');
  });

  it('password.pdf is written with the same password and restrictions; restricted.pdf keeps its restrictions with no password', async () => {
    await expect(compress(fixture('password.pdf'))).rejects.toThrow();
    const { output } = await compress(fixture('password.pdf'), [password]);
    expect((await qpdfOn(output!, ['--check'])).code).toBe(2);
    expect((await qpdfOn(output!, ['--password=wrong', '--check'])).code).toBe(2);
    expect((await qpdfOn(output!, [`--password=${password}`, '--show-encryption'])).out).toBe((await qpdfOn(fixture('password.pdf'), [`--password=${password}`, '--show-encryption'])).out);
    const restricted = (await compress(fixture('restricted.pdf'))).output!;
    const shown = (await qpdfOn(restricted, ['--show-encryption'])).out;
    expect(shown).toBe((await qpdfOn(fixture('restricted.pdf'), ['--show-encryption'])).out);
    expect(shown).toMatch(/print/i);
    expect((await qpdfOn(restricted, ['--check'])).code).toBe(0);
  });

  it('is written with the lossless options and never decrypted', () => {
    expect(losslessOptions).toEqual(['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--remove-unreferenced-resources=yes']);
    expect(losslessOptions.join(' ')).not.toContain('decrypt');
  });
});

describe('hostile files', () => {
  it('a picture whose data inflates to 100 MB is inflated no further than its size and left as it was', async () => {
    const file = fixture('compress-flate-bomb.pdf');
    inflated.bytes = 0;
    const { outputs } = await compress(file);
    expect(inflated.bytes).toBeLessThan(400 * 400 * 3 + 2 * 1024 * 1024);
    // Left alone, the file is not made 1% smaller, so no file is given.
    expect(outputs).toEqual([]);
  }, 60_000);

  it('an attachment that inflates to 1 GB is never decoded by the pictures step, and the job ends', async () => {
    const file = fixture('compress-bomb-attachment.pdf');
    inflated.calls = 0;
    const { outputs } = await compress(file);
    expect(inflated.calls).toBe(0);
    expect(outputs).toEqual([]);
  }, 180_000);

  it('a file whose JSON of dictionaries is over 64 MB skips the pictures step, and gives no smaller file', async () => {
    const file = fixture('compress-json-bomb.pdf');
    inflated.calls = 0;
    const { outputs, progress } = await compress(file);
    expect(inflated.calls).toBe(0);
    expect(progress.some((step) => step.stage === 'working')).toBe(false);
    // Its picture is left at 400 by 400, and the file written again is not 1% smaller.
    expect(outputs).toEqual([]);
  }, 180_000);
});
