// Crop PDF: the engine on every file in the shared test set and on files made here, through the real qpdf, the
// real PDF.js and the real helper data, with @napi-rs/canvas in place of the worker's OffscreenCanvas.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createQpdf } from '../../src/engines/qpdf';
import { OutputLimit } from '../../src/engines/qpdf';
import { cutBox, croppedDict, makeRun, marginFraction, run } from '../../src/engines/tools/crop-pdf';
import { maxImagePixels, type Box, type Measured } from '../../src/engines/thumbnail';
import { readPages } from '../../src/engines/stamp';
import type { EngineTools, Progress } from '../../src/engines/types';
import { pageStreams, texts } from './stamp-helpers';
import { fixture, tools as drawTools } from './thumbnail-helpers';
import { bigPicturePage } from './crop-helpers';

const require = createRequire(import.meta.url);
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
const tools: EngineTools = { ...drawTools, qpdf: makeQpdf };
const password = 'open-sesame';

type Json = Record<string, unknown>;

async function crop(bytes: Uint8Array, given?: string, engine = run, using: EngineTools = tools) {
  const progress: Progress[] = [];
  const outputs = await engine([bytes], { passwords: given === undefined ? [] : [given] }, (step) => progress.push(step), using);
  return { output: outputs[0], outputs, progress };
}

/** Each page's values as qpdf reads them, each resolved: its own keys and those it inherits. */
async function pageValues(bytes: Uint8Array, given?: string): Promise<Json[]> {
  const { pages, objects } = await dictionaries(bytes, given);
  const value = (id: unknown): unknown => (typeof id === 'string' && /^\d+ \d+ R$/.test(id) ? objects[`obj:${id}`]?.value : id);
  return pages.map(({ object }) => {
    const dict = value(object) as Json;
    const found: Json = {};
    for (const key of Object.keys(dict)) found[key] = value(dict[key]);
    let parent = value(dict['/Parent']) as Json | undefined;
    for (let depth = 0; parent && depth < 10; depth++) {
      for (const key of ['/MediaBox', '/CropBox', '/Rotate']) if (!(key in found) && key in parent) found[`inherited${key}`] = value(parent[key]);
      parent = value(parent['/Parent']) as Json | undefined;
    }
    return found;
  });
}

/** qpdf's JSON of a file's pages and objects, with no stream data, so a file with a huge attachment is read quickly. */
async function dictionaries(bytes: Uint8Array, given?: string) {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const args = [...(given ? [`--password=${given}`] : []), '--json=2', '--json-key=pages', '--json-key=qpdf', '--json-stream-data=none', '/in.pdf', '/out.json'];
  const { code } = qpdf.call(args);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  const parsed = JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as { pages: { object: string }[]; qpdf: [unknown, Record<string, { value?: unknown }>] };
  return { pages: parsed.pages, objects: parsed.qpdf[1] };
}

async function qpdfCall(bytes: Uint8Array, args: string[]) {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  return qpdf.call([...args, '/in.pdf']);
}

async function encrypted(bytes: Uint8Array): Promise<boolean> {
  const answer = await qpdfCall(bytes, ['--json=2', '--json-key=encrypt']);
  return (JSON.parse(answer.out) as { encrypt: { encrypted: boolean } }).encrypt.encrypted;
}

/**
 * The box around each page's ink, in the page's own units, drawn by PDF.js on its own (not through `measure`) as a
 * reader shows it, with form values, at 72 pixels to the inch; a pixel darker than 200 on any channel is ink. Null
 * for a page with none.
 */
async function inkBoxes(bytes: Uint8Array, given?: string): Promise<(Box | null)[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes.slice(), password: given, verbosity: 0, standardFontDataUrl: join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/') });
  const doc = await task.promise;
  const boxes: (Box | null)[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context as never, canvas: canvas as never, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE }).promise;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const k = (y * canvas.width + x) * 4;
        if (data[k]! < 200 || data[k + 1]! < 200 || data[k + 2]! < 200) [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x + 1), Math.max(bottom, y + 1)];
      }
    }
    if (left === Infinity) boxes.push(null);
    else {
      const corners = [viewport.convertToPdfPoint(left, top), viewport.convertToPdfPoint(right, bottom)] as number[][];
      boxes.push([Math.min(corners[0]![0]!, corners[1]![0]!), Math.min(corners[0]![1]!, corners[1]![1]!), Math.max(corners[0]![0]!, corners[1]![0]!), Math.max(corners[0]![1]!, corners[1]![1]!)]);
    }
    page.cleanup();
  }
  await task.destroy();
  return boxes;
}

