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

describe('zip naming on a run', () => {
  const run = (zip: unknown) => ({ type: 'run', requestId: 2, toolId: 'split-pdf', files: [file], passwords: [undefined], options: {}, zip });

  it('accepts a cleaned stem and a suffix shaped like a tool id', () => {
    expect(isToWorker(run({ stem: 'report', partSuffix: 'part' }))).toBe(true);
    expect(isToWorker(run({ stem: 'Annual report 2026 (final)', partSuffix: 'page-range' }))).toBe(true);
    expect(isToWorker(run({ stem: 'x'.repeat(100), partSuffix: 'part' }))).toBe(true);
  });

  it('refuses a stem that could be a path, is hidden, or carries characters systems refuse', () => {
    for (const stem of ['', 'x'.repeat(101), '.', '..', '.hidden', 'a/b', 'a\\b', '../x', 'a\u0000b', 'a\nb', 'a\u202eb', 'a\u2066b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 7, null]) {
      expect(isToWorker(run({ stem, partSuffix: 'part' })), JSON.stringify(stem)).toBe(false);
    }
  });

  it('refuses a suffix that is not shaped like a tool id', () => {
    for (const partSuffix of ['', 'Part', 'a b', '../x', 'part.pdf', 7, undefined]) {
      expect(isToWorker(run({ stem: 'report', partSuffix })), JSON.stringify(partSuffix)).toBe(false);
    }
    expect(isToWorker(run('report'))).toBe(false);
  });

  it('accepts a reply that says how many files the zip holds, only above one', () => {
    const done = (parts: unknown) => ({ type: 'done', requestId: 2, outputs: [new Uint8Array([1])], parts });
    expect(isFromWorker(done(2))).toBe(true);
    expect(isFromWorker(done(undefined))).toBe(true);
    for (const parts of [1, 0, -2, 2.5, '3']) expect(isFromWorker(done(parts)), JSON.stringify(parts)).toBe(false);
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
