// Resize pages: makes every page of one PDF A4 or Letter, the same way round as
// it is shown, its content scaled by one factor to fit and centred, with
// nothing cut off (the owner's decisions of 24 Nov 2026: scale to fit; A4 and
// Letter only, A4 first; each page its own way round).
//
// A page's own content streams are never read or rewritten. Each resized
// page's /Contents becomes [prefix, its own streams as they were, restore]:
// the prefix saves the drawing state, scales and moves the page's drawing onto
// the new paper by one rounded matrix M, and clips it to where the page was
// shown before; the restore gives the state back. A page whose own drawing
// restores more than it saves can undo the matrix and the clip in some readers
// (design decision 3, said on the page); nothing hidden before was removed.
//
// What the file stores in page coordinates outside the content moves by the
// same M: annotations (their rectangle and the other places they store), the
// beads of reading threads, and every destination that points to the page.
// Each changed object is copied once into one map of working copies, changed
// there by every step, and written once. Annotations wholly outside the old
// shown box (popups excepted) get the Hidden flag, as a reader showed them
// nowhere before.
//
// On each resized page /MediaBox and /CropBox become the new paper, written on
// the page itself; /UserUnit, its own /BleedBox, /TrimBox, /ArtBox, /Thumb and
// /VP, and its annotations' /Measure, are removed; /Rotate and every other key
// are kept. A page already the chosen size is left exactly as it is; a file
// where every page is gives no file. The new file has no password and no
// restrictions, as every page tool's.
//
// Every number written follows one rule (`fixedText`): fixed form, never an
// exponent, at most 10 significant digits. A page whose matrix or clip cannot
// be written closely enough stops the job with `UnsafePage`. Errors are fixed
// sentences; nothing of the file goes into one.

import { acceptedValue } from '../../widget/option-values';
import { inspectPdf } from '../inspect';
import { freshQpdf, passwordFrom, plainCopy } from '../plain';
import { OutputLimit } from '../qpdf';
import { entryText, isDict, isRef, opening, type Dict, type ObjectEntry } from '../qpdf-json';
import { readPages, sizeLimit, UnsafePage, writePageUpdate, type PagePlace, type PlainSource } from '../pages';
import type { Engine, EngineModule, Inspector } from '../types';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['qpdf'], job: ['qpdf'] };

type Options = { passwords?: unknown; paper?: unknown };

export type Paper = 'a4' | 'letter';

/** Each paper upright, in points: A4 is 210 by 297 mm to within 0.01 mm, Letter 8.5 by 11 inches. */
export const papers: Readonly<Record<Paper, readonly [number, number]>> = { a4: [595.276, 841.89], letter: [612, 792] };

/** How far, in points, a side may be from the paper's and still count as that size; also how much wider than tall a page must be to go on its side. */
export const tolerance = 1;
/** Room for the rounding of numbers read from a file, so a side exactly 1 point off is within the tolerance. */
const slack = 1e-9;
/** The largest number written; at or above it the job stops (the matrix and the clip) or a key is left as it was (moved values). */
export const largestNumber = 1e9;
/** How far the written scale may be from the exact one, as a part of it. */
export const scaleError = 1e-4;
/** How far, in points on the new page, the written clip may be from the old shown box. */
export const clipError = 0.01;
/** How deep the destination walk goes into one object's value. */
export const destinationDepth = 32;
/** The most significant digits a number is written with. */
const significant = 10;

// ---------------------------------------------------------------------------
// Numbers.

/** How many decimals `value` is written with: at most 10 significant digits and at most `most` decimals. */
function decimalsFor(value: number, most: number): number {
  if (value === 0) return 0;
  const whole = Math.floor(Math.log10(Math.abs(value))) + 1;
  return Math.max(0, Math.min(most, significant - whole));
}

/** Cuts the zeros after the point, and a negative zero. */
function tidy(text: string): string {
  const trimmed = text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  return trimmed === '-0' ? '0' : trimmed;
}

