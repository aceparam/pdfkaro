import { describe, expect, it } from 'vitest';
import type { FileEntry, State } from '../../src/widget/state';
import { emptyQueue, finished, forget, next, started, stop, want } from '../../src/widget/thumbnails';

const file = (id: string, status: FileEntry['status'] = 'ready', checking = false): FileEntry => ({ id, name: `${id}.pdf`, size: 1, status, checking });
const listing = (...files: FileEntry[]): Pick<State, 'step' | 'files'> => ({ step: 'listing', files });

describe('the thumbnail queue', () => {
  it('draws only items that came into view, in list order', () => {
    let queue = want(want(emptyQueue, 'c'), 'b');
    expect(next(queue, listing(file('a'), file('b'), file('c')))).toBe('b');
    queue = finished(started(queue, 'b'), 'b', 'drawn');
    expect(next(queue, listing(file('a'), file('b'), file('c')))).toBe('c');
    queue = finished(started(queue, 'c'), 'c', 'drawn');
    expect(next(queue, listing(file('a'), file('b'), file('c')))).toBeUndefined();
  });

  it('draws one at a time', () => {
    const queue = started(want(want(emptyQueue, 'a'), 'b'), 'a');
    expect(next(queue, listing(file('a'), file('b')))).toBeUndefined();
  });

  it('draws only files that have been read, and nothing while any file is being read', () => {
    const queue = want(want(want(emptyQueue, 'a'), 'b'), 'c');
    expect(next(queue, listing(file('a', 'needs-password'), file('b', 'damaged'), file('c', 'ready')))).toBe('c');
    expect(next(queue, listing(file('a', 'reading'), file('c')))).toBeUndefined();
    expect(next(queue, listing(file('a', 'needs-password', true), file('c')))).toBeUndefined();
  });

  it('draws nothing outside the list of files', () => {
    const queue = want(emptyQueue, 'a');
    for (const step of ['empty', 'working', 'done', 'failed'] as const) {
      expect(next(queue, { step, files: [file('a')] })).toBeUndefined();
    }
  });

  it('keeps a failed page blank, but asks again for one stopped on purpose', () => {
    let queue = finished(started(want(emptyQueue, 'a'), 'a'), 'a', 'failed');
    expect(next(queue, listing(file('a')))).toBeUndefined();
    queue = stop(started(want(emptyQueue, 'a'), 'a'));
    expect(next(queue, listing(file('a')))).toBe('a');
    queue = finished(started(want(emptyQueue, 'a'), 'a'), 'a', 'stopped');
    expect(next(queue, listing(file('a')))).toBe('a');
  });

  it('forgets a removed file everywhere, even while it is drawn', () => {
    const queue = forget(started(want(want(emptyQueue, 'a'), 'b'), 'a'), 'a');
    expect(queue.drawing).toBeNull();
    expect(queue.wanted.has('a')).toBe(false);
    expect(next(queue, listing(file('b')))).toBe('b');
  });

  it('leaves what another item is doing alone when one ends', () => {
    const queue = finished(started(emptyQueue, 'b'), 'a', 'drawn');
    expect(queue.drawing).toBe('b');
  });
});
