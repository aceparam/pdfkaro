// Reading and writing through qpdf's JSON (src/engines/qpdf-json.ts): the
// helpers moved here from outline.ts and plain.ts, with their tests, and the
// steps Compress PDF adds, run with the same qpdf the browser uses.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createQpdf, type Qpdf } from '../../src/engines/qpdf';
import {
  callWithArgumentFile,
  callWithPassword,
  idOfKey,
  objectsPerCall,
  passwordArgsFor,
  rawBatches,
  readDictionaries,
  readRawStreams,
  streamUpdateJson,
  updateJson,
  writeUpdate,
  type StreamReplacement,
} from '../../src/engines/qpdf-json';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));
const holding = (bytes: Uint8Array) => async () => {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  return qpdf;
};

async function qpdfOn(bytes: Uint8Array, args: string[]): Promise<{ code: number; out: string; printed: string }> {
  const qpdf: Qpdf = await makeQpdf();
  qpdf.write('/check.pdf', bytes);
  return qpdf.call([...args, '/check.pdf']);
}
const pageCount = async (bytes: Uint8Array) => Number((await qpdfOn(bytes, ['--show-npages'])).out.trim());

// ---------------------------------------------------------------------------
// Moved here unchanged.

describe('the update JSON', () => {
  it('is written as JSON from objects', () => {
    const text = updateJson(20, new Map([['2 0 R', { '/Title': 'u:"quoted" \\ name' }]]));
    expect(JSON.parse(text)).toEqual({
      qpdf: [{ jsonversion: 2, pushedinheritedpageresources: false, calledgetallpages: false, maxobjectid: 20 }, { 'obj:2 0 R': { value: { '/Title': 'u:"quoted" \\ name' } } }],
    });
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

// ---------------------------------------------------------------------------
// The steps for replacing streams.

describe('a password with the argument file', () => {
  it('goes in the file when it has no line break, and in the in-memory list when it has one', async () => {
    const calls: string[][] = [];
    const written: string[] = [];
    const fake = { write: (_path: string, data: Uint8Array) => written.push(new TextDecoder().decode(data)), call: (args: string[]) => (calls.push(args), { code: 0, out: '', printed: '' }) } as unknown as Qpdf;
    callWithPassword(fake, passwordArgsFor('open-sesame'), ['--check', '/in.pdf']);
    expect(calls.at(-1)).toEqual(['@/args']);
    expect(written.at(-1)).toBe('--password=open-sesame\n--check\n/in.pdf\n');
    callWithPassword(fake, passwordArgsFor('two\nlines'), ['--check', '/in.pdf']);
    expect(calls.at(-1)).toEqual(['--password=two\nlines', '@/args']);
    expect(written.at(-1)).toBe('--check\n/in.pdf\n');
    expect(() => callWithPassword(fake, [], ['a\rb'])).toThrow(/line break/);
    expect(passwordArgsFor(undefined)).toEqual([]);
  });

  it('opens password.pdf for real both ways', async () => {
    const qpdf = await holding(fixture('password.pdf'))();
    expect(callWithPassword(qpdf, passwordArgsFor('open-sesame'), ['--check', '/in.pdf']).code).toBe(0);
    expect(callWithPassword(qpdf, passwordArgsFor('wrong'), ['--check', '/in.pdf']).code).toBe(2);
  });
});

describe('object keys', () => {
  it('are taken only as obj:N G R', () => {
    expect(idOfKey('obj:12 0 R')).toBe('12 0 R');
    for (const key of ['trailer', 'obj:12 0', 'obj:a 0 R', 'obj:1 0 R ', ' obj:1 0 R', 'obj:1  0 R', 'obj:-1 0 R', 'obj:1 0 R\n']) expect(idOfKey(key), key).toBeUndefined();
    expect(() => streamUpdateJson(9, new Map([['1 0 R"', { dict: {}, datafile: '/upd/0' }]]))).toThrow();
    expect(JSON.parse(streamUpdateJson(9, new Map([['4 0 R', { dict: { '/Filter': '/FlateDecode' }, datafile: '/upd/0' }]]))).qpdf[1]).toEqual({
      'obj:4 0 R': { stream: { dict: { '/Filter': '/FlateDecode' }, datafile: '/upd/0' } },
    });
  });
});

describe('reading every dictionary', () => {
  it('gives each object, streams by their dictionary only, and the highest object number', async () => {
    const read = readDictionaries(await holding(fixture('scanned.pdf'))(), []);
    expect(read).not.toBeNull();
    expect(read!.max).toBeGreaterThan(5);
    expect(read!.trailer?.['/Root']).toMatch(/^\d+ 0 R$/);
    const images = [...read!.objects].filter(([, entry]) => 'stream' in entry && entry.stream.dict['/Subtype'] === '/Image');
    expect(images).toHaveLength(2);
    for (const [id, entry] of images) {
      expect(id).toMatch(/^\d+ \d+ R$/);
      expect(entry).toEqual({ stream: { dict: expect.objectContaining({ '/Width': 300, '/Height': 424, '/Filter': '/FlateDecode' }) } });
      expect(JSON.stringify(entry)).not.toContain('data');
    }
  });

  it('opens a protected file with its password, and gives null without it', async () => {
    expect(readDictionaries(await holding(fixture('password.pdf'))(), passwordArgsFor('open-sesame'))).not.toBeNull();
    expect(readDictionaries(await holding(fixture('password.pdf'))(), [])).toBeNull();
  });

  it('does not parse a JSON over the limit, reading its length first, and gives null for a damaged file', async () => {
    const qpdf = await holding(fixture('pages-500.pdf'))();
    const parse = JSON.parse;
    let parsed = 0;
    JSON.parse = ((text: string) => (parsed++, parse(text))) as typeof JSON.parse;
    try {
      expect(readDictionaries(qpdf, [], 1024)).toBeNull();
    } finally {
      JSON.parse = parse;
    }
    expect(parsed).toBe(0);
    expect(qpdf.size('/dicts.json')).toBeGreaterThan(1024);
    expect(readDictionaries(await holding(fixture('damaged-cut.pdf'))(), [])).toBeNull();
  });
});

describe('batches of raw data', () => {
  it('add up to the limit, put a large or unknown stream alone, and hold at most one call of objects', () => {
    const streams = [
      { id: '1 0 R', length: 10 },
      { id: '2 0 R', length: 20 },
      { id: '3 0 R', length: 80 },
      { id: '4 0 R', length: 500 },
      { id: '5 0 R', length: undefined },
      { id: '6 0 R', length: 5 },
    ];
    expect(rawBatches(streams, 100)).toEqual([['1 0 R', '2 0 R'], ['3 0 R'], ['4 0 R'], ['5 0 R'], ['6 0 R']]);
    const many = Array.from({ length: objectsPerCall + 3 }, (_, index) => ({ id: `${index + 1} 0 R`, length: 1 }));
    expect(rawBatches(many, 1e9).map((batch) => batch.length)).toEqual([objectsPerCall, 3]);
  });
});

describe('reading chosen streams raw', () => {
  it('gives each stream its data as stored, from a fresh qpdf for each batch, and removes the data files', async () => {
    const file = fixture('scanned.pdf');
    const read = readDictionaries(await holding(file)(), [])!;
    const ids = [...read.objects].filter(([, entry]) => 'stream' in entry && entry.stream.dict['/Subtype'] === '/Image').map(([id]) => id);
    const made: Qpdf[] = [];
    const fresh = async () => {
      const qpdf = await holding(file)();
      made.push(qpdf);
      return qpdf;
    };
    const batches: Map<string, Uint8Array>[] = [];
    for await (const batch of readRawStreams(fresh, [], [[ids[0]!], [ids[1]!]])) batches.push(batch);
    expect(made).toHaveLength(2);
    expect(batches.map((batch) => [...batch.keys()])).toEqual([[ids[0]], [ids[1]]]);
    for (const [index, batch] of batches.entries()) {
      const data = batch.get(ids[index]!)!;
      // Raw: still deflated, as stored, and its stated length.
      expect(data[0]).toBe(0x78);
      expect(data.length).toBe((read.objects.get(ids[index]!) as { stream: { dict: { '/Length': number } } }).stream.dict['/Length']);
    }
    // Each data file was removed once read.
    for (const qpdf of made) expect(() => qpdf.size('/raw/s-' + ids[made.indexOf(qpdf)]!.split(' ')[0])).toThrow();
  });

  it('reads a protected file with its password, and refuses ids that are not object ids', async () => {
    const file = fixture('password.pdf');
    const read = readDictionaries(await holding(file)(), passwordArgsFor('open-sesame'))!;
    const stream = [...read.objects].find(([, entry]) => 'stream' in entry)![0];
    const found: Map<string, Uint8Array>[] = [];
    for await (const batch of readRawStreams(holding(file), passwordArgsFor('open-sesame'), [[stream, 'trailer', '1 0 R\n--decrypt']])) found.push(batch);
    expect([...found[0]!.keys()]).toEqual([stream]);
    expect(found[0]!.get(stream)!.length).toBeGreaterThan(0);
  });
});

describe('writing replaced streams', () => {
  const lossless = ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '--remove-unreferenced-resources=yes'];

  async function replaceFirstImage(name: string, password?: string) {
    const file = fixture(name);
    const passwordArgs = passwordArgsFor(password);
    const read = readDictionaries(await holding(file)(), passwordArgs)!;
    const [id, entry] = [...read.objects].find(([, each]) => 'stream' in each && each.stream.dict['/Subtype'] !== undefined) ?? [...read.objects].find(([, each]) => 'stream' in each)!;
    const dict = { ...(entry as { stream: { dict: Record<string, unknown> } }).stream.dict };
    delete dict['/Length'];
    // A tiny grey picture in place of whatever the stream was, so the update is easy to see.
    const replacement: StreamReplacement = {
      dict: { ...dict, '/Type': '/XObject', '/Subtype': '/Image', '/Width': 2, '/Height': 1, '/ColorSpace': '/DeviceGray', '/BitsPerComponent': 8, '/Filter': '/FlateDecode' },
      data: new Uint8Array(deflateSync(Buffer.from([10, 200]))),
    };
    const out = writeUpdate(await holding(file)(), passwordArgs, read.max, new Map([[id, replacement]]), lossless);
    return { id, out };
  }

  it('replaces a stream with its new dictionary and raw data, and passes qpdf --check', async () => {
    const { out } = await replaceFirstImage('scanned.pdf');
    expect((await qpdfOn(out, ['--check'])).code).toBe(0);
    // qpdf numbers objects afresh when it writes, so the picture is found by its dictionary.
    const shown = JSON.parse((await qpdfOn(out, ['--json=2', '--json-key=qpdf', '--json-stream-data=inline'])).out);
    const streams = Object.values(shown.qpdf[1] as Record<string, { stream?: { dict: Record<string, unknown>; data: string } }>).flatMap((each) => (each.stream ? [each.stream] : []));
    const images = streams.filter((stream) => stream.dict['/Subtype'] === '/Image');
    expect(images.map((image) => image.dict['/Width']).sort()).toEqual([2, 300]);
    const replaced = images.find((image) => image.dict['/Width'] === 2)!;
    expect(replaced.dict).toMatchObject({ '/Height': 1, '/ColorSpace': '/DeviceGray' });
    expect([...Buffer.from(replaced.data, 'base64')]).toEqual([10, 200]);
  });

  it('keeps the password and restrictions of password.pdf, and the restrictions of restricted.pdf', async () => {
    const before = (await qpdfOn(fixture('password.pdf'), ['--password=open-sesame', '--show-encryption'])).out;
    const { out } = await replaceFirstImage('password.pdf', 'open-sesame');
    expect((await qpdfOn(out, ['--check'])).code).toBe(2);
    expect((await qpdfOn(out, ['--password=open-sesame', '--check'])).code).toBe(0);
    expect((await qpdfOn(out, ['--password=open-sesame', '--show-encryption'])).out).toBe(before);
    const restrictedBefore = (await qpdfOn(fixture('restricted.pdf'), ['--show-encryption'])).out;
    const restricted = await replaceFirstImage('restricted.pdf');
    expect((await qpdfOn(restricted.out, ['--show-encryption'])).out).toBe(restrictedBefore);
    expect(restrictedBefore).toMatch(/print.*: none|print low resolution: not allowed|modify.*not allowed/i);
  });

  it('with nothing to replace, writes the file with the options only', async () => {
    const out = writeUpdate(await holding(fixture('text.pdf'))(), [], 0, new Map(), lossless);
    expect(await pageCount(out)).toBe(3);
    expect(out.length).toBeLessThan(fixture('text.pdf').length);
  });
});
