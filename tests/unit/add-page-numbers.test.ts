// The Add page numbers engine: where a number goes, the place refused before
// any work, and real runs on every file in the shared test set with the same
// qpdf and pdf-lib the browser gets, each result read back by qpdf and PDF.js.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { digitHeight, inspect, numberPlace, run, type Position } from '../../src/engines/tools/add-page-numbers';
import { failureKind } from '../../src/workers/worker-core';
import type { EngineTools, Progress } from '../../src/engines/types';
import { optionValues } from '../../src/widget/option-values';
import { fixture, jsonOf, lastTextPlaces, password, qpdfOn, storedPlaces, streamText, texts, tools } from './stamp-helpers';

const positions = optionValues['add-page-numbers']!.position as readonly Position[];

async function number(file: Uint8Array, position: unknown = 'bottom-centre', passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const outputs = await run([file], { position, passwords }, (step) => progress.push(step), tools);
  return { output: outputs[0]!, outputs, progress };
}

/** Helvetica's width at a size, as pdf-lib measures it. */
let widthOf: (text: string, size: number) => number;

describe('where a number goes', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  widthOf = (text, size) => font.widthOfTextAtSize(text, size);

  const a4 = { width: 595.28, height: 841.89 };
  it('on A4 at the bottom centre: about 10 points, digits about 7 points tall, foot about 10 mm up, centred', () => {
    const { x, y, size } = numberPlace(a4, '12', 'bottom-centre', widthOf);
    expect(size).toBeCloseTo(595.28 / 60, 6);
    expect(size * digitHeight).toBeCloseTo(7.12, 1);
    expect((y / 72) * 25.4).toBeCloseTo(10.5, 1);
    expect(x + widthOf('12', size) / 2).toBeCloseTo(a4.width / 2, 6);
  });

  it('sizes follow the page: Letter 10.2, A6 at least 8, A0 39.7', () => {
    expect(numberPlace({ width: 612, height: 792 }, '1', 'bottom-centre', widthOf).size).toBeCloseTo(10.2, 6);
    expect(numberPlace({ width: 297.64, height: 419.53 }, '1', 'bottom-centre', widthOf).size).toBe(8);
    expect(numberPlace({ width: 2383.94, height: 3370.39 }, '1', 'bottom-centre', widthOf).size).toBeCloseTo(39.73, 2);
    expect(numberPlace({ width: 1e6, height: 1e6 }, '1', 'bottom-centre', widthOf).size).toBe(72);
  });

  it('sits at the margin of each edge and corner', () => {
    const W = a4.width;
    const H = a4.height;
    for (const position of positions) {
      const { x, y, size } = numberPlace(a4, '123', position, widthOf);
      const m = 3 * size;
      const w = widthOf('123', size);
      const [edge, side] = position.split('-');
      expect(x, position).toBeCloseTo(side === 'left' ? m : side === 'right' ? W - m - w : (W - w) / 2, 6);
      expect(y, position).toBeCloseTo(edge === 'bottom' ? m : H - m - digitHeight * size, 6);
    }
  });

  it('on a page too small, shrinks the margin, then the size, and the number is always whole on the page', () => {
    const small = { width: 20, height: 20 };
    const one = numberPlace(small, '1', 'bottom-left', widthOf);
    expect(one.size).toBe(8);
    // The margin shrinks to what both sides leave: here the height, (20 - 0.718 × 8) / 2.
    expect(one.x).toBeCloseTo(Math.min((20 - widthOf('1', 8)) / 2, (20 - digitHeight * 8) / 2), 6);
    expect(one.y).toBeCloseTo(one.x, 6);
    const seven = numberPlace(small, '1234567', 'top-right', widthOf);
    expect(seven.size).toBeLessThan(8);
    expect(seven.x).toBeCloseTo(0, 6);
    for (const area of [small, a4, { width: 1, height: 1 }, { width: 1, height: 300 }, { width: 300, height: 1 }, { width: 2383.94, height: 3370.39 }]) {
      for (let digits = 1; digits <= 7; digits++) {
        const text = '8'.repeat(digits);
        for (const position of positions) {
          const { x, y, size } = numberPlace(area, text, position, widthOf);
          expect(x).toBeGreaterThanOrEqual(-1e-9);
          expect(y).toBeGreaterThanOrEqual(-1e-9);
          expect(x + widthOf(text, size)).toBeLessThanOrEqual(area.width + 1e-9);
          expect(y + digitHeight * size).toBeLessThanOrEqual(area.height + 1e-9);
        }
      }
    }
  });
});

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('the place sent', { timeout: 60_000 }, () => {
  it('is refused before any work when it is not one of the six', async () => {
    let asked = 0;
    const watched: EngineTools = { ...tools, qpdf: async () => (asked++, tools.qpdf!()) };
    for (const bad of ['middle', 'Bottom centre', 3, '__proto__', 'toString', undefined, null, ['top-left']]) {
      await expect(run([fixture('text.pdf')], { position: bad }, () => {}, watched)).rejects.toThrow('The place for the numbers is not valid.');
    }
    await expect(run([fixture('text.pdf')], {}, () => {}, watched)).rejects.toThrow('The place for the numbers is not valid.');
    expect(asked).toBe(0);
  });
});

