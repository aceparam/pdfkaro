// Decoding drawing instructions (`decodeContent` in src/engines/content.ts): the filters and keys that reach
// the reader after the real plain copy (design decision 2's table, put through qpdf as every page tool does), each
// step's rules, the 64 MiB cap per step, and every byte counted through the caller's budget. No request may be made.

import { describe, expect, it } from 'vitest';
import { Inflate } from 'fflate';
import { deflateSync } from 'node:zlib';
import { decodeContent, maxContentBytes, type DecodedContent, type Spend } from '../../src/engines/content';
import type { Dict } from '../../src/engines/qpdf-json';
import {
  BudgetRefused,
  ascii85,
  asciiHex,
  dictOf,
  flate,
  join,
  latin1,
  lzw,
  noRequests,
  pagePdf,
  plainOf,
  plainStreams,
  pngPredict,
  recordingBudget,
  runLength,
  tiffPredict,
  type PdfObject,
} from './content-helpers';

noRequests('the content reader');

const none = () => undefined;
const free: Spend = () => {};
const decode = (raw: Uint8Array, dict: Dict, spend = free, resolve: (value: unknown) => unknown = none): DecodedContent => decodeContent(raw, dict, resolve, Inflate, spend);
const decoded = (data: Uint8Array): DecodedContent => ({ kind: 'decoded', data });

/** 480 bytes of drawing instructions: a whole number of rows for every predictor used here. */
const content = latin1('q 1 0 0 rg 0 0 50 50 re f Q '.repeat(17).padEnd(480, ' '));
expect(content.length).toBe(480);

/** LZW codes as given, each at the width the decoder reads it at. */
function lzwCodes(codes: number[], earlyChange: 0 | 1 = 1): Uint8Array {
  const bits: number[] = [];
  let next = 258;
  let started = false;
  for (const code of codes) {
    const reach = next + earlyChange;
    const width = reach < 512 ? 9 : reach < 1024 ? 10 : reach < 2048 ? 11 : 12;
    for (let bit = width - 1; bit >= 0; bit--) bits.push((code >> bit) & 1);
    if (code === 256) {
      next = 258;
      started = false;
    } else if (code !== 257) {
      if (started && next < 4096) next++;
      started = true;
    }
  }
  while (bits.length % 8 !== 0) bits.push(0);
  const out = new Uint8Array(bits.length / 8);
  bits.forEach((bit, index) => (out[index >> 3]! |= bit << (7 - (index & 7))));
  return out;
}

// ---------------------------------------------------------------------------

type Expect = 'decodes' | 'not-decoded' | 'plain-fails' | 'partial';
type Case = {
  name: string;
  dict: string;
  data: Uint8Array;
  /** The /Filter left in the plain copy (a name, an array, or 'ref'). */
  filter: unknown;
  parms?: unknown;
  /** Keys kept beside /Filter and /DecodeParms. */
  kept?: Record<string, unknown>;
  /** Whether the raw data is left exactly as it was. */
  same?: boolean;
  outcome: Expect;
  extra?: PdfObject[];
  original?: Uint8Array;
};

const p12 = '<< /Predictor 12 /Columns 16 >>';
const rows = (bytes: number, pixel = 1) => pngPredict(content, bytes, pixel);
const encodedFor = (names: string[], data: Uint8Array): Uint8Array => {
  let out = data;
  for (const name of [...names].reverse()) {
    if (name === 'Fl') out = flate(out);
    else if (name === 'RL') out = runLength(out);
    else if (name === 'LZW') out = lzw(out);
    else if (name === 'LZW0') out = lzw(out, 0);
    else if (name === 'A85') out = ascii85(out);
    else if (name === 'AHx') out = asciiHex(out);
  }
  return out;
};

