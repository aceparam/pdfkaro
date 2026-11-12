// The items the working area lists: one per file, or the pages of one file.
// A plain function, tested in Node.

import type { State } from './state';

export type GridEntry = {
  /** The item's id: the file id, or `${fileId}:${page}` for a page. */
  id: string;
  /** What the item is called: the file's name, or "Page 3". */
  title: string;
  /** The file the item belongs to. */
  fileId: string;
  /** The page its thumbnail shows. */
  page: number;
};

/**
 * The items to list. A tool that lists files gets one per file. A tool that
 * lists pages gets nothing until its one file has been read, then one item per
 * page; until then the file's own line shows its state.
 */
export function gridItems(state: Pick<State, 'files'>, items: 'files' | 'pages'): GridEntry[] {
  if (items === 'files') return state.files.map((file) => ({ id: file.id, title: file.name, fileId: file.id, page: 1 }));
  const file = state.files[0];
  if (!file || file.status !== 'ready' || file.checking || !file.pages) return [];
  return Array.from({ length: file.pages }, (_, index) => ({
    id: `${file.id}:${index + 1}`,
    title: `Page ${index + 1}`,
    fileId: file.id,
    page: index + 1,
  }));
}
