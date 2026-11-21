// The steps a tool goes through, as one reducer. It holds only what the screen
// shows: names, sizes, counts and statuses. It never holds a file's bytes or a
// password; those stay in memory inside useToolRun.

import type { InspectOutcome, Progress } from '../engines/types';
import { progressFraction } from './format';
import { toggledMarks } from './toggles';
import { turnedAll, turnedPage, type Turns } from './turns';

export type FileStatus = 'reading' | 'ready' | 'needs-password' | 'wrong-password' | 'damaged' | 'unsupported';

export type FileEntry = {
  id: string;
  name: string;
  size: number;
  status: FileStatus;
  pages?: number;
  /** For a picture so large that the page warns about it: how many pixels it has. */
  pixels?: number;
  /** A typed password is being tried. The file keeps its status meanwhile, so it stays the problem on screen. */
  checking?: boolean;
};

export type Step = 'empty' | 'listing' | 'working' | 'done' | 'failed';

export type FailureKind = 'engine-load' | 'engine' | 'memory' | 'too-many-files' | 'zip-too-large' | 'too-many-pictures' | 'output-limit' | 'text-refused';

/**
 * The finished result. `parts` is set when it is a zip holding that many files;
 * `was` is the input's size, for a tool that shows it beside the new size.
 * `{ none: true }` is a job that ended with no new file, because the file could
 * not be improved (a tool with `noSmaller` words): it has no name, size or link.
 */
export type ResultInfo = { name: string; size: number; pages?: number; parts?: number; was?: number } | NoNewFile;
export type NoNewFile = { none: true };

/** Whether a finished job gave no new file. */
export const isNoNewFile = (result: ResultInfo | null): result is NoNewFile => result !== null && 'none' in result;

/**
 * What a finished job shows, from whether the engine gave a file. Whether a
 * file is smaller is the engine's to say (Compress PDF gives none unless the
 * file is at least 1% smaller), so any file it gives is shown. With no file, a
 * tool with words for "no smaller" (`noSmaller`) shows them; for any other
 * tool, no file is the engine's failure.
 */
export function finishedAs(gaveFile: boolean, hasNoSmallerWords: boolean): 'file' | 'no-new-file' | 'engine-failure' {
  if (gaveFile) return 'file';
  return hasNoSmallerWords ? 'no-new-file' : 'engine-failure';
}

export type State = {
  step: Step;
  files: FileEntry[];
  /** Names of the files last turned away for being of the wrong type. */
  refused: string[];
  progress: Progress | null;
  /** How full the progress bar is, 0 to 1. It never goes back during a job. */
  fraction: number;
  result: ResultInfo | null;
  failure: FailureKind | null;
  /** Pages the visitor marked, in order, for a tool with per-page toggles: Split PDF's cuts. */
  marks: number[];
  /** How many pages of a page list are shown; more are shown in batches. */
  shown: number;
  /**
   * The pages of the one file in the order shown, for a tool whose pages move:
   * Reorder pages. `null` is the original order, for every tool, so a file that
   * is never moved holds no list.
   */
  order: number[] | null;
  /** The turns of the one file's pages, for a tool whose pages turn: Rotate PDF. `null` is nothing turned. */
  turns: Turns | null;
  /**
   * What each of the tool's options shows, by key (`options` in its registry words): a choice's value,
   * or a text's raw value exactly as typed, so its field shows what the visitor typed (it is cleaned
   * only when it is checked and sent). `{}` is every option at its start, a text empty, so a tool with
   * no options holds nothing. No cap on a text's length: a long paste is held, refused and never sent. Kept through Cancel, a failure and
   * a file replaced through "Choose another file" while listing (the new file is listed before the
   * old one is removed). Not kept when the last file is removed, which ends the working area,
   * including a damaged or password file replaced from its notice; "Start again" clears it too.
   * Never written to storage or the address.
   */
  choices: Readonly<Record<string, string>>;
};

/** How many pages a page list shows at first, and adds each time. */
export const pageBatch = 500;

