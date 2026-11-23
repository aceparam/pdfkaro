// Crop PDF: cuts the white margins off every page of one PDF, each page to its
// own content (the owner's decisions of 23 Nov 2026: automatic only, each page
// on its own). No option is read.
//
// Each page is drawn by PDF.js as a reader shows it and measured
// (`measure` in thumbnail.ts): what is drawn and not white, with the boxes of
// the annotations a reader shows. Its new shown box is that content plus a
// margin of a fortieth of its shorter side, never larger than before. A page
// that is blank, already full to its edges, or not safe to measure is left as
// it was; from the first refused helper-data request on, every page is, so text
// PDF.js could not draw is never cut off.
//
// On each cut page only /CropBox changes, written on the page itself, with the
// page's own /BleedBox, /TrimBox and /ArtBox cut back to it as direct arrays
// (or removed when unreadable or left with no area). Content, /MediaBox,
// /Rotate, /UserUnit and every other key are the page's own. What was cut off
// stays in the file, as the page says. The new file has no password and no
// restrictions, as every page tool's. When no page is cut, no file is given.
//
// Memory: PDF.js keeps every page it opens until its document is destroyed, so
// pages are measured in runs of 2,000, each from a fresh copy of the plain copy,
// closed before the next. At most two whole copies are alive at once.

import { inspectPdf } from '../inspect';
import { passwordFrom, freshQpdf, plainCopy } from '../plain';
import { callWithArgumentFile, isRef, objectArg, objectsPerCall, updateJson, type Dict } from '../qpdf-json';
import { finished, OutputLimit } from '../qpdf';
import { readPages, runPages, sizeLimit, writeUpdate, type PagePlace, type PlainSource } from '../stamp';
import { boxFrom, intersect, openDocument, type Box, type Measured } from '../thumbnail';
import type { Engine, EngineModule, EngineTools, Inspector } from '../types';
import { outOfMemory } from '../../widget/memory';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['qpdf'], job: ['qpdf', 'pdfjs'] };

type Options = { passwords?: unknown };

/** The margin left around a page's content, as a part of its shorter shown side: about 5 mm on A4. */
export const marginFraction = 1 / 40;

/** A page whose cut would move no edge in by this many points is left as it was. */
export const leastCut = 1;

/** The largest coordinate written, far below where a number would need an exponent. */
export const largestCoordinate = 1e9;

/** The page boxes cut back with the crop box. They are not inherited (ISO 32000-2, 14.11.2), so only a page's own are read. */
export const otherBoxes = ['/BleedBox', '/TrimBox', '/ArtBox'] as const;

/** Rounds down, or up, to a thousandth, so a cut box never cuts into what it was grown around. */
const floor3 = (value: number) => Math.floor(value * 1000) / 1000;
const ceil3 = (value: number) => Math.ceil(value * 1000) / 1000;

/** The same numbers to within a hundredth. */
const near = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]!) <= 0.01);

/**
 * A page's new crop box, in its own units, or null to leave it as it was. `place` is where qpdf reads that the
 * page is shown; `measured` what PDF.js drew of it. Pure; exported for the unit test.
 */
export function cutBox(place: Pick<PagePlace, 'box' | 'turn' | 'unit'>, measured: Measured): Box | null {
  if (measured.kind !== 'box') return null;
  const { shown } = measured;
  // PDF.js and qpdf must agree on where the page is shown, or the box would be measured on another page shape.
  const turn = (((shown.rotate % 360) + 360) % 360) as number;
  if (!near(shown.view, place.box) || turn !== place.turn || Math.abs(shown.userUnit - place.unit) > 1e-9) return null;
  const old = place.box;
  const unit = place.unit;
  const shorter = Math.min(old[2] - old[0], old[3] - old[1]) * unit;
  const margin = (shorter * marginFraction) / unit;
  const content = boxFrom(measured.box);
  if (!content) return null;
  const grown: Box = [content[0] - margin, content[1] - margin, content[2] + margin, content[3] + margin];
  const inside = intersect(grown, old);
  if (!inside) return null;
  const rounded: Box = [floor3(inside[0]), floor3(inside[1]), ceil3(inside[2]), ceil3(inside[3])];
  const box: Box = [Math.max(rounded[0], old[0]), Math.max(rounded[1], old[1]), Math.min(rounded[2], old[2]), Math.min(rounded[3], old[3])];
  // Checked before it is used: four finite numbers, in order, inside the old box, small enough to write plainly.
  if (!box.every((value) => Number.isFinite(value) && Math.abs(value) < largestCoordinate)) return null;
  if (!(box[0] < box[2] && box[1] < box[3])) return null;
  if (box[0] < old[0] || box[1] < old[1] || box[2] > old[2] || box[3] > old[3]) return null;
  // Moves no edge in by a point or more, as shown: left as it was.
  const least = leastCut / unit;
  if (box[0] - old[0] < least && box[1] - old[1] < least && old[2] - box[2] < least && old[3] - box[3] < least) return null;
  return box;
}

/**
 * The page's own dictionary with its new crop box, and its own bleed, trim and art boxes cut back to it as
 * direct arrays, or removed when unreadable or left with no area. `resolve` gives the value of an indirect box.
 * Every other key is the page's own. Pure; exported for the unit test.
 */
export function croppedDict(dict: Dict, box: Box, resolve: (ref: string) => unknown): Dict {
  const next: Dict = { ...dict, '/CropBox': [...box] };
  for (const key of otherBoxes) {
    if (!Object.hasOwn(dict, key)) continue;
    const value = isRef(dict[key]) ? resolve(dict[key] as string) : dict[key];
    const own = boxFrom(value);
    const cut = own ? intersect(own, box) : null;
    if (cut) next[key] = cut.map((n) => Math.round(n * 1000) / 1000);
    else delete next[key];
  }
  return next;
}

