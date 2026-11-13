// The Extract pages engine: its pure parts, and real runs on the shared test
// set and on files made here, with the same qpdf the browser uses.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { run } from '../../src/engines/tools/extract-pdf-pages';
import type { EngineTools, Progress } from '../../src/engines/types';
import { manyBookmarks, nestedOutline } from './outline-fixtures';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

async function extract(file: Uint8Array, pages: number[], passwords: (string | undefined)[] = []) {
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

describe('extracting the shared test set', () => {
  it('pages 1 and 3 of text.pdf, in order, passing qpdf --check, with honest progress', async () => {
    const { output, progress } = await extract(fixture('text.pdf'), [1, 3]);
    expect(await pageCount(output)).toBe(2);
    const text = await plainText(output);
    expect(at(text, 'Ordinary document, page 1')).toBeGreaterThan(-1);
    expect(at(text, 'Ordinary document, page 3')).toBeGreaterThan(at(text, 'Ordinary document, page 1'));
    expect(at(text, 'Ordinary document, page 2')).toBe(-1);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    expect(progress).toEqual([
      { stage: 'writing', percent: 0 },
      { stage: 'writing', percent: 100 },
    ]);
  });

  it('pages-500.pdf, scattered pages', async () => {
    const chosen = [2, 3, 4, 100, 250, 499, 500];
    const { output } = await extract(fixture('pages-500.pdf'), chosen);
    expect(await pageCount(output)).toBe(7);
    const text = await plainText(output);
    const places = chosen.map((page) => at(text, `Page ${page} of 500`));
    expect(places.every((place) => place > -1)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
    for (const left of [1, 5, 99, 101, 498]) expect(at(text, `Page ${left} of 500`)).toBe(-1);
  });

  it('rich.pdf page 2 keeps Chapter two and the attached file, and no dead bookmark', async () => {
    const { output } = await extract(fixture('rich.pdf'), [2]);
    expect(titles(await outline(output))).toEqual(['Chapter two']);
    expect(dead(await outline(output))).toBe(0);
    expect(await attachments(output)).toEqual(['note.txt']);
  });

  it('rich.pdf page 1 keeps its link', async () => {
    const text = await plainText((await extract(fixture('rich.pdf'), [1])).output);
    expect(text).toMatch(/\/Subtype \/Link/);
    expect(text).toContain('https://example.org/');
  });

  it('a nested outline keeps the bookmarks of chosen pages, moved up past dropped parents', async () => {
    const { output } = await extract(await nestedOutline(), [2, 3]);
    expect(titles(await outline(output))).toEqual(['A1', 'A2']);
  });

  it('a file with 3,000 bookmarks keeps those of the chosen page', async () => {
    const { output } = await extract(await manyBookmarks(3000), [2]);
    expect(titles(await outline(output))).toHaveLength(1500);
  }, 120_000);

  it('password.pdf with its password gives a file with no password', async () => {
    await expect(extract(fixture('password.pdf'), [1])).rejects.toThrow(/password/);
    const { output } = await extract(fixture('password.pdf'), [1, 2], ['open-sesame']);
    expect((await qpdfOn(output, ['--show-encryption'])).out).toContain('not encrypted');
  });

  it('restricted, scanned, warning, mixed, images and form files', async () => {
    expect((await qpdfOn((await extract(fixture('restricted.pdf'), [2])).output, ['--show-encryption'])).out).toContain('not encrypted');
    expect(await pageCount((await extract(fixture('scanned.pdf'), [2])).output)).toBe(1);
    expect(await pageCount((await extract(fixture('warning.pdf'), [1, 3])).output)).toBe(2);
    expect(await pageShapes((await extract(fixture('mixed.pdf'), [2, 3])).output)).toEqual([
      { box: [0, 0, 792, 612], turn: 0 },
      { box: [0, 0, 420, 595], turn: 90 },
    ]);
    expect(await pageCount((await extract(fixture('images.pdf'), [1])).output)).toBe(1);
    const { out } = await qpdfOn((await extract(fixture('form.pdf'), [1])).output, ['--json=2', '--json-key=acroform']);
    expect(out).toContain('"fullname": "name"');
  });

  it('refuses damaged files and choices out of range', async () => {
    for (const name of ['damaged-cut.pdf', 'damaged-xref.pdf', 'not-a-pdf.pdf']) await expect(extract(fixture(name), [1]), name).rejects.toThrow();
    await expect(extract(fixture('text.pdf'), [4])).rejects.toThrow(/not valid/);
    await expect(extract(fixture('text.pdf'), [])).rejects.toThrow();
  });
});

describe('what comes over from pages left out (the owner decision of 13 Nov 2026)', () => {
  it('tagged.pdf page 1: page 2 and its field are gone; its tag text, destination name and thread title stay', async () => {
    const { output } = await extract(fixture('tagged.pdf'), [1]);
    expect(await pageCount(output)).toBe(1);
    // Read the result uncompressed, as text, to see what it still holds.
    const qpdf = await makeQpdf();
    qpdf.write('/r.pdf', output);
    qpdf.call(['--qdf', '--object-streams=disable', '--stream-data=uncompress', '/r.pdf', '/q.pdf']);
    const text = new TextDecoder('latin1').decode(qpdf.read('/q.pdf'));
    expect(text).not.toContain('SECRET-PAGE-TWO-TEXT');
    expect(text).not.toContain('secretfield');
    expect(text).toContain('SECRET-ALT-TEXT');
    expect(text).toContain('SECRET-ACTUAL-TEXT');
    expect(text).toContain('SECRET-DEST-NAME');
    expect(text).toContain('SECRET-THREAD-TITLE');
  });
});
