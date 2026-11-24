// The Compress to a target size engine, with the same qpdf the browser uses and pictures decoded and drawn through
// @napi-rs/canvas in place of the worker's createImageBitmap and OffscreenCanvas. `fetch` is replaced by a function
// that throws and records, and is never called; whole-file writes are counted. Most fixtures are under 100 KB, so
// `shrinkToBytes` is also called with targets of a half and a tenth of each fixture's size. The budget tests do no
// real pixel work: they count what a decoder and canvas stand-in are asked for.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Deflate, Inflate } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Qpdf } from '../../src/engines/qpdf';
import { decodeLossless, keepBelow, losslessOptions } from '../../src/engines/shrink';
import {
  cutSteps,
  inspect,
  ladder,
  loads,
  losslessPixelCost,
  maxCandidates,
  minPictureBytes,
  pixelWorkBudget,
  plan,
  run,
  shrinkToBytes,
  sizeUnder,
  workOf,
  type LosslessSteps,
  type Planned,
  type Trace,
} from '../../src/engines/tools/compress-to-target';
import type { EngineTools, Progress } from '../../src/engines/types';
import { progressFraction } from '../../src/widget/format';
import { sizeTargets } from '../../src/widget/option-values';
import { watchFetch } from './resize-helpers';
import { fixture, makeQpdf, pageStreams, password, qpdfOn, texts } from './stamp-helpers';
import { countingLossless, countingStandIns, flatJpeg, frameOnlyJpeg, losslessData, paddedJpeg, photoJpeg, picturePdf, rawPdf, streamObject, type Placed } from './target-helpers';
import { tools as drawingTools } from './thumbnail-helpers';

// ---------------------------------------------------------------------------
// Tools: qpdf with its whole-file writes counted, and everything else as the worker gives it.

const counted = { writes: 0, qpdfs: 0, caps: [] as number[] };
/** qpdf, counting each instance and each whole-file write (`cappedWrite` caps /out.pdf before each), with each write's cap. */
async function countingQpdf(patch?: (path: string, data: Uint8Array) => Uint8Array): Promise<Qpdf> {
  const qpdf = await makeQpdf();
  counted.qpdfs += 1;
  const capFile = qpdf.capFile.bind(qpdf);
  qpdf.capFile = (path, limit) => {
    if (path === '/out.pdf') {
      counted.writes += 1;
      counted.caps.push(limit);
    }
    return capFile(path, limit);
  };
  if (patch) {
    const read = qpdf.read.bind(qpdf);
    qpdf.read = (path) => patch(path, read(path));
  }
  return qpdf;
}
const tools: EngineTools = { ...drawingTools, qpdf: () => countingQpdf() };
const withTools = (more: Partial<Record<string, () => Promise<unknown>>>): EngineTools => ({ ...tools, ...more }) as EngineTools;

let fetchWatch: ReturnType<typeof watchFetch>;
beforeAll(() => {
  fetchWatch = watchFetch();
});
afterAll(() => {
  fetchWatch.restore();
  expect(fetchWatch.calls).toEqual([]);
});

const argsFor = (given?: string) => (given === undefined ? [] : [`--password=${given}`]);

async function shrink(file: Uint8Array, target: number, options: { given?: string; tools?: EngineTools; budget?: number; lossless?: LosslessSteps } = {}) {
  const progress: Progress[] = [];
  counted.writes = 0;
  counted.caps = [];
  const trace = await shrinkToBytes(file, target, argsFor(options.given), options.tools ?? tools, (step) => progress.push(step), {
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
    ...(options.lossless ? { lossless: options.lossless } : {}),
  });
  return { trace, progress, writes: counted.writes };
}

/** A file written again by qpdf with Compress PDF's own options, so qpdf's rewrite of it adds or saves next to nothing. */
async function packed(bytes: Uint8Array): Promise<Uint8Array> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call(['/in.pdf', ...losslessOptions, '/out.pdf']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  return qpdf.read('/out.pdf');
}

/** The estimate of step `step` (counted from 0) with a given F: F plus every measured picture's size at that step. */
const estimateWith = (trace: Trace, step: number, rest: number) => rest + [...trace.sizes.values()].reduce((sum, sizes) => sum + sizes[step]!, 0);

/**
 * The exact check of the estimate, on every write a job made: each measured picture's size at the step written is the
 * length handed to qpdf for it. (With F taken from the written length, the estimate of the step written then equals
 * that length by construction, so that is not checked again.)
 */
function expectExactEstimates(trace: Trace) {
  for (const pass of trace.passes) {
    for (const [id, sizes] of trace.sizes) expect(pass.handed.get(id), `picture ${id} at step ${pass.step + 1}`).toBe(sizes[pass.step]);
  }
}

