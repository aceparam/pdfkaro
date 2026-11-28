// The shared zlib steps (src/engines/zlib.ts): inflating with a cap and deflating framed as zlib data, moved
// unchanged from picture.test.ts and compress-pdf.test.ts with the helpers, and the first bytes of zlib data
// (`inflatePrefix`). No request may be made: `fetch` is replaced by one that throws and records.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { Deflate, Inflate } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maxProfileBytes } from '../../src/engines/picture';
import { inflateLimited, inflatePrefix, inflateReadable, pushPieces, quietInput, zlibDeflate } from '../../src/engines/zlib';
import { alignedQuietStream } from './content-helpers';

const fetched: unknown[] = [];
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = ((...args: unknown[]) => {
    fetched.push(args[0]);
    throw new Error('No request may be made by the zlib steps.');
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  expect(fetched).toEqual([]);
});

describe('inflating with a cap (moved from picture.test.ts)', () => {
  it('stops inflating as soon as the output passes the limit', async () => {
    const { deflateSync } = await import('node:zlib');
    const data = new Uint8Array(deflateSync(Buffer.alloc(50 * 1024 * 1024), { level: 9 })).subarray(2);
    let largest = 0;
    class Counting extends Inflate {
      constructor(ondata: (chunk: Uint8Array, final: boolean) => void) {
        super((chunk, final) => {
          largest = Math.max(largest, chunk.length);
          ondata(chunk, final);
        });
      }
    }
    expect(inflateLimited(data, Counting, maxProfileBytes)).toBeUndefined();
    // No one piece of output came near the 50 MB the data would make.
    expect(largest).toBeLessThan(2 * 1024 * 1024);
    expect(inflateLimited(new Uint8Array(deflateSync(Buffer.from('hello'))).subarray(2), Inflate, 100)).toEqual(new TextEncoder().encode('hello'));
    expect(inflateLimited(new Uint8Array([1, 2, 3]), Inflate, 100)).toBeUndefined();
  });
});

describe('data stored without loss (moved from compress-pdf.test.ts)', () => {
  it('is deflated by fflate and framed as zlib data', () => {
    const data = Uint8Array.from({ length: 300_000 }, (_, index) => (index * 31) & 0xff);
    const framed = zlibDeflate(data, Deflate);
    expect([framed[0], framed[1]]).toEqual([0x78, 0xda]);
    expect(new Uint8Array(inflateSync(framed))).toEqual(data);
    expect(new Uint8Array(inflateSync(zlibDeflate(new Uint8Array(0), Deflate)))).toEqual(new Uint8Array(0));
  });
});

/** fflate's Inflate, counting every byte it gives out. */
const counted = { bytes: 0 };
class CountingInflate extends Inflate {
  constructor(ondata: (chunk: Uint8Array, final: boolean) => void) {
    super((chunk, final) => {
      counted.bytes += chunk.length;
      ondata(chunk, final);
    });
  }
}

describe('the first bytes of zlib data', () => {
  it('gives the first 20 bytes of a Flate-compressed colour profile', () => {
    const profile = new Uint8Array(readFileSync(join(__dirname, '../fixtures/pictures/p3.icc')));
    expect(profile.length).toBeGreaterThan(128);
    const prefix = inflatePrefix(new Uint8Array(deflateSync(profile)), Inflate, 20);
    expect(prefix).toEqual(profile.subarray(0, 20));
  });

  it('stops once the bytes are made, on data that inflates past 256 MiB', () => {
    const data = new Uint8Array(deflateSync(Buffer.alloc(257 * 1024 * 1024, 7), { level: 9 }));
    counted.bytes = 0;
    const started = performance.now();
    const prefix = inflatePrefix(data, CountingInflate, 20);
    const took = performance.now() - started;
    expect(prefix).toEqual(new Uint8Array(20).fill(7));
    // One 1 KiB push of these zeros makes at most about a megabyte.
    expect(counted.bytes).toBeLessThan(2 * 1024 * 1024);
    expect(took).toBeLessThan(1000);
  }, 30_000);

  it('gives nothing for raw deflate with no zlib header, or data too short', () => {
    expect(inflatePrefix(new Uint8Array(deflateSync(Buffer.alloc(100, 1))).subarray(2), Inflate, 20)).toBeUndefined();
    expect(inflatePrefix(new Uint8Array(deflateSync(Buffer.alloc(12, 1))), Inflate, 20)).toBeUndefined();
    expect(inflatePrefix(new Uint8Array([0x78, 0x9c]), Inflate, 20)).toBeUndefined();
    // Damaged data after a good header.
    expect(inflatePrefix(new Uint8Array([0x78, 0x9c, 0xff, 0xff, 0xff, 0xff]), Inflate, 20)).toBeUndefined();
  });

  it('refuses an impossible length with its fixed sentence', () => {
    const data = new Uint8Array(deflateSync(Buffer.alloc(100)));
    for (const bytes of [0, 65_537, 1.5, Number.NaN, -1]) expect(() => inflatePrefix(data, Inflate, bytes)).toThrow(new Error('The start of zlib data was asked for an impossible length.'));
    expect(inflatePrefix(data, Inflate, 100)).toEqual(new Uint8Array(100));
  });
});

