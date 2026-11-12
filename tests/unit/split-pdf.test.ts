// The Split PDF engine: its pure parts, and real runs on the shared test set
// and on files made here, with the same qpdf the browser uses.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import {
  keptOutline,
  makeRun,
  outlineDepthLimit,
  partCount,
  partUpdate,
  parts,
  readOutline,
  run,
  updateJson,
  type OutlineItem,
  type Structure,
} from '../../src/engines/tools/split-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { TooBigForZip, zipMaxBytes, zipMaxFiles } from '../../src/widget/zip-limits';
import { failureKind } from '../../src/workers/worker-core';
import { deepOutline, indirectNamesWithAF, nestedOutline, outlineAliasingCatalog } from './outline-fixtures';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

async function split(file: Uint8Array, options: { cuts?: number[]; passwords?: (string | undefined)[] } = {}) {
  const progress: Progress[] = [];
  const outputs = await run([file], options, (step) => progress.push(step), tools);
  return { outputs, progress };
}

/** Runs qpdf on a result, as a person would on the command line. */
async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}
const pageCount = async (bytes: Uint8Array) => Number((await qpdfOn(bytes, ['--show-npages'])).out.trim());
const outlineTitles = async (bytes: Uint8Array): Promise<unknown> => {
  type Shown = { title: string; destpageposfrom1: number | null; kids: Shown[] };
  const walk = (items: Shown[]): unknown[] => items.map((item) => (item.kids.length ? { [item.title]: walk(item.kids) } : item.title));
  const { out } = await qpdfOn(bytes, ['--json=2', '--json-key=outlines']);
  return walk((JSON.parse(out) as { outlines: Shown[] }).outlines);
};
const deadBookmarks = async (bytes: Uint8Array): Promise<number> => {
  type Shown = { destpageposfrom1: number | null; kids: Shown[] };
  const count = (items: Shown[]): number => items.reduce((sum, item) => sum + (item.destpageposfrom1 === null ? 1 : 0) + count(item.kids), 0);
  const { out } = await qpdfOn(bytes, ['--json=2', '--json-key=outlines']);
  return count((JSON.parse(out) as { outlines: Shown[] }).outlines);
};
const attachments = async (bytes: Uint8Array) => Object.keys((JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments);

describe('parts', () => {
  it('gives one part per page with no cuts', () => {
    expect(parts(3, [])).toEqual([{ first: 1, last: 1 }, { first: 2, last: 2 }, { first: 3, last: 3 }]);
  });

  it('cuts after the pages given', () => {
    expect(parts(12, [3, 7])).toEqual([{ first: 1, last: 3 }, { first: 4, last: 7 }, { first: 8, last: 12 }]);
    expect(parts(2, [1])).toEqual([{ first: 1, last: 1 }, { first: 2, last: 2 }]);
  });

  it('refuses cuts out of order, repeated, at the ends, past the end or not whole', () => {
    for (const cuts of [[7, 3], [3, 3], [0], [12], [13], [2.5], [-1], [Number.NaN]]) {
      expect(() => parts(12, cuts), JSON.stringify(cuts)).toThrow(/not valid/);
    }
  });

  it('takes cuts after pages 9 and 10 in number order', () => {
    expect(parts(12, [9, 10]).map((part) => part.first)).toEqual([1, 10, 11]);
  });

  it('counts parts without making the list', () => {
    expect(partCount(120_000, [])).toBe(120_000);
    expect(partCount(120_000, [5, 9])).toBe(3);
  });
});

describe('what one zip can hold', () => {
  it('refuses more files than one zip can hold before any work', async () => {
    expect(zipMaxFiles).toBe(65_535);
    let made = 0;
    const counting: EngineTools = { qpdf: async () => (made++, makeQpdf()) };
    // A one-page file is made to read as 70,000 pages: the check comes straight after the count.
    const lying: EngineTools = {
      qpdf: async () => {
        const qpdf = await counting.qpdf!();
        const call = (qpdf as Qpdf).call.bind(qpdf);
        (qpdf as Qpdf).call = (args) => (args.includes('--show-npages') ? { code: 0, out: '70000\n', printed: '70000\n' } : call(args));
        return qpdf;
      },
    };
    const error = await run([fixture('form.pdf')], {}, () => {}, lying).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TooBigForZip);
    expect((error as TooBigForZip).reason).toBe('files');
    expect(failureKind(error)).toBe('too-many-files');
    // Only the plain copy and the count come before the check: no part is written.
    expect(made).toBe(2);
  });

  it('stops when the parts pass what one zip can hold, as a zip failure', async () => {
    expect(zipMaxBytes(2)).toBeLessThan(0xffffffff);
    expect(failureKind(new TooBigForZip('bytes'))).toBe('zip-too-large');
    // With a small limit: three parts of text.pdf pass it partway through.
    const small = makeRun(() => 3000);
    const error = await small([fixture('text.pdf')], {}, () => {}, tools).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TooBigForZip);
    expect((error as TooBigForZip).reason).toBe('bytes');
    // One part is never zipped, so the limit does not apply to it.
    await expect(small([fixture('form.pdf')], {}, () => {}, tools)).resolves.toHaveLength(1);
  });

  it('leaves room in a zip for the longest names a part can have', () => {
    // A 100-character stem in a script of three bytes a character, and "-part-65535.pdf".
    expect(0xffffffff - zipMaxBytes(65_535)).toBeGreaterThanOrEqual(65_535 * (76 + 2 * (300 + 15)) + 22);
  });
});