/**
 * `value` rounded as it is written: at most 10 significant digits, at most `most` decimals (20 for the matrix
 * and the clip, 6 for moved values), `'down'` or `'up'` when it must not move the other way. Gives the number
 * and its text in fixed form, never an exponent. Exported for the unit test.
 */
export function fixed(value: number, most = 20, direction?: 'down' | 'up'): { value: number; text: string } {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) throw new UnsafePage();
  const decimals = decimalsFor(value, most);
  let text = value.toFixed(decimals);
  let rounded = Number(text);
  const step = 10 ** -decimals;
  if (direction === 'down' && rounded > value) text = (rounded - step).toFixed(decimals);
  if (direction === 'up' && rounded < value) text = (rounded + step).toFixed(decimals);
  text = tidy(text);
  rounded = Number(text);
  return { value: rounded, text };
}

/** A moved value as it is written: fixed form, at most 6 decimals; null when it is 10^9 or more in size, so its key is left as it was. */
function moved(value: number): number | null {
  if (!Number.isFinite(value) || Math.abs(value) >= largestNumber) return null;
  return fixed(value, 6).value;
}

// ---------------------------------------------------------------------------
// Where each page goes.

/** A page's one matrix, [k 0 0 k tx ty], exactly the numbers written; a scale and a move, never a turn. */
export type Matrix = { k: number; tx: number; ty: number };

/** A resized page: its matrix, its new paper box (unturned), the old shown box, and the prefix's text. */
export type Placement = {
  matrix: Matrix;
  paper: [number, number];
  old: [number, number, number, number];
  prefix: string;
};

/**
 * Where a page goes on `paper`, or null when it is already that size the same way round (within a point each
 * side, user unit exactly 1) and is left as it is. Stops with `UnsafePage` when its numbers cannot be written
 * safely. Pure; exported for the unit test.
 */
export function placement(place: Pick<PagePlace, 'turn' | 'box' | 'unit' | 'width' | 'height'>, paper: Paper): Placement | null {
  const [pw, ph] = papers[paper];
  const { width: w, height: h, turn, unit } = place;
  // On its side when more than a point wider than tall; a square page is upright.
  const [TW, TH] = w > h + tolerance + slack ? [ph, pw] : [pw, ph];
  if (unit === 1 && Math.abs(w - TW) <= tolerance + slack && Math.abs(h - TH) <= tolerance + slack) return null;
  const [MW, MH] = turn === 90 || turn === 270 ? [TH, TW] : [TW, TH];
  const [x0, y0, x1, y1] = place.box;
  const [bw, bh] = [x1 - x0, y1 - y0];
  const exact = Math.min(MW / bw, MH / bh);
  const k = fixed(exact);
  if (!(k.value > 0) || Math.abs(k.value - exact) > scaleError * exact) throw new UnsafePage();
  const txExact = (MW - k.value * bw) / 2 - k.value * x0;
  const tyExact = (MH - k.value * bh) / 2 - k.value * y0;
  if (!(Math.abs(txExact) < largestNumber && Math.abs(tyExact) < largestNumber)) throw new UnsafePage();
  const tx = fixed(txExact);
  const ty = fixed(tyExact);
  if (!(Math.abs(tx.value) < largestNumber && Math.abs(ty.value) < largestNumber)) throw new UnsafePage();
  // The clip, in the page's own units, outward of the old shown box, so nothing shown before is clipped: its near
  // corner rounded down; its size taken from the far corner rounded up, written to the nearest (rounding the
  // subtraction up would add its float noise), then one step larger when the far edge would still fall inside the
  // old box, as it can by half a unit in the tenth significant digit. Checked after: outward on every side, and
  // within 0.01 point of the old box once scaled.
  if (![x0, y0, x1, y1].every((n) => Math.abs(n) < largestNumber)) throw new UnsafePage();
  const left = fixed(x0, 20, 'down');
  const bottom = fixed(y0, 20, 'down');
  const outward = (near: number, far: number) => {
    const size = fixed(fixed(far, 20, 'up').value - near);
    return near + size.value < far ? fixed(size.value + 10 ** -decimalsFor(size.value, 20), 20) : size;
  };
  const across = outward(left.value, x1);
  const up = outward(bottom.value, y1);
  const clip = [left.value, bottom.value, left.value + across.value, bottom.value + up.value];
  if (![...clip, across.value, up.value].every((n) => Math.abs(n) < largestNumber)) throw new UnsafePage();
  if (!(clip[0]! <= x0 && clip[1]! <= y0 && clip[2]! >= x1 && clip[3]! >= y1)) throw new UnsafePage();
  const off = [clip[0]! - x0, clip[1]! - y0, clip[2]! - x1, clip[3]! - y1];
  if (off.some((n) => Math.abs(n) * k.value > clipError)) throw new UnsafePage();
  const prefix = `q\n${k.text} 0 0 ${k.text} ${tx.text} ${ty.text} cm\n${left.text} ${bottom.text} ${across.text} ${up.text} re W n\n`;
  return { matrix: { k: k.value, tx: tx.value, ty: ty.value }, paper: [MW, MH], old: [x0, y0, x1, y1], prefix };
}

