// The drawing pad's pointer rules, as plain functions tested in Node, so the
// component (src/components/DrawingPad) holds only wiring. A drawing is lines of
// whole-number points in the pad's own units (src/widget/option-values.ts);
// nothing here turns it into a picture.

import { pad, type Drawing, type DrawingRule } from './option-values';

/** A point in the pad's units: [x, y]. */
export type PadPoint = readonly [number, number];

/** The part of a bounding box `padPoint` reads: the canvas's `getBoundingClientRect()`. */
export type PadBox = { left: number; top: number; width: number; height: number };

/** The 2D drawing calls `paintDrawing` makes: a canvas's context in the browser, or @napi-rs/canvas's in a test. */
export type PaintContext = {
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: unknown;
  fillStyle: unknown;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fill(): void;
};

const held = (value: number, most: number) => Math.min(most, Math.max(0, Math.round(value)));

/**
 * The point under the pointer in pad units, rounded to whole numbers and held inside the box, from
 * the canvas's bounding box. A box with no size gives the corner, never NaN.
 */
export function padPoint(clientX: number, clientY: number, box: PadBox): PadPoint {
  const x = box.width > 0 ? ((clientX - box.left) / box.width) * pad.width : 0;
  const y = box.height > 0 ? ((clientY - box.top) / box.height) * pad.height : 0;
  return [held(Number.isFinite(x) ? x : 0, pad.width), held(Number.isFinite(y) ? y : 0, pad.height)];
}

/**
 * The line with the point added when it is at least `step` units from the line's last point on
 * either axis, else the same line (the same array), so a pen's many points on a still hand add
 * nothing. The first point is always added.
 */
export function extendLine(line: readonly number[], point: PadPoint, step = 3): readonly number[] {
  const count = line.length;
  if (count >= 2) {
    const lastX = line[count - 2] ?? 0;
    const lastY = line[count - 1] ?? 0;
    if (Math.abs(point[0] - lastX) < step && Math.abs(point[1] - lastY) < step) return line;
  }
  return [...line, point[0], point[1]];
}

/** How many points a drawing holds in all. */
function pointCount(drawing: Drawing): number {
  let points = 0;
  for (const line of drawing) points += Math.floor(line.length / 2);
  return points;
}

/** Whether a drawing has reached its most lines or its most points, so it takes no more. */
export function isFull(drawing: Drawing, rule: DrawingRule): boolean {
  return drawing.length >= rule.maxLines || pointCount(drawing) >= rule.maxPoints;
}

/**
 * The drawing with a finished line added: cut to the points left when it would pass `maxPoints`,
 * or not added at all once the drawing is full or for a line with no points. `full` says the
 * drawing has now reached a limit, so the status region can say so once.
 */
export function withLine(drawing: Drawing, line: readonly number[], rule: DrawingRule): { drawing: Drawing; full: boolean } {
  const left = rule.maxPoints - pointCount(drawing);
  const points = Math.floor(line.length / 2);
  if (points === 0 || drawing.length >= rule.maxLines || left <= 0) return { drawing, full: isFull(drawing, rule) };
  const kept = points > left ? line.slice(0, left * 2) : line.slice(0, points * 2);
  const next = [...drawing, kept];
  return { drawing: next, full: isFull(next, rule) };
}

/**
 * Paints every line of a drawing on a 2D context, `scale` device pixels to a pad unit, with round
 * caps and joins, `pad.line × scale` wide. A line of one point is a filled circle of the line's
 * width, so a dot shows the same everywhere and never rests on how a zero-length line is drawn.
 * It only paints: clearing the canvas first is the caller's.
 */
export function paintDrawing(context: PaintContext, drawing: Drawing, scale: number, colour: string): void {
  const width = pad.line * scale;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = colour;
  context.fillStyle = colour;
  for (const line of drawing) {
    const points = Math.floor(line.length / 2);
    if (points === 0) continue;
    const x0 = (line[0] ?? 0) * scale;
    const y0 = (line[1] ?? 0) * scale;
    context.beginPath();
    if (points === 1) {
      context.arc(x0, y0, width / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.moveTo(x0, y0);
    for (let index = 2; index + 1 < line.length; index += 2) context.lineTo((line[index] ?? 0) * scale, (line[index + 1] ?? 0) * scale);
    context.stroke();
  }
}
