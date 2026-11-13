// The Extract pages engine: its pure parts, and real runs on the shared test
// set and on files made here, with the same qpdf the browser uses.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { callWithArgumentFile, chosenPages, pageList, run } from '../../src/engines/tools/extract-pdf-pages';
import { plainCopy } from '../../src/engines/plain';
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
const attachments = async (bytes: Uint8Array) => Object.keys((JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments);

describe('the pages chosen', () => {
  it('takes sorted, unique whole numbers in range, at least one', () => {
    expect(chosenPages(12, [1, 3, 7])).toEqual([1, 3, 7]);
    expect(chosenPages(12, [12])).toEqual([12]);
  });

  it('refuses none, repeats, disorder, out of range and anything not a whole number', () => {
    for (const chosen of [[], [3, 3], [7, 3], [0], [13], [2.5], ['1'], 'all', null, undefined]) {
      expect(() => chosenPages(12, chosen), JSON.stringify(chosen)).toThrow();
    }
  });

  it('joins runs of pages as ranges', () => {
    expect(pageList([1, 2, 3, 7])).toBe('1-3,7');
    expect(pageList([5])).toBe('5');
    expect(pageList([1, 3, 5])).toBe('1,3,5');
    expect(pageList([9, 10, 11, 12])).toBe('9-12');
  });
});

describe('the shared plain copy', () => {
  it('decrypts, counts pages, and refuses a wrong password', async () => {
    const { plain, pages } = await plainCopy(tools, fixture('password.pdf'), 'open-sesame');
    expect(pages).toBe(3);
    expect((await qpdfOn(plain, ['--show-encryption'])).out).toContain('not encrypted');
    await expect(plainCopy(tools, fixture('password.pdf'), 'wrong')).rejects.toThrow(/password/);
  });
});

describe('the argument file', () => {
  it('carries a page list over 64 KB, which would overflow qpdf on the command line', async () => {
    // Repeated pages, which chosenPages would refuse, so the step is called directly.
    const list = Array.from({ length: 20_000 }, (_, index) => `${(index % 500) + 1}`).join(',');
    expect(list.length).toBeGreaterThan(64 * 1024);
    const qpdf = await makeQpdf();
    qpdf.write('/in.pdf', fixture('pages-500.pdf'));
    const { code } = callWithArgumentFile(qpdf, ['/in.pdf', '--pages', '.', list, '--', '/out.pdf']);
    expect(code).toBe(0);
    expect(await pageCount(qpdf.read('/out.pdf'))).toBe(20_000);
  }, 120_000);

  it('refuses an argument holding a line break', async () => {
    expect(() => callWithArgumentFile({} as Qpdf, ['a\nb'])).toThrow();
  });
});

describe('extracting the shared test set', () => {
  it('pages 1 and 3 of text.pdf, in order, passing qpdf --check, with honest progress', async () => {
    const { output, progress } = await extract(fixture('text.pdf'), [1, 3]);
    expect(await pageCount(output)).toBe(2);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    expect(progress).toEqual([
      { stage: 'writing', percent: 0 },
      { stage: 'writing', percent: 100 },
    ]);
  });

  it('pages-500.pdf, scattered pages', async () => {
    const chosen = [2, 3, 4, 100, 250, 499, 500];
    expect(await pageCount((await extract(fixture('pages-500.pdf'), chosen)).output)).toBe(7);
  });

  it('rich.pdf page 2 keeps Chapter two and the attached file, and no dead bookmark', async () => {
    const { output } = await extract(fixture('rich.pdf'), [2]);
    expect(titles(await outline(output))).toEqual(['Chapter two']);
    expect(dead(await outline(output))).toBe(0);
    expect(await attachments(output)).toEqual(['note.txt']);
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
    expect(await pageCount((await extract(fixture('mixed.pdf'), [2, 3])).output)).toBe(2);
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
