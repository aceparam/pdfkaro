// The Rotate PDF engine: its check of the turns, and real runs on the shared
// test set and on files made here, with the same qpdf the browser uses. Turns
// are read back through the page tree and normalised as PDF.js draws them.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFNumber, PDFDict } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { pageTurns, run } from '../../src/engines/tools/rotate-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

type Turns = { all: number; pages: [number, number][] };
async function turn(file: Uint8Array, turns: Turns, passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const [output] = await run([file], { turns, passwords }, (step) => progress.push(step), tools);
  return { output: output!, progress };
}

async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}

/** Each page's turn in degrees, resolved through /Parent and normalised as PDF.js does. */
async function turnsOf(bytes: Uint8Array): Promise<number[]> {
  const shown = JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=pages', '--json-key=qpdf'])).out) as {
    pages: { object: string }[];
    qpdf: [unknown, Record<string, { value?: Record<string, unknown> }>];
  };
  const objects = shown.qpdf[1];
  const valueOf = (ref: string) => objects[`obj:${ref}`]?.value ?? {};
  return shown.pages.map(({ object }) => {
    let node = valueOf(object);
    for (let depth = 0; node['/Rotate'] === undefined && typeof node['/Parent'] === 'string' && depth < 50; depth++) node = valueOf(node['/Parent'] as string);
    const raw = Number(node['/Rotate'] ?? 0);
    return raw % 90 === 0 ? ((raw % 360) + 360) % 360 : 0;
  });
}

async function plainText(bytes: Uint8Array): Promise<string> {
  const qpdf = await makeQpdf();
  qpdf.write('/r.pdf', bytes);
  qpdf.call(['--qdf', '--object-streams=disable', '--stream-data=uncompress', '/r.pdf', '/q.pdf']);
  return new TextDecoder('latin1').decode(qpdf.read('/q.pdf'));
}

/** Pages with the given existing turns; `undefined` gives a page no /Rotate of its own. */
async function withTurns(rotates: (number | undefined)[], inherited?: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const rotate of rotates) {
    const page = doc.addPage([200, 300]);
    page.node.delete(PDFName.of('Rotate'));
    if (rotate !== undefined) page.node.set(PDFName.of('Rotate'), PDFNumber.of(rotate));
  }
  if (inherited !== undefined) doc.catalog.lookup(PDFName.of('Pages'), PDFDict).set(PDFName.of('Rotate'), PDFNumber.of(inherited));
  return doc.save({ useObjectStreams: false });
}

describe('the page turns', () => {
  it('groups pages by the quarters to add: every page, and pages on their own on top', () => {
    expect(pageTurns(5, { all: 0, pages: [[2, 1], [4, 2]] })).toEqual({ 1: [2], 2: [4], 3: [] });
    expect(pageTurns(4, { all: 1, pages: [[2, 3], [3, 1]] })).toEqual({ 1: [1, 4], 2: [3], 3: [] });
    expect(pageTurns(3, { all: 0, pages: [] })).toEqual({ 1: [], 2: [], 3: [] });
    expect(pageTurns(3, { all: 3, pages: [] })).toEqual({ 1: [], 2: [], 3: [1, 2, 3] });
  });

  it('refuses turns that are not valid', () => {
    const bad: unknown[] = [
      null, 'right', 5, {}, { all: 0 }, { pages: [] }, { all: 4, pages: [] }, { all: -1, pages: [] }, { all: 1.5, pages: [] },
      { all: 0, pages: [[4, 1]] }, { all: 0, pages: [[0, 1]] }, { all: 0, pages: [[2, 1], [2, 1]] }, { all: 0, pages: [[3, 1], [1, 1]] },
      { all: 0, pages: [[1, 0]] }, { all: 0, pages: [[1, 4]] }, { all: 0, pages: [[1, 1.5]] }, { all: 0, pages: [[1, '1']] },
      { all: 0, pages: [{ page: 1, quarters: 1 }] }, { all: 0, pages: [1] }, { all: 0, pages: [[1, 1, 1]] }, { all: 0, pages: [[1, 1], [2, 1], [3, 1], [3, 2]] },
    ];
    for (const turns of bad) expect(() => pageTurns(3, turns), JSON.stringify(turns)).toThrow(/not valid/);
  });
});

