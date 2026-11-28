// Repair PDF's engine on hostile files (add-repair-pdf, the design's threats table): every case in fixed time and
// bounded memory through the engine's reading, the work budget without the pre-pass, the ratios genuine files use,
// and the bounds on qpdf instances and the bytes copied into them. Split from repair-pdf.test.ts so the two run side
// by side. No request is made and nothing is logged: `fetch` and every console method are replaced, and recorded.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OutputLimit } from '../../src/engines/qpdf';
import { rebuild } from '../../src/engines/rebuild';
import {
  instanceBound,
  inspect,
  limits,
  makeInspect,
  makeRun,
  Meter,
  readWithPdflib,
  run,
} from '../../src/engines/tools/repair-pdf';
import * as lib from '../../src/workers/pdflib';
import {
  bytesOf,
  damagedCopy,
  damagedKinds,
  encryptedCopy,
  fixture,
  handPdf,
  hostile,
  latin1,
  manyPages,
  onePage,
  password,
  qpdfPages,
  streamBody,
  tools,
  noRequestsOrLogs,
  zeroBomb,
} from './repair-helpers';

const pdflib = lib as unknown as typeof import('@cantoo/pdf-lib');
const M = 1024 * 1024;

// No request, and no console line from anything the engine runs.
noRequestsOrLogs();

const one = async (file: Uint8Array, given?: string, engine = run): Promise<Uint8Array[]> => engine([file.slice()], { passwords: [given] }, () => {}, tools);
/** The error a call ends with, or undefined. */
async function failure(call: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await call();
    return undefined;
  } catch (error) {
    return error as Error;
  }
}
/** The process's largest resident memory so far, in bytes. */
const peak = () => process.resourceUsage().maxRSS * 1024;
/**
 * How much a hostile case may raise the process's largest resident memory: qpdf's own heap stops at about 1 GB (a
 * 2 GB drawing bomb read whole by its check ends there with std::bad_alloc), with room for pdf-lib's objects.
 */
const growthBound = 1.5 * 1024 ** 3;
/** Runs a call and gives what it ended with and how much it raised the largest resident memory. */
async function measured(call: () => Promise<unknown>): Promise<{ outcome: unknown; ms: number; grew: number }> {
  const before = peak();
  const started = performance.now();
  let outcome: unknown;
  try {
    outcome = await call();
  } catch (error) {
    outcome = (error as Error).name;
  }
  return { outcome, ms: performance.now() - started, grew: peak() - before };
}

