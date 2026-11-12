import { describe, expect, it } from 'vitest';
import type { FileEntry, State } from '../../src/widget/state';
import { gridItems } from '../../src/widget/items';
import { emptyQueue, finished, forget, next, started, stop, want, type ThumbnailQueue } from '../../src/widget/thumbnails';

const file = (id: string, status: FileEntry['status'] = 'ready', checking = false): FileEntry => ({ id, name: `${id}.pdf`, size: 1, status, checking });
const listing = (...files: FileEntry[]): Pick<State, 'step' | 'files'> => ({ step: 'listing', files });

const nextOf = (queue: ThumbnailQueue, state: Pick<State, 'step' | 'files'>, items: 'files' | 'pages' = 'files') =>
  next(queue, state, gridItems(state, items));
const withPages = (entry: FileEntry, pages: number): FileEntry => ({ ...entry, pages });

describe('the thumbnail queue', () => {
  it('draws only items that came into view, in list order', () => {
    let queue = want(want(emptyQueue, 'c'), 'b');
    expect(nextOf(queue, listing(file('a'), file('b'), file('c')))).toBe('b');
    queue = finished(started(queue, 'b'), 'b', 'drawn');
    expect(nextOf(queue, listing(file('a'), file('b'), file('c')))).toBe('c');
    queue = finished(started(queue, 'c'), 'c', 'drawn');
    expect(nextOf(queue, listing(file('a'), file('b'), file('c')))).toBeUndefined();
  });

  it('draws one at a time', () => {
    const queue = started(want(want(emptyQueue, 'a'), 'b'), 'a');
    expect(nextOf(queue, listing(file('a'), file('b')))).toBeUndefined();
  });

  it('draws only files that have been read, and nothing while any file is being read', () => {
    const queue = want(want(want(emptyQueue, 'a'), 'b'), 'c');
    expect(nextOf(queue, listing(file('a', 'needs-password'), file('b', 'damaged'), file('c', 'ready')))).toBe('c');
    expect(nextOf(queue, listing(file('a', 'reading'), file('c')))).toBeUndefined();
    expect(nextOf(queue, listing(file('a', 'needs-password', true), file('c')))).toBeUndefined();
  });

  it('draws nothing outside the list of files', () => {
    const queue = want(emptyQueue, 'a');
    for (const step of ['empty', 'working', 'done', 'failed'] as const) {
      expect(nextOf(queue, { step, files: [file('a')] })).toBeUndefined();
    }
  });

  it('keeps a failed page blank, but asks again for one stopped on purpose', () => {
    let queue = finished(started(want(emptyQueue, 'a'), 'a'), 'a', 'failed');
    expect(nextOf(queue, listing(file('a')))).toBeUndefined();
    queue = stop(started(want(emptyQueue, 'a'), 'a'));
    expect(nextOf(queue, listing(file('a')))).toBe('a');
  });

  it('forgets a removed file everywhere, even while it is drawn', () => {
    const queue = forget(started(want(want(emptyQueue, 'a'), 'b'), 'a'), 'a');
    expect(queue.drawing).toBeNull();
    expect(queue.wanted.has('a')).toBe(false);
    expect(nextOf(queue, listing(file('b')))).toBe('b');
  });

  it('leaves what another item is doing alone when one ends', () => {
    const queue = finished(started(emptyQueue, 'b'), 'a', 'drawn');
    expect(queue.drawing).toBe('b');
  });

  it('walks the pages of one file, in order, once it has been read', () => {
    const queue = want(want(emptyQueue, 'f1:3'), 'f1:2');
    expect(nextOf(queue, listing(withPages(file('f1', 'reading'), 3)), 'pages')).toBeUndefined();
    expect(nextOf(queue, listing(withPages(file('f1'), 3)), 'pages')).toBe('f1:2');
    const later = finished(started(queue, 'f1:2'), 'f1:2', 'drawn');
    expect(nextOf(later, listing(withPages(file('f1'), 3)), 'pages')).toBe('f1:3');
  });

  it('draws no page of a file that needs a password, is damaged or is being tried', () => {
    const queue = want(emptyQueue, 'f1:1');
    for (const entry of [file('f1', 'needs-password'), file('f1', 'wrong-password'), file('f1', 'damaged'), file('f1', 'ready', true)]) {
      expect(nextOf(queue, listing(withPages(entry, 2)), 'pages'), JSON.stringify(entry)).toBeUndefined();
    }
  });

  it('draws nothing for an item whose file has been removed', () => {
    const queue = want(emptyQueue, 'f1:1');
    expect(next(queue, listing(), [{ id: 'f1:1', fileId: 'f1' }])).toBeUndefined();
    expect(next(queue, listing(file('f2')), [{ id: 'f1:1', fileId: 'f1' }])).toBeUndefined();
  });
});
