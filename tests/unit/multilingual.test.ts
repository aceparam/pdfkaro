// The multilingual test file (Hindi, Telugu, Arabic and Chinese, fonts embedded) and the Chinese file whose font is
// not embedded: the files themselves, and what no other loop over the test set checks (add-multilingual-fixture,
// design.md decision 6). Protect alone, Remove a password alone, Add page numbers, Watermark and Sign PDF run on both
// files in their own tests' loops over every fixture, which compare each page's text and content streams.
//
// A page's text is PDF.js's reading of it, compared before and after with U+0000 kept: PDF.js reads Hindi, Telugu and
// Arabic only in part, as it does not read the actual-text spans Chromium writes for shaped letter groups, so the
// content streams are also compared byte for byte, which covers those spans; Grayscale PDF's token by token outside
// its colour edits, which still covers them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { openDocument, type PdfjsModule } from '../../src/engines/thumbnail';
import type { Engine, EngineTools } from '../../src/engines/types';
import { run as numberPages } from '../../src/engines/tools/add-page-numbers';
import { run as compress } from '../../src/engines/tools/compress-pdf';
import { run as deletePages } from '../../src/engines/tools/delete-pdf-pages';
import { run as extract } from '../../src/engines/tools/extract-pdf-pages';
import { run as grayscale } from '../../src/engines/tools/grayscale-pdf';
import { run as merge } from '../../src/engines/tools/merge-pdf';
import { run as pdfToImages } from '../../src/engines/tools/pdf-to-images';
import { run as protect } from '../../src/engines/tools/protect-pdf';
import { run as rearrange } from '../../src/engines/tools/rearrange-pdf-pages';
import { run as rotate } from '../../src/engines/tools/rotate-pdf';
import { run as sign } from '../../src/engines/tools/sign-pdf';
import { run as split } from '../../src/engines/tools/split-pdf';
import { run as unlock } from '../../src/engines/tools/unlock-pdf';
import { run as repair } from '../../src/engines/tools/repair-pdf';
import { damagedCopy } from './repair-helpers';
import { run as watermark } from '../../src/engines/tools/watermark-pdf';
import { canonical } from './grayscale-helpers';
import { jsonOf, makeQpdf, pageStreams, texts } from './stamp-helpers';
import { box, fixture, tools as drawingTools } from './thumbnail-helpers';

const tools: EngineTools = { ...drawingTools, qpdf: makeQpdf };
const words = JSON.parse(readFileSync(join(__dirname, '../fixtures/multilingual-text.json'), 'utf8')) as {
  pages: { lang: string; lines: (string | { label: string; text: string })[]; heading: string }[];
};
const multilingual = fixture('multilingual.pdf');
const unembedded = fixture('chinese-unembedded.pdf');
const newPassword = 'a new one';

const runOn = <T>(engine: Engine<T>, files: Uint8Array[], options: T) => engine(files.map((file) => file.slice()), options, () => {}, tools);

/** Each page's text as PDF.js reads it, its items joined. */
const pageTexts = async (bytes: Uint8Array) => (await texts(bytes)).map((items) => items.join(''));

type Json = Record<string, unknown>;
/** Every font in every page's resources: its dictionary, its descendant and its font descriptor. */
async function pageFonts(bytes: Uint8Array, given?: string) {
  const { pages, objects } = await jsonOf(bytes, given);
  const value = (ref: unknown) => (typeof ref === 'string' ? ((objects[`obj:${ref}`]?.value ?? objects[`obj:${ref}`]?.stream?.dict) as Json | undefined) : (ref as Json | undefined));
  return pages.map(({ object }) => {
    const page = value(object)!;
    const resources = value(page['/Resources'])!;
    const fonts = value(resources['/Font']) ?? {};
    return Object.values(fonts).map((ref) => {
      const font = value(ref)!;
      const descendant = value((font['/DescendantFonts'] as unknown[] | undefined)?.[0]);
      return { font, descendant, descriptor: value(descendant?.['/FontDescriptor']) };
    });
  });
}