/** Expects every cut page's new crop box to hold all of the ink the original page showed: a crop only takes away white. */
async function expectNoInkCut(before: Uint8Array, after: Uint8Array, given?: string) {
  const ink = await inkBoxes(before, given);
  const values = await pageValues(after);
  values.forEach((page, index) => {
    const box = page['/CropBox'] as number[] | undefined;
    const drawn = ink[index];
    if (!box || !drawn) return;
    // Within a pixel: the ink box is found on whole pixels.
    expect(box[0], `page ${index + 1}`).toBeLessThanOrEqual(drawn[0] + 1);
    expect(box[1], `page ${index + 1}`).toBeLessThanOrEqual(drawn[1] + 1);
    expect(box[2], `page ${index + 1}`).toBeGreaterThanOrEqual(drawn[2] - 1);
    expect(box[3], `page ${index + 1}`).toBeGreaterThanOrEqual(drawn[3] - 1);
  });
}

async function build(make: (doc: PDFDocument) => Promise<void> | void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  await make(doc);
  return doc.save({ useObjectStreams: false });
}

const fixtures = readdirSync(join(__dirname, '../fixtures'))
  .filter((name) => name.endsWith('.pdf'))
  .sort();

/** What Crop does with each file of the shared test set, as recorded in tests/fixtures/README.md. */
const expected: Record<string, 'cut' | 'none' | 'fails'> = {
  'chinese-unembedded.pdf': 'none',
  'compress-bomb-attachment.pdf': 'cut',
  'compress-flate-bomb.pdf': 'none',
  'compress-jpeg-mismatch.pdf': 'none',
  'compress-json-bomb.pdf': 'fails',
  'compress-kinds.pdf': 'none',
  'compress-lossless.pdf': 'cut',
  'compress-packed.pdf': 'cut',
  'compress-password.pdf': 'none',
  'compress-scans.pdf': 'none',
  'compress-small-jpg.pdf': 'cut',
  'compress-text.pdf': 'cut',
  'damaged-cut.pdf': 'fails',
  'damaged-xref.pdf': 'fails',
  'form.pdf': 'cut',
  'images.pdf': 'cut',
  'mixed.pdf': 'cut',
  'multilingual.pdf': 'cut',
  'not-a-pdf.pdf': 'fails',
  'pages-500.pdf': 'cut',
  'password.pdf': 'cut',
  'restricted.pdf': 'cut',
  'rich.pdf': 'cut',
  'scanned.pdf': 'none',
  'tagged.pdf': 'cut',
  'text.pdf': 'cut',
  'warning.pdf': 'cut',
};

const passwordOf = (name: string) => (name === 'password.pdf' || name === 'compress-password.pdf' ? password : undefined);

