import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../../src/widget/state';
import { gridItems } from '../../src/widget/items';

const file = (id: string, extra: Partial<FileEntry> = {}): FileEntry => ({ id, name: `${id}.pdf`, size: 1, status: 'ready', checking: false, pages: 3, ...extra });

describe('the items a tool lists', () => {
  it('gives one item per file, showing its first page', () => {
    expect(gridItems({ files: [file('f1'), file('f2', { status: 'reading', pages: undefined })] }, 'files')).toEqual([
      { id: 'f1', title: 'f1.pdf', fileId: 'f1', page: 1 },
      { id: 'f2', title: 'f2.pdf', fileId: 'f2', page: 1 },
    ]);
  });

  it('gives the pages of one file once it has been read', () => {
    expect(gridItems({ files: [file('f1')] }, 'pages')).toEqual([
      { id: 'f1:1', title: 'Page 1', fileId: 'f1', page: 1 },
      { id: 'f1:2', title: 'Page 2', fileId: 'f1', page: 2 },
      { id: 'f1:3', title: 'Page 3', fileId: 'f1', page: 3 },
    ]);
  });

  it('gives no pages before the file is read, or while it has a problem', () => {
    expect(gridItems({ files: [] }, 'pages')).toEqual([]);
    for (const extra of [
      { status: 'reading', pages: undefined },
      { status: 'needs-password', pages: undefined },
      { status: 'wrong-password', pages: undefined },
      { status: 'damaged', pages: undefined },
      { checking: true },
    ] as Partial<FileEntry>[]) {
      expect(gridItems({ files: [file('f1', extra)] }, 'pages'), JSON.stringify(extra)).toEqual([]);
    }
  });

  it('gives 500 pages for a 500-page file', () => {
    const items = gridItems({ files: [file('f1', { pages: 500 })] }, 'pages');
    expect(items).toHaveLength(500);
    expect(items[499]).toEqual({ id: 'f1:500', title: 'Page 500', fileId: 'f1', page: 500 });
  });
});