const item = (object: number, page: number | null, kids: OutlineItem[] = [], open = true): OutlineItem => ({ object: `${object} 0 R`, page, open, kids });

describe('reading an outline', () => {
  it('keeps objects, pages and open state, and no titles', () => {
    const read = readOutline([
      { object: '14 0 R', destpageposfrom1: 1, open: true, title: 'Part A', kids: [{ object: '16 0 R', destpageposfrom1: null, open: false, title: 'x', kids: [] }] },
    ]);
    expect(read).toEqual([item(14, 1, [item(16, null, [], false)])]);
    expect(JSON.stringify(read)).not.toContain('Part A');
  });

  it('cuts an outline at the depth limit, keeping the item there with no children', () => {
    let deep: unknown[] = [];
    for (let level = outlineDepthLimit + 3; level >= 1; level--) deep = [{ object: `${level} 0 R`, destpageposfrom1: 1, kids: deep }];
    let depth = 0;
    for (let items = readOutline(deep); items && items.length > 0; items = items[0]!.kids) depth++;
    expect(depth).toBe(outlineDepthLimit);
  });

  it('gives up on a cycle or an odd shape', () => {
    const twice = [{ object: '1 0 R', destpageposfrom1: 1, kids: [{ object: '1 0 R', destpageposfrom1: 1, kids: [] }] }];
    expect(readOutline(twice)).toBeNull();
    expect(readOutline([{ object: 'nope', kids: [] }])).toBeNull();
    expect(readOutline('x')).toBeNull();
  });
});

describe('the bookmarks a part keeps', () => {
  const outline = [item(14, 1, [item(16, 2), item(17, 3)]), item(15, 4, [item(18, 1)])];

  it('keeps those that point into the part, and moves kept children up past a dropped parent', () => {
    expect(keptOutline(outline, 2, 3)).toEqual([item(16, 2), item(17, 3)]);
    expect(keptOutline(outline, 1, 1)).toEqual([item(14, 1), item(18, 1)]);
    expect(keptOutline(outline, 1, 4)).toEqual(outline);
  });

  it('keeps nothing when nothing points into the part, and drops bookmarks that point nowhere', () => {
    expect(keptOutline([item(14, 5)], 1, 4)).toEqual([]);
    expect(keptOutline([item(14, null, [item(15, 2)])], 1, 4)).toEqual([item(15, 2)]);
  });
});

