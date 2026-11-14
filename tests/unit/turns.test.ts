// The turns of a tool whose pages turn (Rotate PDF): the reducer and the words.
// Plain functions, in Node.

import { describe, expect, it } from 'vitest';
import { initialState, reducer, type State } from '../../src/widget/state';
import { allAnnouncement, turnAnnouncement, turnCaption, turnedCount, turnOf, turnRules, turnsBlocked, turnSummary, turnsToSend } from '../../src/widget/turns';

function read(pages: number): State {
  let state = reducer(initialState, { type: 'added', files: [{ id: 'f1', name: 'report.pdf', size: 10 }] });
  state = reducer(state, { type: 'inspected', id: 'f1', outcome: { kind: 'ready', pages } });
  return state;
}

describe('turning pages in the reducer', () => {
  it('turns one page round and back, removing its own turn at 0', () => {
    let state = read(12);
    expect(state.turns).toBeNull();
    state = reducer(state, { type: 'page-turned', page: 3, by: 1 });
    expect(turnOf(state.turns, 3)).toBe(1);
    state = reducer(state, { type: 'page-turned', page: 3, by: 1 });
    expect(turnOf(state.turns, 3)).toBe(2);
    state = reducer(state, { type: 'page-turned', page: 3, by: -1 });
    state = reducer(state, { type: 'page-turned', page: 3, by: -1 });
    expect(state.turns).toEqual({ all: 0, pages: {} });
    expect(reducer(read(1), { type: 'page-turned', page: 1, by: -1 }).turns).toEqual({ all: 0, pages: { 1: 3 } });
  });

  it('turns every page with one number, on top of pages turned on their own', () => {
    let state = reducer(read(120_000), { type: 'page-turned', page: 3, by: -1 });
    state = reducer(state, { type: 'all-turned', by: 1 });
    expect(state.turns).toEqual({ all: 1, pages: { 3: 3 } });
    expect(turnOf(state.turns, 3)).toBe(0);
    expect(turnOf(state.turns, 119_999)).toBe(1);
  });

  it('ignores pages not in the file, bad turns, and turns while a job runs', () => {
    const state = read(3);
    expect(reducer(state, { type: 'page-turned', page: 4, by: 1 })).toBe(state);
    expect(reducer(state, { type: 'page-turned', page: 0, by: 1 })).toBe(state);
    expect(reducer(state, { type: 'page-turned', page: 1, by: 2 as 1 })).toBe(state);
    const working = reducer(state, { type: 'started' });
    expect(reducer(working, { type: 'all-turned', by: 1 })).toBe(working);
  });

  it('forgets the turns on replace, remove and start again, and keeps them through Cancel and failure', () => {
    const turned = reducer(read(3), { type: 'page-turned', page: 2, by: 1 });
    expect(reducer(turned, { type: 'added', files: [{ id: 'f2', name: 'b.pdf', size: 1 }] }).turns).toBeNull();
    expect(reducer(turned, { type: 'removed', id: 'f1' }).turns).toBeNull();
    expect(reducer(turned, { type: 'reset' }).turns).toBeNull();
    let state = reducer(turned, { type: 'started' });
    state = reducer(state, { type: 'failed', failure: 'engine' });
    state = reducer(state, { type: 'back-to-files' });
    expect(turnOf(state.turns, 2)).toBe(1);
  });
});

describe('counting and words', () => {
  it('counts the pages that will be turned without walking every page', () => {
    expect(turnedCount(null, 12)).toBe(0);
    expect(turnedCount({ all: 0, pages: { 2: 1, 5: 2, 9: 3 } }, 12)).toBe(3);
    expect(turnedCount({ all: 1, pages: { 3: 3 } }, 120_000)).toBe(119_999);
    expect(turnedCount({ all: 2, pages: {} }, 12)).toBe(12);
  });

  it('says in words how far a page is from how it was', () => {
    expect(turnCaption('Page 3', 0)).toBe('Page 3');
    expect(turnCaption('Page 3', 1)).toBe('Page 3, turned right');
    expect(turnCaption('Page 3', 2)).toBe('Page 3, turned half round');
    expect(turnCaption('Page 3', 3)).toBe('Page 3, turned left');
    expect(turnAnnouncement(3, 1)).toBe('Page 3 is now turned right.');
    expect(turnAnnouncement(3, 2)).toBe('Page 3 is now turned half round.');
    expect(turnAnnouncement(1200, 0)).toBe('Page 1,200 is back the way it was.');
  });

  it('says where every page is after turning them all, or which way when some have their own turn', () => {
    expect(allAnnouncement({ all: 1, pages: {} }, 1)).toBe('Every page is now turned right.');
    expect(allAnnouncement({ all: 2, pages: {} }, 1)).toBe('Every page is now turned half round.');
    expect(allAnnouncement({ all: 0, pages: {} }, -1)).toBe('Every page is back the way it was.');
    expect(allAnnouncement({ all: 1, pages: { 3: 3 } }, 1)).toBe('Every page turned right.');
  });

  it('keeps the how-to sentence in every line, and holds the main button back until a page will be turned', () => {
    const how = 'Press “Turn left” or “Turn right” under a page to turn it, or turn every page at once.';
    expect(turnSummary(null, 12)).toBe(`No pages will be turned. ${how}`);
    expect(turnSummary({ all: 0, pages: { 2: 1 } }, 12)).toBe(`1 page will be turned. ${how}`);
    expect(turnSummary({ all: 0, pages: { 2: 1, 5: 1, 9: 2 } }, 12)).toBe(`3 pages will be turned. ${how}`);
    expect(turnSummary({ all: 1, pages: {} }, 12)).toBe(`Every page will be turned. ${how}`);
    expect(turnSummary(null, 1)).toBe('No pages will be turned. Press “Turn left” or “Turn right” under it to turn it.');
    expect(turnsBlocked(null, 12)).toBe('Turn a page to make a new file.');
    expect(turnsBlocked({ all: 0, pages: { 2: 1 } }, 12)).toBeNull();
    expect(turnsBlocked({ all: 1, pages: { 3: 3 } }, 3)).toBeNull();
  });

  it('sends the turns sorted by page', () => {
    expect(turnsToSend(null, 3)).toEqual({ all: 0, pages: [] });
    expect(turnsToSend({ all: 1, pages: { 9: 2, 2: 3 } }, 12)).toEqual({ all: 1, pages: [[2, 3], [9, 2]] });
    expect(turnRules.option({ all: 0, pages: { 1: 1 } }, 2)).toEqual({ turns: { all: 0, pages: [[1, 1]] } });
  });
});