describe('bytes after the end of the deflate data', () => {
  const trailing = (bytes: number) => new Uint8Array(bytes).fill(0x41);
  const timed = <T>(run: () => T): [T, number] => {
    const started = performance.now();
    const value = run();
    return [value, performance.now() - started];
  };

  it('inflateLimited stops at the end: 16 MiB of trailing bytes in under a second, as before for a few', () => {
    const hello = new Uint8Array(deflateSync(Buffer.from('hello'))).subarray(2);
    const [few, quick] = timed(() => inflateLimited(new Uint8Array([...hello, 1, 2, 3]), Inflate, 100));
    expect(few).toEqual(new TextEncoder().encode('hello'));
    expect(quick).toBeLessThan(1000);
    const data = new Uint8Array(hello.length + 16 * 1024 * 1024);
    data.set(hello);
    data.set(trailing(16 * 1024 * 1024), hello.length);
    const [result, took] = timed(() => inflateLimited(data, Inflate, 100));
    expect(result).toEqual(new TextEncoder().encode('hello'));
    expect(took).toBeLessThan(1000);
  });

  it('inflatePrefix stops at the end too: 16 MiB after data too short gives nothing, in under a second', () => {
    const short = new Uint8Array(deflateSync(Buffer.alloc(12, 1)));
    const data = new Uint8Array(short.length + 16 * 1024 * 1024);
    data.set(short);
    data.set(trailing(16 * 1024 * 1024), short.length);
    const [result, took] = timed(() => inflatePrefix(data, Inflate, 20));
    expect(result).toBeUndefined();
    expect(took).toBeLessThan(1000);
    const enough = new Uint8Array(deflateSync(Buffer.alloc(40, 2)));
    const after = new Uint8Array(enough.length + 16 * 1024 * 1024);
    after.set(enough);
    expect(inflatePrefix(after, Inflate, 20)).toEqual(new Uint8Array(20).fill(2));
  });

  it('a stored block of 65,535 bytes holds back its output for less than quietInput', () => {
    const random = Uint8Array.from({ length: 300_000 }, (_, index) => (index * 2654435761) >>> 24);
    const stored = new Uint8Array(deflateSync(random, { level: 0 })).subarray(2);
    expect(inflateLimited(stored, Inflate, 1_000_000)).toEqual(random);
    expect(quietInput).toBe(68_096);
  });

  it('more empty stored blocks in a row than quietInput are refused (safe), fewer are read', () => {
    const empty = [0x00, 0x00, 0x00, 0xff, 0xff];
    const last = new Uint8Array(deflateSync(Buffer.from('end'))).subarray(2);
    const padded = (blocks: number) => Uint8Array.from([...Array.from({ length: blocks }, () => empty).flat(), ...last]);
    expect(inflateLimited(padded(1000), Inflate, 100)).toEqual(new TextEncoder().encode('end'));
    expect(inflateLimited(padded(20_000), Inflate, 100)).toBeUndefined();
  });
});

describe('blocks that make nothing, lined up with the pieces', () => {
  const { raw, whole } = alignedQuietStream();

  it('every reader decodes both parts', () => {
    expect(whole).toBe('0 0 9 9 re f\n1 0 0 rg 0 0 50 50 re f\n');
  });

  it('pushPieces never ends the data at the prefix: the piece after the quiet stretch, pushed as final, is refused', () => {
    let made = 0;
    let ended = false;
    const inflater = new Inflate((chunk, final) => {
      made += chunk.length;
      if (final) ended = true;
    });
    const started = performance.now();
    expect(() => pushPieces(inflater, raw, () => made)).toThrow();
    expect(performance.now() - started).toBeLessThan(1000);
    expect(ended).toBe(false);
  });

  it('inflateLimited gives nothing rather than the prefix', () => {
    expect(inflateLimited(raw, Inflate, 1_000_000)).toBeUndefined();
  });

  it('inflatePrefix gives nothing rather than a short start', () => {
    expect(inflatePrefix(Uint8Array.from([0x78, 0x9c, ...raw]), Inflate, 20)).toBeUndefined();
  });

  it('at the end of the input, the last piece is final as before: a quiet stretch reaching the end is read', () => {
    const hello = new Uint8Array(deflateSync(Buffer.from('hello'))).subarray(2);
    const data = new Uint8Array(hello.length + quietInput + 100);
    data.set(hello);
    expect(inflateLimited(data, Inflate, 100)).toEqual(new TextEncoder().encode('hello'));
  });
});

