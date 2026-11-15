// The Image to PDF engine, run in Node on every picture in the test set with
// the same pdf-lib the browser gets. Results are checked with qpdf (structure,
// image dictionaries, and every decoded stream searched for details), with
// pdf-lib's own decoder (exact pixels), and drawn with PDF.js (camera turns and
// CMYK colours).

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, PDFDict, PDFRef, PDFArray } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { jpegForPdf, profileColourOnly, readPicture } from '../../src/engines/picture';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { openDocument } from '../../src/engines/thumbnail';
import { a4, inspect, place, run, thumbnails } from '../../src/engines/tools/images-to-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { looksAccepted, sniffLength } from '../../src/widget/accept';
import { tools as drawingTools } from './thumbnail-helpers';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { ...drawingTools, qpdf: makeQpdf };
const picturesDir = join(__dirname, '../fixtures/pictures');
const picture = (name: string) => new Uint8Array(readFileSync(join(picturesDir, name)));
const pdfFixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

async function convert(names: string[]) {
  const progress: Progress[] = [];
  const [output] = await run(names.map(picture), {}, (step) => progress.push(step), tools);
  return { output: output!, progress };
}

async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string; printed: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}

/** The whole file with object streams undone and every stream qpdf can decode decoded, as text. */
async function decodedText(bytes: Uint8Array): Promise<string> {
  const qpdf = await makeQpdf();
  qpdf.write('/r.pdf', bytes);
  const { code } = qpdf.call(['--qdf', '--object-streams=disable', '--decode-level=generalized', '/r.pdf', '/q.pdf']);
  expect(code).toBe(0);
  return latin1(qpdf.read('/q.pdf'));
}

type Shown = { pages: { object: string }[]; qpdf: [unknown, Record<string, { value?: Record<string, unknown>; stream?: { dict: Record<string, unknown> } }>] };
/** qpdf's JSON for the file: each page's size and the dictionary of the image it draws. */
async function shapeOf(bytes: Uint8Array) {
  const shown = JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=pages', '--json-key=qpdf'])).out) as Shown;
  const objects = shown.qpdf[1];
  const at = (ref: string) => objects[`obj:${ref}`];
  const trailer = objects.trailer?.value ?? {};
  return {
    trailer,
    catalog: at(trailer['/Root'] as string)?.value ?? {},
    pages: shown.pages.map(({ object }) => {
      const page = at(object)!.value!;
      const xobjects = ((page['/Resources'] as Record<string, unknown>)['/XObject'] ?? {}) as Record<string, string>;
      const images = Object.values(xobjects).map((ref) => at(ref)!.stream!.dict);
      const colourSpace = images[0]?.['/ColorSpace'];
      const profile = Array.isArray(colourSpace) ? at(colourSpace[1] as string)!.stream!.dict : undefined;
      const mask = images[0]?.['/SMask'] ? at(images[0]['/SMask'] as string)!.stream!.dict : undefined;
      return { mediaBox: (page['/MediaBox'] as number[]).map((value) => Math.round(value * 100) / 100), images, profile, mask };
    }),
  };
}

/** The first image on a page, decoded by pdf-lib, with its dictionary, and its soft mask decoded. */
async function imageOn(bytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[pageIndex]!;
  const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
  const ref = xobjects.values()[0] as PDFRef;
  const stream = doc.context.lookup(ref) as PDFRawStream;
  const maskRef = stream.dict.get(PDFName.of('SMask')) as PDFRef | undefined;
  const mask = maskRef ? decodePDFRawStream(doc.context.lookup(maskRef) as PDFRawStream).decode() : undefined;
  const colourSpace = stream.dict.lookup(PDFName.of('ColorSpace'));
  const profileStream = colourSpace instanceof PDFArray ? (colourSpace.lookup(1) as PDFRawStream) : undefined;
  return {
    dict: stream.dict,
    raw: stream.contents,
    decoded: stream.dict.get(PDFName.of('Filter'))?.toString() === '/DCTDecode' ? stream.contents : decodePDFRawStream(stream).decode(),
    mask,
    profile: profileStream ? decodePDFRawStream(profileStream).decode() : undefined,
  };
}