describe("a part's update", () => {
  const base = (over: Partial<Structure> = {}): Structure => ({
    maxObjectId: 20,
    catalogId: '2 0 R',
    catalog: { '/Type': '/Catalog', '/Pages': '1 0 R', '/Outlines': '13 0 R' },
    rootId: '13 0 R',
    root: { '/Type': '/Outlines', '/First': '14 0 R', '/Last': '15 0 R', '/Count': 5 },
    namesId: null,
    names: null,
    items: new Map([
      ['14 0 R', { '/Title': 'u:Part A', '/Parent': '13 0 R', '/Next': '15 0 R', '/First': '16 0 R', '/Last': '17 0 R', '/Count': 2 }],
      ['15 0 R', { '/Title': 'u:Part B', '/Parent': '13 0 R', '/Prev': '14 0 R', '/First': '18 0 R', '/Last': '18 0 R', '/Count': 1 }],
      ['16 0 R', { '/Title': 'u:A1', '/Parent': '14 0 R', '/Next': '17 0 R' }],
      ['17 0 R', { '/Title': 'u:A2', '/Parent': '14 0 R', '/Prev': '16 0 R' }],
      ['18 0 R', { '/Title': 'u:B1', '/Parent': '15 0 R' }],
    ]),
    outline: [item(14, 1, [item(16, 2), item(17, 3)]), item(15, 4, [item(18, 1)])],
    ...over,
  });

  it('relinks the kept bookmarks under the root', () => {
    const update = partUpdate(base(), { first: 2, last: 3 }, true);
    expect(update.get('13 0 R')).toMatchObject({ '/First': '16 0 R', '/Last': '17 0 R', '/Count': 2 });
    expect(update.get('16 0 R')).toEqual({ '/Title': 'u:A1', '/Parent': '13 0 R', '/Next': '17 0 R' });
    expect(update.get('17 0 R')).toEqual({ '/Title': 'u:A2', '/Parent': '13 0 R', '/Prev': '16 0 R' });
    expect(update.has('2 0 R')).toBe(false);
  });

  it('clears the children of a kept bookmark whose children are all dropped, or were never reported', () => {
    const update = partUpdate(base(), { first: 1, last: 1 }, true);
    expect(update.get('14 0 R')).toEqual({ '/Title': 'u:Part A', '/Parent': '13 0 R', '/Next': '18 0 R' });
    // A bookmark at qpdf's depth cut: its dictionary has /First, but no children were reported.
    const cut = partUpdate(base({ outline: [item(14, 1)] }), { first: 1, last: 4 }, true);
    expect(cut.get('14 0 R')).toEqual({ '/Title': 'u:Part A', '/Parent': '13 0 R' });
  });

  it('counts a closed bookmark as negative', () => {
    const update = partUpdate(base({ outline: [item(14, 1, [item(16, 2), item(17, 3)], false)] }), { first: 1, last: 4 }, true);
    expect(update.get('14 0 R')?.['/Count']).toBe(-2);
    expect(update.get('13 0 R')?.['/Count']).toBe(1);
  });

  it('removes /Outlines from the catalog when nothing is kept, or the outline was dropped whole', () => {
    expect(partUpdate(base({ outline: [item(14, 9)] }), { first: 1, last: 4 }, true).get('2 0 R')).not.toHaveProperty('/Outlines');
    expect(partUpdate(base({ outline: null }), { first: 1, last: 4 }, true).get('2 0 R')).not.toHaveProperty('/Outlines');
  });

  it('drops attached files from parts after the first, wherever /Names sits, and the catalog /AF', () => {
    const inline = base({ catalog: { '/Type': '/Catalog', '/Names': { '/EmbeddedFiles': '30 0 R', '/Dests': '31 0 R' }, '/AF': ['9 0 R'] }, rootId: null, root: null, outline: null });
    expect(partUpdate(inline, { first: 1, last: 1 }, true).size).toBe(0);
    expect(partUpdate(inline, { first: 2, last: 2 }, false).get('2 0 R')).toEqual({ '/Type': '/Catalog', '/Names': { '/Dests': '31 0 R' } });
    const indirect = base({ catalog: { '/Type': '/Catalog', '/Names': '40 0 R' }, namesId: '40 0 R', names: { '/EmbeddedFiles': '30 0 R' }, rootId: null, root: null, outline: null });
    expect(partUpdate(indirect, { first: 2, last: 2 }, false).get('40 0 R')).toEqual({});
  });

  it('is written as JSON from objects', () => {
    const text = updateJson(20, new Map([['2 0 R', { '/Title': 'u:"quoted" \\ name' }]]));
    expect(JSON.parse(text)).toEqual({
      qpdf: [{ jsonversion: 2, pushedinheritedpageresources: false, calledgetallpages: false, maxobjectid: 20 }, { 'obj:2 0 R': { value: { '/Title': 'u:"quoted" \\ name' } } }],
    });
  });
});

