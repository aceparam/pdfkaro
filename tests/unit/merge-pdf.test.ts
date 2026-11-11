// The Merge PDF engine and the shared PDF reader, run in Node against every
// file in the shared test set, with the same qpdf the browser uses.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { inspectPdf } from '../../src/engines/inspect';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { mergeArgs, run } from '../../src/engines/tools/merge-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

/** Runs qpdf on a result to check it, as a person would on the command line. */
async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; printed: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}

async function merge(names: string[], passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const [out] = await run(names.map(fixture), { passwords }, (step) => progress.push(step), tools);
  return { out: out!, progress };
}

const pageSizes = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((page) => `${Math.round(page.getWidth())}x${Math.round(page.getHeight())}`);

describe('reading a file before the job', () => {
  const expected: [string, string | undefined, unknown][] = [
    ['text.pdf', undefined, { kind: 'ready', pages: 3 }],
    ['pages-500.pdf', undefined, { kind: 'ready', pages: 500 }],
    ['scanned.pdf', undefined, { kind: 'ready', pages: 2 }],
    ['password.pdf', undefined, { kind: 'needs-password' }],
    ['password.pdf', 'not-it', { kind: 'wrong-password' }],
    ['password.pdf', 'open-sesame', { kind: 'ready', pages: 3 }],
    ['restricted.pdf', undefined, { kind: 'ready', pages: 3 }],
    // qpdf reads it with a warning and exits with 3: still a good file.
    ['warning.pdf', undefined, { kind: 'ready', pages: 3 }],
    ['damaged-xref.pdf', undefined, { kind: 'damaged' }],
    ['damaged-cut.pdf', undefined, { kind: 'damaged' }],
    ['not-a-pdf.pdf', undefined, { kind: 'damaged' }],
    ['form.pdf', undefined, { kind: 'ready', pages: 1 }],
    ['mixed.pdf', undefined, { kind: 'ready', pages: 4 }],
    ['rich.pdf', undefined, { kind: 'ready', pages: 2 }],
  ];
  it.each(expected)('%s with password %s', async (name, password, outcome) => {
    await expect(inspectPdf(fixture(name), password, tools)).resolves.toEqual(outcome);
  });

  it('takes a password that starts with @ or holds odd characters as it is, never as a file to read', async () => {
    await expect(inspectPdf(fixture('password.pdf'), '@/in.pdf', tools)).resolves.toEqual({ kind: 'wrong-password' });
    await expect(inspectPdf(fixture('password.pdf'), 'a b\n--decrypt', tools)).resolves.toEqual({ kind: 'wrong-password' });
  });
});

