// The drawing pad's pointer rules (src/widget/drawing.ts), as plain functions in
// Node. Painting runs on @napi-rs/canvas in place of the browser's canvas.

import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { extendLine, isFull, padPoint, paintDrawing, withLine, type PaintContext } from '../../src/widget/drawing';
import { pad, type Drawing } from '../../src/widget/option-values';

describe('padPoint', () => {
  const box = { left: 100, top: 50, width: 500, height: 200 };

  it('gives a point inside the box in pad units', () => {
    expect(padPoint(100, 50, box)).toEqual([0, 0]);
    expect(padPoint(600, 250, box)).toEqual([1000, 400]);
    expect(padPoint(350, 150, box)).toEqual([500, 200]);
  });

  it('holds a point outside the box at its edge, on each side', () => {
    expect(padPoint(50, 150, box)).toEqual([0, 200]);
    expect(padPoint(700, 150, box)).toEqual([1000, 200]);
    expect(padPoint(350, 0, box)).toEqual([500, 0]);
    expect(padPoint(350, 400, box)).toEqual([500, 400]);
    expect(padPoint(-1e9, 1e9, box)).toEqual([0, 400]);
  });

  it('rounds to whole numbers, in a box of odd size', () => {
    const odd = { left: 0.5, top: 0.25, width: 327.3, height: 130.9 };
    const [x, y] = padPoint(100, 60, odd);
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    expect(x).toBe(Math.round(((100 - 0.5) / 327.3) * 1000));
    expect(y).toBe(Math.round(((60 - 0.25) / 130.9) * 400));
    expect(padPoint(100.6, 50, { left: 100, top: 50, width: 1000, height: 400 })).toEqual([1, 0]);
    expect(padPoint(100.4, 50, { left: 100, top: 50, width: 1000, height: 400 })).toEqual([0, 0]);
  });

  it('gives the corner, never NaN, for a box with no size or a point that is not a number', () => {
    expect(padPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0]);
    expect(padPoint(Number.NaN, Number.POSITIVE_INFINITY, box)).toEqual([0, 0]);
  });
});

describe('extendLine', () => {
  it('always adds the first point', () => {
    expect(extendLine([], [5, 6])).toEqual([5, 6]);
  });

  it('adds a point at least 3 units away on either axis', () => {
    expect(extendLine([10, 10], [13, 10])).toEqual([10, 10, 13, 10]);
    expect(extendLine([10, 10], [10, 7])).toEqual([10, 10, 10, 7]);
    expect(extendLine([10, 10, 20, 20], [20, 30])).toEqual([10, 10, 20, 20, 20, 30]);
  });

  it('gives the same line back for a point nearer than that to the last one', () => {
    const line = [10, 10, 20, 20];
    expect(extendLine(line, [22, 18])).toBe(line);
    expect(extendLine(line, [20, 20])).toBe(line);
    expect(extendLine(line, [21, 22], 3)).toBe(line);
    expect(extendLine(line, [21, 22], 1)).toEqual([10, 10, 20, 20, 21, 22]);
  });
});

describe('withLine', () => {
  const rule = { maxLines: 3, maxPoints: 6 };

  it('adds a finished line', () => {
    const result = withLine([], [1, 1, 5, 5], rule);
    expect(result).toEqual({ drawing: [[1, 1, 5, 5]], full: false });
  });

  it('takes no line with no points', () => {
    const drawing: Drawing = [[1, 1]];
    expect(withLine(drawing, [], rule).drawing).toBe(drawing);
  });

  it('cuts a line at the most points, and says the drawing is full', () => {
    const result = withLine([[0, 0, 1, 1, 2, 2, 3, 3]], [10, 10, 20, 20, 30, 30], rule);
    expect(result.drawing).toEqual([[0, 0, 1, 1, 2, 2, 3, 3], [10, 10, 20, 20]]);
    expect(result.full).toBe(true);
  });

  it('says full when a line reaches the most lines or points exactly', () => {
    expect(withLine([[0, 0], [1, 1]], [2, 2], rule)).toEqual({ drawing: [[0, 0], [1, 1], [2, 2]], full: true });
    expect(withLine([[0, 0, 1, 1]], [2, 2, 3, 3, 4, 4, 5, 5], rule)).toEqual({ drawing: [[0, 0, 1, 1], [2, 2, 3, 3, 4, 4, 5, 5]], full: true });
  });

  it('adds no line past the most lines, or once every point is used, and the drawing stays as it was', () => {
    const lines: Drawing = [[0, 0], [1, 1], [2, 2]];
    expect(withLine(lines, [5, 5], rule)).toEqual({ drawing: lines, full: true });
    expect(withLine(lines, [5, 5], rule).drawing).toBe(lines);
    const points: Drawing = [[0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]];
    expect(withLine(points, [9, 9], rule).drawing).toBe(points);
  });

  it('tells a full drawing from one with room', () => {
    expect(isFull([], rule)).toBe(false);
    expect(isFull([[0, 0], [1, 1]], rule)).toBe(false);
    expect(isFull([[0, 0], [1, 1], [2, 2]], rule)).toBe(true);
    expect(isFull([[0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]], rule)).toBe(true);
  });
});

