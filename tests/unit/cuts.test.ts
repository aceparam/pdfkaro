import { describe, expect, it } from 'vitest';
import { cutAnnouncement, cutSummary, showMoreLabel, shownAnnouncement } from '../../src/widget/cuts';
import { gridItems } from '../../src/widget/items';
import { initialState, reducer, type State } from '../../src/widget/state';

describe('the line about cuts', () => {
  it('says what the main button will give', () => {
    expect(cutSummary(12, [])).toBe('No cuts marked. You will get one file per page, 12 files.');
    expect(cutSummary(12, [7])).toBe('Cut after page 7. You will get 2 files.');
    expect(cutSummary(12, [3, 7])).toBe('Cuts after pages 3 and 7. You will get 3 files.');
    expect(cutSummary(12, [3, 7, 9])).toBe('Cuts after pages 3, 7 and 9. You will get 4 files.');
    expect(cutSummary(1, [])).toBe('This file has one page. You will get it back as one file.');
  });

  it('names up to five cuts, then counts them', () => {
    expect(cutSummary(20, [1, 2, 3, 4, 5])).toBe('Cuts after pages 1, 2, 3, 4 and 5. You will get 6 files.');
    expect(cutSummary(20, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('12 cuts marked. You will get 13 files.');
  });

  it('writes large numbers with a thousands separator', () => {
    expect(cutSummary(1200, [])).toBe('No cuts marked. You will get one file per page, 1,200 files.');
    expect(cutSummary(5000, [1200])).toBe('Cut after page 1,200. You will get 2 files.');
  });

  it('announces a cleared cut, including the only one, with the whole summary', () => {
    expect(cutAnnouncement(12, [], 3, false)).toBe('Cut after page 3 cleared. No cuts marked. You will get one file per page, 12 files.');
    expect(cutAnnouncement(12, [7], 3, false)).toBe('Cut after page 3 cleared. Cut after page 7. You will get 2 files.');
  });

  it('announces a marked cut through the summary, or names it first once the summary only counts', () => {
    expect(cutAnnouncement(12, [3], 3, true)).toBe('Cut after page 3. You will get 2 files.');
    expect(cutAnnouncement(60, [1, 2, 3, 4, 5, 40], 40, true)).toBe('Cut after page 40. 6 cuts marked. You will get 7 files.');
  });

  it('labels the next batch in real units, including a short last one', () => {
    expect(showMoreLabel(500, 120_000, 500)).toBe('Show pages 501 to 1,000');
    expect(showMoreLabel(1000, 1200, 500)).toBe('Show pages 1,001 to 1,200');
    expect(shownAnnouncement(1000, 120_000)).toBe('Showing 1,000 of 120,000 pages');
  });
});

describe('cuts and batches in the reducer', () => {
  const ready = (pages: number): State => {
    let state = reducer(initialState, { type: 'added', files: [{ id: 'f1', name: 'a.pdf', size: 1 }] });
    state = reducer(state, { type: 'inspected', id: 'f1', outcome: { kind: 'ready', pages } });
    return state;
  };

  it('toggles cuts and keeps them sorted as numbers, so 9 and 10 go in order', () => {
    let state = ready(12);
    for (const page of [10, 9, 3]) state = reducer(state, { type: 'toggled', page });
    expect(state.marks).toEqual([3, 9, 10]);
    state = reducer(state, { type: 'toggled', page: 9 });
    expect(state.marks).toEqual([3, 10]);
  });

  it('keeps cuts through Cancel and failure, and forgets them on remove, replace and Start again', () => {
    const marked = reducer(ready(12), { type: 'toggled', page: 3 });
    const failed = reducer(reducer(marked, { type: 'started' }), { type: 'failed', failure: 'memory' });
    expect(reducer(failed, { type: 'back-to-files' }).marks).toEqual([3]);
    expect(reducer(marked, { type: 'removed', id: 'f1' }).marks).toEqual([]);
    const replaced = reducer(marked, { type: 'added', files: [{ id: 'f2', name: 'b.pdf', size: 1 }] });
    expect(reducer(replaced, { type: 'removed', id: 'f1' }).marks).toEqual([]);
    expect(reducer(marked, { type: 'reset' }).marks).toEqual([]);
  });

  it('shows pages in batches of 500, back to 500 on remove and replace', () => {
    let state = ready(120_000);
    expect(state.shown).toBe(500);
    expect(gridItems(state, 'pages', state.shown)).toHaveLength(500);
    state = reducer(state, { type: 'shown-more' });
    expect(gridItems(state, 'pages', state.shown)).toHaveLength(1000);
    expect(reducer(state, { type: 'removed', id: 'f1' }).shown).toBe(500);
    expect(reducer(state, { type: 'added', files: [{ id: 'f2', name: 'b.pdf', size: 1 }] }).shown).toBe(500);
  });

  it('shows a 500-page file whole', () => {
    expect(gridItems(ready(500), 'pages', 500)).toHaveLength(500);
  });
});