/** How many pixels of a picture are darker than paper, overall and in a band of rows given as shares of its height. */
async function darkPixels(picture: Uint8Array, band?: [number, number], threshold = 384) {
  const image = await loadImage(Buffer.from(picture));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const [top, bottom] = band ? [Math.floor(band[0] * image.height), Math.ceil(band[1] * image.height)] : [0, image.height];
  let dark = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * 4;
      if (data[at]! + data[at + 1]! + data[at + 2]! < threshold) dark++;
    }
  }
  return dark;
}

/** Every font on every one of the five pages is a Type 0 Noto subset with a Unicode map and an embedded TrueType font file. */
async function expectEmbedded(bytes: Uint8Array) {
  const fonts = await pageFonts(bytes);
  expect(fonts).toHaveLength(5);
  for (const [index, page] of fonts.entries()) {
    expect(page.length, `page ${index + 1}`).toBeGreaterThan(0);
    for (const { font, descriptor } of page) {
      expect(font['/Subtype'], `page ${index + 1}`).toBe('/Type0');
      expect(String(font['/BaseFont']), `page ${index + 1}`).toMatch(/^\/[A-Z]{6}\+Noto/);
      expect(font['/ToUnicode'], `page ${index + 1}`).toBeTruthy();
      expect(descriptor?.['/FontFile2'], `page ${index + 1} ${String(font['/BaseFont'])}`).toBeTruthy();
    }
  }
}

describe('multilingual.pdf itself', () => {
  it('has five pages, one per script and one with all four', async () => {
    expect(words.pages.map((page) => page.lang)).toEqual(['hi', 'te', 'ar', 'zh-Hans', 'en']);
    expect((await texts(multilingual)).length).toBe(5);
  });

  it('embeds every font on every page as a Type 0 TrueType subset with a Unicode map', async () => {
    await expectEmbedded(multilingual);
  });

  it('the embedded check fails on a copy with one font file taken out', async () => {
    const { PDFDocument, PDFDict, PDFName } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(multilingual.slice(), { updateMetadata: false });
    let taken = 0;
    for (const [, object] of doc.context.enumerateIndirectObjects()) {
      if (taken === 0 && object instanceof PDFDict && object.get(PDFName.of('Type'))?.toString() === '/FontDescriptor') {
        object.delete(PDFName.of('FontFile2'));
        taken++;
      }
    }
    expect(taken).toBe(1);
    await expect(expectEmbedded(await doc.save({ useObjectStreams: false }))).rejects.toThrow();
  });

  it('PDF.js reads the Chinese page exactly', async () => {
    const chinese = words.pages[3]!;
    const read = (await pageTexts(multilingual))[3]!.replace(/\s/g, '');
    for (const line of [chinese.heading, ...(chinese.lines as string[])]) expect(read).toContain(line.replace(/\s/g, ''));
  });

  it('the Hindi, Telugu and Arabic pages hold actual-text spans for their shaped letter groups', async () => {
    const streams = await pageStreams(multilingual);
    for (const index of [0, 1, 2]) expect(streams[index]!.join('\n'), `page ${index + 1}`).toMatch(/\/ActualText\s*<feff/i);
  });
});

describe('chinese-unembedded.pdf itself', () => {
  it('has one page whose Chinese font is not embedded and is reached through UniGB-UCS2-H', async () => {
    const fonts = (await pageFonts(unembedded)).flat();
    expect(fonts).toHaveLength(1);
    const [{ font, descendant, descriptor }] = fonts as [(typeof fonts)[number]];
    expect(font['/BaseFont']).toBe('/STSong-Light-UniGB-UCS2-H');
    expect(font['/Encoding']).toBe('/UniGB-UCS2-H');
    expect(descendant?.['/Subtype']).toBe('/CIDFontType0');
    for (const key of ['/FontFile', '/FontFile2', '/FontFile3']) expect(descriptor?.[key]).toBeUndefined();
  });
});

