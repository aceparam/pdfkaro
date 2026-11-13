// The steps the page engines share (src/engines/plain.ts): the plain copy, the
// check of a list of pages, qpdf's page list and the argument file. Extract and
// Delete both use them; their own tests cover keepPages through real runs.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import { callWithArgumentFile, chosenPages, pageList, plainCopy } from '../../src/engines/plain';
import type { EngineTools } from '../../src/engines/types';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const tools: EngineTools = { qpdf: makeQpdf };
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}
const pageCount = async (bytes: Uint8Array) => Number((await qpdfOn(bytes, ['--show-npages'])).out.trim());

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