// ---------------------------------------------------------------------------

const outline = async (bytes: Uint8Array) => (JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=outlines'])).out) as { outlines: { title: string; destpageposfrom1: number }[] }).outlines;
const attachments = async (bytes: Uint8Array) => Object.keys((JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments);
const fields = async (bytes: Uint8Array) =>
  (JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=acroform'])).out) as { acroform: { fields: { fullname: string; value: unknown }[] } }).acroform.fields.map((field) => [field.fullname, field.value]);
const encryption = async (bytes: Uint8Array) => (await qpdfOn(bytes, ['--show-encryption'])).out;

/** Every page's text as before, with its number after it. */
async function expectNumbered(input: Uint8Array, output: Uint8Array, given?: string) {
  expect((await qpdfOn(output, ['--check'])).code).toBe(0);
  const pages = Number((await qpdfOn(input, [...(given ? [`--password=${given}`] : []), '--show-npages'])).out.trim());
  expect((await qpdfOn(output, ['--show-npages'])).out.trim()).toBe(String(pages));
  expect(await encryption(output)).toMatch(/File is not encrypted/);
  const before = given ? null : await texts(input);
  const after = await texts(output);
  after.forEach((items, index) => {
    expect(items.at(-1), `page ${index + 1}`).toBe(String(index + 1));
    if (before) expect(items.slice(0, -1), `page ${index + 1}`).toEqual(before[index]);
  });
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('numbering the shared test set', { timeout: 60_000 }, () => {
  it('text.pdf: each page ends with its number at the bottom centre, with progress for reading, each page and writing', async () => {
    const input = fixture('text.pdf');
    const { output, progress } = await number(input);
    await expectNumbered(input, output);
    for (const place of await lastTextPlaces(output)) {
      expect(Math.abs(place.x - 0.5)).toBeLessThan(0.02);
      expect(place.fromBottom).toBeLessThan(0.06);
    }
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    expect(progress.filter((step) => step.stage === 'working')).toEqual([1, 2, 3].map((done) => ({ stage: 'working', unit: 'page', done, total: 3, writesAfter: true })));
    const writing = progress.filter((step) => step.stage === 'writing').map((step) => (step as { percent: number }).percent);
    expect(writing.at(-1)).toBe(100);
    expect(writing.slice(0, -1).every((percent) => percent >= 75 && percent <= 95)).toBe(true);
    // The bar never goes back and is full only once the file is written.
    const { progressFraction } = await import('../../src/widget/format');
    const fractions = progress.map(progressFraction);
    expect(fractions.slice(0, -1).every((fraction) => fraction < 1)).toBe(true);
    let highest = 0;
    for (const fraction of fractions) {
      expect(fraction).toBeGreaterThanOrEqual(highest - 1e-9);
      highest = Math.max(highest, fraction);
    }
    expect(writing).toEqual([...writing].sort((a, b) => a - b));
  });

  it('mixed.pdf: at each of the six places, every page has its number upright at that edge as PDF.js shows it', async () => {
    const input = fixture('mixed.pdf');
    for (const position of positions) {
      const { output } = await number(input, position);
      await expectNumbered(input, output);
      const doc = await (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: output.slice(), verbosity: 0 }).promise;
      const places = await lastTextPlaces(output);
      for (let page = 1; page <= doc.numPages; page++) {
        const shown = (await doc.getPage(page)).getViewport({ scale: 1 });
        const area = { width: shown.width, height: shown.height };
        const text = String(page);
        const want = numberPlace(area, text, position, widthOf);
        const x = (want.x + widthOf(text, want.size) / 2) / area.width;
        const fromBottom = (want.y + 0.35 * want.size) / area.height;
        const found = places[page - 1]!;
        expect(found.text).toBe(text);
        expect(Math.abs(found.x - x), `${position} page ${page}`).toBeLessThan(0.02);
        expect(Math.abs(found.fromBottom - fromBottom), `${position} page ${page}`).toBeLessThan(0.02);
      }
      await doc.loadingTask.destroy();
      // Every page's stored turn and boxes are as they were.
      expect(await storedPlaces(output)).toEqual(await storedPlaces(input));
    }
  });

  it('pages-500.pdf: page 500 shows 500, and the file grows by little', async () => {
    const input = fixture('pages-500.pdf');
    const { output } = await number(input);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const all = await texts(output);
    expect(all).toHaveLength(500);
    expect(all[499]!.at(-1)).toBe('500');
    expect(all[0]!.at(-1)).toBe('1');
    expect(output.length - input.length).toBeLessThan(500 * 300);
  }, 60_000);

  it('scanned.pdf, warning.pdf and images.pdf are numbered', async () => {
    for (const name of ['scanned.pdf', 'warning.pdf', 'images.pdf']) {
      const input = fixture(name);
      const { output } = await number(input, 'top-right');
      await expectNumbered(input, output);
    }
  });

  it('password.pdf with its password and restricted.pdf come back with no password and no restrictions', async () => {
    await expect(number(fixture('password.pdf'))).rejects.toThrow();
    await expect(number(fixture('password.pdf'), 'bottom-centre', ['wrong'])).rejects.toThrow();
    const { output } = await number(fixture('password.pdf'), 'bottom-centre', [password]);
    await expectNumbered(fixture('password.pdf'), output, password);
    const restricted = await number(fixture('restricted.pdf'));
    expect(await encryption(fixture('restricted.pdf'))).toMatch(/print/i);
    await expectNumbered(fixture('restricted.pdf'), restricted.output);
  });

  it('rich.pdf keeps its bookmarks, link and note.txt', async () => {
    const input = fixture('rich.pdf');
    const { output } = await number(input);
    await expectNumbered(input, output);
    expect((await outline(output)).map((item) => [item.title, item.destpageposfrom1])).toEqual([['Chapter one', 1], ['Chapter two', 2]]);
    expect(await attachments(output)).toEqual(['note.txt']);
    const links = (bytes: Awaited<ReturnType<typeof jsonOf>>) => Object.values(bytes.objects).filter((entry) => (entry.value as Record<string, unknown> | undefined)?.['/Subtype'] === '/Link');
    const after = await jsonOf(output);
    expect(links(after).map((entry) => JSON.stringify((entry.value as Record<string, unknown>)['/A']))).toEqual(links(await jsonOf(input)).map((entry) => JSON.stringify((entry.value as Record<string, unknown>)['/A'])));
  });

  it('form.pdf keeps its fields and their values', async () => {
    const input = fixture('form.pdf');
    const { output } = await number(input);
    await expectNumbered(input, output);
    expect(await fields(output)).toEqual(await fields(input));
    expect(JSON.stringify(await fields(output))).toContain('Sample text');
  });

  it('tagged.pdf keeps its tags, destination, thread and fields, and each page still draws its own content first', async () => {
    const input = fixture('tagged.pdf');
    const { output } = await number(input);
    await expectNumbered(input, output);
    const before = await jsonOf(input);
    const after = await jsonOf(output);
    const all = (json: typeof before) => JSON.stringify(json.objects);
    for (const kept of ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-NOTE', 'SECRET-LINK', '/StructTreeRoot', '/Threads', '/Dests']) {
      expect(all(after), kept).toContain(kept);
    }
    const kinds = (json: typeof before) =>
      Object.values(json.objects)
        .map((entry) => (entry.value as Record<string, unknown> | undefined)?.['/S'])
        .filter(Boolean)
        .sort();
    expect(kinds(after)).toEqual(kinds(before));
    expect(await fields(output)).toEqual(await fields(input));
    // Each page's own streams are unchanged, between q and Q, and the number comes after.
    before.pages.forEach((page, index) => {
      const contents = after.pages[index]!.contents;
      expect(contents.slice(1, -2).map((id) => streamText(after.objects, id))).toEqual(page.contents.map((id) => streamText(before.objects, id)));
    });
  });

  it('damaged files and a file that is not a PDF: read as damaged before any job, and a run on one fails as the engine\'s failure, giving nothing', async () => {
    for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']) {
      // The page reads every file first, so a damaged one is caught here and never reaches the job.
      expect(await inspect(fixture(name), undefined, tools), name).toMatchObject({ kind: 'damaged' });
      const error = await number(fixture(name)).then(() => null, (caught: unknown) => caught);
      expect(error, name).toBeInstanceOf(Error);
      expect(failureKind(error), name).toBe('engine');
    }
  });

  it('every other file in the set: numbered and checked, or a failure', async () => {
    const covered = new Set(['text.pdf', 'mixed.pdf', 'pages-500.pdf', 'scanned.pdf', 'warning.pdf', 'images.pdf', 'password.pdf', 'restricted.pdf', 'rich.pdf', 'form.pdf', 'tagged.pdf', 'damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']);
    const others = readdirSync(join(__dirname, '../fixtures')).filter((name) => name.endsWith('.pdf') && !covered.has(name));
    expect(others.sort()).toEqual([
      'compress-bomb-attachment.pdf',
      'compress-flate-bomb.pdf',
      'compress-jpeg-mismatch.pdf',
      'compress-json-bomb.pdf',
      'compress-kinds.pdf',
      'compress-lossless.pdf',
      'compress-packed.pdf',
      'compress-password.pdf',
      'compress-scans.pdf',
      'compress-small-jpg.pdf',
      'compress-text.pdf',
    ]);
    for (const name of others) {
      const input = fixture(name);
      if (name === 'compress-json-bomb.pdf') {
        // Its JSON of dictionaries passes 64 MB, so its pages cannot be read: the engine's failure.
        await expect(number(input), name).rejects.toThrow('The pages could not be read.');
        continue;
      }
      const given = name === 'compress-password.pdf' ? password : undefined;
      const { output } = await number(input, 'bottom-centre', [given]);
      await expectNumbered(input, output, given);
    }
  }, 120_000);
});
