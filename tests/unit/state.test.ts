import { describe, expect, it } from 'vitest';
import { canRun, currentProblem, initialState, isLarge, reducer, totals, warnAboveBytes, type Action, type State } from '../../src/widget/state';

const play = (...actions: Action[]): State => actions.reduce(reducer, initialState);
const add = (...names: string[]): Action => ({ type: 'added', files: names.map((name, index) => ({ id: name, name: `${name}.pdf`, size: 1000 * (index + 1) })) });

describe('the steps of a tool', () => {
  it('lists added files as being read', () => {
    const state = play(add('a', 'b'));
    expect(state.step).toBe('listing');
    expect(state.files.map((file) => [file.id, file.status])).toEqual([['a', 'reading'], ['b', 'reading']]);
  });

  it('adds more files to the end', () => {
    expect(play(add('a'), add('b')).files.map((file) => file.id)).toEqual(['a', 'b']);
  });

  it('records what reading a file found', () => {
    const state = play(add('a', 'b', 'c'), { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 3 } }, { type: 'inspected', id: 'b', outcome: { kind: 'needs-password' } }, { type: 'inspected', id: 'c', outcome: { kind: 'damaged' } });
    expect(state.files.map((file) => file.status)).toEqual(['ready', 'needs-password', 'damaged']);
    expect(state.files[0]?.pages).toBe(3);
  });

  it('shows problems one at a time, in list order', () => {
    const state = play(add('a', 'b', 'c'), { type: 'inspected', id: 'c', outcome: { kind: 'damaged' } }, { type: 'inspected', id: 'b', outcome: { kind: 'needs-password' } });
    expect(currentProblem(state)?.id).toBe('b');
    expect(currentProblem(reducer(state, { type: 'removed', id: 'b' }))?.id).toBe('c');
  });

  it('moves a file and keeps the others in order', () => {
    const moved = play(add('a', 'b', 'c'), { type: 'moved', id: 'a', to: 2 });
    expect(moved.files.map((file) => file.id)).toEqual(['b', 'c', 'a']);
    expect(reducer(moved, { type: 'moved', id: 'a', to: 99 }).files.map((file) => file.id)).toEqual(['b', 'c', 'a']);
    expect(reducer(moved, { type: 'moved', id: 'nope', to: 0 })).toBe(moved);
  });

  it('goes back to empty when the last file is removed', () => {
    expect(play(add('a'), { type: 'removed', id: 'a' })).toEqual(initialState);
  });

  it('runs only when every file is ready and enough are listed', () => {
    const one = play(add('a'), { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 1 } });
    expect(canRun(one, 2)).toBe(false);
    const two = play(add('a', 'b'), { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 1 } });
    expect(canRun(two, 2)).toBe(false);
    expect(canRun(reducer(two, { type: 'inspected', id: 'b', outcome: { kind: 'ready', pages: 2 } }), 2)).toBe(true);
  });

  it('keeps the bar from going back during a job', () => {
    let state = play(add('a'), { type: 'started' }, { type: 'progressed', progress: { stage: 'writing', percent: 50 } });
    expect(state.fraction).toBeCloseTo(0.6);
    state = reducer(state, { type: 'progressed', progress: { stage: 'reading', unit: 'file', done: 1, total: 2 } });
    expect(state.fraction).toBeCloseTo(0.6);
  });

  it('ignores progress that arrives after the job has ended', () => {
    const done = play(add('a'), { type: 'started' }, { type: 'finished', result: { name: 'a-merged.pdf', size: 10 } });
    expect(reducer(done, { type: 'progressed', progress: { stage: 'writing', percent: 10 } })).toBe(done);
  });

  it('keeps the files when a job fails or is cancelled, so the visitor can try again', () => {
    const failed = play(add('a', 'b'), { type: 'started' }, { type: 'failed', failure: 'memory' });
    expect(failed.step).toBe('failed');
    expect(failed.failure).toBe('memory');
    const back = reducer(failed, { type: 'back-to-files' });
    expect(back.step).toBe('listing');
    expect(back.files.map((file) => file.id)).toEqual(['a', 'b']);
    expect(back.failure).toBeNull();
  });

  it('adds up files, pages and sizes, and warns over 100 MB', () => {
    const state = play(add('a', 'b'), { type: 'inspected', id: 'a', outcome: { kind: 'ready', pages: 3 } }, { type: 'inspected', id: 'b', outcome: { kind: 'ready', pages: 2 } });
    expect(totals(state)).toEqual({ files: 2, pages: 5, size: 3000 });
    expect(isLarge(state)).toBe(false);
    expect(isLarge(play({ type: 'added', files: [{ id: 'x', name: 'x.pdf', size: warnAboveBytes + 1 }] }))).toBe(true);
  });

  it('holds no bytes and no passwords', () => {
    const state = play(add('a'), { type: 'inspected', id: 'a', outcome: { kind: 'wrong-password' } });
    expect(JSON.stringify(state)).not.toMatch(/password":|bytes|Uint8Array/);
  });
});
