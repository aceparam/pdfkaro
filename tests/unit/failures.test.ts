import { describe, expect, it } from 'vitest';
import { failureSentence, pixelsAdvice, pixelsHeading, refusedSentence, unreadableNotice, workingLine } from '../../src/widget/failures';
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

describe('the sentence for pictures past the most one job makes', () => {
  it('names the 1 GB limit and one thing to try, whatever the tool own advice', async () => {
    const { maxOutputBytes } = await import('../../src/widget/zip-limits');
    const sentence = 'The pictures would add up to more than 1 GB, the most this tool makes at once. Extract or split the pages first.';
    expect(failureSentence('too-many-pictures', {})).toBe(sentence);
    expect(failureSentence('too-many-pictures', { memoryAdvice: 'x', zipLimitAdvice: 'y' })).toBe(sentence);
    expect(maxOutputBytes).toBe(1024 ** 3);
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

describe('files turned away for their type', () => {
  it('names each, then gives the tool advice once', () => {
    const words = { acceptsName: 'a JPG or PNG picture', refusedAdvice: 'To add a picture of another kind, save it as a JPG or PNG first.' };
    expect(refusedSentence(['notes.jpg'], words)).toBe(
      'notes.jpg is not a JPG or PNG picture, so it was not added. To add a picture of another kind, save it as a JPG or PNG first.',
    );
    expect(refusedSentence(['a.txt', 'b.pdf'], words)).toBe(
      'a.txt is not a JPG or PNG picture, so it was not added. b.pdf is not a JPG or PNG picture, so it was not added. To add a picture of another kind, save it as a JPG or PNG first.',
    );
    expect(refusedSentence([], words)).toBe('');
  });

  it('says what it always said for a tool with no advice', () => {
    expect(refusedSentence(['notes.txt'], { acceptsName: 'a PDF' })).toBe('notes.txt is not a PDF, so it was not added.');
  });
});

describe('a file that cannot be read', () => {
  const pictures = { damagedAdvice: 'Open it in a photo app, save a copy, and add the copy.', unsupportedAdvice: 'Open it in a photo app, save a copy as a JPG, and add the copy.' };

  it('says a damaged file is damaged, with the tool advice, heard together', () => {
    expect(unreadableNotice('broken.png', 'damaged', pictures)).toEqual({
      heading: 'broken.png is damaged and cannot be read.',
      advice: 'Open it in a photo app, save a copy, and add the copy.',
      announcement: 'broken.png is damaged and cannot be read. Open it in a photo app, save a copy, and add the copy.',
    });
  });

  it('says how to save an unsupported file again', () => {
    expect(unreadableNotice('odd.jpg', 'unsupported', pictures)).toEqual({
      heading: 'odd.jpg is saved in a way this tool cannot read.',
      advice: 'Open it in a photo app, save a copy as a JPG, and add the copy.',
      announcement: 'odd.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy as a JPG, and add the copy.',
    });
  });

  it('says the heading alone for a tool with no advice, as the PDF tools always did', () => {
    expect(unreadableNotice('report.pdf', 'damaged', {})).toEqual({ heading: 'report.pdf is damaged and cannot be read.', announcement: 'report.pdf is damaged and cannot be read.' });
  });
});

describe('the notice for a very large picture', () => {
  it('names the picture and its pixels in millions, rounded down', () => {
    expect(pixelsHeading('huge.png', 16_000 * 16_000)).toBe('huge.png has 256 million pixels');
    expect(pixelsHeading('big.png', 50_999_999)).toBe('big.png has 50 million pixels');
    expect(pixelsHeading('vast.png', 2_147_000_000)).toBe('vast.png has 2,147 million pixels');
    expect(pixelsAdvice).toBe('Converting it may be slow, and a phone may run out of memory. You can still go ahead.');
  });

  it('says the job may run out of memory with the tool words', () => {
    expect(failureSentence('memory', { memoryAdvice: 'Try fewer pictures, or smaller ones.' })).toBe('Your browser ran out of memory. Try fewer pictures, or smaller ones.');
  });
});

describe('the running count of outputs that Split and PDF to JPG share', async () => {
  const { outputTally, TooBigForZip, TooManyPictures, zipMaxFiles: most } = await import('../../src/widget/zip-limits');

  it('refuses at once more outputs than one zip can hold', () => {
    expect(() => outputTally(most + 1)).toThrow(TooBigForZip);
    expect(() => outputTally(most)).not.toThrow();
  });

  it('throws once the outputs pass what one zip holds, only when there are several', () => {
    const several = outputTally(3, { zipBytes: () => 100 });
    several.add(60);
    expect(() => several.add(41)).toThrow(expect.objectContaining({ name: 'TooBigForZip', reason: 'bytes' }));
    const one = outputTally(1, { zipBytes: () => 100 });
    expect(() => one.add(1000)).not.toThrow();
  });

  it("throws TooManyPictures once the outputs pass the tool's own cap, for one output too", () => {
    const one = outputTally(1, { most: 100 });
    one.add(100);
    expect(() => one.add(1)).toThrow(TooManyPictures);
    const several = outputTally(5, { most: 10 });
    expect(() => several.add(11)).toThrow(expect.objectContaining({ name: 'TooManyPictures' }));
  });
});
