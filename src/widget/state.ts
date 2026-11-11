// The steps a tool goes through, as one reducer. It holds only what the screen
// shows: names, sizes, counts and statuses. It never holds a file's bytes or a
// password; those stay in memory inside useToolRun.

import type { InspectOutcome, Progress } from '../engines/types';
import { progressFraction } from './format';

export type FileStatus = 'reading' | 'ready' | 'needs-password' | 'wrong-password' | 'damaged';

export type FileEntry = {
  id: string;
  name: string;
  size: number;
  status: FileStatus;
  pages?: number;
  /** A typed password is being tried. The file keeps its status meanwhile, so it stays the problem on screen. */
  checking?: boolean;
};

export type Step = 'empty' | 'listing' | 'working' | 'done' | 'failed';

export type FailureKind = 'engine-load' | 'engine' | 'memory';

export type ResultInfo = { name: string; size: number; pages?: number };

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
};

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
  | { type: 'reset' };

export const initialState: State = {
  step: 'empty',
  files: [],
  refused: [],
  progress: null,
  fraction: 0,
  result: null,
  failure: null,
};

const statusFor: Record<InspectOutcome['kind'], FileStatus> = {
  ready: 'ready',
  'needs-password': 'needs-password',
  'wrong-password': 'wrong-password',
  damaged: 'damaged',
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'added': {
      if (action.files.length === 0) return state;
      const added = action.files.map((file): FileEntry => ({ ...file, status: 'reading' }));
      return { ...initialState, step: 'listing', files: [...state.files, ...added], refused: [] };
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
    case 'reset':
      return initialState;
  }
}

/** The first file in list order that needs the visitor, or none. Problems are shown one at a time. */
export function currentProblem(state: State): FileEntry | undefined {
  return state.files.find((file) => file.status === 'needs-password' || file.status === 'wrong-password' || file.status === 'damaged');
}

/** Whether every listed file has been read and enough are listed to run the tool. */
export function canRun(state: State, minFiles: number): boolean {
  return (
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

/** Above this, the page warns that the job may be slow or run out of memory on a phone. */
export const warnAboveBytes = 100 * 1024 * 1024;

export function isLarge(state: State): boolean {
  return totals(state).size > warnAboveBytes;
}
