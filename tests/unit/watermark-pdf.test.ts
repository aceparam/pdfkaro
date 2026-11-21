// The Watermark engine: where the text goes, the text refused before any work,
// characters that mean something in PDF syntax, and real runs on every file in
// the shared test set with the same qpdf and pdf-lib the browser gets, each
// result read back by qpdf and drawn by PDF.js.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as PdfLib from '@cantoo/pdf-lib';
import { PDFDocument, PDFName, PDFOperator, StandardFonts } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { descent, fullHeight, run, watermarkPlace } from '../../src/engines/tools/watermark-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { failureKind } from '../../src/workers/worker-core';
import { fixture, jsonOf, makeQpdf, open, password, qpdfOn, storedPlaces, streamText, texts, tools } from './stamp-helpers';

const fifty = 'Confidential draft for review only - do not share.';

async function watermark(file: Uint8Array, text: unknown = 'Draft', passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const outputs = await run([file], { text, passwords }, (step) => progress.push(step), tools);
  return { output: outputs[0]!, outputs, progress };
}

/** Helvetica Bold's width at a size, as pdf-lib measures it. */
let widthOf: (text: string, size: number) => number;

/** The four corners of the text's box, turned 45 degrees about the start of its baseline. */
function corners(place: { x: number; y: number; size: number }, text: string): [number, number][] {
  const k = widthOf(text, place.size);
  const c = Math.SQRT1_2;
  return [
    [0, -descent * place.size],
    [k, -descent * place.size],
    [k, (fullHeight - descent) * place.size],
    [0, (fullHeight - descent) * place.size],
  ].map(([u, v]) => [place.x + c * u! - c * v!, place.y + c * u! + c * v!]);
}

describe('where the text goes', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  widthOf = (text, size) => font.widthOfTextAtSize(text, size);

  const sizes: [string, { width: number; height: number }][] = [
    ['A4', { width: 595.28, height: 841.89 }],
    ['A4 on its side', { width: 841.89, height: 595.28 }],
    ['Letter', { width: 612, height: 792 }],
    ['A6', { width: 297.64, height: 419.53 }],
    ['A0', { width: 2383.94, height: 3370.39 }],
    ['20 by 20 points', { width: 20, height: 20 }],
    ['a 10 by 2,000 point strip', { width: 10, height: 2000 }],
  ];

  it('"Draft" on A4 is about 119 points, a fifth of the width', () => {
    const { size } = watermarkPlace(sizes[0]![1], 'Draft', widthOf);
    expect(size).toBeCloseTo(595.28 / 5, 6);
    expect(Math.round(size)).toBe(119);
  });

  it('a text of 50 characters on A4 is smaller, so that it fits', () => {
    const { size } = watermarkPlace(sizes[0]![1], fifty, widthOf);
    expect([...fifty]).toHaveLength(50);
    expect(size).toBeLessThan(595.28 / 5);
    // It fills the square inside the margin: (D − 2m)·√2 / (k + c).
    expect(size).toBeCloseTo(((595.28 * 10) / 12) * Math.SQRT2 / (widthOf(fifty, 1) + fullHeight), 6);
  });

  it('on every page size, for "D", "Draft" and 50 characters: the turned box inside the margin, its middle on the centre, at most a fifth of the shorter side, at 45 degrees', () => {
    for (const [name, area] of sizes) {
      const D = Math.min(area.width, area.height);
      const m = D / 12;
      for (const text of ['D', 'Draft', fifty]) {
        const place = watermarkPlace(area, text, widthOf);
        const label = `${name}, ${text.length} characters`;
        expect(place.angle, label).toBe(45);
        expect(place.size, label).toBeLessThanOrEqual(D / 5 + 1e-9);
        const points = corners(place, text);
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        expect(Math.min(...xs), label).toBeGreaterThanOrEqual(m - 1e-6);
        expect(Math.min(...ys), label).toBeGreaterThanOrEqual(m - 1e-6);
        expect(Math.max(...xs), label).toBeLessThanOrEqual(area.width - m + 1e-6);
        expect(Math.max(...ys), label).toBeLessThanOrEqual(area.height - m + 1e-6);
        expect((Math.min(...xs) + Math.max(...xs)) / 2, label).toBeCloseTo(area.width / 2, 6);
        expect((Math.min(...ys) + Math.max(...ys)) / 2, label).toBeCloseTo(area.height / 2, 6);
      }
    }
  });
});