// ---------------------------------------------------------------------------
// What moves with the page.

/**
 * The moved numbers counted against the new file's size budget while the working copies are made. Each moved
 * number is counted as at least 2 bytes of the update (a digit and a separator) before its array is built, so a
 * crafted file whose one indirect array is named by many annotations, or whose /InkList repeats one stroke,
 * stops with `OutputLimit` before memory holds the copies, not after.
 */
export type Tally = { used: number; limit: number };

/** Counts `count` moved numbers; past the budget, the job stops with `OutputLimit`. */
export function spend(tally: Tally, count: number): void {
  tally.used += 2 * count;
  if (tally.used > tally.limit) throw new OutputLimit();
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const numbers = (value: unknown, count?: (n: number) => boolean): value is number[] =>
  Array.isArray(value) && value.every(isNumber) && (count === undefined || count(value.length));

/** Each (x, y) pair through M, written with at most 6 decimals; null when any is 10^9 or more in size. */
function points(values: readonly number[], m: Matrix, tally: Tally): number[] | null {
  spend(tally, values.length);
  const out: number[] = [];
  for (let at = 0; at < values.length; at += 2) {
    const x = moved(m.k * values[at]! + m.tx);
    const y = moved(m.k * values[at + 1]! + m.ty);
    if (x === null || y === null) return null;
    out.push(x, y);
  }
  return out;
}

/** A rectangle's two corners through M, normalised. */
function rectangle(values: readonly number[], m: Matrix, tally: Tally): number[] | null {
  const moved4 = points(values, m, tally);
  if (!moved4) return null;
  const [a, b, c, d] = moved4 as [number, number, number, number];
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

/** Each value times k, written with at most 6 decimals; null when any is 10^9 or more in size. */
function scaled(values: readonly number[], m: Matrix, tally: Tally): number[] | null {
  spend(tally, values.length);
  const out: number[] = [];
  for (const value of values) {
    const next = moved(value * m.k);
    if (next === null) return null;
    out.push(next);
  }
  return out;
}

/** Whether two boxes share an area: apart, or meeting only at an edge, they do not. */
function overlap(a: readonly number[], b: readonly number[]): boolean {
  return Math.min(a[2]!, b[2]!) > Math.max(a[0]!, b[0]!) && Math.min(a[3]!, b[3]!) > Math.max(a[1]!, b[1]!);
}

/**
 * Moves one annotation dictionary, in place (it is a working copy), by M: each key well formed by its exact count
 * moved, every other left as it was; /Measure removed. `hide` sets the Hidden flag when its old /Rect and the old
 * shown box share no area, and gives whether it did. `resolve` gives the value of an indirect key; the moved value
 * is written direct. Every moved number is counted in `tally` before it is built. Exported for the unit test.
 */
export function moveAnnotation(annotation: Dict, m: Matrix, old: readonly number[] | null, resolve: (value: unknown) => unknown, tally: Tally): boolean {
  const read = (key: string) => resolve(annotation[key]);
  const set = (key: string, value: unknown[] | number | null) => {
    if (value !== null) annotation[key] = value;
  };
  const rect = read('/Rect');
  const oldRect = numbers(rect, (n) => n === 4) ? [Math.min(rect[0]!, rect[2]!), Math.min(rect[1]!, rect[3]!), Math.max(rect[0]!, rect[2]!), Math.max(rect[1]!, rect[3]!)] : null;
  if (oldRect) set('/Rect', rectangle(oldRect, m, tally));
  const quad = read('/QuadPoints');
  if (numbers(quad, (n) => n > 0 && n % 8 === 0)) set('/QuadPoints', points(quad, m, tally));
  const ink = read('/InkList');
  if (Array.isArray(ink) && ink.length > 0) {
    const strokes = ink.map(resolve);
    if (strokes.every((stroke) => numbers(stroke, (n) => n % 2 === 0))) {
      const next = (strokes as number[][]).map((stroke) => points(stroke, m, tally));
      if (next.every((stroke) => stroke !== null)) annotation['/InkList'] = next;
    }
  }
  const vertices = read('/Vertices');
  if (numbers(vertices, (n) => n > 0 && n % 2 === 0)) set('/Vertices', points(vertices, m, tally));
  const line = read('/L');
  if (numbers(line, (n) => n === 4)) set('/L', points(line, m, tally));
  const callout = read('/CL');
  if (numbers(callout, (n) => n === 4 || n === 6)) set('/CL', points(callout, m, tally));
  const path = read('/Path');
  if (Array.isArray(path) && path.length > 0) {
    const parts = path.map(resolve);
    if (parts.every((part) => numbers(part, (n) => n === 2 || n === 6))) {
      const next = (parts as number[][]).map((part) => points(part, m, tally));
      if (next.every((part) => part !== null)) annotation['/Path'] = next;
    }
  }
  const differences = read('/RD');
  if (numbers(differences, (n) => n === 4) && differences.every((n) => n >= 0)) set('/RD', scaled(differences, m, tally));
  for (const key of ['/LL', '/LLE', '/LLO']) {
    const value = read(key);
    if (!isNumber(value)) continue;
    spend(tally, 1);
    const next = moved(value * m.k);
    if (next !== null) annotation[key] = key === '/LLO' ? Math.max(0, next) : next;
  }
  delete annotation['/Measure'];
  if (old && oldRect && !overlap(oldRect, old)) {
    hide(annotation, resolve);
    return true;
  }
  return false;
}

/** Sets the Hidden flag (2) in an annotation's /F, its other flags kept; an absent or non-integer /F is read as 0. */
export function hide(annotation: Dict, resolve: (value: unknown) => unknown): void {
  const flags = resolve(annotation['/F']);
  annotation['/F'] = (Number.isInteger(flags) ? (flags as number) : 0) | 2;
}

/** The kinds of explicit destination, each with its length and which items after the kind are x and which y. */
const destinations: Readonly<Record<string, { length: number; axes: readonly ('x' | 'y' | 'zoom')[] }>> = {
  '/XYZ': { length: 5, axes: ['x', 'y', 'zoom'] },
  '/FitH': { length: 3, axes: ['y'] },
  '/FitBH': { length: 3, axes: ['y'] },
  '/FitV': { length: 3, axes: ['x'] },
  '/FitBV': { length: 3, axes: ['x'] },
  '/FitR': { length: 6, axes: ['x', 'y', 'x', 'y'] },
  '/Fit': { length: 2, axes: [] },
  '/FitB': { length: 2, axes: [] },
};

/** Whether `value` is an explicit destination to a resized page: `[page, kind, …]` of a kind and length that match. */
function destinationOf(value: unknown[], matrices: ReadonlyMap<string, Matrix>): Matrix | undefined {
  const [page, kind] = value;
  if (!isRef(page) || typeof kind !== 'string' || !Object.hasOwn(destinations, kind)) return undefined;
  if (destinations[kind]!.length !== value.length) return undefined;
  return matrices.get(page);
}

/**
 * Every explicit destination to a resized page inside `value`, found by an iterative walk with an explicit stack,
 * at most `destinationDepth` levels deep (deeper parts are not visited). Pure; exported for the unit test.
 */
export function findDestinations(value: unknown, matrices: ReadonlyMap<string, Matrix>): { array: unknown[]; matrix: Matrix }[] {
  const found: { array: unknown[]; matrix: Matrix }[] = [];
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const { value: each, depth } = stack.pop()!;
    if (Array.isArray(each)) {
      const matrix = destinationOf(each, matrices);
      if (matrix) {
        found.push({ array: each, matrix });
        continue;
      }
      if (depth < destinationDepth) for (const item of each) if (typeof item === 'object' && item !== null) stack.push({ value: item, depth: depth + 1 });
    } else if (isDict(each) && depth < destinationDepth) {
      for (const item of Object.values(each)) if (typeof item === 'object' && item !== null) stack.push({ value: item, depth: depth + 1 });
    }
  }
  return found;
}

/** Moves one explicit destination, in place, by M: each coordinate that is a number; null stays null; zoom is kept. */
export function moveDestination(array: unknown[], m: Matrix, tally: Tally): void {
  const { axes } = destinations[array[1] as string]!;
  spend(tally, axes.length);
  axes.forEach((axis, index) => {
    const at = index + 2;
    const value = array[at];
    if (axis === 'zoom' || !isNumber(value)) return;
    const next = moved(axis === 'x' ? m.k * value + m.tx : m.k * value + m.ty);
    if (next !== null) array[at] = next;
  });
}

// ---------------------------------------------------------------------------
// The working copies.

/** What the job keeps once the pages and objects read are let go: the new streams' text and each changed object. */
type Changes = { max: number; limit: number; prefixes: Map<string, string>; restoreId: string; copies: Map<string, unknown> };

/** The one stream that restores the drawing state after a resized page's own streams. */
export const restoreText = '\nQ\n';

/** The page keys removed from a resized page. */
export const removedPageKeys = ['/UserUnit', '/BleedBox', '/TrimBox', '/ArtBox', '/Thumb', '/VP'] as const;

/**
 * Reads the pages and every object, places each page, and makes the working copies: pages, then annotations and
 * their popups, then beads, then destinations. Gives null when no page changes. What was read is not kept: only
 * the copies (clones) leave this function, so the objects map can be let go before the writing qpdf is made.
 */
async function changesFor(
  tools: Parameters<Engine>[3],
  plain: Uint8Array,
  paper: Paper,
  onPage: (done: number, total: number) => void,
  budget: (plainBytes: number, pages: number) => number,
): Promise<Changes | null> {
  const read = await readPages(tools, plain, { objects: true });
  const objects: ReadonlyMap<string, ObjectEntry> = read.objects!;
  const total = read.pages.length;
  // The new file's size budget, known as soon as the pages are read, so the moved numbers are counted against it
  // while the copies are made (`Tally`), and the update against it while it is written.
  const limit = budget(plain.byteLength, total);
  const tally: Tally = { used: 0, limit };
  const valueOf = (id: string): unknown => {
    const entry = objects.get(id);
    return entry && 'value' in entry ? entry.value : undefined;
  };
  const resolve = (value: unknown): unknown => (isRef(value) ? valueOf(value) : value);

  // Placement, by the first listing of each page object.
  const placements = new Map<string, Placement>();
  const seen = new Set<string>();
  const order: { id: string; contents: string[]; placement: Placement }[] = [];
  for (const page of read.pages) {
    if (seen.has(page.id)) continue;
    seen.add(page.id);
    const placed = placement(page.place, paper);
    if (!placed) continue;
    placements.set(page.id, placed);
    order.push({ id: page.id, contents: page.contents, placement: placed });
  }
  if (order.length === 0) return null;

  const copies = new Map<string, unknown>();
  /** The working copy of an indirect object, cloned from what was read the first time any step changes it. */
  const copyOf = (id: string): unknown => {
    if (!copies.has(id)) copies.set(id, structuredClone(valueOf(id)));
    return copies.get(id);
  };
  const prefixes = new Map<string, string>();
  let next = read.max + 1;
  const restoreId = `${next++} 0 R`;

  // 1. Pages.
  for (const { id, contents, placement: placed } of order) {
    const dict = copyOf(id) as Dict;
    let prefixId = prefixes.get(placed.prefix);
    if (prefixId === undefined) {
      prefixId = `${next++} 0 R`;
      prefixes.set(placed.prefix, prefixId);
    }
    dict['/Contents'] = [prefixId, ...contents, restoreId];
    dict['/MediaBox'] = [0, 0, ...placed.paper];
    dict['/CropBox'] = [0, 0, ...placed.paper];
    for (const key of removedPageKeys) delete dict[key];
  }

  // 2 and 3. Annotations and their popups, then beads, through one visited set, in page order. Every page listed
  // is counted in the progress, those left as they are included, so "Page N of M" counts the pages the row shows.
  // A page object is never taken for an annotation or a bead, even when a crafted file lists it as one.
  const visited = new Set<string>(placements.keys());
  const worked = new Set<string>();
  for (const [index, { id }] of read.pages.entries()) {
    const placed = placements.get(id);
    if (!placed || worked.has(id)) {
      onPage(index + 1, total);
      continue;
    }
    worked.add(id);
    const m = placed.matrix;
    const dict = copies.get(id) as Dict;
    /** The items of a page's array key, as a list to change in place: the page's own array, or an indirect array's working copy. */
    const listOf = (key: string): unknown[] | undefined => {
      const value = dict[key];
      if (Array.isArray(value)) return value;
      if (isRef(value) && Array.isArray(valueOf(value))) {
        if (visited.has(value)) return undefined;
        visited.add(value);
        return copyOf(value) as unknown[];
      }
      return undefined;
    };
    const popups: { popup: unknown; hidden: boolean }[] = [];
    // A direct annotation is changed where it sits, inside the page's working copy or the array's.
    const moveOne = (item: unknown, hideable: boolean) => {
      let annotation: Dict;
      if (isRef(item)) {
        if (visited.has(item) || !isDict(valueOf(item))) return;
        visited.add(item);
        annotation = copyOf(item) as Dict;
      } else if (isDict(item)) {
        annotation = item;
      } else return;
      const popup = annotation['/Popup'];
      const isPopup = annotation['/Subtype'] === '/Popup';
      const hidden = moveAnnotation(annotation, m, hideable && !isPopup ? placed.old : null, resolve, tally);
      if (popup !== undefined) popups.push({ popup, hidden });
    };
    const annots = listOf('/Annots');
    if (annots) for (const item of annots) moveOne(item, true);
    // A popup is moved, and never hidden by its own place: it often lies beside the page's shown area, and is opened
    // from its note. It is hidden with its note, so an open popup cannot show a hidden note's text in the white space.
    for (const { popup, hidden } of popups) {
      moveOne(popup, false);
      if (!hidden) continue;
      if (isRef(popup) && isDict(valueOf(popup)) && !placements.has(popup)) hide(copyOf(popup) as Dict, resolve);
      else if (isDict(popup)) hide(popup, resolve);
    }
    const beads = listOf('/B');
    if (beads) {
      for (const item of beads) {
        let bead: Dict;
        if (isRef(item)) {
          if (visited.has(item) || !isDict(valueOf(item))) continue;
          visited.add(item);
          bead = copyOf(item) as Dict;
        } else if (isDict(item)) bead = item;
        else continue;
        const rect = resolve(bead['/R']);
        if (numbers(rect, (n) => n === 4)) {
          const next4 = rectangle(rect, m, tally);
          if (next4) bead['/R'] = next4;
        }
      }
    }
    onPage(index + 1, total);
  }

  // 4. Destinations, last, over the working copy of every object that has one and the read value of every other.
  const matrices = new Map<string, Matrix>();
  for (const [id, placed] of placements) matrices.set(id, placed.matrix);
  for (const [id, entry] of objects) {
    if (!('value' in entry)) continue;
    const current = copies.has(id) ? copies.get(id) : entry.value;
    if (typeof current !== 'object' || current === null) continue;
    let found = findDestinations(current, matrices);
    if (found.length === 0) continue;
    if (!copies.has(id)) found = findDestinations(copyOf(id), matrices);
    for (const { array, matrix } of found) moveDestination(array, matrix, tally);
  }

  return { max: read.max, limit, prefixes, restoreId, copies };
}

/** Bytes as base64, in chunks, with what a worker and Node both have. */
function base64(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(text);
}

/** The limits a run keeps to; tests pass small ones. */
export type Limits = { sizeLimit: (plainBytes: number, pages: number) => number };

/** The engine, with the limits given; tests pass small ones. */
export function makeRun(limits: Partial<Limits> = {}): Engine<Options> {
  const budget = limits.sizeLimit ?? sizeLimit;
  return async (files, options, onProgress, tools) => {
    const file = files[0];
    if (!file || files.length !== 1) throw new Error('Resize pages takes one file.');
    // Refused before any work: only A4 or Letter.
    const paper = acceptedValue('resize-pdf', 'paper', options.paper) as Paper | undefined;
    if (paper === undefined) throw new Error('The paper size is not valid.');
    onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    // The plain copy is handed over in an object and read only through it, so it can be let go once qpdf holds it.
    const source: PlainSource = { plain: (await plainCopy(tools, file, passwordFrom(options))).plain };
    const changes = await changesFor(tools, source.plain!, paper, (done, total) => onProgress({ stage: 'working', unit: 'page', done, total, writesAfter: true }), budget);
    if (!changes) return [];

    const limit = changes.limit;
    const qpdf = await freshQpdf(tools, source.plain!);
    delete source.plain;
    const encoder = new TextEncoder();
    let appended = 0;
    const append = (text: string) => {
      const bytes = encoder.encode(text);
      appended += bytes.length;
      if (appended > limit) throw new OutputLimit();
      qpdf.append('/update.json', bytes);
    };
    const streams = [entryText(changes.restoreId, { stream: { dict: {}, data: base64(encoder.encode(restoreText)) } })];
    for (const [text, id] of changes.prefixes) streams.push(entryText(id, { stream: { dict: {}, data: base64(encoder.encode(text)) } }));
    append(opening(changes.max) + streams.join(','));
    // Each working copy once, in pieces, each let go once written.
    let piece: string[] = [];
    for (const [id, value] of changes.copies) {
      piece.push(entryText(id, { value }));
      changes.copies.delete(id);
      if (piece.length >= 1000) {
        append(`,${piece.join(',')}`);
        piece = [];
      }
    }
    if (piece.length > 0) append(`,${piece.join(',')}`);
    append('}]}');
    // The pages fill the bar to 0.8; qpdf's write is reported from 75% (0.8 of the bar) and held at 95% until the check is done.
    const output = writePageUpdate(qpdf, limit, (percent) => onProgress({ stage: 'writing', percent: Math.min(75 + percent / 5, 95) }));
    onProgress({ stage: 'writing', percent: 100 });
    return [output];
  };
}

export const run: Engine<Options> = makeRun();

export const inspect: Inspector = inspectPdf;
