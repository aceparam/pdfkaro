// Page reading and the page update (src/engines/pages.ts), shared by the drawing step (stamp.ts), Crop PDF and
// Resize pages: where a page is shown, how numbers are written, the size budget and the capped write (moved here
// unchanged from stamp.test.ts), and what `readPages` gives with and without `{ objects: true }`.

import { describe, expect, it } from 'vitest';
import { plainCopy } from '../../src/engines/plain';
import { OutputLimit } from '../../src/engines/qpdf';
import { pageBox, pdfNumber, readPages, sizeLimit, writePageUpdate } from '../../src/engines/pages';
import { fixture, makeQpdf, tools } from './stamp-helpers';

describe('where a page is shown', () => {
  const a4 = [0, 0, 595, 842];
  it('takes a turn that is a multiple of 90, modulo 360, and any other as 0', () => {
    const turn = (rotate: unknown) => pageBox({ rotate, mediaBox: a4, cropBox: undefined, userUnit: undefined }).turn;
    expect([0, 90, 180, 270, -90, 450, 720, -450, 45, 135, 90.5, '90', null, undefined].map(turn)).toEqual([0, 90, 180, 270, 270, 90, 0, 270, 0, 0, 0, 0, 0, 0]);
  });

  it('takes the paper box when it has an area, normalised, else Letter', () => {
    const box = (mediaBox: unknown) => pageBox({ rotate: 0, mediaBox, cropBox: undefined, userUnit: undefined }).box;
    expect(box([100, 200, 712, 992])).toEqual([100, 200, 712, 992]);
    expect(box([612, 792, 0, 0])).toEqual([0, 0, 612, 792]);
    for (const bad of [undefined, [0, 0, 0, 100], [0, 0, 100], [0, 0, 'a', 100], [0, 0, Number.NaN, 100], [0, 0, Number.POSITIVE_INFINITY, 100], 'box']) expect(box(bad)).toEqual([0, 0, 612, 792]);
  });

  it('takes the crop box inside the paper, else the paper box', () => {
    const box = (cropBox: unknown) => pageBox({ rotate: 0, mediaBox: [0, 0, 612, 792], cropBox, userUnit: undefined }).box;
    expect(box([50, 50, 562, 742])).toEqual([50, 50, 562, 742]);
    expect(box([-100, -100, 300, 300])).toEqual([0, 0, 300, 300]);
    expect(box([0, 0, 0, 0])).toEqual([0, 0, 612, 792]);
    expect(box([1000, 1000, 1200, 1200])).toEqual([0, 0, 612, 792]);
  });

  it('takes the user unit when above 0, else 1, and sizes the layer upright in points', () => {
    const place = (userUnit: unknown, rotate = 0) => pageBox({ rotate, mediaBox: [0, 0, 300, 400], cropBox: undefined, userUnit });
    expect(place(2)).toMatchObject({ unit: 2, width: 600, height: 800 });
    expect(place(0)).toMatchObject({ unit: 1, width: 300, height: 400 });
    expect(place(-2)).toMatchObject({ unit: 1, width: 300, height: 400 });
    expect(place('2')).toMatchObject({ unit: 1 });
    expect(place(2, 90)).toMatchObject({ width: 800, height: 600 });
    expect(place(1, 270)).toMatchObject({ width: 400, height: 300 });
  });

  it('stops at a side under 1 point or over 10^8 points', () => {
    const place = (mediaBox: number[], userUnit?: number) => () => pageBox({ rotate: 0, mediaBox, cropBox: undefined, userUnit });
    expect(place([0, 0, 0.5, 100])).toThrow(/too small or too large/);
    expect(place([0, 0, 100, 100], 0.001)).toThrow(/too small or too large/);
    expect(place([0, 0, 2e8, 100])).toThrow(/too small or too large/);
    expect(place([0, 0, 1e5, 100], 1e4)).toThrow(/too small or too large/);
    expect(place([0, 0, 1, 1e8])()).toMatchObject({ width: 1, height: 1e8 });
    // A user unit over a million would make the matrix scale by less than a millionth, even when the sides fit.
    expect(place([0, 0, 1e-5, 1e-5], 1e7)).toThrow(/too small or too large/);
    expect(place([0, 0, 0.001, 0.001], 1e6)()).toMatchObject({ unit: 1e6, width: 1000 });
  });
});

describe('how a number is written', () => {
  it('writes numbers with at most 6 decimals and never in exponent form', () => {
    expect([1, 0.5, 1 / 3, -0, -0.0000001, 1e-7, 123456.7, 2e20, -3e16].map(pdfNumber)).toEqual(['1', '0.5', '0.333333', '0', '0', '0', '123456.7', '200000000000000000000', '-30000000000000000']);
    expect(() => pdfNumber(Number.NaN)).toThrow();
  });
});

describe('the update', { timeout: 60_000 }, () => {
  it('the cap on the new file stops a write that would pass it', async () => {
    const plain = (await plainCopy(tools, fixture('pages-500.pdf'), undefined)).plain;
    const qpdf = await makeQpdf();
    qpdf.write('/in.pdf', plain);
    qpdf.append('/update.json', new TextEncoder().encode('{"qpdf":[{"jsonversion":2,"pushedinheritedpageresources":false,"calledgetallpages":false,"maxobjectid":1},'));
    qpdf.append('/update.json', new TextEncoder().encode('{}]}'));
    expect(() => writePageUpdate(qpdf, 20_000)).toThrow(OutputLimit);
    expect(qpdf.size('/out.pdf')).toBeLessThanOrEqual(20_000);
  });

  it('the budget is twice the plain copy, 2 KB a page and 16 MB', () => {
    expect(sizeLimit(1000, 10)).toBe(2000 + 20480 + 16 * 1024 * 1024);
  });
});

describe('readPages', { timeout: 60_000 }, () => {
  it('gives every page, and no objects unless asked for them', async () => {
    const plain = (await plainCopy(tools, fixture('rich.pdf'), undefined)).plain;
    const read = await readPages(tools, plain);
    expect(read.pages).toHaveLength(2);
    expect(read.objects).toBeUndefined();
    expect(Object.keys(read)).toEqual(['max', 'pages']);
  });

  it('with { objects: true }, gives every object it read, by id, values and stream dictionaries with no data, and the same pages', async () => {
    const plain = (await plainCopy(tools, fixture('rich.pdf'), undefined)).plain;
    const [without, read] = [await readPages(tools, plain), await readPages(tools, plain, { objects: true })];
    expect(read.max).toBe(without.max);
    expect(read.pages.map((page) => [page.id, page.contents, page.place])).toEqual(without.pages.map((page) => [page.id, page.contents, page.place]));
    const objects = read.objects!;
    expect(objects.size).toBeGreaterThan(read.pages.length);
    for (const id of objects.keys()) expect(id).toMatch(/^\d+ \d+ R$/);
    for (const page of read.pages) {
      const entry = objects.get(page.id)!;
      expect('value' in entry && entry.value).toBe(page.dict);
      for (const content of page.contents) {
        const stream = objects.get(content)!;
        expect('stream' in stream).toBe(true);
        expect(Object.keys((stream as { stream: object }).stream)).toEqual(['dict']);
      }
    }
    // The outline's items are read too, so a tool can follow destinations without a second qpdf read.
    expect([...objects.values()].some((entry) => 'value' in entry && typeof entry.value === 'object' && entry.value !== null && '/Title' in entry.value)).toBe(true);
  });
});
