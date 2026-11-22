// One of four files that run every engine against every fixture with a recording `tools` (engine-loads.test.ts
// says why). Split so that Vitest runs them side by side; engine-loads.test.ts checks every engine is in one.

import { describe, expect, it } from 'vitest';
import { checkEngine, pdfFixtures, report, type Row } from './engine-loads-helpers';

const engines = ['images-to-pdf', 'add-page-numbers', 'rearrange-pdf-pages', 'protect-pdf', 'merge-pdf'];

describe('engines ask only for what they declare', () => {
  const rows: Row[] = [];
  for (const id of engines) {
    it(`asks only for what ${id} declares, for every fixture`, { timeout: 600_000 }, async () => {
      const checked = await checkEngine(id);
      rows.push(...checked.rows);
      expect(checked.problems).toEqual([]);
      // Every fixture was run through the job.
      const ran = new Set(checked.rows.filter((row) => row.step === 'run').map((row) => row.input.split(',')[0]));
      for (const name of pdfFixtures) expect(ran.has(name), `${id} ran ${name}`).toBe(true);
    });
  }
  it('writes the report when asked', () => report('d', rows));
});
