// PDF to JPG and PDF to PNG: the engine on every file in the shared test set,
// in both formats, through the real PDF.js and the real helper data, with
// @napi-rs/canvas in place of the worker's OffscreenCanvas; and on files made
// here, for posters, nested transparency, a stopped PDF.js worker and the
// limits on what one job makes.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { inspectPdf } from '../../src/engines/inspect';
import { createQpdf } from '../../src/engines/qpdf';
import { jpegQuality, makeRun, pictureScale, run } from '../../src/engines/tools/pdf-to-images';
import { maxImagePixels, openDocument, type PdfjsModule } from '../../src/engines/thumbnail';
import type { EngineTools, Progress } from '../../src/engines/types';
import { failureSentence } from '../../src/widget/failures';
import { maxOutputBytes, TooBigForZip, TooManyPictures } from '../../src/widget/zip-limits';
import { createPdfjsLoader, type NestedWorker } from '../../src/workers/pdfjs-loader';
import { failureKind } from '../../src/workers/worker-core';
import { createRequire } from 'node:module';
import { box, fixture, nestedWorker, tools } from './thumbnail-helpers';

const require = createRequire(import.meta.url);
const qpdfTools: EngineTools = {
  ...tools,
  qpdf: () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm')),
};

const isPng = (bytes: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
const isJpg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;

async function convert(file: Uint8Array, format: 'jpg' | 'png', password?: string, engine = run, given: EngineTools = tools) {
  const progress: Progress[] = [];
  const outputs = await engine([file], { format, passwords: [password] }, (step) => progress.push(step), given);
  return { outputs, progress };
}

/** A picture decoded: its size, its pixels, and how much of it is darker than paper. */
async function decode(bytes: Uint8Array) {
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let dark = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index]! + data[index + 1]! + data[index + 2]! < 600) dark++;
  return { width: image.width, height: image.height, ink: dark / (image.width * image.height), image, data };
}

/** How much darker than paper a part of a picture is, the part given in pixels from its top left. */
function inkIn(seen: Awaited<ReturnType<typeof decode>>, x0: number, y0: number, x1: number, y1: number) {
  let dark = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * seen.width + x) * 4;
      if (seen.data[at]! + seen.data[at + 1]! + seen.data[at + 2]! < 600) dark++;
    }
  }
  return dark / ((x1 - x0) * (y1 - y0));
}

/** The mean difference, from 0 to 255, between a picture scaled down to a thumbnail's size and that thumbnail. */
async function differenceFromThumbnail(picture: Uint8Array, thumbnail: Uint8Array) {
  const small = await decode(thumbnail);
  const big = await loadImage(Buffer.from(picture));
  const canvas = createCanvas(small.width, small.height);
  const context = canvas.getContext('2d');
  context.drawImage(big, 0, 0, small.width, small.height);
  const { data } = context.getImageData(0, 0, small.width, small.height);
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) sum += Math.abs(data[index + channel]! - small.data[index + channel]!);
  }
  return sum / ((data.length / 4) * 3);
}

const a4 = { width: 1240, height: 1754 };

// ---------------------------------------------------------------------------
// The shared test set

