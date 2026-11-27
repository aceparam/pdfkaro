// Resize pages: the engine on every file in the shared test set and on files written by hand, through the same
// qpdf the browser gets, each result read back by qpdf and by PDF.js's legacy build. Expected numbers are
// hand-computed literals (worked out apart from the engine, with decimal arithmetic), or derived from PDF.js's
// viewports of the original and the result: a point shown at s before is shown at f·s + offset after, where f is
// the shown page's fit into the paper and the offset centres it. None is taken from the engine's own exports.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fixed, makeRun, placement, run } from '../../src/engines/tools/resize-pdf';
import { OutputLimit } from '../../src/engines/qpdf';
import { failureKind } from '../../src/workers/worker-core';
import { fixture, pageStreams, texts } from './stamp-helpers';
import { dictionaries, inkBox, pageDicts, pdf, picture, prefixOf, redBox, redPixels, resize, shown, stream, tools, watchFetch, withoutRefs } from './resize-helpers';

type Json = Record<string, unknown>;
const password = 'open-sesame';

// The engine never fetches: every test runs with a fetch that throws and records.
const fetched = watchFetch();
afterAll(() => {
  fetched.restore();
  expect(fetched.calls).toEqual([]);
});

/** The two papers, upright, in points: A4 210 by 297 mm, Letter 8.5 by 11 inches. */
const A4 = [595.276, 841.89] as const;
const LETTER = [612, 792] as const;

/** A moved value as the engine is to write it: k·v + t, rounded to 6 decimals. */
const r6 = (value: number) => Math.round(value * 1e6) / 1e6;
const through = (m: { k: number; tx: number; ty: number }, values: number[]) => values.map((value, index) => r6(m.k * value + (index % 2 === 0 ? m.tx : m.ty)));

/** Expects numbers to be within `within` of each other, item by item. */
function near(actual: unknown, expected: readonly number[], within = 1e-6, label = '') {
  expect(Array.isArray(actual), label).toBe(true);
  const list = actual as number[];
  expect(list.length, label).toBe(expected.length);
  list.forEach((value, index) => expect(Math.abs(value - expected[index]!), `${label} item ${index}: ${value} against ${expected[index]}`).toBeLessThanOrEqual(within));
}

/** Each page's own content streams as text, and each resized page's prefix read back. */
async function wraps(bytes: Uint8Array) {
  return (await pageStreams(bytes)).map((streams) => (streams[0]?.startsWith('q\n') && streams.at(-1) === '\nQ\n' ? { prefix: prefixOf(streams[0]!), own: streams.slice(1, -1) } : { prefix: null, own: streams }));
}

async function encrypted(bytes: Uint8Array): Promise<boolean> {
  const qpdf = await tools.qpdf!();
  const q = qpdf as { write(p: string, b: Uint8Array): void; call(a: string[]): { out: string } };
  q.write('/in.pdf', bytes);
  return (JSON.parse(q.call(['--json=2', '--json-key=encrypt', '/in.pdf']).out) as { encrypt: { encrypted: boolean } }).encrypt.encrypted;
}

async function checked(bytes: Uint8Array): Promise<number> {
  const qpdf = (await tools.qpdf!()) as { write(p: string, b: Uint8Array): void; call(a: string[]): { code: number } };
  qpdf.write('/in.pdf', bytes);
  return qpdf.call(['--check', '/in.pdf']).code;
}

// ---------------------------------------------------------------------------
// Numbers.

describe('how numbers are written', () => {
  it('in fixed form, never an exponent, at most 10 significant digits and at most 20 decimals', () => {
    expect(fixed(612 / 629.2).text).toBe('0.9726636999');
    expect(fixed(595.276 / 612).text).toBe('0.9726732026');
    expect(fixed(4.4e-9).text).toBe('0.0000000044');
    expect(fixed(-1.2e-9).text).toBe('-0.0000000012');
    expect(fixed(35.766411764705).text).toBe('35.76641176');
    expect(fixed(-972672229.94).text).toBe('-972672229.9');
    expect(fixed(1e-25).text).toBe('0');
    expect(fixed(-0).text).toBe('0');
    expect(fixed(12).text).toBe('12');
    for (const value of [1e-7, 3.3e-15, 123456.789012345, -0.000123456789123]) expect(fixed(value).text).not.toMatch(/e/i);
    expect(fixed(1e-7).text).toBe('0.0000001');
  });

  it('rounds down or up when asked, so a clip never moves inward', () => {
    expect(fixed(0.12345678904, 20, 'down').text).toBe('0.123456789');
    expect(fixed(0.12345678906, 20, 'down').text).toBe('0.123456789');
    expect(fixed(0.12345678904, 20, 'up').text).toBe('0.1234567891');
    expect(fixed(100, 20, 'up').text).toBe('100');
  });

  it('the clip is outward on every side, even when rounding to the nearest would leave the far edge inside (a negative corner)', () => {
    // The stage 2 code reviewer's box: rounding the size to the nearest left x1 half a unit in the tenth digit inside.
    const [x0, x1] = [-294.05818623891525, 993.6035291999975];
    const box: [number, number, number, number] = [x0, 0, x1, 500];
    const placed = placement({ turn: 0, box, unit: 1, width: x1 - x0, height: 500 }, 'a4')!;
    const { clip } = prefixOf(placed.prefix);
    expect(clip[0]!).toBeLessThanOrEqual(x0);
    expect(clip[1]!).toBeLessThanOrEqual(0);
    expect(clip[0]! + clip[2]!).toBeGreaterThanOrEqual(x1);
    expect(clip[1]! + clip[3]!).toBeGreaterThanOrEqual(500);
    // Still within 0.01 point of the old box once scaled.
    expect((clip[0]! + clip[2]! - x1) * placed.matrix.k).toBeLessThan(0.01);
    expect((x0 - clip[0]!) * placed.matrix.k).toBeLessThan(0.01);
  });

  it('moved values keep at most 6 decimals', () => {
    expect(fixed(1 / 3, 6).text).toBe('0.333333');
    expect(fixed(1234.56789012, 6).text).toBe('1234.56789');
  });
});

// ---------------------------------------------------------------------------
// Every file in the test set.

const fixtures = readdirSync(join(__dirname, '../fixtures'))
  .filter((name) => name.endsWith('.pdf'))
  .sort();

/** What Resize does with each file of the shared test set, for A4 and for Letter, as recorded in tests/fixtures/README.md: pages resized of all, none, or fails. */
const expected: Record<string, { a4: [number, number] | 'none' | 'fails'; letter: [number, number] | 'none' | 'fails' }> = {
  'chinese-unembedded.pdf': { a4: 'none', letter: [1, 1] },
  'compress-bomb-attachment.pdf': { a4: 'none', letter: [1, 1] },
  'compress-flate-bomb.pdf': { a4: [1, 1], letter: [1, 1] },
  'compress-jpeg-mismatch.pdf': { a4: [2, 2], letter: [2, 2] },
  'compress-json-bomb.pdf': { a4: 'fails', letter: 'fails' },
  'grey-only.pdf': { a4: [2, 2], letter: [2, 2] },
  'compress-kinds.pdf': { a4: [7, 7], letter: [7, 7] },
  'compress-lossless.pdf': { a4: 'none', letter: [1, 1] },
  'compress-packed.pdf': { a4: 'none', letter: [3, 3] },
  'compress-password.pdf': { a4: [1, 1], letter: [1, 1] },
  'compress-scans.pdf': { a4: 'none', letter: [3, 3] },
  'compress-small-jpg.pdf': { a4: 'none', letter: [1, 1] },
  'compress-text.pdf': { a4: 'none', letter: [3, 3] },
  'damaged-cut.pdf': { a4: 'fails', letter: 'fails' },
  'damaged-xref.pdf': { a4: 'fails', letter: 'fails' },
  'form.pdf': { a4: 'none', letter: [1, 1] },
  'images.pdf': { a4: 'none', letter: [1, 1] },
  'mixed.pdf': { a4: [2, 4], letter: [3, 4] },
  'multilingual.pdf': { a4: 'none', letter: [5, 5] },
  'not-a-pdf.pdf': { a4: 'fails', letter: 'fails' },
  'pages-500.pdf': { a4: 'none', letter: [500, 500] },
  'password.pdf': { a4: 'none', letter: [3, 3] },
  'restricted.pdf': { a4: 'none', letter: [3, 3] },
  'rich.pdf': { a4: 'none', letter: [2, 2] },
  'scanned.pdf': { a4: 'none', letter: [2, 2] },
  'tagged.pdf': { a4: [2, 2], letter: [2, 2] },
  'text.pdf': { a4: 'none', letter: [3, 3] },
  'warning.pdf': { a4: 'none', letter: [3, 3] },
};