describe('splitting files made here', () => {
  it('keeps each part to its own bookmarks in a nested outline', async () => {
    const { outputs } = await split(await nestedOutline(), { cuts: [1, 3] });
    expect(await Promise.all(outputs.map(pageCount))).toEqual([1, 2, 1]);
    expect(await outlineTitles(outputs[0]!)).toEqual(['Part A', 'B1']);
    expect(await outlineTitles(outputs[1]!)).toEqual(['A1', 'A2']);
    expect(await outlineTitles(outputs[2]!)).toEqual(['Part B']);
    for (const output of outputs) {
      expect(await deadBookmarks(output)).toBe(0);
      expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    }
  });

  it('gives each part the levels that point into it', async () => {
    const { outputs } = await split(await deepOutline(3), { cuts: [1] });
    expect(await outlineTitles(outputs[0]!)).toEqual([{ 'Level 1': ['Level 2'] }]);
    expect(await outlineTitles(outputs[1]!)).toEqual(['Level 3']);
  });

  it('keeps a deep outline to the depth limit, and nothing below it points into another part', async () => {
    type Shown = { kids: Shown[] };
    const depthOf = async (bytes: Uint8Array) => {
      const { out } = await qpdfOn(bytes, ['--json=2', '--json-key=outlines']);
      let depth = 0;
      for (let items = (JSON.parse(out) as { outlines: Shown[] }).outlines; items.length > 0; items = items[0]!.kids) depth++;
      return depth;
    };
    const sixty = await split(await deepOutline(60), { cuts: [1] });
    // Levels 1 to 59 point at page 1; qpdf reports about 51 of them, and the engine keeps 48.
    expect(await depthOf(sixty.outputs[0]!)).toBe(outlineDepthLimit);
    const { outputs } = await split(await deepOutline(100), { cuts: [1] });
    expect(await deadBookmarks(outputs[0]!)).toBe(0);
    expect(await deadBookmarks(outputs[1]!)).toBe(0);
    for (const output of outputs) expect((await qpdfOn(output, ['--check'])).code).toBe(0);
  }, 60_000);

  it('drops the whole outline when a bookmark is the catalog', async () => {
    const { outputs } = await split(await outlineAliasingCatalog());
    for (const output of outputs) {
      expect(await outlineTitles(output)).toEqual([]);
      expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    }
  });

  it('keeps an attached file reached through an indirect /Names and /AF in the first part only', async () => {
    const { outputs } = await split(await indirectNamesWithAF());
    expect(await attachments(outputs[0]!)).toEqual(['invoice.xml']);
    expect(await attachments(outputs[1]!)).toEqual([]);
    expect(Buffer.from(outputs[1]!).includes('secret-attachment-bytes')).toBe(false);
    expect(Buffer.from(outputs[1]!).includes('/AF')).toBe(false);
  });
});