describe('the tools no other loop covers keep the text and content of every page they keep', { timeout: 120_000 }, () => {
  /** Checks that each output page, by number, reads and holds what the input page of the same index did. */
  async function expectKept(input: Uint8Array, output: Uint8Array, pages: number[]) {
    const [textBefore, textAfter] = [await pageTexts(input), await pageTexts(output)];
    const [streamsBefore, streamsAfter] = [await pageStreams(input), await pageStreams(output)];
    expect(textAfter.slice(0, pages.length)).toEqual(pages.map((page) => textBefore[page - 1]));
    expect(streamsAfter.slice(0, pages.length)).toEqual(pages.map((page) => streamsBefore[page - 1]));
  }

  it('Merge PDF, with text.pdf after it: pages 1 to 5 as they were', async () => {
    const [output] = await runOn(merge, [multilingual, fixture('text.pdf')], { passwords: [undefined, undefined] });
    expect((await texts(output!)).length).toBe(8);
    await expectKept(multilingual, output!, [1, 2, 3, 4, 5]);
  });

  it('Split PDF: part n is page n', async () => {
    const parts = await runOn(split, [multilingual], { cuts: [], passwords: [undefined] });
    expect(parts).toHaveLength(5);
    for (const [index, part] of parts.entries()) await expectKept(multilingual, part, [index + 1]);
  });

  it('Extract pages 2 and 4', async () => {
    const [output] = await runOn(extract, [multilingual], { pages: [2, 4], passwords: [undefined] });
    expect((await texts(output!)).length).toBe(2);
    await expectKept(multilingual, output!, [2, 4]);
  });

  it('Delete page 1: pages 2 to 5 left', async () => {
    const [output] = await runOn(deletePages, [multilingual], { pages: [1], passwords: [undefined] });
    expect((await texts(output!)).length).toBe(4);
    await expectKept(multilingual, output!, [2, 3, 4, 5]);
  });

  it('Reorder pages, reversed', async () => {
    const [output] = await runOn(rearrange, [multilingual], { order: [5, 4, 3, 2, 1], passwords: [undefined] });
    await expectKept(multilingual, output!, [5, 4, 3, 2, 1]);
  });

  it('Rotate PDF, every page a quarter turn', async () => {
    const [output] = await runOn(rotate, [multilingual], { turns: { all: 1, pages: [] }, passwords: [undefined] });
    await expectKept(multilingual, output!, [1, 2, 3, 4, 5]);
  });

  it('Compress PDF: smaller (48,414 bytes to 37,027 when measured, by packing objects), every page as it was', async () => {
    const outputs = await runOn(compress, [multilingual], { passwords: [undefined] });
    expect(outputs).toHaveLength(1);
    expect(outputs[0]!.length).toBeLessThan(multilingual.length);
    await expectKept(multilingual, outputs[0]!, [1, 2, 3, 4, 5]);
  });

  it('Protect with a password, then Remove a password with it: every page as it was', async () => {
    const [protectedFile] = await runOn(protect, [multilingual], { newPassword, passwords: [undefined] });
    const [output] = await runOn(unlock, [protectedFile!], { passwords: [newPassword] });
    await expectKept(multilingual, output!, [1, 2, 3, 4, 5]);
  });

  it('Repair PDF, on a damaged copy (its startxref pointing into its first object): every page as it was (add-repair-pdf)', async () => {
    const [output] = await runOn(repair, [damagedCopy(multilingual)], { passwords: [undefined] });
    expect(output).toBeDefined();
    await expectKept(multilingual, output!, [1, 2, 3, 4, 5]);
  });

  it('Grayscale PDF: every page reads the same, and holds the same tokens outside the colour edits (add-grayscale-pdf)', async () => {
    const [output] = await runOn(grayscale, [multilingual], { passwords: [undefined] });
    const [textBefore, textAfter] = [await pageTexts(multilingual), await pageTexts(output!)];
    expect(textAfter).toEqual(textBefore);
    const [streamsBefore, streamsAfter] = [await pageStreams(multilingual), await pageStreams(output!)];
    expect(streamsAfter.length).toBe(streamsBefore.length);
    // Token by token outside the edits of its design decision 4, not byte for byte: its colour operators are rewritten.
    streamsAfter.forEach((streams, index) => expect(canonical(streams.join('\n')), `page ${index + 1}`).toEqual(canonical(streamsBefore[index]!.join('\n'))));
    expect(streamsAfter.flat().join('\n')).not.toEqual(streamsBefore.flat().join('\n'));
  });

  it('the comparison fails on an output that lost a page\'s text, or one changed byte of a content stream', async () => {
    const { PDFDocument, PDFName } = await import('@cantoo/pdf-lib');
    const lost = await PDFDocument.load(multilingual.slice(), { updateMetadata: false });
    lost.getPage(2).node.set(PDFName.of('Contents'), lost.context.register(lost.context.flateStream('')));
    await expect(expectKept(multilingual, await lost.save(), [1, 2, 3, 4, 5])).rejects.toThrow();
    const changed = await PDFDocument.load(multilingual.slice(), { updateMetadata: false });
    const streams = await pageStreams(multilingual);
    changed.getPage(0).node.set(PDFName.of('Contents'), changed.context.register(changed.context.flateStream(streams[0]!.join('\n').replace('BT', 'BT '))));
    await expect(expectKept(multilingual, await changed.save(), [1, 2, 3, 4, 5])).rejects.toThrow();
  });
});

