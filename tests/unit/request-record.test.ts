// The rules uniform-requests.spec.ts judges the host's record by, fed a recorded log: they must report a page that
// fetches a file for some inputs only, as Compress PDF did with fflate before add-uniform-requests.

import { describe, expect, it } from 'vitest';
import { acrossInputs, recordProblems, type InputRecord } from '../../tests/e2e/request-record';

const pick = ['GET /_astro/ToolWorkspace.AAAAAAAA.js', 'GET /_astro/tool.worker-BBBBBBBB.js', 'GET /_astro/compress-pdf-CCCCCCCC.js', 'GET /_astro/qpdf-DDDDDDDD.wasm'];
const fflate = 'GET /_astro/fflate-EEEEEEEE.js';

/** A record as the old Compress PDF made it: fflate at the main button only for a file with lossless pictures. */
const oldRecord = (label: string, lossless: boolean, expectedJob: string[]): InputRecord => ({
  label,
  phases: [
    { what: 'the pick', expected: pick, got: pick },
    { what: 'the main button', expected: expectedJob, got: lossless ? [fflate] : [] },
  ],
  gaps: [{ after: 'the pick', got: [] }],
});

describe('judging the host record', () => {
  it('reports, naming the page and inputs, a file fetched for some inputs only, whether or not the expected list has it', () => {
    for (const expectedJob of [[fflate], []]) {
      const records = [oldRecord('compress-text.pdf', false, expectedJob), oldRecord('compress-lossless.pdf', true, expectedJob)];
      const problems = [...records.flatMap((record) => recordProblems('/compress-pdf', record)), ...acrossInputs('/compress-pdf', records, 'the main button')];
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.every((problem) => problem.startsWith('/compress-pdf: '))).toBe(true);
      expect(problems.join('\n')).toMatch(/compress-(text|lossless)\.pdf/);
      expect(acrossInputs('/compress-pdf', records, 'the main button')).toEqual([
        `/compress-pdf: after the main button, compress-text.pdf got [] but compress-lossless.pdf got ["${fflate}"]`,
      ]);
    }
  });

  it('reports a request repeated within a phase, and one that arrives between phases', () => {
    const record: InputRecord = {
      label: 'text.pdf',
      phases: [{ what: 'the pick', expected: pick, got: [...pick, pick[3]!] }],
      gaps: [{ after: 'the pick', got: ['GET /_astro/pdf-FFFFFFFF.js'] }],
    };
    expect(recordProblems('/merge-pdf', record)).toEqual([
      expect.stringContaining('/merge-pdf: after the pick for text.pdf, expected'),
      '/merge-pdf: between phases, after the pick for text.pdf, nothing was expected, got ["GET /_astro/pdf-FFFFFFFF.js"]',
    ]);
  });

  it('passes inputs that asked for the same files, each once, in any order', () => {
    const records = [oldRecord('a', true, [fflate]), { ...oldRecord('b', true, [fflate]), phases: [{ what: 'the pick', expected: pick, got: [...pick].reverse() }, { what: 'the main button', expected: [fflate], got: [fflate] }] }];
    expect([...records.flatMap((record) => recordProblems('/compress-pdf', record)), ...acrossInputs('/compress-pdf', records, 'the pick'), ...acrossInputs('/compress-pdf', records, 'the main button')]).toEqual([]);
  });
});
