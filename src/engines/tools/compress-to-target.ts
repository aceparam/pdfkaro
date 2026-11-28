// Compress to a target size: makes one PDF fit the size its page sets (100 KB to 2 MB, counted in thousands), by
// the owner's decisions of 24 Nov 2026: only pictures are made smaller, step by step ("Pictures only"); when the
// target cannot be reached the smallest file made is given and the page says so ("Give the smallest, say so");
// pictures stored without loss stay lossless ("No, keep them lossless").
//
// The pictures it may redo are Compress PDF's own candidates (`listCandidates` in ../shrink.ts), with a stated and a
// real length of at least 4 KB, at most the 10,000 largest, within a fixed budget of pixel work planned from the
// dictionaries before any raw data is read (`plan`). A ladder of seven steps runs from Compress PDF's own setting
// (150 pixels to the inch across the largest page, JPG quality 75) to a floor of 72 pixels to the inch and quality
// 40. Every picture is decoded once and measured at every step in one pass, keeping only sizes; the mildest step
// whose estimate fits within 99% of the target is written, and the written file's real size decides. At most three
// whole-file writes, each through `cappedWrite` with its own fresh qpdf. Text, drawings and fonts are written again
// by qpdf without loss; a password and restrictions are kept, as Compress PDF keeps them.

import { inspectPdf } from '../inspect';
import { freshQpdf, passwordFrom } from '../plain';
import { oneFileLimit, OutputLimit } from '../qpdf';
import { passwordArgsFor, rawBatches, readDictionaries, readRawStreams, writeUpdate, type Dict, type StreamReplacement } from '../qpdf-json';
import { fittedSize } from '../resample';
import {
  decodeJpeg,
  decodeLossless as realDecodeLossless,
  encodeJpeg,
  encodeLossless as realEncodeLossless,
  jpegQuality,
  keepBelow,
  listCandidates,
  losslessOptions,
  need,
  newDictionary,
  pictureContext,
  pixelLimit,
  pixelsPerInch,
  statedLength,
  type Candidate,
  type DecodedJpeg,
  type PictureDecoder,
} from '../shrink';
import type { JpegCanvasMaker } from '../thumbnail';
import type { Engine, EngineModule, EngineTools, Inspector, Progress } from '../types';
import type { Fflate } from '../zlib';
import { acceptedTarget } from '../../widget/option-values';

/** What this tool's reading and its job load, before any file is read: chosen by tool, never by a file (types.ts). */
export const loads: EngineModule['loads'] = { read: ['qpdf'], job: ['qpdf', 'fflate'] };

/**
 * The ladder, mildest first: pixels to the inch across the file's largest page, and the JPG quality as the canvas
 * encoder takes it. Step 1 is Compress PDF's own setting; step 7 is the floor, and nothing goes lower.
 */
export const ladder: readonly { ppi: number; quality: number }[] = [
  { ppi: pixelsPerInch, quality: jpegQuality },
  { ppi: 150, quality: 0.6 },
  { ppi: 120, quality: 0.55 },
  { ppi: 100, quality: 0.5 },
  { ppi: 100, quality: 0.4 },
  { ppi: 85, quality: 0.4 },
  { ppi: 72, quality: 0.4 },
];

/** The steps measured when the full plan is over the budget: 1, 4 and 7, counted from 0. */
export const cutSteps: readonly number[] = [0, 3, 6];

/**
 * The most pixel work a job may plan, in JPG pixels: every candidate's decoded and encoded pixels, over the
 * measuring pass and three writes at the step-1 sizes, summed. Calibrated in task 3.3 against a hostile JPG file and
 * a lossless worst case planned exactly at it, each to finish within 5 minutes in desktop Chromium.
 */
export const pixelWorkBudget = 12_000_000_000;

/** How many JPG pixels one lossless pixel counts as: inflating, area averaging and deflating run in our own JavaScript. */
export const losslessPixelCost = 10;

/** A step is chosen when its estimate is at most this share of the target. */
export const fitShare = 0.99;

/** A picture whose stated or real raw length is under this is left alone. */
export const minPictureBytes = 4 * 1024;

/** At most this many pictures, the largest by stated length, are candidates. */
export const maxCandidates = 10_000;

/** The most whole-file writes in one job. */
export const maxWrites = 3;