describe('chinese-unembedded.pdf keeps its text through the tools', { timeout: 120_000 }, () => {
  it('the page tools keep its text operators and font reference; Protect and the tools that draw on pages keep its font reference', async () => {
    const [streamBefore] = await pageStreams(unembedded);
    const shown = streamBefore!.join('\n').match(/<[0-9a-f]+> Tj/g)!;
    expect(shown).toHaveLength(2);
    const results: [string, Uint8Array, string | undefined][] = [];
    const one = async (name: string, outputs: Promise<Uint8Array[]>, given?: string) => results.push([name, (await outputs)[0]!, given]);
    await one('Merge PDF', runOn(merge, [unembedded, fixture('text.pdf')], { passwords: [undefined, undefined] }));
    await one('Split PDF', runOn(split, [unembedded], { cuts: [], passwords: [undefined] }));
    await one('Extract pages', runOn(extract, [unembedded], { pages: [1], passwords: [undefined] }));
    await one('Reorder pages', runOn(rearrange, [unembedded], { order: [1], passwords: [undefined] }));
    await one('Rotate PDF', runOn(rotate, [unembedded], { turns: { all: 1, pages: [] }, passwords: [undefined] }));
    await one('Protect with a password', runOn(protect, [unembedded], { newPassword, passwords: [undefined] }), newPassword);
    await one('Add page numbers', runOn(numberPages, [unembedded], { position: 'bottom-centre', passwords: [undefined] }));
    await one('Watermark', runOn(watermark, [unembedded], { text: 'DRAFT', passwords: [undefined] }));
    await one('Sign PDF', runOn(sign, [unembedded], { source: 'type', name: 'Ann Lee', page: 'last', position: 'bottom-right', passwords: [undefined] }));
    // Delete pages refuses to delete the only page, so it has no result here. Protect's, Add page numbers', Watermark's and
    // Sign PDF's own loops over every fixture already compare this file's content streams, so only the font reference
    // is checked here for them: a check for one file inside those loops would be a special case in a generic loop.
    const streamsCompared = new Set(['Merge PDF', 'Split PDF', 'Extract pages', 'Reorder pages', 'Rotate PDF']);
    for (const [name, output, given] of results) {
      if (streamsCompared.has(name)) {
        const content = (await pageStreams(output, given))[0]!.join('\n');
        for (const operator of shown) expect(content, name).toContain(operator);
      }
      const fonts = (await pageFonts(output, given))[0]!.map(({ font }) => font);
      expect(fonts.some((font) => font['/BaseFont'] === '/STSong-Light-UniGB-UCS2-H' && font['/Encoding'] === '/UniGB-UCS2-H'), name).toBe(true);
    }
  });
});