/** The pictures of a file: each image's dictionary and its data, raw or decoded where qpdf decodes it without loss, by qpdf's JSON. */
async function picturesOf(bytes: Uint8Array, given?: string, decoded = false): Promise<{ id: string; dict: Record<string, unknown>; data: Buffer }[]> {
  const qpdf = await makeQpdf();
  qpdf.write('/in.pdf', bytes);
  const { code } = qpdf.call([...argsFor(given), '--json=2', '--json-key=qpdf', `--decode-level=${decoded ? 'generalized' : 'none'}`, '--json-stream-data=inline', '/in.pdf', '/out.json']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf exit ${code}`);
  const objects = (JSON.parse(new TextDecoder().decode(qpdf.read('/out.json'))) as { qpdf: [unknown, Record<string, { stream?: { dict: Record<string, unknown>; data?: string } }>] }).qpdf[1];
  return Object.entries(objects).flatMap(([key, entry]) =>
    entry.stream && entry.stream.dict['/Subtype'] === '/Image' ? [{ id: key.slice(4), dict: entry.stream.dict, data: Buffer.from(entry.stream.data ?? '', 'base64') }] : [],
  );
}

const jpegEntries = (width: number, height: number, space = '/DeviceRGB') => `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode`;
const losslessEntries = (width: number, height: number, space = '/DeviceRGB') => `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /FlateDecode`;

// ---------------------------------------------------------------------------

describe('what it declares and refuses', () => {
  it('loads qpdf to read, and qpdf and fflate for the job, as Compress PDF', () => {
    expect(loads).toEqual({ read: ['qpdf'], job: ['qpdf', 'fflate'] });
  });

  it('reads files as the other PDF tools do', async () => {
    await expect(inspect(fixture('password.pdf'), undefined, tools)).resolves.toEqual({ kind: 'needs-password' });
    await expect(inspect(fixture('compress-scans.pdf'), undefined, tools)).resolves.toEqual({ kind: 'ready', pages: 3 });
  });

  it('refuses a missing or unknown target before reading the file, with a fixed sentence', async () => {
    const file = fixture('compress-scans.pdf');
    for (const target of [undefined, '300kb', '__proto__', 'toString', 200_000, 200, null, { bytes: 1 }]) {
      counted.qpdfs = 0;
      await expect(run([file], { target }, () => {}, tools)).rejects.toThrow('The target size was not one this tool knows.');
      expect(counted.qpdfs, String(target)).toBe(0);
    }
  });

  it('takes one file', async () => {
    await expect(run([], { target: '100kb' }, () => {}, tools)).rejects.toThrow('Compress to a target size takes one file.');
    await expect(run([fixture('text.pdf'), fixture('text.pdf')], { target: '100kb' }, () => {}, tools)).rejects.toThrow('takes one file');
  });

  it('gives no file, reading nothing, for a file at or under the target', async () => {
    const file = fixture('compress-scans.pdf');
    counted.qpdfs = 0;
    expect(await run([fixture('text.pdf')], { target: '100kb' }, () => {}, tools)).toEqual([]);
    const { trace } = await shrink(file, file.length);
    expect(trace).toMatchObject({ output: undefined, writes: 0, plan: null });
    expect(counted.qpdfs).toBe(0);
  });
});

describe('the ladder', () => {
  it('runs from Compress PDF’s own setting to the floor of 72 pixels to the inch and quality 40', () => {
    expect(ladder).toEqual([
      { ppi: 150, quality: 0.75 },
      { ppi: 150, quality: 0.6 },
      { ppi: 120, quality: 0.55 },
      { ppi: 100, quality: 0.5 },
      { ppi: 100, quality: 0.4 },
      { ppi: 85, quality: 0.4 },
      { ppi: 72, quality: 0.4 },
    ]);
    expect(cutSteps).toEqual([0, 3, 6]);
    expect([pixelWorkBudget, losslessPixelCost, minPictureBytes, maxCandidates]).toEqual([pixelWorkBudget, 10, 4096, 10_000]);
  });

  it('never asks for a size larger than the picture', () => {
    expect(sizeUnder({ width: 300, height: 200 }, 600)).toEqual({ width: 300, height: 200 });
    expect(sizeUnder({ width: 3000, height: 2000 }, 600)).toEqual({ width: 600, height: 400 });
    expect(sizeUnder({ width: 1, height: 5000 }, 72)).toEqual({ width: 1, height: 72 });
  });
});

describe('the plan of pixel work', () => {
  // Limits for a page whose every step leaves a 1000-pixel picture alone, and for one whose steps all scale it.
  const roomy = [9000, 9000, 9000, 9000, 9000, 9000, 9000];
  const tight = [600, 600, 480, 400, 400, 340, 288];
  const jpeg = (id: string, stated: number, side = 1000): Planned => ({ id, kind: 'jpeg', width: side, height: side, stated });
  const lossless = (id: string, stated: number, side = 1000): Planned => ({ id, kind: 'lossless', width: side, height: side, stated });

  it('counts a JPG’s decodes and encodes over the measuring pass and three writes', () => {
    // Measuring: decoded once, encoded at seven steps; each write: decoded and encoded at the step-1 size.
    expect(workOf(jpeg('1 0 R', 5000), roomy, [0, 1, 2, 3, 4, 5, 6])).toBe(1e6 + 7e6 + 3 * 2e6);
    expect(workOf(jpeg('1 0 R', 5000), roomy, cutSteps)).toBe(1e6 + 3e6 + 3 * 2e6);
    expect(workOf(jpeg('1 0 R', 5000), tight, cutSteps)).toBe(1e6 + (360_000 + 160_000 + 82_944) + 3 * (1e6 + 360_000));
  });

  it('weights lossless pixels, and counts nothing for a lossless picture no step scales', () => {
    expect(workOf(lossless('1 0 R', 5000), roomy, [0, 1, 2, 3, 4, 5, 6])).toBe(0);
    // Five distinct sizes: 600, 480, 400, 340 and 288 pixels across.
    const encoded = 600 ** 2 + 480 ** 2 + 400 ** 2 + 340 ** 2 + 288 ** 2;
    expect(workOf(lossless('1 0 R', 5000), tight, [0, 1, 2, 3, 4, 5, 6])).toBe(losslessPixelCost * (1e6 + encoded + 3 * (1e6 + 600 ** 2)));
  });

  it('cuts nothing under the budget', () => {
    const candidates = [jpeg('1 0 R', 5000), jpeg('2 0 R', 6000)];
    const full = 2 * 14e6;
    expect(plan(candidates, roomy, full)).toEqual({ steps: [0, 1, 2, 3, 4, 5, 6], kept: candidates, work: full });
  });

  it('first measures only steps 1, 4 and 7', () => {
    const candidates = [jpeg('1 0 R', 5000), jpeg('2 0 R', 6000)];
    expect(plan(candidates, roomy, 2 * 10e6)).toEqual({ steps: [0, 3, 6], kept: candidates, work: 2 * 10e6 });
  });

  it('then leaves alone the smallest candidates, ties by the lower object number, until the plan fits', () => {
    const candidates = [jpeg('5 0 R', 9000), jpeg('3 0 R', 4096), jpeg('7 0 R', 4096), jpeg('9 0 R', 20_000)];
    const cut = plan(candidates, roomy, 2 * 10e6);
    expect(cut.steps).toEqual([0, 3, 6]);
    expect(cut.kept.map((each) => each.id)).toEqual(['5 0 R', '9 0 R']);
    expect(cut.work).toBe(2 * 10e6);
    const one = plan(candidates, roomy, 10e6 + 1);
    expect(one.kept.map((each) => each.id)).toEqual(['9 0 R']);
    expect(plan(candidates, roomy, 1)).toEqual({ steps: [0, 3, 6], kept: [], work: 0 });
  });

  it('weights lossless candidates when it cuts', () => {
    const candidates = [lossless('2 0 R', 9000), jpeg('3 0 R', 5000)];
    const lossWork = workOf(candidates[0]!, tight, cutSteps);
    const jpegWork = workOf(candidates[1]!, tight, cutSteps);
    expect(lossWork).toBeGreaterThan(9 * jpegWork);
    // A budget for the JPG alone drops the lossless picture, though its stated length is larger, only after the JPG.
    expect(plan(candidates, tight, jpegWork).kept).toEqual([]);
    expect(plan(candidates, tight, lossWork).kept.map((each) => each.id)).toEqual(['2 0 R']);
  });
});

describe('the pixel budget, with no real pixel work', () => {
  it('a small file of a few hundred JPGs that pass the frame check: cut to steps 1, 4 and 7, then the smallest dropped', async () => {
    // 200 JPGs of 1000 by 1000 that pass the frame check, each at least 4 KB, of different lengths, on a page no step scales them on.
    const base = flatJpeg(1000, 1000);
    const pictures: Placed[] = Array.from({ length: 200 }, (_, index) => ({ entries: jpegEntries(1000, 1000), data: paddedJpeg(base, Math.max(base.length, 4200) + index * 8) }));
    const file = picturePdf(7200, 7200, pictures);
    const stand = countingStandIns();
    const budget = 1_000_000_000;
    const { trace } = await shrink(file, Math.floor(file.length / 2), { budget, tools: withTools({ decodePicture: async () => stand.decoder, canvas: async () => stand.canvas }) });
    expect(trace.plan!.steps).toEqual([0, 3, 6]);
    // Each kept picture plans 10 million: 1 decoded, 3 encoded, 3 writes of 2.
    expect(trace.plan!.kept).toHaveLength(100);
    const keptStated = trace.plan!.kept.map((each) => each.stated);
    const all = (await picturesOf(file)).map((each) => each.data.length).sort((a, b) => b - a);
    expect(Math.min(...keptStated)).toBe(all[99]);
    expect(trace.plan!.work).toBeLessThanOrEqual(budget);
    expect(stand.counts.decodedPixels + stand.counts.encodedPixels).toBeLessThanOrEqual(budget);
    expect(stand.counts.decodes).toBeGreaterThanOrEqual(100);
    // The job ends, with a file: the stand-in's tiny pictures go in.
    expect(trace.output).toBeDefined();
    expect((await qpdfOn(trace.output!, ['--check'])).code).toBe(0);
  }, 120_000);

  it('the lossless counterpart: about 50 grey pictures, weighted, cut the same way', async () => {
    // 50 grey lossless pictures of 300 by 300 on a page of 72 points, so every step scales them (150 to 72 pixels across).
    const pictures: Placed[] = Array.from({ length: 50 }, (_, index) => ({ entries: losslessEntries(300, 300, '/DeviceGray'), data: losslessData(300, 300, 1, index + 1) }));
    const file = picturePdf(72, 72, pictures);
    expect(file.length).toBeGreaterThan(1_000_000);
    const stand = countingStandIns();
    const budget = 100_000_000;
    const { trace } = await shrink(file, Math.floor(file.length / 2), { budget, lossless: countingLossless(stand.counts, decodeLossless) as LosslessSteps });
    expect(trace.plan!.steps).toEqual([0, 3, 6]);
    expect(trace.plan!.kept.length).toBeGreaterThan(0);
    expect(trace.plan!.kept.length).toBeLessThan(50);
    const weighted = losslessPixelCost * (stand.counts.losslessDecodedPixels + stand.counts.losslessEncodedPixels);
    expect(weighted).toBeGreaterThan(0);
    expect(weighted).toBeLessThanOrEqual(budget);
    expect(trace.plan!.work).toBeLessThanOrEqual(budget);
    // The job ends: a file, or none; never a failure.
    if (trace.output) expect((await qpdfOn(trace.output, ['--check'])).code).toBe(0);
  }, 120_000);
});

describe('finding the step on JPG-only files', () => {
  let file: Uint8Array;
  let estimates: number[];
  beforeAll(async () => {
    // One photo of 1600 by 1600 on a page of 4 inches: 600 pixels across at step 1, 288 at the floor.
    file = await packed(picturePdf(288, 288, [{ entries: jpegEntries(1600, 1600), data: await photoJpeg(1600, 1600) }]));
    const { trace } = await shrink(file, file.length - 1);
    estimates = trace.estimates as number[];
    expect(estimates.every((value) => typeof value === 'number')).toBe(true);
    // Every step is smaller than the one before, so each can be chosen alone.
    for (let step = 1; step < 7; step++) expect(estimates[step]!).toBeLessThan(estimates[step - 1]!);
  }, 120_000);
  /** A target whose 99% line sits a quarter of the way from step `step`'s estimate to the milder one's. */
  const targetFor = (step: number) => Math.ceil((estimates[step]! + (estimates[step - 1]! - estimates[step]!) / 4) / 0.99);

  it.each([
    [1, () => Math.ceil(estimates[0]! / 0.99) + 50],
    [4, () => targetFor(3)],
    [7, () => targetFor(6)],
  ])('answers at step %s with one write', async (step, target) => {
    const goal = target();
    const { trace, writes } = await shrink(file, goal);
    expect(trace.step).toBe(step);
    expect(trace.writes).toBe(1);
    expect(writes).toBe(1);
    expect(trace.output!.length).toBeLessThanOrEqual(goal);
    expectExactEstimates(trace);
    // On a file already written by qpdf, the estimate before any write is within 2% of the written length.
    expect(Math.abs(estimates[step - 1]! - trace.output!.length) / trace.output!.length).toBeLessThan(0.02);
    const [picture] = await picturesOf(trace.output!);
    const limit = Math.ceil((288 / 72) * ladder[step - 1]!.ppi);
    expect(picture!.dict).toMatchObject({ '/Width': limit, '/Height': limit, '/Filter': '/DCTDecode' });
    expect((await qpdfOn(trace.output!, ['--check'])).code).toBe(0);
  }, 60_000);

  it('gives the smallest file made at the floor, over the target, when it saves at least 1%', async () => {
    const goal = Math.floor(estimates[6]! / 2);
    const { trace, writes } = await shrink(file, goal);
    expect(trace.step).toBe(7);
    // The floor already had the smallest estimate, so nothing more is written.
    expect(writes).toBe(1);
    expect(trace.output!.length).toBeGreaterThan(goal);
    expect(trace.output!.length).toBeLessThanOrEqual(file.length * keepBelow);
  }, 60_000);

  /** A canvas whose encoder writes tiny pictures while measuring when `lie` says so, and what it is asked for after. */
  function lyingCanvas(lie: (quality: number) => boolean, after: (quality: number) => number = (quality) => quality) {
    let measuring = true;
    const real = drawingTools.canvas!;
    return {
      writing: () => (measuring = false),
      canvas: async () => {
        const maker = (await real()) as { jpeg(canvas: unknown, quality: number): Promise<Uint8Array> };
        return {
          ...maker,
          jpeg: async (target: unknown, quality: number) => {
            if (measuring && lie(quality)) {
              const { width, height } = target as { width: number; height: number };
              return frameOnlyJpeg(width, height, 3, 2);
            }
            return maker.jpeg(target, measuring ? quality : after(quality));
          },
        };
      },
    };
  }
  async function shrinkLying(target: number, lying: ReturnType<typeof lyingCanvas>) {
    counted.writes = 0;
    counted.caps = [];
    const trace = await shrinkToBytes(file, target, [], withTools({ canvas: lying.canvas }), (step) => {
      if (step.stage === 'writing') lying.writing();
    });
    return { trace, writes: counted.writes };
  }

  it('writes a second time when the first written file is over, and keeps the one that fits', async () => {
    // Step 1 is measured far too small, so it is written first and found over; the second write is the mildest step that then fits.
    const lying = lyingCanvas((quality) => quality === 0.75);
    const goal = targetFor(3);
    const { trace, writes } = await shrinkLying(goal, lying);
    expect(writes).toBe(2);
    expect(trace.passes.map((pass) => pass.step)).toEqual([0, 3]);
    expect(trace.step).toBe(4);
    expect(trace.output!.length).toBeLessThanOrEqual(goal);
  }, 60_000);

  it('writes at most three times, each capped at the best so far', async () => {
    // Every step is measured far too small, so every written file is over; the search stops after three writes.
    const lying = lyingCanvas(() => true);
    const goal = Math.floor(estimates[6]! / 3);
    const { trace, writes } = await shrinkLying(goal, lying);
    expect(writes).toBe(3);
    expect(trace.writes).toBe(3);
    expect(trace.passes.map((pass) => pass.step)).toEqual([0, 1, 2]);
    expect(trace.output!.length).toBe(Math.min(...trace.passes.map((pass) => pass.length)));
    const [first, second] = trace.passes.map((pass) => pass.length);
    expect(counted.caps).toEqual([2 * file.length + 16 * 1024 * 1024, first, Math.min(first!, second!)]);
  }, 60_000);

  it('keeps write 1 when write 2 passes its cap', async () => {
    // Measured too small at every step; once writing, every step below step 1 is saved at full quality, larger than write 1.
    const lying = lyingCanvas(() => true, (quality) => (quality === 0.75 ? quality : 1));
    const goal = Math.floor(estimates[6]! / 3);
    const { trace, writes } = await shrinkLying(goal, lying);
    expect(writes).toBe(2);
    expect(trace.passes.map((pass) => pass.step)).toEqual([0]);
    expect(trace.step).toBe(1);
    expect(trace.output!.length).toBe(trace.passes[0]!.length);
  }, 60_000);

  it('writes once when the chosen step already has the smallest estimate', async () => {
    // An encoder that writes more than the old picture at every step: every estimate is the same, so step 1 is chosen
    // and, once written over the target, nothing stronger is estimated to be smaller.
    const big = {
      canvas: async () => {
        const maker = (await drawingTools.canvas!()) as object;
        return { ...maker, jpeg: async (target: unknown) => frameOnlyJpeg((target as { width: number }).width, (target as { height: number }).height, 3, 2_000_000) };
      },
    };
    counted.writes = 0;
    const trace = await shrinkToBytes(file, Math.floor(file.length / 2), [], withTools(big), () => {});
    expect(new Set(trace.estimates.filter((value) => value !== undefined)).size).toBe(1);
    expect(trace.passes.map((pass) => pass.step)).toEqual([0]);
    expect(counted.writes).toBe(1);
    expect(trace.output === undefined || trace.output.length <= file.length * keepBelow).toBe(true);
  }, 60_000);

  it('tries a milder step once when write 1 fits and, with F1, a milder estimate fits', async () => {
    // 300 KB of an object nothing uses, which qpdf's rewrite drops: before any write it makes every estimate too
    // large, so a stronger step is written first; once written, step 1 is estimated with F1 and fits.
    const photo = await photoJpeg(1600, 1600);
    const extra = (estimates[0]! - estimates[3]!) / 2;
    const unused = streamObject('', Buffer.alloc(Math.round(extra), 0x20));
    const loose = picturePdf(288, 288, [{ entries: jpegEntries(1600, 1600), data: photo }], 'Hello', [unused]);
    const goal = Math.ceil((estimates[0]! + extra / 4) / 0.99);
    const { trace, writes } = await shrink(loose, goal);
    expect(trace.passes[0]!.step).toBeGreaterThan(0);
    expect(trace.passes.map((pass) => pass.step).slice(1)).toEqual([0]);
    expect(trace.step).toBe(1);
    expect(writes).toBe(2);
    expect(trace.output!.length).toBeLessThanOrEqual(goal);
    expect(counted.caps).toEqual([2 * loose.length + 16 * 1024 * 1024, goal]);
  }, 60_000);
});

describe('fitting files and no smaller file', () => {
  it('gives an input just over the target whose rewrite fits, though it saves under 1%', async () => {
    const tight = await packed(fixture('pages-500.pdf'));
    // A few bytes after the end, which qpdf's rewrite drops.
    const padded = new Uint8Array(Buffer.concat([Buffer.from(tight), Buffer.alloc(40, 0x0a)]));
    const { trace, writes } = await shrink(padded, tight.length + 5);
    expect(writes).toBe(1);
    expect(trace.output!.length).toBeLessThanOrEqual(tight.length + 5);
    expect(trace.output!.length).toBeGreaterThan(padded.length * keepBelow);
  }, 60_000);

  it('gives no file for a packed text-only file over the target, after one write and no measuring', async () => {
    const file = fixture('compress-packed.pdf');
    const { trace, writes, progress } = await shrink(file, Math.floor(file.length / 2));
    expect(trace).toMatchObject({ output: undefined, writes: 1, step: null });
    expect(trace.sizes.size).toBe(0);
    expect(writes).toBe(1);
    expect(progress.some((step) => step.stage === 'working')).toBe(false);
  });

  it('writes a file with no picture to redo once, measuring nothing', async () => {
    const file = fixture('compress-text.pdf');
    const { trace, writes } = await shrink(file, Math.floor(file.length / 10));
    expect(trace.sizes.size).toBe(0);
    expect(writes).toBe(1);
    expect(trace.output === undefined || trace.output.length <= file.length * keepBelow).toBe(true);
  });
});

describe('lossless pictures stay lossless', () => {
  let file: Uint8Array;
  beforeAll(async () => {
    // An 800 by 800 lossless screenshot with a grey soft mask, on a page of 2 inches: 300 pixels across at step 1, 144 at the floor.
    const mask = { entries: losslessEntries(800, 800, '/DeviceGray'), data: losslessData(800, 800, 1, 9) };
    file = picturePdf(144, 144, [{ entries: losslessEntries(800, 800), data: losslessData(800, 800, 3), mask }]);
  });

  it('scales them and stores them without loss at every step, and never changes a soft mask', async () => {
    // qpdf deflates every stream again, so the soft mask is compared by its decoded samples.
    const before = await picturesOf(file, undefined, true);
    const maskBefore = before.find((each) => each.dict['/ColorSpace'] === '/DeviceGray')!;
    const { trace } = await shrink(file, file.length - 1);
    for (const step of trace.plan!.steps) {
      const limit = Math.ceil(2 * ladder[step]!.ppi);
      expect(trace.sizes.values().next().value![step]).toBeLessThan(file.length);
      expect(limit).toBeLessThanOrEqual(300);
    }
    for (const goal of [file.length - 1, Math.floor(file.length / 20), 1000]) {
      const { trace: each } = await shrink(file, goal);
      const after = await picturesOf(each.output!, undefined, true);
      const picture = (await picturesOf(each.output!)).find((one) => one.dict['/ColorSpace'] === '/DeviceRGB')!;
      const mask = after.find((one) => one.dict['/ColorSpace'] === '/DeviceGray')!;
      expect(picture.dict['/Filter']).toBe('/FlateDecode');
      expect(picture.dict['/Width']).toBeLessThanOrEqual(300);
      expect(mask.data.equals(maskBefore.data)).toBe(true);
      expect(mask.dict['/Width']).toBe(800);
    }
  }, 120_000);

  it('at the floor: scaled to 72 pixels to the inch, still /FlateDecode, the smallest file made', async () => {
    const { trace } = await shrink(file, 1000);
    expect(trace.step).toBe(7);
    const picture = (await picturesOf(trace.output!)).find((one) => one.dict['/ColorSpace'] === '/DeviceRGB')!;
    expect(picture.dict).toMatchObject({ '/Width': 144, '/Height': 144, '/Filter': '/FlateDecode' });
    expect(trace.output!.length).toBeGreaterThan(1000);
  }, 60_000);
});

describe('which pictures are measured', () => {
  /** qpdf, with the dictionaries' JSON changed for one picture, as a crafted file could state it. */
  const patchedTools = (change: (dict: Record<string, unknown>) => void) =>
    withTools({
      qpdf: () =>
        countingQpdf((path, data) => {
          if (path !== '/dicts.json') return data;
          const json = JSON.parse(new TextDecoder().decode(data)) as { qpdf: [unknown, Record<string, { stream?: { dict: Record<string, unknown> } }>] };
          for (const entry of Object.values(json.qpdf[1])) if (entry.stream?.dict['/Subtype'] === '/Image') change(entry.stream.dict);
          return new TextEncoder().encode(JSON.stringify(json));
        }),
    });

  it('leaves alone, in every pass, a picture whose real raw data is under 4 KB though it states 50 KB', async () => {
    const file = picturePdf(144, 144, [{ entries: jpegEntries(100, 100), data: await photoJpeg(100, 100, 30) }]);
    expect((await picturesOf(file))[0]!.data.length).toBeLessThan(minPictureBytes);
    const stand = countingStandIns();
    const { trace } = await shrink(file, 500, { tools: { ...patchedTools((dict) => (dict['/Length'] = 50_000)), decodePicture: async () => stand.decoder, canvas: async () => stand.canvas } });
    expect(trace.plan!.kept).toHaveLength(1);
    expect(trace.sizes.size).toBe(0);
    expect(stand.counts.decodes).toBe(0);
  }, 60_000);

  it('leaves alone a picture with no stated length', async () => {
    const file = picturePdf(144, 144, [{ entries: jpegEntries(1200, 1200), data: await photoJpeg(1200, 1200) }]);
    const { trace } = await shrink(file, 1000, { tools: patchedTools((dict) => delete dict['/Length']) });
    expect(trace.plan!.kept).toHaveLength(0);
    expect(trace.sizes.size).toBe(0);
  }, 60_000);

  it('leaves alone pictures under 4 KB and measures only the 10,000 largest', async () => {
    // 20,000 pictures of under 4 KB and 12,000 larger ones, all JPGs the stand-ins can count.
    const small = flatJpeg(10, 10);
    const large = flatJpeg(20, 20);
    expect(small.length).toBeLessThan(minPictureBytes);
    const pictures: Placed[] = [
      ...Array.from({ length: 20_000 }, () => ({ entries: jpegEntries(10, 10), data: small })),
      ...Array.from({ length: 12_000 }, (_, index) => ({ entries: jpegEntries(20, 20), data: paddedJpeg(large, minPictureBytes + (index % 500)) })),
    ];
    const file = picturePdf(144, 144, pictures, 'Many');
    const stand = countingStandIns();
    const { trace } = await shrink(file, Math.floor(file.length / 2), { tools: withTools({ decodePicture: async () => stand.decoder, canvas: async () => stand.canvas }) });
    expect(trace.plan!.kept).toHaveLength(maxCandidates);
    expect(trace.plan!.kept.every((each) => each.width === 20)).toBe(true);
    expect(Math.min(...trace.plan!.kept.map((each) => each.stated))).toBeGreaterThanOrEqual(minPictureBytes + 83);
    // Each measured picture was decoded once to measure, and once in each write.
    expect(stand.counts.decodes).toBe(maxCandidates * (1 + trace.writes));
  }, 600_000);

  it('leaves alone, in every pass, a picture that throws while measured', async () => {
    const throwing = await photoJpeg(1200, 900, 92, 4);
    const fine = await photoJpeg(1000, 1000, 92, 5);
    const file = picturePdf(144, 144, [
      { entries: jpegEntries(1200, 900), data: throwing },
      { entries: jpegEntries(1000, 1000), data: fine },
    ]);
    let calls = 0;
    const real = drawingTools.decodePicture!;
    const decoder = async () => {
      const inner = (await real()) as { decode(bytes: Uint8Array, width: number, height: number): Promise<unknown> };
      return {
        decode: async (bytes: Uint8Array, width: number, height: number) => {
          // The 1200 by 900 picture is decoded at 300 by 225 at step 1.
          if (width === 300 && height === 225) {
            calls += 1;
            throw new Error('the decoder gave up');
          }
          return inner.decode(bytes, width, height);
        },
      };
    };
    const { trace } = await shrink(file, 2000, { tools: withTools({ decodePicture: decoder }) });
    expect(calls).toBe(1);
    expect(trace.sizes.size).toBe(1);
    const after = await picturesOf(trace.output!);
    expect(after.find((each) => each.dict['/Width'] === 1200)!.data.equals(Buffer.from(throwing))).toBe(true);
  }, 60_000);
});

describe('a picture that cannot be redone in a write', () => {
  it('leaves the measured set, so its raw data counts in F and later estimates stay honest', async () => {
    const throwing = await photoJpeg(1200, 900, 92, 4);
    const fine = await photoJpeg(1000, 1000, 92, 5);
    const file = picturePdf(144, 144, [
      { entries: jpegEntries(1200, 900), data: throwing },
      { entries: jpegEntries(1000, 1000), data: fine },
    ]);
    // The 1200 by 900 picture decodes while measured, and throws in every write.
    let seen = 0;
    const real = drawingTools.decodePicture!;
    const decoder = async () => {
      const inner = (await real()) as { decode(bytes: Uint8Array, width: number, height: number): Promise<unknown> };
      return {
        decode: async (bytes: Uint8Array, width: number, height: number) => {
          if (width === 300 && height === 225 && seen++ > 0) throw new Error('the decoder gave up');
          return inner.decode(bytes, width, height);
        },
      };
    };
    const { trace } = await shrink(file, 2000, { tools: withTools({ decodePicture: decoder }) });
    expect(seen).toBe(2);
    expect(trace.sizes.size).toBe(1);
    const pass = trace.passes[0]!;
    // Handed over at its raw length, and counted in F: F and the one measured picture's size make the written length.
    expect(pass.handed.get([...pass.handed.keys()].find((id) => !trace.sizes.has(id))!)).toBe(throwing.length);
    expect(estimateWith(trace, pass.step, pass.rest)).toBe(pass.length);
    expect(pass.rest).toBeGreaterThan(throwing.length);
  }, 60_000);
});

describe('every file in the test set', () => {
  const names = readdirSync(join(__dirname, '../fixtures')).filter((name) => name.endsWith('.pdf')).sort();
  const withPassword = new Set(['password.pdf', 'compress-password.pdf']);
  // Files the engine cannot read, as every PDF tool says; their outcome is a fixed sentence.
  const unreadable = new Set(['damaged-xref.pdf', 'damaged-cut.pdf', 'not-a-pdf.pdf']);

  it.each(names)('%s: at or under each target, or the smallest made, or no file; checks pass', async (name) => {
    const file = fixture(name);
    const given = withPassword.has(name) ? password : undefined;
    const goals = [...Object.values(sizeTargets).map((target) => target.bytes), Math.floor(file.length / 2), Math.floor(file.length / 10)];
    for (const goal of goals) {
      let result: Awaited<ReturnType<typeof shrink>>;
      try {
        result = await shrink(file, goal, { given });
      } catch (error) {
        expect(unreadable.has(name), `${name} at ${goal}: ${(error as Error).message}`).toBe(true);
        expect((error as Error).message).not.toContain(password);
        continue;
      }
      const { trace, writes } = result;
      expect(writes).toBeLessThanOrEqual(3);
      if (file.length <= goal) {
        expect(trace.output).toBeUndefined();
        continue;
      }
      if (trace.output) {
        const fits = trace.output.length <= goal;
        expect(fits || trace.output.length <= file.length * keepBelow, `${name} at ${goal}`).toBe(true);
        if (!fits) expect(trace.output.length).toBe(Math.min(...trace.passes.map((pass) => pass.length), trace.output.length));
        const check = await qpdfOn(trace.output, [...argsFor(given), '--check']);
        expect(check.code, `${name} at ${goal}`).toBe(0);
      }
      expectExactEstimates(trace);
    }
  }, 300_000);

  it('runs through the engine on each page’s target, giving at most one file', async () => {
    const file = fixture('compress-scans.pdf');
    for (const target of Object.keys(sizeTargets)) {
      const outputs = await run([file], { target }, () => {}, tools);
      expect(outputs.length).toBeLessThanOrEqual(1);
      if (file.length <= sizeTargets[target as keyof typeof sizeTargets].bytes) expect(outputs).toEqual([]);
      else expect(outputs[0]!.length).toBeLessThanOrEqual(Math.max(sizeTargets[target as keyof typeof sizeTargets].bytes, file.length * keepBelow));
    }
  }, 120_000);
});

describe('what the file keeps', () => {
  it('leaves compress-kinds.pdf’s other pictures as Compress PDF leaves them', async () => {
    const file = fixture('compress-kinds.pdf');
    const { trace } = await shrink(file, Math.floor(file.length / 10));
    // Raw for the CMYK JPG and the CCITT scan; decoded for those stored with /FlateDecode, which qpdf deflates again.
    const raw = { before: await picturesOf(file), after: await picturesOf(trace.output!) };
    const decoded = { before: await picturesOf(file, undefined, true), after: await picturesOf(trace.output!, undefined, true) };
    const same = (test: (dict: Record<string, unknown>) => boolean, how: 'raw' | 'decoded' = 'decoded') => {
      const { before, after } = how === 'raw' ? raw : decoded;
      const was = before.filter((each) => test(each.dict));
      const now = after.filter((each) => test(each.dict));
      expect(now).toHaveLength(was.length);
      for (const [index, each] of was.entries()) expect(now[index]!.data.equals(each.data)).toBe(true);
    };
    same((dict) => dict['/ColorSpace'] === '/DeviceCMYK', 'raw');
    same((dict) => dict['/Filter'] === '/CCITTFaxDecode', 'raw');
    same((dict) => dict['/ImageMask'] === true);
    same((dict) => Array.isArray(dict['/Mask']));
    same((dict) => '/Matte' in dict);
  }, 60_000);

  it.each(['multilingual.pdf', 'rich.pdf', 'form.pdf', 'tagged.pdf'])('%s: decoded content streams byte for byte, and the same text', async (name) => {
    const file = fixture(name);
    const { trace } = await shrink(file, Math.floor(file.length / 2));
    const output = trace.output ?? file;
    expect(await pageStreams(output)).toEqual(await pageStreams(file));
    expect(await texts(output)).toEqual(await texts(file));
  }, 60_000);

  it('keeps links, bookmarks, attachments, fields and their values', async () => {
    for (const name of ['rich.pdf', 'form.pdf']) {
      const file = fixture(name);
      const { trace } = await shrink(file, Math.floor(file.length / 2));
      if (!trace.output) continue;
      const shapeOf = async (bytes: Uint8Array) => {
        const qpdf = await makeQpdf();
        qpdf.write('/in.pdf', bytes);
        const { out } = qpdf.call(['--json=2', '--json-key=outlines', '--json-key=acroform', '--json-key=attachments', '--json-key=pages', '/in.pdf']);
        return out.replace(/"\d+ \d+ R"/g, '"R"');
      };
      expect(await shapeOf(trace.output), name).toBe(await shapeOf(file));
    }
  }, 60_000);
});

describe('passwords and restrictions', () => {
  it('keeps compress-password.pdf’s password, encryption and restrictions', async () => {
    const file = fixture('compress-password.pdf');
    await expect(shrink(file, Math.floor(file.length / 2))).rejects.toThrow();
    const { trace } = await shrink(file, Math.floor(file.length / 2), { given: password });
    expect(trace.output).toBeDefined();
    expect((await qpdfOn(trace.output!, ['--check'])).code).toBe(2);
    expect((await qpdfOn(trace.output!, [`--password=${password}`, '--check'])).code).toBe(0);
    expect((await qpdfOn(trace.output!, [`--password=${password}`, '--show-encryption'])).out).toBe((await qpdfOn(file, [`--password=${password}`, '--show-encryption'])).out);
  }, 60_000);

  it('a protected scans file over 100 KB, on the 100 KB page', async () => {
    const qpdf = await makeQpdf();
    qpdf.write('/in.pdf', fixture('compress-scans.pdf'));
    qpdf.call(['/in.pdf', '--encrypt', `--user-password=${password}`, `--owner-password=${password}x`, '--bits=256', '--print=low', '--', '/out.pdf']);
    const file = qpdf.read('/out.pdf');
    expect(file.length).toBeGreaterThan(100_000);
    const outputs = await run([file], { target: '100kb', passwords: [password] }, () => {}, tools);
    expect(outputs).toHaveLength(1);
    expect((await qpdfOn(outputs[0]!, [`--password=${password}`, '--check'])).code).toBe(0);
    expect((await qpdfOn(outputs[0]!, [`--password=${password}`, '--show-encryption'])).out).toBe((await qpdfOn(file, [`--password=${password}`, '--show-encryption'])).out);
  }, 120_000);

  it('never puts the password or the document’s text in an error', async () => {
    const secret = 'SECRET-pass-7Q';
    const file = fixture('compress-password.pdf');
    const error = await shrink(file, 1000, { given: secret }).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(secret);
    for (const name of ['damaged-xref.pdf', 'not-a-pdf.pdf']) {
      const failed = await run([fixture(name)], { target: '100kb', passwords: [secret] }, () => {}, tools).catch((caught: Error) => caught);
      if (failed instanceof Error) expect(failed.message).not.toContain(secret);
    }
  }, 60_000);
});

describe('progress', () => {
  it('reads, counts pictures, then writes, and the bar never goes back', async () => {
    const file = fixture('compress-scans.pdf');
    const { progress } = await shrink(file, 200_000);
    expect(progress[0]).toEqual({ stage: 'reading', unit: 'file', done: 0, total: 1 });
    const pictures = progress.filter((step): step is Extract<Progress, { unit: unknown }> => step.stage === 'working');
    expect(pictures.map((step) => `${step.done} of ${step.total}`)).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    const writing = progress.filter((step): step is Extract<Progress, { stage: 'writing' }> => step.stage === 'writing');
    expect(writing[0]!.percent).toBe(75);
    expect(writing.every((step) => step.percent < 100)).toBe(true);
    const fractions = progress.map(progressFraction);
    for (let index = 1; index < fractions.length; index++) expect(fractions[index]!).toBeGreaterThanOrEqual(fractions[index - 1]!);
    // Every reading comes before every picture, and every picture before writing.
    const stages = progress.map((step) => step.stage);
    expect(stages.lastIndexOf('reading')).toBeLessThan(stages.indexOf('working'));
    expect(stages.lastIndexOf('working')).toBeLessThan(stages.indexOf('writing'));
  }, 60_000);
});

describe('hostile files', () => {
  it.each(['compress-flate-bomb.pdf', 'compress-json-bomb.pdf', 'compress-bomb-attachment.pdf'])('%s ends quickly, with a file, none or a fixed sentence', async (name) => {
    const file = fixture(name);
    const started = Date.now();
    let inflated = 0;
    class CountingInflate {
      private readonly inner: Inflate;
      constructor(ondata: (chunk: Uint8Array, final: boolean) => void) {
        this.inner = new Inflate((chunk, final) => {
          inflated += chunk.length;
          ondata(chunk, final);
        });
      }
      push(chunk: Uint8Array, final?: boolean) {
        this.inner.push(chunk, final);
      }
    }
    const result = await shrink(file, Math.floor(file.length / 10), { tools: withTools({ fflate: async () => ({ Inflate: CountingInflate, Deflate }) }) }).catch((error: Error) => error);
    expect(Date.now() - started).toBeLessThan(60_000);
    expect(inflated).toBeLessThan(64 * 1024 * 1024);
    if (result instanceof Error) expect(result.message).toMatch(/^(qpdf could not write the new file \(exit \d+\)\.|The new file did not pass qpdf's check\.)$/);
  }, 120_000);
});

describe('a capped write', () => {
  it('writes a file with no picture once, capped at twice its size and 16 MB', async () => {
    const tiny = rawPdf([
      Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
      Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>'),
      streamObject('', Buffer.from('0 0 m 72 72 l S')),
    ]);
    const { trace, writes } = await shrink(tiny, 10);
    expect(writes).toBe(1);
    expect(counted.caps).toEqual([2 * tiny.length + 16 * 1024 * 1024]);
    expect(trace.output === undefined || trace.output.length <= tiny.length * keepBelow).toBe(true);
  });
});