describe('hostile files in fixed time and bounded memory', () => {
  // Each through the engine's reading (the pre-pass, then pdf-lib under the guards): it ends quickly, as damaged, ready
  // or with the shared `output-limit` words, never by running on.
  const timed = measured;
  const cases: [string, () => Uint8Array, number][] = [
    ['unclosed objects (4 MB)', () => hostile.unclosedObjects(4 * M), 10_000],
    ['unclosed streams (4 MB)', () => hostile.unclosedStreams(4 * M), 10_000],
    ['unclosed literal strings (4 MB)', () => hostile.unclosedLiteral(4 * M), 10_000],
    ['unclosed hex strings (4 MB)', () => hostile.unclosedHex(4 * M), 10_000],
    ['one long unclosed literal string (4 MB)', () => hostile.longLiteral(4 * M), 10_000],
    ['one long unclosed hex string (4 MB)', () => hostile.longHex(4 * M), 10_000],
    ['runs of junk and digits (4 MB)', () => hostile.junkRuns(4 * M), 10_000],
    ['extra stream words with missing, wrong and indirect /Length (4 MB)', () => hostile.streamWords(4 * M), 10_000],
    ['a cross-reference stream with an indirect /Type, /W [0 0 0] and /Size 50000000', () => hostile.xrefStreamBomb(), 2_000],
    ['2,000 object-stream entries at offset 0 of 20,000 numbers', () => hostile.offsetsAtZero(), 2_000],
    ['a 1.7 KB /Kids bomb', () => hostile.kidsBomb(), 2_000],
    ['a /Kids loop', () => hostile.kidsLoop(), 2_000],
    ['a six-stage Flate chain of 82 KB to 513 MB', () => hostile.chain(6, 513 * M), 5_000],
    ['16 MiB of `0 ` in an object stream', () => hostile.denseObjectStream(16 * M), 5_000],
    ['round 2 (a): fake headers opening hex strings after endobj inside a string (4 MB)', () => hostile.pastPrepassHex(4 * M), 10_000],
    ['round 2 (b): fake headers opening literal strings (4 MB)', () => hostile.pastPrepassLiteral(4 * M), 10_000],
    ['round 2 (b): a space run after endobj inside a string (4 MB)', () => hostile.pastPrepassSpaces(4 * M), 10_000],
    ['round 2 (c): overlapping object-stream offsets over ((((…))))', () => hostile.overlappingOffsets(20_000), 5_000],
    ['round 3: object-stream entries that are streams reaching one endstream', () => hostile.objectStreamCopies(20_000, M), 5_000],
    ['round 3: top-level objects copying to one shared endstream', () => hostile.topLevelCopies(20_000, M), 5_000],
  ];
  for (const [name, make, limit] of cases) {
    it(`reads ${name} quickly`, { timeout: 60_000 }, async () => {
      const file = make();
      const { outcome, ms, grew } = await timed(() => inspect(file, undefined, tools));
      expect(ms, `${name}: ${JSON.stringify(outcome)}`).toBeLessThan(limit);
      expect(['OutputLimit', 'damaged', 'ready']).toContain(typeof outcome === 'string' ? outcome : (outcome as { kind: string }).kind);
      expect(grew).toBeLessThan(growthBound);
    });
  }

  it('counts each page object once in a /Kids bomb and a loop, and writes the repaired tree with each page once', { timeout: 60_000 }, async () => {
    expect(await inspect(hostile.kidsBomb(), undefined, tools)).toEqual({ kind: 'ready', pages: 1 });
    expect(await inspect(hostile.kidsLoop(), undefined, tools)).toEqual({ kind: 'ready', pages: 1 });
    for (const file of [hostile.kidsBomb(), hostile.kidsLoop()]) {
      const [out] = await one(file);
      expect(await qpdfPages(out!)).toBe(1);
    }
  });

  it('stops an object-stream bomb of 2 GB with output-limit before 64 MiB is unpacked', { timeout: 120_000 }, async () => {
    const bomb = await zeroBomb(2048 * M);
    const file = bytesOf(handPdf([...onePage(streamBody('')), streamBody(bomb, '/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode')], { table: false }));
    const { outcome, ms, grew } = await timed(() => inspect(file, undefined, tools));
    expect(outcome).toBe('OutputLimit');
    expect(ms).toBeLessThan(5_000);
    expect(grew).toBeLessThan(growthBound);
  });

  it('stops a 1 GB /Metadata bomb during save with output-limit, although pdf-lib swallows the error', { timeout: 120_000 }, async () => {
    const file = hostile.metadataBomb(1024 * M);
    expect(await inspect(file, undefined, tools)).toEqual({ kind: 'ready', pages: 1 });
    const { outcome, ms, grew } = await timed(() => one(file));
    expect(outcome).toBe('OutputLimit');
    expect(ms).toBeLessThan(10_000);
    expect(grew).toBeLessThan(growthBound);
  });

  it('ends 2 GB Flate bombs in a drawing and in a picture, on both routes, with a file or a named failure', { timeout: 600_000 }, async () => {
    const bomb = await zeroBomb(2048 * M);
    for (const table of [true, false]) {
      // A drawing: the sweep stops at 64 MiB with the page's number. On the qpdf route qpdf's first check reads the
      // drawing whole and stops at its own heap limit first (std::bad_alloc, about 1 GB), which bounds the growth.
      const drawing = await measured(() => one(hostile.flateBomb(bomb, 2048 * M, 'drawing', table)));
      expect(drawing.outcome, `drawing, table ${table}`).toBe('PageTooLarge');
      expect(drawing.grew, `drawing, table ${table}`).toBeLessThan(growthBound);
      // A picture: the sweep's own decoding stops at 64 MiB and leaves it; qpdf's check does not decode pictures.
      const picture = await measured(() => one(hostile.flateBomb(bomb, 2048 * M, 'picture', table)));
      expect(Array.isArray(picture.outcome) || ['OutputLimit', 'RepairFailed'].includes(picture.outcome as string), `picture, table ${table}: ${String(picture.outcome)}`).toBe(true);
      expect(picture.ms).toBeLessThan(120_000);
      expect(picture.grew).toBeLessThan(growthBound);
    }
  });

  it('keeps two overlapping reads apart: each refused by its own token, the second still guarded after the first throws', { timeout: 60_000 }, async () => {
    // A damaged protected file holding an object-stream bomb: a wrong password and then the right one, typed quickly.
    const bomb = await zeroBomb(256 * M);
    const base = latin1(damagedCopy(fixture('password.pdf')));
    const file = bytesOf(`${base}\n90 0 obj\n${streamBody(bomb, '/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode')}\nendobj\n`);
    const [wrong, right] = await Promise.allSettled([inspect(file.slice(), 'nope', tools), inspect(file.slice(), password, tools)]);
    expect(wrong.status === 'rejected' ? (wrong.reason as Error).name : (wrong.value as { kind: string }).kind).toMatch(/OutputLimit|wrong-password/);
    expect(right.status === 'rejected' ? (right.reason as Error).name : (right.value as { kind: string }).kind).toBe('OutputLimit');
  });
});

