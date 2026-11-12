import { describe, expect, it } from 'vitest';
import type { EngineModule } from '../../src/engines/types';
import type { FromWorker } from '../../src/workers/messages';
import { createHandler, failureKind, ownBuffers } from '../../src/workers/worker-core';

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
    expect(failureKind(new RangeError('Maximum call stack size exceeded'))).toBe('engine');
    expect(failureKind(new RangeError('Offset is outside the bounds of the DataView'))).toBe('engine');
    expect(failureKind(new Error('qpdf exited with 2'))).toBe('engine');
  });
});

describe('ownBuffers', () => {
  it('moves a result that fills its own buffer without copying it', () => {
    const whole = new Uint8Array([1, 2, 3]);
    const { outputs, transfer } = ownBuffers([whole]);
    expect(outputs[0]).toBe(whole);
    expect(transfer).toEqual([whole.buffer]);
  });

  it('copies a result that is part of a larger buffer', () => {
    const big = new Uint8Array([9, 1, 2, 3, 9]);
    const part = big.subarray(1, 4);
    const { outputs, transfer } = ownBuffers([part]);
    expect(Array.from(outputs[0]!)).toEqual([1, 2, 3]);
    expect(outputs[0]!.buffer).not.toBe(big.buffer);
    expect(transfer[0]!.byteLength).toBe(3);
  });

  it('copies the second of two results that share a buffer, so no buffer is listed twice', () => {
    const one = new Uint8Array([1, 2]);
    const again = new Uint8Array(one.buffer);
    const { outputs, transfer } = ownBuffers([one, again]);
    expect(outputs[0]).toBe(one);
    expect(outputs[1]).not.toBe(again);
    expect(new Set(transfer).size).toBe(2);
    // The list can really be moved: structuredClone refuses a buffer listed twice.
    expect(() => structuredClone(outputs, { transfer })).not.toThrow();
  });
});

describe('several outputs, zipped in the worker', async () => {
  const { unzipSync, zipSync } = await import('fflate');
  // A made-up engine that gives back as many files as its first input says.
  const splitter: EngineModule = {
    run: async (files) => {
      const count = Number(new TextDecoder().decode(files[0]));
      return Array.from({ length: count }, (_, index) => new TextEncoder().encode(`part ${index + 1}`));
    },
  };
  function zipSetup() {
    const posted: { message: FromWorker; transfer?: Transferable[] }[] = [];
    const log: string[] = [];
    const handle = createHandler({
      loadEngine: async () => {
        log.push('engine');
        return splitter;
      },
      tools: {},
      post: (message, transfer) => posted.push({ message, transfer }),
      loadZip: async () => {
        log.push('fflate');
        return zipSync;
      },
    });
    return { handle, posted, log };
  }
  const zip = { stem: 'report', partSuffix: 'part' };

  it('gives three files back as one zip, numbered so they sort, with how many it holds', async () => {
    const { handle, posted, log } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('3')], passwords: [undefined], options: {}, zip });
    expect(log).toEqual(['fflate', 'engine']);
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error(`expected done, got ${done.message.type}`);
    expect(done.message.parts).toBe(3);
    expect(done.message.outputs).toHaveLength(1);
    expect(done.transfer).toEqual([done.message.outputs[0]!.buffer]);
    const entries = unzipSync(done.message.outputs[0]!);
    expect(Object.keys(entries)).toEqual(['report-part-1.pdf', 'report-part-2.pdf', 'report-part-3.pdf']);
    expect(new TextDecoder().decode(entries['report-part-2.pdf'])).toBe('part 2');
  });

  it('pads the numbers to the count, so 12 parts sort as 01 to 12', async () => {
    const { handle, posted } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('12')], passwords: [undefined], options: {}, zip });
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error('expected done');
    const names = Object.keys(unzipSync(done.message.outputs[0]!));
    expect(names[0]).toBe('report-part-01.pdf');
    expect(names[11]).toBe('report-part-12.pdf');
  });

  it('loads fflate even when the run gives one file, and gives that file back as it is', async () => {
    const { handle, posted, log } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('1')], passwords: [undefined], options: {}, zip });
    expect(log).toEqual(['fflate', 'engine']);
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error('expected done');
    expect(done.message.parts).toBeUndefined();
    expect(new TextDecoder().decode(done.message.outputs[0])).toBe('part 1');
  });

  it('does not load fflate for a run with no zip naming', async () => {
    const { handle, posted, log } = zipSetup();
    await handle({ type: 'run', requestId: 1, toolId: 'split-pdf', files: [blob('2')], passwords: [undefined], options: {} });
    expect(log).toEqual(['engine']);
    const done = posted.at(-1)!;
    if (done.message.type !== 'done') throw new Error('expected done');
    expect(done.message.outputs).toHaveLength(2);
  });

  it('says the tool could not be loaded when fflate fails to load', async () => {
    const posted: FromWorker[] = [];
    const handle = createHandler({
      loadEngine: async () => splitter,
      tools: {},
      post: (message) => posted.push(message),
      loadZip: async () => {
        throw new Error('network');
      },
    });
    await handle({ type: 'run', requestId: 4, toolId: 'split-pdf', files: [blob('3')], passwords: [undefined], options: {}, zip });
    expect(posted).toEqual([{ type: 'failed', requestId: 4, kind: 'engine-load' }]);
  });
});
