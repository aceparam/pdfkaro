import { describe, expect, it } from 'vitest';
import { fileCount, finerSize, formatSize, outputName, outputType, pageCount, partName, progressFraction, progressLine, resultDetail, stem } from '../../src/widget/format';

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

  it('says "Reading the file" for one file read before the work, and leaves every other reading as it was', () => {
    expect(progressLine({ stage: 'reading', unit: 'file', done: 0, total: 1 }, 'x')).toBe('Reading the file');
    // Merge PDF's readings, and any reading that has counted something or has more than one file.
    expect(progressLine({ stage: 'reading', unit: 'file', done: 1, total: 1 }, 'x')).toBe('Reading file 1 of 1');
    expect(progressLine({ stage: 'reading', unit: 'file', done: 1, total: 2 }, 'x')).toBe('Reading file 1 of 2');
    expect(progressLine({ stage: 'reading', unit: 'file', done: 0, total: 2 }, 'x')).toBe('Reading file 0 of 2');
    expect(progressLine({ stage: 'working', unit: 'file', done: 0, total: 1 }, 'x')).toBe('File 0 of 1');
    expect(progressLine({ stage: 'reading', unit: 'page', done: 0, total: 1 }, 'x')).toBe('Page 0 of 1');
    expect(progressFraction({ stage: 'reading', unit: 'file', done: 0, total: 1 })).toBe(0);
  });

  it('counts pictures, filling 0.2 to 0.8, and leaves the last fifth for writing from 75%', () => {
    expect(progressLine({ stage: 'working', unit: 'picture', done: 3, total: 40 }, 'x')).toBe('Picture 3 of 40');
    expect(progressLine({ stage: 'working', unit: 'picture', done: 1200, total: 3000 }, 'x')).toBe('Picture 1,200 of 3,000');
    expect(progressFraction({ stage: 'working', unit: 'picture', done: 0, total: 40 })).toBeCloseTo(0.2);
    expect(progressFraction({ stage: 'working', unit: 'picture', done: 20, total: 40 })).toBeCloseTo(0.5);
    expect(progressFraction({ stage: 'working', unit: 'picture', done: 40, total: 40 })).toBeCloseTo(0.8);
    expect(progressFraction({ stage: 'writing', percent: 75 })).toBeCloseTo(0.8);
    expect(progressFraction({ stage: 'writing', percent: 99 })).toBeLessThan(1);
    // Pages and files still fill to the end.
    expect(progressFraction({ stage: 'working', unit: 'page', done: 40, total: 40 })).toBeCloseTo(1);
    expect(progressFraction({ stage: 'working', unit: 'file', done: 2, total: 4 })).toBeCloseTo(0.6);
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

describe('an output name with no word added', () => {
  it('changes only the extension, for a tool whose result is another kind of file', () => {
    expect(outputName('IMG_2041.jpg', '')).toBe('IMG_2041.pdf');
    // A picture of each page (PDF to JPG): the extension changes, no word is added.
    expect(outputName('report.pdf', '', 'jpg')).toBe('report.jpg');
    expect(outputName('report.pdf', '', 'png')).toBe('report.png');
    expect(outputName('report.pdf', '', 'zip')).toBe('report.zip');
    expect(partName('report', 'page', 1, 500, 'jpg')).toBe('report-page-001.jpg');
    expect(partName('report', 'page', 12, 12, 'png')).toBe('report-page-12.png');
    expect(outputName('Screenshot 2026-11-15 at 09.12.png', '')).toBe('Screenshot 2026-11-15 at 09.12.pdf');
    expect(outputName('photo.JPEG', '')).toBe('photo.pdf');
    expect(outputName('.png', '')).toBe('document.pdf');
    expect(outputName('../a:b.jpg', '')).toBe('ab.pdf');
    expect(outputName('scan.jpg', '')).toBe(`${stem('scan.jpg')}.pdf`);
  });

  it('leaves the names inside a zip as they were', () => {
    expect(partName('report', 'part', 2, 3)).toBe('report-part-2.pdf');
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

describe('the result line', () => {
  it('gives the size, then "was" and the old size for a tool that makes files smaller, then the pages', () => {
    const mb = 1024 * 1024;
    expect(resultDetail({ size: 4.2 * mb, was: 11.8 * mb, pages: 64 })).toBe('4.2 MB, was 11.8 MB, 64 pages');
    expect(resultDetail({ size: 11.6 * mb, pages: 120 })).toBe('11.6 MB, 120 pages');
    expect(resultDetail({ size: 3 * mb, parts: 3 })).toBe('3 files, 3.0 MB');
  });

  it('says both sizes one unit finer when they would read the same, with a thousands separator', () => {
    const mb = 1024 * 1024;
    // rich.pdf: 2,064 bytes become 1,676, both "2 KB".
    expect(resultDetail({ size: 1676, was: 2064, pages: 2 })).toBe('1,676 bytes, was 2,064 bytes, 2 pages');
    // 5.02 MB become 4.97 MB, both "5.0 MB".
    expect(formatSize(4.97 * mb)).toBe(formatSize(5.02 * mb));
    expect(resultDetail({ size: 4.97 * mb, was: 5.02 * mb })).toBe('5,089 KB, was 5,140 KB');
    expect(resultDetail({ size: 2.51 * 1024 * mb, was: 2.54 * 1024 * mb })).toBe('2,570 MB, was 2,601 MB');
    // Sizes that read differently are left as they are.
    expect(resultDetail({ size: 3441, was: 6057, pages: 3 })).toBe('3 KB, was 6 KB, 3 pages');
    expect(finerSize(1000, 900)).toBe('1,000 bytes');
  });
});

describe('the type of a download', () => {
  it('follows the extension', () => {
    expect(outputType('pdf')).toBe('application/pdf');
    expect(outputType('jpg')).toBe('image/jpeg');
    expect(outputType('png')).toBe('image/png');
    expect(outputType('zip')).toBe('application/zip');
  });
});
