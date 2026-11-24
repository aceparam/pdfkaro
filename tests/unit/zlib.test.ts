// The shared zlib steps (src/engines/zlib.ts): inflating with a cap and deflating framed as zlib data, moved
// unchanged from picture.test.ts and compress-pdf.test.ts with the helpers, and the first bytes of zlib data
// (`inflatePrefix`). No request may be made: `fetch` is replaced by one that throws and records.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { Deflate, Inflate } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maxProfileBytes } from '../../src/engines/picture';
import { inflateLimited, inflatePrefix, zlibDeflate } from '../../src/engines/zlib';

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