/** The sentences this engine throws. Fixed words: never a file's content, name or password. */
const oneFile = 'Compress to a target size takes one file.';
const unknownTarget = 'The target size was not one this tool knows.';
const tooLargeSize = 'A picture step was asked for a size larger than the picture.';

type Size = { width: number; height: number };

/** A candidate as the plan sees it: its kind and pixels from its dictionary, and its stated raw length. */
export type Planned = { id: string; kind: Candidate['kind']; width: number; height: number; stated: number };

/** What the plan keeps: the steps to measure (counted from 0), the candidates kept, and the planned work. */
export type Plan = { steps: number[]; kept: Planned[]; work: number };

/** The size a picture is drawn at under a step's pixel limit: its own when it is not larger. Never larger than its own. */
export function sizeUnder(picture: Size, limit: number): Size {
  if (Math.max(picture.width, picture.height) <= limit) return { width: picture.width, height: picture.height };
  return fittedSize(picture.width, picture.height, limit);
}

const pixels = (size: Size) => size.width * size.height;

/**
 * One candidate's planned work over the measuring pass and three writes, in JPG pixels. A JPG is decoded once per
 * pass (its frame's pixels) and encoded at each measured step, and at the step-1 size in each write. A lossless
 * picture is worked on only when some measured step scales it: inflated once per pass and scaled and deflated at
 * each distinct size, weighted by `losslessPixelCost`.
 */
export function workOf(candidate: Planned, limits: readonly number[], steps: readonly number[]): number {
  const own = pixels(candidate);
  const first = sizeUnder(candidate, limits[steps[0]!]!);
  if (candidate.kind === 'jpeg') {
    const encoded = steps.reduce((sum, step) => sum + pixels(sizeUnder(candidate, limits[step]!)), 0);
    return own + encoded + maxWrites * (own + pixels(first));
  }
  const scaled = new Map<string, number>();
  for (const step of steps) {
    if (Math.max(candidate.width, candidate.height) <= limits[step]!) continue;
    const size = sizeUnder(candidate, limits[step]!);
    scaled.set(`${size.width}x${size.height}`, pixels(size));
  }
  if (scaled.size === 0) return 0;
  const largest = Math.max(...scaled.values());
  const encoded = [...scaled.values()].reduce((sum, each) => sum + each, 0);
  return losslessPixelCost * (own + encoded + maxWrites * (own + largest));
}

/** The object number of an id `N G R`, for ties. */
const objectNumber = (id: string) => Number(id.split(' ')[0]);

/**
 * The plan, from dictionaries alone: every step and every candidate when the work fits `budget`; else only steps
 * 1, 4 and 7, and then, while still over, the lowest-priority candidates left alone (the smallest stated length
 * first, ties by the lower object number). It always fits in the end, with no candidate if need be.
 */
export function plan(candidates: readonly Planned[], limits: readonly number[], budget: number): Plan {
  const all = ladder.map((_, index) => index);
  const total = (steps: readonly number[]) => candidates.reduce((sum, each) => sum + workOf(each, limits, steps), 0);
  const full = total(all);
  if (full <= budget) return { steps: all, kept: [...candidates], work: full };
  const steps = [...cutSteps];
  let work = total(steps);
  const dropped = new Set<string>();
  const order = [...candidates].sort((a, b) => a.stated - b.stated || objectNumber(a.id) - objectNumber(b.id));
  for (const each of order) {
    if (work <= budget) break;
    work -= workOf(each, limits, steps);
    dropped.add(each.id);
  }
  return { steps, kept: candidates.filter((each) => !dropped.has(each.id)), work: Math.max(0, work) };
}

/** The steps the lossless picture work goes through; replaced by a test to count pixels without doing the work. */
export type LosslessSteps = { decode: typeof realDecodeLossless; encode: typeof realEncodeLossless };

/** Test-only knobs: a smaller budget, and the lossless steps. Left out, the constants and the real steps. */
export type TestKnobs = { budget?: number; lossless?: LosslessSteps };

/** One whole-file write: its step (counted from 0), its length, the length handed over for each measured picture, and F. */
export type WritePass = { step: number; length: number; handed: Map<string, number>; rest: number };