describe('paintDrawing', () => {
  // A canvas 2 device pixels to a unit wide would be large; a quarter scale keeps it small: 250 by 100.
  const scale = 0.25;
  const fresh = () => {
    const canvas = createCanvas(pad.width * scale, pad.height * scale);
    return { canvas, context: canvas.getContext('2d') };
  };
  const alphaAt = (context: ReturnType<typeof fresh>['context'], x: number, y: number) => context.getImageData(Math.round(x), Math.round(y), 1, 1).data[3] ?? 0;
  const inked = (context: ReturnType<typeof fresh>['context'], width: number, height: number) => {
    const data = context.getImageData(0, 0, width, height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if ((data[index] ?? 0) > 0) count += 1;
    return count;
  };

  it('paints a line where its points are, in the colour given, and nothing far from it', () => {
    const { canvas, context } = fresh();
    paintDrawing(context as unknown as PaintContext, [[100, 200, 900, 200]], scale, '#1b1b1b');
    expect(alphaAt(context, 125, 50)).toBeGreaterThan(0);
    expect(alphaAt(context, 50, 50)).toBeGreaterThan(0);
    expect(alphaAt(context, 200, 50)).toBeGreaterThan(0);
    const pixel = context.getImageData(125, 50, 1, 1).data;
    expect([pixel[0], pixel[1], pixel[2]]).toEqual([0x1b, 0x1b, 0x1b]);
    expect(alphaAt(context, 125, 20)).toBe(0);
    expect(alphaAt(context, 125, 80)).toBe(0);
    expect(alphaAt(context, 10, 50)).toBe(0);
    expect(alphaAt(context, 240, 50)).toBe(0);
    expect(inked(context, canvas.width, canvas.height)).toBeGreaterThan(0);
  });

  it('paints a line of one point as a dot of the line\'s width', () => {
    const dot = createCanvas(1000, 400).getContext('2d');
    paintDrawing(dot as unknown as PaintContext, [[400, 200]], 1, '#000');
    expect(dot.getImageData(400, 200, 1, 1).data[3]).toBeGreaterThan(0);
    expect(dot.getImageData(402, 200, 1, 1).data[3]).toBeGreaterThan(0);
    expect(dot.getImageData(406, 200, 1, 1).data[3]).toBe(0);
    // A circle 6 pixels across covers about 28 pixels.
    const count = inked(dot as unknown as ReturnType<typeof fresh>['context'], 1000, 400);
    expect(count).toBeGreaterThan(20);
    expect(count).toBeLessThan(50);
  });

  it('scales the line\'s width with the drawing', () => {
    const thin = createCanvas(1000, 400).getContext('2d');
    const thick = createCanvas(1000, 400).getContext('2d');
    paintDrawing(thin as unknown as PaintContext, [[100, 100, 400, 100]], 1, '#000');
    paintDrawing(thick as unknown as PaintContext, [[50, 50, 200, 50]], 2, '#000');
    // Both lines are 300 pixels long; the second is twice as wide.
    const across = (context: typeof thin, x: number, y0: number, y1: number) => {
      let count = 0;
      for (let y = y0; y <= y1; y += 1) if ((context.getImageData(x, y, 1, 1).data[3] ?? 0) > 127) count += 1;
      return count;
    };
    expect(across(thin, 250, 80, 120)).toBe(pad.line);
    expect(across(thick, 250, 80, 120)).toBe(pad.line * 2);
  });

  it('paints nothing for no lines, and paints every line given', () => {
    const { canvas, context } = fresh();
    paintDrawing(context as unknown as PaintContext, [], scale, '#000');
    expect(inked(context, canvas.width, canvas.height)).toBe(0);
    paintDrawing(context as unknown as PaintContext, [[100, 100, 300, 100], [100, 300, 300, 300]], scale, '#000');
    expect(alphaAt(context, 50, 25)).toBeGreaterThan(0);
    expect(alphaAt(context, 50, 75)).toBeGreaterThan(0);
    expect(alphaAt(context, 50, 50)).toBe(0);
  });
});
