// The thumbnail function, run in Node with the real PDF.js and the real helper
// data, drawing through @napi-rs/canvas in place of the worker's OffscreenCanvas.

import { describe, expect, it } from 'vitest';
import { CanvasBudgetError, maxImagePixels, openDocument, pictureSize, renderPage, safeOptions, type PdfjsModule } from '../../src/engines/thumbnail';
import type { EngineTools } from '../../src/engines/types';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { box, canvasMaker, fixture, look, tools } from './thumbnail-helpers';

// The JPEG 2000 decoder is checked in thumbnail-decoders.test.ts: PDF.js keeps a
// decoder once loaded, so that test needs a fresh copy of PDF.js.

describe('drawing a page', () => {
  const readable: [string, string | undefined][] = [
    ['text.pdf', undefined],
    ['pages-500.pdf', undefined],
    ['scanned.pdf', undefined],
    ['password.pdf', 'open-sesame'],
    ['restricted.pdf', undefined],
    ['warning.pdf', undefined],
    ['form.pdf', undefined],
    ['mixed.pdf', undefined],
    ['rich.pdf', undefined],
    ['images.pdf', undefined],
  ];
  it.each(readable)('draws page 1 of %s inside the box, not blank', async (name, password) => {
    const png = await renderPage(fixture(name), 1, box, password, tools);
    const seen = await look(png);
    expect(seen.width).toBeLessThanOrEqual(box.width);
    expect(seen.height).toBeLessThanOrEqual(box.height);
    expect(Math.max(seen.width, seen.height)).toBeGreaterThan(90);
    expect(seen.ink).toBeGreaterThan(0.0005);
  }, 30000);

  /** The helper data, recording what PDF.js asks for. */
  async function watched() {
    const { pdfjsData } = await import('../../src/workers/pdfjs-data');
    const asked: string[] = [];
    const data = {
      font: (name: string) => (asked.push(name), pdfjsData.font(name)),
      decoder: (name: string) => (asked.push(name), pdfjsData.decoder(name)),
    };
    return { asked, tools: { ...tools, pdfjsData: async () => data } as EngineTools };
  }

  it("takes the ordinary file's font from the fixed helper data", async () => {
    const { asked, tools: watching } = await watched();
    await renderPage(fixture('text.pdf'), 1, box, undefined, watching);
    expect(asked).toContain('LiberationSans-Regular.ttf');
  });

  it('keeps the shape of a wide page', async () => {
    const seen = await look(await renderPage(fixture('mixed.pdf'), 2, box, undefined, tools));
    expect(seen.width).toBe(box.width);
    expect(seen.height).toBeLessThan(seen.width);
  });

  it('fits a very tall page inside the box', async () => {
    const seen = await look(await renderPage(fixture('mixed.pdf'), 1, { width: 104, height: 40 }, undefined, tools));
    expect(seen.height).toBeLessThanOrEqual(40);
  });

  it('refuses damaged files, a missing password and a page that does not exist', async () => {
    // damaged-xref.pdf is left out: PDF.js repairs it, though qpdf cannot read it. The page asks for
    // thumbnails only of files that qpdf has read, so it never gets that far.
    for (const name of ['damaged-cut.pdf', 'not-a-pdf.pdf']) {
      await expect(renderPage(fixture(name), 1, box, undefined, tools)).rejects.toThrow();
    }
    await expect(renderPage(fixture('password.pdf'), 1, box, undefined, tools)).rejects.toThrow();
    await expect(renderPage(fixture('password.pdf'), 1, box, 'wrong', tools)).rejects.toThrow();
    await expect(renderPage(fixture('text.pdf'), 4, box, undefined, tools)).rejects.toThrow();
  });

});

describe('an open document', () => {
  it('draws many pages of one file without opening it again', async () => {
    const doc = await openDocument(fixture('pages-500.pdf'), undefined, tools);
    expect(doc.pages).toBe(500);
    for (const page of [1, 2, 250, 500]) {
      const seen = await look(await doc.render(page, box));
      expect(seen.ink).toBeGreaterThan(0.0005);
    }
    await expect(doc.render(501, box)).rejects.toThrow();
    await doc.close();
  }, 30000);

  it('cannot draw once closed, and closing twice is harmless', async () => {
    const doc = await openDocument(fixture('text.pdf'), undefined, tools);
    await doc.close();
    await doc.close();
    await expect(doc.render(1, box)).rejects.toThrow(/closed/);
  });

  it('refuses to open a damaged file or a protected one without its password', async () => {
    await expect(openDocument(fixture('damaged-cut.pdf'), undefined, tools)).rejects.toThrow();
    await expect(openDocument(fixture('password.pdf'), undefined, tools)).rejects.toThrow();
    const opened = await openDocument(fixture('password.pdf'), 'open-sesame', tools);
    expect(opened.pages).toBe(3);
    await opened.close();
  });
});