describe('turning the shared test set', () => {
  it('text.pdf: page 2 a quarter right, page 3 half round, passing qpdf --check, with honest progress', async () => {
    const { output, progress } = await turn(fixture('text.pdf'), { all: 0, pages: [[2, 1], [3, 2]] });
    expect(await turnsOf(output)).toEqual([0, 90, 180]);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    expect(await plainText(output)).toContain('(Ordinary document, page 2) Tj');
    expect(progress).toEqual([
      { stage: 'writing', percent: 0 },
      { stage: 'writing', percent: 100 },
    ]);
  });

  it('every page turned left', async () => {
    expect(await turnsOf((await turn(fixture('text.pdf'), { all: 3, pages: [] })).output)).toEqual([270, 270, 270]);
  });

  it('nothing turned still writes the file as it was, unprotected', async () => {
    const { output } = await turn(fixture('restricted.pdf'), { all: 0, pages: [] });
    expect(await turnsOf(output)).toEqual([0, 0, 0]);
    expect((await qpdfOn(output, ['--show-encryption'])).out).toContain('not encrypted');
  });

  it('mixed.pdf: a turn adds to the one each page already has', async () => {
    // A4 upright, Letter on its side, A5 a quarter, A4 upside down.
    expect(await turnsOf(fixture('mixed.pdf'))).toEqual([0, 0, 90, 180]);
    expect(await turnsOf((await turn(fixture('mixed.pdf'), { all: 1, pages: [] })).output)).toEqual([90, 90, 180, 270]);
    expect(await turnsOf((await turn(fixture('mixed.pdf'), { all: 0, pages: [[4, 2]] })).output)).toEqual([0, 0, 90, 0]);
  });

  it('pages-500.pdf: every other page turned, the result no bigger than the input', async () => {
    const input = fixture('pages-500.pdf');
    const pages = Array.from({ length: 250 }, (_, index) => [index * 2 + 1, 1] as [number, number]);
    const { output } = await turn(input, { all: 0, pages });
    const turns = await turnsOf(output);
    expect(turns.slice(0, 4)).toEqual([90, 0, 90, 0]);
    expect(turns.filter((each) => each === 90)).toHaveLength(250);
    expect(output.length).toBeLessThanOrEqual(input.length);
  }, 120_000);

  it('rich.pdf: bookmarks, link and note.txt kept', async () => {
    const { output } = await turn(fixture('rich.pdf'), { all: 0, pages: [[1, 1]] });
    const outline = JSON.parse((await qpdfOn(output, ['--json=2', '--json-key=outlines'])).out) as { outlines: { title: string; destpageposfrom1: number }[] };
    expect(outline.outlines.map((item) => [item.title, item.destpageposfrom1])).toEqual([['Chapter one', 1], ['Chapter two', 2]]);
    expect(Object.keys((JSON.parse((await qpdfOn(output, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments)).toEqual(['note.txt']);
    expect(await plainText(output)).toMatch(/\/Subtype \/Link/);
  });

  it('tagged.pdf keeps everything', async () => {
    const text = await plainText((await turn(fixture('tagged.pdf'), { all: 2, pages: [] })).output);
    for (const kept of ['SECRET-PAGE-TWO-TEXT', 'SECRET-ALT-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-NOTE']) expect(text, kept).toContain(kept);
  });

  it('password.pdf with its password gives a file with no password', async () => {
    await expect(turn(fixture('password.pdf'), { all: 1, pages: [] })).rejects.toThrow(/password/);
    const { output } = await turn(fixture('password.pdf'), { all: 1, pages: [] }, ['open-sesame']);
    expect((await qpdfOn(output, ['--show-encryption'])).out).toContain('not encrypted');
    expect(await turnsOf(output)).toEqual([90, 90, 90]);
  });

  it('scanned, warning, images and form files', async () => {
    expect(await turnsOf((await turn(fixture('scanned.pdf'), { all: 0, pages: [[2, 3]] })).output)).toEqual([0, 270]);
    expect(await turnsOf((await turn(fixture('warning.pdf'), { all: 1, pages: [] })).output)).toEqual([90, 90, 90]);
    expect(await turnsOf((await turn(fixture('images.pdf'), { all: 2, pages: [] })).output)).toEqual([180]);
    const { output } = await turn(fixture('form.pdf'), { all: 1, pages: [] });
    expect((await qpdfOn(output, ['--json=2', '--json-key=acroform'])).out).toContain('"fullname": "name"');
  });

  it('refuses damaged files and turns that are not valid', async () => {
    for (const name of ['damaged-cut.pdf', 'damaged-xref.pdf', 'not-a-pdf.pdf']) await expect(turn(fixture(name), { all: 1, pages: [] }), name).rejects.toThrow();
    await expect(turn(fixture('text.pdf'), { all: 0, pages: [[4, 1]] })).rejects.toThrow(/not valid/);
  });
});

describe('odd turns already in a file (the security reviewer, stage 1)', () => {
  it('45, -90 and 450 are normalised as PDF.js draws them, then turned', async () => {
    const file = await withTurns([45, -90, 450, 135]);
    expect(await turnsOf(file)).toEqual([0, 270, 90, 0]);
    expect(await turnsOf((await turn(file, { all: 1, pages: [] })).output)).toEqual([90, 0, 180, 90]);
  });

  it('a turn inherited from the page tree is added to', async () => {
    const file = await withTurns([undefined, undefined, 0], 90);
    expect(await turnsOf(file)).toEqual([90, 90, 0]);
    expect(await turnsOf((await turn(file, { all: 1, pages: [] })).output)).toEqual([180, 180, 90]);
  });
});