/** What `shrinkToBytes` found, for tests: the answer and how it was reached. */
export type Trace = {
  /** The new file, or undefined for no new file. */
  output: Uint8Array | undefined;
  /** The step of the file given, counted from 1; null with no measured picture or no file given. */
  step: number | null;
  /** Each step's estimate before any write, by step counted from 0; undefined for a step not measured. */
  estimates: (number | undefined)[];
  writes: number;
  plan: Plan | null;
  /** Each measured picture's size at each step, by step counted from 0. */
  sizes: Map<string, (number | undefined)[]>;
  passes: WritePass[];
};

/** A kept candidate, with its dictionary and what `canShrink` read from it. */
type Kept = Planned & { dict: Dict; candidate: Candidate };

/** Gives progress, never backwards: a reading at or below the last given is dropped. */
function monotone(onProgress: (progress: Progress) => void) {
  let last = -1;
  return {
    picture(done: number, total: number) {
      onProgress({ stage: 'working', unit: 'picture', done, total });
    },
    writing(percent: number) {
      const rounded = Math.round(percent * 10) / 10;
      if (rounded <= last) return;
      last = rounded;
      onProgress({ stage: 'writing', percent: rounded });
    },
  };
}

/** Where each write's progress goes, from 75: its raw-data pass, then qpdf's write. */
const writeBands: readonly { pass: [number, number]; qpdf: [number, number] }[] = [
  { pass: [75, 86], qpdf: [86, 90] },
  { pass: [91, 93], qpdf: [93, 95] },
  { pass: [96, 97], qpdf: [97, 98] },
];

/**
 * Makes `file` fit `targetBytes` as the module comment says, and says how. The password goes only through
 * `passwordArgs`. A file at or under the target gives no file at once.
 */
