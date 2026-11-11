// The file name of an engine must not become a second place where a tool is
// declared: every browser tool has exactly one engine, and every engine a tool.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tools } from '../../src/tools/registry';

const engineIds = readdirSync(join(__dirname, '../../src/engines/tools'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => name.replace(/\.ts$/, ''));

describe('engines and the registry', () => {
  it('gives every browser tool in the registry one engine file, named by its id', () => {
    for (const tool of tools.filter((each) => each.runsIn === 'browser')) expect(engineIds).toContain(tool.id);
  });

  it('has no engine file without a browser tool in the registry', () => {
    const browserIds = tools.filter((tool) => tool.runsIn === 'browser').map((tool) => tool.id);
    for (const id of engineIds) expect(browserIds).toContain(id);
  });

  it('gives every browser tool its widget words', () => {
    for (const tool of tools.filter((each) => each.runsIn === 'browser')) expect(tool.widget).toBeDefined();
  });
});
