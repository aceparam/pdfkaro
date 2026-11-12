import { describe, expect, it } from 'vitest';
import { fileCount, formatSize, outputName, pageCount, partName, progressFraction, progressLine, stem } from '../../src/widget/format';

describe('counts and sizes', () => {
  it('says one page and many pages', () => {
    expect(pageCount(1)).toBe('1 page');
    expect(pageCount(64)).toBe('64 pages');
    expect(fileCount(1)).toBe('1 file');
    expect(fileCount(3)).toBe('3 files');
  });

  it('gives sizes in plain units', () => {
    expect(formatSize(820)).toBe('820 bytes');
    expect(formatSize(512 * 1024)).toBe('512 KB');
    expect(formatSize(6.1 * 1024 * 1024)).toBe('6.1 MB');
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('progress', () => {
  it('says what is happening in real units', () => {
    expect(progressLine({ stage: 'reading', unit: 'file', done: 2, total: 3 }, 'Writing the merged file')).toBe('Reading file 2 of 3');
    expect(progressLine({ stage: 'working', unit: 'page', done: 14, total: 120 }, 'x')).toBe('Page 14 of 120');
    expect(progressLine({ stage: 'writing', percent: 40.4 }, 'Writing the merged file')).toBe('Writing the merged file');
  });

  it('fills reading into the first fifth and the rest after', () => {
    expect(progressFraction({ stage: 'reading', unit: 'file', done: 0, total: 4 })).toBe(0);
    expect(progressFraction({ stage: 'reading', unit: 'file', done: 4, total: 4 })).toBeCloseTo(0.2);
    expect(progressFraction({ stage: 'writing', percent: 50 })).toBeCloseTo(0.6);
    expect(progressFraction({ stage: 'writing', percent: 100 })).toBeCloseTo(1);
  });

  it('never goes outside 0 to 1, even with odd numbers', () => {
    expect(progressFraction({ stage: 'reading', unit: 'file', done: 5, total: 0 })).toBe(0);
    expect(progressFraction({ stage: 'writing', percent: 250 })).toBe(1);
  });
});

describe('output names', () => {
  it('builds the name from the input', () => {
    expect(outputName('report.pdf', 'merged')).toBe('report-merged.pdf');
    expect(outputName('Report.PDF', 'merged')).toBe('Report-merged.pdf');
  });

  it('drops folders, control characters and direction marks', () => {
    expect(outputName('../../etc/passwd.pdf', 'merged')).toBe('passwd-merged.pdf');
    expect(outputName('C:\\Users\\a\\scan.pdf', 'merged')).toBe('scan-merged.pdf');
    expect(outputName('in\u0000voice\u202Efdp.exe.pdf', 'merged')).toBe('invoicefdp.exe-merged.pdf');
  });

  it('never gives an empty or hidden name, and keeps it short', () => {
    expect(outputName('.pdf', 'merged')).toBe('document-merged.pdf');
    expect(outputName('', 'merged')).toBe('document-merged.pdf');
    expect(outputName(`${'a'.repeat(300)}.pdf`, 'merged')).toBe(`${'a'.repeat(100)}-merged.pdf`);
  });
});

describe('names that every system accepts', () => {
  it('strips characters Windows refuses, and any path or leading dot', () => {
    expect(stem('a:b*c?.pdf')).toBe('abc');
    expect(stem('q"u<o>t|e.pdf')).toBe('quote');
    expect(stem('../x.pdf')).toBe('x');
    expect(stem('.hidden.pdf')).toBe('hidden');
    expect(stem('...')).toBe('document');
    expect(outputName('a:b.pdf', 'split', 'zip')).toBe('ab-split.zip');
  });

  it('keeps the stem and outputName in step', () => {
    for (const name of ['report.pdf', 'C:\\scan.pdf', 'x'.repeat(300), 'in\u202Ex.pdf']) {
      expect(outputName(name, 'merged')).toBe(`${stem(name)}-merged.pdf`);
    }
  });
});

describe('the files inside a zip', () => {
  it('are numbered from 1 and padded so they sort', () => {
    expect(partName('report', 'part', 1, 3)).toBe('report-part-1.pdf');
    expect(partName('report', 'part', 3, 12)).toBe('report-part-03.pdf');
    expect(partName('report', 'part', 7, 500)).toBe('report-part-007.pdf');
    const names = Array.from({ length: 12 }, (_, index) => partName('r', 'part', index + 1, 12));
    expect([...names].sort()).toEqual(names);
  });
});