describe('the work budget, without the pre-pass', () => {
  // The pre-pass defuses these files on its own before pdf-lib reads them; read without it, the work budget is what
  // stops them, with the shared `output-limit` words, although pdf-lib catches errors inside its own scans.
  const raw = async (file: Uint8Array) => readWithPdflib(pdflib, file, file.length, undefined, false);
  const cases: [string, () => Uint8Array][] = [
    ['round 2 (a): fake headers opening hex strings after endobj inside a string', () => hostile.pastPrepassHex(M)],
    ['round 2 (b): fake headers opening literal strings', () => hostile.pastPrepassLiteral(M)],
    ['round 2 (b): a space run', () => hostile.pastPrepassSpaces(200 * 1024)],
    ['round 2 (c): overlapping object-stream offsets', () => hostile.overlappingOffsets(5000)],
    ['round 3: top-level objects copying to one shared endstream', () => hostile.topLevelCopies(20_000, M)],
    ['unclosed objects', () => hostile.unclosedObjects(2 * M)],
    ['extra stream words', () => hostile.streamWords(2 * M)],
  ];
  for (const [name, make] of cases) {
    it(`stops ${name}`, { timeout: 60_000 }, async () => {
      const started = performance.now();
      const read = await raw(make());
      expect(read.kind).toBe('stopped');
      expect('record' in read && read.record!.stopped).toBe('work');
      expect(performance.now() - started).toBeLessThan(5_000);
    });
  }

  it('refuses a stream inside an object stream, stopping the call', async () => {
    const read = await raw(hostile.objectStreamCopies(2000, 64 * 1024));
    expect(read.kind).toBe('stopped');
    expect('record' in read && read.record!.stopped).toBe('stream-in-object-stream');
  });

  it('gives the inspector’s reading the shared output-limit failure for a stopped read', async () => {
    const tight = makeInspect({ ...limits, k: 0.01 });
    expect((await failure(() => tight(fixture('damaged-xref.pdf'), undefined, tools)))?.name).toBe('OutputLimit');
  });
});

describe('genuine files fit the work budget', () => {
  it('reads every damaged kind and fixture with reads and copies under k times the input and object-stream bytes', { timeout: 120_000 }, async () => {
    const files: [string, Uint8Array, string | undefined][] = (await damagedKinds()).map((kind) => [kind.name, kind.bytes, undefined]);
    for (const name of readdirSync(join(__dirname, '../fixtures')).filter((each) => each.endsWith('.pdf') && each !== 'compress-json-bomb.pdf')) {
      files.push([name, fixture(name), ['password.pdf', 'compress-password.pdf'].includes(name) ? password : undefined]);
    }
    let reads = 0;
    let copies = 0;
    for (const [name, bytes, given] of files) {
      const rebuilt = rebuild(bytes);
      const read = await readWithPdflib(pdflib, rebuilt.bytes, bytes.length, given, rebuilt.encrypt, limits, rebuilt.ends);
      expect(read.kind, name).not.toBe('stopped');
      const record = 'record' in read ? read.record : undefined;
      if (!record) continue;
      const base = record.input + record.decodedObjectStreams;
      reads = Math.max(reads, record.reads / base);
      copies = Math.max(copies, record.copied / base);
    }
    // Measured on 28 Nov 2026: reads 1.72 and copies 1.90 at most (the two password files, read twice); k is 8.
    expect(reads).toBeLessThan(limits.k / 2);
    expect(copies).toBeLessThan(limits.k / 2);
  });

  it('reads a damaged protected file of dense small numbers, the densest genuine text measured, under k', { timeout: 60_000 }, async () => {
    const numbers = `[${'0 '.repeat(500_000)}]`;
    const plain = bytesOf(handPdf([...onePage(streamBody('')), numbers]));
    const protectedCopy = damagedCopy(await encryptedCopy(plain, ['--bits=256']));
    const rebuilt = rebuild(protectedCopy);
    const read = await readWithPdflib(pdflib, rebuilt.bytes, protectedCopy.length, password, rebuilt.encrypt, limits, rebuilt.ends);
    expect(read.kind).toBe('read');
    const record = 'record' in read ? read.record! : undefined;
    expect(record!.reads / record!.input).toBeLessThan(limits.k);
  });
});

describe('qpdf instances and the bytes copied into them', () => {
  it('counts instances and bytes, and stops past either bound', () => {
    const meter = new Meter(100);
    meter.add(60);
    expect(() => meter.add(60)).toThrow(OutputLimit);
    const counted = new Meter(1e9);
    counted.maxInstances = 2;
    counted.add(1);
    counted.add(1);
    expect(() => counted.add(1)).toThrow(OutputLimit);
    expect(instanceBound(120_000, 2000)).toBe(68);
  });

  it('stops a crafted file of many tiny streams once the bytes copied into instances pass the copy bound', { timeout: 120_000 }, async () => {
    // At the real bounds such a file must be tens of megabytes; small bounds show the same step.
    const file = damagedCopy(hostile.tinyStreams(6000));
    const small = makeRun({ ...limits, c: 2, copyBase: 0, batchIds: 200 });
    expect((await failure(() => one(file, undefined, small)))?.name).toBe('OutputLimit');
    expect(await one(file)).toHaveLength(1);
  });

  it('repairs the 120,000-page and the 20,000-page files through the sweep within the copy bound', { timeout: 600_000 }, async () => {
    for (const coloured of [false, true]) {
      const damaged = damagedCopy(manyPages(coloured));
      const pages = coloured ? 20_000 : 120_000;
      expect(await inspect(damaged.slice(), undefined, tools)).toEqual({ kind: 'ready', pages });
      const [out] = await one(damaged);
      expect(await qpdfPages(out!)).toBe(pages);
    }
  });
});