// The fewest dark pixels each page's 150-pixels-to-the-inch picture of multilingual.pdf showed when measured, in JPG
// and PNG (Chromium 153, PDF.js 6.5.438; 11,462, 10,974, 5,844, 8,417 and 10,674 in JPG), halved for a wide margin:
// a page that loses its text falls far below.
const pictureInk = [5_700, 5_400, 2_900, 4_200, 5_300];
// The same for 104 by 136 thumbnails, counting pixels lighter grey too, as a thumbnail's text is mostly grey.
const thumbnailInk = [60, 65, 29, 50, 65];

/** Where each script's line of page 5 sits, from PDF.js's placing of its text items, as shares of the page height from the top. */
const mixedPageBands = (() => {
  let bands: Promise<[number, number][]> | undefined;
  return () => (bands ??= readMixedPageBands());
})();

async function readMixedPageBands(): Promise<[number, number][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: multilingual.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const page = await doc.getPage(5);
  const height = page.view[3]! - page.view[1]!;
  const items = (await page.getTextContent()).items.filter((item) => 'str' in item && item.str.trim() !== '') as { str: string; transform: number[]; height: number }[];
  const bands = (words.pages[4]!.lines as { label: string }[]).map((line) => {
    const label = items.find((item) => item.str.startsWith(line.label.trim()))!;
    const baseline = label.transform[5]!;
    return [(height - baseline - label.height) / height, (height - baseline + label.height * 0.4) / height] as [number, number];
  });
  await doc.loadingTask.destroy();
  return bands;
}

describe('pictures and thumbnails', { timeout: 120_000 }, () => {
  for (const format of ['jpg', 'png'] as const) {
    it(`PDF to ${format.toUpperCase()} draws every page's text of multilingual.pdf`, async () => {
      const pictures = await runOn(pdfToImages, [multilingual], { format, passwords: [undefined] });
      expect(pictures).toHaveLength(5);
      for (const [index, picture] of pictures.entries()) expect(await darkPixels(picture), `page ${index + 1}`).toBeGreaterThan(pictureInk[index]!);
      // On the mixed page, each script's line shows ink in its own band, beyond the English label before it.
      const bands = await mixedPageBands();
      const labelOnly = await darkPixelsOfLabels(format);
      for (const [index, band] of bands.entries()) expect(await darkPixels(pictures[4]!, band), `line ${index + 1}`).toBeGreaterThan(labelOnly[index]! * 1.3);
    });
  }

  it('the bound fails on a blank page, and the band fails on page 5 with one line taken out', async () => {
    const { PDFDocument, PDFName } = await import('@cantoo/pdf-lib');
    const blank = await PDFDocument.load(multilingual.slice(), { updateMetadata: false });
    blank.getPage(0).node.set(PDFName.of('Contents'), blank.context.register(blank.context.flateStream('')));
    const [picture] = await runOn(pdfToImages, [await blank.save()], { format: 'png', passwords: [undefined] });
    expect(await darkPixels(picture!)).toBeLessThan(pictureInk[0]!);
    const streams = await pageStreams(multilingual);
    const cut = await PDFDocument.load(multilingual.slice(), { updateMetadata: false });
    // The last text object on page 5 draws the Chinese words; without it, the Chinese line holds only its label.
    const content = streams[4]!.join('\n');
    const last = content.lastIndexOf('BT');
    cut.getPage(4).node.set(PDFName.of('Contents'), cut.context.register(cut.context.flateStream(content.slice(0, last) + content.slice(content.indexOf('ET', last) + 2))));
    const pictures = await runOn(pdfToImages, [await cut.save()], { format: 'png', passwords: [undefined] });
    const bands = await mixedPageBands();
    const labelOnly = await darkPixelsOfLabels('png');
    expect(await darkPixels(pictures[4]!, bands[3])).toBeLessThanOrEqual(labelOnly[3]! * 1.3);
  });

  it('thumbnails of multilingual.pdf show every page\'s text', async () => {
    const doc = await openDocument(multilingual.slice(), undefined, tools);
    for (let page = 1; page <= 5; page++) expect(await darkPixels(await doc.render(page, box), undefined, 600), `page ${page}`).toBeGreaterThan(thumbnailInk[page - 1]!);
    await doc.close();
  });

  it('chinese-unembedded.pdf is drawn without failing, with no Chinese drawn: the 11 Nov 2026 character-map gap', async () => {
    // This records today's gap (the owner's fixed PDF.js helper data holds no character maps). It changes when the
    // owner answers the character-map question in CLAUDE.md; the fixtures README says the same.
    for (const format of ['jpg', 'png'] as const) {
      const [picture] = await runOn(pdfToImages, [unembedded], { format, passwords: [undefined] });
      expect(await darkPixels(picture!), format).toBe(0);
    }
    const doc = await openDocument(unembedded.slice(), undefined, tools);
    expect(await darkPixels(await doc.render(1, box), undefined, 600)).toBe(0);
    await doc.close();
  });
});