describe('splitting the shared test set', () => {
  it('text.pdf with no cuts gives three one-page parts that pass qpdf --check, with progress per file', async () => {
    const { outputs, progress } = await split(fixture('text.pdf'));
    expect(await Promise.all(outputs.map(pageCount))).toEqual([1, 1, 1]);
    for (const output of outputs) expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    expect(progress).toEqual([1, 2, 3].map((done) => ({ stage: 'working', unit: 'file', done, total: 3 })));
  });

  it('pages-500.pdf with two cuts gives the right runs', async () => {
    const { outputs } = await split(fixture('pages-500.pdf'), { cuts: [9, 10] });
    expect(await Promise.all(outputs.map(pageCount))).toEqual([9, 1, 490]);
  });

  it('pages-500.pdf with no cuts gives 500 parts, each passing qpdf --check', async () => {
    const { outputs } = await split(fixture('pages-500.pdf'));
    expect(outputs).toHaveLength(500);
    for (const output of outputs) expect((await qpdfOn(output, ['--check'])).code).toBe(0);
  }, 300_000);

  it('scanned.pdf, restricted.pdf, warning.pdf and images.pdf split; mixed.pdf keeps each page\'s size and turn', async () => {
    expect(await Promise.all((await split(fixture('scanned.pdf'))).outputs.map(pageCount))).toEqual([1, 1]);
    const restricted = (await split(fixture('restricted.pdf'), { cuts: [1] })).outputs;
    expect((await qpdfOn(restricted[0]!, ['--show-encryption'])).out).toContain('not encrypted');
    expect(await Promise.all((await split(fixture('warning.pdf'))).outputs.map(pageCount))).toEqual([1, 1, 1]);
    expect(await Promise.all((await split(fixture('images.pdf'))).outputs.map(pageCount))).toEqual([1]);
    // Each part keeps its page's size and turn.
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const shape = async (bytes: Uint8Array) =>
      (await PDFDocument.load(bytes)).getPages().map((page) => ({ size: [page.getWidth(), page.getHeight()].map(Math.round), turn: page.getRotation().angle }));
    const original = await shape(fixture('mixed.pdf'));
    const mixed = (await split(fixture('mixed.pdf'))).outputs;
    expect((await Promise.all(mixed.map(shape))).flat()).toEqual(original);
  });

  it('password.pdf opens with its password, and its parts have no password', async () => {
    await expect(split(fixture('password.pdf'))).rejects.toThrow(/password/);
    const { outputs } = await split(fixture('password.pdf'), { passwords: ['open-sesame'], cuts: [2] });
    expect(await Promise.all(outputs.map(pageCount))).toEqual([2, 1]);
    for (const output of outputs) expect((await qpdfOn(output, ['--show-encryption'])).out).toContain('not encrypted');
  });

  it('rich.pdf: part 1 keeps Chapter one, the link and the attached file; part 2 keeps Chapter two and nothing of the file', async () => {
    const { outputs } = await split(fixture('rich.pdf'));
    expect(await outlineTitles(outputs[0]!)).toEqual(['Chapter one']);
    expect(await outlineTitles(outputs[1]!)).toEqual(['Chapter two']);
    expect(await attachments(outputs[0]!)).toEqual(['note.txt']);
    expect(await attachments(outputs[1]!)).toEqual([]);
    const second = Buffer.from(outputs[1]!);
    expect(second.includes('A note kept inside the PDF')).toBe(false);
    expect(second.includes('/EmbeddedFile')).toBe(false);
    expect(second.includes('/AF')).toBe(false);
    expect(Buffer.from(outputs[0]!).includes('/URI')).toBe(true);
  });

  it('form.pdf gives one part that keeps its fields', async () => {
    const { outputs } = await split(fixture('form.pdf'));
    expect(outputs).toHaveLength(1);
    const { out } = await qpdfOn(outputs[0]!, ['--json=2', '--json-key=acroform']);
    const fields = (JSON.parse(out) as { acroform: { fields: { fullname: string }[] } }).acroform.fields.map((field) => field.fullname);
    expect(fields).toEqual(expect.arrayContaining(['name', 'agree']));
  });

  it('refuses a damaged file, a file that is not a PDF, and bad cuts', async () => {
    for (const name of ['damaged-cut.pdf', 'damaged-xref.pdf', 'not-a-pdf.pdf']) await expect(split(fixture(name)), name).rejects.toThrow();
    await expect(split(fixture('text.pdf'), { cuts: [3] })).rejects.toThrow(/not valid/);
    await expect(split(fixture('text.pdf'), { cuts: 'all' as never })).rejects.toThrow(/not valid/);
  });

  it('puts no bookmark title in an error', async () => {
    const error = await split(fixture('rich.pdf'), { cuts: [5] }).catch((caught: Error) => caught);
    expect(String(error)).not.toContain('Chapter');
  });
});