describe('every file in the shared test set', () => {
  /** Each readable file: its password, and each page's picture size in pixels. */
  const readable: [string, string | undefined, { width: number; height: number }[]][] = [
    ['text.pdf', undefined, [a4, a4, a4]],
    ['scanned.pdf', undefined, [a4, a4]],
    ['password.pdf', 'open-sesame', [a4, a4, a4]],
    ['restricted.pdf', undefined, [a4, a4, a4]],
    ['warning.pdf', undefined, [a4, a4, a4]],
    ['form.pdf', undefined, [a4]],
    // A4; Letter on its side; A5 turned a quarter, so drawn wide; A4 upside down.
    ['mixed.pdf', undefined, [a4, { width: 1650, height: 1275 }, { width: 1240, height: 875 }, a4]],
    ['rich.pdf', undefined, [a4, a4]],
    ['images.pdf', undefined, [a4]],
    ['tagged.pdf', undefined, [{ width: 625, height: 625 }, { width: 625, height: 625 }]],
    ['compress-scans.pdf', undefined, [a4, a4, a4]],
    ['compress-lossless.pdf', undefined, [a4]],
    ['compress-small-jpg.pdf', undefined, [a4]],
    ['compress-kinds.pdf', undefined, Array.from({ length: 7 }, () => ({ width: 150, height: 150 }))],
    ['compress-text.pdf', undefined, [a4, a4, a4]],
    ['compress-packed.pdf', undefined, [a4, a4, a4]],
    ['compress-bomb-attachment.pdf', undefined, [a4]],
    ['compress-flate-bomb.pdf', undefined, [{ width: 150, height: 150 }]],
    ['compress-jpeg-mismatch.pdf', undefined, [{ width: 75, height: 75 }, { width: 75, height: 75 }]],
    ['compress-json-bomb.pdf', undefined, [{ width: 150, height: 150 }]],
    ['compress-password.pdf', 'open-sesame', [{ width: 600, height: 600 }]],
    // Chromium's A4 of 594.96 by 841.92 points, one pixel narrower than a4 here.
    ['multilingual.pdf', undefined, Array.from({ length: 5 }, () => ({ width: 1239, height: 1754 }))],
    ['chinese-unembedded.pdf', undefined, [a4]],
  ];

  it('names every PDF in the folder here or below, so a new fixture is not forgotten', () => {
    const named = new Set([...readable.map(([name]) => name), 'pages-500.pdf', 'damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']);
    const present = readdirSync(join(__dirname, '../fixtures')).filter((name) => name.endsWith('.pdf'));
    expect(present.filter((name) => !named.has(name))).toEqual([]);
  });

  for (const format of ['png', 'jpg'] as const) {
    it.each(readable)(`gives one ${format.toUpperCase()} per page of %s, in order, of the page's size at 150 to the inch`, async (name, password, sizes) => {
      const { outputs, progress } = await convert(fixture(name), format, password);
      expect(outputs).toHaveLength(sizes.length);
      for (const [index, bytes] of outputs.entries()) {
        expect(format === 'png' ? isPng(bytes) : isJpg(bytes), `page ${index + 1}`).toBe(true);
        const seen = await decode(bytes);
        expect({ width: seen.width, height: seen.height }, `page ${index + 1}`).toEqual(sizes[index]);
      }
      expect(progress).toEqual(sizes.map((_, index) => ({ stage: 'working', unit: 'page', done: index + 1, total: sizes.length })));
    }, 60000);
  }

  it('draws pages that are not blank, matching the thumbnail of the same page', async () => {
    for (const [name, password, pages] of [['text.pdf', undefined, 3], ['mixed.pdf', undefined, 4], ['password.pdf', 'open-sesame', 1], ['images.pdf', undefined, 1]] as const) {
      const doc = await openDocument(fixture(name), password, tools);
      const { outputs: pngs } = await convert(fixture(name), 'png', password);
      const { outputs: jpgs } = await convert(fixture(name), 'jpg', password);
      for (let page = 1; page <= pages; page++) {
        const thumbnail = await doc.render(page, box);
        expect((await decode(pngs[page - 1]!)).ink, `${name} page ${page}`).toBeGreaterThan(0.0005);
        expect(await differenceFromThumbnail(pngs[page - 1]!, thumbnail), `${name} page ${page} as PNG`).toBeLessThan(8);
        expect(await differenceFromThumbnail(jpgs[page - 1]!, thumbnail), `${name} page ${page} as JPG`).toBeLessThan(8);
      }
      await doc.close();
    }
  }, 60000);

  it('draws the page turned a quarter as a reader shows it: its label runs down the right-hand side', async () => {
    // mixed.pdf page 3 is A5 with /Rotate 90; its label sits at the top left of the page before the turn.
    const { outputs } = await convert(fixture('mixed.pdf'), 'png');
    const seen = await decode(outputs[2]!);
    const right = inkIn(seen, Math.floor(seen.width * 0.8), 0, seen.width, seen.height);
    const left = inkIn(seen, 0, 0, Math.floor(seen.width * 0.2), seen.height);
    expect(right).toBeGreaterThan(0.002);
    expect(left).toBeLessThan(right / 10);
  });

  it("draws form.pdf's field with what was typed in it", async () => {
    // The field `name` is at 120 to 360 by 750 to 774 points on an A4 page of 842 points.
    for (const format of ['png', 'jpg'] as const) {
      const { outputs } = await convert(fixture('form.pdf'), format);
      const seen = await decode(outputs[0]!);
      const s = pictureScale;
      const field = inkIn(seen, Math.round(124 * s), Math.round((842 - 772) * s), Math.round(356 * s), Math.round((842 - 752) * s));
      expect(field, format).toBeGreaterThan(0.03);
    }
  });

  it('saves JPGs at quality 85: smaller than the PNG of a scan, and close to it', async () => {
    expect(jpegQuality).toBe(0.85);
    const [png] = (await convert(fixture('compress-scans.pdf'), 'png')).outputs;
    const [jpg] = (await convert(fixture('compress-scans.pdf'), 'jpg')).outputs;
    expect(jpg!.length).toBeLessThan(png!.length);
    const a = await decode(png!);
    const b = await decode(jpg!);
    let sum = 0;
    for (let index = 0; index < a.data.length; index += 4) sum += Math.abs(a.data[index]! - b.data[index]!);
    expect(sum / (a.data.length / 4)).toBeLessThan(4);
  }, 60000);

  it('draws password.pdf with its password, and fails without it or with a wrong one', async () => {
    expect((await convert(fixture('password.pdf'), 'png', 'open-sesame')).outputs).toHaveLength(3);
    await expect(convert(fixture('password.pdf'), 'png')).rejects.toThrow();
    await expect(convert(fixture('password.pdf'), 'png', 'wrong')).rejects.toThrow();
  });

  it('reads the damaged files as damaged before the job; the job fails on those PDF.js cannot open', async () => {
    for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']) {
      expect(await inspectPdf(fixture(name), undefined, qpdfTools), name).toEqual({ kind: 'damaged' });
    }
    for (const name of ['damaged-cut.pdf', 'not-a-pdf.pdf']) {
      const failed = await convert(fixture(name), 'png').catch((error: unknown) => error);
      expect(failed, name).toBeInstanceOf(Error);
      expect(failureKind(failed)).toBe('engine');
    }
    // PDF.js repairs damaged-xref.pdf, which qpdf cannot read; the page never runs the job, as qpdf reads it as damaged first.
    expect((await convert(fixture('damaged-xref.pdf'), 'png')).outputs.length).toBeGreaterThan(0);
  });

  it('refuses a format that is not JPG or PNG, and more than one file', async () => {
    await expect(run([fixture('text.pdf')], { format: 'gif' }, () => {}, tools)).rejects.toThrow(/format/);
    await expect(run([fixture('text.pdf')], {}, () => {}, tools)).rejects.toThrow(/format/);
    await expect(run([fixture('text.pdf'), fixture('text.pdf')], { format: 'png' }, () => {}, tools)).rejects.toThrow(/one file/);
  });

  it('gives the 500 pages of pages-500.pdf as 500 PNGs and, separately, 500 JPGs, recording the size and peak', async () => {
    let peak = 0;
    const { outputs, progress } = await convert(fixture('pages-500.pdf'), 'png');
    for (const step of progress) if (step.stage === 'working') peak = Math.max(peak, step.done);
    expect(outputs).toHaveLength(500);
    expect(peak).toBe(500);
    const total = outputs.reduce((sum, bytes) => sum + bytes.length, 0);
    // Recorded in the fixtures README: about 10 MB of PNGs, so about 20 MB with the zip's copy.
    expect(total).toBeLessThan(40 * 1024 * 1024);
    for (const page of [0, 249, 499]) expect(await decode(outputs[page]!)).toMatchObject(a4);
    const jpgs = (await convert(fixture('pages-500.pdf'), 'jpg')).outputs;
    expect(jpgs).toHaveLength(500);
    expect(jpgs.every(isJpg)).toBe(true);
  }, 300000);
});