// ---------------------------------------------------------------------------

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('the text sent', { timeout: 60_000 }, () => {
  it('is refused before any work when the field would refuse it, with an error that does not hold it', async () => {
    let asked = 0;
    const watched: EngineTools = { ...tools, qpdf: async () => (asked++, tools.qpdf!()) };
    const bad: unknown[] = [undefined, '', '   ', 'x'.repeat(51), 'मसौदा', 'Łódź', 'Draft\tcopy', '\t', 3, null, ['Draft'], { text: 'Draft' }, 'a‮b'];
    for (const text of bad) {
      const error = await run([fixture('text.pdf')], { text }, () => {}, watched).then(
        () => null,
        (caught: unknown) => caught as Error,
      );
      expect(error, String(text)).toBeInstanceOf(Error);
      expect(error!.name).toBe('TextRefused');
      expect(failureKind(error)).toBe('text-refused');
      if (typeof text === 'string' && text.trim() !== '') expect(error!.message).not.toContain(text.trim());
      expect(error!.message).not.toMatch(/Draft|मसौदा|Łódź/);
    }
    // No text at all, and a text under a key that is not the tool's own.
    await expect(run([fixture('text.pdf')], {}, () => {}, watched)).rejects.toThrow('The text was refused.');
    await expect(run([fixture('text.pdf')], JSON.parse('{"__proto__": {"text": "Draft"}}') as object, () => {}, watched)).rejects.toThrow('The text was refused.');
    expect(asked).toBe(0);
  });

  it('a) Tj (b \\ % <x> [/y]: passes qpdf --check, PDF.js reads it back exactly, and the layer holds it only inside one hex string', async () => {
    const text = 'a) Tj (b \\ % <x> [/y]';
    const { output } = await watermark(fixture('text.pdf'), text);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    for (const page of await texts(output)) expect(page.at(-1)).toBe(text);
    const { objects } = await jsonOf(output);
    const forms = Object.entries(objects).filter(([, entry]) => entry.stream?.dict['/Subtype'] === '/Form');
    expect(forms).toHaveLength(3);
    const hex = Buffer.from(text, 'latin1').toString('hex').toUpperCase();
    for (const [id] of forms) {
      const data = streamText(objects, id.replace(/^obj:/, ''));
      // The one string in the layer is the hex string of the text; no literal string, so nothing can close one.
      expect(data).not.toContain('(');
      expect(data).not.toContain(')');
      // Strings in angle brackets, leaving out the artifact's << >> dictionary.
      const strings = [...data.replace(/<<|>>/g, ' ').matchAll(/<([^<>]*)>/g)].map((match) => match[1]);
      expect(strings).toEqual([hex]);
      expect(data).toContain(`<${hex}> Tj`);
      // Every line is an operator pdf-lib writes, or the dictionary of the artifact.
      for (const line of data.split('\n').filter(Boolean)) {
        expect(line, line).toMatch(/^(\/Artifact <<|\/Type \/Pagination|\/Subtype \/Watermark|>> BDC|q|Q|BT|ET|EMC|T\*|\/GS-\d+ gs|0\.5 0\.5 0\.5 rg|\/Helvetica-Bold-\d+ [\d.]+ Tf|[\d.]+ TL|[-\d. ]+ Tm|<[0-9A-F]+> Tj)$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Drawing pages to look at what changed.

type Picture = { data: Uint8ClampedArray; width: number; height: number };

/** Each page drawn by PDF.js as it is shown, on white, at most 800 pixels on its longer side. */
async function pictures(bytes: Uint8Array, given?: string): Promise<Picture[]> {
  const doc = await (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: bytes.slice(), password: given, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const all: Picture[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const shown = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1, 800 / Math.max(shown.width, shown.height)) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    all.push({ data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height });
    page.cleanup();
  }
  await doc.loadingTask.destroy();
  return all;
}

/**
 * The pixels that changed between a page before and after: the box they form, as
 * shares of the shown width and of the height from the top, and the most common
 * red value among those that were white before.
 */
function changed(before: Picture, after: Picture) {
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  let [left, top, right, bottom, n] = [Infinity, Infinity, -Infinity, -Infinity, 0];
  const onWhite = new Map<number, number>();
  for (let y = 0; y < after.height; y++) {
    for (let x = 0; x < after.width; x++) {
      const k = (y * after.width + x) * 4;
      if (Math.abs(after.data[k]! - before.data[k]!) + Math.abs(after.data[k + 1]! - before.data[k + 1]!) + Math.abs(after.data[k + 2]! - before.data[k + 2]!) < 24) continue;
      n++;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + 1);
      if (before.data[k] === 255 && before.data[k + 1] === 255 && before.data[k + 2] === 255) onWhite.set(after.data[k]!, (onWhite.get(after.data[k]!) ?? 0) + 1);
    }
  }
  const mode = [...onWhite.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { n, left: left / after.width, right: right / after.width, top: top / after.height, bottom: bottom / after.height, middleX: (left + right) / 2 / after.width, middleY: (top + bottom) / 2 / after.height, grey: mode };
}

/** The angle of each page's last text item as PDF.js shows the page, in degrees, counter-clockwise from the right. */
async function shownAngles(bytes: Uint8Array): Promise<number[]> {
  const doc = await open(bytes);
  const all: number[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const [p, q, r, s] = page.getViewport({ scale: 1 }).transform as [number, number, number, number];
    const items = (await page.getTextContent()).items.filter((item) => 'str' in item && item.str.trim() !== '') as { transform: number[] }[];
    const [a, b] = items.at(-1)!.transform as [number, number];
    // The viewport's y runs down, so the angle as shown is that of (dx, −dy).
    const dx = p * a + r * b;
    const dy = q * a + s * b;
    all.push((Math.atan2(-dy, dx) * 180) / Math.PI);
  }
  await doc.loadingTask.destroy();
  return all;
}

const outline = async (bytes: Uint8Array) => (JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=outlines'])).out) as { outlines: { title: string; destpageposfrom1: number }[] }).outlines;
const attachments = async (bytes: Uint8Array) => Object.keys((JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments);
const fields = async (bytes: Uint8Array) =>
  (JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=acroform'])).out) as { acroform: { fields: { fullname: string; value: unknown }[] } }).acroform.fields.map((field) => [field.fullname, field.value]);
const encryption = async (bytes: Uint8Array) => (await qpdfOn(bytes, ['--show-encryption'])).out;

/** Every page's text as before, with the watermark's words after it; the right page count; no password; qpdf --check passes. */
async function expectWatermarked(input: Uint8Array, output: Uint8Array, text = 'Draft', given?: string) {
  expect((await qpdfOn(output, ['--check'])).code).toBe(0);
  const pages = Number((await qpdfOn(input, [...(given ? [`--password=${given}`] : []), '--show-npages'])).out.trim());
  expect((await qpdfOn(output, ['--show-npages'])).out.trim()).toBe(String(pages));
  expect(await encryption(output)).toMatch(/File is not encrypted/);
  const before = given ? null : await texts(input);
  const after = await texts(output);
  expect(after).toHaveLength(pages);
  after.forEach((items, index) => {
    expect(items.at(-1), `page ${index + 1}`).toBe(text);
    if (before) expect(items.slice(0, -1), `page ${index + 1}`).toEqual(before[index]);
  });
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('watermarking the shared test set', { timeout: 60_000 }, () => {
  it('text.pdf: each page ends with the text, with progress for reading, each page and writing', async () => {
    const input = fixture('text.pdf');
    const { output, progress } = await watermark(input);
    await expectWatermarked(input, output);
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    expect(progress.filter((step) => step.stage === 'working')).toEqual([1, 2, 3].map((done) => ({ stage: 'working', unit: 'page', done, total: 3, writesAfter: true })));
    const writing = progress.filter((step) => step.stage === 'writing').map((step) => (step as { percent: number }).percent);
    expect(writing.at(-1)).toBe(100);
    expect(writing.slice(0, -1).every((percent) => percent >= 75 && percent <= 95)).toBe(true);
    // The bar never goes back and is full only once the file is written.
    const { progressFraction } = await import('../../src/widget/format');
    const fractions = progress.map(progressFraction);
    expect(fractions.slice(0, -1).every((fraction) => fraction < 1)).toBe(true);
    let highest = 0;
    for (const fraction of fractions) {
      expect(fraction).toBeGreaterThanOrEqual(highest - 1e-9);
      highest = Math.max(highest, fraction);
    }
    // The text never goes into a progress message.
    expect(JSON.stringify(progress)).not.toContain('Draft');
  });

  it('mixed.pdf: on every page as shown, the text is centred, inside the margin, rising at 45 degrees, mid-grey at 40%', async () => {
    const input = fixture('mixed.pdf');
    const before = await pictures(input);
    for (const text of ['Draft', fifty]) {
      const { output } = await watermark(input, text);
      await expectWatermarked(input, output, text);
      const after = await pictures(output);
      after.forEach((picture, index) => {
        const label = `${text.length} characters, page ${index + 1}`;
        const box = changed(before[index]!, picture);
        expect(box.n, label).toBeGreaterThan(100);
        expect(Math.abs(box.middleX - 0.5), label).toBeLessThan(0.03);
        expect(Math.abs(box.middleY - 0.5), label).toBeLessThan(0.03);
        // Inside the margin of a twelfth of the shorter side, less a pixel for drawing.
        const shorter = Math.min(picture.width, picture.height);
        const m = shorter / 12 - 1;
        expect(box.left * picture.width, label).toBeGreaterThanOrEqual(m);
        expect(box.top * picture.height, label).toBeGreaterThanOrEqual(m);
        expect(picture.width - box.right * picture.width, label).toBeGreaterThanOrEqual(m);
        expect(picture.height - box.bottom * picture.height, label).toBeGreaterThanOrEqual(m);
        // Mid-grey (128) at 40% on white: 255 × 0.6 + 128 × 0.4 = 204.
        expect(Math.abs(box.grey! - 204), label).toBeLessThanOrEqual(3);
      });
      for (const angle of await shownAngles(output)) expect(Math.abs(angle - 45)).toBeLessThan(0.5);
      // Every page's stored turn and boxes are as they were.
      expect(await storedPlaces(output)).toEqual(await storedPlaces(input));
    }
  });

  it('the layer is marked as a watermark artifact, with an opacity of 0.4 in its own resources, and Helvetica Bold not put inside the file', async () => {
    const { output } = await watermark(fixture('mixed.pdf'));
    const { objects } = await jsonOf(output);
    const forms = Object.entries(objects).filter(([, entry]) => entry.stream?.dict['/Subtype'] === '/Form');
    expect(forms).toHaveLength(4);
    for (const [id, entry] of forms) {
      const data = streamText(objects, id.replace(/^obj:/, ''));
      expect(data.replace(/\s+/g, ' ')).toMatch(/^\/Artifact << \/Type \/Pagination \/Subtype \/Watermark >> BDC .* EMC $/);
      const resources = entry.stream!.dict['/Resources'] as Record<string, Record<string, Record<string, unknown>>>;
      expect(Object.values(resources['/ExtGState']!)).toEqual([{ '/Type': '/ExtGState', '/ca': 0.4 }]);
      const fontRef = Object.values(resources['/Font']!)[0] as unknown as string;
      expect(objects[`obj:${fontRef}`]!.value).toMatchObject({ '/BaseFont': '/Helvetica-Bold', '/Subtype': '/Type1' });
      expect(objects[`obj:${fontRef}`]!.value).not.toHaveProperty('/FontDescriptor');
    }
    // The font is one object, shared by every layer.
    expect(new Set(forms.map(([, entry]) => Object.values((entry.stream!.dict['/Resources'] as Record<string, Record<string, unknown>>)['/Font']!)[0])).size).toBe(1);
  });

  it('"Brouillon – à relire" is drawn with its accents, and PDF.js reads it back as typed', async () => {
    const input = fixture('text.pdf');
    const { output } = await watermark(input, 'Brouillon – à relire');
    await expectWatermarked(input, output, 'Brouillon – à relire');
  });

  it('a text with spaces at its ends is drawn cleaned', async () => {
    const input = fixture('text.pdf');
    const { output } = await watermark(input, '  Draft copy  ');
    await expectWatermarked(input, output, 'Draft copy');
  });

  it('scanned.pdf: the text shows over the picture on every page', async () => {
    const input = fixture('scanned.pdf');
    const { output } = await watermark(input);
    await expectWatermarked(input, output);
    const before = await pictures(input);
    const after = await pictures(output);
    after.forEach((picture, index) => {
      const box = changed(before[index]!, picture);
      expect(box.n, `page ${index + 1}`).toBeGreaterThan(100);
      expect(Math.abs(box.middleX - 0.5)).toBeLessThan(0.03);
      expect(Math.abs(box.middleY - 0.5)).toBeLessThan(0.03);
    });
  });

  it('pages-500.pdf: all 500 pages show the text, and each page keeps its own text', async () => {
    const input = fixture('pages-500.pdf');
    const { output } = await watermark(input, fifty);
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const before = await texts(input);
    const all = await texts(output);
    expect(all).toHaveLength(500);
    all.forEach((items, index) => {
      expect(items.at(-1)).toBe(fifty);
      expect(items.slice(0, -1)).toEqual(before[index]);
    });
  }, 120_000);

  it('warning.pdf and images.pdf are watermarked', async () => {
    for (const name of ['warning.pdf', 'images.pdf']) {
      const input = fixture(name);
      const { output } = await watermark(input);
      await expectWatermarked(input, output);
    }
  });

  it('password.pdf with its password and restricted.pdf come back with no password and no restrictions', async () => {
    await expect(watermark(fixture('password.pdf'))).rejects.toThrow();
    await expect(watermark(fixture('password.pdf'), 'Draft', ['wrong'])).rejects.toThrow();
    const { output } = await watermark(fixture('password.pdf'), 'Draft', [password]);
    await expectWatermarked(fixture('password.pdf'), output, 'Draft', password);
    const restricted = await watermark(fixture('restricted.pdf'));
    expect(await encryption(fixture('restricted.pdf'))).toMatch(/print/i);
    await expectWatermarked(fixture('restricted.pdf'), restricted.output);
  });

  it('rich.pdf keeps its bookmarks, link and note.txt', async () => {
    const input = fixture('rich.pdf');
    const { output } = await watermark(input);
    await expectWatermarked(input, output);
    expect((await outline(output)).map((item) => [item.title, item.destpageposfrom1])).toEqual([['Chapter one', 1], ['Chapter two', 2]]);
    expect(await attachments(output)).toEqual(['note.txt']);
    const links = (bytes: Awaited<ReturnType<typeof jsonOf>>) => Object.values(bytes.objects).filter((entry) => (entry.value as Record<string, unknown> | undefined)?.['/Subtype'] === '/Link');
    const after = await jsonOf(output);
    expect(links(after).map((entry) => JSON.stringify((entry.value as Record<string, unknown>)['/A']))).toEqual(links(await jsonOf(input)).map((entry) => JSON.stringify((entry.value as Record<string, unknown>)['/A'])));
  });

  it('form.pdf keeps its fields and their values', async () => {
    const input = fixture('form.pdf');
    const { output } = await watermark(input);
    await expectWatermarked(input, output);
    expect(await fields(output)).toEqual(await fields(input));
    expect(JSON.stringify(await fields(output))).toContain('Sample text');
  });

  it('tagged.pdf keeps its tags, destination, thread and fields', async () => {
    const input = fixture('tagged.pdf');
    const { output } = await watermark(input);
    await expectWatermarked(input, output);
    const before = await jsonOf(input);
    const after = await jsonOf(output);
    const all = (json: typeof before) => JSON.stringify(json.objects);
    for (const kept of ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-NOTE', 'SECRET-LINK', '/StructTreeRoot', '/Threads', '/Dests']) {
      expect(all(after), kept).toContain(kept);
    }
    const kinds = (json: typeof before) =>
      Object.values(json.objects)
        .map((entry) => (entry.value as Record<string, unknown> | undefined)?.['/S'])
        .filter(Boolean)
        .sort();
    expect(kinds(after)).toEqual(kinds(before));
    expect(await fields(output)).toEqual(await fields(input));
  });

  // tagged.pdf's tags point to objects (OBJR) and name no marked-content id, so a page made here,
  // whose text is tied to its tags by MCID, is checked beside it.
  for (const [name, make, ids] of [
    ['tagged.pdf', async () => fixture('tagged.pdf'), 0],
    ['a page made here whose text is tied to its tags', taggedPage, 2],
  ] as const) {
    it(`${name}: every tagged MCID is still in its page's own streams, unchanged; PDF.js still finds it; the watermark is an artifact in no tag`, async () => {
      const input = await make();
      const { output } = await watermark(input);
      expect((await qpdfOn(output, ['--check'])).code).toBe(0);
      const before = await jsonOf(input);
      const after = await jsonOf(output);
      const rootOf = (json: typeof before) => {
        const catalog = Object.values(json.objects).find((entry) => (entry.value as Record<string, unknown> | undefined)?.['/Type'] === '/Catalog')!.value as Record<string, unknown>;
        return catalog['/StructTreeRoot'];
      };
      const beforeIds = mcidsByPage(before.objects, rootOf(before));
      const afterIds = mcidsByPage(after.objects, rootOf(after));
      expect([...beforeIds.values()].flat()).toHaveLength(ids);
      before.pages.forEach((page, index) => {
        const was = beforeIds.get(page.object) ?? [];
        const now = afterIds.get(after.pages[index]!.object) ?? [];
        expect(now).toEqual(was);
        const ownBefore = page.contents.map((id) => streamText(before.objects, id));
        const ownAfter = after.pages[index]!.contents.slice(1, -2).map((id) => streamText(after.objects, id));
        expect(ownAfter).toEqual(ownBefore);
        for (const mcid of now) expect(ownAfter.join('\n')).toMatch(new RegExp(`/MCID ${mcid}\\b`));
        const dictBefore = before.objects[`obj:${page.object}`]!.value as Record<string, unknown>;
        const dictAfter = after.objects[`obj:${after.pages[index]!.object}`]!.value as Record<string, unknown>;
        expect(dictAfter['/StructParents']).toEqual(dictBefore['/StructParents']);
      });

      // PDF.js finds every tagged piece of content in its page's marked content, and the watermark last, in an artifact.
      const doc = await open(output);
      const found: Record<string, string> = {};
      for (let number = 1; number <= doc.numPages; number++) {
        const page = await doc.getPage(number);
        const tree = await page.getStructTree();
        const tagged: string[] = [];
        const collect = (node: unknown) => {
          const item = node as { type?: string; id?: string; children?: unknown[] } | null;
          if (!item) return;
          if (item.type === 'content' && item.id) tagged.push(item.id);
          for (const child of item.children ?? []) collect(child);
        };
        collect(tree);
        const content = await page.getTextContent({ includeMarkedContent: true });
        const marked = content.items.flatMap((item) => ('type' in item && item.type === 'beginMarkedContentProps' ? [item.id] : []));
        for (const id of tagged) expect(marked).toContain(id);
        const opened = content.items.flatMap((item) => ('type' in item && item.type.startsWith('beginMarkedContent') ? [item as { tag?: string; id?: string | null }] : []));
        expect(opened.at(-1)!.tag).toBe('Artifact');
        // The artifact has no marked-content id, so no tag can point to it.
        expect(opened.at(-1)!.id ?? null).toBeNull();
        let inside: string | null = null;
        for (const item of content.items) {
          if ('type' in item) {
            if (item.type === 'beginMarkedContentProps') inside = item.id ?? null;
            else if (item.type === 'endMarkedContent') inside = null;
          } else if (inside) found[inside] = (found[inside] ?? '') + item.str;
        }
      }
      await doc.loadingTask.destroy();
      // The text tied to each tag is the page's own, and the watermark's words are in none.
      if (ids > 0) expect(Object.values(found)).toEqual(['Hello tagged', 'Second part']);
      for (const text of Object.values(found)) expect(text).not.toContain('Draft');
    });
  }

  it('damaged files and a file that is not a PDF fail and give nothing', async () => {
    for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']) await expect(watermark(fixture(name)), name).rejects.toThrow();
  });

  it('every other file in the set: watermarked and checked, or a failure', async () => {
    const covered = new Set(['text.pdf', 'mixed.pdf', 'pages-500.pdf', 'scanned.pdf', 'warning.pdf', 'images.pdf', 'password.pdf', 'restricted.pdf', 'rich.pdf', 'form.pdf', 'tagged.pdf', 'damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']);
    const others = readdirSync(join(__dirname, '../fixtures')).filter((name) => name.endsWith('.pdf') && !covered.has(name));
    expect(others.sort()).toEqual([
      'compress-bomb-attachment.pdf',
      'compress-flate-bomb.pdf',
      'compress-jpeg-mismatch.pdf',
      'compress-json-bomb.pdf',
      'compress-kinds.pdf',
      'compress-lossless.pdf',
      'compress-packed.pdf',
      'compress-password.pdf',
      'compress-scans.pdf',
      'compress-small-jpg.pdf',
      'compress-text.pdf',
    ]);
    for (const name of others) {
      const input = fixture(name);
      if (name === 'compress-json-bomb.pdf') {
        // Its JSON of dictionaries passes 64 MB, so its pages cannot be read: the engine's failure.
        await expect(watermark(input), name).rejects.toThrow('The pages could not be read.');
        continue;
      }
      const given = name === 'compress-password.pdf' ? password : undefined;
      const { output } = await watermark(input, 'Draft', [given]);
      await expectWatermarked(input, output, 'Draft', given);
    }
  }, 120_000);
});

/** One page whose two pieces of text are tied to a tag by marked-content id, as tagging tools write them. */
async function taggedPage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.pushOperators(op('BDC', [PDFName.of('P'), doc.context.obj({ MCID: 0 }) as unknown as PdfLib.PDFArray]));
  page.drawText('Hello tagged', { x: 50, y: 700, size: 12, font });
  page.pushOperators(op('EMC'));
  page.pushOperators(op('BDC', [PDFName.of('Span'), doc.context.obj({ MCID: 1 }) as unknown as PdfLib.PDFArray]));
  page.drawText('Second part', { x: 50, y: 600, size: 12, font });
  page.pushOperators(op('EMC'));
  page.node.set(PDFName.of('StructParents'), PdfLib.PDFNumber.of(0));
  const c = doc.context;
  const root = c.nextRef();
  const para = c.register(c.obj({ Type: 'StructElem', S: 'P', P: root, Pg: page.ref, K: [0, { Type: 'MCR', MCID: 1, Pg: page.ref }] }));
  c.assign(root, c.obj({ Type: 'StructTreeRoot', K: [para], ParentTree: { Nums: [0, [para, para]] } }));
  doc.catalog.set(PDFName.of('StructTreeRoot'), root);
  doc.catalog.set(PDFName.of('MarkInfo'), c.obj({ Marked: true }));
  return doc.save({ useObjectStreams: false });
}

/** The marked-content ids the tag tree names for each page, by page object. */
function mcidsByPage(objects: Awaited<ReturnType<typeof jsonOf>>['objects'], root: unknown): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const value = (id: unknown) => (typeof id === 'string' ? objects[`obj:${id}`]?.value : id);
  const walk = (node: unknown, page: string | undefined, depth: number) => {
    if (depth > 50) return;
    const item = value(node);
    if (typeof item === 'number' && page) found.set(page, [...(found.get(page) ?? []), item]);
    else if (Array.isArray(item)) for (const each of item) walk(each, page, depth + 1);
    else if (item && typeof item === 'object') {
      const dict = item as Record<string, unknown>;
      const pg = typeof dict['/Pg'] === 'string' ? (dict['/Pg'] as string) : page;
      if (typeof dict['/MCID'] === 'number' && pg) found.set(pg, [...(found.get(pg) ?? []), dict['/MCID'] as number]);
      if ('/K' in dict) walk(dict['/K'], pg, depth + 1);
    }
  };
  walk(root, undefined, 0);
  return found;
}

// ---------------------------------------------------------------------------

/** An operator by its name, for content pdf-lib has no helper for. */
const op = (name: string, args: Parameters<typeof PDFOperator.of>[1] = []) => PDFOperator.of(name as PdfLib.PDFOperatorNames, args);

/** A PDF of `pages` pages written by hand, every page drawing one shared content stream. */
function handMade(pages: number): Uint8Array {
  const parts: string[] = ['%PDF-1.7\n'];
  const offsets: number[] = [];
  let size = parts[0]!.length;
  const object = (number: number, body: string) => {
    offsets[number] = size;
    const text = `${number} 0 obj\n${body}\nendobj\n`;
    parts.push(text);
    size += text.length;
  };
  const kids = Array.from({ length: pages }, (_, n) => `${4 + n} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages} /Kids [${kids}] >>`);
  const content = '0 0 0 rg 20 20 160 160 re f';
  object(3, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  for (let n = 0; n < pages; n++) object(4 + n, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 3 0 R >>');
  const count = 4 + pages;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  parts.push(table, `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`);
  return new TextEncoder().encode(parts.join(''));
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('content that tries to change the watermark, and large files', { timeout: 60_000 }, () => {
  it('a page that leaves a low opacity, a scaling cm and a red fill set: the watermark keeps its place, size, grey and opacity', async () => {
    const make = async (hostile: boolean) => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]);
      if (hostile) {
        page.node.set(PDFName.of('Resources'), doc.context.obj({ ExtGState: { Low: { Type: 'ExtGState', ca: 0.1, CA: 0.1 } } }));
        page.pushOperators(op('gs', [PDFName.of('Low')]), op('cm', [3, 0, 0, 3, 40, 40].map((n) => PdfLib.PDFNumber.of(n))), op('rg', [1, 0, 0].map((n) => PdfLib.PDFNumber.of(n))));
      }
      return doc.save({ useObjectStreams: false });
    };
    const plain = await make(false);
    const hostile = await make(true);
    const blank = (await pictures(plain))[0]!;
    const clean = changed(blank, (await pictures((await watermark(plain)).output))[0]!);
    const kept = changed(blank, (await pictures((await watermark(hostile)).output))[0]!);
    expect(clean.grey).toBeGreaterThanOrEqual(201);
    expect(clean.grey).toBeLessThanOrEqual(207);
    expect(kept).toEqual(clean);
  });

  it('thousands of pages that share one tiny content stream: done quickly, the stream still one and unchanged, growing by a few hundred bytes a page', async () => {
    const pages = 6000;
    const qpdf = await makeQpdf();
    qpdf.write('/in.pdf', handMade(pages));
    expect(qpdf.call(['/in.pdf', '--object-streams=generate', '--compression-level=9', '/out.pdf']).code).toBe(0);
    const input = qpdf.read('/out.pdf');
    const started = Date.now();
    const { output, progress } = await watermark(input, fifty);
    const seconds = (Date.now() - started) / 1000;
    expect(progress.filter((step) => step.stage === 'working').at(-1)).toMatchObject({ done: pages, total: pages });
    expect(seconds).toBeLessThan(40);
    // Each page gets its own layer, a form of about 500 bytes with a 50-character text (task 3.2).
    expect((output.length - input.length) / pages).toBeLessThan(600);
    const { pages: list, objects } = await jsonOf(output);
    expect(list).toHaveLength(pages);
    const shared = new Set(list.map((page) => page.contents[1]));
    expect(shared.size).toBe(1);
    expect(streamText(objects, [...shared][0]!)).toBe('0 0 0 rg 20 20 160 160 re f');
  }, 120_000);
});
