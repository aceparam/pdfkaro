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

  it('accepts the extensions of the closed set, or none, and refuses any other', () => {
    for (const extension of ['pdf', 'jpg', 'png', undefined]) expect(isToWorker(run({ stem: 'report', partSuffix: 'page', extension })), String(extension)).toBe(true);
    for (const extension of ['zip', 'JPG', 'jpeg', 'exe', 'jpg/../x', '.jpg', '', 7, null]) {
      expect(isToWorker(run({ stem: 'report', partSuffix: 'page', extension })), JSON.stringify(extension)).toBe(false);
    }
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
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'too-many-pictures' })).toBe(true);
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'output-limit' })).toBe(true);
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'text-refused' })).toBe(true);
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'drawing-refused' })).toBe(true);
    // No file: an engine that could not make the file smaller (Compress PDF).
    expect(isFromWorker({ type: 'done', requestId: 1, outputs: [] })).toBe(true);
    expect(isFromWorker({ type: 'progress', requestId: 1, progress: { stage: 'working', unit: 'picture', done: 3, total: 40 } })).toBe(true);
  });

  it('ignores anything else, including a failure that carries a message', () => {
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'TypeError: x is undefined' })).toBe(false);
    expect(isFromWorker({ type: 'done', requestId: 1, outputs: ['text'] })).toBe(false);
    expect(isFromWorker({ type: 'other', requestId: 1 })).toBe(false);
  });
});

describe('what reading a file found', () => {
  const inspected = (outcome: unknown) => ({ type: 'inspected', requestId: 1, outcome });

  it('accepts every known outcome, a picture outcome only with whole positive numbers', () => {
    for (const outcome of [
      { kind: 'ready', pages: 3 },
      { kind: 'ready', pages: 0 },
      { kind: 'ready', pages: 1, pixels: 256_000_000 },
      { kind: 'needs-password' },
      { kind: 'wrong-password' },
      { kind: 'damaged' },
      { kind: 'unsupported' },
    ]) {
      expect(isFromWorker(inspected(outcome)), JSON.stringify(outcome)).toBe(true);
    }
  });

  it('refuses an unknown kind, or numbers that are not whole and positive', () => {
    for (const outcome of [
      null,
      { kind: 'odd' },
      { kind: 'ready' },
      { kind: 'ready', pages: -1 },
      { kind: 'ready', pages: 1.5 },
      { kind: 'ready', pages: '3' },
      { kind: 'ready', pages: 1, pixels: 0 },
      { kind: 'ready', pages: 1, pixels: 2.5 },
      { kind: 'ready', pages: 1, pixels: '256' },
      { kind: 'ready', pages: 1, pixels: Number.POSITIVE_INFINITY },
    ]) {
      expect(isFromWorker(inspected(outcome)), JSON.stringify(outcome)).toBe(false);
    }
  });
});

describe('pictures chosen for an option', () => {
  const picture = new Blob(['\x89PNG']);
  const run = (pictures: unknown) => ({ type: 'run', requestId: 2, toolId: 'test-picture', files: [file], passwords: [undefined], options: {}, pictures });

  it('accepts a read of one picture by a plain key, and a run with its pictures by plain keys', () => {
    expect(isToWorker({ type: 'inspect-picture', requestId: 1, toolId: 'test-picture', key: 'picture', file: picture })).toBe(true);
    expect(isToWorker(run(undefined))).toBe(true);
    expect(isToWorker(run({}))).toBe(true);
    expect(isToWorker(run({ picture }))).toBe(true);
    expect(isToWorker(run({ a: picture, b: picture, c: picture, d: picture }))).toBe(true);
  });

  it('ignores a read with a bad key or no Blob', () => {
    for (const bad of [
      { type: 'inspect-picture', requestId: 1, toolId: 'test-picture', key: '__proto__', file: picture },
      { type: 'inspect-picture', requestId: 1, toolId: 'test-picture', key: 'the picture', file: picture },
      { type: 'inspect-picture', requestId: 1, toolId: 'test-picture', key: '', file: picture },
      { type: 'inspect-picture', requestId: 1, toolId: 'test-picture', key: 7, file: picture },
      { type: 'inspect-picture', requestId: 1, toolId: 'test-picture', key: 'picture', file: 'bytes' },
      { type: 'inspect-picture', requestId: 1, toolId: 'test-picture', key: 'picture' },
      { type: 'inspect-picture', requestId: 1, toolId: '../evil', key: 'picture', file: picture },
    ]) {
      expect(isToWorker(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('ignores a run whose pictures are not a plain object of at most 4 plain keys to Blobs', () => {
    const inherited = Object.create({ picture }) as Record<string, unknown>;
    const withProto = JSON.parse('{"__proto__": 1}') as Record<string, unknown>;
    for (const bad of [
      null,
      'picture',
      [picture],
      { picture: 'bytes' },
      { picture: new Uint8Array([1]) },
      { 'the picture': picture },
      { Picture: picture },
      { a: picture, b: picture, c: picture, d: picture, e: picture },
      withProto,
      inherited,
      new Map([['picture', picture]]),
    ]) {
      expect(isToWorker(run(bad)), String(bad)).toBe(false);
    }
  });
});

describe('a picture read, from the worker', () => {
  it('accepts each outcome, with whole pixels above 0 when ready', () => {
    expect(isFromWorker({ type: 'picture-inspected', requestId: 1, outcome: { kind: 'ready', pixels: 1 } })).toBe(true);
    expect(isFromWorker({ type: 'picture-inspected', requestId: 1, outcome: { kind: 'ready', pixels: 256_000_000 } })).toBe(true);
    expect(isFromWorker({ type: 'picture-inspected', requestId: 1, outcome: { kind: 'damaged' } })).toBe(true);
    expect(isFromWorker({ type: 'picture-inspected', requestId: 1, outcome: { kind: 'unsupported' } })).toBe(true);
  });

  it('refuses any other outcome', () => {
    for (const outcome of [undefined, null, {}, { kind: 'ready' }, { kind: 'ready', pixels: 0 }, { kind: 'ready', pixels: 1.5 }, { kind: 'ready', pixels: '9' }, { kind: 'needs-password' }, { kind: 'refused' }]) {
      expect(isFromWorker({ type: 'picture-inspected', requestId: 1, outcome }), JSON.stringify(outcome)).toBe(false);
    }
  });

  it('accepts the two picture failures', () => {
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'picture-refused' })).toBe(true);
    expect(isFromWorker({ type: 'failed', requestId: 1, kind: 'picture-too-large' })).toBe(true);
  });
});