// ---------------------------------------------------------------------------
// Files made here

/** A PDF with `count` pages of `width` by `height` points, each with a line of drawing. */
async function pagesOf(width: number, height: number, count = 1) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < count; index++) {
    const page = doc.addPage([width, height]);
    page.drawRectangle({ x: width * 0.1, y: height * 0.1, width: width * 0.3, height: height * 0.2 });
  }
  return doc.save();
}

/** A one-page PDF of 72 by 72 points whose drawing sits inside `levels` nested knockout transparency groups. */
async function nestedGroups(levels: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([72, 72]);
  const context = doc.context;
  let inner = context.register(context.stream('0 0 1 rg 0 0 72 72 re f', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 72, 72] }));
  for (let level = 0; level < levels; level++) {
    inner = context.register(
      context.stream('/X Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 72, 72], Group: { S: 'Transparency', K: true, I: true }, Resources: { XObject: { X: inner } } }),
    );
  }
  page.node.set(PDFName.of('Resources'), context.obj({ XObject: { X: inner } }));
  page.node.set(PDFName.of('Contents'), context.register(context.stream('/X Do')));
  return doc.save();
}

/** A PDF of `count` pages of 72 by 72 points, each painting one full-page image mask twice, which PDF.js caches. */
async function twiceMasked(count: number) {
  const doc = await PDFDocument.create();
  const context = doc.context;
  // An 8 by 8 checkerboard mask, one bit per pixel, a byte per row.
  const bits = Uint8Array.from({ length: 8 }, (_, row) => (row % 2 === 0 ? 0xaa : 0x55));
  const mask = context.register(context.stream(bits, { Type: 'XObject', Subtype: 'Image', ImageMask: true, Width: 8, Height: 8, BitsPerComponent: 1 }));
  for (let index = 0; index < count; index++) {
    const page = doc.addPage([72, 72]);
    page.node.set(PDFName.of('Resources'), context.obj({ XObject: { M: mask } }));
    page.node.set(PDFName.of('Contents'), context.register(context.stream('0 0 1 rg q 72 0 0 72 0 0 cm /M Do Q q 72 0 0 72 0 0 cm /M Do Q')));
  }
  return doc.save();
}