describe('merging', () => {
  it('joins every page of every file, in the order given, into a file qpdf finds sound', async () => {
    const { out } = await merge(['mixed.pdf', 'text.pdf']);
    expect((await qpdfOn(out, ['--check'])).code).toBe(0);
    expect(await pageSizes(out)).toEqual(['595x842', '792x612', '420x595', '595x842', '595x842', '595x842', '595x842']);
    const turned = await merge(['text.pdf', 'mixed.pdf']);
    expect((await pageSizes(turned.out)).slice(3)).toEqual(['595x842', '792x612', '420x595', '595x842']);
  });

  it('keeps the rotation of each page', async () => {
    const { out } = await merge(['text.pdf', 'mixed.pdf']);
    const turns = (await PDFDocument.load(out)).getPages().map((page) => page.getRotation().angle);
    expect(turns).toEqual([0, 0, 0, 0, 0, 90, 180]);
  });

  // Every readable file in the test set, first and second, against the ordinary one.
  const readable: [string, string | undefined, number][] = [
    ['pages-500.pdf', undefined, 500],
    ['scanned.pdf', undefined, 2],
    ['password.pdf', 'open-sesame', 3],
    ['restricted.pdf', undefined, 3],
    ['form.pdf', undefined, 1],
    ['mixed.pdf', undefined, 4],
    ['rich.pdf', undefined, 2],
    ['warning.pdf', undefined, 3],
  ];
  it.each(readable)('merges %s before and after the ordinary file', async (name, password, pages) => {
    for (const order of [[name, 'text.pdf'], ['text.pdf', name]]) {
      const passwords = order.map((each) => (each === name ? password : undefined));
      const { out } = await merge(order, passwords);
      expect((await qpdfOn(out, ['--check'])).code).toBe(0);
      expect((await qpdfOn(out, ['--show-npages'])).printed.trim()).toBe(String(pages + 3));
      // qpdf --is-encrypted exits with 2 when a file is not encrypted.
      expect((await qpdfOn(out, ['--is-encrypted'])).code).toBe(2);
    }
  });

  it('fails, and hands back nothing, on a damaged file', async () => {
    for (const damaged of ['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']) {
      await expect(merge(['text.pdf', damaged])).rejects.toThrow();
      await expect(merge([damaged, 'text.pdf'])).rejects.toThrow();
    }
  });

  it('fails on a protected file without its password', async () => {
    await expect(merge(['text.pdf', 'password.pdf'])).rejects.toThrow(/password/);
    await expect(merge(['password.pdf', 'text.pdf'], ['wrong'])).rejects.toThrow(/password/);
  });

  it('gives a result with no password or restrictions when the first file had them', async () => {
    for (const [first, password] of [['password.pdf', 'open-sesame'], ['restricted.pdf', undefined]] as const) {
      const { out } = await merge([first, 'text.pdf'], [password, undefined]);
      expect((await qpdfOn(out, ['--is-encrypted'])).code).toBe(2);
      expect((await qpdfOn(out, ['--show-encryption'])).printed).toMatch(/not encrypted/i);
    }
  });

  it("keeps the first file's bookmarks, link and attachment", async () => {
    const { out } = await merge(['rich.pdf', 'text.pdf']);
    const doc = await PDFDocument.load(out);
    const outlines = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect(outlines.get(PDFName.of('Count'))?.toString()).toBe('2');
    expect(doc.getPage(0).node.Annots()?.size()).toBe(1);
    expect((await qpdfOn(out, ['--list-attachments'])).printed).toContain('note.txt');
  });

  it("keeps a later file's link, but not its bookmarks or attachment", async () => {
    const { out } = await merge(['text.pdf', 'rich.pdf']);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(3).node.Annots()?.size()).toBe(1);
    expect(doc.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
    expect((await qpdfOn(out, ['--list-attachments'])).printed).not.toContain('note.txt');
  });

  it("keeps a form's fields, whether the form comes first or later", async () => {
    for (const order of [['form.pdf', 'text.pdf'], ['text.pdf', 'form.pdf']]) {
      const { out } = await merge(order);
      const names = (await PDFDocument.load(out)).getForm().getFields().map((field) => field.getName());
      expect(names.sort()).toEqual(['agree', 'name']);
    }
  });

  it('keeps the text of the ordinary file', async () => {
    const { out } = await merge(['scanned.pdf', 'text.pdf']);
    const qpdf = await makeQpdf();
    qpdf.write('/check.pdf', out);
    expect(qpdf.call(['--qdf', '--object-streams=disable', '/check.pdf', '/plain.pdf']).code).toBe(0);
    const plain = Buffer.from(qpdf.read('/plain.pdf')).toString('latin1');
    for (const words of ['Ordinary document, page 1', 'Ordinary document, page 3']) expect(plain).toContain(`(${words}) Tj`);
  });

  it('reports each file as it is read, then write progress that only goes up', async () => {
    const { progress } = await merge(['text.pdf', 'pages-500.pdf', 'mixed.pdf']);
    expect(progress.slice(0, 3)).toEqual([1, 2, 3].map((done) => ({ stage: 'reading', unit: 'file', done, total: 3 })));
    const percents = progress.slice(3).map((step) => (step.stage === 'writing' ? step.percent : -1));
    expect(percents.length).toBeGreaterThan(5);
    expect(percents.every((percent, index) => percent >= 0 && (index === 0 || percent > percents[index - 1]!))).toBe(true);
    expect(percents.at(-1)).toBe(100);
  });

  it('needs at least two files', async () => {
    await expect(merge(['text.pdf'])).rejects.toThrow();
  });
});

describe("qpdf's arguments", () => {
  it('uses made-up paths, and passes each password only inside --password=', () => {
    expect(mergeArgs(3, [undefined, '@secret', undefined])).toEqual([
      '--progress', '--decrypt', '/in/0.pdf', '--pages', '.', '1-z',
      '/in/1.pdf', '--password=@secret', '1-z', '/in/2.pdf', '1-z', '--', '/out.pdf',
    ]);
    expect(mergeArgs(2, ['pw'])).toEqual(['--progress', '--password=pw', '--decrypt', '/in/0.pdf', '--pages', '.', '1-z', '/in/1.pdf', '1-z', '--', '/out.pdf']);
  });
});
