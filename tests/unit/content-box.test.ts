// Measuring where a page's content is (`measure` in src/engines/thumbnail.ts), for Crop PDF: through the real
// PDF.js and the real helper data, with @napi-rs/canvas in place of the worker's OffscreenCanvas, on fixtures
// and on files made here. No request may be made: `fetch` is replaced by one that throws and records.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts, degrees, rgb, type PDFPage } from '@cantoo/pdf-lib';
import { inkPixels, measurePixels, openDocument, smallPageSide, type Box, type CanvasMaker, type Measured } from '../../src/engines/thumbnail';
import type { EngineTools } from '../../src/engines/types';
import { fixture, jpegCanvasMaker, tools } from './thumbnail-helpers';
import { bigPicturePage } from './crop-helpers';

const fetched: unknown[] = [];
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = ((...args: unknown[]) => {
    fetched.push(args[0]);
    throw new Error('No request may be made while measuring.');
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  expect(fetched).toEqual([]);
});

/** Measures every page of a file, recording each canvas made and every pixel read. */
async function measureAll(bytes: Uint8Array, given: EngineTools = tools): Promise<Measured[]> {
  const doc = await openDocument(bytes.slice(), undefined, given);
  try {
    const results: Measured[] = [];
    for (let page = 1; page <= doc.pages; page++) results.push(await doc.measure(page));
    return results;
  } finally {
    await doc.close();
  }
}

/** Tools whose canvas maker records the size of each canvas and the pixels read. */
function recording() {
  const made: { width: number; height: number }[] = [];
  let read = 0;
  const canvas: CanvasMaker = {
    ...jpegCanvasMaker,
    create(width, height) {
      made.push({ width, height });
      return jpegCanvasMaker.create(width, height);
    },
    pixels(canvas, x, y, width, height) {
      read += width * height;
      return jpegCanvasMaker.pixels(canvas, x, y, width, height);
    },
  };
  return { made, read: () => read, tools: { ...tools, canvas: async () => canvas } as EngineTools };
}

async function build(make: (doc: PDFDocument) => Promise<void> | void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  await make(doc);
  return doc.save({ useObjectStreams: false });
}

const boxOf = (measured: Measured): Box => {
  if (measured.kind !== 'box') throw new Error(`Expected a box, got ${measured.kind}.`);
  return measured.box;
};

/** True when `outer` holds `inner`, give or take `slack` in the page's units. */
const holds = (outer: Box, inner: Box, slack = 0) =>
  outer[0] <= inner[0] + slack && outer[1] <= inner[1] + slack && outer[2] >= inner[2] - slack && outer[3] >= inner[3] - slack;
const close = (a: Box, b: Box, slack: number) => a.every((value, index) => Math.abs(value - b[index]!) <= slack);

function link(doc: PDFDocument, page: PDFPage, rect: number[], extra: Record<string, unknown> = {}) {
  const annot = doc.context.register(
    doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of('https://example.com/') }, ...extra }),
  );
  page.node.addAnnot(annot);
}