describe('inflating what can still be read (Repair PDF)', () => {
  // Varied enough that the deflate data spans many pieces, so output comes out before the end.
  const text = new TextEncoder().encode(Array.from({ length: 6000 }, (_, at) => `${(at * 7919) % 1000} ${(at * 104_729) % 997} m (${at}) Tj\n`).join(''));
  const raw = new Uint8Array(deflateSync(text, { level: 9 })).subarray(2);
  const nothing = () => {};

  it('gives the whole stream when it is whole', () => {
    const read = inflateReadable(raw, Inflate, 1 << 20, nothing);
    expect(read).toEqual({ kind: 'whole', data: text });
  });

  it('keeps what came out before the data was cut off', () => {
    const read = inflateReadable(raw.subarray(0, Math.floor(raw.length / 2)), Inflate, 1 << 20, nothing);
    expect(read.kind).toBe('cut');
    if (read.kind !== 'cut') return;
    expect(read.data.length).toBeGreaterThan(0);
    expect(read.data.length).toBeLessThan(text.length);
    expect(read.data).toEqual(text.subarray(0, read.data.length));
  });

  it('keeps what came out before bytes changed part way through', () => {
    // Several deflate blocks, so the first ones come out before the damage.
    const blocks = new Uint8Array(deflateSync(Buffer.from(Uint8Array.from({ length: 400_000 }, (_, at) => (at * 7919) % 251)), { level: 1 })).subarray(2);
    const corrupted = blocks.slice();
    for (let at = Math.floor(corrupted.length * 0.6); at < Math.floor(corrupted.length * 0.6) + 64; at++) corrupted[at] = 0xff;
    const read = inflateReadable(corrupted, Inflate, 1 << 20, nothing);
    const whole = inflateSync(Buffer.concat([Buffer.from([0x78, 0x01]), Buffer.from(blocks)]));
    expect(read.kind).not.toBe('too-large');
    if (read.kind === 'too-large') return;
    // What came out before the damage is the stream's own start; a little after it may be garbage before the error.
    const sure = Math.floor(whole.length * 0.4);
    expect(read.data.length).toBeGreaterThan(sure);
    expect(Buffer.from(read.data.subarray(0, sure)).equals(whole.subarray(0, sure))).toBe(true);
  });

  it('gives nothing, cut, for data that is not deflate at all', () => {
    expect(inflateReadable(new Uint8Array([0xff, 0xff, 0xff, 0xff]), Inflate, 100, nothing)).toEqual({ kind: 'cut', data: new Uint8Array(0) });
  });

  it('ignores bytes after the end of the stream, as inflateLimited does', () => {
    const padded = new Uint8Array(raw.length + 100_000);
    padded.set(raw);
    expect(inflateReadable(padded, Inflate, 1 << 20, nothing)).toEqual({ kind: 'whole', data: text });
  });

  it('stops at the limit and keeps nothing', () => {
    const bomb = new Uint8Array(deflateSync(Buffer.alloc(80 * 1024 * 1024), { level: 9 })).subarray(2);
    let largest = 0;
    class Counting extends Inflate {
      constructor(ondata: (chunk: Uint8Array, final: boolean) => void) {
        super((chunk, final) => {
          largest = Math.max(largest, chunk.length);
          ondata(chunk, final);
        });
      }
    }
    expect(inflateReadable(bomb, Counting, 64 * 1024 * 1024, nothing)).toEqual({ kind: 'too-large' });
    expect(largest).toBeLessThan(2 * 1024 * 1024);
  });

  it('passes every byte made to the budget first, and stops with its error', () => {
    let spent = 0;
    const read = inflateReadable(raw, Inflate, 1 << 20, (bytes) => (spent += bytes));
    expect(read.kind).toBe('whole');
    expect(spent).toBe(text.length);
    class Over extends Error {}
    expect(() =>
      inflateReadable(raw, Inflate, 1 << 20, (bytes) => {
        spent += bytes;
        if (spent > text.length + 1000) throw new Over();
      }),
    ).toThrow(Over);
  });
});
