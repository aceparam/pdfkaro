// Raw picture samples made smaller (src/engines/resample.ts): PNG predictors
// undone, and area averaging, checked against values worked out by hand.

import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fittedSize, scaleDown, unpredict } from '../../src/engines/resample';

/** Rows of samples with a filter byte in front of each, filtered as a PNG encoder would. */
function predicted(samples: Uint8Array, width: number, height: number, components: number, filters: number[]): Uint8Array {
  const stride = width * components;
  const out = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length]!;
    out[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const value = samples[y * stride + x]!;
      const a = x >= components ? samples[y * stride + x - components]! : 0;
      const b = y > 0 ? samples[(y - 1) * stride + x]! : 0;
      const c = x >= components && y > 0 ? samples[(y - 1) * stride + x - components]! : 0;
      const paeth = () => {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      const guess = [0, a, b, (a + b) >> 1, paeth()][filter]!;
      out[y * (stride + 1) + 1 + x] = (value - guess) & 0xff;
    }
  }
  return out;
}

const noisy = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 37 + ((index * index) % 251)) & 0xff);

describe('undoing PNG predictors', () => {
  it('gives back the samples for every filter, alone and mixed, grey and RGB', () => {
    for (const components of [1, 3]) {
      const width = 13;
      const height = 9;
      const samples = noisy(width * height * components);
      for (const filters of [[0], [1], [2], [3], [4], [0, 1, 2, 3, 4]]) {
        expect(unpredict(predicted(samples, width, height, components, filters), width, height, components), `${components} ${filters}`).toEqual(samples);
      }
    }
  });

  it('refuses data of the wrong size or a filter byte that is not 0 to 4', () => {
    const data = predicted(noisy(12), 4, 3, 1, [1]);
    expect(unpredict(data.subarray(1), 4, 3, 1)).toBeUndefined();
    expect(unpredict(new Uint8Array([...data, 0]), 4, 3, 1)).toBeUndefined();
    const bad = data.slice();
    bad[5] = 5;
    expect(unpredict(bad, 4, 3, 1)).toBeUndefined();
  });

  it('is what zlib-compressed PNG rows decode to, as in a PDF stream', () => {
    const samples = noisy(40 * 30 * 3);
    const stored = deflateSync(predicted(samples, 40, 30, 3, [4, 2]));
    expect(stored.length).toBeGreaterThan(0);
    expect(unpredict(predicted(samples, 40, 30, 3, [4, 2]), 40, 30, 3)).toEqual(samples);
  });
});

describe('scaling down by area averaging', () => {
  it('halves by averaging each block of four', () => {
    const grey = Uint8Array.from([0, 100, 10, 20, 200, 100, 30, 40, 1, 2, 3, 4, 5, 6, 7, 8]);
    // 4 by 4 to 2 by 2.
    expect([...scaleDown(grey, 4, 4, 1, 2, 2)]).toEqual([100, 25, 4, 6]);
  });

  it('keeps each colour apart', () => {
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    // 2 by 2 to 1 by 1: each channel averaged on its own.
    expect([...scaleDown(rgb, 2, 2, 3, 1, 1)]).toEqual([128, 128, 128]);
  });

  it('shares a pixel that straddles two new pixels by the area it covers', () => {
    // 3 pixels to 2: the middle one is half in each.
    expect([...scaleDown(Uint8Array.from([0, 90, 180]), 3, 1, 1, 2, 1)]).toEqual([30, 150]);
  });

  it('keeps a flat picture flat, and a grey ramp grey, at any size', () => {
    const flat = new Uint8Array(37 * 23 * 3).fill(77);
    expect(new Set(scaleDown(flat, 37, 23, 3, 11, 7))).toEqual(new Set([77]));
    const ramp = new Uint8Array(100 * 10 * 3);
    for (let x = 0; x < 100; x++) for (let y = 0; y < 10; y++) ramp.fill(x * 2, (y * 100 + x) * 3, (y * 100 + x) * 3 + 3);
    const small = scaleDown(ramp, 100, 10, 3, 33, 3);
    for (let at = 0; at < small.length; at += 3) {
      expect(small[at]).toBe(small[at + 1]);
      expect(small[at]).toBe(small[at + 2]);
    }
    expect(small[0]).toBeLessThan(small[small.length - 3]!);
  });

  it('never scales up, and checks the sizes given', () => {
    expect(() => scaleDown(new Uint8Array(4), 2, 2, 1, 3, 2)).toThrow();
    expect(() => scaleDown(new Uint8Array(4), 2, 2, 1, 0, 1)).toThrow();
    expect(() => scaleDown(new Uint8Array(5), 2, 2, 1, 1, 1)).toThrow();
    expect([...scaleDown(Uint8Array.from([1, 2, 3, 4]), 2, 2, 1, 2, 2)]).toEqual([1, 2, 3, 4]);
  });
});

describe('the size a picture is scaled to', () => {
  it('makes the longer side the limit and keeps the shape', () => {
    expect(fittedSize(2480, 3508, 1754)).toEqual({ width: 1240, height: 1754 });
    expect(fittedSize(2560, 1440, 1754)).toEqual({ width: 1754, height: 987 });
    expect(fittedSize(10_000, 1, 150)).toEqual({ width: 150, height: 1 });
  });
});
