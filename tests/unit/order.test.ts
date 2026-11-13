// The page order of a tool whose pages move (Reorder pages): the reducer, the
// items it gives, and the line above the pages. Plain functions, in Node.

import { describe, expect, it } from 'vitest';
import { gridItems, shownItems } from '../../src/widget/items';
import { orderSummary, orderToSend } from '../../src/widget/order';
import { initialState, pageBatch, reducer, type State } from '../../src/widget/state';

function read(pages: number): State {
  let state = reducer(initialState, { type: 'added', files: [{ id: 'f1', name: 'report.pdf', size: 10 }] });
  state = reducer(state, { type: 'inspected', id: 'f1', outcome: { kind: 'ready', pages } });
  return state;
}

describe('page moves', () => {
  it('holds no order until the first move, then builds every page and moves one', () => {
    let state = read(12);
    expect(state.order).toBeNull();
    state = reducer(state, { type: 'page-moved', page: 3, to: 0 });
    expect(state.order).toEqual([3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    state = reducer(state, { type: 'page-moved', page: 3, to: 11 });
    expect(state.order).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 3]);
  });

  it('clamps a move to the file, and ignores a page that is not there or a move to where it is', () => {
    const state = read(4);
    expect(reducer(state, { type: 'page-moved', page: 2, to: 99 }).order).toEqual([1, 3, 4, 2]);
    expect(reducer(state, { type: 'page-moved', page: 2, to: -5 }).order).toEqual([2, 1, 3, 4]);
    expect(reducer(state, { type: 'page-moved', page: 9, to: 0 })).toBe(state);
    expect(reducer(state, { type: 'page-moved', page: 2, to: 1 })).toBe(state);
    expect(reducer(state, { type: 'page-moved', page: 1.5, to: 0 })).toBe(state);
  });

  it('shows the next batch when a page moves past the pages shown', () => {
    const state = read(900);
    expect(state.shown).toBe(pageBatch);
    const moved = reducer(state, { type: 'page-moved', page: 500, to: 500 });
    expect(moved.shown).toBe(pageBatch * 2);
    expect(moved.order![500]).toBe(500);
    expect(reducer(state, { type: 'page-moved', page: 499, to: 499 }).shown).toBe(pageBatch);
  });

  it('forgets the order when the file is replaced, removed or the page starts again, and keeps it through Cancel and failure', () => {
    const moved = reducer(read(3), { type: 'page-moved', page: 3, to: 0 });
    expect(reducer(moved, { type: 'added', files: [{ id: 'f2', name: 'other.pdf', size: 1 }] }).order).toBeNull();
    expect(reducer(moved, { type: 'removed', id: 'f1' }).order).toBeNull();
    expect(reducer(moved, { type: 'reset' }).order).toBeNull();
    let state = reducer(moved, { type: 'started' });
    state = reducer(state, { type: 'failed', failure: 'engine' });
    state = reducer(state, { type: 'back-to-files' });
    expect(state.order).toEqual([3, 1, 2]);
  });

  it('moves nothing while a job runs', () => {
    const working = reducer(read(3), { type: 'started' });
    expect(reducer(working, { type: 'page-moved', page: 3, to: 0 })).toBe(working);
  });

  it('moves a page of a 120,000-page file quickly', () => {
    let state = read(120_000);
    const began = performance.now();
    for (let move = 0; move < 10; move++) state = reducer(state, { type: 'page-moved', page: 1, to: move + 1 });
    expect(performance.now() - began).toBeLessThan(500);
    expect(state.order![10]).toBe(1);
  });
});

describe('items from the order', () => {
  it('gives each page its own id and name wherever it is', () => {
    const state = reducer(read(3), { type: 'page-moved', page: 3, to: 0 });
    expect(gridItems(state, 'pages').map((item) => [item.id, item.title, item.page])).toEqual([
      ['f1:3', 'Page 3', 3],
      ['f1:1', 'Page 1', 1],
      ['f1:2', 'Page 2', 2],
    ]);
    expect(gridItems(read(2), 'pages').map((item) => item.title)).toEqual(['Page 1', 'Page 2']);
    expect(shownItems({ ...state, shown: 2 }, 'pages').map((item) => item.page)).toEqual([3, 1]);
  });
});

describe('the line above the pages', () => {
  it('says whether the order changed, and how to move a page, with no count', () => {
    expect(orderSummary(null, 12)).toBe('Pages in their original order. Press “Earlier” or “Later” under a page to move it.');
    expect(orderSummary([1, 2, 3], 3)).toBe('Pages in their original order. Press “Earlier” or “Later” under a page to move it.');
    expect(orderSummary([3, 1, 2], 3)).toBe('The order has changed. Press “Earlier” or “Later” under a page to move it.');
    expect(orderSummary(null, 1)).toBe('This file has one page, so there is nothing to move.');
  });

  it('sends the order shown, or every page in its place', () => {
    expect(orderToSend(null, 3)).toEqual([1, 2, 3]);
    expect(orderToSend([2, 1], 2)).toEqual([2, 1]);
  });
});