/** The values of these indirect objects, read by fresh qpdf instances in batches, from the plain copy. */
async function readValues(tools: EngineTools, plain: Uint8Array, ids: readonly string[]): Promise<Map<string, unknown>> {
  const values = new Map<string, unknown>();
  // One instance breaks after a few hundred calls, so a fresh one serves at most fifty batches.
  const callsPerInstance = 50;
  for (let start = 0; start < ids.length; start += objectsPerCall * callsPerInstance) {
    const qpdf = await freshQpdf(tools, plain);
    const end = Math.min(ids.length, start + objectsPerCall * callsPerInstance);
    for (let at = start; at < end; at += objectsPerCall) {
      const batch = ids.slice(at, Math.min(end, at + objectsPerCall));
      const read = callWithArgumentFile(qpdf, ['--json=2', '--json-key=qpdf', ...batch.map(objectArg), '/in.pdf']);
      if (!finished(read.code)) throw new Error('qpdf could not read the page boxes.');
      const parsed: unknown = JSON.parse(read.out);
      const body = typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Dict).qpdf) ? ((parsed as Dict).qpdf as unknown[])[1] : undefined;
      if (typeof body !== 'object' || body === null) continue;
      for (const id of batch) {
        const entry = (body as Dict)[`obj:${id}`];
        if (typeof entry === 'object' && entry !== null && 'value' in entry) values.set(id, (entry as { value: unknown }).value);
      }
    }
  }
  return values;
}

/** An error that ends the job rather than leaving one page as it was: memory, or PDF.js's own worker gone. */
function endsTheJob(error: unknown): boolean {
  return outOfMemory(error) || (error instanceof Error && /^PDF\.js (stopped|is unavailable)/.test(error.message));
}

/** The limits a run keeps to; tests pass small ones. */
export type Limits = { sizeLimit: (plainBytes: number, pages: number) => number };

/** The engine, with the limits given; tests pass small ones. */
export function makeRun(limits: Partial<Limits> = {}): Engine<Options> {
  const budget = limits.sizeLimit ?? sizeLimit;
  return async (files, options, onProgress, tools) => {
    const file = files[0];
    if (!file || files.length !== 1) throw new Error('Crop PDF takes one file.');
    // The plain copy is handed over in an object and read only through it, so it can be let go once qpdf holds it.
    const source: PlainSource = { plain: (await plainCopy(tools, file, passwordFrom(options))).plain };
    const read = await readPages(tools, source.plain!);
    // Only what is needed is kept: the resources and their pictures' dictionaries are let go.
    const pages = read.pages.map(({ id, dict, place }) => ({ id, dict, place }));
    const total = pages.length;
    const progress = (done: number) => onProgress({ stage: 'working', unit: 'page', done, total, writesAfter: true });

    const cuts = new Map<number, Box>();
    // Set from the first refused helper-data request on, across runs: every later page is left as it was.
    let refused = false;
    for (let start = 0; start < total && !refused; start += runPages) {
      // A fresh document for each run: PDF.js keeps every page it has opened until its document is destroyed.
      const doc = await openDocument(source.plain!.slice(), undefined, tools);
      try {
        if (doc.pages !== total) throw new Error('The pages could not be read.');
        const end = Math.min(total, start + runPages);
        for (let index = start; index < end; index++) {
          const measured = await doc.measure(index + 1);
          if (measured.kind === 'unsafe' && measured.error !== undefined && endsTheJob(measured.error)) throw measured.error;
          if (measured.kind === 'unsafe' && measured.refused) {
            refused = true;
            break;
          }
          const box = cutBox(pages[index]!.place, measured);
          if (box) cuts.set(index, box);
          progress(index + 1);
        }
      } finally {
        // Closed before the next run and before writing. A close that fails (PDF.js stopped) is not the job's result.
        await doc.close().catch(() => {});
      }
    }
    // The pages left after a refusal are counted at once: none of them is measured.
    if (refused) progress(total);
    if (cuts.size === 0) return [];

    // The page boxes held in other objects, for the pages that are cut.
    const refs = new Set<string>();
    for (const index of cuts.keys()) {
      const dict = pages[index]!.dict;
      for (const key of otherBoxes) if (isRef(dict[key])) refs.add(dict[key] as string);
    }
    const values = refs.size > 0 ? await readValues(tools, source.plain!, [...refs]) : new Map<string, unknown>();

    // One page object listed twice has one dictionary: the box of its first listing.
    const update = new Map<string, Dict>();
    for (const [index, box] of cuts) {
      const page = pages[index]!;
      if (!update.has(page.id)) update.set(page.id, croppedDict(page.dict, box, (ref) => values.get(ref)));
    }
    const limit = budget(source.plain!.byteLength, total);
    const text = new TextEncoder().encode(updateJson(read.max, update));
    if (text.byteLength > limit) throw new OutputLimit();

    const qpdf = await freshQpdf(tools, source.plain!);
    delete source.plain;
    qpdf.write('/update.json', text);
    // The pages fill the bar to 0.8; qpdf's write is reported from 75% and held at 95% until the check is done.
    const output = writeUpdate(qpdf, limit, (percent) => onProgress({ stage: 'writing', percent: Math.min(75 + percent / 5, 95) }));
    onProgress({ stage: 'writing', percent: 100 });
    return [output];
  };
}

export const run: Engine<Options> = makeRun();

export const inspect: Inspector = inspectPdf;