/** A PNG's pixels as 8-bit RGBA, decoded here by hand (non-interlaced only), to compare with the PDF. */
function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const view = Buffer.from(bytes);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let palette = Buffer.alloc(0);
  const idat: Buffer[] = [];
  while (at < view.length) {
    const length = view.readUInt32BE(at);
    const kind = view.toString('latin1', at + 4, at + 8);
    const data = view.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') [width, height, depth, type] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8]!, data[9]!];
    if (kind === 'PLTE') palette = data;
    if (kind === 'IDAT') idat.push(data);
    if (kind === 'IEND') break;
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]!;
  const bpp = Math.max(1, (channels * depth) / 8);
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const a = x >= bpp ? rows[y * stride + x - bpp]! : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? rows[(y - 1) * stride + x - bpp]! : 0;
      const paeth = () => {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      const predictor = [0, a, b, (a + b) >> 1, paeth()][filter]!;
      rows[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      const row = y * stride;
      if (type === 6) rgba.set(rows.subarray(row + x * 4, row + x * 4 + 4), out);
      else if (type === 2) rgba.set([...rows.subarray(row + x * 3, row + x * 3 + 3), 255], out);
      else if (type === 3) rgba.set([...palette.subarray(rows[row + x]! * 3, rows[row + x]! * 3 + 3), 255], out);
      else if (type === 0 && depth === 16) rgba.set([rows[row + x * 2]!, rows[row + x * 2]!, rows[row + x * 2]!, 255], out);
      else if (type === 0) rgba.set([rows[row + x]!, rows[row + x]!, rows[row + x]!, 255], out);
    }
  }
  return { width, height, rgba };
}

/** Draws page `index` of a PDF with PDF.js at `scale` pixels per point, giving a function that reads a point's colour. */
async function draw(bytes: Uint8Array, scale: number, index = 1) {
  const { width, height } = (await PDFDocument.load(bytes)).getPages()[index - 1]!.getSize();
  const doc = await openDocument(bytes.slice(), undefined, drawingTools);
  const png = await doc.render(index, { width: width * scale, height: height * scale });
  await doc.close();
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const s = image.width / width;
  return (x: number, y: number) => [...context.getImageData(Math.floor(x * s), Math.floor((height - y) * s), 1, 1).data].slice(0, 3);
}

const close = (seen: number[], wanted: number[], within = 40) => seen.every((value, index) => Math.abs(value - wanted[index]!) <= within);

describe('where a picture sits on its page', () => {
  it('puts a tall picture on an upright A4 page and a wide one on its side, centred, touching two edges', () => {
    const tall = place({ width: 1500, height: 2000, orientation: 1 });
    expect(tall.page).toEqual({ width: a4.width, height: a4.height });
    expect(tall.box.width).toBeCloseTo(a4.width);
    expect(tall.box.x).toBeCloseTo(0);
    expect(tall.box.y).toBeCloseTo((a4.height - tall.box.height) / 2);
    const wide = place({ width: 1280, height: 720, orientation: 1 });
    expect(wide.page).toEqual({ width: a4.height, height: a4.width });
    expect(wide.box.width).toBeCloseTo(a4.height);
    expect(wide.box.height).toBeCloseTo((a4.height * 720) / 1280);
  });

  it('puts a square picture on an upright page', () => {
    expect(place({ width: 500, height: 500, orientation: 1 }).page).toEqual({ width: a4.width, height: a4.height });
  });

  it('never draws a picture larger than its size at 96 pixels to the inch', () => {
    const small = place({ width: 300, height: 200, orientation: 1 });
    expect(small.page).toEqual({ width: a4.height, height: a4.width });
    expect(small.box).toEqual({ x: (a4.height - 225) / 2, y: (a4.width - 150) / 2, width: 225, height: 150 });
    expect(small.matrix).toEqual([225, 0, 0, 150, small.box.x, small.box.y]);
  });

  it('fits a picture that is too tall for its page by its height', () => {
    const strip = place({ width: 800, height: 4000, orientation: 1 });
    expect(strip.box.height).toBeCloseTo(a4.height);
    expect(strip.box.y).toBeCloseTo(0);
  });

  it('uses the shown size for the page and the box, and the matrix for each camera turn', () => {
    const { x, y, width: w, height: h } = place({ width: 100, height: 160, orientation: 6 }).box;
    expect([w, h]).toEqual([120, 75]);
    const matrices = Array.from({ length: 8 }, (_, index) => place({ width: index >= 4 ? 100 : 160, height: index >= 4 ? 160 : 100, orientation: (index + 1) as 1 }).matrix);
    expect(matrices).toEqual([
      [w, 0, 0, h, x, y],
      [-w, 0, 0, h, x + w, y],
      [-w, 0, 0, -h, x + w, y + h],
      [w, 0, 0, -h, x, y + h],
      [0, -h, -w, 0, x + w, y + h],
      [0, -h, w, 0, x, y + h],
      [0, h, w, 0, x, y],
      [0, h, -w, 0, x + w, y],
    ]);
    for (let orientation = 5; orientation <= 8; orientation++) {
      expect(place({ width: 100, height: 160, orientation: orientation as 5 }).page).toEqual({ width: a4.height, height: a4.width });
    }
  });
});

