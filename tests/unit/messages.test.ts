import { describe, expect, it } from 'vitest';
import { isFromWorker, isToWorker } from '../../src/workers/messages';

const file = new Blob(['%PDF-1.7']);

describe('messages to the worker', () => {
  it('accepts well-formed requests', () => {
    expect(isToWorker({ type: 'inspect', requestId: 1, toolId: 'merge-pdf', file })).toBe(true);
    expect(isToWorker({ type: 'inspect', requestId: 1, toolId: 'merge-pdf', file, password: 'x' })).toBe(true);
    expect(isToWorker({ type: 'run', requestId: 2, toolId: 'merge-pdf', files: [file, file], passwords: [undefined, 'x'], options: {} })).toBe(true);
  });

  it('ignores anything else', () => {
    for (const bad of [
      null,
      'run',
      { type: 'run' },
      { type: 'eval', requestId: 1, toolId: 'merge-pdf' },
      { type: 'inspect', requestId: 1, toolId: '../../evil', file },
      { type: 'inspect', requestId: 1, toolId: 'merge-pdf', file: 'not a blob' },
      { type: 'inspect', requestId: 1, toolId: 'merge-pdf', file, password: 7 },
      { type: 'run', requestId: 2, toolId: 'merge-pdf', files: [file], passwords: [], options: {} },
      { type: 'run', requestId: 2, toolId: 'merge-pdf', files: [file], passwords: [undefined], options: null },
    ]) {
      expect(isToWorker(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('messages from the worker', () => {
  it('accepts well-formed replies', () => {
    expect(isFromWorker({ type: 'inspected', requestId: 1, outcome: { kind: 'ready', pages: 2 } })).toBe(true);
    expect(isFromWorker({ type: 'progress', requestId: 1, progress: { stage: 'writing', percent: 3 } })).toBe(true);
    expect(isFromWorker({ type: 'done', requestId: 1, outputs: [new Uint8Array(2)] })).toBe(true);
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'memory' })).toBe(true);
  });

  it('ignores anything else, including a failure that carries a message', () => {
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'TypeError: x is undefined' })).toBe(false);
    expect(isFromWorker({ type: 'done', requestId: 1, outputs: ['text'] })).toBe(false);
    expect(isFromWorker({ type: 'other', requestId: 1 })).toBe(false);
  });
});
