// The page target size (src/widget/target.ts): which page sets a target, the hold, the result headings, the
// over-target words and the byte rule, with the cases of the design (add-compress-to-target, decision 2).

import { describe, expect, it } from 'vitest';
import { sizeTargets, acceptedTarget } from '../../src/widget/option-values';
import { heldByTarget, heldFile, heldSentence, overHeading, overResult, pageTarget, sizeAgainstTarget, underHeading } from '../../src/widget/target';

const kb100 = sizeTargets['100kb'];
const kb200 = sizeTargets['200kb'];
const mb1 = sizeTargets['1mb'];
const mb2 = sizeTargets['2mb'];

describe('the target a page sets', () => {
  const words = { sizeTarget: { overAdvice: 'Advice.' } };

  it('is the preset named target, for a tool whose words declare a size target', () => {
    expect(pageTarget(words, { target: '200kb' })).toBe(kb200);
    expect(pageTarget(words, { target: '1mb' })).toBe(mb1);
  });

  it('is none for another tool, no preset, or an unknown target', () => {
    expect(pageTarget({}, { target: '200kb' })).toBeUndefined();
    expect(pageTarget(words, undefined)).toBeUndefined();
    expect(pageTarget(words, {})).toBeUndefined();
    expect(pageTarget(words, { target: '300kb' })).toBeUndefined();
    expect(pageTarget(words, { target: '__proto__' })).toBeUndefined();
    expect(pageTarget(words, { target: 200 })).toBeUndefined();
  });

  it('is read by the engine through own keys only', () => {
    expect(acceptedTarget('500kb')).toEqual({ bytes: 500_000, label: '500 KB', binary: 512_000 });
    for (const value of [undefined, null, 200_000, '200KB', '300kb', '__proto__', 'toString', 'constructor', 'hasOwnProperty']) expect(acceptedTarget(value)).toBeUndefined();
  });
});

describe('the hold', () => {
  it('holds a file at or under the target, counted in thousands', () => {
    expect(heldByTarget(84 * 1024, kb200)).toBe(true);
    expect(heldByTarget(199_999, kb200)).toBe(true);
    expect(heldByTarget(200_000, kb200)).toBe(true);
    expect(heldByTarget(200_001, kb200)).toBe(false);
    // 203,000 bytes is shown as "198 KB" in the row, and is still over 200,000 bytes.
    expect(heldByTarget(203_000, kb200)).toBe(false);
  });

  it('holds the one listed file once it is read, opened or not, but never a damaged or unreadable one', () => {
    const file = (size: number, status: string) => ({ size, status });
    for (const status of ['ready', 'needs-password', 'wrong-password']) expect(heldFile([file(84 * 1024, status)], kb200)).toEqual(file(84 * 1024, status));
    for (const status of ['reading', 'damaged', 'unsupported']) expect(heldFile([file(84 * 1024, status)], kb200)).toBeUndefined();
    expect(heldFile([file(203_000, 'ready')], kb200)).toBeUndefined();
    expect(heldFile([file(84 * 1024, 'ready')], undefined)).toBeUndefined();
    expect(heldFile([], kb200)).toBeUndefined();
    expect(heldFile([file(10, 'ready'), file(10, 'ready')], kb200)).toBeUndefined();
  });

  it('names the file and says there is nothing to do', () => {
    expect(heldSentence('report.pdf', kb200)).toBe('report.pdf is already 200 KB or smaller, so there is nothing to do here. You can use it as it is.');
    // The name goes in as it is: the page shows it as text, never as markup.
    expect(heldSentence('<b>x</b>.pdf', mb1)).toBe('<b>x</b>.pdf is already 1 MB or smaller, so there is nothing to do here. You can use it as it is.');
  });
});

describe('the result headings', () => {
  it('say whether the file is under the target', () => {
    expect(underHeading(kb200)).toBe('Your file is now 200 KB or smaller');
    expect(overHeading(kb200)).toBe('Your file is still over 200 KB');
    expect(overHeading(mb2)).toBe('Your file is still over 2 MB');
  });
});

describe('the byte rule', () => {
  it('shows in bytes a size over the target that would not read as more than it', () => {
    // 1 MB unless named, each with what formatSize alone would show.
    expect(sizeAgainstTarget(1_000_001, mb1)).toBe('1,000,001 bytes'); // 977 KB
    expect(sizeAgainstTarget(1_040_000, mb1)).toBe('1,040,000 bytes'); // 1016 KB
    expect(sizeAgainstTarget(1_048_576, mb1)).toBe('1,048,576 bytes'); // 1.0 MB
    expect(sizeAgainstTarget(1_101_000, mb1)).toBe('1,101,000 bytes'); // 1.0 MB
    expect(sizeAgainstTarget(1_101_004, mb1)).toBe('1,101,004 bytes'); // 1.0 MB
    expect(sizeAgainstTarget(2_050_000, mb2)).toBe('2,050,000 bytes'); // 2.0 MB
    expect(sizeAgainstTarget(102_400, kb100)).toBe('102,400 bytes'); // 100 KB
    expect(sizeAgainstTarget(102_911, kb100)).toBe('102,911 bytes'); // 100 KB
    expect(sizeAgainstTarget(200_001, kb200)).toBe('200,001 bytes'); // 195 KB
    expect(sizeAgainstTarget(203_000, kb200)).toBe('203,000 bytes'); // 198 KB
  });

  it('shows the usual size once it reads as more than the target', () => {
    expect(sizeAgainstTarget(1_101_005, mb1)).toBe('1.1 MB');
    expect(sizeAgainstTarget(1_110_000, mb1)).toBe('1.1 MB');
    expect(sizeAgainstTarget(2_150_000, mb2)).toBe('2.1 MB');
    expect(sizeAgainstTarget(102_912, kb100)).toBe('101 KB');
    expect(sizeAgainstTarget(312 * 1024, kb100)).toBe('312 KB');
  });

  it('leaves a size at or under the target to the usual form', () => {
    expect(sizeAgainstTarget(199_999, kb200)).toBe('195 KB');
    expect(sizeAgainstTarget(200_000, kb200)).toBe('195 KB');
  });
});

describe('the over-target words', () => {
  it('name the same size in the sentence and in the line under the name', () => {
    const words = overResult({ size: 203_000, was: 620 * 1024, pages: 3 }, kb200);
    expect(words.sentence).toBe('The smallest file this tool could make is 203,000 bytes, which is over 200 KB.');
    expect(words.detail).toBe('203,000 bytes, was 620 KB, 3 pages');
    const usual = overResult({ size: 312 * 1024, was: 4 * 1024 * 1024, pages: 1 }, kb100);
    expect(usual.sentence).toBe('The smallest file this tool could make is 312 KB, which is over 100 KB.');
    expect(usual.detail).toBe('312 KB, was 4.0 MB, 1 page');
  });

  it('say both sizes in bytes when the old one would read the same as the new one', () => {
    const words = overResult({ size: 1_160_000, was: 1_180_000 }, mb1);
    expect(words.sentence).toBe('The smallest file this tool could make is 1,160,000 bytes, which is over 1 MB.');
    expect(words.detail).toBe('1,160,000 bytes, was 1,180,000 bytes');
  });
});
