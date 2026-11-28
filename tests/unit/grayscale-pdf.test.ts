// Grayscale PDF's engine, run in Node with the browser's qpdf and fflate, and judged by PDF.js (legacy build, drawing
// through @napi-rs/canvas) and qpdf. Expected greys are worked out here from the known colours (design decision 2),
// never from the engine's exports. No request is made: fetch is replaced by a function that throws and records.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maxContentBytes, PageTooLarge } from '../../src/engines/content';
import { OutputLimit } from '../../src/engines/qpdf';
import { contentBudget, makeRun } from '../../src/engines/tools/grayscale-pdf';
import { failureSentence } from '../../src/widget/failures';
import { failureKind } from '../../src/workers/worker-core';
import { latin1, pdfOf, type PdfObject } from './content-helpers';
import {
  allNeutral,
  at,
  build,
  canonical,
  cmykGrey,
  compare,
  draw,
  failure,
  flated,
  grey,
  luminosity,
  objectsOf,
  operatorsWithoutColour,
  rawStreams,
  textItems,
  tools,
} from './grayscale-helpers';
import { pageStreams, qpdfOn } from './stamp-helpers';

const fixtureDir = join(__dirname, '../fixtures');
const fixture = (name: string) => new Uint8Array(readFileSync(join(fixtureDir, name)));
const password = 'open-sesame';

// Every request this file could make is refused and recorded.
const asked: string[] = [];
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    asked.push(String(input));
    throw new Error('No request may be made.');
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  expect(asked).toEqual([]);
});

/** Every page's content streams, decoded, as text. */
const contents = (bytes: Uint8Array, given?: string) => pageStreams(bytes, given);