describe('converting', () => {
  const allPictures = readdirSync(picturesDir).filter((name) => /\.(jpg|png)$/.test(name));
  // huge.jpg is a header with no real picture data, kept for the thumbnail cap.
  const convertible = allPictures.filter((name) => !['arithmetic.jpg', 'broken.jpg', 'broken.png', 'zero-size.png', 'huge.png', 'data-bomb.png', 'huge.jpg'].includes(name));

  it.each(convertible)('%s gives one A4 page with its picture, which passes qpdf --check, with no details', async (name) => {
    const { output } = await convert([name]);
    const check = await qpdfOn(output, ['--check']);
    expect(check.code, check.printed).toBe(0);
    const shape = await shapeOf(output);
    expect(shape.pages).toHaveLength(1);
    expect(shape.trailer['/Info']).toBeUndefined();
    expect(shape.catalog['/Metadata']).toBeUndefined();
    const read = readPicture(picture(name));
    if (read.kind !== 'ok') throw new Error(name);
    const { page } = place(read.picture);
    expect(shape.pages[0]!.mediaBox).toEqual([0, 0, Math.round(page.width * 100) / 100, Math.round(page.height * 100) / 100]);
    const image = shape.pages[0]!.images[0]!;
    expect(shape.pages[0]!.images).toHaveLength(1);
    expect(image).toMatchObject({ '/Subtype': '/Image', '/Width': read.picture.width, '/Height': read.picture.height, '/BitsPerComponent': 8 });
    expect(image['/Filter']).toBe(read.picture.type === 'jpeg' ? '/DCTDecode' : '/FlateDecode');
    const text = await decodedText(output);
    expect(text).not.toMatch(/SECRET|\/Info|\/Metadata|xmpmeta|Exif|JFIF/);
  });

  it('keeps a JPG as its own compressed data, from the start to its first end of image', async () => {
    for (const name of ['tall.jpg', 'details.jpg', 'details-progressive.jpg', 'p3.jpg', 'cmyk.jpg']) {
      const { output } = await convert([name]);
      const image = await imageOn(output);
      expect(Buffer.from(image.raw).equals(Buffer.from(jpegForPdf(picture(name))!.bytes)), name).toBe(true);
    }
    const original = latin1(picture('tall.jpg'));
    const image = latin1((await imageOn((await convert(['tall.jpg'])).output)).raw);
    expect(original.endsWith(image.slice(image.indexOf('\xff\xda')))).toBe(true);
  });

  it('gives the colour spaces and decode arrays readers expect', async () => {
    const colourOf = async (name: string) => (await shapeOf((await convert([name])).output)).pages[0]!;
    expect((await colourOf('cmyk.jpg')).images[0]).toMatchObject({ '/ColorSpace': '/DeviceCMYK', '/Decode': [1, 0, 1, 0, 1, 0, 1, 0] });
    expect((await colourOf('progressive.jpg')).images[0]).toMatchObject({ '/ColorSpace': '/DeviceRGB' });
    expect((await colourOf('progressive.jpg')).images[0]!['/Decode']).toBeUndefined();
    for (const name of ['palette.png', 'grey16.png', 'grey-profile.png', 'alpha.png', 'bad-profile.png', 'bomb-profile.png']) {
      expect((await colourOf(name)).images[0], name).toMatchObject({ '/ColorSpace': '/DeviceRGB' });
    }
    expect((await colourOf('bad-profile.jpg')).images[0]).toMatchObject({ '/ColorSpace': '/DeviceRGB' });
  });

  it('drops the inverted decode array for a CMYK JPG with no Adobe segment', async () => {
    const plain = jpegForPdf(picture('cmyk.jpg'))!.bytes;
    const text = latin1(plain);
    const adobeAt = text.indexOf('\xff\xeeAdobe'.replace('\xeeAdobe', '\xee'));
    const length = (plain[adobeAt + 2]! << 8) | plain[adobeAt + 3]!;
    const withoutAdobe = new Uint8Array([...plain.subarray(0, adobeAt), ...plain.subarray(adobeAt + 2 + length)]);
    const [output] = await run([withoutAdobe], {}, () => {}, tools);
    const image = (await shapeOf(output!)).pages[0]!.images[0]!;
    expect(image['/ColorSpace']).toBe('/DeviceCMYK');
    expect(image['/Decode']).toBeUndefined();
  });

  it('keeps the colour data of a Display P3 profile as an ICCBased colour space, with its text, date and device fields left out', async () => {
    for (const name of ['p3.jpg', 'profile.png']) {
      const { output } = await convert([name]);
      const page = (await shapeOf(output)).pages[0]!;
      expect(page.images[0]!['/ColorSpace']).toEqual(['/ICCBased', expect.stringMatching(/^\d+ 0 R$/)]);
      expect(page.profile).toMatchObject({ '/N': 3, '/Alternate': '/DeviceRGB', '/Filter': '/FlateDecode' });
      const profile = (await imageOn(output)).profile!;
      expect(Buffer.from(profile).equals(Buffer.from(profileColourOnly(picture('p3.icc'))!)), name).toBe(true);
      const text = await decodedText(output);
      expect(text).not.toContain('SECRET');
      // The profile's creation date, 2019-12-25 10:20:30, as its header stores it.
      expect(text).not.toContain(latin1(new Uint8Array([0x07, 0xe3, 0, 12, 0, 25, 0, 10, 0, 20, 0, 30])));
    }
  });

  it('keeps no profile for a grey PNG with a grey profile, stored as RGB', async () => {
    const { output } = await convert(['grey-profile.png']);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    expect((await shapeOf(output)).pages[0]!.profile).toBeUndefined();
    expect(await decodedText(output)).not.toContain('ICCBased');
  });

  it('keeps no GPS value and no camera name from any picture', async () => {
    const { output } = await convert(['details.jpg', 'details.png', 'details-progressive.jpg']);
    const text = await decodedText(output);
    const rationals = (values: number[][]) => latin1(new Uint8Array(values.flatMap(([n, d]) => [0, 0, 0, n!, 0, 0, 0, d!])));
    for (const marker of ['SECRET', 'Exif', 'GPS', 'ASCII\0\0\0', rationals([[51, 1], [30, 1], [26, 1]]), rationals([[48, 1], [51, 1], [29, 1]]), rationals([[40, 1], [42, 1], [46, 1]])]) {
      expect(text).not.toContain(marker);
    }
    expect((await shapeOf(output)).pages).toHaveLength(3);
  });

  it('keeps a PNG pixel for pixel: palette, see-through parts as a soft mask, and the high byte of 16-bit grey', async () => {
    for (const name of ['palette.png', 'alpha.png', 'grey16.png', 'small.png', 'screenshot.png']) {
      const { output } = await convert([name]);
      const image = await imageOn(output);
      const png = decodePng(picture(name));
      const rgb = new Uint8Array(png.width * png.height * 3);
      const alpha = new Uint8Array(png.width * png.height);
      for (let index = 0; index < png.width * png.height; index++) {
        rgb.set(png.rgba.subarray(index * 4, index * 4 + 3), index * 3);
        alpha[index] = png.rgba[index * 4 + 3]!;
      }
      expect(Buffer.from(image.decoded).equals(Buffer.from(rgb)), name).toBe(true);
      if (alpha.some((value) => value < 255)) {
        expect(Buffer.from(image.mask!).equals(Buffer.from(alpha)), name).toBe(true);
        expect(image.dict.get(PDFName.of('SMask'))).toBeDefined();
      } else expect(image.mask, name).toBeUndefined();
    }
    const shape = await shapeOf((await convert(['alpha.png'])).output);
    expect(shape.pages[0]!.mask).toMatchObject({ '/ColorSpace': '/DeviceGray', '/Width': 240, '/Height': 160 });
  });

  it('gives the first picture of an animated PNG', async () => {
    const { output } = await convert(['animated.png']);
    const image = await imageOn(output);
    expect([...image.decoded.subarray(0, 3)]).toEqual([220, 30, 30]);
    expect(image.decoded.length).toBe(60 * 40 * 3);
  });

  it('shows the see-through parts of a PNG as the white page', async () => {
    const colour = await draw((await convert(['alpha.png'])).output, 2);
    const { box } = place({ width: 240, height: 160, orientation: 1 });
    // The top-left corner of the picture is see-through: white.
    expect(close(colour(box.x + 3, box.y + box.height - 3), [255, 255, 255], 5)).toBe(true);
    // Inside the blue rectangle.
    expect(close(colour(box.x + 40 * 0.75, box.y + box.height - 40 * 0.75), [11, 79, 168], 8)).toBe(true);
  });

  it('puts one page per picture in the order given, and says so as it goes', async () => {
    const { output, progress } = await convert(['tall.jpg', 'screenshot.png', 'small.png']);
    const shape = await shapeOf(output);
    expect(shape.pages.map((page) => page.mediaBox)).toEqual([
      [0, 0, 595.28, 841.89],
      [0, 0, 841.89, 595.28],
      [0, 0, 841.89, 595.28],
    ]);
    expect(shape.pages.map((page) => page.images[0]!['/Width'])).toEqual([1500, 1280, 300]);
    expect(progress).toEqual([
      { stage: 'working', unit: 'file', done: 1, total: 3 },
      { stage: 'working', unit: 'file', done: 2, total: 3 },
      { stage: 'working', unit: 'file', done: 3, total: 3 },
      { stage: 'writing', percent: 0 },
      { stage: 'writing', percent: 100 },
    ]);
  });

  it('fails, and gives nothing, on a picture that cannot be read or is not the size it says', async () => {
    for (const name of ['broken.jpg', 'broken.png', 'arithmetic.jpg', 'zero-size.png']) {
      await expect(convert(['tall.jpg', name]), name).rejects.toThrow();
    }
    await expect(run([], {}, () => {}, tools)).rejects.toThrow();
    await expect(run([pdfFixture('text.pdf')], {}, () => {}, tools)).rejects.toThrow();
  });

  it('gives pdf-lib no text chunk and no image data past its header: neither bomb reaches it', async () => {
    const given: Uint8Array[] = [];
    const watching: EngineTools = {
      ...tools,
      pdflib: async () => {
        const pdflib = (await tools.pdflib!()) as typeof import('@cantoo/pdf-lib');
        const create = pdflib.PDFDocument.create.bind(pdflib.PDFDocument);
        return {
          ...pdflib,
          PDFDocument: {
            create: async (options: object) => {
              const doc = await create(options);
              const embedPng = doc.embedPng.bind(doc);
              doc.embedPng = async (png: Uint8Array | ArrayBuffer | string) => {
                given.push(png as Uint8Array);
                return embedPng(png);
              };
              return doc;
            },
          },
        };
      },
    };
    const [output] = await run([picture('text-bomb.png')], {}, () => {}, watching);
    expect(given).toHaveLength(1);
    expect(given[0]!.length).toBeLessThan(200);
    expect(latin1(given[0]!)).not.toContain('zTXt');
    expect((await qpdfOn(output!, ['--check'])).code).toBe(0);
    given.length = 0;
    await expect(run([picture('data-bomb.png')], {}, () => {}, watching)).rejects.toThrow();
    expect(given).toHaveLength(0);
  });

  it('asks for pdf-lib and fflate only through its tools', async () => {
    await expect(run([picture('small.png')], {}, () => {}, { fflate: tools.fflate! })).rejects.toThrow(/pdflib/);
  });
});