describe('Crop PDF on every file in the test set', () => {
  it('lists every fixture', () => {
    expect(fixtures).toEqual(Object.keys(expected).sort());
  });

  for (const name of fixtures) {
    it(`${name}: ${expected[name]}`, { timeout: 300_000 }, async () => {
      const bytes = fixture(name);
      const given = passwordOf(name);
      if (expected[name] === 'fails') {
        await expect(crop(bytes, given)).rejects.toThrow();
        return;
      }
      const { outputs, output } = await crop(bytes, given);
      if (expected[name] === 'none') {
        expect(outputs).toEqual([]);
        return;
      }
      expect(output).toBeInstanceOf(Uint8Array);
      const after = output!;
      expect((await qpdfCall(after, ['--check'])).code).toBe(0);
      expect(await encrypted(after)).toBe(false);
      // Content is never rewritten.
      expect(await pageStreams(after)).toEqual(await pageStreams(bytes, given));
      const [was, now] = [await pageValues(bytes, given), await pageValues(after)];
      expect(now).toHaveLength(was.length);
      let cut = 0;
      now.forEach((page, index) => {
        const old = was[index]!;
        for (const key of ['/MediaBox', '/Rotate', '/UserUnit', 'inherited/MediaBox', 'inherited/Rotate']) expect(page[key], `${key} of page ${index + 1}`).toEqual(old[key]);
        expect(Array.isArray(page['/Annots']) ? page['/Annots'].length : 0).toBe(Array.isArray(old['/Annots']) ? old['/Annots'].length : 0);
        for (const key of ['/BleedBox', '/TrimBox', '/ArtBox']) if (!(key in old)) expect(page[key]).toBeUndefined();
        if (JSON.stringify(page['/CropBox']) !== JSON.stringify(old['/CropBox'])) cut++;
      });
      expect(cut).toBeGreaterThan(0);
      await expectNoInkCut(bytes, after, given);
    });
  }
});

