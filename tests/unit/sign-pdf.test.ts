// The Sign PDF engine: where the signature goes and how large, every option
// refused before any work, a typed name, a drawing and a picture, and real runs
// on every file in the shared test set with the same qpdf and pdf-lib the
// browser gets, each result read back by qpdf and drawn by PDF.js.

import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import * as PdfLib from '@cantoo/pdf-lib';
import { PDFDocument, PDFName, PDFOperator, StandardFonts } from '@cantoo/pdf-lib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Inflate } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { pictureOutcome } from '../../src/engines/picture';
import { plainCopy } from '../../src/engines/plain';
import { drawingContent, drawingLine, inspect, inspectPicture, pictureParts, run, signaturePlace, timesItalicReach, typedContent, type Position } from '../../src/engines/tools/sign-pdf';
import type { EngineTools, Progress } from '../../src/engines/types';
import { optionDrawings, optionPictures, pad, pictureRule } from '../../src/widget/option-values';
import { failureKind } from '../../src/workers/worker-core';
import { changed, fixture, jsonOf, makeQpdf, open, password, pictures, qpdfOn, rawJsonOf, storedPlaces, streamText, texts, tools as stampTools, type Picture } from './stamp-helpers';

const tools: EngineTools = { ...stampTools, fflate: async () => ({ Inflate }) };
const picture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/pictures', name)));
const positions: Position[] = ['bottom-left', 'bottom-centre', 'bottom-right', 'top-left', 'top-centre', 'top-right'];

/** A drawing wider than tall: a wave across most of the pad. */
const wave = [[20, 200, 200, 80, 400, 300, 600, 90, 800, 310, 980, 200]];
const typedName = 'Jane Doe';

type Options = Record<string, unknown>;
/** Given as an input, sends it as undefined: left out, each helper sends its usual input. */
const missing = Symbol('missing');
const input = (given: unknown, usual: unknown) => (given === missing ? undefined : given === undefined ? usual : given);
const typed = (name?: unknown, extra: Options = {}): Options => ({ source: 'type', name: input(name, typedName), page: 'last', position: 'bottom-right', ...extra });
const drawn = (drawing?: unknown, extra: Options = {}): Options => ({ source: 'draw', drawing: input(drawing, wave), page: 'last', position: 'bottom-right', ...extra });
const pictured = (bytes?: unknown, extra: Options = {}): Options => ({ source: 'picture', picture: input(bytes, picture('alpha.png')), page: 'last', position: 'bottom-right', ...extra });

async function sign(file: Uint8Array, options: Options, given: EngineTools = tools, passwords: (string | undefined)[] = []) {
  const progress: Progress[] = [];
  const outputs = await run([file], { ...options, passwords }, (step) => progress.push(step), given);
  return { output: outputs[0]!, outputs, progress };
}

/** A failure, or null. */
const failure = (promise: Promise<unknown>) => promise.then(() => null, (caught: unknown) => caught as Error);

// ---------------------------------------------------------------------------