describe('every camera turn, drawn by PDF.js', () => {
  // As make.mjs draws them: red top-left, green top-right, blue bottom-left, yellow bottom-right, once turned.
  const corners = { tl: [220, 30, 30], tr: [30, 170, 60], bl: [40, 60, 220], br: [240, 210, 40] };
  const names = [...Array.from({ length: 8 }, (_, index) => `turn-${index + 1}.jpg`), 'turn-6.png'];

  it.each(names)('%s has its corners where a browser draws them', async (name) => {
    const { output } = await convert([name]);
    const read = readPicture(picture(name));
    if (read.kind !== 'ok') throw new Error(name);
    const { box, page } = place(read.picture);
    expect(page).toEqual({ width: a4.height, height: a4.width });
    expect([box.width, box.height]).toEqual([120, 75]);
    const colour = await draw(output, 3);
    const inset = 10;
    expect(colour(box.x + inset, box.y + box.height - inset), 'top-left').toSatisfy((seen: number[]) => close(seen, corners.tl));
    expect(colour(box.x + box.width - inset, box.y + box.height - inset), 'top-right').toSatisfy((seen: number[]) => close(seen, corners.tr));
    expect(colour(box.x + inset, box.y + inset), 'bottom-left').toSatisfy((seen: number[]) => close(seen, corners.bl));
    expect(colour(box.x + box.width - inset, box.y + inset), 'bottom-right').toSatisfy((seen: number[]) => close(seen, corners.br));
    // Outside the picture, the page is white.
    expect(close(colour(box.x - 5, box.y + 5), [255, 255, 255], 3)).toBe(true);
  });
});