describe('measure', () => {
  it('holds every line of text.pdf, and leaves its wide margins out', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const bytes = fixture('text.pdf');
    const measured = await measureAll(bytes);
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    for (let page = 1; page <= doc.numPages; page++) {
      const box = boxOf(measured[page - 1]!);
      const content = await (await doc.getPage(page)).getTextContent();
      for (const item of content.items as { str: string; transform: number[]; width: number }[]) {
        if (!item.str.trim()) continue;
        const [x, y] = [item.transform[4]!, item.transform[5]!];
        expect(x).toBeGreaterThanOrEqual(box[0] - 1);
        expect(x + item.width).toBeLessThanOrEqual(box[2] + 1);
        expect(y).toBeGreaterThanOrEqual(box[1] - 1);
        expect(y).toBeLessThanOrEqual(box[3]);
      }
      // A4 with margins: the box is well inside the page.
      expect(box[0]).toBeGreaterThan(20);
      expect(box[2]).toBeLessThan(575);
    }
    await task.destroy();
  });

  it('finds a mark in the page’s own units whatever the turn, paper box and user unit', async () => {
    const mark: Box = [130, 260, 190, 330];
    const cases = [
      { rotate: 0, media: [0, 0, 400, 500], unit: 1 },
      { rotate: 90, media: [0, 0, 400, 500], unit: 1 },
      { rotate: 270, media: [0, 0, 400, 500], unit: 1 },
      { rotate: 180, media: [0, 0, 400, 500], unit: 1 },
      { rotate: 90, media: [50, 100, 450, 600], unit: 2 },
      // A reversed paper box is read as its normalised box.
      { rotate: 0, media: [400, 500, 0, 0], unit: 1 },
    ];
    const bytes = await build((doc) => {
      for (const each of cases) {
        const page = doc.addPage([400, 500]);
        page.node.set(PDFName.of('MediaBox'), doc.context.obj(each.media));
        page.setRotation(degrees(each.rotate));
        if (each.unit !== 1) page.node.set(PDFName.of('UserUnit'), PDFNumber.of(each.unit));
        page.drawRectangle({ x: mark[0], y: mark[1], width: mark[2] - mark[0], height: mark[3] - mark[1], color: rgb(0, 0, 0) });
      }
    });
    const measured = await measureAll(bytes);
    measured.forEach((each, index) => {
      // One pixel is a point as shown, so a user unit of 2 makes it half a unit; the box is grown by a pixel.
      expect(close(boxOf(each), mark, 1.6), `case ${index}: ${JSON.stringify(each)}`).toBe(true);
    });
    expect((measured[4] as { shown: { rotate: number; userUnit: number } }).shown).toMatchObject({ rotate: 90, userUnit: 2 });
  });

  it('measures the four pages of mixed.pdf inside each page’s shown box', async () => {
    const measured = await measureAll(fixture('mixed.pdf'));
    expect(measured).toHaveLength(4);
    for (const each of measured) {
      expect(each.kind).toBe('box');
      if (each.kind === 'box') expect(holds(each.shown.view, each.box)).toBe(true);
    }
  });

  it('measures inside a crop box inherited from the page tree', async () => {
    const bytes = await build((doc) => {
      const page = doc.addPage([600, 800]);
      page.drawRectangle({ x: 10, y: 10, width: 580, height: 780, color: rgb(0, 0, 0) });
      doc.catalog.Pages().set(PDFName.of('CropBox'), doc.context.obj([100, 100, 500, 700]));
    });
    const [only] = await measureAll(bytes);
    expect(only!.kind).toBe('box');
    if (only!.kind === 'box') {
      expect(only.shown.view).toEqual([100, 100, 500, 700]);
      expect(holds([100, 100, 500, 700], only.box)).toBe(true);
    }
  });

  it('calls a page with nothing drawn blank, and paper of grey 240 white', async () => {
    const bytes = await build((doc) => {
      doc.addPage([595, 842]);
      const grey = doc.addPage([595, 842]);
      grey.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(240 / 255, 240 / 255, 240 / 255) });
    });
    expect((await measureAll(bytes)).map((each) => each.kind)).toEqual(['blank', 'blank']);
  });

  it('counts paper of grey 236 as content from edge to edge, and light lines and hairlines as ink', async () => {
    const bytes = await build((doc) => {
      const grey = doc.addPage([595, 842]);
      grey.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(236 / 255, 236 / 255, 236 / 255) });
      const light = doc.addPage([595, 842]);
      light.drawLine({ start: { x: 40, y: 30 }, end: { x: 555, y: 30 }, thickness: 1, color: rgb(0xd9 / 255, 0xd6 / 255, 0xcc / 255) });
      const hair = doc.addPage([595, 842]);
      hair.drawLine({ start: { x: 300, y: 820 }, end: { x: 301, y: 820 }, thickness: 0.3, color: rgb(0, 0, 0) });
    });
    const [grey, light, hair] = await measureAll(bytes);
    expect(close(boxOf(grey!), [0, 0, 595, 842], 1)).toBe(true);
    expect(boxOf(light!)[1]).toBeLessThan(31);
    expect(boxOf(hair!)[3]).toBeGreaterThan(819);
  });

  it('keeps an empty borderless field and a link over white space, and leaves out hidden, popup, empty and outside ones', async () => {
    const text = async (doc: PDFDocument, page: PDFPage) =>
      page.drawText('Middle', { x: 250, y: 420, size: 20, font: await doc.embedFont(StandardFonts.Helvetica), color: rgb(0, 0, 0) });
    const bytes = await build(async (doc) => {
      const shown = doc.addPage([595, 842]);
      await text(doc, shown);
      const field = doc.getForm().createTextField('empty');
      field.addToPage(shown, { x: 40, y: 60, width: 120, height: 20, borderWidth: 0 });
      link(doc, shown, [450, 780, 560, 800]);
      const hidden = doc.addPage([595, 842]);
      await text(doc, hidden);
      link(doc, hidden, [20, 20, 60, 40], { F: 2 });
      link(doc, hidden, [530, 20, 570, 40], { F: 32 });
      hidden.node.addAnnot(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [20, 780, 120, 820] })));
      link(doc, hidden, [500, 500, 500, 600]);
      link(doc, hidden, [-500, -500, -400, -400]);
      const plain = doc.addPage([595, 842]);
      await text(doc, plain);
    });
    const [shown, hidden, plain] = await measureAll(bytes);
    expect(holds(boxOf(shown!), [40, 60, 160, 80], 0.01)).toBe(true);
    expect(holds(boxOf(shown!), [450, 780, 560, 800], 0.01)).toBe(true);
    expect(boxOf(hidden!)).toEqual(boxOf(plain!));
  });

  it('cannot see a picture over PDF.js’s size limit, which is why Crop PDF checks picture sizes before measuring', async () => {
    // PDF.js leaves the picture out of its drawing with only a warning, even when told to stop at errors: its
    // drawing has already started when the error arrives, and it ends without it. So the page reads as its page
    // number alone, and the engine leaves such a page as it is from the picture's size (readPages' largestPicture).
    const [lenient] = await measureAll(await bigPicturePage());
    expect(lenient!.kind).toBe('box');
    expect(boxOf(lenient!)[3]).toBeLessThan(60);
  });

  it('calls chinese-unembedded.pdf unsafe, as its character map is refused', async () => {
    const [only] = await measureAll(fixture('chinese-unembedded.pdf'));
    expect(only).toMatchObject({ kind: 'unsafe', refused: true });
  });

  it('calls every page unsafe from the first refused helper-data request on', async () => {
    const bytes = await build(async (doc) => {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const context = doc.context;
      const cidFont = context.register(
        context.obj({ Type: 'Font', Subtype: 'CIDFontType0', BaseFont: 'STSong-Light', CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('GB1'), Supplement: 4 }, DW: 1000 }),
      );
      const song = context.register(context.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'STSong-Light-UniGB-UCS2-H', Encoding: 'UniGB-UCS2-H', DescendantFonts: [cidFont] }));
      const first = doc.addPage([595, 842]);
      first.drawText('Latin text', { x: 100, y: 700, size: 20, font });
      const second = doc.addPage([595, 842]);
      second.drawText('Latin text', { x: 100, y: 700, size: 20, font });
      second.node.setFontDictionary(PDFName.of('F9'), song);
      second.pushOperators();
      const extra = context.register(context.stream('BT /F9 24 Tf 60 100 Td <4E2D6587> Tj ET'));
      const contents = second.node.Contents();
      second.node.set(PDFName.of('Contents'), context.obj([...(contents ? [second.node.get(PDFName.of('Contents'))] : []), extra]));
      const third = doc.addPage([595, 842]);
      third.drawText('Latin text', { x: 100, y: 700, size: 20, font });
    });
    const measured = await measureAll(bytes);
    expect(measured.map((each) => each.kind)).toEqual(['box', 'unsafe', 'unsafe']);
    expect(measured[2]).toMatchObject({ refused: true });
  });

  it('draws a poster and a page of user unit 1000 at most at the pixel cap, a small page larger, and a page too thin to draw whole is unsafe', async () => {
    const bytes = await build((doc) => {
      const poster = doc.addPage([14400, 14400]);
      poster.drawRectangle({ x: 1000, y: 1000, width: 2000, height: 2000, color: rgb(0, 0, 0) });
      const huge = doc.addPage([595, 842]);
      huge.node.set(PDFName.of('UserUnit'), PDFNumber.of(1000));
      huge.drawRectangle({ x: 100, y: 100, width: 100, height: 100, color: rgb(0, 0, 0) });
      const small = doc.addPage([200, 100]);
      small.drawRectangle({ x: 50, y: 25, width: 100, height: 50, color: rgb(0, 0, 0) });
      const thin = doc.addPage([1, 1e8]);
      thin.drawRectangle({ x: 0, y: 1000, width: 1, height: 1000, color: rgb(0, 0, 0) });
    });
    const record = recording();
    const measured = await measureAll(bytes, record.tools);
    expect(measured.map((each) => each.kind)).toEqual(['box', 'box', 'box', 'unsafe']);
    for (const size of record.made) expect(size.width * size.height).toBeLessThanOrEqual(measurePixels);
    expect(record.made.some((size) => size.width === smallPageSide && size.height === smallPageSide / 2)).toBe(true);
    // The poster is drawn at 2,000 pixels for 14,400 points: a pixel is 7.2 points, and the box is grown by one.
    expect(close(boxOf(measured[0]!), [1000, 1000, 3000, 3000], 15)).toBe(true);
  });

  it('reads only the margins and a strip of content on a page with wide margins', async () => {
    const bytes = await build((doc) => {
      const page = doc.addPage([595, 842]);
      // A column of content: its rows are read once from the top and bottom margins in, its columns from the sides in.
      page.drawRectangle({ x: 250, y: 100, width: 100, height: 642, color: rgb(0, 0, 0) });
    });
    const record = recording();
    await measureAll(bytes, record.tools);
    expect(record.read()).toBeLessThan(595 * 842);
  });
});

describe('inkPixels', () => {
  const picture = (width: number, height: number, ink: [number, number][]) => {
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (const [x, y] of ink) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    return (x: number, y: number, w: number, h: number) => {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) out.set(data.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
      return out;
    };
  };

  it('gives the box around the ink, grown by a pixel and kept inside the picture', () => {
    expect(inkPixels(100, 50, picture(100, 50, [[10, 20], [40, 30]]))).toEqual([9, 19, 42, 32]);
    expect(inkPixels(100, 50, picture(100, 50, [[0, 0], [99, 49]]))).toEqual([0, 0, 100, 50]);
  });

  it('gives null for a white picture', () => {
    expect(inkPixels(40, 40, picture(40, 40, []))).toBeNull();
  });
});