describe('where the signature goes, and how large', () => {
  const sizes: [string, { width: number; height: number }][] = [
    ['A4', { width: 595.28, height: 841.89 }],
    ['A4 on its side', { width: 841.89, height: 595.28 }],
    ['Letter', { width: 612, height: 792 }],
    ['A6', { width: 297.64, height: 419.53 }],
    ['A0', { width: 2383.94, height: 3370.39 }],
    ['20 by 20 points', { width: 20, height: 20 }],
    ['a 10 by 2,000 point strip', { width: 10, height: 2000 }],
  ];
  const boxes: [string, { width: number; height: number }, boolean][] = [
    ['a wide drawing', { width: 1000, height: 300 }, false],
    ['a tall picture', { width: 300, height: 1000 }, false],
    ['a typed name', { width: 400, height: 110 }, true],
  ];

  it('a wide drawing on A4 is 178.6 points wide, and a tall picture about 60 points tall and narrower; a typed "Jane Doe" no more than 30 points tall', () => {
    const a4 = sizes[0]![1];
    const wide = signaturePlace(a4, { width: 1000, height: 300 }, 'bottom-right', false);
    expect(wide.width).toBeCloseTo(178.584, 2);
    expect(wide.height).toBeLessThanOrEqual(59.53);
    const tall = signaturePlace(a4, { width: 300, height: 1000 }, 'bottom-right', false);
    expect(tall.height).toBeCloseTo(59.528, 2);
    expect(tall.width).toBeLessThan(tall.height);
    const name = signaturePlace(a4, { width: 380, height: 112 }, 'bottom-right', true);
    expect(name.height).toBeLessThanOrEqual(30);
  });

  it('on every page size, box and place: inside the margin on all four sides, the chosen edges a twentieth of the shorter side away, at most three tenths wide and a tenth (or a twentieth) tall, its shape kept', () => {
    for (const [sizeName, area] of sizes) {
      const D = Math.min(area.width, area.height);
      const m = D / 20;
      for (const [boxName, box, isTyped] of boxes) {
        for (const position of positions) {
          const label = `${sizeName}, ${boxName}, ${position}`;
          const place = signaturePlace(area, box, position, isTyped);
          const e = 1e-9 * Math.max(1, D);
          expect(place.x, label).toBeGreaterThanOrEqual(m - e);
          expect(place.y, label).toBeGreaterThanOrEqual(m - e);
          expect(place.x + place.width, label).toBeLessThanOrEqual(area.width - m + e);
          expect(place.y + place.height, label).toBeLessThanOrEqual(area.height - m + e);
          expect(place.width, label).toBeLessThanOrEqual(0.3 * D + e);
          expect(place.height, label).toBeLessThanOrEqual((isTyped ? D / 20 : D / 10) + e);
          expect(place.width / place.height, label).toBeCloseTo(box.width / box.height, 9);
          // One of the two limits is reached: it is as large as fits.
          expect(Math.abs(place.width - 0.3 * D) < e || Math.abs(place.height - (isTyped ? D / 20 : D / 10)) < e, label).toBe(true);
          const [edge, side] = position.split('-');
          if (edge === 'bottom') expect(place.y, label).toBeCloseTo(m, 9);
          else expect(area.height - place.y - place.height, label).toBeCloseTo(m, 9);
          if (side === 'left') expect(place.x, label).toBeCloseTo(m, 9);
          else if (side === 'right') expect(area.width - place.x - place.width, label).toBeCloseTo(m, 9);
          else expect(place.x + place.width / 2, label).toBeCloseTo(area.width / 2, 9);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------

describe('what the job is sent', { timeout: 60_000 }, () => {
  /** Tools that count each time qpdf is asked for, so a refusal can be seen to come before any work. */
  const watched = () => {
    const asked = { qpdf: 0 };
    const given: EngineTools = { ...tools, qpdf: async () => (asked.qpdf++, tools.qpdf!()) };
    return { asked, given };
  };

  it('a choice it does not accept is refused before any work: the way, the pages or the place, as a value, a label, a number, null, missing or __proto__', async () => {
    const { asked, given } = watched();
    const bad: Options[] = [
      typed(typedName, { source: 'Type your name' }),
      typed(typedName, { source: 'name' }),
      typed(typedName, { source: 3 }),
      typed(typedName, { source: null }),
      { name: typedName, page: 'last', position: 'bottom-right' },
      typed(typedName, { page: 'Last page' }),
      typed(typedName, { page: 'all' }),
      typed(typedName, { page: undefined }),
      typed(typedName, { position: 'Bottom right' }),
      typed(typedName, { position: 'middle' }),
      typed(typedName, { position: ['bottom-right'] }),
      JSON.parse('{"__proto__": {"source": "type", "page": "last", "position": "bottom-right"}, "name": "Jane Doe"}') as Options,
    ];
    for (const options of bad) {
      const error = await failure(sign(fixture('text.pdf'), options, given));
      expect(error, JSON.stringify(options)).toBeInstanceOf(Error);
      expect(failureKind(error), JSON.stringify(options)).toBe('engine');
      expect(error!.message).not.toContain('Jane');
    }
    expect(asked.qpdf).toBe(0);
  });

  it('with "Type your name" chosen, a name the field would refuse is refused before any work, as text-refused, with an error that does not hold it', async () => {
    const { asked, given } = watched();
    for (const name of [missing, '', '   ', 'x'.repeat(51), 'सीता', 'Łukasz', 'Jane\tDoe', '\t', 3, null, ['Jane'], { name: 'Jane' }, 'a‮b']) {
      const error = await failure(sign(fixture('text.pdf'), typed(name), given));
      expect(error?.name, String(typeof name === 'symbol' ? 'missing' : name)).toBe('TextRefused');
      expect(failureKind(error)).toBe('text-refused');
      expect(error!.message).not.toMatch(/Jane|सीता|Łukasz|xxxx/);
    }
    // A drawing and a picture present beside no name are never taken instead.
    const error = await failure(sign(fixture('text.pdf'), { ...typed(missing), drawing: wave, picture: picture('alpha.png') }, given));
    expect(error?.name).toBe('TextRefused');
    expect(asked.qpdf).toBe(0);
  });

  it('with "Draw it" chosen, a drawing the tool does not take is refused before any work, as drawing-refused; a name beside it is never taken instead', async () => {
    const { asked, given } = watched();
    const tooManyLines = Array.from({ length: 201 }, () => [1, 1]);
    const tooManyPoints = [Array.from({ length: 20_001 * 2 }, () => 5)];
    for (const drawing of [missing, [], [[]], [[1]], [[1001, 5]], [[5, 401]], [[-1, 5]], [[1.5, 5]], [[Number.NaN, 5]], [['5', 5]], [null], tooManyLines, tooManyPoints, 'lines', new Uint8Array([1, 2])]) {
      const error = await failure(sign(fixture('text.pdf'), { ...drawn(drawing), name: typedName }, given));
      expect(error?.name, typeof drawing === 'symbol' ? 'missing' : JSON.stringify(drawing)?.slice(0, 40)).toBe('DrawingRefused');
      expect(failureKind(error)).toBe('drawing-refused');
      expect(error!.message).not.toContain('Jane');
    }
    expect(asked.qpdf).toBe(0);
  });

  it('with "Use a picture of it" chosen, no picture or bytes that are not an accepted picture are refused before any work, as picture-refused; a name or drawing beside it is never taken instead', async () => {
    const { asked, given } = watched();
    for (const bytes of [missing, null, 'alpha.png', [137, 80, 78, 71], picture('broken.png'), picture('broken.jpg'), picture('arithmetic.jpg'), picture('data-bomb.png'), picture('p3.icc'), fixture('text.pdf'), new Uint8Array(0)]) {
      const error = await failure(sign(fixture('text.pdf'), { ...pictured(bytes), name: typedName, drawing: wave }, given));
      expect(error?.name).toBe('PictureRefused');
      expect(failureKind(error)).toBe('picture-refused');
      expect(error!.message).toBe('The picture was refused.');
    }
    expect(asked.qpdf).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Drawing pages to look at what changed.

/** One page drawn by PDF.js on white at `scale` pixels a point, as a picture. */
async function render(bytes: Uint8Array, number: number, scale: number): Promise<Picture> {
  const doc = await open(bytes);
  const page = await doc.getPage(number);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  await doc.loadingTask.destroy();
  return { data, width: canvas.width, height: canvas.height };
}

/** A page drawn by PDF.js at `scale`, as a function from a point on the page as shown (from its bottom left) to its colour. */
async function colours(bytes: Uint8Array, number: number, scale: number) {
  const doc = await open(bytes);
  const page = await doc.getPage(number);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  await doc.loadingTask.destroy();
  return (x: number, y: number) => {
    const px = Math.round(x * scale);
    const py = Math.round(viewport.height - y * scale);
    const k = (py * canvas.width + px) * 4;
    return [data[k]!, data[k + 1]!, data[k + 2]!];
  };
}
const close = (seen: number[], wanted: number[], within = 40) => seen.every((value, index) => Math.abs(value - wanted[index]!) <= within);

/** The changed pixels' box on a page, in points of the page as shown, from its bottom left. */
function changedBox(before: Picture, after: Picture, shown: { width: number; height: number }) {
  const box = changed(before, after);
  return { n: box.n, left: box.left * shown.width, right: box.right * shown.width, bottom: (1 - box.bottom) * shown.height, top: (1 - box.top) * shown.height };
}

/** One page, A4, filled with `fill` (r, g, b from 0 to 1) or left white. */
async function onePage(fill?: [number, number, number], size: [number, number] = [595.28, 841.89]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(size);
  if (fill) page.drawRectangle({ x: 0, y: 0, width: size[0], height: size[1], color: PdfLib.rgb(...fill) });
  return doc.save({ useObjectStreams: false });
}

/** The objects of a file that are pictures, and those that are forms. */
async function kinds(bytes: Uint8Array) {
  const { objects } = await jsonOf(bytes);
  const entries = Object.entries(objects);
  return {
    objects,
    images: entries.filter(([, entry]) => entry.stream?.dict['/Subtype'] === '/Image'),
    forms: entries.filter(([, entry]) => entry.stream?.dict['/Subtype'] === '/Form'),
  };
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('a typed name', { timeout: 60_000 }, () => {
  it('a) Tj (b \\ % <x>: passes qpdf --check, PDF.js reads it back exactly on the last page only, and the form holds it only inside one hex string', async () => {
    const name = 'a) Tj (b \\ % <x>';
    const { output } = await sign(fixture('text.pdf'), typed(name));
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const pages = await texts(output);
    expect(pages[2]!.at(-1)).toBe(name);
    expect(pages[0]!.join(' ')).not.toContain('Tj (b');
    const { forms, objects } = await kinds(output);
    const signature = forms.filter(([, entry]) => entry.stream!.dict['/Resources'] && '/Font' in (entry.stream!.dict['/Resources'] as object));
    expect(signature).toHaveLength(1);
    const data = streamText(objects, signature[0]![0].replace(/^obj:/, ''));
    const hex = Buffer.from(name, 'latin1').toString('hex').toUpperCase();
    expect(data).not.toContain('(');
    expect(data).not.toContain(')');
    expect([...data.matchAll(/<([^<>]*)>/g)].map((match) => match[1])).toEqual([hex]);
    // Set in from the form's left and bottom edges by Times Italic's reach, so no glyph is cut.
    expect(data).toMatch(new RegExp(`^q 0 g BT /F1 100 Tf 16\\.9 21\\.7 Td <${hex}> Tj ET Q\\n?$`));
  });

  it('"Zoë Ångström-Núñez" is drawn as typed, in Times Italic, not put inside the file, no more than 30 points tall on A4', async () => {
    const name = 'Zoë Ångström-Núñez';
    const input = await onePage();
    const { output } = await sign(input, typed(name));
    expect((await texts(output))[0]).toEqual([name]);
    const { objects } = await kinds(output);
    const fonts = Object.values(objects).filter((entry) => (entry.value as Record<string, unknown> | undefined)?.['/Type'] === '/Font');
    expect(fonts).toHaveLength(1);
    expect(fonts[0]!.value).toMatchObject({ '/BaseFont': '/Times-Italic', '/Subtype': '/Type1' });
    expect(fonts[0]!.value).not.toHaveProperty('/FontDescriptor');
    const box = changedBox((await pictures(input))[0]!, (await pictures(output))[0]!, { width: 595.28, height: 841.89 });
    expect(box.top - box.bottom).toBeLessThanOrEqual(30);
    // Bottom right, inside the margin of a twentieth of the shorter side.
    const m = 595.28 / 20;
    expect(box.right).toBeLessThanOrEqual(595.28 - m + 1);
    expect(box.bottom).toBeGreaterThanOrEqual(m - 1);
    expect(box.left).toBeGreaterThan(595.28 / 2);
  });

  it('nothing is cut: the form reaches as far as Times Italic\'s glyphs, so "Ú" and "Å" draw clearly taller than "U" and "A", and "fj" and "jaf" keep their tails', async () => {
    const reach = timesItalicReach;
    // The font's own box, as pdf-lib holds it: the form's bottom, top and left come from it.
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.TimesRomanItalic);
    const fontBox = (font as unknown as { embedder: { font: { FontBBox: number[] } } }).embedder.font.FontBBox;
    expect([-reach.left, reach.bottom, reach.top]).toEqual([fontBox[0], fontBox[1], fontBox[3]]);
    const input = await onePage();
    const scale = 4;
    const blank = await render(input, 1, scale);
    const a4 = { width: 595.28, height: 841.89 };
    const ink = async (name: string) => {
      const { output } = await sign(input, typed(name));
      const after = await render(output, 1, scale);
      const box = changed(blank, after);
      const advance = font.widthOfTextAtSize(name, 100);
      const form = typedContent(advance, '<>');
      const place = signaturePlace(a4, form, 'bottom-right', true);
      const px = (points: number) => points * scale;
      return {
        left: box.left * after.width,
        right: box.right * after.width,
        top: box.top * after.height,
        bottom: box.bottom * after.height,
        height: (box.bottom - box.top) * after.height,
        // The form's box and the name's own start and end, in pixels from the left and from the top.
        formLeft: px(place.x),
        formRight: px(place.x + place.width),
        formTop: px(a4.height - place.y - place.height),
        formBottom: px(a4.height - place.y),
        origin: px(place.x + (reach.left / 10) * place.scale),
        end: px(place.x + (reach.left / 10 + advance) * place.scale),
      };
    };
    const [u, uAcute, a, aRing] = await Promise.all(['U', 'Ú', 'A', 'Å'].map(ink));
    // The accent and the ring reach 876 to 883 thousandths, U and A about 660: cut at the old box's 683 they would add a few percent.
    expect(uAcute!.height / u!.height).toBeGreaterThan(1.2);
    expect(aRing!.height / a!.height).toBeGreaterThan(1.15);
    for (const name of ['fj', 'jaf']) {
      const seen = await ink(name);
      // Nothing reaches the form's left, right or top edge, where it would be cut; the bottom is the font's lowest point.
      expect(seen.left, name).toBeGreaterThanOrEqual(seen.formLeft + 1);
      expect(seen.right, name).toBeLessThanOrEqual(seen.formRight - 1);
      expect(seen.top, name).toBeGreaterThanOrEqual(seen.formTop + 1);
      expect(seen.bottom, name).toBeLessThanOrEqual(seen.formBottom + 1);
      if (name === 'jaf') {
        // j's tail is drawn left of where the name starts, and f's right of where it ends: the old box cut both.
        expect(seen.left, name).toBeLessThan(seen.origin - 4);
        expect(seen.right, name).toBeGreaterThan(seen.end + 4);
      }
    }
    // The size rule takes the whole box: the box is no more than a twentieth of the shorter side tall.
    expect(u!.formBottom - u!.formTop).toBeCloseTo((595.28 / 20) * scale, 6);
  });

  it('a name with spaces at its ends is drawn cleaned', async () => {
    const { output } = await sign(await onePage(), typed('  Jane Doe  '));
    expect((await texts(output))[0]).toEqual(['Jane Doe']);
  });
});

describe('a drawing', { timeout: 60_000 }, () => {
  it('is drawn as black lines at the bottom right inside the margin, the empty part of the pad left out, its proportions kept', async () => {
    // A loop in the left half of the pad: the right half is empty.
    const loop = [[60, 200, 120, 60, 260, 40, 380, 120, 400, 260, 300, 360, 150, 360, 60, 200]];
    const input = await onePage();
    const { output } = await sign(input, drawn(loop));
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const { width, height } = drawingContent(loop);
    expect([width, height]).toEqual([346, 326]);
    const place = signaturePlace({ width: 595.28, height: 841.89 }, { width, height }, 'bottom-right', false);
    const box = changedBox((await pictures(input))[0]!, (await pictures(output))[0]!, { width: 595.28, height: 841.89 });
    // The changed pixels fill the form's box, less a pixel for drawing.
    expect(Math.abs(box.left - place.x)).toBeLessThan(2.5);
    expect(Math.abs(box.right - (place.x + place.width))).toBeLessThan(2.5);
    expect(Math.abs(box.bottom - place.y)).toBeLessThan(2.5);
    expect(Math.abs(box.top - (place.y + place.height))).toBeLessThan(2.5);
    expect((box.right - box.left) / (box.top - box.bottom)).toBeCloseTo(width / height, 1);
    const colour = await colours(output, 1, 2);
    // The loop's line at its leftmost point is black.
    const s = place.scale;
    expect(close(colour(place.x + 3 * s, place.y + (360 - 200 + 3) * s), [0, 0, 0], 60)).toBe(true);
  });

  it('turns y to count up: a stroke drawn at the top of the pad is at the top of the signature', async () => {
    // A long line at the top of the pad and a short tick at the bottom left.
    const drawing = [[100, 50, 900, 50], [100, 350, 150, 350]];
    const { output } = await sign(await onePage(), drawn(drawing));
    const { width, height } = drawingContent(drawing);
    const place = signaturePlace({ width: 595.28, height: 841.89 }, { width, height }, 'bottom-right', false);
    const colour = await colours(output, 1, 2);
    const s = place.scale;
    // The middle of the long line, near the top of the box, is black; the middle of the box's bottom edge is white.
    expect(close(colour(place.x + (500 - 100 + 3) * s, place.y + place.height - 3 * s), [0, 0, 0], 80)).toBe(true);
    expect(close(colour(place.x + (500 - 100 + 3) * s, place.y + 3 * s), [255, 255, 255], 20)).toBe(true);
  });

  it('a line of one point is a round dot the width of a full drawing\'s line, not scaled up to fill the signature box', async () => {
    const input = await onePage();
    const { output } = await sign(input, drawn([[500, 200]]));
    const content = drawingContent([[500, 200]]);
    expect([content.width, content.height]).toEqual([6, 6]);
    expect(content.content).toMatch(/ c\n/);
    expect(content.content).toMatch(/\nf\n/);
    // On A4 a full drawing's line is about 0.88 points; the dot is that wide, at the middle of its 59.5-point box.
    const a4 = { width: 595.28, height: 841.89 };
    const full = signaturePlace(a4, { width: pad.width + pad.line, height: pad.height + pad.line }, 'bottom-right', false);
    const fullLine = pad.line * full.scale;
    expect(fullLine).toBeCloseTo(0.879, 2);
    const place = signaturePlace(a4, content, 'bottom-right', false);
    expect(content.line * place.scale).toBeCloseTo(fullLine, 6);
    const scale = 8;
    const after = await render(output, 1, scale);
    const box = changed(await render(input, 1, scale), after);
    const w = (box.right - box.left) * after.width;
    const h = (box.bottom - box.top) * after.height;
    // About 7 pixels across at 8 pixels a point, not the 476 a dot filling its box would be.
    expect(Math.abs(w - h)).toBeLessThan(2);
    expect(w).toBeGreaterThan(fullLine * scale - 2.5);
    expect(w).toBeLessThan(fullLine * scale + 2.5);
    // At the middle of the box.
    expect(Math.abs(box.middleX * a4.width - (place.x + place.width / 2))).toBeLessThan(0.5);
  });
});

describe('the line\'s width', () => {
  it('is the pad\'s line for a drawing that fills the pad, and thinner for a smaller one, so on the page every drawing\'s line is as thick as a full drawing\'s at the same box, on every page size', () => {
    expect(drawingLine(pad.width + pad.line, pad.height + pad.line)).toBe(pad.line);
    // Larger than the pad never happens, but would not thicken the line.
    expect(drawingLine(5000, 5000)).toBe(pad.line);
    const drawings = [wave, [[60, 200, 120, 60, 260, 40, 380, 120]], [[500, 200, 510, 205]], [[500, 200]], [[0, 0, 1000, 0]], [[0, 0, 0, 400]]];
    for (const area of [{ width: 595.28, height: 841.89 }, { width: 297.64, height: 419.53 }, { width: 2383.94, height: 3370.39 }, { width: 841.89, height: 595.28 }]) {
      const full = pad.line * signaturePlace(area, { width: pad.width + pad.line, height: pad.height + pad.line }, 'bottom-right', false).scale;
      for (const drawing of drawings) {
        const content = drawingContent(drawing);
        const onPage = content.line * signaturePlace(area, content, 'bottom-right', false).scale;
        expect(onPage, JSON.stringify(drawing)).toBeCloseTo(full, 9);
        expect(content.content.startsWith(`q 0 G 0 g ${Number(content.line.toFixed(6))} w 1 J 1 j`), JSON.stringify(drawing)).toBe(true);
        // Never wider than the pad's line, so the round ends stay inside the box widened by half of it.
        expect(content.line).toBeLessThanOrEqual(pad.line);
      }
    }
  });
});

describe('a picture', { timeout: 60_000 }, () => {
  it('one that passed every check but that pdf-lib still cannot read is refused as a picture, a RangeError from a bad offset included; only running out of memory goes through unchanged', async () => {
    const lib = (await stampTools.pdflib!()) as typeof PdfLib;
    // pdf-lib reads every PNG and JPG that passes the checks before it, so its failures are made here, one at each step.
    const failing = (error: Error, at: 'for' | 'embed') => {
      const wrap = (real: { for(bytes: Uint8Array): Promise<{ width: number; height: number }> }) => ({
        for: async (bytes: Uint8Array) => {
          if (at === 'for') throw error;
          const { width, height } = await real.for(bytes);
          return { width, height, embedIntoContext: async () => { throw error; } };
        },
      });
      return { ...lib, PngEmbedder: wrap(lib.PngEmbedder), JpegEmbedder: wrap(lib.JpegEmbedder) } as unknown as typeof PdfLib;
    };
    for (const at of ['for', 'embed'] as const) {
      for (const bytes of [picture('alpha.png'), picture('turn-6.jpg')]) {
        const refused = await failure(pictureParts(bytes, failing(new Error('Corrupt picture data.'), at)));
        expect(refused?.name, at).toBe('PictureRefused');
        expect(failureKind(refused), at).toBe('picture-refused');
        // A RangeError the worker would not call running out of memory is the picture's fault.
        const range = new RangeError('Offset is outside the bounds of the DataView');
        expect(failureKind(range)).toBe('engine');
        expect((await failure(pictureParts(bytes, failing(range, at))))?.name, at).toBe('PictureRefused');
        const stack = new RangeError('Maximum call stack size exceeded');
        expect((await failure(pictureParts(bytes, failing(stack, at))))?.name, at).toBe('PictureRefused');
        // What the worker calls running out of memory goes through unchanged, so the page says so.
        for (const memory of [new Error('Array buffer allocation failed'), new RangeError('Invalid typed array length: 4294967296'), new RangeError('Array buffer allocation failed')]) {
          expect(failureKind(memory)).toBe('memory');
          expect(await failure(pictureParts(bytes, failing(memory, at))), at).toBe(memory);
        }
      }
    }
  });

  it('alpha.png: drawn at the place chosen with the page showing through its see-through parts', async () => {
    const input = await onePage([1, 0, 0]);
    const { output } = await sign(input, pictured(picture('alpha.png')));
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const place = signaturePlace({ width: 595.28, height: 841.89 }, { width: 240, height: 160 }, 'bottom-right', false);
    const s = place.scale;
    const at = (x: number, y: number) => [place.x + x * s, place.y + place.height - y * s] as const;
    const colour = await colours(output, 1, 3);
    // The opaque blue rectangle (20 to 140 across, 20 to 100 down) is blue; a see-through corner shows the red page.
    expect(colour(...at(60, 60))).toSatisfy((seen: number[]) => close(seen, [11, 79, 168]));
    expect(colour(...at(230, 10))).toSatisfy((seen: number[]) => close(seen, [255, 0, 0], 10));
    expect(colour(...at(5, 150))).toSatisfy((seen: number[]) => close(seen, [255, 0, 0], 10));
    // Half see-through red over red is red.
    expect(colour(...at(190, 130))).toSatisfy((seen: number[]) => close(seen, [255, 0, 0], 40));
    const { images } = await kinds(output);
    // The picture and its soft mask.
    expect(images).toHaveLength(2);
  });

  it.each(['turn-6.jpg', 'turn-3.jpg', 'turn-8.jpg', 'turn-6.png'])('%s is drawn upright, as a photo viewer shows it', async (name) => {
    // As make.mjs draws them: red top-left, green top-right, blue bottom-left, yellow bottom-right, once turned; 160 by 100 as shown.
    const corners = { tl: [220, 30, 30], tr: [30, 170, 60], bl: [40, 60, 220], br: [240, 210, 40] };
    const { output } = await sign(await onePage(), pictured(picture(name)));
    const place = signaturePlace({ width: 595.28, height: 841.89 }, { width: 160, height: 100 }, 'bottom-right', false);
    const colour = await colours(output, 1, 4);
    const inset = 6;
    const { x, y, width, height } = place;
    expect(colour(x + inset, y + height - inset), 'top-left').toSatisfy((seen: number[]) => close(seen, corners.tl));
    expect(colour(x + width - inset, y + height - inset), 'top-right').toSatisfy((seen: number[]) => close(seen, corners.tr));
    expect(colour(x + inset, y + inset), 'bottom-left').toSatisfy((seen: number[]) => close(seen, corners.bl));
    expect(colour(x + width - inset, y + inset), 'bottom-right').toSatisfy((seen: number[]) => close(seen, corners.br));
  });

  it('cmyk.jpg keeps its colours as Image to PDF draws them: /Decode kept, as it has an Adobe segment', async () => {
    const { output } = await sign(await onePage(), pictured(picture('cmyk.jpg')));
    const { images } = await kinds(output);
    expect(images).toHaveLength(1);
    expect(images[0]![1].stream!.dict).toMatchObject({ '/ColorSpace': '/DeviceCMYK', '/Decode': [1, 0, 1, 0, 1, 0, 1, 0], '/Filter': '/DCTDecode' });
    const place = signaturePlace({ width: 595.28, height: 841.89 }, { width: 200, height: 100 }, 'bottom-right', false);
    const colour = await colours(output, 1, 3);
    const image = await loadImage(Buffer.from(picture('cmyk.jpg')));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    for (const [px, py] of [[50, 25], [150, 25], [50, 75], [150, 75]] as const) {
      const wanted = [...context.getImageData(px, py, 1, 1).data].slice(0, 3);
      const seen = colour(place.x + px * place.scale, place.y + place.height - py * place.scale);
      // As in Image to PDF's test: each channel on the same side of the middle; inverted inks would put every one on the other.
      expect(seen.map((value) => value >= 128), `${px},${py}: ${seen} vs ${wanted}`).toEqual(wanted.map((value) => value >= 128));
    }
  });

  it('a CMYK JPG with no Adobe segment has its /Decode dropped, as Image to PDF does', async () => {
    // cmyk.jpg with its Adobe segment (APP14) taken out.
    const bytes = picture('cmyk.jpg');
    const parts: number[] = [0xff, 0xd8];
    let at = 2;
    while (at < bytes.length) {
      const marker = bytes[at + 1]!;
      if (marker === 0xda) {
        parts.push(...bytes.subarray(at));
        break;
      }
      const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
      if (marker !== 0xee) parts.push(...bytes.subarray(at, at + 2 + length));
      at += 2 + length;
    }
    const plain = new Uint8Array(parts);
    const parts2 = await pictureParts(plain, PdfLib);
    expect(parts2.image.entries.map(([key]) => key.asString())).not.toContain('/Decode');
    const withAdobe = await pictureParts(bytes, PdfLib);
    expect(withAdobe.image.entries.map(([key]) => key.asString())).toContain('/Decode');
  });

  it('details.jpg and details.png: no camera, date, place or SECRET- marker anywhere in the new file', async () => {
    for (const name of ['details.jpg', 'details.png', 'details-progressive.jpg']) {
      const { output } = await sign(fixture('text.pdf'), pictured(picture(name)));
      expect((await qpdfOn(output, ['--check'])).code).toBe(0);
      expect(Buffer.from(output).toString('latin1'), name).not.toMatch(/SECRET|Exif|xmpmeta|GPS/);
      const qpdf = await makeQpdf();
      qpdf.write('/in.pdf', output);
      qpdf.call(['--json=2', '--json-stream-data=inline', '--decode-level=generalized', '/in.pdf', '/out.json']);
      const json = new TextDecoder().decode(qpdf.read('/out.json'));
      // Every stream decoded and written as base64 in the JSON: look in each.
      const decoded = [...json.matchAll(/"data": "([A-Za-z0-9+/=]*)"/g)].map((match) => Buffer.from(match[1]!, 'base64').toString('latin1')).join('\n');
      expect(json + decoded, name).not.toMatch(/SECRET|xmpmeta/);
    }
  });

  it('pages-500.pdf signed on every page with a picture: all 500 pages show it, and the new file holds the picture, its soft mask and the signature form once', async () => {
    const input = fixture('pages-500.pdf');
    const { output, progress } = await sign(input, pictured(picture('alpha.png'), { page: 'every' }));
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const { images, forms, objects } = await kinds(output);
    expect(images).toHaveLength(2);
    const signatureForms = forms.filter(([, entry]) => JSON.stringify(entry.stream!.dict['/Resources']).includes('/Im'));
    expect(signatureForms).toHaveLength(1);
    // Each page's own layer draws that one form.
    const { pages } = await jsonOf(output);
    expect(pages).toHaveLength(500);
    const signatureId = signatureForms[0]![0].replace(/^obj:/, '');
    const layers = forms.filter(([, entry]) => Object.values((entry.stream!.dict['/Resources'] as { '/XObject'?: Record<string, string> })['/XObject'] ?? {}).includes(signatureId));
    expect(layers).toHaveLength(500);
    void objects;
    expect(progress.filter((step) => step.stage === 'working').at(-1)).toEqual({ stage: 'working', unit: 'page', done: 500, total: 500, writesAfter: true });
  }, 120_000);
});

// ---------------------------------------------------------------------------

const outline = async (bytes: Uint8Array) => (JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=outlines'])).out) as { outlines: { title: string; destpageposfrom1: number }[] }).outlines;
const attachments = async (bytes: Uint8Array) => Object.keys((JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=attachments'])).out) as { attachments: object }).attachments);
const fields = async (bytes: Uint8Array) =>
  (JSON.parse((await qpdfOn(bytes, ['--json=2', '--json-key=acroform'])).out) as { acroform: { fields: { fullname: string; value: unknown }[] } }).acroform.fields.map((field) => [field.fullname, field.value]);
const encryption = async (bytes: Uint8Array) => (await qpdfOn(bytes, ['--show-encryption'])).out;

/** The page objects of a file, by page order, with references left out (qpdf numbers objects afresh) and content streams by their text. */
async function pageObjects(bytes: Uint8Array) {
  const { pages, objects } = await jsonOf(bytes).catch(() => rawJsonOf(bytes));
  return pages.map((page) => {
    const dict = { ...(objects[`obj:${page.object}`]!.value as Record<string, unknown>) };
    delete dict['/Parent'];
    delete dict['/Contents'];
    return { dict: JSON.stringify(dict).replace(/"\d+ 0 R"/g, '"ref"'), contents: page.contents.map((id) => streamText(objects, id)) };
  });
}

/**
 * The checks for a file signed with a typed name on its last page: qpdf --check, the same page count, no password, the
 * last page's text as before followed by the name, every other page's text as before, and every other page's
 * object as in the plain copy: no layer, its own content alone.
 */
async function expectSignedLast(input: Uint8Array, output: Uint8Array, given?: string) {
  expect((await qpdfOn(output, ['--check'])).code).toBe(0);
  const plain = (await plainCopy(tools, input, given)).plain;
  const pages = Number((await qpdfOn(plain, ['--show-npages'])).out.trim());
  expect((await qpdfOn(output, ['--show-npages'])).out.trim()).toBe(String(pages));
  expect(await encryption(output)).toMatch(/File is not encrypted/);
  const before = await texts(plain);
  const after = await texts(output);
  expect(after).toHaveLength(pages);
  after.forEach((items, index) => {
    if (index === pages - 1) {
      expect(items.at(-1), `page ${index + 1}`).toBe(typedName);
      expect(items.slice(0, -1), `page ${index + 1}`).toEqual(before[index]);
    } else expect(items, `page ${index + 1}`).toEqual(before[index]);
  });
  const objectsBefore = await pageObjects(plain);
  const objectsAfter = await pageObjects(output);
  objectsAfter.forEach((page, index) => {
    if (index === pages - 1) {
      expect(page.contents.slice(1, -2), `page ${index + 1}`).toEqual(objectsBefore[index]!.contents);
      expect(page.contents[0]).toBe('q\n');
      expect(page.contents.at(-2)).toBe('\nQ\n');
    } else expect(page, `page ${index + 1}`).toEqual(objectsBefore[index]);
  });
}

// Real runs through qpdf, pdf-lib and PDF.js: slow on a busy machine, so each test has a minute.
describe('signing the shared test set with a typed name on the last page', { timeout: 60_000 }, () => {
  it('text.pdf: the name on the last page only, with progress for reading and writing, no page count, and nothing typed in a progress message', async () => {
    const input = fixture('text.pdf');
    const { output, progress } = await sign(input, typed());
    await expectSignedLast(input, output);
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    expect(progress.filter((step) => step.stage === 'working')).toEqual([]);
    const writing = progress.filter((step) => step.stage === 'writing').map((step) => (step as { percent: number }).percent);
    expect(writing.at(-1)).toBe(100);
    expect(writing.slice(0, -1).every((percent) => percent >= 75 && percent <= 95)).toBe(true);
    const { progressFraction } = await import('../../src/widget/format');
    const fractions = progress.map(progressFraction);
    expect(fractions.slice(0, -1).every((fraction) => fraction < 1)).toBe(true);
    let highest = 0;
    for (const fraction of fractions) {
      expect(fraction).toBeGreaterThanOrEqual(highest - 1e-9);
      highest = Math.max(highest, fraction);
    }
    expect(JSON.stringify(progress)).not.toContain('Jane');
  });

  it('every page: "Page n of m" for each page, then writing', async () => {
    const { progress } = await sign(fixture('text.pdf'), typed(typedName, { page: 'every' }));
    expect(progress.filter((step) => step.stage === 'working')).toEqual([1, 2, 3].map((done) => ({ stage: 'working', unit: 'page', done, total: 3, writesAfter: true })));
  });

  it('first page: only the first page carries it; a one-page file carries it once whichever pages are chosen', async () => {
    const input = fixture('text.pdf');
    const { output } = await sign(input, typed(typedName, { page: 'first' }));
    const pages = await texts(output);
    expect(pages[0]!.at(-1)).toBe(typedName);
    expect(pages[1]!.at(-1)).not.toBe(typedName);
    expect(pages[2]!.at(-1)).not.toBe(typedName);
    const one = await onePage();
    for (const page of ['last', 'first', 'every']) {
      const signed = (await sign(one, typed(typedName, { page }))).output;
      expect((await texts(signed))[0], page).toEqual([typedName]);
    }
  });

  it('mixed.pdf signed on every page at the bottom right, each way: upright at each page\'s bottom right as PDF.js shows it, inside its margin, with no stored turn or box changed', async () => {
    const input = fixture('mixed.pdf');
    const before = await pictures(input);
    const doc = await open(input);
    const shown: { width: number; height: number }[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const viewport = (await doc.getPage(number)).getViewport({ scale: 1 });
      shown.push({ width: viewport.width, height: viewport.height });
    }
    await doc.loadingTask.destroy();
    for (const options of [drawn(wave, { page: 'every' }), typed(typedName, { page: 'every' }), pictured(picture('turn-6.jpg'), { page: 'every' })]) {
      const { output } = await sign(input, options);
      expect((await qpdfOn(output, ['--check'])).code).toBe(0);
      const after = await pictures(output);
      after.forEach((pictureAfter, index) => {
        const label = `${String(options.source)}, page ${index + 1}`;
        const size = shown[index]!;
        const m = Math.min(size.width, size.height) / 20;
        const box = changedBox(before[index]!, pictureAfter, size);
        // A point of the page is under a pixel at this scale, so a pixel and a half of room.
        const pixel = size.width / pictureAfter.width;
        expect(box.n, label).toBeGreaterThan(20);
        expect(box.right, label).toBeLessThanOrEqual(size.width - m + 1.5 * pixel);
        expect(box.bottom, label).toBeGreaterThanOrEqual(m - 1.5 * pixel);
        expect(box.left, label).toBeGreaterThan(size.width / 2);
        expect(box.top, label).toBeLessThan(size.height / 4);
        if (options.source !== 'type') {
          // A drawing and a picture fill their box: their right and bottom edges are on the margin.
          expect(size.width - m - box.right, label).toBeLessThan(2 * pixel);
          expect(box.bottom - m, label).toBeLessThan(2 * pixel);
        }
      });
      expect(await storedPlaces(output)).toEqual(await storedPlaces(input));
    }
    // Typed upright: the name's text runs left to right as each page is shown.
    const { output } = await sign(input, typed(typedName, { page: 'every' }));
    const opened = await open(output);
    for (let number = 1; number <= opened.numPages; number++) {
      const page = await opened.getPage(number);
      const [p, q, r, s] = page.getViewport({ scale: 1 }).transform as [number, number, number, number];
      const items = (await page.getTextContent()).items.filter((item) => 'str' in item && item.str === typedName) as { transform: number[] }[];
      expect(items).toHaveLength(1);
      const [a, b] = items[0]!.transform as [number, number];
      const angle = (Math.atan2(-(q * a + s * b), p * a + r * b) * 180) / Math.PI;
      expect(Math.abs(angle), `page ${number}`).toBeLessThan(0.5);
    }
    await opened.loadingTask.destroy();
  });

  it('every page at the top left: each page carries the signature at its top left as shown', async () => {
    const input = fixture('mixed.pdf');
    const before = await pictures(input);
    const { output } = await sign(input, drawn(wave, { page: 'every', position: 'top-left' }));
    const after = await pictures(output);
    after.forEach((pictureAfter, index) => {
      const box = changed(before[index]!, pictureAfter);
      expect(box.left, `page ${index + 1}`).toBeLessThan(0.5);
      expect(box.top, `page ${index + 1}`).toBeLessThan(0.25);
      const shorter = Math.min(pictureAfter.width, pictureAfter.height);
      expect(box.left * pictureAfter.width).toBeGreaterThanOrEqual(shorter / 20 - 1.5);
      expect(box.top * pictureAfter.height).toBeGreaterThanOrEqual(shorter / 20 - 1.5);
    });
  });

  it('a page whose crop box shows part of its paper: placed inside the part shown', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    page.setCropBox(100, 100, 300, 400);
    const input = await doc.save({ useObjectStreams: false });
    const { output } = await sign(input, drawn());
    const before = (await pictures(input))[0]!;
    const after = (await pictures(output))[0]!;
    // Shown 300 by 400: the margin is 15 points.
    const box = changedBox(before, after, { width: 300, height: 400 });
    expect(box.right).toBeLessThanOrEqual(300 - 15 + 1);
    expect(box.right).toBeGreaterThan(300 - 15 - 2);
    expect(box.bottom).toBeGreaterThanOrEqual(15 - 1);
    expect(box.right - box.left).toBeCloseTo(0.3 * 300, -0.5);
  });

  it('scanned.pdf: the signature shows over the picture', async () => {
    const input = fixture('scanned.pdf');
    const { output } = await sign(input, drawn());
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const before = await pictures(input);
    const after = await pictures(output);
    const box = changed(before.at(-1)!, after.at(-1)!);
    expect(box.n).toBeGreaterThan(100);
    expect(box.left).toBeGreaterThan(0.5);
    expect(box.top).toBeGreaterThan(0.75);
    // Earlier pages are not changed.
    for (let index = 0; index < before.length - 1; index++) expect(changed(before[index]!, after[index]!).n).toBe(0);
    await expectSignedLast(input, (await sign(input, typed())).output);
  });

  it('pages-500.pdf, warning.pdf and images.pdf', async () => {
    for (const name of ['pages-500.pdf', 'warning.pdf', 'images.pdf']) {
      const input = fixture(name);
      await expectSignedLast(input, (await sign(input, typed())).output);
    }
  }, 120_000);

  it('password.pdf with its password, and restricted.pdf: back with no password and no restrictions', async () => {
    await expect(sign(fixture('password.pdf'), typed())).rejects.toThrow();
    await expect(sign(fixture('password.pdf'), typed(), tools, ['wrong'])).rejects.toThrow();
    const { output } = await sign(fixture('password.pdf'), typed(), tools, [password]);
    await expectSignedLast(fixture('password.pdf'), output, password);
    expect(await encryption(fixture('restricted.pdf'))).toMatch(/print/i);
    await expectSignedLast(fixture('restricted.pdf'), (await sign(fixture('restricted.pdf'), typed())).output);
  });

  it('rich.pdf keeps its bookmarks, link and note.txt', async () => {
    const input = fixture('rich.pdf');
    const { output } = await sign(input, typed());
    await expectSignedLast(input, output);
    expect((await outline(output)).map((item) => [item.title, item.destpageposfrom1])).toEqual([['Chapter one', 1], ['Chapter two', 2]]);
    expect(await attachments(output)).toEqual(['note.txt']);
    const links = (json: Awaited<ReturnType<typeof jsonOf>>) => Object.values(json.objects).filter((entry) => (entry.value as Record<string, unknown> | undefined)?.['/Subtype'] === '/Link');
    expect(links(await jsonOf(output)).map((entry) => JSON.stringify((entry.value as Record<string, unknown>)['/A']))).toEqual(
      links(await jsonOf(input)).map((entry) => JSON.stringify((entry.value as Record<string, unknown>)['/A'])),
    );
  });

  it('form.pdf keeps its fields and their values', async () => {
    const input = fixture('form.pdf');
    const { output } = await sign(input, typed());
    await expectSignedLast(input, output);
    expect(await fields(output)).toEqual(await fields(input));
    expect(JSON.stringify(await fields(output))).toContain('Sample text');
  });

  it('tagged.pdf keeps its tags, destination, thread and fields; the signature is in no tag', async () => {
    const input = fixture('tagged.pdf');
    const { output } = await sign(input, typed());
    await expectSignedLast(input, output);
    const before = await jsonOf(input);
    const after = await jsonOf(output);
    const all = (json: typeof before) => JSON.stringify(json.objects);
    for (const kept of ['SECRET-ALT-TEXT', 'SECRET-ACTUAL-TEXT', 'SECRET-DEST-NAME', 'SECRET-THREAD-TITLE', 'SECRET-NOTE', 'SECRET-LINK', '/StructTreeRoot', '/Threads', '/Dests']) {
      expect(all(after), kept).toContain(kept);
    }
    const kinds2 = (json: typeof before) =>
      Object.values(json.objects)
        .map((entry) => (entry.value as Record<string, unknown> | undefined)?.['/S'])
        .filter(Boolean)
        .sort();
    expect(kinds2(after)).toEqual(kinds2(before));
    expect(await fields(output)).toEqual(await fields(input));
  });

  it('a page whose text is tied to its tags by MCID: every tagged MCID still in its page\'s own streams, unchanged, and PDF.js finds the tagged text from its tags, with no signature in it', async () => {
    const input = await taggedPage();
    const { output } = await sign(input, typed());
    expect((await qpdfOn(output, ['--check'])).code).toBe(0);
    const before = await jsonOf(input);
    const after = await jsonOf(output);
    const own = before.pages[0]!.contents.map((id) => streamText(before.objects, id));
    const ownAfter = after.pages[0]!.contents.slice(1, -2).map((id) => streamText(after.objects, id));
    expect(ownAfter).toEqual(own);
    for (const mcid of [0, 1]) expect(ownAfter.join('\n')).toMatch(new RegExp(`/MCID ${mcid}\\b`));
    const dictOf = (json: typeof before) => json.objects[`obj:${json.pages[0]!.object}`]!.value as Record<string, unknown>;
    expect(dictOf(after)['/StructParents']).toEqual(dictOf(before)['/StructParents']);
    const doc = await open(output);
    const page = await doc.getPage(1);
    const content = await page.getTextContent({ includeMarkedContent: true });
    const found: Record<string, string> = {};
    let inside: string | null = null;
    for (const item of content.items) {
      if ('type' in item) {
        if (item.type === 'beginMarkedContentProps') inside = item.id ?? null;
        else if (item.type === 'endMarkedContent') inside = null;
      } else if (inside) found[inside] = (found[inside] ?? '') + item.str;
    }
    await doc.loadingTask.destroy();
    expect(Object.values(found)).toEqual(['Hello tagged', 'Second part']);
  });

  it("keeps the document's details", async () => {
    const details = async (bytes: Uint8Array) => {
      const opened = await open(bytes);
      const { info } = await opened.getMetadata();
      await opened.loadingTask.destroy();
      const { Title, Author, Subject, Keywords, Creator, Producer, CreationDate, ModDate } = info as Record<string, unknown>;
      return { Title, Author, Subject, Keywords, Creator, Producer, CreationDate, ModDate };
    };
    for (const input of [fixture('tagged.pdf'), fixture('rich.pdf'), fixture('form.pdf')]) {
      const before = await details(input);
      expect(before.Title).toBeTruthy();
      expect(await details((await sign(input, typed())).output)).toEqual(before);
    }
  });

  it('damaged files and a file that is not a PDF: read as damaged before any job, and a run on one fails as the engine failure', async () => {
    for (const name of ['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']) {
      expect(await inspect(fixture(name), undefined, tools), name).toMatchObject({ kind: 'damaged' });
      const error = await failure(sign(fixture(name), typed()));
      expect(error, name).toBeInstanceOf(Error);
      expect(failureKind(error), name).toBe('engine');
    }
  });

  it('every other file in the set: signed and checked, or a failure', async () => {
    const covered = new Set(['text.pdf', 'mixed.pdf', 'pages-500.pdf', 'scanned.pdf', 'warning.pdf', 'images.pdf', 'password.pdf', 'restricted.pdf', 'rich.pdf', 'form.pdf', 'tagged.pdf', 'damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']);
    const others = readdirSync(join(__dirname, '../fixtures')).filter((name) => name.endsWith('.pdf') && !covered.has(name));
    expect(others.sort()).toEqual([
      'chinese-unembedded.pdf',
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
      'multilingual.pdf',
    ]);
    for (const name of others) {
      const input = fixture(name);
      if (name === 'compress-json-bomb.pdf') {
        await expect(sign(input, typed()), name).rejects.toThrow('The pages could not be read.');
        continue;
      }
      const given = name === 'compress-password.pdf' ? password : undefined;
      await expectSignedLast(input, (await sign(input, typed(), tools, [given])).output, given);
    }
  }, 180_000);
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

async function packed(bytes: Uint8Array): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  expect(qpdf.call(['/in.pdf', '--object-streams=generate', '--compression-level=9', '/out.pdf']).code).toBe(0);
  return qpdf.read('/out.pdf');
}

/** A PNG of 8-bit RGB, each row filtered by Sub so a smooth picture packs well, made from a pixel function. */
function makePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Uint8Array {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 1;
    let previous = [0, 0, 0];
    for (let x = 0; x < width; x++) {
      const value = pixel(x, y);
      for (let c = 0; c < 3; c++) {
        raw[y * row + 1 + x * 3 + c] = (value[c]! - previous[c]! + 256) & 0xff;
      }
      previous = value;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]),
  );
}

/** A photo of a signature on paper: a paper-coloured gradient with a dark pen stroke across it. `noise` adds grain, as a camera's. */
function paperPng(width: number, height: number, noise = 0): Uint8Array {
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  return makePng(width, height, (x, y) => {
    const onStroke = Math.abs(y - height / 2 - (height / 6) * Math.sin((x / width) * Math.PI * 4)) < height / 80;
    const base = onStroke ? [30, 30, 40] : [235 - (x / width) * 20, 230 - (y / height) * 20, 215 - ((x + y) / (width + height)) * 20];
    const grain = noise ? random() * noise : 0;
    return base.map((value) => Math.max(0, Math.min(255, Math.round(value + grain)))) as [number, number, number];
  });
}

describe('content that tries to move the signature, long files and large pictures', { timeout: 60_000 }, () => {
  it('a page that leaves a low opacity, a scaling cm and a red fill set: the signature keeps its place, size and colour', async () => {
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
    for (const options of [drawn(), typed(), pictured(picture('alpha.png'))]) {
      const clean = changed(blank, (await pictures((await sign(plain, options)).output))[0]!);
      const kept = changed(blank, (await pictures((await sign(hostile, options)).output))[0]!);
      expect(kept, String(options.source)).toEqual(clean);
    }
    const drawnClean = await colours((await sign(plain, drawn())).output, 1, 2);
    const drawnHostile = await colours((await sign(hostile, drawn())).output, 1, 2);
    const place = signaturePlace({ width: 595.28, height: 841.89 }, drawingContent(wave), 'bottom-right', false);
    const at = [place.x + (20 - 20 + 3) * place.scale, place.y + (310 - 200 + 3) * place.scale] as const;
    expect(drawnHostile(...at)).toEqual(drawnClean(...at));
    expect(close(drawnClean(...at), [0, 0, 0], 80)).toBe(true);
  });

  it('thousands of pages that share one tiny content stream, signed on every page: done quickly, the stream still one and unchanged, growing by a few hundred bytes a page', async () => {
    const pages = 6000;
    const input = await packed(handMade(pages));
    const started = Date.now();
    const { output, progress } = await sign(input, drawn(wave, { page: 'every' }));
    const seconds = (Date.now() - started) / 1000;
    expect(progress.filter((step) => step.stage === 'working').at(-1)).toMatchObject({ done: pages, total: pages });
    expect(seconds).toBeLessThan(40);
    expect((output.length - input.length) / pages).toBeLessThan(300);
    const { pages: list, objects } = await jsonOf(output);
    expect(list).toHaveLength(pages);
    const shared = new Set(list.map((page) => page.contents[1]));
    expect(shared.size).toBe(1);
    expect(streamText(objects, [...shared][0]!)).toBe('0 0 0 rg 20 20 160 160 re f');
  }, 120_000);

  it('a drawing at its 20,000-point limit, a typed name and a picture, on every page of 2,100 (two runs of the drawing step): the signature\'s form, and the picture, written once', async () => {
    const rule = optionDrawings['sign-pdf']!.drawing!;
    // 200 lines of 100 points each, zigzags across the pad with odd steps, so the form's numbers are long: about 190 KB.
    const largest = Array.from({ length: rule.maxLines }, (_, line) =>
      Array.from({ length: (rule.maxPoints / rule.maxLines) * 2 }, (_, index) => (index % 2 === 0 ? (line * 7 + index * 37) % 1001 : (line * 3 + index * 13) % 401)));
    expect(largest.reduce((sum, line) => sum + line.length / 2, 0)).toBe(rule.maxPoints);
    const formSize = drawingContent(largest).content.length;
    // Well past the 64 KB above which the drawing step knows a stream by its bytes' identity, not its text.
    expect(formSize).toBeGreaterThan(150 * 1024);
    const input = await packed(handMade(2100));
    const signature = /^q 0 G 0 g |^q 0 g BT \/F1 |\/Im Do Q\n$/;
    for (const [what, options] of [
      ['the largest drawing', drawn(largest, { page: 'every' })],
      ['a typed name', typed(undefined, { page: 'every' })],
      ['alpha.png', pictured(picture('alpha.png'), { page: 'every' })],
    ] as const) {
      const { output, progress } = await sign(input, options);
      expect(progress.filter((step) => step.stage === 'working').at(-1), what).toMatchObject({ done: 2100, total: 2100 });
      expect((await qpdfOn(output, ['--check'])).code, what).toBe(0);
      const { forms, images, objects } = await kinds(output);
      const signed = forms.filter(([id]) => signature.test(streamText(objects, id.replace(/^obj:/, ''))));
      expect(signed, what).toHaveLength(1);
      // alpha.png is its picture and its soft mask, each once.
      expect(images, what).toHaveLength(what === 'alpha.png' ? 2 : 0);
      if (what === 'alpha.png') expect(images.filter(([, entry]) => '/SMask' in entry.stream!.dict)).toHaveLength(1);
      if (what === 'the largest drawing') {
        expect(streamText(objects, signed[0]![0].replace(/^obj:/, ''))).toBe(drawingContent(largest).content);
        // The form once, and a few hundred bytes a page for each page's layer.
        expect(output.length - input.length).toBeLessThan(formSize + 2100 * 400 + 64 * 1024);
      }
    }
  }, 240_000);

  it('a 16-million-pixel gradient PNG, a photo of paper: decoded and compressed once per job, written once and compressed, on the last page of a small file and on every page of 2,100', async () => {
    const png = paperPng(4000, 4000);
    expect(pictureOutcome(png, pictureRule('sign-pdf', 'picture', optionPictures)!, { Inflate })).toEqual({ kind: 'ready', pixels: 16_000_000 });
    const lib = (await stampTools.pdflib!()) as typeof PdfLib;
    const encoded = (await pictureParts(png, lib)).image.bytes.length;
    for (const [what, input, page] of [
      ['the last page of text.pdf', fixture('text.pdf'), 'last'],
      ['every page of 2,100', await packed(handMade(2100)), 'every'],
    ] as const) {
      const decode = vi.fn(lib.PngEmbedder.for.bind(lib.PngEmbedder));
      const compress = vi.spyOn(lib.PDFContext.prototype, 'flateStream');
      const counted: EngineTools = { ...tools, pdflib: async () => ({ ...lib, PngEmbedder: { for: decode } }) };
      const started = Date.now();
      const { output } = await sign(input, pictured(png, { page }), counted);
      const seconds = (Date.now() - started) / 1000;
      expect(decode, what).toHaveBeenCalledTimes(1);
      // The picture has no see-through part, so one stream is compressed: once per job, not once per run.
      expect(compress, what).toHaveBeenCalledTimes(1);
      compress.mockRestore();
      expect((await qpdfOn(output, ['--check'])).code).toBe(0);
      const qpdf = await makeQpdf();
      qpdf.write('/in.pdf', output);
      qpdf.call(['--json=2', '--json-key=qpdf', '--json-stream-data=none', '/in.pdf', '/out.json']);
      const json = JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as { qpdf: [unknown, Record<string, { stream?: { dict: Record<string, unknown> } }>] };
      const images = Object.values(json.qpdf[1]).filter((entry) => entry.stream?.dict['/Subtype'] === '/Image');
      expect(images, what).toHaveLength(1);
      expect(images[0]!.stream!.dict['/Filter']).toBe('/FlateDecode');
      expect(images[0]!.stream!.dict['/Length'] as number).toBeLessThanOrEqual(encoded);
      expect(output.length - input.length, what).toBeLessThan(encoded + (page === 'every' ? 2100 * 400 : 0) + 64 * 1024);
      console.log(`16 MP gradient PNG, ${what}: picture ${encoded} bytes encoded, ${input.length} to ${output.length} bytes, ${seconds.toFixed(1)} s, peak resident memory so far ${(process.resourceUsage().maxRSS / 1048576).toFixed(2)} GB`);
    }
  }, 240_000);

  it('a picture whose encoded size alone passes the size budget of a small file: PictureTooLarge before any run is drawn', async () => {
    // Noise does not pack: about 19 MB encoded, past the 16 MB and twice a few kilobytes of text.pdf's budget.
    const noise = randomBytes(2600 * 2400 * 3);
    const noisy = makePng(2600, 2400, (x, y) => {
      const at = (y * 2600 + x) * 3;
      return [noise[at]!, noise[at + 1]!, noise[at + 2]!];
    });
    const lib = (await stampTools.pdflib!()) as typeof PdfLib;
    let documents = 0;
    const counted: EngineTools = {
      ...tools,
      pdflib: async () => ({
        ...lib,
        PDFDocument: { create: (...args: Parameters<typeof lib.PDFDocument.create>) => (documents++, lib.PDFDocument.create(...args)) },
      }),
    };
    const error = await failure(sign(fixture('text.pdf'), pictured(noisy), counted));
    expect(error?.name).toBe('PictureTooLarge');
    expect(failureKind(error)).toBe('picture-too-large');
    expect(error!.message).toBe('The picture is too large to place.');
    // The scratch document that read the picture, and no run's document.
    expect(documents).toBe(1);
  }, 120_000);
});

describe('reading the chosen picture before the job', () => {
  it('gives each picture in tests/fixtures/pictures/ its outcome under the tool\'s rule, as add-picture-option records them; another key is damaged', async () => {
    const rule = pictureRule('sign-pdf', 'picture', optionPictures)!;
    expect(rule).toEqual({ types: ['image/jpeg', 'image/png'], noticeBytes: 8 * 1024 * 1024, noticePixels: 16_000_000 });
    const names = readdirSync(join(__dirname, '../fixtures/pictures'));
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) {
      expect(await inspectPicture('picture', picture(name), tools), name).toEqual(pictureOutcome(picture(name), rule, { Inflate }));
    }
    expect(await inspectPicture('picture', picture('alpha.png'), tools)).toEqual({ kind: 'ready', pixels: 38_400 });
    expect(await inspectPicture('picture', picture('arithmetic.jpg'), tools)).toEqual({ kind: 'unsupported' });
    expect(await inspectPicture('picture', picture('broken.png'), tools)).toEqual({ kind: 'damaged' });
    expect(await inspectPicture('picture', picture('data-bomb.png'), tools)).toEqual({ kind: 'damaged' });
    expect(await inspectPicture('picture', picture('huge.png'), tools)).toEqual({ kind: 'ready', pixels: 256_000_000 });
    expect(await inspectPicture('drawing', picture('alpha.png'), tools)).toEqual({ kind: 'damaged' });
    expect(await inspectPicture('__proto__', picture('alpha.png'), tools)).toEqual({ kind: 'damaged' });
  });

  it('asks for fflate for a JPG as for a PNG', async () => {
    let asked = 0;
    const given: EngineTools = { fflate: async () => (asked++, { Inflate }) };
    await inspectPicture('picture', picture('tall.jpg'), given);
    await inspectPicture('picture', picture('small.png'), given);
    expect(asked).toBe(2);
  });
});