export type Action =
  | { type: 'added'; files: { id: string; name: string; size: number }[] }
  | { type: 'refused'; names: string[] }
  | { type: 'inspected'; id: string; outcome: InspectOutcome }
  | { type: 'reading-again'; id: string }
  | { type: 'moved'; id: string; to: number }
  | { type: 'removed'; id: string }
  | { type: 'started' }
  | { type: 'progressed'; progress: Progress }
  | { type: 'finished'; result: ResultInfo }
  | { type: 'failed'; failure: FailureKind }
  | { type: 'back-to-files' }
  | { type: 'toggled'; page: number }
  | { type: 'shown-more' }
  | { type: 'page-moved'; page: number; to: number }
  | { type: 'page-turned'; page: number; by: 1 | -1 }
  | { type: 'all-turned'; by: 1 | -1 }
  | { type: 'option-set'; key: string; value: string }
  | { type: 'reset' };

export const initialState: State = {
  step: 'empty',
  files: [],
  refused: [],
  progress: null,
  fraction: 0,
  result: null,
  failure: null,
  marks: [],
  shown: pageBatch,
  order: null,
  turns: null,
  choices: {},
};

const statusFor: Record<InspectOutcome['kind'], FileStatus> = {
  ready: 'ready',
  'needs-password': 'needs-password',
  'wrong-password': 'wrong-password',
  damaged: 'damaged',
  unsupported: 'unsupported',
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'added': {
      if (action.files.length === 0) return state;
      const added = action.files.map((file): FileEntry => ({ ...file, status: 'reading' }));
      // A new file starts its page marks, order and turns afresh, but keeps what the options show.
      return { ...initialState, step: 'listing', files: [...state.files, ...added], refused: [], choices: state.choices };
    }
    case 'refused':
      return { ...state, refused: action.names };
    case 'inspected':
      return {
        ...state,
        files: state.files.map((file) =>
          file.id === action.id
            ? {
                ...file,
                status: statusFor[action.outcome.kind],
                checking: false,
                pages: action.outcome.kind === 'ready' ? action.outcome.pages : file.pages,
                pixels: action.outcome.kind === 'ready' ? action.outcome.pixels : undefined,
              }
            : file,
        ),
      };
    case 'reading-again':
      return {
        ...state,
        files: state.files.map((file) => (file.id === action.id ? { ...file, checking: true } : file)),
      };
    case 'moved': {
      const from = state.files.findIndex((file) => file.id === action.id);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(state.files.length - 1, action.to));
      if (from === to) return state;
      const files = [...state.files];
      const [moving] = files.splice(from, 1);
      files.splice(to, 0, moving!);
      return { ...state, files };
    }
    case 'removed': {
      const files = state.files.filter((file) => file.id !== action.id);
      return files.length === 0 ? initialState : { ...state, files };
    }
    case 'started':
      return { ...state, step: 'working', progress: null, fraction: 0, result: null, failure: null, refused: [] };
    case 'progressed':
      if (state.step !== 'working') return state;
      return {
        ...state,
        progress: action.progress,
        fraction: Math.max(state.fraction, progressFraction(action.progress)),
      };
    case 'finished':
      return { ...state, step: 'done', progress: null, fraction: 1, result: action.result };
    case 'failed':
      return { ...state, step: 'failed', progress: null, failure: action.failure };
    case 'back-to-files':
      return { ...state, step: state.files.length > 0 ? 'listing' : 'empty', progress: null, fraction: 0, failure: null, result: null };
    case 'toggled': {
      if (state.step !== 'listing' || !Number.isInteger(action.page) || action.page < 1) return state;
      return { ...state, marks: toggledMarks(state.marks, action.page) };
    }
    case 'shown-more':
      return { ...state, shown: state.shown + pageBatch };
    case 'page-moved': {
      const pages = state.files[0]?.pages ?? 0;
      if (state.step !== 'listing' || pages < 1 || !Number.isInteger(action.page) || !Number.isInteger(action.to)) return state;
      const order = state.order ? [...state.order] : Array.from({ length: pages }, (_, index) => index + 1);
      const from = order.indexOf(action.page);
      const to = Math.max(0, Math.min(pages - 1, action.to));
      if (from < 0 || from === to) return state;
      order.splice(from, 1);
      order.splice(to, 0, action.page);
      // A page moved past the pages shown brings the next batch into view, so it stays in sight.
      const shown = to >= state.shown ? state.shown + pageBatch : state.shown;
      return { ...state, order, shown };
    }
    case 'page-turned': {
      const pages = state.files[0]?.pages ?? 0;
      if (state.step !== 'listing' || !Number.isInteger(action.page) || action.page < 1 || action.page > pages || (action.by !== 1 && action.by !== -1)) return state;
      return { ...state, turns: turnedPage(state.turns, action.page, action.by) };
    }
    case 'all-turned': {
      if (state.step !== 'listing' || !(state.files[0]?.pages) || (action.by !== 1 && action.by !== -1)) return state;
      return { ...state, turns: turnedAll(state.turns, action.by) };
    }
    case 'option-set': {
      if (state.step !== 'listing' || typeof action.key !== 'string' || typeof action.value !== 'string') return state;
      if (Object.hasOwn(state.choices, action.key) && state.choices[action.key] === action.value) return state;
      // A computed key is always the object's own, even "__proto__".
      return { ...state, choices: { ...state.choices, [action.key]: action.value } };
    }
    case 'reset':
      return initialState;
  }
}

