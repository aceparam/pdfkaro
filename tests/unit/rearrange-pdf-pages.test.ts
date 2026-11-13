// The Reorder pages engine: its own check of the order, and real runs on the
// shared test set and on files made here, with the same qpdf the browser uses.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { pageOrder, run } from '../../src/engines/tools/rearrange-pdf-pages';
import type { EngineTools, Progress } from '../../src/engines/types';
import { deepOutline, headingWithoutPage, nestedOutline, outlineAliasingCatalog } from './outline-fixtures';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

async function reorder(file: Uint8Array, order: number[], passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const [output] = await run([file], { order, passwords }, (step) => progress.push(step), tools);
  return { output: output!, progress };
}

async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}
const pageCount = async (bytes: Uint8Array) => Number((await qpdfOn(bytes, ['--show-npages'])).out.trim());
type Shown = { title: string; destpageposfrom1: number | null; kids: Shown[] };
const outline = async (bytes: Uint8Array) => (JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=outlines'])).out) as { outlines: Shown[] }).outlines;
const titles = (items: Shown[]): unknown[] => items.map((item) => (item.kids.length ? { [item.title]: titles(item.kids) } : item.title));
const dead = (items: Shown[]): number => items.reduce((sum, item) => sum + (item.destpageposfrom1 === null ? 1 : 0) + dead(item.kids), 0);
/** The result uncompressed, as text, to read what it holds. */
async function plainText(bytes: Uint8Array): Promise<string> {
  const qpdf = await makeQpdf();
  qpdf.write('/r.pdf', bytes);
  qpdf.call(['--qdf', '--object-streams=disable', '--stream-data=uncompress', '/r.pdf', '/q.pdf']);
  return new TextDecoder('latin1').decode(qpdf.read('/q.pdf'));
}
/** Whether the uncompressed file holds a string, written plainly, as hex, or as UTF-16 hex as pdf-lib writes field names and values. */
const holds = (text: string, value: string) => {
  const hex = Buffer.from(value, 'latin1').toString('hex');
  const utf16 = `feff${[...value].map((c) => `00${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')}`;
  const upper = text.toUpperCase();
  return text.includes(value) || upper.includes(hex.toUpperCase()) || upper.includes(utf16.toUpperCase());
};
/** Where a line of page text sits in that text, which qpdf's QDF mode writes as a literal string. -1 when absent. */
const at = (text: string, line: string) => text.indexOf(`(${line}) Tj`);
type PageJson = { object: string };
const pageShapes = async (bytes: Uint8Array) => {
  const qpdf = await makeQpdf();
  qpdf.write('/s.pdf', bytes);
  const shown = JSON.parse(qpdf.call(['--json=2', '--json-key=pages', '--json-key=qpdf', '/s.pdf']).out) as { pages: PageJson[]; qpdf: [unknown, Record<string, { value: { '/MediaBox': number[]; '/Rotate'?: number } }>] };
  return shown.pages.map((page) => { const value = shown.qpdf[1][`obj:${page.object}`]!.value; return { box: value['/MediaBox'], turn: value['/Rotate'] ?? 0 }; });
};
const attachments = async (bytes: Uint8Array) => Object.keys((JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments);

type Placed = { title: string; destpageposfrom1: number | null; kids: Placed[] };
const placed = (items: Placed[]): unknown[] => items.map((item) => ({ [item.title]: item.destpageposfrom1, ...(item.kids.length ? { kids: placed(item.kids) } : {}) }));

describe('the page order', () => {
  it('takes every page once, in any order, and gives a copy', () => {
    const sent = [3, 1, 2];
    const order = pageOrder(3, sent);
    expect(order).toEqual([3, 1, 2]);
    expect(order).not.toBe(sent);
    expect(pageOrder(1, [1])).toEqual([1]);
  });

  it('refuses a missing, repeated, extra or out-of-range page, holes, and anything not a whole number', () => {
    // eslint-disable-next-line no-sparse-arrays
    for (const order of [[1, 2], [1, 1, 3], [1, 2, 3, 4], [0, 1, 2], [1, 2, 4], [1, , 3], [1, Number.NaN, 3], [1, 1.5, 3], ['1', 2, 3], 'all', null, undefined, {}]) {
      expect(() => pageOrder(3, order), JSON.stringify(order)).toThrow(/not valid/);
    }
  });
});

describe('reordering the shared test set', () => {
  it('text.pdf as 3, 1, 2: the pages in that order, passing qpdf --check, with honest progress', async () => {
    const { output, progress } = await reorder(fixture('text.pdf'), [3, 1, 2]);
    expect(await pageCount(output)).toBe(3);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const text = await plainText(output);
    const places = [3, 1, 2].map((page) => at(text, `Ordinary document, page ${page}`));
    expect(places.every((place) => place > -1)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
    expect(progress).toEqual([
      { stage: 'writing', percent: 0 },
      { stage: 'writing', percent: 100 },
    ]);
  });

  it('the order unchanged gives every page in its place', async () => {
    const text = await plainText((await reorder(fixture('text.pdf'), [1, 2, 3])).output);
    const places = [1, 2, 3].map((page) => at(text, `Ordinary document, page ${page}`));
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it('pages-500.pdf reversed: a long list with no runs goes through the argument file', async () => {
    const order = Array.from({ length: 500 }, (_, index) => 500 - index);
    const { output } = await reorder(fixture('pages-500.pdf'), order);
    expect(await pageCount(output)).toBe(500);
    const text = await plainText(output);
    const places = [500, 499, 250, 2, 1].map((page) => at(text, `Page ${page} of 500`));
    expect(places.every((place) => place > -1)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  }, 120_000);

  it('rich.pdf swapped: each bookmark points to its chapter, the outline keeps its order, and note.txt and the link stay', async () => {
    const { output } = await reorder(fixture('rich.pdf'), [2, 1]);
    expect(placed(await outline(output) as Placed[])).toEqual([{ 'Chapter one': 2 }, { 'Chapter two': 1 }]);
    expect(await attachments(output)).toEqual(['note.txt']);
    const text = await plainText(output);
    expect(text).toMatch(/\/Subtype \/Link/);
    expect(text.indexOf('Chapter two')).toBeGreaterThan(-1);
  });

  it('mixed.pdf: each page keeps its size and rotation in its new place', async () => {
    expect(await pageShapes((await reorder(fixture('mixed.pdf'), [4, 3, 2, 1])).output)).toEqual([
      { box: [0, 0, 595, 842], turn: 180 },
      { box: [0, 0, 420, 595], turn: 90 },
      { box: [0, 0, 792, 612], turn: 0 },
      { box: [0, 0, 595, 842], turn: 0 },
    ]);
  });

  it('password.pdf with its password gives a file with no password; restricted.pdf loses its restrictions', async () => {
    await expect(reorder(fixture('password.pdf'), [3, 2, 1])).rejects.toThrow(/password/);
    const { output } = await reorder(fixture('password.pdf'), [3, 2, 1], ['open-sesame']);
    expect((await qpdfOn(output, ['--show-encryption'])).out).toContain('not encrypted');
    expect((await qpdfOn((await reorder(fixture('restricted.pdf'), [2, 1, 3])).output, ['--show-encryption'])).out).toContain('not encrypted');
  });

  it('scanned, warning, images and form files', async () => {
    expect(await pageCount((await reorder(fixture('scanned.pdf'), [2, 1])).output)).toBe(2);
    expect(await pageCount((await reorder(fixture('warning.pdf'), [3, 1, 2])).output)).toBe(3);
    expect(await pageCount((await reorder(fixture('images.pdf'), [1])).output)).toBe(1);
    const { out } = await qpdfOn((await reorder(fixture('form.pdf'), [1])).output, ['--json=2', '--json-key=acroform']);
    expect(out).toContain('"fullname": "name"');
  });

  it('tagged.pdf keeps everything, its pages swapped', async () => {
    const text = await plainText((await reorder(fixture('tagged.pdf'), [2, 1])).output);
    for (const kept of ['SECRET-PAGE-TWO-TEXT', 'SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-TAGGED-FIELD', 'SECRET-TAGGED-VALUE', 'SECRET-NOTE', 'SECRET-LINK.example', 'secretfield']) {
      expect(holds(text, kept), kept).toBe(true);
    }
    expect(at(text, 'SECRET-PAGE-TWO-TEXT')).toBeLessThan(at(text, 'Page one text'));
  });

  it('refuses damaged files and orders that do not name every page once', async () => {
    for (const name of ['damaged-cut.pdf', 'damaged-xref.pdf', 'not-a-pdf.pdf']) await expect(reorder(fixture(name), [1]), name).rejects.toThrow();
    for (const order of [[1, 2], [1, 1, 2], [1, 2, 3, 4]]) await expect(reorder(fixture('text.pdf'), order), JSON.stringify(order)).rejects.toThrow(/not valid/);
  });
});

describe('the outline is left as it was', () => {
  it('a nested outline: every bookmark kept, pointing to its page in its new place', async () => {
    const { output } = await reorder(await nestedOutline(), [4, 3, 2, 1]);
    expect(placed(await outline(output) as Placed[])).toEqual([
      { 'Part A': 4, kids: [{ A1: 3 }, { A2: 2 }] },
      { 'Part B': 1, kids: [{ B1: 4 }] },
    ]);
  });

  it('a heading that points to no page is kept, with its child', async () => {
    const { output } = await reorder(await headingWithoutPage(), [3, 2, 1]);
    expect(placed(await outline(output) as Placed[])).toEqual([{ Heading: null, kids: [{ Third: 1 }] }, { First: 3 }]);
  });

  it('an outline 100 levels deep keeps every level', async () => {
    const text = await plainText((await reorder(await deepOutline(100), [2, 1])).output);
    for (const level of [1, 48, 49, 100]) expect(text, `Level ${level}`).toContain(`(Level ${level})`);
  });

  it('an outline item that points back at the catalog is not dropped', async () => {
    const text = await plainText((await reorder(await outlineAliasingCatalog(), [2, 1])).output);
    expect(text).toContain('/Outlines');
    expect(text).toContain('(One)');
  });
});