describe('posters', () => {
  it('draws a 100 by 100 inch page at 4096 by 4096, not 15000 by 15000', async () => {
    const { outputs } = await convert(await pagesOf(7200, 7200), 'png');
    const seen = await decode(outputs[0]!);
    expect({ width: seen.width, height: seen.height }).toEqual({ width: 4096, height: 4096 });
    expect(seen.width * seen.height).toBeLessThanOrEqual(maxImagePixels);
  }, 60000);

  it('draws a 50 by 100 inch page keeping its shape, under 16,777,216 pixels', async () => {
    const { outputs } = await convert(await pagesOf(3600, 7200), 'jpg');
    const seen = await decode(outputs[0]!);
    expect(seen.width * seen.height).toBeLessThanOrEqual(16_777_216);
    expect({ width: seen.width, height: seen.height }).toEqual({ width: 2896, height: 5793 });
    expect(seen.height / seen.width).toBeCloseTo(2, 2);
  }, 60000);

  it('stops a small file of many poster pages once the pictures pass the cap, with TooManyPictures and its own sentence', async () => {
    // 1,000 poster pages share one drawing, so the file stays small. The real cap is 1 GB; here it is a few pictures.
    const posters = await pagesOf(7200, 7200, 1000);
    expect(posters.length).toBeLessThan(400_000);
    const [first] = (await convert(await pagesOf(7200, 7200), 'png')).outputs;
    const engine = makeRun({ maxOutputBytes: first!.length * 3 });
    const progress: Progress[] = [];
    const failed = await engine([posters], { format: 'png' }, (step) => progress.push(step), tools).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(TooManyPictures);
    expect(progress.at(-1)).toEqual({ stage: 'working', unit: 'page', done: 4, total: 1000 });
    expect(failureKind(failed)).toBe('too-many-pictures');
    expect(failureSentence(failureKind(failed), {})).toBe(
      'The pictures would add up to more than 1 GB, the most this tool makes at once. Use Extract pages or Split PDF first, then convert the parts.',
    );
    expect(maxOutputBytes).toBe(1024 * 1024 * 1024);
  }, 120000);
});

describe('limits on what one job holds', () => {
  it('refuses a page of nested transparency that asks for more canvas than four pictures, and draws a shallower one', async () => {
    // At 150 by 150 pixels the budget is 4 times that. Each knockout group asks PDF.js for two page-sized canvases.
    const engine = makeRun({ maxPixels: 150 * 150 });
    const shallow = await engine([await nestedGroups(1)], { format: 'png' }, () => {}, tools);
    expect((await decode(shallow[0]!)).ink).toBeGreaterThan(0.9);
    const failed = await engine([await nestedGroups(4)], { format: 'png' }, () => {}, tools).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(Error);
    expect((failed as Error).name).toBe('CanvasBudgetError');
    expect(failureKind(failed)).toBe('engine');
  });

  it("forgets the canvases PDF.js made for a page once it is drawn, though PDF.js drops its cached masks without saying so", async () => {
    // PDF.js keeps each mask it paints twice in a cache it empties without destroying, so counting them would
    // refuse a page after a few pages; each drawing's canvases are forgotten once it has settled.
    const engine = makeRun({ maxPixels: 150 * 150 });
    const outputs = await engine([await twiceMasked(30)], { format: 'png' }, () => {}, tools);
    expect(outputs).toHaveLength(30);
    for (const page of [0, 29]) expect((await decode(outputs[page]!)).ink).toBeGreaterThan(0.3);
  });

  it('refuses at once a file of more pages than one zip holds, before drawing any', async () => {
    let drawn = 0;
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const claiming: PdfjsModule = {
      AnnotationMode: pdfjs.AnnotationMode,
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 70_000,
          getPage: async () => {
            drawn++;
            throw new Error('not drawn');
          },
        }),
        destroy: async () => {},
      }),
    };
    const failed = await run([fixture('text.pdf')], { format: 'png' }, () => {}, { ...tools, pdfjs: async () => claiming }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(TooBigForZip);
    expect(failureKind(failed)).toBe('too-many-files');
    expect(drawn).toBe(0);
  });

  it('stops when the pictures would not fit in one zip', async () => {
    const engine = makeRun({ zipBytes: () => 500_000 });
    const failed = await convert(fixture('text.pdf'), 'png', undefined, engine).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(TooBigForZip);
    expect(failureKind(failed)).toBe('zip-too-large');
  });
});

