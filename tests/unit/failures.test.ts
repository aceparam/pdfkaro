import { describe, expect, it } from 'vitest';
import { failureSentence, workingLine } from '../../src/widget/failures';
import { gridItems, shownItems } from '../../src/widget/items';
import { fitsInOneZip, zipLimitSentence, zipMaxFiles } from '../../src/widget/zip-limits';
import { initialState, reducer } from '../../src/widget/state';

describe('the failure sentence', () => {
  it('gives the shared sentences, or the tool own advice after running out of memory', () => {
    expect(failureSentence('engine', {})).toBe('Something went wrong. Try again.');
    expect(failureSentence('memory', {})).toBe('Your browser ran out of memory. Try fewer or smaller files.');
    expect(failureSentence('memory', { memoryAdvice: 'Mark cuts so the file is split into fewer parts, then try again.' })).toBe(
      'Your browser ran out of memory. Mark cuts so the file is split into fewer parts, then try again.',
    );
  });

  it('builds the zip-limit sentences from the limits, with the tool own advice', () => {
    const advice = { zipLimitAdvice: 'Mark cuts so the file is split into fewer parts.' };
    expect(failureSentence('too-many-files', advice)).toBe('This would make more than 65,535 files, more than one zip can hold. Mark cuts so the file is split into fewer parts.');
    expect(failureSentence('zip-too-large', advice)).toBe('This would make a zip over 4 GB, more than one zip can hold. Mark cuts so the file is split into fewer parts.');
    expect(zipLimitSentence('files', 'Try a smaller job.')).toContain(zipMaxFiles.toLocaleString('en-GB'));
    expect(failureSentence('too-many-files', {})).toMatch(/Try a smaller job\.$/);
  });
});

describe('the line above the bar', () => {
  it('says Starting for a tool that gives several files, then the files as they come, then the writing label', () => {
    const words = { writingLabel: 'Putting the files into one zip', outputs: 'several' as const };
    expect(workingLine(null, words, 1)).toBe('Starting');
    expect(workingLine({ stage: 'working', unit: 'file', done: 3, total: 12 }, words, 1)).toBe('File 3 of 12');
    expect(workingLine({ stage: 'writing', percent: 100 }, words, 1)).toBe('Putting the files into one zip');
    expect(workingLine(null, { writingLabel: 'x', outputs: 'one' }, 3)).toBe('Starting on 3 files');
  });
});

describe('what fits in one zip, counted exactly', () => {
  it('counts files and bytes, names included', () => {
    expect(fitsInOneZip(['a.pdf'], [10])).toEqual({ fits: true });
    expect(fitsInOneZip(Array.from({ length: zipMaxFiles + 1 }, (_, n) => `${n}`), [])).toEqual({ fits: false, reason: 'files' });
    expect(fitsInOneZip(['a.pdf', 'b.pdf'], [0x80000000, 0x80000000])).toEqual({ fits: false, reason: 'bytes' });
  });
});

describe('the items the thumbnail queue walks', () => {
  it('are only the pages shown, so a file of 120,000 pages costs one batch', () => {
    let state = reducer(initialState, { type: 'added', files: [{ id: 'f1', name: 'a.pdf', size: 1 }] });
    state = reducer(state, { type: 'inspected', id: 'f1', outcome: { kind: 'ready', pages: 120_000 } });
    expect(shownItems(state, 'pages')).toHaveLength(500);
    expect(shownItems(reducer(state, { type: 'shown-more' }), 'pages')).toHaveLength(1000);
    expect(gridItems(state, 'files')).toHaveLength(1);
  });
});
