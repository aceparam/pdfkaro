// The thumbnail function, run in Node with the real PDF.js and the real helper
// data, drawing through @napi-rs/canvas in place of the worker's OffscreenCanvas.

import { describe, expect, it } from 'vitest';
import { openDocument, renderPage, safeOptions } from '../../src/engines/thumbnail';
import type { EngineTools } from '../../src/engines/types';
import { box, fixture, look, tools } from './thumbnail-helpers';

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