describe('per page', () => {
  /** The real PDF.js, watched: each page's cleanup and the annotation mode it is drawn with. */
  async function watchedPdfjs() {
    const real = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
    const seen = { cleanups: [] as number[], modes: [] as unknown[], destroyed: 0 };
    const pdfjs: PdfjsModule = {
      AnnotationMode: real.AnnotationMode,
      getDocument(options) {
        const task = real.getDocument(options);
        return {
          destroy: () => {
            seen.destroyed++;
            return task.destroy();
          },
          promise: task.promise.then((doc) => ({
            numPages: doc.numPages,
            getPage: async (number: number) => {
              const page = await doc.getPage(number);
              return {
                getViewport: (given: { scale: number }) => page.getViewport(given),
                render: (given: Record<string, unknown>) => {
                  seen.modes.push(given.annotationMode);
                  return page.render(given);
                },
                cleanup: () => {
                  seen.cleanups.push(number);
                  return page.cleanup();
                },
              };
            },
          })),
        };
      },
    };
    return { seen, pdfjs, real };
  }

  it('lets go of each page after drawing it, draws with form values from storage, and closes the document', async () => {
    const { seen, pdfjs, real } = await watchedPdfjs();
    await run([fixture('text.pdf')], { format: 'jpg' }, () => {}, { ...tools, pdfjs: async () => pdfjs });
    expect(seen.cleanups).toEqual([1, 2, 3]);
    expect(seen.modes).toEqual([real.AnnotationMode.ENABLE_STORAGE, real.AnnotationMode.ENABLE_STORAGE, real.AnnotationMode.ENABLE_STORAGE]);
    expect(seen.destroyed).toBe(1);
  });

  it('lets go of the page and closes the document when a page fails to draw', async () => {
    const { seen, pdfjs } = await watchedPdfjs();
    const failing = await nestedGroups(4);
    await expect(makeRun({ maxPixels: 150 * 150 })([failing], { format: 'png' }, () => {}, { ...tools, pdfjs: async () => pdfjs })).rejects.toThrow();
    expect(seen.cleanups).toEqual([1]);
    expect(seen.destroyed).toBe(1);
  });
});

describe('a PDF.js worker that stops', () => {
  it('fails the job at once instead of leaving it on "Page n of m"', async () => {
    // A stand-in PDF.js whose worker never answers once it has stopped: drawing and closing both hang.
    const never = new Promise<never>(() => {});
    let rendering!: () => void;
    const started = new Promise<void>((resolve) => (rendering = resolve));
    const stalled: PdfjsModule & { GlobalWorkerOptions: { workerPort: unknown } } = {
      GlobalWorkerOptions: { workerPort: null },
      AnnotationMode: { ENABLE: 1, ENABLE_STORAGE: 3 },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 3,
          getPage: async () => ({
            getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 100 * scale }),
            render: () => {
              rendering();
              return { promise: never };
            },
            cleanup: () => true,
          }),
        }),
        destroy: () => never,
      }),
    };
    const port: NestedWorker = nestedWorker();
    const loader = createPdfjsLoader(async () => stalled, () => port);
    const given: EngineTools = { ...tools, pdfjs: () => loader.load(), pdfjsGuard: async () => loader.guard };
    const progress: Progress[] = [];
    const job = run([fixture('text.pdf')], { format: 'png' }, (step) => progress.push(step), given).catch((error: unknown) => error);
    await started;
    port.onerror?.({ preventDefault() {} });
    const failed = await Promise.race([job, new Promise((resolve) => setTimeout(() => resolve('still waiting'), 2000))]);
    expect(failed).toBeInstanceOf(Error);
    expect((failed as Error).message).toBe('PDF.js stopped.');
    expect(failureKind(failed)).toBe('engine');
    expect(progress).toEqual([{ stage: 'working', unit: 'page', done: 1, total: 3 }]);
  });
});
