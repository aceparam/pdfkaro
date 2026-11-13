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
 * page, up to `limit`; until then the file's own line shows its state.
 */
export function gridItems(state: Pick<State, 'files'> & { order?: State['order'] }, items: 'files' | 'pages', limit = Number.POSITIVE_INFINITY): GridEntry[] {
  if (items === 'files') return state.files.map((file) => ({ id: file.id, title: file.name, fileId: file.id, page: 1 }));
  const file = state.files[0];
  if (!file || file.status !== 'ready' || file.checking || !file.pages) return [];
  const order = state.order ?? null;
  // Only the pages shown are made, so a file of 120,000 pages costs no more than its first batch.
  // A page keeps its id and its name wherever it moves, so its thumbnail follows it.
  return Array.from({ length: Math.min(file.pages, limit) }, (_, index) => {
    const page = order ? order[index]! : index + 1;
    return { id: `${file.id}:${page}`, title: `Page ${page}`, fileId: file.id, page };
  });
}

/** The items a list shows now: for a list of pages, only the batches shown. The thumbnail queue walks these. */
export function shownItems(state: Pick<State, 'files' | 'shown'> & { order?: State['order'] }, items: 'files' | 'pages'): GridEntry[] {
  return gridItems(state, items, state.shown);
}