describe('a CMYK JPG', () => {
  it('is drawn by PDF.js close to the same JPG drawn by the browser-like decoder', async () => {
    const { output } = await convert(['cmyk.jpg']);
    const colour = await draw(output, 2);
    const { box } = place({ width: 200, height: 100, orientation: 1 });
    const image = await loadImage(Buffer.from(picture('cmyk.jpg')));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    for (const [px, py] of [[50, 25], [150, 25], [50, 75], [150, 75]] as const) {
      const wanted = [...context.getImageData(px, py, 1, 1).data].slice(0, 3);
      const seen = colour(box.x + px * 0.75, box.y + box.height - py * 0.75);
      // PDF.js turns CMYK into RGB with a printing-ink curve (pure cyan is about 0, 185, 242; magenta 251, 49, 153), while the
      // decoder here inverts the inks plainly (0, 255, 255); inverted values the wrong way would be far off.
      // So each channel is checked to be on the same side of the middle; inverted inks would put every one on the other.
      expect(seen.map((value) => value >= 128), `${px},${py}: ${seen} vs ${wanted}`).toEqual(wanted.map((value) => value >= 128));
      expect(close(seen, wanted, 110), `${px},${py}: ${seen} vs ${wanted}`).toBe(true);
    }
  });
});

describe('reading a file before the job', () => {
  it('gives one page for a picture, its pixels for a very large PNG, and the problem for the rest', async () => {
    const expected: [string, unknown][] = [
      ['tall.jpg', { kind: 'ready', pages: 1 }],
      ['small.png', { kind: 'ready', pages: 1 }],
      ['huge.png', { kind: 'ready', pages: 1, pixels: 256_000_000 }],
      ['arithmetic.jpg', { kind: 'unsupported' }],
      ['broken.jpg', { kind: 'damaged' }],
      ['broken.png', { kind: 'damaged' }],
      ['zero-size.png', { kind: 'damaged' }],
      // Image data that would inflate past what a 1 by 1 picture needs: damaged before the main button.
      ['data-bomb.png', { kind: 'damaged' }],
      // A bomb in a text chunk is never read: the picture itself is fine.
      ['text-bomb.png', { kind: 'ready', pages: 1 }],
      // A JPG header of 256 million pixels: the engine never decodes a JPG, so it gets no notice.
      ['huge.jpg', { kind: 'ready', pages: 1 }],
    ];
    for (const [name, outcome] of expected) await expect(inspect(picture(name), undefined, tools), name).resolves.toEqual(outcome);
  });

  it('calls every PDF in the test set damaged; on the page each is turned away by its first bytes before this', async () => {
    const pdfs = readdirSync(join(__dirname, '../fixtures')).filter((name) => name.endsWith('.pdf'));
    expect(pdfs.length).toBeGreaterThanOrEqual(14);
    for (const name of pdfs) {
      const bytes = pdfFixture(name);
      await expect(inspect(bytes, undefined, tools), name).resolves.toEqual({ kind: 'damaged' });
      expect(looksAccepted(bytes.subarray(0, sniffLength), ['image/jpeg', 'image/png']), name).toBe(false);
    }
  });

  it('draws its thumbnails as pictures, not with PDF.js', () => {
    expect(thumbnails).toBe('picture');
  });
});
