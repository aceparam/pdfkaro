// Every engine declares the libraries its reading and its job use (`loads` in src/engines/types.ts), and the
// worker loads the whole set before it reads any file, so which of the site's files a page fetches never
// depends on the file. These tests check the declarations; engine-loads-*.test.ts run every engine's reading,
// picture reading and job against every file in tests/fixtures/ with a `tools` that records what is asked for,
// and fail if a step asks for a library outside the set it declares. Every engine is in exactly one of them.
//
// Set ENGINE_LOADS_REPORT to a path to write what each engine asked for and how each step ended.

import { describe, expect, it } from 'vitest';
import type { EngineModule } from '../../src/engines/types';
import { tools as registryTools } from '../../src/tools/registry';
import { libraryOrder } from '../../src/workers/libraries';
import { engineIds, options, shard } from './engine-loads-helpers';

describe('every engine declares what it loads', () => {
  it('declares both sets, with known library names only', async () => {
    for (const id of engineIds) {
      const engine = (await import(`../../src/engines/tools/${id}.ts`)) as Partial<EngineModule>;
      expect(engine.loads, `${id} declares no loads`).toBeDefined();
      for (const phase of ['read', 'job'] as const) {
        expect(Array.isArray(engine.loads?.[phase]), `${id} loads.${phase}`).toBe(true);
        for (const library of engine.loads![phase]) expect(libraryOrder, `${id} loads.${phase}`).toContain(library);
      }
    }
  });

  it('declares fflate for the job of every tool that can give several files, as the zip step comes from it', async () => {
    for (const tool of registryTools.filter((each) => each.widget?.outputs === 'several')) {
      const engine = (await import(`../../src/engines/tools/${tool.id}.ts`)) as EngineModule;
      expect(engine.loads.job, tool.id).toContain('fflate');
    }
  });

  it('gives a job option table for exactly the engines there are, and runs each in one of the four files', () => {
    expect(Object.keys(options).sort()).toEqual(engineIds);
    expect([0, 1, 2, 3].flatMap(shard).sort()).toEqual(engineIds);
  });
});