/** The dark pixels of each English label on page 5 alone, worked out once per format. */
const labelInk = new Map<'jpg' | 'png', Promise<number[]>>();
function darkPixelsOfLabels(format: 'jpg' | 'png'): Promise<number[]> {
  if (!labelInk.has(format)) labelInk.set(format, readDarkPixelsOfLabels(format));
  return labelInk.get(format)!;
}

/** The dark pixels of each English label on page 5 alone, drawn from a copy with the four scripts' words taken out. */
async function readDarkPixelsOfLabels(format: 'jpg' | 'png'): Promise<number[]> {
  const { PDFDocument, PDFName } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.load(multilingual.slice(), { updateMetadata: false });
  const content = (await pageStreams(multilingual))[4]!.join('\n');
  // Keeps only the text objects whose font is the one the heading uses (the Latin face), dropping the scripts' words.
  const font = /\/(F\d+) [\d.]+ Tf/.exec(content)![1];
  const kept = content.replace(/BT[\s\S]*?ET/g, (block) => (block.includes(`/${font} `) ? block : ''));
  doc.getPage(4).node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(kept)));
  const pictures = await runOn(pdfToImages, [await doc.save()], { format, passwords: [undefined] });
  const bands = await mixedPageBands();
  return Promise.all(bands.map((band) => darkPixels(pictures[4]!, band)));
}

describe('character maps are asked for in memory only', () => {
  /** A tools whose PDF.js records each call to the data factory it is given. */
  function recordingTools(calls: { kind: string; filename: string; refused?: boolean }[]): EngineTools {
    return {
      ...tools,
      pdfjs: async () => {
        const real = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
        return {
          ...real,
          AnnotationMode: real.AnnotationMode,
          getDocument(options: Record<string, unknown>) {
            const Factory = options.BinaryDataFactory as new () => { fetch(request: { kind: string; filename: string }): Promise<Uint8Array> };
            class Recording extends Factory {
              override fetch(request: { kind: string; filename: string }) {
                const call: { kind: string; filename: string; refused?: boolean } = { kind: request.kind, filename: request.filename };
                calls.push(call);
                const answer = super.fetch(request);
                answer.then(
                  () => (call.refused = false),
                  () => (call.refused = true),
                );
                return answer;
              }
            }
            return real.getDocument({ ...options, BinaryDataFactory: Recording });
          },
        };
      },
    };
  }

  it('chinese-unembedded.pdf asks once per document for UniGB-UCS2-H, which is refused; multilingual.pdf asks for none', async () => {
    const calls: { kind: string; filename: string; refused?: boolean }[] = [];
    const doc = await openDocument(unembedded.slice(), undefined, recordingTools(calls));
    await doc.render(1, box);
    await doc.close();
    // Refused by the fixed helper data, which holds no character maps.
    expect(calls.filter((call) => call.kind === 'cMapUrl')).toEqual([{ kind: 'cMapUrl', filename: 'UniGB-UCS2-H.bcmap', refused: true }]);

    const none: { kind: string; filename: string; refused?: boolean }[] = [];
    const other = await openDocument(multilingual.slice(), undefined, recordingTools(none));
    for (let page = 1; page <= 5; page++) await other.render(page, box);
    await other.close();
    expect(none.filter((call) => call.kind === 'cMapUrl')).toEqual([]);
  });
});
