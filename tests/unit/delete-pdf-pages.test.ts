// The Delete pages engine: its own step, and real runs on the shared test set
// and on files made here, with the same qpdf the browser uses.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { pagesLeft, run } from '../../src/engines/tools/delete-pdf-pages';
import type { EngineTools, Progress } from '../../src/engines/types';
import { manyBookmarks, nestedOutline } from './outline-fixtures';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

async function remove(file: Uint8Array, pages: number[], passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const [output] = await run([file], { pages, passwords }, (step) => progress.push(step), tools);
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

describe('the pages left', () => {
  it('takes the marked pages out, in page order', () => {
    expect(pagesLeft(12, [1, 3, 7])).toEqual([2, 4, 5, 6, 8, 9, 10, 11, 12]);
    expect(pagesLeft(3, [3])).toEqual([1, 2]);
    expect(pagesLeft(120_000, [42])).toHaveLength(119_999);
  });

  it('refuses every page, and marks that are not valid', () => {
    expect(() => pagesLeft(3, [1, 2, 3])).toThrow(/Every page was marked/);
    for (const marked of [[], [3, 3], [7, 3], [0], [13], [2.5], ['1'], 'all', null, undefined]) {
      expect(() => pagesLeft(12, marked), JSON.stringify(marked)).toThrow();
    }
  });
});

describe('deleting from the shared test set', () => {
  it('page 2 of text.pdf: pages 1 and 3 are left, in order, passing qpdf --check, with honest progress', async () => {
    const { output, progress } = await remove(fixture('text.pdf'), [2]);
    expect(await pageCount(output)).toBe(2);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const text = await plainText(output);
    expect(at(text, 'Ordinary document, page 1')).toBeGreaterThan(-1);
    expect(at(text, 'Ordinary document, page 3')).toBeGreaterThan(at(text, 'Ordinary document, page 1'));
    expect(at(text, 'Ordinary document, page 2')).toBe(-1);
    expect(progress).toEqual([
      { stage: 'writing', percent: 0 },
      { stage: 'writing', percent: 100 },
    ]);
  });

  it('every other page of pages-500.pdf: the even pages are left, in order', async () => {
    const marked = Array.from({ length: 250 }, (_, index) => index * 2 + 1);
    const { output } = await remove(fixture('pages-500.pdf'), marked);
    expect(await pageCount(output)).toBe(250);
    const text = await plainText(output);
    const places = [2, 4, 100, 250, 498, 500].map((page) => at(text, `Page ${page} of 500`));
    expect(places.every((place) => place > -1)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
    for (const gone of [1, 3, 99, 251, 499]) expect(at(text, `Page ${gone} of 500`)).toBe(-1);
  });

  it('rich.pdf page 1: "Chapter two" and note.txt are kept, and no bookmark points nowhere', async () => {
    const { output } = await remove(fixture('rich.pdf'), [1]);
    expect(titles(await outline(output))).toEqual(['Chapter two']);
    expect(dead(await outline(output))).toBe(0);
    expect(await attachments(output)).toEqual(['note.txt']);
    // The link was on page 1, so it went with it.
    expect(await plainText(output)).not.toMatch(/\/Subtype \/Link/);
  });

  it('rich.pdf page 2: page 1 keeps its link', async () => {
    const text = await plainText((await remove(fixture('rich.pdf'), [2])).output);
    expect(text).toMatch(/\/Subtype \/Link/);
    expect(text).toContain('https://example.org/');
  });

  it('a nested outline keeps the bookmarks of pages left, moved up past dropped parents', async () => {
    const { output } = await remove(await nestedOutline(), [1, 4]);
    expect(titles(await outline(output))).toEqual(['A1', 'A2']);
    expect(dead(await outline(output))).toBe(0);
  });

  it('a 500-page file with 3,000 bookmarks keeps those of the 495 pages left', async () => {
    // Six bookmarks a page; deleting five pages drops their 30 and keeps the other 2,970.
    const { output } = await remove(await manyBookmarks(3000, 500), [1, 100, 250, 499, 500]);
    expect(await pageCount(output)).toBe(495);
    const kept = await outline(output);
    expect(kept).toHaveLength(2970);
    expect(dead(kept)).toBe(0);
  }, 120_000);

  it('a file with 3,000 bookmarks keeps those of the page left', async () => {
    const { output } = await remove(await manyBookmarks(3000), [2]);
    expect(titles(await outline(output))).toHaveLength(1500);
  }, 120_000);

  it('password.pdf with its password gives a file with no password', async () => {
    await expect(remove(fixture('password.pdf'), [1])).rejects.toThrow(/password/);
    const { output } = await remove(fixture('password.pdf'), [2], ['open-sesame']);
    expect(await pageCount(output)).toBe(2);
    expect((await qpdfOn(output, ['--show-encryption'])).out).toContain('not encrypted');
  });

  it('restricted, scanned, warning, mixed, images and form files', async () => {
    expect((await qpdfOn((await remove(fixture('restricted.pdf'), [2])).output, ['--show-encryption'])).out).toContain('not encrypted');
    expect(await pageCount((await remove(fixture('scanned.pdf'), [1])).output)).toBe(1);
    expect(await pageCount((await remove(fixture('warning.pdf'), [2])).output)).toBe(2);
    expect(await pageShapes((await remove(fixture('mixed.pdf'), [1, 4])).output)).toEqual([
      { box: [0, 0, 792, 612], turn: 0 },
      { box: [0, 0, 420, 595], turn: 90 },
    ]);
    // One page each: deleting it would leave none, so both are refused.
    await expect(remove(fixture('images.pdf'), [1])).rejects.toThrow(/Every page was marked/);
    await expect(remove(fixture('form.pdf'), [1])).rejects.toThrow(/Every page was marked/);
  });

  it('refuses damaged files, every page, and marks out of range', async () => {
    for (const name of ['damaged-cut.pdf', 'damaged-xref.pdf', 'not-a-pdf.pdf']) await expect(remove(fixture(name), [1]), name).rejects.toThrow();
    await expect(remove(fixture('text.pdf'), [1, 2, 3])).rejects.toThrow(/Every page was marked/);
    await expect(remove(fixture('text.pdf'), [4])).rejects.toThrow(/not valid/);
    await expect(remove(fixture('text.pdf'), [])).rejects.toThrow();
  });
});

describe('what stays from deleted pages (the owner decision of 13 Nov 2026)', () => {
  it('tagged.pdf page 2: its text and field are gone; its tag text, destination name and thread title stay', async () => {
    const { output } = await remove(fixture('tagged.pdf'), [2]);
    expect(await pageCount(output)).toBe(1);
    const text = await plainText(output);
    expect(text).not.toContain('SECRET-PAGE-TWO-TEXT');
    expect(text).not.toContain('secretfield');
    // The tags point to page 2's filled field and note, so they stay too, as the page says.
    for (const kept of ['SECRET-TAGGED-FIELD', 'SECRET-TAGGED-VALUE', 'SECRET-NOTE']) expect(holds(text, kept), kept).toBe(true);
    expect(holds(text, 'SECRET-NOT-IN-THE-FILE')).toBe(false);
    for (const kept of ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE']) expect(text).toContain(kept);
  });
});
