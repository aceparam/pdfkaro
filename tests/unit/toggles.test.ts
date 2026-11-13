import { describe, expect, it } from 'vitest';
import { toggledMarks, toggleRules } from '../../src/widget/toggles';
import { isManyPages, initialState, reducer, canRun } from '../../src/widget/state';

describe('the cut-after toggle (Split PDF)', () => {
  const rules = toggleRules['cut-after'];
  it('skips the last page, sends cuts, never blocks, and draws a cut line', () => {
    expect(rules.skip(12)).toEqual([12]);
    expect(rules.option([3, 7])).toEqual({ cuts: [3, 7] });
    expect(rules.blocked(12, [])).toBeNull();
    expect(rules.drawsCut).toBe(true);
    expect(rules.resultPages).toBeUndefined();
    expect(rules.summary(12, [3, 7])).toBe('Cuts after pages 3 and 7. You will get 3 files.');
  });
});

describe('the take toggle (Extract pages)', () => {
  const rules = toggleRules.take;
  it('has a toggle on every page, sends the pages, and draws no cut line', () => {
    expect(rules.skip(12)).toEqual([]);
    expect(rules.option([1, 3, 7])).toEqual({ pages: [1, 3, 7] });
    expect(rules.drawsCut).toBe(false);
  });

  it('says what is chosen, naming up to five pages, then a count, with thousands separators', () => {
    expect(rules.summary(12, [])).toBe('No pages chosen. Press “Take” under each page you want.');
    expect(rules.summary(12, [3])).toBe('Page 3 chosen.');
    expect(rules.summary(12, [1, 3, 7])).toBe('Pages 1, 3 and 7 chosen.');
    expect(rules.summary(30, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('12 pages chosen.');
    expect(rules.summary(5000, [1200])).toBe('Page 1,200 chosen.');
  });

  it('announces a change without repeating the list', () => {
    expect(rules.announce(12, [3], 3, true)).toBe('Page 3 chosen, 1 in all.');
    expect(rules.announce(12, [1, 3, 5, 7], 3, true)).toBe('Page 3 chosen, 4 in all.');
    expect(rules.announce(12, [1, 5, 7], 3, false)).toBe('Page 3 no longer chosen, 3 in all.');
    expect(rules.announce(12, [], 3, false)).toBe('Page 3 no longer chosen. No pages chosen.');
  });

  it('blocks the main button until a page is chosen, and counts the result pages', () => {
    expect(rules.blocked(12, [])).toBe('Choose at least one page for the new file.');
    expect(rules.blocked(12, [2])).toBeNull();
    expect(rules.resultPages?.(12, [1, 3, 7])).toBe(3);
  });
});

describe('drop, for Delete pages', () => {
  const rules = toggleRules.drop;

  it('gives every page a toggle, sends the marked pages, and draws no cut', () => {
    expect(rules.skip(12)).toEqual([]);
    expect(rules.option([1, 3])).toEqual({ pages: [1, 3] });
    expect(rules.drawsCut).toBe(false);
  });

  it('says which pages will be deleted and how many will be left', () => {
    expect(rules.summary(12, [])).toBe('No pages marked. Press “Delete” under each page you want to delete.');
    expect(rules.summary(12, [3])).toBe('Page 3 will be deleted. 11 pages will be left.');
    expect(rules.summary(12, [1, 3, 7])).toBe('Pages 1, 3 and 7 will be deleted. 9 pages will be left.');
    expect(rules.summary(100, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('12 pages will be deleted. 88 pages will be left.');
    expect(rules.summary(2, [2])).toBe('Page 2 will be deleted. 1 page will be left.');
    expect(rules.summary(3, [1, 2, 3])).toBe('Pages 1, 2 and 3 will be deleted. No pages will be left.');
    expect(rules.summary(5000, [1200])).toBe('Page 1,200 will be deleted. 4,999 pages will be left.');
  });

  it('announces a change, and says so when every page becomes marked', () => {
    expect(rules.announce(12, [3], 3, true)).toBe('Page 3 marked to delete, 1 in all.');
    expect(rules.announce(12, [1, 5, 7], 3, false)).toBe('Page 3 no longer marked, 3 in all.');
    expect(rules.announce(12, [], 3, false)).toBe('Page 3 no longer marked. No pages marked.');
    expect(rules.announce(3, [1, 2, 3], 3, true)).toBe('Page 3 marked to delete. Every page is marked, so no pages will be left.');
  });

  it('blocks the main button with nothing marked and with every page marked, and counts the pages left', () => {
    expect(rules.blocked(12, [])).toBe('Mark at least one page to delete.');
    expect(rules.blocked(12, [2])).toBeNull();
    expect(rules.blocked(3, [1, 2, 3])).toBe('A PDF needs at least one page. Leave one or more pages unmarked.');
    expect(rules.resultPages?.(12, [1, 3, 7])).toBe(9);
  });

  it('leaves take and cut-after as they were', () => {
    expect(toggleRules.take.blocked(3, [1, 2, 3])).toBeNull();
    expect(toggleRules['cut-after'].blocked(3, [])).toBeNull();
  });
});

describe('toggling', () => {
  it('adds in number order and takes out, as the reducer does', () => {
    expect(toggledMarks([10, 3], 9)).toEqual([3, 9, 10]);
    expect(toggledMarks([3, 9, 10], 9)).toEqual([3, 10]);
  });

  it('lets the toggle kind hold the main button back', () => {
    let state = reducer(initialState, { type: 'added', files: [{ id: 'f1', name: 'a.pdf', size: 1 }] });
    state = reducer(state, { type: 'inspected', id: 'f1', outcome: { kind: 'ready', pages: 3 } });
    expect(canRun(state, 1)).toBe(true);
    expect(canRun(state, 1, false)).toBe(false);
  });
});

describe('the 20,000-page notice', () => {
  it('is for a read file of more than 20,000 pages only', () => {
    const file = (pages: number, status: 'ready' | 'reading' = 'ready') => ({ files: [{ id: 'f1', name: 'a.pdf', size: 1, status, pages }] });
    expect(isManyPages(file(20_000))).toBe(false);
    expect(isManyPages(file(20_001))).toBe(true);
    expect(isManyPages(file(120_000, 'reading'))).toBe(false);
  });
});