export async function shrinkToBytes(
  file: Uint8Array,
  targetBytes: number,
  passwordArgs: readonly string[],
  tools: EngineTools,
  onProgress: (progress: Progress) => void,
  knobs: TestKnobs = {},
): Promise<Trace> {
  const trace: Trace = { output: undefined, step: null, estimates: ladder.map(() => undefined), writes: 0, plan: null, sizes: new Map(), passes: [] };
  if (file.length <= targetBytes) return trace;
  const budget = knobs.budget ?? pixelWorkBudget;
  const lossless = knobs.lossless ?? { decode: realDecodeLossless, encode: realEncodeLossless };
  const progress = monotone(onProgress);
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });

  // Every dictionary, with no stream data. A JSON too large, or any problem, leaves every picture alone; the file is still written again.
  const dicts = readDictionaries(await freshQpdf(tools, file), passwordArgs);
  // Each step's limit, from a resolution of the fixed ladder only. All are undefined when no page has a usable box.
  const limitByPpi = new Map<number, number | undefined>();
  for (const { ppi } of ladder) if (!limitByPpi.has(ppi)) limitByPpi.set(ppi, dicts ? pixelLimit(dicts.objects, ppi) : undefined);
  const stepLimits = ladder.map(({ ppi }) => limitByPpi.get(ppi));
  const limits = stepLimits.every((limit): limit is number => limit !== undefined) ? stepLimits : undefined;
  const max = dicts?.max ?? 0;

  // The candidates: Compress PDF's own, with a stated length of at least 4 KB, the 10,000 largest, then the plan.
  let kept: Kept[] = [];
  if (dicts && limits) {
    const listed = listCandidates(dicts.objects, pictureContext(dicts.objects)).flatMap(({ id, dict, candidate }) => {
      const stated = statedLength(dict, dicts.objects);
      if (stated === undefined || !Number.isFinite(stated) || stated < minPictureBytes) return [];
      return [{ id, dict, candidate, kind: candidate.kind, width: candidate.width, height: candidate.height, stated }];
    });
    const largest = new Set(
      [...listed]
        .sort((a, b) => b.stated - a.stated || objectNumber(a.id) - objectNumber(b.id))
        .slice(0, maxCandidates)
        .map((each) => each.id),
    );
    const chosen = listed.filter((each) => largest.has(each.id));
    trace.plan = plan(chosen, limits, budget);
    const keptIds = new Set(trace.plan.kept.map((each) => each.id));
    kept = chosen.filter((each) => keptIds.has(each.id));
  }
  const steps = trace.plan?.steps ?? [];
  const byId = new Map(kept.map((each) => [each.id, each]));
  const needsJpeg = kept.some((each) => each.kind === 'jpeg');
  const needsLossless = kept.some((each) => each.kind === 'lossless');
  const decoder = needsJpeg ? await need<PictureDecoder>(tools, 'decodePicture') : undefined;
  const canvases = needsJpeg ? await need<JpegCanvasMaker>(tools, 'canvas') : undefined;
  const fflate = needsLossless ? await need<Fflate>(tools, 'fflate') : undefined;
  // Pictures that threw, or that a step cannot redo, are left alone in every later pass.
  const skipped = new Set<string>();
  const rawLength = new Map<string, number>();

  /** The size each step draws `picture` at, never larger than its own. */
  const sizeAt = (picture: Kept, step: number): Size => {
    const size = sizeUnder(picture, limits![step]!);
    // Belt and braces: `sizeUnder` never gives a larger size, so this cannot happen; it is kept so a later change cannot ask for one.
    if (size.width > picture.width || size.height > picture.height) throw new Error(tooLargeSize);
    return size;
  };

  /** A JPG decoded once, at the step-1 size, whatever steps are asked of it afterwards. */
  const decodeJpg = (raw: Uint8Array, picture: Kept) => decodeJpeg(raw, picture.candidate, sizeAt(picture, steps[0]!), decoder!);

  /** A decoded JPG at one step: its data when the encoder wrote one usable frame of the step's size; else undefined. */
  const jpegAt = async (decoded: DecodedJpeg, picture: Kept, step: number) => {
    const size = sizeAt(picture, step);
    // Belt and braces: every step's limit is at most step 1's, so this cannot happen either; kept for the same reason.
    if (size.width > decoded.width || size.height > decoded.height) throw new Error(tooLargeSize);
    const written = await encodeJpeg(decoded, size, ladder[step]!.quality, canvases!);
    if (!written || (picture.candidate.components === 3 && written.components !== 3)) return undefined;
    return { size, ...written };
  };

  /** Each raw-data pass reads the kept pictures not skipped, in bounded batches, each by its own fresh qpdf. */
  async function* rawPass(): AsyncGenerator<[Kept, Uint8Array]> {
    const wanted = kept.filter((each) => !skipped.has(each.id));
    const batches = rawBatches(wanted.map(({ id, stated }) => ({ id, length: stated })));
    for await (const batch of readRawStreams(() => freshQpdf(tools, file), passwordArgs, batches)) {
      for (const [id, raw] of batch) {
        const picture = byId.get(id);
        // The raw data is let go as soon as its picture is done.
        batch.delete(id);
        if (!picture || skipped.has(id)) continue;
        // A picture whose real raw data is under 4 KB is left alone in every pass.
        if (raw.length < minPictureBytes) {
          skipped.add(id);
          continue;
        }
        yield [picture, raw];
      }
    }
  }

  // ---- Measure: one pass, each picture decoded once and measured at every planned step, keeping only sizes.
  if (kept.length > 0) {
    let done = 0;
    const total = kept.length;
    for await (const [picture, raw] of rawPass()) {
      progress.picture(++done, total);
      rawLength.set(picture.id, raw.length);
      try {
        const sizes = await measure(picture, raw);
        if (sizes) trace.sizes.set(picture.id, sizes);
        else skipped.add(picture.id);
      } catch {
        // A picture the browser or our code cannot redo is left as it was, in every pass.
        skipped.add(picture.id);
      }
    }
    if (done < total) progress.picture(total, total);
  }

  async function measure(picture: Kept, raw: Uint8Array): Promise<(number | undefined)[] | undefined> {
    const sizes: (number | undefined)[] = ladder.map(() => undefined);
    if (picture.kind === 'jpeg') {
      const decoded = await decodeJpg(raw, picture);
      if (!decoded) return undefined;
      try {
        for (const step of steps) {
          const written = await jpegAt(decoded, picture, step);
          sizes[step] = written ? Math.min(raw.length, written.bytes.length) : raw.length;
        }
      } finally {
        decoded.picture.close();
      }
      return sizes;
    }
    // A lossless picture is inflated only when some step scales it, and each distinct size is stored once.
    const scales = steps.some((step) => Math.max(picture.width, picture.height) > limits![step]!);
    const decoded = scales ? lossless.decode(raw, picture.candidate, fflate!.Inflate) : undefined;
    if (scales && !decoded) return undefined;
    const bySize = new Map<string, number>();
    for (const step of steps) {
      if (!decoded || Math.max(picture.width, picture.height) <= limits![step]!) {
        sizes[step] = raw.length;
        continue;
      }
      const size = sizeAt(picture, step);
      const key = `${size.width}x${size.height}`;
      if (!bySize.has(key)) bySize.set(key, lossless.encode(decoded, size, fflate!.Deflate).length);
      sizes[step] = Math.min(raw.length, bySize.get(key)!);
    }
    return sizes;
  }

  // ---- Choose: estimate(s) = F + Σ size[i][s], with F0 = the input less the measured pictures' raw data.
  // A picture that cannot be redone in a write, though it was measured, leaves the measured set at once: its raw data
  // then counts in F, so every later estimate is still made from what was written.
  let measured = [...trace.sizes.keys()];
  const unmeasure = (id: string) => {
    trace.sizes.delete(id);
    measured = measured.filter((each) => each !== id);
  };
  const sum = (step: number) => measured.reduce((total, id) => total + trace.sizes.get(id)![step]!, 0);
  const f0 = file.length - measured.reduce((total, id) => total + rawLength.get(id)!, 0);
  for (const step of steps) trace.estimates[step] = f0 + sum(step);
  const fitLine = fitShare * targetBytes;
  /** The mildest of `among` whose estimate with `rest` fits within 99% of the target. */
  const mildestFitting = (among: readonly number[], rest: number) => among.find((step) => rest + sum(step) <= fitLine);
  /** The step of `among` with the smallest estimate with `rest`, the milder on a tie. */
  const smallest = (among: readonly number[], rest: number) =>
    among.reduce<number | undefined>((best, step) => (best === undefined || rest + sum(step) < rest + sum(best) ? step : best), undefined);

  // ---- Write: a raw-data pass encodes each measured picture at the step with the same functions, then one capped write.
  async function write(step: number | null, cap: number, band: (typeof writeBands)[number]): Promise<{ bytes: Uint8Array; handed: Map<string, number> }> {
    const replacements = new Map<string, StreamReplacement>();
    const handed = new Map<string, number>();
    const dropped: string[] = [];
    const scale = ([from, to]: [number, number], share: number) => from + (to - from) * Math.min(1, Math.max(0, share));
    progress.writing(band.pass[0]);
    if (step !== null && measured.length > 0) {
      let done = 0;
      const total = measured.length;
      for await (const [picture, raw] of rawPass()) {
        if (!trace.sizes.has(picture.id)) continue;
        progress.writing(scale(band.pass, ++done / total));
        let replacement: StreamReplacement | undefined;
        let failed = false;
        try {
          replacement = await redo(picture, raw, step);
        } catch {
          replacement = undefined;
          failed = true;
          skipped.add(picture.id);
        }
        // The length handed over, recorded here, before writeUpdate empties the map.
        handed.set(picture.id, replacement ? replacement.data.length : raw.length);
        if (replacement) replacements.set(picture.id, replacement);
        // Measured smaller than written, or thrown: no longer measured (it is written at its raw length).
        else if (failed || trace.sizes.get(picture.id)![step]! < raw.length) dropped.push(picture.id);
      }
    }
    for (const id of dropped) unmeasure(id);
    // A measured picture a pass gave no data for is still counted, at its raw length, so F stays exact.
    for (const id of measured) if (!handed.has(id)) handed.set(id, rawLength.get(id)!);
    progress.writing(band.qpdf[0]);
    // A fresh qpdf, once the reading ones are let go.
    const bytes = writeUpdate(await freshQpdf(tools, file), passwordArgs, max, replacements, losslessOptions, {
      bytes: cap,
      onWriting: (percent) => progress.writing(scale(band.qpdf, percent / 100)),
    });
    replacements.clear();
    return { bytes, handed };
  }

  async function redo(picture: Kept, raw: Uint8Array, step: number): Promise<StreamReplacement | undefined> {
    if (picture.kind === 'jpeg') {
      const decoded = await decodeJpg(raw, picture);
      if (!decoded) return undefined;
      let written: Awaited<ReturnType<typeof jpegAt>>;
      try {
        written = await jpegAt(decoded, picture, step);
      } finally {
        decoded.picture.close();
      }
      // Used only when smaller.
      if (!written || written.bytes.length >= raw.length) return undefined;
      // A grey picture comes back from the canvas as an RGB JPG; its pixels stay grey.
      const space = picture.candidate.deviceGray && written.components === 3 ? '/DeviceRGB' : undefined;
      return { dict: newDictionary(picture.dict, written.size, '/DCTDecode', space), data: written.bytes };
    }
    if (Math.max(picture.width, picture.height) <= limits![step]!) return undefined;
    const decoded = lossless.decode(raw, picture.candidate, fflate!.Inflate);
    if (!decoded) return undefined;
    const size = sizeAt(picture, step);
    const data = lossless.encode(decoded, size, fflate!.Deflate);
    if (data.length >= raw.length) return undefined;
    return { dict: newDictionary(picture.dict, size, '/FlateDecode'), data };
  }

  const record = (step: number | null, bytes: Uint8Array, handed: Map<string, number>): number => {
    const rest = bytes.length - measured.reduce((total, id) => total + handed.get(id)!, 0);
    if (step !== null) trace.passes.push({ step, length: bytes.length, handed, rest });
    trace.writes += 1;
    return rest;
  };

  // With no measured picture, one write, with no replacements.
  if (measured.length === 0) {
    const { bytes } = await write(null, oneFileLimit(file.length), writeBands[0]!);
    trace.writes = 1;
    trace.output = answer(bytes);
    return trace;
  }

  // Write 1: the mildest step whose estimate fits, or the step with the smallest estimate. Capped at 2 × input + 16 MB.
  const chosen = mildestFitting(steps, f0) ?? smallest(steps, f0)!;
  // Only the best file is held between writes: write 1's result goes straight into `best`.
  let best: { bytes: Uint8Array; step: number };
  let rest: number;
  {
    const { bytes, handed } = await write(chosen, oneFileLimit(file.length), writeBands[0]!);
    rest = record(chosen, bytes, handed);
    best = { bytes, step: chosen };
  }
  const written = new Set([chosen]);

  if (best.bytes.length <= targetBytes) {
    // Write 1 fits: a milder step estimated to fit is tried once, capped at the target.
    const milder = mildestFitting(
      steps.filter((step) => step < chosen),
      rest,
    );
    if (milder !== undefined) {
      try {
        const second = await write(milder, targetBytes, writeBands[1]!);
        record(milder, second.bytes, second.handed);
        if (second.bytes.length <= targetBytes) best = { bytes: second.bytes, step: milder };
      } catch (error) {
        // A write stopped by its cap loses: the best file so far is kept.
        if (!(error instanceof OutputLimit)) throw error;
        trace.writes += 1;
      }
    }
  } else {
    // Write 1 is over: stronger steps, at most two more writes, each capped at the best so far.
    let last = chosen;
    while (trace.writes < maxWrites && best.bytes.length > targetBytes) {
      const later = steps.filter((step) => step > last && !written.has(step));
      let next = mildestFitting(later, rest);
      if (next === undefined) {
        const least = smallest(later, rest);
        // Nothing stronger is estimated to be smaller than what was just written: nothing more is written.
        if (least === undefined || rest + sum(least) >= rest + sum(last)) break;
        next = least;
      }
      written.add(next);
      let made: Awaited<ReturnType<typeof write>>;
      try {
        made = await write(next, best.bytes.length, writeBands[trace.writes]!);
      } catch (error) {
        if (!(error instanceof OutputLimit)) throw error;
        trace.writes += 1;
        break;
      }
      rest = record(next, made.bytes, made.handed);
      last = next;
      if (made.bytes.length < best.bytes.length || made.bytes.length <= targetBytes) best = { bytes: made.bytes, step: next };
    }
  }

  trace.output = answer(best.bytes);
  trace.step = trace.output ? best.step + 1 : null;
  return trace;

  /** Any file at or under the target is given; else the smallest, when at most 99% of the input; else none. */
  function answer(bytes: Uint8Array): Uint8Array | undefined {
    if (bytes.length <= targetBytes) return bytes;
    return bytes.length <= file.length * keepBelow ? bytes : undefined;
  }
}

type Options = { passwords?: unknown; target?: unknown };

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const target = acceptedTarget(options.target);
  if (!target) throw new Error(unknownTarget);
  const file = files[0];
  if (!file || files.length !== 1) throw new Error(oneFile);
  const { output } = await shrinkToBytes(file, target.bytes, passwordArgsFor(passwordFrom(options)), tools, onProgress);
  // No 100% here: the result follows at once, and a full bar beside "Writing" would say the work is done before it is.
  return output ? [output] : [];
};

export const inspect: Inspector = inspectPdf;