describe('the options given to PDF.js', () => {
  it('leave every helper address unset except a decoder address that is not on the network', () => {
    expect(safeOptions).toMatchObject({ useWorkerFetch: false, disableFontFace: true, enableXfa: false, verbosity: 0, wasmUrl: 'data:,/' });
    for (const unset of ['cMapUrl', 'standardFontDataUrl', 'iccUrl']) expect(safeOptions).not.toHaveProperty(unset);
  });

  it('are accepted by the real PDF.js, which refuses an address without a trailing slash', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ ...safeOptions, data: fixture('text.pdf') });
    await expect(task.promise).resolves.toBeTruthy();
    await task.destroy();
    expect(() => pdfjs.getDocument({ ...safeOptions, wasmUrl: 'data:,', data: fixture('text.pdf') })).toThrow(/trailing slash/);
  });
});

describe('the size of a whole page', () => {
  it('keeps a page under the cap as it is, rounded, each side at least 1', () => {
    expect(pictureSize(1239.58, 1754.17, maxImagePixels)).toEqual({ width: 1240, height: 1754, shrink: 1 });
    expect(pictureSize(0.2, 0.3, maxImagePixels)).toMatchObject({ width: 1, height: 1 });
  });

  it('scales a poster down to the cap, keeping its shape: 4096 by 4096 for a square, about 2896 by 5793 at 1:2', () => {
    expect(pictureSize(15000, 15000, maxImagePixels)).toMatchObject({ width: 4096, height: 4096 });
    const tall = pictureSize(7500, 15000, maxImagePixels);
    expect(tall).toMatchObject({ width: 2896, height: 5793 });
    expect(tall.width * tall.height).toBeLessThanOrEqual(16_777_216);
  });

  it('never passes the cap, however the sides round, even for a page too thin to keep its shape', () => {
    for (const [width, height] of [[10001, 10003], [3, 99999999], [99999999, 3], [0.001, 1e9], [12345.6, 6543.21]]) {
      const size = pictureSize(width!, height!, maxImagePixels);
      expect(size.width * size.height, `${width} by ${height}`).toBeLessThanOrEqual(maxImagePixels);
      expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(1);
    }
  });

  it('refuses a page with no size', () => {
    for (const [width, height] of [[0, 10], [10, -1], [Number.NaN, 10], [Number.POSITIVE_INFINITY, 10]]) expect(() => pictureSize(width!, height!, 100)).toThrow();
  });
});

