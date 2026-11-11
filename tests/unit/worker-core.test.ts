import { describe, expect, it } from 'vitest';
import type { EngineModule } from '../../src/engines/types';
import type { FromWorker } from '../../src/workers/messages';
import { createHandler, failureKind } from '../../src/workers/worker-core';

const blob = (text: string) => new Blob([text]);

function setup(engine: EngineModule | undefined | 'throws') {
  const posted: { message: FromWorker; transfer?: Transferable[] }[] = [];
  const handle = createHandler({
    loadEngine: async () => {
      if (engine === 'throws') throw new Error('network');
      return engine;
    },
    tools: {},
    post: (message, transfer) => posted.push({ message, transfer }),
  });
  return { handle, posted };
}

// A made-up engine that joins its inputs and reports progress.
const joiner: EngineModule = {
  run: async (files, options, onProgress) => {
    files.forEach((_, index) => onProgress({ stage: 'reading', unit: 'file', done: index + 1, total: files.length }));
    const passwords = (options as { passwords?: unknown[] }).passwords;
    const joined = new TextEncoder().encode(files.map((file) => new TextDecoder().decode(file)).join('+') + `|${JSON.stringify(passwords)}`);
    return [joined];
  },
  inspect: async (file, password) => (password === 'wrong' ? { kind: 'needs-password' } : { kind: 'ready', pages: file.length }),
};

describe('the tool worker', () => {
  it('runs an engine on the files in order and moves the result back', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'run', requestId: 7, toolId: 'merge-pdf', files: [blob('a'), blob('b')], passwords: [undefined, 'pw'], options: {} });
    const progress = posted.filter(({ message }) => message.type === 'progress').map(({ message }) => message);
    expect(progress).toHaveLength(2);
    const done = posted.at(-1)!;
    expect(done.message.type).toBe('done');
    if (done.message.type !== 'done') return;
    expect(new TextDecoder().decode(done.message.outputs[0])).toBe('a+b|[null,"pw"]');
    expect(done.transfer).toEqual([done.message.outputs[0]!.buffer]);
  });

  it('reads one file with its password', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'inspect', requestId: 1, toolId: 'merge-pdf', file: blob('abc') });
    await handle({ type: 'inspect', requestId: 2, toolId: 'merge-pdf', file: blob('abc'), password: 'wrong' });
    expect(posted.map(({ message }) => message)).toEqual([
      { type: 'inspected', requestId: 1, outcome: { kind: 'ready', pages: 3 } },
      { type: 'inspected', requestId: 2, outcome: { kind: 'needs-password' } },
    ]);
  });

  it('says the engine could not be loaded, when it is missing or its file fails to load', async () => {
    for (const engine of [undefined, 'throws'] as const) {
      const { handle, posted } = setup(engine);
      await handle({ type: 'inspect', requestId: 3, toolId: 'merge-pdf', file: blob('a') });
      expect(posted).toEqual([{ message: { type: 'failed', requestId: 3, kind: 'engine-load' }, transfer: undefined }]);
    }
  });

  it('sends back the kind of failure and nothing of the error', async () => {
    const { handle, posted } = setup({ run: async () => { throw new Error('/in/0.pdf: secret-name.pdf broke'); } });
    await handle({ type: 'run', requestId: 4, toolId: 'merge-pdf', files: [blob('a')], passwords: [undefined], options: {} });
    expect(posted).toEqual([{ message: { type: 'failed', requestId: 4, kind: 'engine' }, transfer: undefined }]);
    expect(JSON.stringify(posted)).not.toContain('secret-name');
  });

  it('ignores a message of the wrong shape', async () => {
    const { handle, posted } = setup(joiner);
    await handle({ type: 'run', requestId: 5, toolId: 'merge-pdf' });
    await handle('hello');
    expect(posted).toEqual([]);
  });
});

describe('failureKind', () => {
  it('tells running out of memory from other failures', () => {
    expect(failureKind(new RangeError('Array buffer allocation failed'))).toBe('memory');
    expect(failureKind(new Error('Aborted(OOM)'))).toBe('memory');
    expect(failureKind(new Error('Cannot enlarge memory arrays'))).toBe('memory');
    expect(failureKind(new Error('qpdf exited with 2'))).toBe('engine');
  });
});