const passwordOf = (name: string) => (name === 'password.pdf' || name === 'compress-password.pdf' ? password : undefined);
const keyless = (dict: Json, leave: string[]) => withoutRefs(Object.fromEntries(Object.entries(dict).filter(([key]) => !leave.includes(key))));

describe('Resize pages on every file in the test set', () => {
  it('lists every fixture', () => {
    expect(fixtures).toEqual(Object.keys(expected).sort());
  });

  for (const name of fixtures) {
    for (const paper of ['a4', 'letter'] as const) {
      const outcome = expected[name]![paper];
      it(`${name} to ${paper}: ${Array.isArray(outcome) ? `${outcome[0]} of ${outcome[1]} pages resized` : outcome}`, { timeout: 120_000 }, async () => {
        const bytes = fixture(name);
        const given = passwordOf(name);
        if (outcome === 'fails') {
          await expect(resize(bytes, paper, given)).rejects.toThrow();
          return;
        }
        const { outputs, output } = await resize(bytes, paper, given);
        if (outcome === 'none') {
          expect(outputs).toEqual([]);
          return;
        }
        const after = output!;
        expect(await checked(after)).toBe(0);
        expect(await encrypted(after)).toBe(false);
        const [was, now] = [await pageDicts(bytes, given), await pageDicts(after)];
        expect(now).toHaveLength(outcome[1]);
        const [oldStreams, newWraps] = [await pageStreams(bytes, given), await wraps(after)];
        const [pw, ph] = paper === 'a4' ? A4 : LETTER;
        let resized = 0;
        now.forEach((page, index) => {
          const old = was[index]!;
          const wrap = newWraps[index]!;
          // Content is never rewritten: each page's own streams, byte for byte, between the prefix and the restore.
          expect(wrap.own, `streams of page ${index + 1}`).toEqual(oldStreams[index]);
          if (wrap.prefix === null) {
            // A page left as it is: the same dictionary.
            expect(keyless(page, ['/Parent']), `page ${index + 1}`).toEqual(keyless(old, ['/Parent']));
            return;
          }
          resized++;
          const box = page['/MediaBox'] as number[];
          expect(page['/CropBox']).toEqual(box);
          expect(box.slice(0, 2)).toEqual([0, 0]);
          expect([box.slice(2).join(' '), box.slice(2).reverse().join(' ')]).toContain(`${pw} ${ph}`);
          for (const key of ['/UserUnit', '/BleedBox', '/TrimBox', '/ArtBox', '/Thumb', '/VP']) expect(page[key]).toBeUndefined();
          expect(page['/Rotate']).toEqual(old['/Rotate']);
          expect(withoutRefs(page['/Resources'])).toEqual(withoutRefs(old['/Resources']));
          expect(String(wrap.prefix.kText).replace(/^0\.0*|\./g, '').length).toBeLessThanOrEqual(10);
        });
        expect(resized).toBe(outcome[0]);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Pages written by hand.

/**
 * One page per spec, each with a red-free black mark in its lower left quarter, a link with /QuadPoints, an ink note,
 * a widget with a value, and named destinations to it of five kinds; an outline item to each page's /FitR place.
 */
type PageSpec = { media: readonly number[]; rotate?: number; unit?: number };
function markedFile(specs: PageSpec[]): Uint8Array {
  // 1 catalog, 2 pages, 3 dests, 4 outlines, 5 acroform; then 7 objects a page from 6; then one outline item a page.
  const bodies: string[] = [];
  const pageIds: number[] = [];
  const perPage = 7;
  const first = 6;
  const itemFirst = first + perPage * specs.length;
  const dests: string[] = [];
  const fields: string[] = [];
  specs.forEach((spec, index) => {
    const base = first + perPage * index;
    pageIds.push(base);
    const [x0, y0, x1, y1] = spec.media as [number, number, number, number];
    const [bw, bh] = [x1 - x0, y1 - y0];
    const mark = `0 0 0 rg ${x0 + bw * 0.1} ${y0 + bh * 0.1} ${bw * 0.3} ${bh * 0.2} re f`;
    const link = [x0 + bw * 0.2, y0 + bh * 0.5, x0 + bw * 0.4, y0 + bh * 0.55];
    const quad = [link[0], link[3], link[2], link[3], link[0], link[1], link[2], link[1]];
    const ink = [x0 + bw * 0.6, y0 + bh * 0.6, x0 + bw * 0.7, y0 + bh * 0.7, x0 + bw * 0.8, y0 + bh * 0.65];
    const widget = [x0 + bw * 0.5, y0 + bh * 0.2, x0 + bw * 0.9, y0 + bh * 0.25];
    const extra = `${spec.rotate !== undefined ? ` /Rotate ${spec.rotate}` : ''}${spec.unit !== undefined ? ` /UserUnit ${spec.unit}` : ''}`;
    bodies[base - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [${spec.media.join(' ')}]${extra} /Resources << >> /Contents ${base + 1} 0 R /Annots [${base + 2} 0 R ${base + 3} 0 R ${base + 4} 0 R] /BleedBox [${spec.media.join(' ')}] /TrimBox [${spec.media.join(' ')}] /ArtBox [${spec.media.join(' ')}] /Thumb ${base + 5} 0 R /VP [<< /Type /Viewport /BBox [${spec.media.join(' ')}] /Measure ${base + 6} 0 R >>] >>`;
    bodies[base] = stream(mark);
    bodies[base + 1] = `<< /Type /Annot /Subtype /Link /Rect [${link.join(' ')}] /QuadPoints [${quad.join(' ')}] /Border [0 0 0] /Dest [${base} 0 R /XYZ ${link[0]} ${link[3]} 2] >>`;
    bodies[base + 2] = `<< /Type /Annot /Subtype /Ink /Rect [${x0 + bw * 0.6} ${y0 + bh * 0.6} ${x0 + bw * 0.8} ${y0 + bh * 0.7}] /InkList [[${ink.join(' ')}]] /F 4 /Measure ${base + 6} 0 R >>`;
    bodies[base + 3] = `<< /Type /Annot /Subtype /Widget /FT /Tx /T (field${index}) /V (value ${index}) /Rect [${widget.join(' ')}] /F 4 /DA (/Helv 12 Tf 0 g) >>`;
    bodies[base + 4] = stream('', '/Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8');
    bodies[base + 5] = '<< /Type /Measure /Subtype /RL /R (1 in = 1 in) >>';
    fields.push(`${base + 3} 0 R`);
    const p = `${base} 0 R`;
    dests.push(
      `/p${index}-xyz [${p} /XYZ ${x0 + bw * 0.25} ${y0 + bh * 0.75} 0]`,
      `/p${index}-xyznull [${p} /XYZ null ${y0 + bh * 0.75} null]`,
      `/p${index}-fith [${p} /FitH ${y0 + bh * 0.4}]`,
      `/p${index}-fitv [${p} /FitV ${x0 + bw * 0.3}]`,
      `/p${index}-fitr [${p} /FitR ${x0 + bw * 0.1} ${y0 + bh * 0.1} ${x0 + bw * 0.4} ${y0 + bh * 0.3}]`,
      `/p${index}-fitbv [${p} /FitBV ${x0 + bw * 0.6}]`,
    );
  });
  bodies[0] = `<< /Type /Catalog /Pages 2 0 R /Dests 3 0 R /Outlines 4 0 R /AcroForm 5 0 R >>`;
  bodies[1] = `<< /Type /Pages /Count ${specs.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  bodies[2] = `<< ${dests.join(' ')} >>`;
  const items = specs.map((_, index) => itemFirst + index);
  bodies[3] = `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items.at(-1)} 0 R /Count ${items.length} >>`;
  bodies[4] = `<< /Fields [${fields.join(' ')}] /DA (/Helv 12 Tf 0 g) >>`;
  specs.forEach((spec, index) => {
    const [x0, y0, x1, y1] = spec.media as [number, number, number, number];
    const [bw, bh] = [x1 - x0, y1 - y0];
    const links = `${index > 0 ? ` /Prev ${items[index - 1]} 0 R` : ''}${index < items.length - 1 ? ` /Next ${items[index + 1]} 0 R` : ''}`;
    bodies[itemFirst + index - 1] = `<< /Title (Page ${index + 1}) /Parent 4 0 R${links} /Dest [${pageIds[index]} 0 R /FitR ${x0 + bw * 0.1} ${y0 + bh * 0.1} ${x0 + bw * 0.4} ${y0 + bh * 0.3}] >>`;
  });
  return pdf(bodies);
}

/** The hand-computed matrices and papers, for A4 (decimal arithmetic, apart from the engine). */
const handMade = [
  { name: 'Letter', spec: { media: [0, 0, 612, 792] }, k: 0.9726732026, tx: 0.0000000044, ty: 35.76641177, paper: [595.276, 841.89] },
  { name: 'Letter turned a quarter (/Rotate 90)', spec: { media: [0, 0, 612, 792], rotate: 90 }, k: 0.9726732026, tx: 0.0000000044, ty: 35.76641177, paper: [595.276, 841.89] },
  { name: '400 by 300 turned three quarters (/Rotate 270)', spec: { media: [0, 0, 400, 300], rotate: 270 }, k: 1.984253333, tx: 24.0943334, ty: 0.00000005, paper: [841.89, 595.276] },
  { name: 'Letter with its paper box offset', spec: { media: [100, 200, 712, 992] }, k: 0.9726732026, tx: -97.26732026, ty: -158.7682287, paper: [595.276, 841.89] },
  { name: 'Letter in /UserUnit 2', spec: { media: [0, 0, 306, 396], unit: 2 }, k: 1.945346405, tx: 0.000000035, ty: 35.76641181, paper: [595.276, 841.89] },
] as const;

/** The shown fit of a page shown w by h into A4 the same way round, and its centring, from the paper's sides alone. */
function fitInto(w: number, h: number) {
  const [TW, TH] = w > h + 1 ? [A4[1], A4[0]] : [A4[0], A4[1]];
  const f = Math.min(TW / w, TH / h);
  return { f, ox: (TW - f * w) / 2, oy: (TH - f * h) / 2, TW, TH };
}

describe('pages written by hand: turned, offset and in a user unit', { timeout: 120_000 }, () => {
  const bytes = markedFile(handMade.map((each) => each.spec));

  it('writes the hand-computed matrix, paper and clip, keeps /Rotate, and removes the page keys', async () => {
    const after = (await resize(bytes, 'a4')).output!;
    expect(await checked(after)).toBe(0);
    const [pages, streams] = [await pageDicts(after), await wraps(after)];
    handMade.forEach((each, index) => {
      const page = pages[index]!;
      const { prefix } = streams[index]!;
      expect(prefix, each.name).not.toBeNull();
      expect(prefix!.k, each.name).toBe(each.k);
      expect(Math.abs(prefix!.tx - each.tx), each.name).toBeLessThan(1e-8);
      expect(Math.abs(prefix!.ty - each.ty), each.name).toBeLessThan(1e-8);
      expect(prefix!.clip, each.name).toEqual([each.spec.media[0], each.spec.media[1], each.spec.media[2]! - each.spec.media[0]!, each.spec.media[3]! - each.spec.media[1]!]);
      expect(page['/MediaBox'], each.name).toEqual([0, 0, ...each.paper]);
      expect(page['/CropBox'], each.name).toEqual([0, 0, ...each.paper]);
      expect(page['/Rotate'], each.name).toBe('rotate' in each.spec ? each.spec.rotate : undefined);
      for (const key of ['/UserUnit', '/BleedBox', '/TrimBox', '/ArtBox', '/Thumb', '/VP']) expect(page[key], `${each.name} ${key}`).toBeUndefined();
    });
  });

  it('moves every annotation key and destination by the page\'s matrix, removes /Measure, and keeps zoom and null', async () => {
    const after = (await resize(bytes, 'a4')).output!;
    const [before, now] = [await dictionaries(bytes), await dictionaries(after)];
    const destsBefore = before.value((before.value(before.trailer['/Root']) as Json)['/Dests']) as Json;
    const destsAfter = now.value((now.value(now.trailer['/Root']) as Json)['/Dests']) as Json;
    handMade.forEach((each, index) => {
      const m = { k: each.k, tx: each.tx, ty: each.ty };
      const annotsOf = (file: typeof before, page: { object: string }) => ((file.value(page.object) as Json)['/Annots'] as string[]).map((ref) => file.value(ref) as Json);
      const [oldA, newA] = [annotsOf(before, before.pages[index]!), annotsOf(now, now.pages[index]!)];
      near(newA[0]!['/Rect'], through(m, oldA[0]!['/Rect'] as number[]), 2e-6, `${each.name} link`);
      near(newA[0]!['/QuadPoints'], through(m, oldA[0]!['/QuadPoints'] as number[]), 2e-6, `${each.name} quad`);
      const dest = newA[0]!['/Dest'] as unknown[];
      const oldDest = oldA[0]!['/Dest'] as number[];
      near(dest.slice(2, 4), through(m, oldDest.slice(2, 4) as number[]), 2e-6, `${each.name} link dest`);
      expect(dest[4]).toBe(2);
      near((newA[1]!['/InkList'] as number[][])[0], through(m, (oldA[1]!['/InkList'] as number[][])[0]!), 2e-6, `${each.name} ink`);
      expect(newA[1]!['/Measure']).toBeUndefined();
      expect(newA[1]!['/F']).toBe(4);
      near(newA[2]!['/Rect'], through(m, oldA[2]!['/Rect'] as number[]), 2e-6, `${each.name} widget`);
      expect(newA[2]!['/V']).toBe('u:value ' + index);
      const old = (key: string) => destsBefore[`/p${index}-${key}`] as unknown[];
      const fresh = (key: string) => destsAfter[`/p${index}-${key}`] as unknown[];
      near(fresh('xyz').slice(2, 4), through(m, old('xyz').slice(2, 4) as number[]), 2e-6, `${each.name} XYZ`);
      expect(fresh('xyz')[4]).toBe(0);
      expect(fresh('xyznull')[2]).toBeNull();
      expect(fresh('xyznull')[4]).toBeNull();
      expect(Math.abs((fresh('xyznull')[3] as number) - r6(m.k * (old('xyznull')[3] as number) + m.ty))).toBeLessThan(2e-6);
      expect(Math.abs((fresh('fith')[2] as number) - r6(m.k * (old('fith')[2] as number) + m.ty))).toBeLessThan(2e-6);
      expect(Math.abs((fresh('fitv')[2] as number) - r6(m.k * (old('fitv')[2] as number) + m.tx))).toBeLessThan(2e-6);
      expect(Math.abs((fresh('fitbv')[2] as number) - r6(m.k * (old('fitbv')[2] as number) + m.tx))).toBeLessThan(2e-6);
      near(fresh('fitr').slice(2), through(m, old('fitr').slice(2) as number[]), 2e-6, `${each.name} FitR`);
    });
    // The outline's /FitR places, through each page's matrix.
    let item = now.value((now.value((now.value(now.trailer['/Root']) as Json)['/Outlines']) as Json)['/First']) as Json | undefined;
    let oldItem = before.value((before.value((before.value(before.trailer['/Root']) as Json)['/Outlines']) as Json)['/First']) as Json | undefined;
    for (const each of handMade) {
      near((item!['/Dest'] as number[]).slice(2), through(each, (oldItem!['/Dest'] as number[]).slice(2)), 2e-6, `${each.name} outline`);
      item = now.value(item!['/Next']) as Json | undefined;
      oldItem = before.value(oldItem!['/Next']) as Json | undefined;
    }
  });

  it('each annotation shows, by PDF.js\'s viewports, at f times its place before plus the centring', async () => {
    const after = (await resize(bytes, 'a4')).output!;
    const [was, now] = [await shown(bytes), await shown(after)];
    was.forEach((page, index) => {
      const { f, ox, oy, TW, TH } = fitInto(page.viewport.width, page.viewport.height);
      const next = now[index]!;
      expect(Math.abs(next.viewport.width - TW), handMade[index]!.name).toBeLessThan(0.001);
      expect(Math.abs(next.viewport.height - TH), handMade[index]!.name).toBeLessThan(0.001);
      expect(next.rotate).toBe(page.rotate);
      page.annotations.forEach((annotation, which) => {
        const moved = next.annotations[which]!;
        for (const [x, y] of [[annotation.rect[0]!, annotation.rect[1]!], [annotation.rect[2]!, annotation.rect[3]!]] as const) {
          const [sx, sy] = page.viewport.convertToViewportPoint(x, y) as [number, number];
          const at = [moved.rect[0]!, moved.rect[1]!, moved.rect[2]!, moved.rect[3]!];
          const corners = [[at[0], at[1]], [at[2], at[3]], [at[0], at[3]], [at[2], at[1]]].map(([cx, cy]) => next.viewport.convertToViewportPoint(cx!, cy!) as [number, number]);
          const want = [f * sx + ox, f * sy + oy];
          const best = Math.min(...corners.map(([cx, cy]) => Math.hypot(cx - want[0]!, cy - want[1]!)));
          expect(best, `${handMade[index]!.name}, annotation ${which}`).toBeLessThan(0.001);
        }
      });
    });
  });

  it('draws each page as the original, scaled and centred, with nothing in the white bands', async () => {
    const after = (await resize(bytes, 'a4')).output!;
    const was = await shown(bytes);
    for (let index = 0; index < handMade.length; index++) {
      const { f, ox, oy } = fitInto(was[index]!.viewport.width, was[index]!.viewport.height);
      const scale = 0.5;
      const [before, now] = [await picture(bytes, index + 1, f * scale), await picture(after, index + 1, scale)];
      const old = inkBox(before)!;
      const fresh = inkBox(now)!;
      const want = [old[0] + ox * scale, old[1] + oy * scale, old[2] + ox * scale, old[3] + oy * scale];
      near(fresh, want, 2, handMade[index]!.name);
      // Nothing outside the scaled page: the bands at the edges are white.
      const inside = (x: number, y: number) => x >= ox * scale - 1 && x <= now.width - ox * scale + 1 && y >= oy * scale - 1 && y <= now.height - oy * scale + 1;
      expect(inkBox(now, (x, y) => !inside(x, y)), handMade[index]!.name).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// What was hidden.

/**
 * A Letter page whose crop box [100 100 512 692], inherited from the page tree, hides two red squares; a black
 * square inside; a red-drawn square note wholly outside the crop box (/F 4); a link half outside it; and a note whose
 * popup starts at the old paper's right edge.
 */
function hiddenFile(): Uint8Array {
  const red = stream('1 0 0 rg 0 0 60 60 re f', '/Type /XObject /Subtype /Form /BBox [0 0 60 60]');
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] /CropBox [100 100 512 692] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R /Annots [5 0 R 7 0 R 8 0 R 9 0 R] >>',
    stream('0 0 0 rg 150 150 300 450 re f 1 0 0 rg 10 10 80 80 re f 520 700 80 80 re f'),
    '<< /Type /Annot /Subtype /Square /Rect [20 20 80 80] /F 4 /C [1 0 0] /AP << /N 6 0 R >> >>',
    red,
    '<< /Type /Annot /Subtype /Link /Rect [450 600 550 650] /Border [0 0 0] /A << /S /URI /URI (https://example.invalid/) >> >>',
    '<< /Type /Annot /Subtype /Text /Rect [200 650 220 670] /Contents (A note) /Popup 9 0 R >>',
    '<< /Type /Annot /Subtype /Popup /Rect [612 600 812 700] /Parent 8 0 R >>',
  ]);
}

describe('what was hidden', { timeout: 120_000 }, () => {
  // The old shown box is the inherited crop box, 412 by 592: k = 1.422111486, tx = -137.5281147, ty = -142.2111485 on A4 (hand-computed).
  const m = { k: 1.422111486, tx: -137.5281147, ty: -142.2111485 };

  it('draws only what the old crop box showed, scaled and centred, and nothing it hid', async () => {
    const after = (await resize(hiddenFile(), 'a4')).output!;
    const page = (await pageDicts(after))[0]!;
    expect(page['/CropBox']).toEqual([0, 0, 595.276, 841.89]);
    const image = await picture(after, 1, 0.5);
    expect(redPixels(image)).toBe(0);
    // The black square, 150..450 by 150..600, at k times it plus the move, in half points from the top.
    const box = inkBox(image)!;
    near(box, [(m.k * 150 + m.tx) / 2, (841.89 - (m.k * 600 + m.ty)) / 2, (m.k * 450 + m.tx) / 2, (841.89 - (m.k * 150 + m.ty)) / 2], 1.5);
  });

  it("hides a hidden note's popup with it, its other flags kept, so an open popup cannot show the note's text", async () => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] /CropBox [100 100 512 692] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R /Annots [5 0 R 6 0 R] >>',
      stream('0 0 0 rg 150 150 300 450 re f'),
      '<< /Type /Annot /Subtype /Text /Rect [20 720 40 740] /F 4 /Contents (SECRET-note) /Popup 6 0 R >>',
      '<< /Type /Annot /Subtype /Popup /Rect [40 700 240 780] /F 4 /Open true /Parent 5 0 R >>',
    ]);
    const after = (await resize(bytes, 'a4')).output!;
    const { pages, value } = await dictionaries(after);
    const [note, popup] = ((value(pages[0]!.object) as Json)['/Annots'] as string[]).map((ref) => value(ref) as Json);
    expect(note!['/F']).toBe(6);
    expect(popup!['/F']).toBe(6);
    expect(popup!['/Open']).toBe(true);
    near(popup!['/Rect'], through(m, [40, 700, 240, 780]), 2e-6);
    const read = (await shown(after))[0]!.annotations;
    for (const each of read) expect(each.annotationFlags & 2, each.subtype).toBe(2);
    expect(redPixels(await picture(after, 1, 0.5))).toBe(0);
  });

  it('hides a note wholly outside, keeping its other flags; leaves a link half outside visible; moves a popup without hiding it', async () => {
    const after = (await resize(hiddenFile(), 'a4')).output!;
    const { pages, value } = await dictionaries(after);
    const annots = ((value(pages[0]!.object) as Json)['/Annots'] as string[]).map((ref) => value(ref) as Json);
    expect(annots[0]!['/F']).toBe(6);
    near(annots[0]!['/Rect'], through(m, [20, 20, 80, 80]), 2e-6);
    expect(annots[1]!['/F']).toBeUndefined();
    near(annots[1]!['/Rect'], through(m, [450, 600, 550, 650]), 2e-6);
    expect(annots[2]!['/F']).toBeUndefined();
    expect(annots[3]!['/F']).toBeUndefined();
    near(annots[3]!['/Rect'], through(m, [612, 600, 812, 700]), 2e-6);
    // PDF.js still opens the popup from its note.
    const read = (await shown(after))[0]!.annotations;
    const note = read.find((each) => each.subtype === 'Text')!;
    const popup = read.find((each) => each.subtype === 'Popup')!;
    expect(popup).toBeDefined();
    expect(note.popupRef).toBe(popup.id);
    expect(popup.annotationFlags & 2).toBe(0);
    expect(read.find((each) => each.subtype === 'Square')!.annotationFlags).toBe(6);
  });

  it('a page with an extra restore, recorded: PDF.js draws what follows it at its old size, unclipped (a known outcome, not a promise)', async () => {
    // Letter, crop box [0 0 612 700]. Its content draws a black square, restores once more than it saves, then draws
    // SECRET-hidden and a red bar above y = 700, where the old crop box hid them.
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [0 0 612 700] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      stream('0 0 0 rg 100 100 200 200 re f Q BT /F1 20 Tf 100 750 Td (SECRET-hidden) Tj ET 1 0 0 rg 100 720 300 20 re f'),
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]);
    const { output } = await resize(bytes, 'a4');
    expect(await checked(output!)).toBe(0);
    const image = await picture(output!, 1, 1);
    // Recorded on 24 Nov 2026 (tests/fixtures/README.md): PDF.js pops the prefix's save at the extra Q, so the red bar
    // is drawn at its old place, x 100..400 and y 720..740 in points on the new page, unscaled and unclipped.
    expect(redPixels(image)).toBeGreaterThan(0);
    near(redBox(image), [100, 841.89 - 740, 400, 841.89 - 720].map(Math.round), 2);
    expect((await texts(output!))[0]).toContain('SECRET-hidden');
  });
});

// ---------------------------------------------------------------------------
// Rounding and crafted numbers.

describe('rounding and crafted numbers', { timeout: 120_000 }, () => {
  const onePage = (page: string, content = '0 0 0 rg 0 0 1 1 re f') => pdf(['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>', page, stream(content)]);

  it('a /UserUnit 0.001 page with a box of 10^10 units stops the job as unsafe, writing nothing', async () => {
    const bytes = onePage('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10000000000 10000000000] /UserUnit 0.001 /Resources << >> /Contents 4 0 R >>');
    const error = await resize(bytes, 'a4').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('UnsafePage');
    expect(failureKind(error)).toBe('unsafe-page');
    expect((error as Error).message).toBe('A page could not be placed safely.');
  });

  it('a /UserUnit 10^6 page with a crop box of 10^-6 units is resized, and nothing outside the old crop box is drawn', async () => {
    const bytes = onePage(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /CropBox [0.5 0.5 0.500001 0.500001] /UserUnit 1000000 /Resources << >> /Contents 4 0 R >>',
      '0 0 0 rg 0.5 0.5 0.000001 0.000001 re f 1 0 0 rg 0 0 0.45 1 re f 0.6 0 0.4 1 re f',
    );
    const { output } = await resize(bytes, 'a4');
    expect(await checked(output!)).toBe(0);
    const [prefix] = (await wraps(output!)).map((each) => each.prefix!);
    // Hand-computed: k = 595.276 / 0.000001, tx = -k · 0.5, ty = (841.89 - 595.276) / 2 - k · 0.5.
    expect(prefix!.k).toBe(595276000);
    expect(prefix!.tx).toBe(-297638000);
    expect(Math.abs(prefix!.ty - -297637876.7)).toBeLessThan(0.051);
    expect(prefix!.clip).toEqual([0.5, 0.5, 0.000001, 0.000001]);
    expect(redPixels(await picture(output!, 1, 0.25))).toBe(0);
  });

  it('a box just under 10^9 is resized, every number in fixed form; at 10^9 the job stops', async () => {
    const under = onePage('<< /Type /Page /Parent 2 0 R /MediaBox [999999000 0 999999612 792] /Resources << >> /Contents 4 0 R >>');
    const { output } = await resize(under, 'a4');
    const [streams] = await pageStreams(output!);
    expect(streams![0]).not.toMatch(/\d[eE][+-]?\d/);
    const prefix = prefixOf(streams![0]!);
    // Hand-computed: tx = -k · 999999000, written with 10 significant digits.
    expect(prefix.tx).toBe(-972672229.9);
    expect(prefix.clip).toEqual([999999000, 0, 612, 792]);
    const at = onePage('<< /Type /Page /Parent 2 0 R /MediaBox [1000000000 0 1000000612 792] /Resources << >> /Contents 4 0 R >>');
    await expect(resize(at, 'a4')).rejects.toMatchObject({ name: 'UnsafePage' });
  });

  it('at a large k (a 10 by 14 page on A4, k = 59.5276), content, annotations and destinations agree to 0.001 point', async () => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /XYZ 2 7 0] >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 14] /Resources << >> /Contents 4 0 R /Annots [5 0 R] >>',
      stream('0 0 0 rg 2 3 3 4 re f'),
      '<< /Type /Annot /Subtype /Link /Rect [2 3 5 7] /Border [0 0 0] /Dest [3 0 R /FitR 2 3 5 7] >>',
    ]);
    const after = (await resize(bytes, 'a4')).output!;
    const prefix = (await wraps(after))[0]!.prefix!;
    expect(prefix.k).toBe(59.5276);
    expect(prefix.ty).toBe(4.2518);
    const { pages, value, trailer } = await dictionaries(after);
    const link = value(((value(pages[0]!.object) as Json)['/Annots'] as string[])[0]) as Json;
    const content = [2, 3, 5, 7].map((v, index) => prefix.k * v + (index % 2 === 0 ? prefix.tx : prefix.ty));
    near(link['/Rect'], content, 0.001);
    near((link['/Dest'] as number[]).slice(2), content, 0.001);
    near(((value(trailer['/Root']) as Json)['/OpenAction'] as number[]).slice(2, 4), [content[0]!, content[3]!], 0.001);
  });
});

// ---------------------------------------------------------------------------
// One working copy per object.

describe('one working copy per object', { timeout: 120_000 }, () => {
  // Letter page 3 and A5 page 4, resized to A4. Hand-computed: Letter k = 0.9726732026, tx = 0.0000000044,
  // ty = 35.76641177; A5 k = 1.414941176, tx = 0.50035304, ty = 0.00000014.
  const letter = { k: 0.9726732026, tx: 0.0000000044, ty: 35.76641177 };
  const a5 = { k: 1.414941176, tx: 0.50035304, ty: 0.00000014 };
  const bytes = pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R /Annots [<< /Type /Annot /Subtype /Link /Rect [100 100 200 120] /Border [0 0 0] /Dest [4 0 R /XYZ 50 500 0] >> 6 0 R 7 0 R 8 0 R 9 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << >> /Contents 5 0 R /Annots [9 0 R] >>',
    stream('0 0 0 rg 10 10 50 50 re f'),
    '<< /Type /Annot /Subtype /Link /Rect [300 300 400 320] /Border [0 0 0] /Dest [4 0 R /FitR 10 10 100 100] >>',
    '<< /Type /Annot /Subtype /Text /Rect [400 400 420 420] /Popup 8 0 R >>',
    '<< /Type /Annot /Subtype /Popup /Rect [400 300 500 400] /Parent 7 0 R >>',
    '<< /Type /Annot /Subtype /Square /Rect [10 10 20 20] >>',
  ]);

  it("moves a link's /Rect by its page's matrix and its /Dest by the target page's, in the one written link, direct or indirect", async () => {
    const after = (await resize(bytes, 'a4')).output!;
    const { pages, value } = await dictionaries(after);
    const annots = ((value(pages[0]!.object) as Json)['/Annots'] as unknown[]).map((item) => value(item) as Json);
    near(annots[0]!['/Rect'], through(letter, [100, 100, 200, 120]), 2e-6, 'direct link rect');
    near((annots[0]!['/Dest'] as number[]).slice(2, 4), through(a5, [50, 500]), 2e-6, 'direct link dest');
    near(annots[1]!['/Rect'], through(letter, [300, 300, 400, 320]), 2e-6, 'indirect link rect');
    near((annots[1]!['/Dest'] as number[]).slice(2), through(a5, [10, 10, 100, 100]), 2e-6, 'indirect link dest');
  });

  it('moves a popup listed in /Annots and named by its parent once, and an annotation shared by two pages once, by the first page', async () => {
    const after = (await resize(bytes, 'a4')).output!;
    const { pages, value } = await dictionaries(after);
    const annots = ((value(pages[0]!.object) as Json)['/Annots'] as unknown[]).map((item) => value(item) as Json);
    near(annots[3]!['/Rect'], through(letter, [400, 300, 500, 400]), 2e-6, 'popup');
    near(annots[4]!['/Rect'], through(letter, [10, 10, 20, 20]), 2e-6, 'shared');
    const second = ((value(pages[1]!.object) as Json)['/Annots'] as unknown[]).map((item) => value(item) as Json);
    near(second[0]!['/Rect'], through(letter, [10, 10, 20, 20]), 2e-6, 'shared, from the second page');
  });

  it('a page object listed twice in the page tree is wrapped once in each listing qpdf reads', async () => {
    const twice = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 2 /Kids [3 0 R 3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
      stream('0 0 0 rg 10 10 50 50 re f'),
    ]);
    const after = (await resize(twice, 'a4')).output!;
    expect(await checked(after)).toBe(0);
    const streams = await pageStreams(after);
    expect(streams).toHaveLength(2);
    for (const page of streams) {
      expect(page.filter((text) => text.startsWith('q\n')).length).toBe(1);
      expect(page.filter((text) => text === '\nQ\n').length).toBe(1);
      expect(page.slice(1, -1)).toEqual(['0 0 0 rg 10 10 50 50 re f']);
    }
  });
});