describe('what a cropped file keeps', () => {
  /** Each page's annotation boxes and its shown box, as PDF.js reads them. */
  async function annotationPlaces(bytes: Uint8Array) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    const places: { view: number[]; rects: number[][] }[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const opened = await doc.getPage(page);
      places.push({ view: opened.view, rects: (await opened.getAnnotations()).map((annotation: { rect: number[] }) => annotation.rect) });
    }
    const outline = await doc.getOutline();
    const attachments = await doc.getAttachments();
    const fields = await doc.getFieldObjects();
    await task.destroy();
    return { places, outline, attachments, fields };
  }

  for (const name of ['rich.pdf', 'form.pdf', 'tagged.pdf']) {
    it(`keeps ${name}'s bookmarks, links, attached files, fields, values, tags and text, with every annotation inside its page`, { timeout: 120_000 }, async () => {
      const bytes = fixture(name);
      const after = (await crop(bytes)).output!;
      const [was, now] = [await annotationPlaces(bytes), await annotationPlaces(after)];
      // Destinations point at page objects, which qpdf numbers afresh, so the titles and their order are compared.
      const titles = (items: { title: string; items: unknown[] }[] | null): unknown => (items ?? []).map((item) => [item.title, titles(item.items as never)]);
      expect(titles(now.outline)).toEqual(titles(was.outline));
      expect(Object.keys(now.attachments ?? {})).toEqual(Object.keys(was.attachments ?? {}));
      const valuesOf = (fields: unknown) =>
        Object.fromEntries(Object.entries((fields ?? {}) as Record<string, { value?: unknown }[]>).map(([key, list]) => [key, list.map((field) => field.value)]));
      expect(valuesOf(now.fields)).toEqual(valuesOf(was.fields));
      expect(Object.keys(now.fields ?? {})).toEqual(Object.keys(was.fields ?? {}));
      expect(await texts(after)).toEqual(await texts(bytes));
      for (const { view, rects } of now.places) {
        for (const rect of rects) {
          expect(rect[0]).toBeGreaterThanOrEqual(view[0]! - 0.01);
          expect(rect[1]).toBeGreaterThanOrEqual(view[1]! - 0.01);
          expect(rect[2]).toBeLessThanOrEqual(view[2]! + 0.01);
          expect(rect[3]).toBeLessThanOrEqual(view[3]! + 0.01);
        }
      }
      const catalog = async (file: Uint8Array) => {
        const { objects } = await dictionaries(file);
        return Object.values(objects).some((entry) => (entry.value as Json | undefined)?.['/Type'] === '/StructTreeRoot');
      };
      expect(await catalog(after)).toBe(await catalog(bytes));
    });
  }

  it('keeps the text of multilingual.pdf in every script', { timeout: 120_000 }, async () => {
    const bytes = fixture('multilingual.pdf');
    const after = (await crop(bytes)).output!;
    expect(await texts(after)).toEqual(await texts(bytes));
    expect(await pageStreams(after)).toEqual(await pageStreams(bytes));
    await expectNoInkCut(bytes, after);
  });

  it('leaves a page whose picture PDF.js cannot draw as it is, never cutting it to its page number', async () => {
    expect((await crop(await bigPicturePage())).outputs).toEqual([]);
  });

  it('reads the largest picture a page draws, through forms, only when asked', async () => {
    const bytes = await build((doc) => {
      const context = doc.context;
      // Dictionaries only: the sizes are read from them, and these pages are never drawn.
      const huge = context.register(context.flateStream(new Uint8Array(4), { Type: 'XObject', Subtype: 'Image', Width: 5000, Height: 4000, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
      const small = context.register(context.flateStream(new Uint8Array(4), { Type: 'XObject', Subtype: 'Image', Width: 4096, Height: 4096, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }));
      const inner = context.register(context.flateStream('/Im1 Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1], Resources: { XObject: { Im1: huge } } }));
      const outer = context.register(context.flateStream('/Fm1 Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1], Resources: { XObject: { Fm1: inner } } }));
      const first = doc.addPage([595, 842]);
      first.node.normalizedEntries().XObject.set(PDFName.of('Fm2'), outer);
      const second = doc.addPage([595, 842]);
      second.node.normalizedEntries().XObject.set(PDFName.of('Im2'), small);
      doc.addPage([595, 842]);
    });
    const { pages } = await readPages(tools, bytes, { pictures: true });
    expect(pages.map((page) => page.largestPicture)).toEqual([20_000_000, 4096 * 4096, 0]);
    // A picture of exactly the limit is drawn by PDF.js, so only one above it leaves a page as it is.
    expect(4096 * 4096).toBe(maxImagePixels);
    // Without the option, the stamp tools' reading is as it was.
    expect((await readPages(tools, bytes)).pages.every((page) => page.largestPicture === undefined)).toBe(true);
  });

  it('leaves chinese-unembedded.pdf as it is, giving no file', async () => {
    expect((await crop(fixture('chinese-unembedded.pdf'))).outputs).toEqual([]);
  });

  it('gives files with no password and no restrictions', async () => {
    for (const [name, given] of [
      ['password.pdf', password],
      ['restricted.pdf', undefined],
    ] as const) {
      const after = (await crop(fixture(name), given)).output!;
      expect(await encrypted(after)).toBe(false);
    }
  });
});

describe('page boxes', () => {
  it('cuts back a page’s own bleed, trim and art boxes as direct arrays, never changing a shared one, and adds none', async () => {
    const bytes = await build((doc) => {
      const shared = doc.context.register(doc.context.obj([0, 0, 595, 842]));
      const first = doc.addPage([595, 842]);
      first.drawRectangle({ x: 200, y: 300, width: 100, height: 100, color: rgb(0, 0, 0) });
      first.node.set(PDFName.of('TrimBox'), doc.context.obj([10, 10, 585, 832]));
      first.node.set(PDFName.of('BleedBox'), shared);
      first.node.set(PDFName.of('ArtBox'), doc.context.obj([5, 5, 20, 20]));
      const second = doc.addPage([595, 842]);
      second.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0, 0, 0) });
      second.node.set(PDFName.of('BleedBox'), shared);
      const third = doc.addPage([595, 842]);
      third.drawRectangle({ x: 200, y: 300, width: 100, height: 100, color: rgb(0, 0, 0) });
      third.node.set(PDFName.of('TrimBox'), doc.context.obj([PDFName.of('x'), 0, 0, 0]));
      const fourth = doc.addPage([595, 842]);
      fourth.drawRectangle({ x: 200, y: 300, width: 100, height: 100, color: rgb(0, 0, 0) });
    });
    const after = (await crop(bytes)).output!;
    const { pages, objects } = await dictionaries(after);
    const dict = (index: number) => objects[`obj:${pages[index]!.object}`]!.value as Json;
    const crop1 = dict(0)['/CropBox'] as number[];
    expect(dict(0)['/TrimBox']).toEqual(crop1);
    expect(dict(0)['/BleedBox']).toEqual(crop1);
    expect(dict(0)['/ArtBox']).toBeUndefined();
    // The second page is filled to its edges, so left as it was, still with the shared box.
    expect(dict(1)['/CropBox']).toBeUndefined();
    const sharedRef = dict(1)['/BleedBox'];
    expect(typeof sharedRef).toBe('string');
    expect(objects[`obj:${sharedRef as string}`]!.value).toEqual([0, 0, 595, 842]);
    expect(dict(2)['/TrimBox']).toBeUndefined();
    for (const key of ['/TrimBox', '/BleedBox', '/ArtBox']) expect(dict(3)[key]).toBeUndefined();
  });

  it('overrides a crop box inherited from the page tree only on pages it cuts', async () => {
    const bytes = await build((doc) => {
      const first = doc.addPage([600, 800]);
      first.drawRectangle({ x: 250, y: 350, width: 100, height: 100, color: rgb(0, 0, 0) });
      const second = doc.addPage([600, 800]);
      second.drawRectangle({ x: 0, y: 0, width: 600, height: 800, color: rgb(0, 0, 0) });
      doc.catalog.Pages().set(PDFName.of('CropBox'), doc.context.obj([100, 100, 500, 700]));
    });
    const after = (await crop(bytes)).output!;
    const [first, second] = await pageValues(after);
    const box = first!['/CropBox'] as number[];
    expect(box[0]).toBeGreaterThanOrEqual(100);
    expect(box[2]).toBeLessThanOrEqual(500);
    expect(second!['/CropBox']).toBeUndefined();
    expect(second!['inherited/CropBox']).toEqual([100, 100, 500, 700]);
  });

  it('leaves the margin of a fortieth of the shorter side', async () => {
    const bytes = await build((doc) => {
      const page = doc.addPage([595, 842]);
      page.drawRectangle({ x: 100, y: 200, width: 300, height: 400, color: rgb(0, 0, 0) });
    });
    const [page] = await pageValues((await crop(bytes)).output!);
    const box = page!['/CropBox'] as number[];
    const margin = 595 * marginFraction;
    // The content box is grown by one pixel (a point here) before the margin is added.
    expect(box[0]).toBeGreaterThan(100 - margin - 1.5);
    expect(box[0]).toBeLessThan(100 - margin + 0.01);
    expect(box[3]).toBeGreaterThan(600 + margin - 0.01);
    expect(box[3]).toBeLessThan(600 + margin + 1.5);
  });

  it('keeps text drawn in white in a cut-off margin in the file, as the page says', async () => {
    const bytes = await build(async (doc) => {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([595, 842]);
      page.drawText('Visible', { x: 250, y: 420, size: 20, font, color: rgb(0, 0, 0) });
      page.drawText('SECRET-margin', { x: 40, y: 40, size: 8, font, color: rgb(1, 1, 1) });
    });
    const after = (await crop(bytes)).output!;
    const [page] = await pageValues(after);
    const box = page!['/CropBox'] as number[];
    expect(box[1]).toBeGreaterThan(50);
    // The words stay in the page's content, which is not rewritten. PDF.js leaves text outside the shown box out of
    // what it reads, so the content stream itself is looked at: pdf-lib writes the words as a hex string.
    const hex = Buffer.from('SECRET-margin', 'latin1').toString('hex').toUpperCase();
    expect((await pageStreams(after))[0]!.join('\n').toUpperCase()).toContain(hex);
  });
});

describe('cutBox', () => {
  const place = { box: [0, 0, 595, 842] as Box, turn: 0 as const, unit: 1 };
  const shown = { view: [0, 0, 595, 842] as Box, rotate: 0, userUnit: 1 };
  const measured = (box: Box): Measured => ({ kind: 'box', box, shown });

  it('grows the content by the margin, rounded outward, inside the old box', () => {
    expect(cutBox(place, measured([100, 200, 300, 400]))).toEqual([85.125, 185.125, 314.875, 414.875]);
    expect(cutBox(place, measured([1, 1, 594, 841]))).toBeNull();
  });

  it('leaves a page whose cut would move no edge by a point', () => {
    expect(cutBox(place, measured([15, 15, 580, 827]))).toBeNull();
  });

  it('refuses blank and unsafe pages, and pages PDF.js and qpdf read differently', () => {
    expect(cutBox(place, { kind: 'blank', shown })).toBeNull();
    expect(cutBox(place, { kind: 'unsafe' })).toBeNull();
    expect(cutBox(place, { kind: 'box', box: [100, 100, 200, 200], shown: { ...shown, view: [0, 0, 600, 842] } })).toBeNull();
    expect(cutBox(place, { kind: 'box', box: [100, 100, 200, 200], shown: { ...shown, rotate: 90 } })).toBeNull();
    expect(cutBox(place, { kind: 'box', box: [100, 100, 200, 200], shown: { ...shown, userUnit: 2 } })).toBeNull();
  });

  it('refuses boxes that are not finite, outside the page or too large to write plainly', () => {
    expect(cutBox(place, measured([Number.NaN, 0, 100, 100]))).toBeNull();
    expect(cutBox(place, measured([700, 900, 800, 1000]))).toBeNull();
    const huge = { box: [0, 0, 4e9, 4e9] as Box, turn: 0 as const, unit: 1 };
    expect(cutBox(huge, { kind: 'box', box: [1e9, 1e9, 2e9, 2e9], shown: { ...shown, view: [0, 0, 4e9, 4e9] } })).toBeNull();
  });

  it('reads a turn as qpdf does', () => {
    expect(cutBox({ ...place, turn: 270 }, { kind: 'box', box: [100, 100, 200, 200], shown: { ...shown, rotate: -90 } })).not.toBeNull();
  });
});

describe('croppedDict', () => {
  it('keeps every other key and resolves an indirect box', () => {
    const dict = { '/Type': '/Page', '/MediaBox': [0, 0, 595, 842], '/Contents': '4 0 R', '/TrimBox': '9 0 R' };
    expect(croppedDict(dict, [10, 10, 100, 100], () => [0, 0, 50, 50])).toEqual({ ...dict, '/CropBox': [10, 10, 100, 100], '/TrimBox': [10, 10, 50, 50] });
    expect(croppedDict(dict, [10, 10, 100, 100], () => undefined)).toEqual({ '/Type': '/Page', '/MediaBox': [0, 0, 595, 842], '/Contents': '4 0 R', '/CropBox': [10, 10, 100, 100] });
  });
});

describe('runs, refusals, progress and limits', () => {
  /**
   * A file of `count` small pages, each nearly filled by a mark; page `chinese` (1-based) also holds unembedded
   * Chinese text. Small and nearly full, so measuring reads few pixels: @napi-rs/canvas 1.1.0 keeps the memory of
   * every getImageData call (about 2.3 MB for each A4 page read in full, also outside the test runner), which only
   * the Node tests' canvas maker uses.
   */
  async function long(count: number, chinese?: number) {
    return build((doc) => {
      const context = doc.context;
      const cidFont = context.register(
        context.obj({ Type: 'Font', Subtype: 'CIDFontType0', BaseFont: 'STSong-Light', CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('GB1'), Supplement: 4 }, DW: 1000 }),
      );
      const song = context.register(context.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'STSong-Light-UniGB-UCS2-H', Encoding: 'UniGB-UCS2-H', DescendantFonts: [cidFont] }));
      const mark = context.register(context.stream('0 g 20 20 250 250 re f'));
      const chineseText = context.register(context.stream('0 g 20 20 250 250 re f BT /F9 24 Tf 30 30 Td <4E2D6587> Tj ET'));
      for (let page = 1; page <= count; page++) {
        const added = doc.addPage([290, 290]);
        if (page === chinese) {
          added.node.setFontDictionary(PDFName.of('F9'), song);
          added.node.set(PDFName.of('Contents'), chineseText);
        } else added.node.set(PDFName.of('Contents'), mark);
      }
    });
  }

  /** Tools whose PDF.js counts the documents opened. */
  function counting() {
    let opened = 0;
    const given: EngineTools = {
      ...tools,
      pdfjs: async () => {
        const module = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Record<string, unknown>;
        return {
          ...module,
          getDocument: (options: unknown) => {
            opened++;
            return (module.getDocument as (options: unknown) => unknown)(options);
          },
        };
      },
    };
    return { given, opened: () => opened };
  }

  it('measures a long file in runs of 2,000 pages, each a document of its own', { timeout: 600_000 }, async () => {
    const bytes = await long(2_003);
    const record = counting();
    const { output, progress } = await crop(bytes, undefined, run, record.given);
    expect(record.opened()).toBe(2);
    const values = await pageValues(output!);
    expect(values.every((page) => Array.isArray(page['/CropBox']))).toBe(true);
    const pages = progress.filter((step): step is Extract<Progress, { stage: 'reading' | 'working' }> => step.stage === 'working');
    expect(pages.map((step) => step.done)).toEqual(Array.from({ length: 2_003 }, (_, index) => index + 1));
    expect(pages.every((step) => step.writesAfter === true && step.total === 2_003)).toBe(true);
    const writing = progress.filter((step) => step.stage === 'writing').map((step) => (step as { percent: number }).percent);
    expect(writing.at(-1)).toBe(100);
    expect(writing).toEqual([...writing].sort((a, b) => a - b));
  });

  it('leaves every page from a refusal in the first run on, starting no second run', { timeout: 600_000 }, async () => {
    const bytes = await long(2_003, 3);
    const record = counting();
    const { output, progress } = await crop(bytes, undefined, run, record.given);
    // The refusal is on page 3, in the first run: no second document is opened.
    expect(record.opened()).toBe(1);
    const values = await pageValues(output!);
    expect(values.slice(0, 2).every((page) => Array.isArray(page['/CropBox']))).toBe(true);
    expect(values.slice(2).every((page) => page['/CropBox'] === undefined)).toBe(true);
    expect(progress.filter((step) => step.stage === 'working').at(-1)).toMatchObject({ done: 2_003, total: 2_003 });
  });

  it('leaves every page from a refusal in the second run on, keeping the first run’s cuts', { timeout: 600_000 }, async () => {
    const bytes = await long(2_003, 2_001);
    const record = counting();
    const { output } = await crop(bytes, undefined, run, record.given);
    expect(record.opened()).toBe(2);
    const values = await pageValues(output!);
    expect(values.slice(0, 2_000).every((page) => Array.isArray(page['/CropBox']))).toBe(true);
    expect(values.slice(2_000).every((page) => page['/CropBox'] === undefined)).toBe(true);
  });

  it('stops with OutputLimit when the update is over the size budget', async () => {
    await expect(crop(fixture('text.pdf'), undefined, makeRun({ sizeLimit: () => 100 }))).rejects.toBeInstanceOf(OutputLimit);
  });

  it('stops with OutputLimit in the capped write when the update fits and the written file does not', async () => {
    // compress-small-jpg.pdf's update is about 400 bytes and its cropped file about 8.8 KB: a budget between them lets
    // the update through and stops the write.
    const written: string[] = [];
    const watching: EngineTools = {
      ...tools,
      qpdf: async () => {
        const qpdf = await makeQpdf();
        const write = qpdf.write.bind(qpdf);
        qpdf.write = (path: string, bytes: Uint8Array) => {
          written.push(path);
          write(path, bytes);
        };
        return qpdf;
      },
    };
    await expect(crop(fixture('compress-small-jpg.pdf'), undefined, makeRun({ sizeLimit: () => 4_000 }), watching)).rejects.toBeInstanceOf(OutputLimit);
    expect(written).toContain('/update.json');
  });

  it('puts no password and no page text into an error', async () => {
    const wrong = 'Qz7-wrong-secret';
    const failure = await crop(fixture('password.pdf'), wrong).catch((error: unknown) => error as Error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(wrong);
    const damaged = await crop(fixture('damaged-cut.pdf')).catch((error: unknown) => error as Error);
    expect((damaged as Error).message).not.toMatch(/SECRET|Lorem/);
  });

  it('takes one file only', async () => {
    await expect(run([], {}, () => {}, tools)).rejects.toThrow('Crop PDF takes one file.');
  });
});
