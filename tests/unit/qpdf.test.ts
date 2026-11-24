// The capped write in src/engines/qpdf.ts, shared by the page update's `writePageUpdate` (pages.ts) and Protect with a password:
// qpdf's write progress, the cap, the refused write, the no-space print, the size check after writing, and
// removing /in.pdf once the write has passed. A fake qpdf plays each case; one real run shows the cap holds.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cappedWrite, createQpdf, OutputLimit, writePercent, type Qpdf } from '../../src/engines/qpdf';
import { OutputLimit as FromStamp } from '../../src/engines/stamp';
import { failureKind } from '../../src/workers/worker-core';

const require = createRequire(import.meta.url);
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const makeQpdf = () => createQpdf(async () => require('@neslinesli93/qpdf-wasm'), wasm);

type Script = { lines?: string[]; code?: number; printed?: string; size?: number; refused?: boolean; capped?: boolean };

/** A qpdf that prints `lines` while its call runs, then gives `code`; it remembers what was removed. */
function fakeQpdf(script: Script) {
  const files = new Map<string, number>([['/in.pdf', 1000]]);
  const removed: string[] = [];
  const caps: [string, number][] = [];
  const qpdf: Qpdf = {
    onLine: null,
    mkdir: () => {},
    write: () => {},
    read: () => new Uint8Array(0),
    append: () => {},
    remove(path) {
      removed.push(path);
      files.delete(path);
    },
    size: (path) => (path === '/out.pdf' ? (script.size ?? 0) : (files.get(path) ?? 0)),
    capFile(path, limit) {
      caps.push([path, limit]);
      return script.capped ?? true;
    },
    refused: () => script.refused ?? false,
    call() {
      for (const line of script.lines ?? []) qpdf.onLine?.(line);
      return { code: script.code ?? 0, out: '', printed: script.printed ?? '' };
    },
  };
  return { qpdf, removed, caps, files };
}

const write = (script: Script) => {
  const fake = fakeQpdf(script);
  const percents: number[] = [];
  const outcome = (() => {
    try {
      return cappedWrite(fake.qpdf, 5000, (q) => q.call(['--progress', '/in.pdf', '/out.pdf']), (percent) => percents.push(percent));
    } catch (error) {
      return error;
    }
  })();
  return { ...fake, percents, outcome };
};

describe('writePercent', () => {
  it("reads qpdf's write progress line, at most 100, and nothing else", () => {
    expect(writePercent('qpdf: write progress: 52%')).toBe(52);
    expect(writePercent('write progress: 7.5%')).toBe(7.5);
    expect(writePercent('write progress: 140%')).toBe(100);
    expect(writePercent('qpdf: operation succeeded with warnings')).toBeUndefined();
    expect(writePercent('')).toBeUndefined();
  });
});

describe('cappedWrite', () => {
  it('caps /out.pdf at the limit, passes progress on in order and never repeated or backwards, and removes /in.pdf after a passing write', () => {
    const { outcome, percents, removed, caps, qpdf, files } = write({
      lines: ['write progress: 0%', 'something else', 'write progress: 10%', 'write progress: 10%', 'write progress: 8%', 'write progress: 55%', 'write progress: 100%'],
      size: 4000,
    });
    expect(outcome).toMatchObject({ code: 0 });
    expect(caps).toEqual([['/out.pdf', 5000]]);
    expect(percents).toEqual([0, 10, 55, 100]);
    expect(removed).toEqual(['/in.pdf']);
    expect(files.has('/in.pdf')).toBe(false);
    expect(qpdf.onLine).toBeNull();
  });

  it('a write the capped file refused: OutputLimit, even when qpdf finished with exit 0, and /in.pdf kept', () => {
    const { outcome, removed } = write({ refused: true, code: 0, size: 5000 });
    expect(outcome).toBeInstanceOf(OutputLimit);
    expect(removed).toEqual([]);
  });

  it("qpdf saying no space was left on a capped file: OutputLimit; on a file that could not be capped, the call's own result", () => {
    expect(write({ code: 2, printed: 'qpdf: /out.pdf: No space left on device' }).outcome).toBeInstanceOf(OutputLimit);
    const uncapped = write({ code: 2, printed: 'qpdf: /out.pdf: No space left on device', capped: false });
    expect(uncapped.outcome).toMatchObject({ code: 2 });
    expect(uncapped.removed).toEqual([]);
  });

  it('exit 0 with a file past the limit (an uncapped build): OutputLimit, and /in.pdf kept', () => {
    const { outcome, removed } = write({ code: 0, size: 5001, capped: false });
    expect(outcome).toBeInstanceOf(OutputLimit);
    expect(removed).toEqual([]);
  });

  it("an unfinished exit gives the call's result for the caller to judge, keeps /in.pdf, and clears the line listener", () => {
    const { outcome, removed, qpdf } = write({ code: 2, printed: 'qpdf: /in.pdf: invalid password' });
    expect(outcome).toEqual({ code: 2, out: '', printed: 'qpdf: /in.pdf: invalid password' });
    expect(removed).toEqual([]);
    expect(qpdf.onLine).toBeNull();
  });

  it('exit 3 (finished with warnings) counts as finished', () => {
    const { outcome, removed } = write({ code: 3, size: 10 });
    expect(outcome).toMatchObject({ code: 3 });
    expect(removed).toEqual(['/in.pdf']);
  });

  it('clears the line listener when the call throws', () => {
    const { qpdf } = fakeQpdf({});
    expect(() =>
      cappedWrite(qpdf, 10, () => {
        throw new Error('broken');
      }),
    ).toThrow('broken');
    expect(qpdf.onLine).toBeNull();
  });

  it('with the real qpdf: a write past a small cap is stopped, and one within it is read after /in.pdf is gone', async () => {
    const file = new Uint8Array(readFileSync(join(__dirname, '../fixtures/pages-500.pdf')));
    const small = await makeQpdf();
    small.write('/in.pdf', file);
    expect(() => cappedWrite(small, 20_000, (q) => q.call(['--progress', '/in.pdf', '--object-streams=generate', '/out.pdf']))).toThrow(OutputLimit);
    const roomy = await makeQpdf();
    roomy.write('/in.pdf', file);
    const percents: number[] = [];
    const written = cappedWrite(roomy, 2 * file.length, (q) => q.call(['--progress', '/in.pdf', '--object-streams=generate', '/out.pdf']), (percent) => percents.push(percent));
    expect(written.code).toBe(0);
    expect(() => roomy.size('/in.pdf')).toThrow();
    expect(roomy.read('/out.pdf').length).toBeGreaterThan(0);
    expect(percents.length).toBeGreaterThan(1);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(new Set(percents).size).toBe(percents.length);
  });
});

describe('OutputLimit', () => {
  it('is one class, from qpdf.ts and re-exported by stamp.ts, known by its name, with a reason only when given', () => {
    expect(FromStamp).toBe(OutputLimit);
    expect(new OutputLimit().name).toBe('OutputLimit');
    expect(new OutputLimit().reason).toBeUndefined();
    expect(new OutputLimit('shared').reason).toBe('shared');
    expect(new OutputLimit().message).toBe('The new file would pass its size limit.');
  });

  it('gives the output-limit failure in the worker, thrown from either file', () => {
    expect(failureKind(new OutputLimit())).toBe('output-limit');
    expect(failureKind(new FromStamp('shared'))).toBe('output-limit');
  });
});