/** The first file in list order that needs the visitor, or none. Problems are shown one at a time. */
export function currentProblem(state: State): FileEntry | undefined {
  return state.files.find(
    (file) => file.status === 'needs-password' || file.status === 'wrong-password' || file.status === 'damaged' || file.status === 'unsupported',
  );
}

/** Whether a problem is a file that cannot be read at all, which is left out or replaced: damaged or unsupported. */
export function isUnreadable(file: FileEntry | undefined): boolean {
  return file?.status === 'damaged' || file?.status === 'unsupported';
}

/** The listed files that have been read and are so large the page warns about them, in list order. */
export function hugeFiles(state: Pick<State, 'files'>): (FileEntry & { pixels: number })[] {
  return state.files.filter((file): file is FileEntry & { pixels: number } => file.status === 'ready' && file.pixels !== undefined);
}

/** Whether every listed file has been read and enough are listed to run the tool. */
export function canRun(state: State, minFiles: number, ready = true): boolean {
  return (
    ready &&
    state.step === 'listing' &&
    state.files.length >= minFiles &&
    state.files.every((file) => file.status === 'ready')
  );
}

/** Whether some file is still being read, or a password for it tried. */
export function isReading(state: State): boolean {
  return state.files.some((file) => file.status === 'reading' || file.checking === true);
}

/** Whether every listed file has been read and opened, so their pages can be counted. */
export function allReady(state: State): boolean {
  return state.files.length > 0 && state.files.every((file) => file.status === 'ready');
}

export function totals(state: State): { files: number; pages: number; size: number } {
  return {
    files: state.files.length,
    pages: state.files.reduce((sum, file) => sum + (file.pages ?? 0), 0),
    size: state.files.reduce((sum, file) => sum + file.size, 0),
  };
}

/** Above this many pages, a page tool warns that the job may take a long time (the owner's decision of 13 Nov 2026). */
export const manyPages = 20_000;

/** Whether a tool that lists pages has a file of more than `manyPages` pages. */
export function isManyPages(state: Pick<State, 'files'>): boolean {
  return state.files.some((file) => file.status === 'ready' && (file.pages ?? 0) > manyPages);
}

/** Above this, the page warns that the job may be slow or run out of memory on a phone. */
export const warnAboveBytes = 100 * 1024 * 1024;

export function isLarge(state: State): boolean {
  return totals(state).size > warnAboveBytes;
}