const cases: Case[] = [
  { name: 'no filter', dict: '', data: content, filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'an empty filter array', dict: '/Filter []', data: content, filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'a null filter', dict: '/Filter null', data: content, filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'an empty stream', dict: '', data: new Uint8Array(0), filter: '/FlateDecode', outcome: 'decodes', original: new Uint8Array(0) },
  { name: 'Flate', dict: '/Filter /FlateDecode', data: flate(content), filter: '/FlateDecode', same: true, outcome: 'decodes' },
  { name: 'Flate, Predictor 12', dict: `/Filter /FlateDecode /DecodeParms ${p12}`, data: flate(rows(16)), filter: '/FlateDecode', parms: { '/Predictor': 12, '/Columns': 16 }, same: true, outcome: 'decodes' },
  { name: 'Flate, Predictor 2', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 2 /Columns 16 >>', data: flate(tiffPredict(content, 16, 1)), filter: '/FlateDecode', parms: { '/Predictor': 2, '/Columns': 16 }, same: true, outcome: 'decodes' },
  { name: 'Flate, Predictor 1', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 1 >>', data: flate(content), filter: '/FlateDecode', parms: { '/Predictor': 1 }, same: true, outcome: 'decodes' },
  { name: 'Flate, Predictor 99', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 99 >>', data: flate(content), filter: '/FlateDecode', parms: { '/Predictor': 99 }, same: true, outcome: 'not-decoded' },
  { name: 'Flate, Columns 0', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 0 >>', data: flate(rows(16)), filter: '/FlateDecode', parms: { '/Predictor': 12, '/Columns': 0 }, same: true, outcome: 'not-decoded' },
  { name: 'Flate, BPC 4', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 16 /BitsPerComponent 4 >>', data: flate(rows(8)), filter: '/FlateDecode', parms: { '/Predictor': 12, '/Columns': 16, '/BitsPerComponent': 4 }, same: true, outcome: 'decodes' },
  { name: 'Flate, BPC 16', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 8 /BitsPerComponent 16 >>', data: flate(rows(16, 2)), filter: '/FlateDecode', parms: { '/Predictor': 12, '/Columns': 8, '/BitsPerComponent': 16 }, same: true, outcome: 'decodes' },
  { name: 'Flate, Colors 3', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 16 /Colors 3 >>', data: flate(rows(48, 3)), filter: '/FlateDecode', parms: { '/Predictor': 12, '/Columns': 16, '/Colors': 3 }, same: true, outcome: 'decodes' },
  { name: '/Fl', dict: '/Filter /Fl', data: flate(content), filter: '/Fl', same: true, outcome: 'decodes' },
  { name: '[/FlateDecode] with Predictor 12', dict: `/Filter [/FlateDecode] /DecodeParms [${p12}]`, data: flate(rows(16)), filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'damaged Flate', dict: '/Filter /FlateDecode', data: latin1('\x78\x9c\xff\xff\xff\xff garbage'), filter: '/FlateDecode', same: true, outcome: 'not-decoded' },
  { name: 'cut-off Flate', dict: '/Filter /FlateDecode', data: flate(content).subarray(0, 30), filter: '/FlateDecode', same: true, outcome: 'not-decoded' },
  { name: 'RunLength', dict: '/Filter /RunLengthDecode', data: runLength(content), filter: '/RunLengthDecode', same: true, outcome: 'decodes' },
  { name: '/RL', dict: '/Filter /RL', data: runLength(content), filter: '/RL', same: true, outcome: 'decodes' },
  { name: 'LZW', dict: '/Filter /LZWDecode', data: lzw(content), filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'LZW, EarlyChange 0', dict: '/Filter /LZWDecode /DecodeParms << /EarlyChange 0 >>', data: lzw(content, 0), filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'LZW, PNG predictor', dict: `/Filter /LZWDecode /DecodeParms ${p12}`, data: lzw(rows(16)), filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'LZW, TIFF predictor', dict: '/Filter /LZWDecode /DecodeParms << /Predictor 2 /Columns 16 >>', data: lzw(tiffPredict(content, 16, 1)), filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'LZW, Predictor 99', dict: '/Filter /LZWDecode /DecodeParms << /Predictor 99 >>', data: lzw(content), filter: '/LZWDecode', parms: { '/Predictor': 99 }, same: true, outcome: 'not-decoded' },
  ...(['ASCII85Decode', 'A85', 'ASCIIHexDecode', 'AHx'] as const).map((name): Case => ({ name, dict: `/Filter /${name}`, data: encodedFor([name.startsWith('A85') || name.startsWith('ASCII85') ? 'A85' : 'AHx'], content), filter: '/FlateDecode', outcome: 'decodes' })),
  { name: '[/A85 /A85]', dict: '/Filter [/A85 /A85]', data: encodedFor(['A85', 'A85'], content), filter: '/FlateDecode', outcome: 'decodes' },
  { name: '[/ASCII85Decode /FlateDecode]', dict: '/Filter [/ASCII85Decode /FlateDecode]', data: encodedFor(['A85', 'Fl'], content), filter: '/FlateDecode', outcome: 'decodes' },
  { name: '[/ASCII85Decode /FlateDecode], predictor on Flate', dict: `/Filter [/ASCII85Decode /FlateDecode] /DecodeParms [null ${p12}]`, data: ascii85(flate(rows(16))), filter: '/FlateDecode', outcome: 'decodes' },
  { name: '[/ASCIIHexDecode /FlateDecode]', dict: '/Filter [/ASCIIHexDecode /FlateDecode]', data: encodedFor(['AHx', 'Fl'], content), filter: '/FlateDecode', outcome: 'decodes' },
  { name: '[/ASCII85Decode /LZWDecode]', dict: '/Filter [/ASCII85Decode /LZWDecode]', data: encodedFor(['A85', 'LZW'], content), filter: '/FlateDecode', outcome: 'decodes' },
  { name: '[/FlateDecode /FlateDecode]', dict: '/Filter [/FlateDecode /FlateDecode]', data: encodedFor(['Fl', 'Fl'], content), filter: '/FlateDecode', outcome: 'decodes' },
  ...(
    [
      ['[/ASCII85Decode /RunLengthDecode]', ['A85', 'RL']],
      ['[/ASCIIHexDecode /RunLengthDecode]', ['AHx', 'RL']],
      ['[/RunLengthDecode /FlateDecode]', ['RL', 'Fl']],
      ['[/FlateDecode /RunLengthDecode]', ['Fl', 'RL']],
      ['[/LZWDecode /RunLengthDecode]', ['LZW', 'RL']],
      ['[/A85 /AHx /RL]', ['A85', 'AHx', 'RL']],
      ['[/RL /RL]', ['RL', 'RL']],
      ['[/A85 /RL]', ['A85', 'RL']],
      ['[/AHx /RL]', ['AHx', 'RL']],
      ['[/LZW /RL]', ['LZW', 'RL']],
      ['[/Fl /RL]', ['Fl', 'RL']],
    ] as const
  ).map(([filter, steps]): Case => ({ name: filter, dict: `/Filter ${filter}`, data: encodedFor([...steps], content), filter: filter.slice(1, -1).split(' '), same: true, outcome: 'decodes' })),
  { name: '[/LZWDecode /RunLengthDecode], EarlyChange 0', dict: '/Filter [/LZWDecode /RunLengthDecode] /DecodeParms [<< /EarlyChange 0 >> null]', data: encodedFor(['LZW0', 'RL'], content), filter: ['/LZWDecode', '/RunLengthDecode'], parms: [{ '/EarlyChange': 0 }, null], same: true, outcome: 'decodes' },
  { name: '[/RunLengthDecode /LZWDecode], PNG predictor', dict: `/Filter [/RunLengthDecode /LZWDecode] /DecodeParms [null ${p12}]`, data: runLength(lzw(rows(16))), filter: ['/RunLengthDecode', '/LZWDecode'], parms: [null, { '/Predictor': 12, '/Columns': 16 }], same: true, outcome: 'decodes' },
  { name: '[/RunLengthDecode /FlateDecode], TIFF predictor', dict: '/Filter [/RunLengthDecode /FlateDecode] /DecodeParms [null << /Predictor 2 /Columns 16 >>]', data: runLength(flate(tiffPredict(content, 16, 1))), filter: ['/RunLengthDecode', '/FlateDecode'], parms: [null, { '/Predictor': 2, '/Columns': 16 }], same: true, outcome: 'decodes' },
  { name: '[/ASCII85Decode /FooDecode]', dict: '/Filter [/ASCII85Decode /FooDecode]', data: ascii85(content), filter: ['/ASCII85Decode', '/FooDecode'], same: true, outcome: 'not-decoded' },
  { name: '[/FooDecode /ASCII85Decode]', dict: '/Filter [/FooDecode /ASCII85Decode]', data: ascii85(content), filter: ['/FooDecode', '/ASCII85Decode'], same: true, outcome: 'not-decoded' },
  { name: '[/ASCII85Decode /DCTDecode]', dict: '/Filter [/ASCII85Decode /DCTDecode]', data: ascii85(content), filter: ['/ASCII85Decode', '/DCTDecode'], same: true, outcome: 'not-decoded' },
  { name: '/CCITTFaxDecode', dict: '/Filter /CCITTFaxDecode', data: content, filter: '/CCITTFaxDecode', same: true, outcome: 'not-decoded' },
  { name: '/Crypt (identity)', dict: '/Filter /Crypt', data: content, filter: '/FlateDecode', outcome: 'decodes' },
  { name: 'a reference to a name', dict: '/Filter 5 0 R', data: flate(content), filter: 'ref', same: true, outcome: 'decodes', extra: ['/FlateDecode'] },
  { name: 'a reference to an array', dict: '/Filter 5 0 R', data: runLength(content), filter: 'ref', same: true, outcome: 'decodes', extra: ['[/RunLengthDecode]'] },
  { name: 'Flate with /DP', dict: `/Filter /FlateDecode /DP ${p12}`, data: flate(rows(16)), filter: '/FlateDecode', kept: { '/DP': { '/Predictor': 12, '/Columns': 16 } }, same: true, outcome: 'not-decoded' },
  { name: '/F with no /Filter', dict: '/F /FlateDecode', data: flate(content), filter: '/FlateDecode', kept: { '/F': '/FlateDecode' }, outcome: 'not-decoded' },
  { name: 'Flate with /FFilter', dict: '/Filter /FlateDecode /FFilter /LZWDecode', data: flate(content), filter: '/FlateDecode', kept: { '/FFilter': '/LZWDecode' }, same: true, outcome: 'not-decoded' },
  { name: '/BPC in /DecodeParms', dict: '/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 16 /BPC 8 >>', data: flate(rows(16)), filter: '/FlateDecode', parms: { '/Predictor': 12, '/Columns': 16, '/BPC': 8 }, same: true, outcome: 'not-decoded' },
  { name: 'a name filter with a one-item /DecodeParms array', dict: `/Filter /FlateDecode /DecodeParms [${p12}]`, data: flate(rows(16)), filter: '/FlateDecode', parms: [{ '/Predictor': 12, '/Columns': 16 }], same: true, outcome: 'not-decoded' },
  { name: '[/RunLengthDecode /FlateDecode] with a dictionary /DecodeParms', dict: '/Filter [/RunLengthDecode /FlateDecode] /DecodeParms << /Predictor 1 >>', data: runLength(flate(content)), filter: ['/RunLengthDecode', '/FlateDecode'], parms: { '/Predictor': 1 }, same: true, outcome: 'not-decoded' },
  { name: 'no filter but /DP', dict: `/DP ${p12}`, data: content, filter: '/FlateDecode', kept: { '/DP': { '/Predictor': 12, '/Columns': 16 } }, outcome: 'not-decoded' },
  { name: '[/ASCII85Decode /FlateDecode] with damaged Flate', dict: '/Filter [/ASCII85Decode /FlateDecode]', data: ascii85(join(flate(content).subarray(0, 40), latin1('\xff\xff\xff\xff\xff\xff'))), filter: '/FlateDecode', outcome: 'partial' },
  { name: 'cut-off LZW', dict: '/Filter /LZWDecode', data: lzw(content).subarray(0, 60), filter: '/FlateDecode', outcome: 'partial' },
  { name: 'damaged LZW', dict: '/Filter /LZWDecode', data: lzwCodes([256, 65, 400, 257]), filter: undefined, outcome: 'plain-fails' },
  { name: 'ASCII85 with a byte outside its alphabet', dict: '/Filter /ASCII85Decode', data: latin1('87cURvD]i~>'), filter: undefined, outcome: 'plain-fails' },
  { name: 'ASCII85 with a leading <~', dict: '/Filter /ASCII85Decode', data: join(latin1('<~'), ascii85(content)), filter: undefined, outcome: 'plain-fails' },
  { name: 'damaged ASCIIHex', dict: '/Filter /ASCIIHexDecode', data: latin1('71 20 51 xz>'), filter: undefined, outcome: 'plain-fails' },
];

describe('what reaches the reader after the plain copy (design decision 2)', () => {
  for (const each of cases) {
    it(each.name, async () => {
      const file = pagePdf([{ dict: each.dict, data: each.data }], { extra: each.extra });
      if (each.outcome === 'plain-fails') {
        await expect(plainOf(file)).rejects.toThrow('qpdf could not read the file.');
        return;
      }
      const streams = await plainStreams(await plainOf(file));
      const id = streams.pages[0]![0]!;
      const dict = dictOf(streams, id);
      const raw = streams.raw.get(id)!;
      if (each.filter === 'ref') {
        expect(dict['/Filter']).toMatch(/^\d+ \d+ R$/);
        expect(streams.resolve(dict['/Filter'])).toEqual(each.extra![0] === '/FlateDecode' ? '/FlateDecode' : ['/RunLengthDecode']);
      } else expect(dict['/Filter']).toEqual(each.filter);
      expect(dict['/DecodeParms']).toEqual(each.parms);
      const known = new Set(['/Filter', '/DecodeParms', '/Length']);
      const others = Object.fromEntries(Object.entries(dict).filter(([key]) => !known.has(key)));
      expect(others).toEqual(each.kept ?? {});
      if (each.same) expect(raw).toEqual(each.data);
      const result = decode(raw, dict, free, streams.resolve);
      if (each.outcome === 'decodes') expect(result).toEqual(decoded(each.original ?? content));
      else if (each.outcome === 'not-decoded') expect(result).toEqual({ kind: 'not-decoded' });
      else expect(result.kind).toBe('decoded');
    });
  }
});

// ---------------------------------------------------------------------------

const chain = (...names: string[]): Dict => ({ '/Filter': names.map((name) => `/${name}`) });
const lone = (name: string): Dict => ({ '/Filter': `/${name}` });

describe('filters outside the set', () => {
  it.each([
    ['DCT', lone('DCTDecode'), content],
    ['CCITT', lone('CCITTFaxDecode'), content],
    ['an unknown filter', lone('FooDecode'), content],
    ['a lone LZW', lone('LZWDecode'), lzw(content)],
    ['a lone ASCII85', lone('ASCII85Decode'), ascii85(content)],
    ['a lone ASCIIHex', lone('ASCIIHexDecode'), asciiHex(content)],
    ['[/Fl /Fl]', chain('FlateDecode', 'FlateDecode'), flate(flate(content))],
    ['[/A85 /Fl]', chain('ASCII85Decode', 'FlateDecode'), ascii85(flate(content))],
    ['five steps', chain('RL', 'RL', 'RL', 'RL', 'RL'), encodedFor(['RL', 'RL', 'RL', 'RL', 'RL'], content)],
    ['no filter', {}, content],
    ['an empty array', { '/Filter': [] }, content],
    ['a reference inside the array', { '/Filter': ['5 0 R', '/RL'] }, runLength(runLength(content))],
  ])('%s is not decoded', (_, dict, data) => {
    const spend = recordingBudget();
    expect(decode(data, dict, spend, () => '/RunLengthDecode')).toEqual({ kind: 'not-decoded' });
    expect(spend.total).toBe(0);
  });

  it('takes a four-step chain and every short name', () => {
    expect(decode(encodedFor(['A85', 'AHx', 'RL', 'Fl'], content), chain('A85', 'AHx', 'RL', 'Fl'))).toEqual(decoded(content));
    expect(decode(encodedFor(['LZW', 'RL'], content), chain('LZW', 'RL'))).toEqual(decoded(content));
    expect(decode(flate(content), { '/Filter': ['/Fl'] })).toEqual(decoded(content));
    expect(decode(runLength(content), { '/Filter': ['/RL'], '/DecodeParms': [null] })).toEqual(decoded(content));
  });

  it('follows one reference for /Filter and /DecodeParms', () => {
    const values: Record<string, unknown> = { '7 0 R': ['/RunLengthDecode', '/FlateDecode'], '8 0 R': [null, { '/Predictor': 12, '/Columns': 16 }] };
    const resolve = (value: unknown) => values[value as string];
    expect(decode(runLength(flate(rows(16))), { '/Filter': '7 0 R', '/DecodeParms': '8 0 R' }, free, resolve)).toEqual(decoded(content));
    expect(decode(runLength(flate(rows(16))), { '/Filter': '7 0 R', '/DecodeParms': [null, '9 0 R'] }, free, resolve)).toEqual({ kind: 'not-decoded' });
  });

  it('refuses keys PDF.js reads first and shapes that do not match', () => {
    for (const key of ['/F', '/FFilter', '/FDecodeParms', '/DP']) expect(decode(flate(content), { '/Filter': '/FlateDecode', [key]: '/FlateDecode' }), key).toEqual({ kind: 'not-decoded' });
    expect(decode(flate(rows(16)), { '/Filter': '/FlateDecode', '/DecodeParms': { '/Predictor': 12, '/Columns': 16, '/BPC': 8 } })).toEqual({ kind: 'not-decoded' });
    expect(decode(flate(rows(16)), { '/Filter': '/FlateDecode', '/DecodeParms': [{ '/Predictor': 12, '/Columns': 16 }] })).toEqual({ kind: 'not-decoded' });
    expect(decode(runLength(flate(content)), { '/Filter': ['/RL', '/Fl'], '/DecodeParms': { '/Predictor': 1 } })).toEqual({ kind: 'not-decoded' });
    expect(decode(runLength(flate(content)), { '/Filter': ['/RL', '/Fl'], '/DecodeParms': [null] })).toEqual({ kind: 'not-decoded' });
    // Parameters on a step that takes none, and keys a step does not take.
    expect(decode(runLength(content), { '/Filter': '/RL', '/DecodeParms': { '/Predictor': 12 } })).toEqual({ kind: 'not-decoded' });
    expect(decode(flate(content), { '/Filter': '/Fl', '/DecodeParms': { '/EarlyChange': 0 } })).toEqual({ kind: 'not-decoded' });
  });
});

describe('each step, strictly', () => {
  const rl = (data: Uint8Array) => decode(data, lone('RunLengthDecode'));

  it('Flate: a zlib header with no preset dictionary, reaching its final block; trailing bytes and the checksum are not looked at', () => {
    const good = flate(content);
    expect(decode(join(good.subarray(0, 2), latin1('\x03\x00')), lone('FlateDecode'))).toEqual(decoded(new Uint8Array(0)));
    expect(decode(join(latin1('\x78\x00'), good.subarray(2)), lone('FlateDecode'))).toEqual({ kind: 'not-decoded' });
    expect(decode(join(latin1('\x78\xbb'), good.subarray(2)), lone('FlateDecode'))).toEqual({ kind: 'not-decoded' });
    expect(decode(good.subarray(0, good.length - 10), lone('FlateDecode'))).toEqual({ kind: 'not-decoded' });
    const wrongSum = good.slice();
    wrongSum[wrongSum.length - 1]! ^= 0xff;
    expect(decode(wrongSum, lone('FlateDecode'))).toEqual(decoded(content));
    expect(decode(join(good, latin1('trailing bytes')), lone('FlateDecode'))).toEqual(decoded(content));
  });

  it('predictors: the defaults, tags, whole rows, TIFF at 8 bits only', () => {
    const parms = (more: Dict): Dict => ({ '/Filter': '/FlateDecode', '/DecodeParms': more });
    // Defaults: Colors 1, BitsPerComponent 8, Columns 1.
    const oneColumn = pngPredict(content, 1, 1);
    expect(decode(flate(oneColumn), parms({ '/Predictor': 15 }))).toEqual(decoded(content));
    const badTag = rows(16).slice();
    badTag[17] = 5;
    expect(decode(flate(badTag), parms({ '/Predictor': 12, '/Columns': 16 }))).toEqual({ kind: 'not-decoded' });
    expect(decode(flate(rows(16).subarray(0, 100)), parms({ '/Predictor': 12, '/Columns': 16 }))).toEqual({ kind: 'not-decoded' });
    expect(decode(flate(tiffPredict(content, 16, 1)), parms({ '/Predictor': 2, '/Columns': 32, '/BitsPerComponent': 4 }))).toEqual({ kind: 'not-decoded' });
    expect(decode(flate(content.subarray(0, 470)), parms({ '/Predictor': 2, '/Columns': 16 }))).toEqual({ kind: 'not-decoded' });
    for (const bad of [{ '/Predictor': 3 }, { '/Predictor': 12, '/Colors': 33 }, { '/Predictor': 12, '/BitsPerComponent': 3 }, { '/Predictor': 12, '/Columns': 2 ** 24 + 1 }, { '/Predictor': 12, '/Columns': 1.5 }])
      expect(decode(flate(rows(16)), parms(bad)), JSON.stringify(bad)).toEqual({ kind: 'not-decoded' });
  });

  it('predictors: a row past 32 bits, and a row longer than its input, refused with nothing allocated', () => {
    const parms = (more: Dict): Dict => ({ '/Filter': '/FlateDecode', '/DecodeParms': more });
    expect(decode(flate(rows(16)), parms({ '/Predictor': 12, '/Colors': 32, '/BitsPerComponent': 16, '/Columns': 2 ** 24 }))).toEqual({ kind: 'not-decoded' });
    // 15 colours of 8 bits in 2^24 columns: rows of 240 MiB, from 480 bytes of input.
    const before = process.memoryUsage().arrayBuffers;
    let peak = before;
    const spend = () => {
      peak = Math.max(peak, process.memoryUsage().arrayBuffers);
    };
    expect(decode(flate(rows(16)), parms({ '/Predictor': 12, '/Colors': 15, '/Columns': 2 ** 24 }), spend)).toEqual({ kind: 'not-decoded' });
    expect(decode(flate(content), parms({ '/Predictor': 2, '/Colors': 15, '/Columns': 2 ** 24 }), spend)).toEqual({ kind: 'not-decoded' });
    peak = Math.max(peak, process.memoryUsage().arrayBuffers);
    expect(peak - before).toBeLessThan(16 * 1024 * 1024);
  });

  it('RunLength: needs its end mark and whole runs', () => {
    expect(rl(latin1('\x02abc\xfex\x80ignored'))).toEqual(decoded(latin1('abcxxx')));
    expect(rl(latin1('\x02abc'))).toEqual({ kind: 'not-decoded' });
    expect(rl(latin1('\x05abc'))).toEqual({ kind: 'not-decoded' });
    expect(rl(latin1('\xfe'))).toEqual({ kind: 'not-decoded' });
  });

  const viaLzw = (data: Uint8Array, earlyChange?: number) => decode(data, { '/Filter': ['/LZWDecode', '/RunLengthDecode'], ...(earlyChange === undefined ? {} : { '/DecodeParms': [{ '/EarlyChange': earlyChange }, null] }) });
  const rlOf = (data: Uint8Array) => runLength(data);

  it('LZW: both EarlyChange values, past the width changes', () => {
    // Enough distinct pairs to pass 512, 1,024 and 2,048 entries.
    const long = rlOf(Uint8Array.from({ length: 30_000 }, (_, index) => (index * 7 + (index >> 8)) & 0xff));
    for (const early of [0, 1] as const) {
      expect(viaLzw(lzw(long, early), early)).toEqual(decoded(decodeRl(long)));
      // Read with the other value, the widths change at the wrong code.
      expect(viaLzw(lzw(long, early), 1 - early)).not.toEqual(decoded(decodeRl(long)));
    }
  });

  it('LZW: the first code after a clear below 256, KwKwK only with a previous code, no 4,097th entry, an end code', () => {
    const end = rlOf(new Uint8Array(0));
    const literal = (bytes: Uint8Array) => [...bytes];
    const codes = (list: number[]) => viaLzw(lzwCodes(list));
    expect(codes([256, ...literal(end), 257])).toEqual(decoded(new Uint8Array(0)));
    expect(codes([256, 258, 257])).toEqual({ kind: 'not-decoded' });
    expect(codes([256, 0x41, 256, 300, 257])).toEqual({ kind: 'not-decoded' });
    // KwKwK: 0x02 'a' 'a' 'a' then the end mark, spelt 0x02, 'a', 259 ('aa'), 128.
    expect(codes([256, 0x02, 0x61, 259, 128, 257])).toEqual(decoded(latin1('aaa')));
    expect(codes([256, 0x02, 0x61, 260, 128, 257])).toEqual({ kind: 'not-decoded' });
    // No end code.
    expect(codes([256, 0x02, 0x61, 0x61, 0x61, 128])).toEqual({ kind: 'not-decoded' });
    // 3,839 literals fill the table to 4,096 entries; one more literal is refused; a clear or the end is not.
    // The first literal, 128, is RunLength's end mark, so what follows it is not read by that step.
    const fill = [256, 0x80, ...Array.from({ length: 3838 }, () => 0x41)];
    expect(codes([...fill, 0x41, 257])).toEqual({ kind: 'not-decoded' });
    expect(codes([...fill, 256, 0x80, 257])).toEqual(decoded(new Uint8Array(0)));
    expect(codes([...fill, 257])).toEqual(decoded(new Uint8Array(0)));
  });

  const a85 = (data: Uint8Array) => decode(data, chain('ASCII85Decode', 'RunLengthDecode'));
  const rlEnd = rlOf(latin1('hello there'));

  it('ASCII85: skips space, tab, CR and LF only; z only at a group start; ~> at the end', () => {
    const good = ascii85(rlEnd);
    expect(a85(good)).toEqual(decoded(latin1('hello there')));
    const spaced = latin1(`${text85(good).slice(0, -2).split('').join(' \t\r\n')}~>`);
    expect(a85(spaced)).toEqual(decoded(latin1('hello there')));
    for (const [what, bad] of [
      ['a NUL', `${text85(good).slice(0, 3)}\0${text85(good).slice(3)}`],
      ['an FF', `${text85(good).slice(0, 3)}\f${text85(good).slice(3)}`],
      ['a byte outside its alphabet', `${text85(good).slice(0, 3)}v${text85(good).slice(3)}`],
      ['z inside a group', `${text85(good).slice(0, 2)}z${text85(good).slice(2)}`],
      ['a group past 2^32 - 1', `uuuuu${text85(good)}`],
      ['a lone last character', `${text85(good).slice(0, -2)}!~>`],
      ['no ~>', text85(good).slice(0, -2)],
      ['~ with no >', `${text85(good).slice(0, -1)}`],
    ] as const)
      expect(a85(latin1(bad)), what).toEqual({ kind: 'not-decoded' });
  });

  it('ASCII85: z gives four zero bytes, a last group of two to four characters gives one to three bytes', () => {
    const rlz = runLength(new Uint8Array(12));
    expect(a85(ascii85(rlz))).toEqual(decoded(new Uint8Array(12)));
    for (const length of [1, 2, 3, 5, 6, 7]) {
      const data = rlOf(Uint8Array.from({ length }, (_, index) => 200 + index));
      expect(a85(ascii85(data)), `${length}`).toEqual(decoded(Uint8Array.from({ length }, (_, index) => 200 + index)));
    }
  });

  it('ASCIIHex: hex digits and whitespace to >, an odd last digit followed by 0', () => {
    const hex = (data: string) => decode(latin1(data), chain('ASCIIHexDecode', 'RunLengthDecode'));
    expect(hex('02 61 6 2\n63 8>')).toEqual(decoded(latin1('abc')));
    expect(hex('0261626380')).toEqual({ kind: 'not-decoded' });
    expect(hex('02616263 x80>')).toEqual({ kind: 'not-decoded' });
    expect(hex('02\x006162638>')).toEqual({ kind: 'not-decoded' });
    expect(decode(latin1('0261626>'), chain('ASCIIHexDecode', 'RunLengthDecode'))).toEqual({ kind: 'not-decoded' });
  });
});

/** RunLength data decoded, worked out here. */
function decodeRl(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let at = 0; at < data.length; ) {
    const n = data[at++]!;
    if (n === 128) break;
    if (n < 128) {
      out.push(...data.subarray(at, at + n + 1));
      at += n + 1;
    } else out.push(...new Array<number>(257 - n).fill(data[at++]!));
  }
  return Uint8Array.from(out);
}
const text85 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// ---------------------------------------------------------------------------

describe('the 64 MiB cap and the budget', () => {
  const cap = maxContentBytes;

  it('a Flate stream of under 100 KB inflating past 64 MiB stops within a megabyte past the cap', () => {
    const bomb = new Uint8Array(deflateSync(Buffer.alloc(cap + 8 * 1024 * 1024), { level: 9 }));
    expect(bomb.length).toBeLessThan(100_000);
    let made = 0;
    class Counting extends Inflate {
      constructor(ondata: (chunk: Uint8Array, final: boolean) => void) {
        super((chunk, final) => {
          made += chunk.length;
          ondata(chunk, final);
        });
      }
    }
    const spend = recordingBudget();
    expect(decodeContent(bomb, lone('FlateDecode'), none, Counting, spend)).toEqual({ kind: 'too-large' });
    expect(made).toBeGreaterThan(cap);
    expect(made).toBeLessThan(cap + 1024 * 1024);
    expect(spend.total).toBeLessThanOrEqual(cap);
  });

  it('a RunLength step and an ASCII85 step of all z pass the cap', () => {
    const runs = new Uint8Array(2 * (cap / 128 + 1) + 1);
    for (let at = 0; at + 1 < runs.length; at += 2) runs[at] = 129;
    runs[runs.length - 1] = 128;
    expect(decode(runs, lone('RunLengthDecode'))).toEqual({ kind: 'too-large' });
    const zeros = join(new Uint8Array(cap / 4 + 1).fill(0x7a), latin1('~>'));
    expect(decode(zeros, chain('ASCII85Decode', 'RunLengthDecode'))).toEqual({ kind: 'too-large' });
  });

  it('the LZW step of [/LZWDecode /RunLengthDecode] passing the cap', () => {
    // KwKwK after each clear: strings of 1, 2, 3 ... bytes, about 7 MB a table from 6 KB of codes.
    const cycle = [256, 0x01, ...Array.from({ length: 3838 }, (_, index) => 258 + index)];
    const codes = lzwCodes([...Array.from({ length: 10 }, () => cycle).flat(), 257]);
    expect(codes.length).toBeLessThan(100_000);
    expect(decode(codes, chain('LZWDecode', 'RunLengthDecode'))).toEqual({ kind: 'too-large' });
  });

  it('a step past the cap in a chain is too large, though the last step is not reached', () => {
    const runs = new Uint8Array(2 * (cap / 128 + 1) + 1);
    for (let at = 0; at + 1 < runs.length; at += 2) runs[at] = 129;
    runs[runs.length - 1] = 128;
    // The middle step makes past 64 MiB; the Flate after it would fail on that data.
    expect(decode(ascii85(runs), chain('ASCII85Decode', 'RunLengthDecode', 'FlateDecode'))).toEqual({ kind: 'too-large' });
    // The first step past it: ASCII85 of z's in front of a RunLength stream.
    expect(decode(join(new Uint8Array(cap / 4 + 1).fill(0x7a), latin1('~>')), chain('ASCII85Decode', 'RunLengthDecode', 'RunLengthDecode'))).toEqual({ kind: 'too-large' });
  });

  it('counts every byte each step makes, intermediate steps and predictors included', () => {
    const middle = runLength(content);
    const spend = recordingBudget();
    expect(decode(ascii85(middle), chain('ASCII85Decode', 'RunLengthDecode'), spend)).toEqual(decoded(content));
    expect(spend.total).toBe(middle.length + content.length);
    const predicted = rows(16);
    const withPredictor = recordingBudget();
    expect(decode(runLength(flate(predicted)), { '/Filter': ['/RL', '/Fl'], '/DecodeParms': [null, { '/Predictor': 12, '/Columns': 16 }] }, withPredictor)).toEqual(decoded(content));
    expect(withPredictor.total).toBe(flate(predicted).length + predicted.length + content.length);
    // Large output is counted as each 1 MiB piece is made.
    const big = new Uint8Array(3 * 1024 * 1024 + 5).fill(0x20);
    const pieces = recordingBudget();
    expect(decode(flate(big), lone('FlateDecode'), pieces)).toEqual(decoded(big));
    expect(pieces.calls).toEqual([1024 * 1024, 1024 * 1024, 1024 * 1024, 5]);
  });

  it("stops at once with the caller's own error when the budget refuses", () => {
    const big = new Uint8Array(5 * 1024 * 1024).fill(0x20);
    const spend = recordingBudget(2 * 1024 * 1024);
    expect(() => decode(flate(big), lone('FlateDecode'), spend)).toThrow(BudgetRefused);
    expect(spend.calls.length).toBe(3);
    const small = recordingBudget(10);
    expect(() => decode(ascii85(runLength(content)), chain('ASCII85Decode', 'RunLengthDecode'), small)).toThrow(BudgetRefused);
  });
});
