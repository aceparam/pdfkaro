// The file name of an engine must not become a second place where a tool is
// declared: every browser tool has exactly one engine, and every engine a tool.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineModule } from '../../src/engines/types';
import { tools, type Tool } from '../../src/tools/registry';

const engineIds = readdirSync(join(__dirname, '../../src/engines/tools'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => name.replace(/\.ts$/, ''));

/** The tools among `list` with a picture option whose engine does not export `inspectPicture`, so a picture would never be read. */
function missingPictureReaders(list: readonly Pick<Tool, 'id' | 'widget'>[], engines: Readonly<Record<string, Partial<EngineModule> | undefined>>): string[] {
  return list
    .filter((tool) => (tool.widget?.options ?? []).some((option) => option.kind === 'picture'))
    .filter((tool) => typeof engines[tool.id]?.inspectPicture !== 'function')
    .map((tool) => tool.id);
}

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

  it('gives every tool with a picture an engine that reads a picture before the job', async () => {
    const withPicture = tools.filter((tool) => (tool.widget?.options ?? []).some((option) => option.kind === 'picture'));
    const engines: Record<string, Partial<EngineModule>> = {};
    for (const tool of withPicture) engines[tool.id] = (await import(`../../src/engines/tools/${tool.id}.ts`)) as Partial<EngineModule>;
    expect(missingPictureReaders(tools, engines)).toEqual([]);
  });

  it('finds a test entry with a picture whose engine has no picture reader', () => {
    const merge = tools.find((tool) => tool.id === 'merge-pdf');
    if (merge === undefined || merge.widget === undefined) throw new Error('merge-pdf has no widget');
    const entry = {
      id: 'test-picture',
      widget: {
        ...merge.widget,
        options: [
          {
            kind: 'picture' as const,
            key: 'picture',
            label: 'Picture of your signature',
            pickLabel: 'Choose a picture',
            againLabel: 'Choose another picture',
            hint: 'A JPG or PNG picture.',
            acceptsName: 'a JPG or PNG picture',
            emptySentence: 'Choose a picture of your signature first.',
          },
        ],
      },
    };
    const run: EngineModule['run'] = async () => [];
    expect(missingPictureReaders([entry], { 'test-picture': { run } })).toEqual(['test-picture']);
    expect(missingPictureReaders([entry], {})).toEqual(['test-picture']);
    expect(missingPictureReaders([entry], { 'test-picture': { run, inspectPicture: async () => ({ kind: 'damaged' }) } })).toEqual([]);
    expect(missingPictureReaders([merge], {})).toEqual([]);
  });
});
