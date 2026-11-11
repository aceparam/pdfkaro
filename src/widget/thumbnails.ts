// Which thumbnail to draw next. Plain functions over a small state, tested in
// Node. The hook keeps the pictures themselves; this keeps only ids.

import type { State } from './state';

export type ThumbnailQueue = {
  /** Items that have come into view. */
  wanted: ReadonlySet<string>;
  /** The item being drawn now, if any. One at a time. */
  drawing: string | null;
  /** Items with a picture. */
  drawn: ReadonlySet<string>;
  /** Items whose page could not be drawn. Their blank box stays. */
  failed: ReadonlySet<string>;
};

export const emptyQueue: ThumbnailQueue = { wanted: new Set(), drawing: null, drawn: new Set(), failed: new Set() };

const withAdded = (set: ReadonlySet<string>, id: string) => new Set([...set, id]);
const without = (set: ReadonlySet<string>, id: string) => new Set([...set].filter((each) => each !== id));

/** An item has come into view. */
export function want(queue: ThumbnailQueue, id: string): ThumbnailQueue {
  return queue.wanted.has(id) ? queue : { ...queue, wanted: withAdded(queue.wanted, id) };
}

/**
 * The next item to draw, in list order, or none. Nothing is drawn while
 * another is, while any file is being read, or outside the list of files,
 * so a thumbnail never stands in the way of reading or of the job.
 */
export function next(queue: ThumbnailQueue, state: Pick<State, 'step' | 'files'>): string | undefined {
  if (queue.drawing !== null || state.step !== 'listing') return undefined;
  if (state.files.some((file) => file.status === 'reading' || file.checking)) return undefined;
  return state.files.find(
    (file) => file.status === 'ready' && queue.wanted.has(file.id) && !queue.drawn.has(file.id) && !queue.failed.has(file.id),
  )?.id;
}

export function started(queue: ThumbnailQueue, id: string): ThumbnailQueue {
  return { ...queue, drawing: id };
}

/** Drawing ended, with a picture or without one. A drawing stopped on purpose goes through `stop` instead. */
export function finished(queue: ThumbnailQueue, id: string, outcome: 'drawn' | 'failed'): ThumbnailQueue {
  const drawing = queue.drawing === id ? null : queue.drawing;
  if (outcome === 'drawn') return { ...queue, drawing, drawn: withAdded(queue.drawn, id) };
  return { ...queue, drawing, failed: withAdded(queue.failed, id) };
}

/** A file was removed: it is forgotten everywhere. */
export function forget(queue: ThumbnailQueue, id: string): ThumbnailQueue {
  return {
    wanted: without(queue.wanted, id),
    drawing: queue.drawing === id ? null : queue.drawing,
    drawn: without(queue.drawn, id),
    failed: without(queue.failed, id),
  };
}

/** The job starts, or a file is about to be read: whatever is being drawn is stopped, to be asked for again later. */
export function stop(queue: ThumbnailQueue): ThumbnailQueue {
  return queue.drawing === null ? queue : { ...queue, drawing: null };
}