// ---------------------------------------------------------------------------
// The edges of the rules.

describe('the edges of the rules', { timeout: 120_000 }, () => {
  it('1.0 point off is left and 1.01 resized; w = h + 1 is upright and h + 1.01 on its side; A4 stored on its side with /Rotate 90 is left; a user unit is resized', async () => {
    const pages = [
      '/MediaBox [0 0 596.276 841.89]',
      '/MediaBox [0 0 596.286 841.89]',
      '/MediaBox [0 0 501 500]',
      '/MediaBox [0 0 501.01 500]',
      '/MediaBox [0 0 841.89 595.276] /Rotate 90',
      '/MediaBox [0 0 595.276 841.89] /UserUnit 1.0001',
    ];
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index} 0 R`).join(' ')}] >>`,
      stream('0 0 0 rg 10 10 50 50 re f'),
      ...pages.map((keys) => `<< /Type /Page /Parent 2 0 R ${keys} /Resources << >> /Contents 3 0 R >>`),
    ]);
    const after = (await resize(bytes, 'a4')).output!;
    const [was, now] = [await pageDicts(bytes), await pageDicts(after)];
    const wrapped = (await wraps(after)).map((each) => each.prefix !== null);
    expect(wrapped).toEqual([false, true, true, true, false, true]);
    expect(keyless(now[0]!, ['/Parent'])).toEqual(keyless(was[0]!, ['/Parent']));
    expect(keyless(now[4]!, ['/Parent'])).toEqual(keyless(was[4]!, ['/Parent']));
    expect(now[1]!['/MediaBox']).toEqual([0, 0, 595.276, 841.89]);
    expect(now[2]!['/MediaBox']).toEqual([0, 0, 595.276, 841.89]);
    expect(now[3]!['/MediaBox']).toEqual([0, 0, 841.89, 595.276]);
    expect(now[5]!['/MediaBox']).toEqual([0, 0, 595.276, 841.89]);
    expect(now[5]!['/UserUnit']).toBeUndefined();
  });

  it('a /MediaBox and /Rotate inherited from the page tree stay there; a page left as it is still inherits them', async () => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 2 /Kids [4 0 R 5 0 R] /MediaBox [0 0 595 842] /Rotate 90 >>',
      stream('0 0 0 rg 10 10 50 50 re f'),
      '<< /Type /Page /Parent 2 0 R /Resources << >> /Contents 3 0 R >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 3 0 R >>',
    ]);
    const after = (await resize(bytes, 'a4')).output!;
    const { pages, value } = await dictionaries(after);
    const [first, second] = pages.map((page) => value(page.object) as Json);
    const tree = value(first!['/Parent']) as Json;
    expect(tree['/MediaBox']).toEqual([0, 0, 595, 842]);
    expect(tree['/Rotate']).toBe(90);
    expect(first!['/MediaBox']).toBeUndefined();
    expect(first!['/Rotate']).toBeUndefined();
    // Letter turned a quarter by the tree: shown on its side, so A4 on its side, the paper box stored unturned.
    expect(second!['/MediaBox']).toEqual([0, 0, 595.276, 841.89]);
    expect(second!['/Rotate']).toBeUndefined();
    const read = await shown(after);
    expect(read.map((page) => page.rotate)).toEqual([90, 90]);
    expect(Math.round(read[1]!.viewport.width * 1000) / 1000).toBe(841.89);
  });

  it('/Rotate -90 and /Rotate 45 are kept as stored and placed as PDF.js shows them', async () => {
    const bytes = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 2 /Kids [4 0 R 5 0 R] >>',
      stream('0 0 0 rg 10 10 50 50 re f'),
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Rotate -90 /Resources << >> /Contents 3 0 R >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Rotate 45 /Resources << >> /Contents 3 0 R >>',
    ]);
    const after = (await resize(bytes, 'a4')).output!;
    const pages = await pageDicts(after);
    expect(pages.map((page) => page['/Rotate'])).toEqual([-90, 45]);
    // -90 is a quarter turn left, so shown upright 300 by 400: A4 upright, stored unturned 841.89 by 595.276.
    expect(pages[0]!['/MediaBox']).toEqual([0, 0, 841.89, 595.276]);
    // 45 is no turn, as PDF.js reads it: shown 400 by 300 on its side, A4 on its side.
    expect(pages[1]!['/MediaBox']).toEqual([0, 0, 841.89, 595.276]);
    const prefixes = (await wraps(after)).map((each) => each.prefix!);
    // Hand-computed: both k = 1.984253333; -90: tx = 24.0943334, ty ≈ 0; 45: tx = 24.0943334, ty ≈ 0.
    for (const prefix of prefixes) {
      expect(prefix.k).toBe(1.984253333);
      expect(Math.abs(prefix.tx - 24.0943334)).toBeLessThan(1e-8);
      expect(Math.abs(prefix.ty)).toBeLessThan(1e-6);
    }
    const read = await shown(after);
    expect(read.map((page) => [Math.round(page.viewport.width * 1000) / 1000, Math.round(page.viewport.height * 1000) / 1000])).toEqual([
      [595.276, 841.89],
      [841.89, 595.276],
    ]);
  });

  it('a destination nested deeper than 32 levels is left; one shallower is moved; an own stream with no leading space still draws', async () => {
    let deep = '[3 0 R /XYZ 100 100 0]';
    for (let level = 0; level < 33; level++) deep = `[${deep}]`;
    const bytes = pdf([
      `<< /Type /Catalog /Pages 2 0 R /PDFkaroDeep ${deep} /PDFkaroShallow [[3 0 R /XYZ 100 100 0]] >>`,
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
      stream('0 g 10 10 50 50 re f'),
    ]);
    const after = (await resize(bytes, 'a4')).output!;
    const { value, trailer } = await dictionaries(after);
    const catalog = value(trailer['/Root']) as Json;
    let inner = catalog['/PDFkaroDeep'] as unknown[];
    for (let level = 0; level < 33; level++) inner = inner[0] as unknown[];
    expect(inner.slice(1)).toEqual(['/XYZ', 100, 100, 0]);
    expect(((catalog['/PDFkaroShallow'] as unknown[][])[0]!).slice(2, 4)).toEqual(through({ k: 0.9726732026, tx: 0.0000000044, ty: 35.76641177 }, [100, 100]));
    expect((await pageStreams(after))[0]![1]).toBe('0 g 10 10 50 50 re f');
    expect(inkBox(await picture(after, 1, 0.5))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Annotation keys and destinations.

describe('annotation keys', { timeout: 120_000 }, () => {
  const letter = { k: 0.9726732026, tx: 0.0000000044, ty: 35.76641177 };
  const bytes = pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R /Annots [6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 5 0 R /Annots [14 0 R] >>',
    stream('0 0 0 rg 10 10 50 50 re f'),
    '<< /Type /Annot /Subtype /Polygon /Rect [10 10 100 100] /Vertices [10 10 100 10 50 100] /Measure << /Type /Measure >> >>',
    '<< /Type /Annot /Subtype /Line /Rect [10 10 200 200] /L [20 20 180 180] /LL 10 /LLE 4 /LLO -3 >>',
    '<< /Type /Annot /Subtype /FreeText /Rect [100 100 300 200] /CL [50 50 80 80 100 150] /RD [1 2 3 4] /DA (/Helv 12 Tf) >>',
    '<< /Type /Annot /Subtype /Ink /Rect [10 10 100 100] /InkList [[10 10 20 20] [30 30 40]] /Path [[10 10] [20 20 30 30 40 40]] >>',
    '<< /Type /Annot /Subtype /Highlight /Rect [10 10 100 100] /QuadPoints [1 2 3 4 5 6 7] /Vertices [1 2 3] /L [1 2 3] /CL [1 2 3 4 5] /RD [1 -2 3 4] >>',
    '<< /Type /Annot /Subtype /Highlight /Rect [10 700 100 720] /QuadPoints 13 0 R >>',
    '<< /Type /Annot /Subtype /Ink /Rect [1 1 2 2] /Path [[1 2 3]] >>',
    '[10 720 100 720 10 700 100 700]',
    '<< /Type /Annot /Subtype /Highlight /Rect [10 700 100 720] /QuadPoints 13 0 R >>',
  ]);

  it('moves each kind by the matrix, scales lengths by k, leaves wrong counts, writes an indirect value direct, removes /Measure', async () => {
    const after = (await resize(bytes, 'a4')).output!;
    const { pages, value } = await dictionaries(after);
    const annots = ((value(pages[0]!.object) as Json)['/Annots'] as string[]).map((ref) => value(ref) as Json);
    const [polygon, line, free, ink, wrong, indirect, path] = annots as [Json, Json, Json, Json, Json, Json, Json];
    near(polygon['/Vertices'], through(letter, [10, 10, 100, 10, 50, 100]), 2e-6, 'vertices');
    expect(polygon['/Measure']).toBeUndefined();
    near(line['/L'], through(letter, [20, 20, 180, 180]), 2e-6, 'line');
    expect(line['/LL']).toBe(r6(10 * letter.k));
    expect(line['/LLE']).toBe(r6(4 * letter.k));
    expect(line['/LLO']).toBe(0);
    near(free['/CL'], through(letter, [50, 50, 80, 80, 100, 150]), 2e-6, 'callout');
    near(free['/RD'], [1, 2, 3, 4].map((n) => r6(n * letter.k)), 2e-6, 'differences');
    // One stroke of an odd count: the whole ink list is left; /Path of 2 and 6 numbers is moved.
    expect(ink['/InkList']).toEqual([[10, 10, 20, 20], [30, 30, 40]]);
    near((ink['/Path'] as number[][])[0], through(letter, [10, 10]), 2e-6, 'path 0');
    near((ink['/Path'] as number[][])[1], through(letter, [20, 20, 30, 30, 40, 40]), 2e-6, 'path 1');
    expect(wrong['/QuadPoints']).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(wrong['/Vertices']).toEqual([1, 2, 3]);
    expect(wrong['/L']).toEqual([1, 2, 3]);
    expect(wrong['/CL']).toEqual([1, 2, 3, 4, 5]);
    expect(wrong['/RD']).toEqual([1, -2, 3, 4]);
    near(wrong['/Rect'], through(letter, [10, 10, 100, 100]), 2e-6, 'rect still moved');
    near(indirect['/QuadPoints'], through(letter, [10, 720, 100, 720, 10, 700, 100, 700]), 2e-6, 'indirect, written direct');
    expect(path['/Path']).toEqual([[1, 2, 3]]);
    // The shared array, also named by an annotation on the A4 page left as it is, is unchanged.
    const other = value(((value(pages[1]!.object) as Json)['/Annots'] as string[])[0]) as Json;
    expect(value(other['/QuadPoints'])).toEqual([10, 720, 100, 720, 10, 700, 100, 700]);
  });
});

describe('destinations and beads', { timeout: 120_000 }, () => {
  const letter = { k: 0.9726732026, tx: 0.0000000044, ty: 35.76641177 };
  const bytes = pdf([
    '<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R /Dests << /named [3 0 R /FitH 500] >> /Names << /Dests << /Names [(tree) [3 0 R /FitBH 400]] >> >> /OpenAction << /S /GoTo /D [3 0 R /XYZ 10 20 1.5] /Next << /S /GoTo /D [3 0 R /FitB] >> >> /Threads [9 0 R] >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R /Annots [8 0 R] /B [10 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 5 0 R >>',
    stream('0 0 0 rg 10 10 50 50 re f'),
    '<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>',
    '<< /Title (One) /Parent 6 0 R /Dest [3 0 R /XYZ null 300 null] /A << /S /GoTo /D [4 0 R /XYZ 10 20 0] >> >>',
    '<< /Type /Annot /Subtype /Link /Rect [10 10 50 50] /Border [0 0 0] /A << /S /GoToR /F (other.pdf) /D [0 /XYZ 10 20 0] >> /Dest [3 0 R /Fit] >>',
    '<< /I << /Title (Thread) >> /F 10 0 R >>',
    '<< /T 9 0 R /N 10 0 R /V 10 0 R /P 3 0 R /R [100 100 300 400] >>',
  ]);

  it('moves every kind wherever it sits; leaves one to a page left as it is, and another file\'s page number; moves beads', async () => {
    const after = (await resize(bytes, 'a4')).output!;
    expect(await checked(after)).toBe(0);
    const { value, trailer, pages } = await dictionaries(after);
    const catalog = value(trailer['/Root']) as Json;
    const named = (value(catalog['/Dests']) as Json)['/named'] as unknown[];
    expect(named[2]).toBe(r6(500 * letter.k + letter.ty));
    const tree = ((value(catalog['/Names']) as Json)['/Dests'] as Json)['/Names'] as unknown[];
    expect((tree[1] as unknown[])[2]).toBe(r6(400 * letter.k + letter.ty));
    const open = value(catalog['/OpenAction']) as Json;
    expect((open['/D'] as unknown[]).slice(2)).toEqual([...through(letter, [10, 20]), 1.5]);
    expect((open['/Next'] as Json)['/D']).toEqual([pages[0]!.object, '/FitB']);
    const item = value((value(catalog['/Outlines']) as Json)['/First']) as Json;
    expect((item['/Dest'] as unknown[]).slice(1)).toEqual(['/XYZ', null, r6(300 * letter.k + letter.ty), null]);
    expect(((item['/A'] as Json)['/D'] as unknown[]).slice(1)).toEqual(['/XYZ', 10, 20, 0]);
    const link = value(((value(pages[0]!.object) as Json)['/Annots'] as string[])[0]) as Json;
    expect(((link['/A'] as Json)['/D'] as unknown[])).toEqual([0, '/XYZ', 10, 20, 0]);
    expect((link['/Dest'] as unknown[]).slice(1)).toEqual(['/Fit']);
    const bead = value(((value(pages[0]!.object) as Json)['/B'] as string[])[0]) as Json;
    near(bead['/R'], through(letter, [100, 100, 300, 400]), 2e-6, 'bead');
  });
});

// ---------------------------------------------------------------------------
// What a resized file keeps.

describe('what a resized file keeps', () => {
  async function kept(bytes: Uint8Array, given?: string) {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await lib.getDocument({ data: bytes.slice(), password: given, verbosity: 0 }).promise;
    const outline = await doc.getOutline();
    const attachments = await doc.getAttachments();
    const fields = await doc.getFieldObjects();
    await doc.loadingTask.destroy();
    const titles = (items: { title: string; items: unknown[] }[] | null): unknown => (items ?? []).map((item) => [item.title, titles(item.items as never)]);
    const values = Object.fromEntries(Object.entries((fields ?? {}) as Record<string, { value?: unknown }[]>).map(([key, list]) => [key, list.map((field) => field.value)]));
    return { outline: titles(outline as never), attachments: Object.keys(attachments ?? {}), values };
  }

  for (const name of ['rich.pdf', 'form.pdf', 'tagged.pdf']) {
    it(`${name} to Letter keeps its bookmarks, attachments, fields, values, tags and text, every annotation at f times its place plus the centring`, { timeout: 120_000 }, async () => {
      const bytes = fixture(name);
      const after = (await resize(bytes, 'letter')).output!;
      expect(await kept(after)).toEqual(await kept(bytes));
      expect(await texts(after)).toEqual(await texts(bytes));
      const structure = async (file: Uint8Array) => Object.values((await dictionaries(file)).objects).some((entry) => (entry.value as Json | undefined)?.['/Type'] === '/StructTreeRoot');
      expect(await structure(after)).toBe(await structure(bytes));
      const [was, now] = [await shown(bytes), await shown(after)];
      was.forEach((page, index) => {
        const [TW, TH] = page.viewport.width > page.viewport.height + 1 ? [792, 612] : [612, 792];
        const f = Math.min(TW / page.viewport.width, TH / page.viewport.height);
        const [ox, oy] = [(TW - f * page.viewport.width) / 2, (TH - f * page.viewport.height) / 2];
        page.annotations.forEach((annotation, which) => {
          const moved = now[index]!.annotations[which]!;
          const [ax, ay] = page.viewport.convertToViewportPoint(annotation.rect[0]!, annotation.rect[3]!) as [number, number];
          const [bx, by] = now[index]!.viewport.convertToViewportPoint(moved.rect[0]!, moved.rect[3]!) as [number, number];
          expect(Math.abs(bx - (f * ax + ox)), `${name} page ${index + 1} annotation ${which}`).toBeLessThan(0.001);
          expect(Math.abs(by - (f * ay + oy)), `${name} page ${index + 1} annotation ${which}`).toBeLessThan(0.001);
        });
      });
    });
  }

  it('multilingual.pdf: left as it is on A4; on Letter its text is as before and each page draws ink across its page, scaled', { timeout: 120_000 }, async () => {
    const bytes = fixture('multilingual.pdf');
    expect((await resize(bytes, 'a4')).outputs).toEqual([]);
    const after = (await resize(bytes, 'letter')).output!;
    expect(await texts(after)).toEqual(await texts(bytes));
    expect((await wraps(after)).map((each) => each.own)).toEqual(await pageStreams(bytes));
    const was = await shown(bytes);
    for (let index = 0; index < was.length; index++) {
      const f = Math.min(612 / was[index]!.viewport.width, 792 / was[index]!.viewport.height);
      const ox = (612 - f * was[index]!.viewport.width) / 2;
      const oy = (792 - f * was[index]!.viewport.height) / 2;
      const [before, now] = [await picture(bytes, index + 1, f * 0.5), await picture(after, index + 1, 0.5)];
      near(inkBox(now), inkBox(before)!.map((value, at) => value + (at % 2 === 0 ? ox : oy) * 0.5), 2, `page ${index + 1}`);
    }
    // Page 5 holds one line of each script: each line's band shows ink after, scaled and moved, as before.
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await lib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    const page = await doc.getPage(5);
    const items = (await page.getTextContent()).items.filter((item) => 'str' in item && item.str.trim() !== '') as { str: string; transform: number[]; height: number }[];
    const height = page.view[3]! - page.view[1]!;
    const bands = items.map((item) => [height - item.transform[5]! - item.height, height - item.transform[5]! + item.height * 0.3] as const);
    await doc.loadingTask.destroy();
    expect(bands.length).toBeGreaterThanOrEqual(5);
    const f = Math.min(612 / was[4]!.viewport.width, 792 / was[4]!.viewport.height);
    const oy = (792 - f * was[4]!.viewport.height) / 2;
    const [before, now] = [await picture(bytes, 5, 1), await picture(after, 5, 1)];
    const dark = (image: typeof now, top: number, bottom: number) => {
      let n = 0;
      for (let y = Math.max(0, Math.floor(top)); y < Math.min(image.height, Math.ceil(bottom)); y++) {
        for (let x = 0; x < image.width; x++) {
          const k = (y * image.width + x) * 4;
          if (image.data[k]! + image.data[k + 1]! + image.data[k + 2]! < 384) n++;
        }
      }
      return n;
    };
    for (const [top, bottom] of bands) {
      const was5 = dark(before, top, bottom);
      expect(was5).toBeGreaterThan(0);
      // Ink scales with the area: f² of it, give or take the edges of the glyphs.
      expect(dark(now, oy + f * top, oy + f * bottom)).toBeGreaterThan(was5 * f * f * 0.6);
    }
  });

  it('an all-A4 file with A4 chosen gives no file', { timeout: 60_000 }, async () => {
    expect((await resize(fixture('text.pdf'), 'a4')).outputs).toEqual([]);
  });

  it('refuses an unknown or missing paper size before reading the file', async () => {
    let asked = 0;
    const counting = { qpdf: async () => (asked++, tools.qpdf!()) };
    for (const paper of [undefined, 'a3', 'A4', 'Letter', '__proto__', 'toString', 4, ['a4'], null]) {
      await expect(run([fixture('text.pdf')], { paper }, () => {}, counting), String(paper)).rejects.toThrow('The paper size is not valid.');
    }
    expect(asked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Progress, the cap, and what errors hold.

describe('progress, the cap and errors', { timeout: 120_000 }, () => {
  it('counts every page, those left as they are included: mixed.pdf to A4 counts "Page 1 of 4" to "Page 4 of 4"', async () => {
    const { progress } = await resize(fixture('mixed.pdf'), 'a4');
    expect(progress.filter((step) => step.stage === 'working')).toEqual([1, 2, 3, 4].map((done) => ({ stage: 'working', unit: 'page', done, total: 4, writesAfter: true })));
  });

  /** A Letter page with `annotations` and one indirect array of `numbers` numbers, object 5, that they name. */
  function sharedValue(numbers: number, annotations: (index: number) => string, count: number): Uint8Array {
    const values = Array.from({ length: numbers }, (_, index) => index % 600).join(' ');
    const annots = Array.from({ length: count }, (_, index) => `${6 + index} 0 R`).join(' ');
    return pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R /Annots [${annots}] >>`,
      stream('0 0 0 rg 10 10 50 50 re f'),
      `[${values}]`,
      ...Array.from({ length: count }, (_, index) => annotations(index)),
    ]);
  }

  /** Runs a job expected to stop at the budget; gives its time and how much the heap and peak memory grew. */
  async function stopped(bytes: Uint8Array) {
    const [heap, peak, started] = [process.memoryUsage().heapUsed, process.resourceUsage().maxRSS, Date.now()];
    // The page is Letter, so A4 resizes it.
    const error = await resize(bytes, 'a4').catch((caught: unknown) => caught);
    const seconds = (Date.now() - started) / 1000;
    const heapGrowth = (process.memoryUsage().heapUsed - heap) / 1024 ** 2;
    const peakGrowth = (process.resourceUsage().maxRSS - peak) / 1024;
    return { error, seconds, heapGrowth, peakGrowth };
  }

  it('one indirect array of 40,000 numbers named by 2,000 annotations stops with OutputLimit quickly, before memory fills', async () => {
    const bytes = sharedValue(40_000, (index) => `<< /Type /Annot /Subtype /Highlight /Rect [10 ${index % 700} 100 ${(index % 700) + 10}] /QuadPoints 5 0 R >>`, 2_000);
    const { error, seconds, heapGrowth } = await stopped(bytes);
    expect(error).toBeInstanceOf(OutputLimit);
    expect(failureKind(error)).toBe('output-limit');
    expect(seconds).toBeLessThan(20);
    expect(heapGrowth).toBeLessThan(400);
  });

  it('one stroke of 400,000 numbers named 200,000 times in one /InkList stops with OutputLimit quickly: each stroke is counted before its numbers are read', async () => {
    const strokes = Array.from({ length: 200_000 }, () => '5 0 R').join(' ');
    const bytes = sharedValue(400_000, () => `<< /Type /Annot /Subtype /Ink /Rect [10 10 600 700] /InkList [${strokes}] >>`, 1);
    const { error, seconds, heapGrowth } = await stopped(bytes);
    expect(error).toBeInstanceOf(OutputLimit);
    expect(seconds).toBeLessThan(20);
    expect(heapGrowth).toBeLessThan(400);
  });

  it('one array of the wrong length (400,001 numbers) named as /QuadPoints by 20,000 annotations stops with OutputLimit: it is counted each time it is named, though never moved', async () => {
    const bytes = sharedValue(400_001, (index) => `<< /Type /Annot /Subtype /Highlight /Rect [10 ${index % 700} 100 ${(index % 700) + 10}] /QuadPoints 5 0 R >>`, 20_000);
    const { error, seconds, heapGrowth } = await stopped(bytes);
    expect(error).toBeInstanceOf(OutputLimit);
    expect(seconds).toBeLessThan(20);
    expect(heapGrowth).toBeLessThan(400);
  });

  it('one stroke of 40,000 numbers repeated 2,000 times in one /InkList stops with OutputLimit quickly, before memory fills', async () => {
    const strokes = Array.from({ length: 2_000 }, () => '5 0 R').join(' ');
    const bytes = sharedValue(40_000, () => `<< /Type /Annot /Subtype /Ink /Rect [10 10 600 700] /InkList [${strokes}] >>`, 1);
    const { error, seconds, heapGrowth } = await stopped(bytes);
    expect(error).toBeInstanceOf(OutputLimit);
    expect(failureKind(error)).toBe('output-limit');
    expect(seconds).toBeLessThan(20);
    expect(heapGrowth).toBeLessThan(400);
  });

  it('reports "Reading the file", then each page counted with writesAfter, then writing that never goes back, ending at 100', async () => {
    const { progress } = await resize(fixture('text.pdf'), 'letter');
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    const pages = progress.filter((step) => step.stage === 'working');
    expect(pages).toEqual([1, 2, 3].map((done) => ({ stage: 'working', unit: 'page', done, total: 3, writesAfter: true })));
    const writing = progress.filter((step) => step.stage === 'writing').map((step) => (step as { percent: number }).percent);
    expect(writing.at(-1)).toBe(100);
    for (let at = 1; at < writing.length; at++) expect(writing[at]!).toBeGreaterThanOrEqual(writing[at - 1]!);
    expect(writing.slice(0, -1).every((percent) => percent >= 75 && percent <= 95)).toBe(true);
    expect(progress.findIndex((step) => step.stage === 'writing')).toBeGreaterThan(progress.findLastIndex((step) => step.stage === 'working'));
  });

  it('stops with OutputLimit when the update passes a small budget', async () => {
    const engine = makeRun({ sizeLimit: () => 200 });
    const error = await resize(fixture('text.pdf'), 'letter', undefined, engine).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OutputLimit);
    expect(failureKind(error)).toBe('output-limit');
  });

  it('no error holds page text, a field value, a bookmark title or the password', async () => {
    const messages: string[] = [];
    for (const attempt of [
      () => resize(fixture('password.pdf'), 'letter', 'wrong-secret-qz7'),
      () => resize(fixture('password.pdf'), 'letter'),
      () => resize(fixture('compress-json-bomb.pdf'), 'letter'),
      () => resize(fixture('damaged-xref.pdf'), 'letter'),
      () => resize(fixture('form.pdf'), 'letter', undefined, makeRun({ sizeLimit: () => 10 })),
    ]) {
      const error = await attempt().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      messages.push(`${(error as Error).message} ${(error as Error).stack ?? ''}`.split('\n')[0]!);
    }
    for (const message of messages) {
      for (const secret of ['wrong-secret-qz7', password, 'Sample text', 'Chapter', 'SECRET', 'note.txt']) expect(message).not.toContain(secret);
    }
  });
});