describe('drawing a whole page', () => {
  const scale = 150 / 72;

  it('draws an A4 page at 150 to the inch as PNG and as JPG, each checked by its first bytes', async () => {
    const doc = await openDocument(fixture('text.pdf'), undefined, tools);
    const png = await doc.draw(1, { scale, maxPixels: maxImagePixels, format: 'png' });
    const jpg = await doc.draw(1, { scale, maxPixels: maxImagePixels, format: 'jpg', quality: 0.85 });
    expect([png.width, png.height, jpg.width, jpg.height]).toEqual([1240, 1754, 1240, 1754]);
    expect([...png.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([...jpg.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(await look(png.bytes)).toMatchObject({ width: 1240, height: 1754 });
    expect((await look(jpg.bytes)).ink).toBeGreaterThan(0.0005);
    await doc.close();
  });

  it("follows each page's turn: mixed.pdf's Letter page on its side and its A5 page turned a quarter are drawn wide", async () => {
    const doc = await openDocument(fixture('mixed.pdf'), undefined, tools);
    const sizes = [];
    for (let page = 1; page <= 4; page++) {
      const drawn = await doc.draw(page, { scale, maxPixels: maxImagePixels, format: 'png' });
      sizes.push([drawn.width, drawn.height]);
    }
    expect(sizes).toEqual([[1240, 1754], [1650, 1275], [1240, 875], [1240, 1754]]);
    await doc.close();
  });

  it('draws to the cap it is given, keeping the shape', async () => {
    const doc = await openDocument(fixture('text.pdf'), undefined, tools);
    const drawn = await doc.draw(1, { scale, maxPixels: 10_000, format: 'png' });
    expect(drawn.width * drawn.height).toBeLessThanOrEqual(10_000);
    expect(drawn.height / drawn.width).toBeCloseTo(842 / 595, 1);
    await doc.close();
  });

  it('refuses a JPG with no JPG encoder, a format it does not know, a bad scale and a page that does not exist', async () => {
    const plain = { ...tools, canvas: async () => canvasMaker };
    const doc = await openDocument(fixture('text.pdf'), undefined, plain);
    await expect(doc.draw(1, { scale, maxPixels: maxImagePixels, format: 'jpg' })).rejects.toThrow(/JPG encoder/);
    await expect(doc.draw(1, { scale, maxPixels: maxImagePixels, format: 'gif' as 'png' })).rejects.toThrow(/format/);
    await expect(doc.draw(1, { scale: 0, maxPixels: maxImagePixels, format: 'png' })).rejects.toThrow(/scale/);
    await expect(doc.draw(4, { scale, maxPixels: maxImagePixels, format: 'png' })).rejects.toThrow(/No such page/);
    await doc.close();
    await expect(doc.draw(1, { scale, maxPixels: maxImagePixels, format: 'png' })).rejects.toThrow(/closed/);
  });

  it("counts PDF.js's own canvases and the picture's against four times the cap, and lets each go once drawn", async () => {
    // Three nested knockout groups each ask PDF.js for two page-sized canvases: with the picture, seven at once.
    const file = await PDFDocument.create();
    const page = file.addPage([72, 72]);
    const context = file.context;
    let inner = context.register(context.stream('1 0 0 rg 0 0 72 72 re f', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 72, 72] }));
    for (let level = 0; level < 3; level++) {
      inner = context.register(context.stream('/X Do', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 72, 72], Group: { S: 'Transparency', K: true, I: true }, Resources: { XObject: { X: inner } } }));
    }
    page.node.set(PDFName.of('Resources'), context.obj({ XObject: { X: inner } }));
    page.node.set(PDFName.of('Contents'), context.register(context.stream('/X Do')));
    const bytes = await file.save();
    // Counting what the canvas maker holds: every canvas made is released by the end.
    let live = 0;
    const sizes = new Map<unknown, number>();
    let pixels = 0;
    let peak = 0;
    const counting = {
      ...tools,
      canvas: async () => ({
        ...(await tools.canvas!()) as typeof canvasMaker,
        create(width: number, height: number) {
          live++;
          const pair = canvasMaker.create(width, height);
          sizes.set(pair.canvas, width * height);
          pixels += width * height;
          peak = Math.max(peak, pixels);
          return pair;
        },
        release(canvas: unknown) {
          live--;
          pixels -= sizes.get(canvas) ?? 0;
          sizes.delete(canvas);
          canvasMaker.release(canvas);
        },
      }),
    };
    const doc = await openDocument(bytes.slice(), undefined, counting);
    // The page fits a budget large enough for seven page-sized canvases, and every canvas is let go after.
    const drawn = await doc.draw(1, { scale, maxPixels: 7 * 150 * 150, format: 'png' });
    expect(drawn).toMatchObject({ width: 150, height: 150 });
    expect((await look(drawn.bytes)).ink).toBeGreaterThan(0.9);
    expect(live).toBe(0);
    const failed = await doc.draw(1, { scale, maxPixels: 150 * 150, format: 'png' }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(CanvasBudgetError);
    // PDF.js does not destroy the canvases a failed drawing held, so the count is forgotten once a drawing settles:
    // the same open document then draws the page again within the larger budget, as a kept thumbnail document would.
    // A budget of exactly what the drawing needs at its peak: leftovers still counted would refuse it.
    const again = await doc.draw(1, { scale, maxPixels: Math.ceil(peak / 4), format: 'png' });
    expect(again).toMatchObject({ width: 150, height: 150 });
    await doc.close();
  });

  it('draws thumbnails as before: inside the box, with annotations drawn as PDF.js draws them by default', async () => {
    const real = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
    const modes: unknown[] = [];
    const watching: PdfjsModule = {
      AnnotationMode: real.AnnotationMode,
      getDocument(options) {
        const task = real.getDocument(options);
        return {
          destroy: () => task.destroy(),
          promise: task.promise.then((doc) => ({
            numPages: doc.numPages,
            getPage: async (number: number) => {
              const page = await doc.getPage(number);
              return {
                getViewport: (given: { scale: number }) => page.getViewport(given),
                render: (given: Record<string, unknown>) => (modes.push(given.annotationMode), page.render(given)),
                cleanup: () => page.cleanup(),
              };
            },
          })),
        };
      },
    };
    const png = await renderPage(fixture('text.pdf'), 1, box, undefined, { ...tools, pdfjs: async () => watching });
    expect(await look(png)).toMatchObject({ width: 96, height: 136 });
    expect(modes).toEqual([real.AnnotationMode.ENABLE]);
  });
});