/** The checks every result passes (decision 5 and the spec's "What the new file keeps"). */
async function expectKept(input: Uint8Array, output: Uint8Array, given?: string) {
  expect((await qpdfOn(output, ['--check'])).code).toBe(0);
  const encryption = await qpdfOn(output, ['--show-encryption']);
  expect(encryption.out).toMatch(/File is not encrypted/);
  expect(await textItems(output)).toEqual(await textItems(input, given));
  expect(await operatorsWithoutColour(output)).toEqual(await operatorsWithoutColour(input, given));
  const before = await contents(input, given);
  const after = await contents(output);
  expect(after.length).toBe(before.length);
  after.forEach((streams, page) => {
    expect(canonical(streams.join('\n')), `page ${page + 1}`).toEqual(canonical(before[page]!.join('\n')));
  });
  // No edited stream keeps sc or SC: every content stream that changed holds none.
  after.forEach((streams, page) => {
    streams.forEach((text, index) => {
      if (text !== before[page]![index]) expect(/(^|[\s\]])(sc|SC)(?=[\s[(/<]|$)/.test(text), `page ${page + 1} stream ${index + 1}`).toBe(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Every file in the test set.

const fixtures = readdirSync(fixtureDir).filter((name) => name.endsWith('.pdf')).sort();
const withPassword = new Set(['password.pdf', 'compress-password.pdf']);

/** What Grayscale does with each file of the shared test set, as recorded in tests/fixtures/README.md. */
const expected: Record<string, 'grey' | 'none' | 'fails'> = {
  'chinese-unembedded.pdf': 'none',
  'compress-bomb-attachment.pdf': 'grey',
  'compress-flate-bomb.pdf': 'grey',
  'compress-jpeg-mismatch.pdf': 'grey',
  'compress-json-bomb.pdf': 'fails',
  'compress-kinds.pdf': 'grey',
  'compress-lossless.pdf': 'grey',
  'compress-packed.pdf': 'grey',
  'compress-password.pdf': 'grey',
  'compress-scans.pdf': 'grey',
  'compress-small-jpg.pdf': 'grey',
  'compress-text.pdf': 'none',
  'damaged-cut.pdf': 'fails',
  'damaged-xref.pdf': 'fails',
  'form.pdf': 'grey',
  'grey-only.pdf': 'none',
  'images.pdf': 'grey',
  'mixed.pdf': 'grey',
  'multilingual.pdf': 'grey',
  'not-a-pdf.pdf': 'fails',
  'pages-500.pdf': 'grey',
  'password.pdf': 'grey',
  'restricted.pdf': 'grey',
  'rich.pdf': 'grey',
  'scanned.pdf': 'grey',
  'tagged.pdf': 'grey',
  'text.pdf': 'grey',
  'warning.pdf': 'grey',
};

describe('Grayscale PDF on every file in the test set', () => {
  it('lists every fixture', () => {
    expect(fixtures).toEqual(Object.keys(expected).sort());
  });

  for (const name of fixtures) {
    it(`${name}: ${expected[name]}`, { timeout: 300_000 }, async () => {
      const bytes = fixture(name);
      const given = withPassword.has(name) ? password : undefined;
      if (expected[name] === 'fails') {
        expect(await failure(grey(bytes, { password: given }))).toBeInstanceOf(Error);
        return;
      }
      const { outputs, output } = await grey(bytes, { password: given });
      if (expected[name] === 'none') {
        expect(outputs).toEqual([]);
        return;
      }
      expect(outputs).toHaveLength(1);
      // The bombs are never decoded: their content is checked by their own tests (Compress PDF's).
      if (name === 'compress-bomb-attachment.pdf' || name === 'compress-flate-bomb.pdf' || name === 'pages-500.pdf') {
        expect((await qpdfOn(output!, ['--check'])).code).toBe(0);
        return;
      }
      await expectKept(bytes, output!, given);
      // Every page drawn neutral.
      for (const page of await draw(output!)) expect(allNeutral(page, 3)).toBe(true);
    });
  }

  it('a protected file needs its password, and the result has none and no restrictions', async () => {
    expect(await failure(grey(fixture('password.pdf')))).toBeInstanceOf(Error);
    const { output } = await grey(fixture('password.pdf'), { password });
    expect((await qpdfOn(output!, ['--show-encryption'])).out).toMatch(/File is not encrypted/);
  });

  it('grey-only.pdf gives no file: its RGB group, soft mask backdrop, default space, output intent and colour thumbnail do not count', async () => {
    expect((await grey(fixture('grey-only.pdf'))).outputs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RGB, by the four operators and named spaces.

const helvetica = '/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>';

describe('RGB drawing turns grey', () => {
  it('rg and RG become the stand-in with their numbers, drawn as greys of 0.3 and 0.11', async () => {
    const input = build({ pages: [{ resources: `<< ${helvetica} >>`, contents: ['1 0 0 rg 20 20 80 80 re f 0 0 1 RG 10 w 120 40 m 180 160 l S BT /F1 24 Tf 1 0 0 rg 20 150 Td (Red) Tj ET'] }] });
    const { output } = await grey(input);
    const [text] = await contents(output!);
    expect(text!.join('')).toContain('/GreyRGB cs 1 0 0  scn');
    expect(text!.join('')).toContain('/GreyRGB CS 0 0 1  SCN');
    const [page] = await draw(output!);
    for (const value of at(page!, 60, 140)) expect(Math.abs(value - 0.3 * 255)).toBeLessThanOrEqual(2);
    expect(allNeutral(page!)).toBe(true);
    await expectKept(input, output!);
  });
});

/** A picture stream of RGB samples, `width` by `height`, each pixel from `colour`. */
function rgbSamples(width: number, height: number, colour: (x: number, y: number) => [number, number, number]): Uint8Array {
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(colour(x, y), (y * width + x) * 3);
  return out;
}
const rainbow = (x: number, y: number): [number, number, number] => [(x * 37) & 255, (y * 53) & 255, ((x + y) * 29) & 255];

describe('RGB pictures, shadings and patterns turn grey, their data unchanged', () => {
  it('pictures stored without loss, 16-bit, indexed, with a colour-key mask and with a soft mask carrying /Matte', async () => {
    const samples = rgbSamples(16, 16, rainbow);
    const sixteen = new Uint8Array(16 * 16 * 6);
    samples.forEach((value, index) => sixteen.set([value, value], index * 2));
    const palette = Array.from({ length: 8 }, (_, index) => [index * 30, 255 - index * 30, (index * 70) & 255]).flat();
    const indices = new Uint8Array(256).map((_, index) => index % 8);
    const alpha = new Uint8Array(256).fill(200);
    const input = build({
      objects: [
        flated('/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8', samples),
        flated('/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 16', sixteen),
        flated(`/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace [/Indexed /DeviceRGB 7 <${Buffer.from(palette).toString('hex')}>] /BitsPerComponent 8`, indices),
        flated('/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Mask [0 40 0 255 0 255]', samples),
        flated('/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceGray /BitsPerComponent 8', alpha),
        flated('/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 7 0 R', samples),
      ],
      pages: [{ resources: '<< /XObject << /A 3 0 R /B 4 0 R /C 5 0 R /D 6 0 R /E 8 0 R >> >>', contents: ['q 80 0 0 80 10 110 cm /A Do Q q 80 0 0 80 110 110 cm /B Do Q q 80 0 0 80 10 10 cm /C Do Q q 80 0 0 80 110 10 cm /D Do Q q 40 0 0 40 80 80 cm /E Do Q'] }],
    });
    const { output } = await grey(input);
    const [before] = await draw(input);
    const [after] = await draw(output!);
    const seen = compare(before!, after!);
    expect(seen.neutral).toBeLessThanOrEqual(2);
    expect(seen.mean).toBeLessThanOrEqual(2);
    expect(seen.most).toBeLessThanOrEqual(6);
    // Each picture's data is unchanged; only its /ColorSpace now names the stand-in.
    const [rawBefore, rawAfter] = [await rawStreams(input), await rawStreams(output!)];
    const dataOf = (raw: Map<string, string>) => [...raw.values()].sort();
    for (const data of dataOf(rawBefore).filter((value) => value.length > 400)) expect(dataOf(rawAfter)).toContain(data);
    await expectKept(input, output!);
  });

  it('an RGB JPG is repointed with its data unchanged and drawn neutral', async () => {
    const jpg = new Uint8Array(readFileSync(join(fixtureDir, 'pictures', 'p3.jpg')));
    const input = build({
      objects: [{ dict: '/Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', data: jpg }],
      pages: [{ resources: '<< /XObject << /J 3 0 R >> >>', contents: ['q 180 0 0 180 10 10 cm /J Do Q'] }],
    });
    // p3.jpg's own size, read from its frame, so the dictionary agrees with it.
    const sof = jpg.findIndex((byte, index) => byte === 0xff && jpg[index + 1] === 0xc0);
    const [height, width] = [(jpg[sof + 5]! << 8) | jpg[sof + 6]!, (jpg[sof + 7]! << 8) | jpg[sof + 8]!];
    const sized = build({
      objects: [{ dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, data: jpg }],
      pages: [{ resources: '<< /XObject << /J 3 0 R >> >>', contents: ['q 180 0 0 180 10 10 cm /J Do Q'] }],
    });
    void input;
    const { output } = await grey(sized);
    const seen = compare((await draw(sized))[0]!, (await draw(output!))[0]!);
    expect(seen.neutral).toBeLessThanOrEqual(2);
    expect(seen.mean).toBeLessThanOrEqual(2);
    const raw = await rawStreams(output!);
    expect([...raw.values()]).toContain(Buffer.from(jpg).toString('base64'));
  });

  it('an axial and a mesh shading, and a coloured and an uncoloured tiling pattern', async () => {
    const mesh = flated('/ShadingType 4 /ColorSpace /DeviceRGB /BitsPerCoordinate 16 /BitsPerComponent 8 /BitsPerFlag 8 /Decode [0 200 0 200 0 1 0 1 0 1]', Uint8Array.from([0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 0, 0, 255]));
    const input = build({
      objects: [
        '<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 200 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >>',
        mesh,
        flated('/PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>', '0 1 0 rg 0 0 5 5 re f 1 0 1 rg 5 5 5 5 re f'),
        flated('/PatternType 1 /PaintType 2 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >>', '0 0 5 5 re f'),
      ],
      pages: [
        {
          resources: '<< /Shading << /Sh 3 0 R /Me 4 0 R >> /Pattern << /P1 5 0 R /P2 6 0 R >> /ColorSpace << /U [/Pattern /DeviceRGB] >> >>',
          contents: ['q 0 100 200 100 re W n /Sh sh Q q 0 0 100 100 re W n /Me sh Q /Pattern cs /P1 scn 100 50 50 50 re f /U cs 1 0.5 0 /P2 scn 150 0 50 50 re f'],
        },
      ],
    });
    const { output } = await grey(input);
    const [before] = await draw(input);
    const [after] = await draw(output!);
    const seen = compare(before!, after!);
    expect(seen.neutral).toBeLessThanOrEqual(2);
    expect(seen.mean).toBeLessThanOrEqual(2);
    // The shading's function, and the mesh's vertex data, unchanged.
    const objects = (await objectsOf(output!)).objects;
    const axial = Object.values(objects).find((entry) => (entry.value as Record<string, unknown> | undefined)?.['/ShadingType'] === 2)!.value as Record<string, unknown>;
    expect(axial['/Function']).toEqual({ '/C0': [1, 0, 0], '/C1': [0, 0, 1], '/Domain': [0, 1], '/FunctionType': 2, '/N': 1 });
    await expectKept(input, output!);
  });

  it('a coloured Type 3 glyph and a form drawn twice with no colour space of its own, after rg and after /CS0 cs (ICC RGB)', async () => {
    const icc = new Uint8Array(readFileSync(join(fixtureDir, 'pictures', 'p3.icc')));
    const input = build({
      objects: [
        flated('/Type /XObject /Subtype /Form /BBox [0 0 50 50]', '0.2 0.4 0.6 scn 0 0 50 50 re f'),
        flated('/N 3', icc),
        '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 10 10] /FontMatrix [0.1 0 0 0.1 0 0] /CharProcs << /a 6 0 R >> /Encoding << /Differences [97 /a] >> /FirstChar 97 /LastChar 97 /Widths [10] >>',
        flated('', '10 0 d0 0 0 1 rg 0 0 10 10 re f'),
      ],
      pages: [
        {
          resources: '<< /XObject << /Fm 3 0 R >> /ColorSpace << /CS0 [/ICCBased 4 0 R] >> /Font << /T3 5 0 R >> >>',
          contents: ['q 1 0 0 rg 1 0 0 1 10 10 cm /Fm Do Q q /CS0 cs 1 0 0 1 100 10 cm /Fm Do Q BT /T3 40 Tf 20 120 Td (a) Tj ET'],
        },
      ],
    });
    const { output } = await grey(input);
    const [after] = await draw(output!);
    expect(allNeutral(after!)).toBe(true);
    // The form after rg is the grey of its own numbers through the RGB stand-in; after /CS0 cs, the same.
    const expectedGrey = luminosity(0.2, 0.4, 0.6) * 255;
    for (const [x, y] of [[35, 165], [125, 165]]) for (const value of at(after!, x!, y!)) expect(Math.abs(value - expectedGrey)).toBeLessThanOrEqual(2);
    // The form's own stream is unchanged.
    const before = await objectsOf(input);
    const formBefore = Object.entries(before.objects).find(([, entry]) => entry.stream?.dict['/Subtype'] === '/Form')!;
    const formAfter = Object.entries((await objectsOf(output!)).objects).find(([, entry]) => entry.stream?.dict['/Subtype'] === '/Form')!;
    expect(formAfter[1].stream!.data).toBe(formBefore[1].stream!.data);
    await expectKept(input, output!);
  });
});

/** A JPG's own width and height, read from its first frame header. */
function jpegSize(jpg: Uint8Array): [number, number] {
  for (let at = 2; at < jpg.length; ) {
    const marker = jpg[at + 1]!;
    const length = (jpg[at + 2]! << 8) | jpg[at + 3]!;
    if (marker >= 0xc0 && marker <= 0xc2) return [(jpg[at + 7]! << 8) | jpg[at + 8]!, (jpg[at + 5]! << 8) | jpg[at + 6]!];
    at += 2 + length;
  }
  throw new Error('No frame header.');
}
const p3 = () => new Uint8Array(readFileSync(join(fixtureDir, 'pictures', 'p3.icc')));
/** p3.icc with its data space field (offset 16) made `space`. */
const profileAs = (space: string) => {
  const bytes = p3();
  bytes.set(latin1(space), 16);
  return bytes;
};

describe('CalRGB, ICC-based and CMYK colours turn grey by their raw components', () => {
  it('CalRGB and ICC RGB flat fills are drawn at the grey of their raw components', async () => {
    const input = build({
      objects: [flated('/N 3', p3())],
      pages: [{ resources: '<< /ColorSpace << /Cal [/CalRGB << /WhitePoint [0.9505 1 1.089] /Gamma [2.2 2.2 2.2] >>] /Icc [/ICCBased 3 0 R] >> >>', contents: ['/Cal cs 0.9 0.2 0.1 sc 10 10 80 80 re f /Icc cs 0.1 0.8 0.3 scn 110 10 80 80 re f'] }],
    });
    const { output } = await grey(input);
    const [page] = await draw(output!);
    expect(allNeutral(page!)).toBe(true);
    for (const value of at(page!, 50, 150)) expect(Math.abs(value - luminosity(0.9, 0.2, 0.1) * 255)).toBeLessThanOrEqual(2);
    for (const value of at(page!, 150, 150)) expect(Math.abs(value - luminosity(0.1, 0.8, 0.3) * 255)).toBeLessThanOrEqual(2);
    await expectKept(input, output!);
  });

  it('k and K, and a CMYK named space, become the CMYK stand-in: 0 1 0 0 k is the grey 0.41', async () => {
    const input = build({
      pages: [{ resources: '<< /ColorSpace << /C4 /DeviceCMYK >> >>', contents: ['0 1 0 0 k 10 10 80 80 re f 0.5 0 0 0.2 K 8 w 110 20 m 190 20 l S /C4 cs 0.2 0.3 0.9 0.1 scn 110 110 80 80 re f'] }],
    });
    const { output } = await grey(input);
    const [text] = await contents(output!);
    expect(text!.join('')).toContain('/GreyCMYK cs 0 1 0 0  scn');
    const [page] = await draw(output!);
    expect(allNeutral(page!)).toBe(true);
    expect(cmykGrey(0, 1, 0, 0)).toBeCloseTo(0.41, 10);
    for (const value of at(page!, 50, 150)) expect(Math.abs(value - 0.41 * 255)).toBeLessThanOrEqual(2);
    for (const value of at(page!, 150, 180)) expect(Math.abs(value - cmykGrey(0.5, 0, 0, 0.2) * 255)).toBeLessThanOrEqual(2);
    for (const value of at(page!, 150, 50)) expect(Math.abs(value - cmykGrey(0.2, 0.3, 0.9, 0.1) * 255)).toBeLessThanOrEqual(2);
    await expectKept(input, output!);
  });

  it('a CMYK picture, as stored and with /Decode [1 0 1 0 1 0 1 0], is drawn neutral and close to the original through the luminosity formula, never inverted', async () => {
    const jpg = new Uint8Array(readFileSync(join(fixtureDir, 'pictures', 'cmyk.jpg')));
    const [width, height] = jpegSize(jpg);
    const drawn: Record<string, { before: Awaited<ReturnType<typeof draw>>[number]; after: Awaited<ReturnType<typeof draw>>[number] }> = {};
    for (const decode of ['', '/Decode [1 0 1 0 1 0 1 0]']) {
      const input = build({
        objects: [{ dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /DCTDecode ${decode}`, data: jpg }],
        pages: [{ resources: '<< /XObject << /J 3 0 R >> >>', contents: ['q 180 0 0 180 10 10 cm /J Do Q'] }],
      });
      const { output } = await grey(input);
      drawn[decode] = { before: (await draw(input))[0]!, after: (await draw(output!))[0]! };
      const seen = compare(drawn[decode]!.before, drawn[decode]!.after);
      expect(seen.neutral, decode).toBeLessThanOrEqual(2);
      // PDF.js draws the original through its own CMYK colour model, the stand-in through the standard's simple
      // conversion (owner question 2): measured 8.9 as stored and 20.9 with /Decode, against 105 and 116 for a
      // result drawn the wrong way round (design decision 2, "As built").
      expect(seen.mean, decode).toBeLessThanOrEqual(25);
    }
    // The /Decode is honoured: each result is far from the other picture's original, so neither is drawn inverted.
    expect(compare(drawn['']!.before, drawn['/Decode [1 0 1 0 1 0 1 0]']!.after).mean).toBeGreaterThan(80);
    expect(compare(drawn['/Decode [1 0 1 0 1 0 1 0]']!.before, drawn['']!.after).mean).toBeGreaterThan(80);
  });

  it('an ICC profile compressed with Flate, larger than 128 bytes, has its header read from its start; uncompressed too; under 20 bytes it is left', async () => {
    const fill = (profile: PdfObject) =>
      build({ objects: [profile], pages: [{ resources: '<< /ColorSpace << /CS0 [/ICCBased 3 0 R] >> >>', contents: ['/CS0 cs 0.9 0.1 0.1 scn 20 20 160 160 re f'] }] });
    expect(p3().length).toBeGreaterThan(128);
    for (const profile of [flated('/N 3', p3()), { dict: '/N 3', data: p3() }]) {
      const { output } = await grey(fill(profile));
      const [page] = await draw(output!);
      for (const value of at(page!, 100, 100)) expect(Math.abs(value - luminosity(0.9, 0.1, 0.1) * 255)).toBeLessThanOrEqual(2);
    }
    // A profile of 12 bytes is unreadable: its colour space is left, and nothing else is in the file.
    expect((await grey(fill({ dict: '/N 3', data: p3().subarray(0, 12) }))).outputs).toEqual([]);
  });
});

/** Every /ColorSpace dictionary's entries in a file, by object id and path, through qpdf's JSON. */
async function spaceEntries(bytes: Uint8Array): Promise<Record<string, unknown>[]> {
  const { objects } = await objectsOf(bytes);
  const found: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (key === '/ColorSpace' && item && typeof item === 'object' && !Array.isArray(item)) found.push(item as Record<string, unknown>);
        walk(item);
      }
    }
  };
  for (const entry of Object.values(objects)) walk(entry.value ?? entry.stream?.dict);
  return found;
}

describe('the starting black, and named RGB entries', () => {
  const icc = () => flated('/N 3', p3());

  it('every /GreyRGB cs written for a device operand, and every cs of an eligible name, is followed by 0 0 0 scn', async () => {
    const input = build({
      objects: [icc()],
      pages: [{ resources: '<< /ColorSpace << /CS0 [/ICCBased 3 0 R] >> >>', contents: ['/DeviceRGB cs 0.2 0.5 0.9 sc 10 10 50 50 re f /DeviceRGB CS 3 w 0 0 m 200 200 l S /CS0 cs 70 10 50 50 re f /CS0 CS 0 200 m 200 0 l S'] }],
    });
    const { output } = await grey(input);
    const text = (await contents(output!))[0]!.join('').replace(/\s+/g, ' ');
    expect(text).toContain('/GreyRGB cs 0 0 0 scn 0.2 0.5 0.9 scn');
    expect(text).toContain('/GreyRGB CS 0 0 0 SCN');
    expect(text).toContain('/CS0 cs 0 0 0 scn');
    expect(text).toContain('/CS0 CS 0 0 0 SCN');
    // The entry was repointed, as every stream that selects it was edited: text painted with no colour set is black.
    const [page] = await draw(output!);
    for (const value of at(page!, 95, 165)) expect(value).toBeLessThanOrEqual(2);
    expect((await spaceEntries(output!)).some((entry) => typeof entry['/CS0'] === 'string' && /^\d+ 0 R$/.test(entry['/CS0'] as string))).toBe(true);
  });

  it('a stream left because of doubt that does /CS0 cs with no colour set leaves /CS0 in every dictionary; the edited streams using it get a harmless 0 0 0 scn and draw as before', async () => {
    const profile = icc();
    const input = build({
      objects: [profile],
      pages: [
        // Page 1 is doubt (a glued token), so it is left whole.
        { resources: '<< /ColorSpace << /CS0 [/ICCBased 3 0 R] >> >>', contents: ['/CS0 cs 10 10 80 80 re f 0.5 0.5 0.5rg'] },
        // Page 2 shares the same profile under /CS0, and is edited.
        { resources: '<< /ColorSpace << /CS0 [/ICCBased 3 0 R] >> >>', contents: ['/CS0 cs 10 10 80 80 re f 1 0 0 rg 110 10 80 80 re f'] },
      ],
    });
    const { output } = await grey(input);
    // /CS0 is still the ICC array in every dictionary.
    for (const entry of await spaceEntries(output!)) if ('/CS0' in entry) expect(entry['/CS0']).toEqual(['/ICCBased', expect.stringMatching(/^\d+ 0 R$/)]);
    const [before, after] = [await contents(input), await contents(output!)];
    expect(after[0]).toEqual(before[0]);
    expect(after[1]!.join('')).toContain('/CS0 cs 0 0 0 scn');
    const [, page2before] = await draw(input);
    const [, page2after] = await draw(output!);
    expect(at(page2after!, 50, 150)).toEqual(at(page2before!, 50, 150));
  });

  it('a file whose only edits would be starting blacks (or sc made scn) gives no file; so do a form with /F and an appearance stream with no resources', async () => {
    const separation = '[/Separation /Spot /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]';
    const blacks = build({ objects: [icc()], pages: [{ resources: `<< /ColorSpace << /CS0 [/ICCBased 3 0 R] /Sp ${separation} >> >>`, contents: ['/CS0 cs /Sp cs 0.5 sc 10 10 50 50 re f'] }] });
    // The entry /CS0 is ICC RGB and would be repointed, which counts: so it gives a file. Without any RGB entry, none.
    const onlySc = build({ pages: [{ resources: `<< /ColorSpace << /Sp ${separation} >> >>`, contents: ['/Sp cs 0.5 sc 10 10 50 50 re f'] }] });
    expect((await grey(onlySc)).outputs).toEqual([]);
    expect((await grey(blacks)).outputs).toHaveLength(1);
    const withF = build({ objects: ['<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] /F (outside.txt) /Length 0 >>'], pages: [{ resources: '<< /XObject << /X 3 0 R >> >>', contents: ['/X Do'] }] });
    expect((await grey(withF)).outputs).toEqual([]);
    const appearance = build({
      objects: [flated('/Type /XObject /Subtype /Form /BBox [0 0 20 20]', '1 0 0 rg 0 0 20 20 re f'), '<< /Type /Annot /Subtype /Square /Rect [10 10 30 30] /AP << /N 3 0 R >> >>'],
      pages: [{ contents: ['0 g 50 50 10 10 re f'], extra: '/Annots [4 0 R]' }],
    });
    expect((await grey(appearance)).outputs).toEqual([]);
  });

  it('a CMYK, an indexed and a pattern entry used by a doubtful stream are still repointed', async () => {
    const input = build({
      pages: [{ resources: '<< /ColorSpace << /C4 /DeviceCMYK /Ix [/Indexed /DeviceRGB 1 <ff000000ff00>] /Pt [/Pattern /DeviceRGB] >> >>', contents: ['/C4 cs 0 1 0 0 sc /Ix cs /Pt cs ETQ'] }],
    });
    const { output } = await grey(input);
    const [entry] = (await spaceEntries(output!)).filter((each) => '/C4' in each);
    for (const name of ['/C4', '/Ix', '/Pt']) expect(entry![name]).toMatch(/^\d+ 0 R$/);
    expect((await contents(output!))[0]).toEqual((await contents(input))[0]);
  });

  it('a form with no resources of its own, drawn from a page whose /CS0 is ICC RGB and from an appearance stream whose own /CS0 is a Separation: not eligible, no 0 0 0 scn, left', async () => {
    const separation = '[/Separation /Spot /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]';
    for (const other of ['appearance', 'pattern', 'type3'] as const) {
      const inherits = flated('/Type /XObject /Subtype /Form /BBox [0 0 20 20]', '/CS0 cs 0 0 20 20 re f 1 0 0 rg 0 0 5 5 re f');
      const holders: Record<typeof other, PdfObject> = {
        appearance: flated(`/Type /XObject /Subtype /Form /BBox [0 0 20 20] /Resources << /ColorSpace << /CS0 ${separation} >> /XObject << /In 3 0 R >> >>`, '/In Do'),
        pattern: flated(`/PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 20 20] /XStep 20 /YStep 20 /Resources << /ColorSpace << /CS0 ${separation} >> /XObject << /In 3 0 R >> >>`, '/In Do'),
        type3: `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 10 10] /FontMatrix [0.1 0 0 0.1 0 0] /CharProcs << /a 7 0 R >> /Resources << /ColorSpace << /CS0 ${separation} >> /XObject << /In 3 0 R >> >> /Encoding << /Differences [97 /a] >> /FirstChar 97 /LastChar 97 /Widths [10] >>`,
      };
      const input = build({
        objects: [inherits, holders[other], icc(), '<< /Type /Annot /Subtype /Square /Rect [100 100 120 120] /AP << /N 4 0 R >> >>', flated('', '10 0 d0 /In Do')],
        pages: [{ resources: '<< /ColorSpace << /CS0 [/ICCBased 5 0 R] >> /XObject << /In 3 0 R >> /Pattern << /P 4 0 R >> /Font << /T 4 0 R >> >>', contents: ['/In Do'], extra: other === 'appearance' ? '/Annots [6 0 R]' : '' }],
      });
      const { output } = await grey(input);
      const objects = (await objectsOf(output!)).objects;
      const form = Object.values(objects).find((entry) => entry.stream?.dict['/BBox'] && !entry.stream.dict['/Resources'] && Buffer.from(entry.stream.data ?? '', 'base64').toString('latin1').includes('/CS0 cs'))!;
      const text = Buffer.from(form.stream!.data!, 'base64').toString('latin1');
      expect(text, other).not.toContain('/CS0 cs 0 0 0 scn');
      expect(text, other).toContain('/GreyRGB cs');
      for (const entry of await spaceEntries(output!)) if ('/CS0' in entry && Array.isArray(entry['/CS0']) === false) expect(entry['/CS0'], other).not.toMatch(/^\d+ 0 R$/);
      for (const entry of await spaceEntries(output!)) if (Array.isArray(entry['/CS0']) && entry['/CS0'][0] === '/ICCBased') expect(entry['/CS0'][0], other).toBe('/ICCBased');
    }
  });

  it('callers that disagree on a name leave every /CS0 entry as it was', async () => {
    const separation = '[/Separation /Spot /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]';
    const input = build({
      objects: [flated('/Type /XObject /Subtype /Form /BBox [0 0 20 20]', '/CS0 cs 0 0 20 20 re f 1 0 0 rg 0 0 5 5 re f'), icc()],
      pages: [
        { resources: '<< /ColorSpace << /CS0 [/ICCBased 4 0 R] >> /XObject << /In 3 0 R >> >>', contents: ['/In Do'] },
        { resources: `<< /ColorSpace << /CS0 ${separation} >> /XObject << /In 3 0 R >> >>`, contents: ['/In Do'] },
      ],
    });
    const { output } = await grey(input);
    const entries = (await spaceEntries(output!)).filter((entry) => '/CS0' in entry).map((entry) => entry['/CS0']);
    expect(entries.some((value) => Array.isArray(value) && value[0] === '/ICCBased')).toBe(true);
    expect(entries.some((value) => Array.isArray(value) && value[0] === '/Separation')).toBe(true);
  });
});

describe('the stand-in names resolve wherever a rewritten operator is drawn', () => {
  it('a form with no resources drawn from two pages, a Type 3 font with none, a page with none, and resources inherited from the page tree', async () => {
    const input = build({
      objects: [
        flated('/Type /XObject /Subtype /Form /BBox [0 0 20 20]', '1 0 0 rg 0 0 20 20 re f'),
        '<< /Type /Font /Subtype /Type3 /FontBBox [0 0 10 10] /FontMatrix [0.1 0 0 0.1 0 0] /CharProcs << /a 5 0 R >> /Encoding << /Differences [97 /a] >> /FirstChar 97 /LastChar 97 /Widths [10] >>',
        flated('', '10 0 d0 0 1 0 rg 0 0 10 10 re f'),
      ],
      tree: '/Resources << /XObject << /Fm 3 0 R >> /Font << /T 4 0 R >> >>',
      pages: [
        { contents: ['q 1 0 0 1 10 10 cm /Fm Do Q BT /T 40 Tf 50 50 Td (a) Tj ET'] },
        { contents: ['q 1 0 0 1 10 10 cm /Fm Do Q'] },
        { resources: '<< >>', contents: ['0 0 1 rg 10 10 50 50 re f'] },
      ],
    });
    const { output } = await grey(input);
    for (const page of await draw(output!)) expect(allNeutral(page)).toBe(true);
    // The inherited dictionary and the page's own empty one each point at one shared dictionary holding the names.
    const { objects } = await objectsOf(output!);
    const shared = Object.entries(objects).filter(([, entry]) => {
      const value = entry.value as Record<string, unknown> | undefined;
      return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).join() === '/GreyRGB';
    });
    expect(shared).toHaveLength(1);
    const ref = shared[0]![0].slice(4);
    const pointing = Object.values(objects).filter((entry) => JSON.stringify(entry.value ?? entry.stream?.dict ?? null).includes(`"/ColorSpace":"${ref}"`));
    expect(pointing).toHaveLength(2);
    await expectKept(input, output!);
  });

  it('a page with no resources at all gets one holding only /ColorSpace', async () => {
    const input = build({ pages: [{ contents: ['1 0 0 rg 10 10 50 50 re f'] }] });
    const { output } = await grey(input);
    const page = Object.values((await objectsOf(output!)).objects).find((entry) => (entry.value as Record<string, unknown> | undefined)?.['/Type'] === '/Page')!.value as Record<string, unknown>;
    expect(Object.keys(page['/Resources'] as object)).toEqual(['/ColorSpace']);
    expect(allNeutral((await draw(output!))[0]!)).toBe(true);
  });

  it('a file already using /GreyRGB in a /ColorSpace dictionary gets /GreyRGB1, the existing entry unchanged', async () => {
    const input = build({ pages: [{ resources: '<< /ColorSpace << /GreyRGB /DeviceGray >> >>', contents: ['/GreyRGB cs 0.5 sc 1 0 0 rg 10 10 50 50 re f'] }] });
    const { output } = await grey(input);
    expect((await contents(output!))[0]!.join('')).toContain('/GreyRGB1 cs 1 0 0  scn');
    const [entry] = await spaceEntries(output!);
    expect(entry!['/GreyRGB']).toBe('/DeviceGray');
    expect(entry!['/GreyRGB1']).toMatch(/^\d+ 0 R$/);
    expect(allNeutral((await draw(output!))[0]!)).toBe(true);
  });
});

const separationSpace = '[/Separation /Spot /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]';

describe('what is left as it is, byte for byte', () => {
  it('Separation, DeviceN, Lab, ICC with another range, a /Range of the wrong length, an ICC /N 3 whose profile says Lab, and an indexed space with an indexed base', async () => {
    const spaces = [
      separationSpace,
      '[/DeviceN [/A /B] /DeviceCMYK << /FunctionType 4 /Domain [0 1 0 1] /Range [0 1 0 1 0 1 0 1] /Length 22 >>]',
      '[/Lab << /WhitePoint [0.9505 1 1.089] /Range [-100 100 -100 100] >>]',
      '[/ICCBased 3 0 R]',
      '[/ICCBased 4 0 R]',
      '[/ICCBased 5 0 R]',
      '[/Indexed [/Indexed /DeviceRGB 1 <ff0000ffffff>] 1 <0001>]',
    ];
    for (const space of spaces) {
      const input = build({
        objects: [flated('/N 3 /Range [0 1 0 1 0 2]', p3()), flated('/N 3 /Range [0 1 0 1]', p3()), flated('/N 3', profileAs('Lab '))],
        pages: [{ resources: `<< /ColorSpace << /X ${space.replace('/Length 22 >>', '>>')} >> >>`, contents: ['/X cs 0.5 sc 10 10 50 50 re f'] }],
      });
      // sc becoming scn alone changes nothing drawn, so nothing is turned grey and no file is made.
      expect((await grey(input)).outputs, space).toEqual([]);
    }
  });

  it('JPEG 2000 (images.pdf) and an inline picture with a clear end are left, the operators around the picture edited', async () => {
    const { output } = await grey(fixture('images.pdf'));
    const before = await rawStreams(fixture('images.pdf'));
    const after = await rawStreams(output!);
    const jpx = [...before.values()].find((data) => Buffer.from(data, 'base64').subarray(0, 12).toString('latin1').includes('jP'))!;
    expect([...after.values()]).toContain(jpx);
    const inline = build({ pages: [{ contents: ['1 0 0 rg q 20 0 0 20 10 10 cm BI /W 2 /H 1 /BPC 8 /CS /RGB ID \xff\x00\x00\x00\xff\x00 EI Q 0 0 1 rg 100 100 50 50 re f'] }] });
    const result = (await grey(inline)).output!;
    const text = (await contents(result))[0]!.join('');
    expect(text).toContain('ID \xff\x00\x00\x00\xff\x00 EI');
    expect(text.replace(/\s+/g, ' ')).toContain('/GreyRGB cs 0 0 1 scn');
  });

  it('a page and a form /Group /CS /DeviceRGB, a soft mask /BC, /DefaultRGB and /DefaultCMYK keys and /OutputIntents', async () => {
    const input = build({
      objects: [
        flated('/Type /XObject /Subtype /Form /BBox [0 0 50 50] /Group << /S /Transparency /CS /DeviceRGB >>', '1 0 0 rg 0 0 50 50 re f'),
        flated('/Type /XObject /Subtype /Form /BBox [0 0 200 200] /Group << /S /Transparency /CS /DeviceRGB >>', '0.8 g 0 0 200 200 re f'),
        flated('/N 3', p3()),
        '<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (P3) /DestOutputProfile 5 0 R >>',
      ],
      catalog: '/OutputIntents [6 0 R]',
      pages: [
        {
          resources: '<< /XObject << /Fm 3 0 R >> /ExtGState << /G1 << /SMask << /Type /Mask /S /Luminosity /G 4 0 R /BC [1 0 0] >> >> >> /ColorSpace << /DefaultRGB [/ICCBased 5 0 R] /DefaultCMYK /DeviceCMYK >> >>',
          extra: '/Group << /S /Transparency /CS /DeviceRGB >>',
          contents: ['q /G1 gs /Fm Do Q'],
        },
      ],
    });
    const { output } = await grey(input);
    const objects = Object.values((await objectsOf(output!)).objects).map((entry) => entry.value ?? entry.stream?.dict) as Record<string, unknown>[];
    const page = objects.find((value) => value?.['/Type'] === '/Page')!;
    expect(page['/Group']).toEqual({ '/CS': '/DeviceRGB', '/S': '/Transparency' });
    const resources = page['/Resources'] as Record<string, Record<string, unknown>>;
    expect(resources['/ColorSpace']!['/DefaultRGB']).toEqual(['/ICCBased', expect.stringMatching(/ R$/)]);
    expect(resources['/ColorSpace']!['/DefaultCMYK']).toBe('/DeviceCMYK');
    expect(JSON.stringify(resources['/ExtGState'])).toContain('"/BC":[1,0,0]');
    expect(objects.filter((value) => JSON.stringify(value?.['/Group'] ?? null).includes('/DeviceRGB'))).toHaveLength(3);
    const catalog = objects.find((value) => value?.['/Type'] === '/Catalog')!;
    expect(catalog['/OutputIntents']).toBeDefined();
    // The soft mask's own group form is left: its stream and its dictionary are as they were.
    const maskBefore = (await rawStreams(input));
    const maskAfter = (await rawStreams(output!));
    expect([...maskAfter.values()].filter((data) => [...maskBefore.values()].includes(data)).length).toBeGreaterThan(0);
  });

  it('/Device#52GB is read as /DeviceRGB', async () => {
    const input = build({ pages: [{ contents: ['/Device#52GB cs 1 0 0 sc 10 10 80 80 re f'] }] });
    const { output } = await grey(input);
    expect((await contents(output!))[0]!.join('').replace(/\s+/g, ' ')).toContain('/GreyRGB cs 0 0 0 scn 1 0 0 scn');
    expect(allNeutral((await draw(output!))[0]!)).toBe(true);
  });

  it('a form used only as a soft mask group is left with its own resources; one also drawn is edited', async () => {
    const maskOnly = flated('/Type /XObject /Subtype /Form /BBox [0 0 200 200] /Group << /S /Transparency /CS /DeviceRGB >> /Resources << /ColorSpace << /M /DeviceCMYK >> >>', '1 0 0 rg 0 0 200 200 re f');
    for (const alsoDrawn of [false, true]) {
      const input = build({
        objects: [maskOnly],
        pages: [{ resources: `<< /ExtGState << /G1 << /SMask << /Type /Mask /S /Luminosity /G 3 0 R >> >> >> ${alsoDrawn ? '/XObject << /Fm 3 0 R >>' : ''} >>`, contents: [`q /G1 gs 0 g 10 10 50 50 re f Q 0 0 1 rg 100 100 20 20 re f ${alsoDrawn ? '/Fm Do' : ''}`] }],
      });
      const { output } = await grey(input);
      const form = Object.values((await objectsOf(output!)).objects).find((entry) => entry.stream?.dict['/Group'])!;
      const text = Buffer.from(form.stream!.data!, 'base64').toString('latin1');
      expect(text.includes('GreyRGB'), String(alsoDrawn)).toBe(alsoDrawn);
      if (!alsoDrawn) expect(form.stream!.dict['/Resources']).toEqual({ '/ColorSpace': { '/M': '/DeviceCMYK' } });
    }
  });
});

describe('doubt leaves a stream byte for byte', () => {
  const cases: [string, string][] = [
    ['glued token', '1 0 0 rg 10 10 50 50 re f 0.5 0.5 0.5rg'],
    ['ETQ', '1 0 0 rg BT ETQ'],
    ['1.2.3', '1 0 0 rg 1.2.3 w'],
    ['a control byte', '1 0 0 rg \x01 10 10 50 50 re f'],
    ['a byte over 0x7F', '1 0 0 rg \xc3 10 10 50 50 re f'],
    ['a brace', '1 0 0 rg { 10 10 50 50 re f'],
    ['an unbalanced string', '1 0 0 rg BT (abc Tj ET'],
    ['an unbalanced array', '1 0 0 rg BT [(a) Tj ET'],
    ['an unbalanced dictionary', '1 0 0 rg /P << /MCID 0 BDC EMC'],
    ['an operator inside an array', '1 0 0 rg [ 1 re ] pop'],
    ['an operator inside a dictionary', '1 0 0 rg /P << /A re >> BDC EMC'],
    ['ID outside BI', '1 0 0 rg ID'],
    ['EI outside BI', '1 0 0 rg EI'],
    ['BX with no EX', '1 0 0 rg BX'],
    ['EX with no BX', '1 0 0 rg EX'],
    ['a bad hex string', '1 0 0 rg BT <4g> Tj ET'],
    ['a bad # in a name', '1 0 0 rg /A#g1 cs'],
    ['rg with two operands', '1 0 rg 10 10 50 50 re f'],
    ['rg with four operands', '1 0 0 0 rg 10 10 50 50 re f'],
    ['cs with a number', '1 0 0 rg 5 cs'],
    ['an inline picture with xEI inside its data', '1 0 0 rg BI /W 4 /H 1 /BPC 8 /CS /G ID xEI EI 0 g'],
    ['an inline picture with EI before a NUL', '1 0 0 rg BI /W 4 /H 1 /BPC 8 /CS /G ID aEI\x00 EI 0 g'],
    ['an inline picture with a stray ~ in ASCII85 data', '1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /G /F /A85 ID 87~cURz~> EI 0 g'],
    ['an inline picture with CR LF after ID', '1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /G ID\r\nab EI 0 g'],
    ['an inline picture with a Flate filter', '1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /G /F /Fl ID ab EI 0 g'],
    ['an inline picture with a DCT filter', '1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /G /F /DCT ID ab EI 0 g'],
    ['an inline picture with a named colour space', '1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /CS0 ID ab EI 0 g'],
    ['an inline picture with a wrong /L', '1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /G /L 5 ID ab EI 0 g'],
    ['an inline picture whose sizes overflow', '1 0 0 rg BI /W 99999999999 /H 99999999999 /BPC 16 /CS /CMYK ID ab EI 0 g'],
  ];
  it.each(cases)('%s', async (_, text) => {
    const input = build({ pages: [{ resources: `<< /ColorSpace << /CS0 /DeviceGray >> >>`, contents: [text] }] });
    const result = await grey(input);
    // Nothing else in the file, so no file is made; the stream, read again, is as it was.
    expect(result.outputs).toEqual([]);
  });

  const splits: [string, string[]][] = [
    ['a token split between streams', ['1 0 0 rg 10 10 50 5', '0 re f']],
    ['a string split between streams', ['1 0 0 rg BT (ab', 'c) Tj ET']],
    ['a comment across streams', ['1 0 0 rg % a comment', ' 0 0 1 rg 10 10 50 50 re f']],
    ['operands waiting at a stream end', ['1 0 0 rg 10 10 50 50 ', 're f']],
  ];
  it.each(splits)('%s: every content stream of the page is left', async (_, streams) => {
    const input = build({ pages: [{ contents: streams }, { contents: ['0 g 10 10 50 50 re f'] }] });
    expect((await grey(input)).outputs).toEqual([]);
  });

  it('a shared stream left on one page is left on every page that uses it, with that page\'s other streams', async () => {
    // Page 1's content is [3 4], split in the middle of a number; page 2's is [5 3], so stream 3 is shared.
    const input = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [6 0 R 7 0 R] /Count 2 >>',
      { dict: '', data: latin1('0 0 1 rg 10 10 50 50 re f 1 0 0 rg 5 5 10 1') },
      { dict: '', data: latin1('0 re f') },
      { dict: '', data: latin1('0 1 0 rg 100 100 20 20 re f') },
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents [3 0 R 4 0 R] >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents [5 0 R 3 0 R] >>',
    ]);
    // Page 1 is left whole, stream 3 with it, and so page 2, which shares stream 3, is left whole too: nothing else
    // changes, so no file is made.
    expect((await grey(input)).outputs).toEqual([]);
  });
});

/** `bytes` bytes of `q Q ` repeated, compressed by Flate: drawing instructions that decode to exactly that size. */
function bigStream(bytes: number, unit = 'q Q '): { dict: string; data: Uint8Array } {
  const data = Buffer.alloc(bytes, unit);
  return { dict: '/Filter /FlateDecode', data: new Uint8Array(deflateSync(data, { level: 9 })) };
}

describe('drawing instructions are decoded within limits', () => {
  it('a stream past 64 MiB on page 2 stops the job with PageTooLarge and that page, before anything is written', { timeout: 120_000 }, async () => {
    const input = build({ pages: [{ contents: ['1 0 0 rg 10 10 50 50 re f'] }, { contents: [bigStream(maxContentBytes + 4)] }] });
    const error = await failure(grey(input));
    expect(error).toBeInstanceOf(PageTooLarge);
    expect((error as PageTooLarge).page).toBe(2);
    expect(error!.message).toBe('A page has too much drawing on it to work on here.');
    expect(failureKind(error)).toBe('page-too-large');
    // With Grayscale PDF's own words from the registry: unchanged byte for byte.
    const words = (await import('../../src/tools/registry')).tools.find((tool) => tool.id === 'grayscale-pdf')!.widget!;
    expect(failureSentence('page-too-large', words, {}, {}, (error as PageTooLarge).page)).toBe('Page 2 has too much drawing on it to convert here. Delete that page, or split the file, and convert the rest.');
  });

  it('a page of two streams of 40 MiB each stops the same way', { timeout: 120_000 }, async () => {
    const forty = 40 * 1024 * 1024;
    const input = build({ pages: [{ contents: [bigStream(forty), bigStream(forty)] }] });
    const error = await failure(grey(input));
    expect(error).toBeInstanceOf(PageTooLarge);
    expect((error as PageTooLarge).page).toBe(1);
  });

  it('an appearance stream whose widget is on no page and an unused form in /DR, each past 64 MiB, are left; the job goes on; their /CS0 is not repointed; their bytes are counted', { timeout: 120_000 }, async () => {
    const big = bigStream(maxContentBytes + 4, '/CS0 cs ');
    const input = build({
      objects: [
        { dict: `/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /ColorSpace << /CS0 [/ICCBased 5 0 R] >> >> ${big.dict}`, data: big.data },
        { dict: `/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /ColorSpace << /CS0 [/ICCBased 5 0 R] >> >> ${big.dict}`, data: big.data },
        flated('/N 3', p3()),
        '<< /FT /Tx /T (orphan) /Rect [0 0 10 10] /Subtype /Widget /AP << /N 3 0 R >> >>',
      ],
      catalog: '/AcroForm << /Fields [6 0 R] /DR << /XObject << /Unused 4 0 R >> >> >>',
      pages: [{ resources: '<< /ColorSpace << /CS0 [/ICCBased 5 0 R] >> >>', contents: ['/CS0 cs 10 10 50 50 re f 1 0 0 rg 100 100 50 50 re f'] }],
    });
    const { output } = await grey(input);
    expect(output).toBeDefined();
    for (const entry of await spaceEntries(output!)) if ('/CS0' in entry) expect(entry['/CS0']).toEqual(['/ICCBased', expect.stringMatching(/ R$/)]);
    // Their decoded bytes count, each up to its cap: a budget of 1.5 caps, under what the two decode, stops the job.
    const tight = makeRun({ contentBudget: () => 1.5 * maxContentBytes });
    expect(await failure(grey(input, { engine: tight }))).toBeInstanceOf(OutputLimit);
  });

  it('streams of 60 MiB each, their count worked out from the plain copy, stop at the content budget with OutputLimit', { timeout: 300_000 }, async () => {
    const sixty = 60 * 1024 * 1024;
    const one = bigStream(sixty);
    const make = (count: number) => build({ pages: Array.from({ length: count }, () => ({ contents: [one] })) });
    // The plain copy keeps Flate data as it is, so its length is this file's, to within a few bytes a page.
    const { plainCopy } = await import('../../src/engines/plain');
    const trial = make(2);
    const plain = (await plainCopy(tools, trial, undefined)).plain.length;
    const perPage = (plain - (await plainCopy(tools, make(1), undefined)).plain.length);
    let count = 2;
    while (count * sixty <= contentBudget(plain + (count - 2) * perPage)) count++;
    const started = Date.now();
    const error = await failure(grey(make(count)));
    expect(error).toBeInstanceOf(OutputLimit);
    expect(failureSentence(failureKind(error), {})).toBe('The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.');
    // And one stream fewer is under the budget: the stop is the budget's, not a cap's.
    expect(count - 1).toBeGreaterThan(1);
    console.log(`content budget: ${count} streams of 60 MiB stopped in ${Date.now() - started} ms`);
  });

  it('the filters that reach the reader after the plain copy: a lone RunLength and a chain holding one are read and edited; /DP and a chain of five are left', async () => {
    const { runLength, ascii85, lzw } = await import('./content-helpers');
    const drawing = latin1('1 0 0 rg 10 10 50 50 re f');
    const cases: [string, { dict: string; data: Uint8Array }, boolean][] = [
      ['lone RunLength', { dict: '/Filter /RunLengthDecode', data: runLength(drawing) }, true],
      ['ASCII85 then RunLength', { dict: '/Filter [/ASCII85Decode /RunLengthDecode]', data: ascii85(runLength(drawing)) }, true],
      ['a lone LZW, which the plain copy turns into Flate', { dict: '/Filter /LZWDecode', data: lzw(drawing) }, true],
      ['Flate with /DP', { dict: '/Filter /FlateDecode /DP << /Predictor 1 >>', data: new Uint8Array(deflateSync(drawing)) }, false],
      ['a chain of five', { dict: '/Filter [/RL /RL /RL /RL /RL]', data: runLength(runLength(runLength(runLength(runLength(drawing))))) }, false],
    ];
    for (const [label, stream, edited] of cases) {
      const { outputs } = await grey(build({ pages: [{ contents: [stream] }] }));
      expect(outputs.length, label).toBe(edited ? 1 : 0);
    }
  });
});

/** Every object's value (or stream dictionary) in a result, through qpdf's JSON. */
async function values(bytes: Uint8Array): Promise<Record<string, unknown>[]> {
  return Object.values((await objectsOf(bytes)).objects).map((entry) => (entry.value ?? entry.stream?.dict) as Record<string, unknown>);
}

describe('colours of notes, fields and bookmarks', () => {
  it('3 and 4 numbers made neutral, 1 and 0 and neutral ones unchanged, values outside 0 to 1 clamped, /DA to g, /DS and /RC kept', async () => {
    const input = build({
      objects: [
        '<< /Type /Annot /Subtype /Highlight /Rect [10 10 60 30] /QuadPoints [10 30 60 30 10 10 60 10] /C [1 1 0] >>',
        '<< /Type /Annot /Subtype /Square /Rect [70 10 120 60] /C [2 -1 0] /IC [0 1 0 0] >>',
        '<< /Type /Annot /Subtype /Square /Rect [130 10 180 60] /C [0.5] /IC [] >>',
        '<< /Type /Annot /Subtype /Square /Rect [10 70 60 120] /C [0.5 0.5 0.5] >>',
        '<< /Type /Annot /Subtype /FreeText /Rect [70 70 180 120] /DA (/Helv 12 Tf 1 0 0 rg) /DS (font: 12pt; color: #FF0000) /RC (<body style="color:#ff0000">x</body>) >>',
        '<< /FT /Tx /T (name) /Type /Annot /Subtype /Widget /Rect [10 130 100 150] /MK << /BG [1 0 0] /BC [0 0 1] >> /DA (/Helv 12 Tf 1 0 0 rg) /V (typed) >>',
        '<< /FT /Btn /Ff 32768 /T (choice) /DA (/ZaDb 0 Tf 0 0 1 rg) /Kids [10 0 R] >>',
        '<< /Type /Annot /Subtype /Widget /Parent 9 0 R /Rect [110 130 130 150] /AS /Off /MK << /BG [0 1 0 0] >> >>',
        '<< /FT /Tx /T (doubt) /Type /Annot /Subtype /Widget /Rect [140 130 190 150] /DA (/Helv 12 Tf 1 0 rg) >>',
        '<< /Title (One) /Parent 13 0 R /C [1 0 0] >>',
        '<< /Type /Outlines /First 12 0 R /Last 12 0 R /Count 1 >>',
      ],
      catalog: '/AcroForm << /Fields [8 0 R 9 0 R 11 0 R] /DA (/Helv 0 Tf 0 0 1 rg) >> /Outlines 13 0 R',
      pages: [{ contents: ['0 g 0 0 1 1 re f'], extra: '/Annots [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 10 0 R 11 0 R]' }],
    });
    const { output } = await grey(input);
    const all = await values(output!);
    const find = (test: (value: Record<string, unknown>) => boolean) => all.find((value) => value && test(value))!;
    expect(find((v) => v['/Subtype'] === '/Highlight')['/C']).toEqual([0.89, 0.89, 0.89]);
    const clamped = find((v) => Array.isArray(v['/Rect']) && (v['/Rect'] as number[])[0] === 70 && v['/Subtype'] === '/Square');
    expect(clamped['/C']).toEqual([0.3, 0.3, 0.3]);
    expect(clamped['/IC']).toEqual([0, 0, 0, 0.59]);
    const short = find((v) => Array.isArray(v['/Rect']) && (v['/Rect'] as number[])[0] === 130);
    expect(short['/C']).toEqual([0.5]);
    expect(short['/IC']).toEqual([]);
    expect(find((v) => Array.isArray(v['/Rect']) && (v['/Rect'] as number[])[0] === 10 && (v['/Rect'] as number[])[1] === 70)['/C']).toEqual([0.5, 0.5, 0.5]);
    const freeText = find((v) => v['/Subtype'] === '/FreeText');
    expect(freeText['/DA']).toBe('u:/Helv 12 Tf 0.3 g');
    expect(freeText['/DS']).toBe('u:font: 12pt; color: #FF0000');
    expect(freeText['/RC']).toBe('u:<body style="color:#ff0000">x</body>');
    const field = find((v) => v['/T'] === 'u:name');
    expect(field['/MK']).toEqual({ '/BG': [0.3, 0.3, 0.3], '/BC': [0.11, 0.11, 0.11] });
    expect(field['/DA']).toBe('u:/Helv 12 Tf 0.3 g');
    expect(field['/V']).toBe('u:typed');
    // The inherited /DA of a radio group's parent, and a kid's /MK.
    expect(find((v) => v['/T'] === 'u:choice')['/DA']).toBe('u:/ZaDb 0 Tf 0.11 g');
    expect(find((v) => v['/AS'] === '/Off')['/MK']).toEqual({ '/BG': [0, 0, 0, 0.59] });
    // A /DA read with doubt (rg with two numbers) is left.
    expect(find((v) => v['/T'] === 'u:doubt')['/DA']).toBe('u:/Helv 12 Tf 1 0 rg');
    // The AcroForm's own /DA, and a bookmark's colour.
    expect(find((v) => v['/Type'] === '/Catalog' || '/Fields' in v)['/AcroForm'] ?? find((v) => '/Fields' in v)).toBeDefined();
    expect(JSON.stringify(all)).toContain('"/DA":"u:/Helv 0 Tf 0.11 g"');
    expect(find((v) => v['/Title'] === 'u:One')['/C']).toEqual([0.3, 0.3, 0.3]);
  });

  it('/Thumb is removed only when a file is made, and a colour /Thumb alone gives no file', async () => {
    const thumb = flated('/Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8', Uint8Array.from([255, 0, 0, 0, 0, 255]));
    const alone = build({ objects: [thumb], pages: [{ contents: ['0 g 10 10 50 50 re f'], extra: '/Thumb 3 0 R' }] });
    expect((await grey(alone)).outputs).toEqual([]);
    const coloured = build({ objects: [thumb], pages: [{ contents: ['1 0 0 rg 10 10 50 50 re f'], extra: '/Thumb 3 0 R' }] });
    const { output } = await grey(coloured);
    expect((await values(output!)).find((value) => value?.['/Type'] === '/Page')!['/Thumb']).toBeUndefined();
  });
});

describe('what the new file keeps', () => {
  it('rich.pdf keeps its two bookmarks, its link and note.txt', async () => {
    const { output } = await grey(fixture('rich.pdf'));
    const all = await values(output!);
    expect(all.filter((value) => value && '/Title' in value && '/Parent' in value)).toHaveLength(2);
    expect(all.some((value) => value?.['/Subtype'] === '/Link')).toBe(true);
    expect((await qpdfOn(output!, ['--list-attachments'])).out).toContain('note.txt');
  });

  it('form.pdf keeps its fields and values, tagged.pdf its tags pointing at their text', async () => {
    const formBefore = (await values(fixture('form.pdf'))).filter((value) => value && '/FT' in value).map((value) => [value['/T'], value['/V']]);
    const formAfter = (await values((await grey(fixture('form.pdf'))).output!)).filter((value) => value && '/FT' in value).map((value) => [value['/T'], value['/V']]);
    expect(formAfter).toEqual(formBefore);
    const tagged = (await grey(fixture('tagged.pdf'))).output!;
    const all = await values(tagged);
    expect(all.some((value) => value?.['/Type'] === '/StructTreeRoot')).toBe(true);
    const marks = (text: string[][]) => text.flat().join('\n').match(/\/MCID \d+/g);
    expect(marks(await contents(tagged))).toEqual(marks(await contents(fixture('tagged.pdf'))));
  });
});

describe('progress, the update cap and fixed sentences', () => {
  it('reports reading, then each page counted to the last, then writing up to 100, never going back', async () => {
    const input = build({ pages: Array.from({ length: 5 }, () => ({ contents: ['1 0 0 rg 10 10 50 50 re f'] })) });
    const { progress } = await grey(input);
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    const pages = progress.filter((step) => step.stage === 'working');
    expect(pages.map((step) => (step.stage === 'working' ? step.done : 0))).toEqual([1, 2, 3, 4, 5]);
    for (const step of pages) expect(step).toMatchObject({ unit: 'page', total: 5, writesAfter: true });
    const writing = progress.filter((step) => step.stage === 'writing').map((step) => (step.stage === 'writing' ? step.percent : 0));
    expect(writing.at(-1)).toBe(100);
    for (let index = 1; index < writing.length; index++) expect(writing[index]).toBeGreaterThanOrEqual(writing[index - 1]!);
    expect(progress.findIndex((step) => step.stage === 'writing')).toBeGreaterThan(progress.findIndex((step) => step.stage === 'working'));
  });

  it('an update past its size budget stops with OutputLimit', async () => {
    const small = makeRun({ sizeLimit: () => 64 });
    expect(await failure(grey(build({ pages: [{ contents: ['1 0 0 rg 10 10 50 50 re f'] }] }), { engine: small }))).toBeInstanceOf(OutputLimit);
  });

  it('no error holds page text, a field value or the password', async () => {
    const secret = 'SECRET-text';
    const input = build({
      objects: ['<< /FT /Tx /T (SECRET-field) /V (SECRET-value) /Type /Annot /Subtype /Widget /Rect [0 0 10 10] >>'],
      catalog: '/AcroForm << /Fields [3 0 R] >>',
      pages: [{ resources: `<< ${helvetica} >>`, contents: [`BT /F1 12 Tf 10 10 Td (${secret}) Tj ET`, bigStream(maxContentBytes + 4)], extra: '/Annots [3 0 R]' }],
    });
    const errors = [await failure(grey(input)), await failure(grey(fixture('password.pdf'), { password: 'SECRET-password' })), await failure(grey(input, { engine: makeRun({ sizeLimit: () => 1 }) }))];
    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(`${error!.message} ${error!.stack ?? ''}`).not.toMatch(/SECRET/);
    }
  });
});

describe('stage 2 findings', () => {
  it('no drawing stream decoded, an inheritor and a direct RGB named entry: no file, no error (C1)', async () => {
    const input = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
      { dict: '/Type /XObject /Subtype /Form /BBox [0 0 10 10]', data: latin1('0 g 0 0 1 1 re f') },
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents [] /Resources << /ColorSpace << /CS0 /DeviceRGB >> /ExtGState << /G1 << /SMask << /Type /Mask /S /Luminosity /G 3 0 R >> >> >> >> >>',
    ]);
    expect((await grey(input)).outputs).toEqual([]);
  });

  describe('an ICC CMYK named entry starts white, where the stand-in starts black (C2)', () => {
    const cmykProfile = () => flated('/N 4', profileAs('CMYK'));

    it('is followed by 0 0 0 0 scn and repointed when every stream that selects it was edited, so a shape painted with no colour set stays white', async () => {
      const input = build({
        objects: [cmykProfile()],
        pages: [{ resources: '<< /ColorSpace << /C0 [/ICCBased 3 0 R] >> >>', contents: ['1 0 0 rg 0 0 200 200 re f /C0 cs 20 20 80 80 re f /C0 CS 0.1 0.2 0.3 0.4 SCN 4 w 0 0 m 200 200 l S'] }],
      });
      const { output } = await grey(input);
      const text = (await contents(output!))[0]!.join('').replace(/\s+/g, ' ');
      expect(text).toContain('/C0 cs 0 0 0 0 scn');
      expect(text).toContain('/C0 CS 0 0 0 0 SCN');
      const [entry] = (await spaceEntries(output!)).filter((each) => '/C0' in each);
      expect(entry!['/C0']).toMatch(/^\d+ 0 R$/);
      // The shape painted with the start: white, as the ICC CMYK space starts, not black as the stand-in does.
      const [page] = await draw(output!);
      // (80, 160) from the top is (80, 40) on the page: inside the shape, off the diagonal line.
      for (const value of at(page!, 80, 160)) expect(value).toBeGreaterThanOrEqual(253);
    });

    it('is left in every dictionary when a stream that can select it is left', async () => {
      const input = build({
        objects: [cmykProfile()],
        pages: [
          { resources: '<< /ColorSpace << /C0 [/ICCBased 3 0 R] >> >>', contents: ['/C0 cs 20 20 80 80 re f 0.5 0.5 0.5rg'] },
          { resources: '<< /ColorSpace << /C0 [/ICCBased 3 0 R] >> >>', contents: ['/C0 cs 20 20 80 80 re f 1 0 0 rg 100 100 20 20 re f'] },
        ],
      });
      const { output } = await grey(input);
      for (const entry of await spaceEntries(output!)) if ('/C0' in entry) expect(entry['/C0']).toEqual(['/ICCBased', expect.stringMatching(/ R$/)]);
    });

    it('a DeviceCMYK named entry, which starts black like the stand-in, is still repointed with no start written', async () => {
      const input = build({ pages: [{ resources: '<< /ColorSpace << /C4 /DeviceCMYK >> >>', contents: ['/C4 cs 20 20 80 80 re f'] }] });
      const { output } = await grey(input);
      expect((await contents(output!))[0]!.join('').replace(/\s+/g, ' ')).not.toContain('scn');
      const [entry] = (await spaceEntries(output!)).filter((each) => '/C4' in each);
      expect(entry!['/C4']).toMatch(/^\d+ 0 R$/);
    });
  });

  // Shapes that a quadratic walk turns into minutes or gigabytes: each runs in seconds once the work is linear. The
  // timeouts are far above the linear time and far below the quadratic one.
  it('12,000 pages sharing one indirect /Annots of 12,000 notes: each walked once (S1)', { timeout: 60_000 }, async () => {
    const n = 12_000;
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>'];
    const firstNote = 5;
    const firstPage = firstNote + n;
    objects.push(`<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${firstPage + i} 0 R`).join(' ')}] /Count ${n} >>`);
    objects.push({ dict: '', data: latin1('0 g 0 0 1 1 re f') });
    objects.push(`[${Array.from({ length: n }, (_, i) => `${firstNote + i} 0 R`).join(' ')}]`);
    for (let i = 0; i < n; i++) objects.push('<< /Type /Annot /Subtype /Square /Rect [0 0 1 1] /C [1 0 0] >>');
    for (let i = 0; i < n; i++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 3 0 R /Annots 4 0 R >>');
    const { output } = await grey(pdfOf(objects));
    expect(output).toBeDefined();
  });

  it('6,000 resources dictionaries sharing a soft mask form\'s /ColorSpace of 6,000 entries: one new dictionary, not a copy each (S2)', { timeout: 120_000 }, async () => {
    const pages = 6_000;
    const entries = Array.from({ length: 6_000 }, (_, i) => `/N${i} /DeviceGray`).join(' ');
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>'];
    const firstPage = 6;
    objects.push(`<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${firstPage + i} 0 R`).join(' ')}] /Count ${pages} >>`);
    objects.push(`<< ${entries} >>`);
    objects.push({ dict: '/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /ColorSpace 3 0 R >>', data: latin1('0.5 g 0 0 10 10 re f') });
    objects.push({ dict: '', data: latin1('q /G1 gs Q 1 0 0 rg 0 0 1 1 re f') });
    for (let i = 0; i < pages; i++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 5 0 R /Resources << /ColorSpace 3 0 R /ExtGState << /G1 << /SMask << /Type /Mask /S /Luminosity /G 4 0 R >> >> >> >> >>');
    const { output } = await grey(pdfOf(objects));
    const all = Object.values((await objectsOf(output!)).objects).map((entry) => entry.value);
    const copies = all.filter((value) => value && typeof value === 'object' && !Array.isArray(value) && '/N0' in (value as object));
    // The soft mask form's own dictionary, untouched, and one new one with its entries and the names.
    expect(copies).toHaveLength(2);
    expect(copies.filter((value) => '/GreyRGB' in (value as object))).toHaveLength(1);
  });

  it('12,000 forms with resources of their own sharing one /ColorSpace of 12,000 RGB entries: eligibility worked out once (S3)', { timeout: 60_000 }, async () => {
    const forms = 12_000;
    const entries = Array.from({ length: 12_000 }, (_, i) => `/N${i} /DeviceRGB`).join(' ');
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R] /Count 1 >>', `<< ${entries} >>`];
    // The forms are drawn from the page, so the plain copy (which drops objects nothing refers to) keeps them.
    const xobjects = Array.from({ length: forms }, (_, i) => `/F${i} ${6 + i} 0 R`).join(' ');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 5 0 R /Resources << /ColorSpace 3 0 R /XObject << ${xobjects} >> >> >>`);
    objects.push({ dict: '', data: latin1('/N0 cs 0 0 1 1 re f /F0 Do') });
    for (let i = 0; i < forms; i++) objects.push({ dict: '/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /ColorSpace 3 0 R >>', data: latin1(`/N${i} cs 0 0 1 1 re f`) });
    const { output } = await grey(pdfOf(objects));
    expect(output).toBeDefined();
    // Every stream selecting a name was edited with its start, so the names were repointed.
    const spaces = Object.values((await objectsOf(output!)).objects).map((entry) => entry.value as Record<string, unknown> | undefined).find((value) => value && typeof value === 'object' && '/N0' in value);
    expect(spaces!['/N11999']).toMatch(/^\d+ 0 R$/);
    const formText = Object.values((await objectsOf(output!)).objects).filter((entry) => entry.stream?.dict['/Subtype'] === '/Form').map((entry) => Buffer.from(entry.stream!.data ?? '', 'base64').toString('latin1'));
    expect(formText).toHaveLength(forms);
    expect(formText.every((text) => /cs 0 0 0 scn/.test(text))).toBe(true);
  });

  it('20,000 annotations sharing one /AP whose states dictionary holds 20,000 entries: each read once (R2-1)', { timeout: 60_000 }, async () => {
    // Measured 27 Nov 2026: 2.7 s; the walk per annotation took 41.5 s at 10,000 (the reviewer's figure).
    const n = 20_000;
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'];
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R /Annots [${Array.from({ length: n }, (_, i) => `${8 + i} 0 R`).join(' ')}] >>`);
    objects.push({ dict: '', data: latin1('0 g 0 0 1 1 re f') });
    objects.push({ dict: '/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << >>', data: latin1('0 0 1 rg 0 0 1 1 re f') });
    objects.push(`<< ${Array.from({ length: n }, (_, i) => `/S${i} 5 0 R`).join(' ')} >>`);
    objects.push('<< /N 6 0 R >>');
    for (let i = 0; i < n; i++) objects.push('<< /Type /Annot /Subtype /Square /Rect [0 0 1 1] /AP 7 0 R /AS /S0 >>');
    const { output } = await grey(pdfOf(objects));
    // The one appearance stream was reached and edited.
    const forms = Object.values((await objectsOf(output!)).objects).filter((entry) => entry.stream?.dict['/Subtype'] === '/Form');
    expect(forms.map((entry) => Buffer.from(entry.stream!.data ?? '', 'base64').toString('latin1')).join()).toContain('/GreyRGB cs');
  });

  it('20,000 pages each with resources of their own sharing one /Pattern dictionary of 20,000 entries: walked once (R2-2)', { timeout: 60_000 }, async () => {
    // A shared /Pattern dictionary, as qpdf's own page listing does not expand patterns (a shared /XObject dictionary
    // costs P × M in readPages' qpdf JSON, a follow-up for every page tool). Measured 27 Nov 2026: 3.9 s, against
    // 115.6 s for the walk per resources dictionary.
    const n = 20_000;
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${6 + i} 0 R`).join(' ')}] /Count ${n} >>`];
    objects.push({ dict: '', data: latin1('/Pattern cs /P0 scn 0 0 1 1 re f') });
    objects.push(`<< ${Array.from({ length: n }, (_, i) => `/P${i} 5 0 R`).join(' ')} >>`);
    objects.push({ dict: '/PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 1 1] /XStep 1 /YStep 1 /Resources << >>', data: latin1('1 0 0 rg 0 0 1 1 re f') });
    for (let i = 0; i < n; i++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 3 0 R /Resources << /Pattern 4 0 R >> >>');
    const { output } = await grey(pdfOf(objects));
    const pattern = Object.values((await objectsOf(output!)).objects).find((entry) => entry.stream?.dict['/PatternType'] === 1)!;
    expect(Buffer.from(pattern.stream!.data ?? '', 'base64').toString('latin1')).toContain('/GreyRGB cs');
  });

  it('a shared /XObject dictionary met again names the same first page for its forms', async () => {
    // Pages 2 and 3 share /XObject 4 0 R, whose form decodes past the small cap given; page 1 draws nothing of it.
    const small = makeRun({ maxContentBytes: 40 });
    const input = pdfOf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [6 0 R 7 0 R 8 0 R] /Count 3 >>',
      { dict: '', data: latin1('q Q') },
      '<< /Big 5 0 R >>',
      { dict: '/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << >>', data: latin1('1 0 0 rg 0 0 1 1 re f 0 0 1 rg 0 0 1 1 re f 0 1 0 rg 0 0 1 1 re f') },
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 3 0 R /Resources << >> >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 3 0 R /Resources << /XObject 4 0 R >> >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 3 0 R /Resources << /XObject 4 0 R >> >>',
    ]);
    const error = await failure(grey(input, { engine: small }));
    expect(error).toBeInstanceOf(PageTooLarge);
    expect((error as PageTooLarge).page).toBe(2);
  });

  const type3 = (procs: string) => `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1 1] /FontMatrix [1 0 0 1 0 0] /CharProcs ${procs} /Encoding << /Differences [97 /a] >> /FirstChar 97 /LastChar 97 /Widths [1] >>`;

  it('20,000 Type 3 fonts sharing one /CharProcs of 20,000 entries: read once (R3-1 a)', { timeout: 60_000 }, async () => {
    const n = 20_000;
    // 1 catalog, 2 pages, 3 page, 4 content, 5 glyph, 6 /CharProcs (n entries), 7 the /Font dictionary, 8.. fonts
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'];
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R /Resources << /Font 7 0 R >> >>');
    objects.push({ dict: '', data: latin1('BT /F0 1 Tf (a) Tj ET') });
    objects.push({ dict: '', data: latin1('1 0 d0 1 0 0 rg 0 0 1 1 re f') });
    objects.push(`<< ${Array.from({ length: n }, (_, i) => `/g${i} 5 0 R`).join(' ')} >>`);
    objects.push(`<< ${Array.from({ length: n }, (_, i) => `/F${i} ${8 + i} 0 R`).join(' ')} >>`);
    for (let i = 0; i < n; i++) objects.push(type3('6 0 R'));
    const { output } = await grey(pdfOf(objects));
    const glyph = Object.values((await objectsOf(output!)).objects).map((entry) => Buffer.from(entry.stream?.data ?? '', 'base64').toString('latin1')).find((text) => text.includes('d0'));
    expect(glyph).toContain('/GreyRGB cs');
  });

  it('one Type 3 font with a direct /CharProcs of 20,000 entries named by 20,000 pages with their own /Font: read once (R3-1 b)', { timeout: 60_000 }, async () => {
    const n = 20_000;
    // 1 catalog, 2 pages, 3 content, 4 glyph, 5 the font, 6.. pages
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${6 + i} 0 R`).join(' ')}] /Count ${n} >>`];
    objects.push({ dict: '', data: latin1('BT /F 1 Tf (a) Tj ET') });
    objects.push({ dict: '', data: latin1('1 0 d0 1 0 0 rg 0 0 1 1 re f') });
    objects.push(type3(`<< ${Array.from({ length: n }, (_, i) => `/g${i} 4 0 R`).join(' ')} >>`));
    for (let i = 0; i < n; i++) objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 3 0 R /Resources << /Font << /F 5 0 R >> >> >>');
    const { output } = await grey(pdfOf(objects));
    expect(output).toBeDefined();
  });

  it('20,000 fields sharing one /DA string object of 100 KB: read and written once, in its own object', { timeout: 60_000 }, async () => {
    const n = 20_000;
    const da = `/Helv 12 Tf ${'0 g '.repeat(25_000)}1 0 0 rg`;
    // 1 catalog, 2 pages, 3 page, 4 content, 5 the /DA string, 6.. fields
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [' + Array.from({ length: n }, (_, i) => `${6 + i} 0 R`).join(' ') + '] >> >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'];
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R >>');
    objects.push({ dict: '', data: latin1('0 g 0 0 1 1 re f') });
    objects.push(`(${da})`);
    for (let i = 0; i < n; i++) objects.push(`<< /FT /Tx /T (f${i}) /DA 5 0 R >>`);
    const { output } = await grey(pdfOf(objects));
    const all = Object.values((await objectsOf(output!)).objects).map((entry) => entry.value);
    const strings = all.filter((value) => typeof value === 'string' && value.includes('Helv'));
    expect(strings).toHaveLength(1);
    expect(strings[0]).toMatch(/0\.3 g$/);
    // Each field still names the one string object.
    expect(all.filter((value) => value && typeof value === 'object' && typeof (value as Record<string, unknown>)['/DA'] === 'string' && /^\d+ 0 R$/.test((value as Record<string, string>)['/DA']!))).toHaveLength(n);
  });

  it('10,000 notes sharing one /C array of 1,000,000 numbers, and 20,000 fields sharing one /Kids array: each read once', { timeout: 60_000 }, async () => {
    const notes = 10_000;
    const long = `[${'0.5 '.repeat(1_000_000)}]`;
    // 1 catalog, 2 pages, 3 page, 4 content, 5 the long array, 6.. notes
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'];
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R /Annots [${Array.from({ length: notes }, (_, i) => `${6 + i} 0 R`).join(' ')}] >>`);
    objects.push({ dict: '', data: latin1('1 0 0 rg 0 0 1 1 re f') });
    objects.push(long);
    for (let i = 0; i < notes; i++) objects.push('<< /Type /Annot /Subtype /Square /Rect [0 0 1 1] /C 5 0 R >>');
    expect((await grey(pdfOf(objects))).output).toBeDefined();

    const fields = 20_000;
    // 1 catalog, 2 pages, 3 page, 4 content, 5 the shared /Kids array, 6 a kid, 7.. fields
    const form: (string | { dict: string; data: Uint8Array })[] = [`<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${Array.from({ length: fields }, (_, i) => `${7 + i} 0 R`).join(' ')}] >> >>`, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'];
    form.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R >>');
    form.push({ dict: '', data: latin1('1 0 0 rg 0 0 1 1 re f') });
    form.push(`[${Array.from({ length: fields }, () => '6 0 R').join(' ')}]`);
    form.push('<< /FT /Tx /T (kid) /DA (/Helv 12 Tf 1 0 0 rg) >>');
    for (let i = 0; i < fields; i++) form.push(`<< /FT /Tx /T (f${i}) /Kids 5 0 R >>`);
    const { output } = await grey(pdfOf(form));
    expect(Object.values((await objectsOf(output!)).objects).some((entry) => (entry.value as Record<string, unknown> | undefined)?.['/DA'] === 'u:/Helv 12 Tf 0.3 g')).toBe(true);
  });

  // Page i's contents are streams i and i + 1, so a doubt at the end reaches page 1 through every page. The old loop
  // took one pass over every page per step (43.9 s here against 18.7 s, measured 27 Nov 2026); this checks the outcome.
  it('20,000 pages chained by shared streams, the last stream in doubt: every page left', { timeout: 180_000 }, async () => {
    const n = 20_000;
    const firstStream = 3;
    const firstPage = firstStream + n + 1;
    const objects: (string | { dict: string; data: Uint8Array })[] = ['<< /Type /Catalog /Pages 2 0 R >>'];
    objects.push(`<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${firstPage + i} 0 R`).join(' ')}] /Count ${n} >>`);
    for (let i = 0; i <= n; i++) objects.push({ dict: '', data: latin1(i === n ? '0.5 0.5 0.5rg\n' : '1 0 0 rg 0 0 1 1 re f\n') });
    for (let i = 0; i < n; i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents [${firstStream + i} 0 R ${firstStream + i + 1} 0 R] >>`);
    expect((await grey(pdfOf(objects))).outputs).toEqual([]);
  });
});
