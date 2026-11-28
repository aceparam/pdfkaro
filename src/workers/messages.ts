// The messages between the page and the tool worker. Both sides use these
// types, and the worker checks every message it receives against them.

import type { InspectOutcome, PictureOutcome, Progress } from '../engines/types';
import { outputExtensions, type OutputExtension } from '../widget/format';
import type { FailureKind } from '../widget/state';

export type ToWorker =
  | { type: 'inspect'; requestId: number; toolId: string; file: Blob; password?: string }
  /** Reads a picture chosen for the tool's picture option `key`, before the job. */
  | { type: 'inspect-picture'; requestId: number; toolId: string; key: string; file: Blob }
  | {
      type: 'run';
      requestId: number;
      toolId: string;
      files: Blob[];
      passwords: (string | undefined)[];
      options: Record<string, unknown>;
      /** Each shown, ready picture chosen for an option, by its key, sent beside the files. */
      pictures?: Record<string, Blob>;
      /** For a tool that can give several files: how to name them inside the one zip. */
      zip?: ZipNaming;
    }
  | { type: 'thumbnail'; requestId: number; toolId: string; file: Blob; password?: string; page: number; box: ThumbnailBox; documentKey: string }
  /** Closes the document kept open for thumbnails, such as when its file is removed. */
  | { type: 'close'; requestId: number; toolId: string }
  /**
   * Loads the tool's pick set (its engine, its reading libraries, then its thumbnail code) and nothing else.
   * Sent on every pick, before the page looks at the files, so a pick that takes no file loads the same set.
   * Carries no file and no password.
   */
  | { type: 'prepare'; requestId: number; toolId: string }
  /**
   * Drops the thumbnail with this request id if it is still waiting for the set: it is answered with no picture
   * and never opens its document. Carries no file and no password.
   */
  | { type: 'drop-thumbnail'; requestId: number; toolId: string };

/**
 * The cleaned base of the input's name, the word for each file inside a zip, and
 * the files' extension: `pdf` when left out, or a picture's (PDF to JPG).
 */
export type ZipNaming = { stem: string; partSuffix: string; extension?: OutputExtension };

/** The extensions a file inside a zip may have: the closed list of output extensions, so no name the page sends can carry anything else. */
export const zipExtensions: readonly OutputExtension[] = outputExtensions;

/**
 * The longest the page waits for a reading worker's set to settle, and the longest the worker holds back a reading
 * failure for it: then the page goes on, but no worker is ended for it (add-uniform-requests, decision 7).
 */
export const settleHoldMs = 60_000;

/** The most a thumbnail may measure, in pixels; the page fits inside it. */
export type ThumbnailBox = { width: number; height: number };

/** The smallest and largest side a thumbnail box may have. */
export const boxLimits = { min: 16, max: 400 } as const;

export type FromWorker =
  | { type: 'inspected'; requestId: number; outcome: InspectOutcome }
  | { type: 'picture-inspected'; requestId: number; outcome: PictureOutcome }
  | { type: 'progress'; requestId: number; progress: Progress }
  /** `parts` says how many files the one output, a zip, holds. */
  | { type: 'done'; requestId: number; outputs: Uint8Array[]; parts?: number }
  /** `page` only with kind `'page-too-large'`: the page whose drawing is too large, a whole number from 1, and nothing else from the file. */
  | { type: 'failed'; requestId: number; kind: FailureKind; page?: number }
  /** A thumbnail: PNG bytes, or null when the page could not be drawn. Never a failure of the tool. */
  | { type: 'thumbnail'; requestId: number; image: Uint8Array | null }
  /**
   * The worker's pick set has settled: its thumbnail code has loaded or failed (or its reading set failed).
   * Posted once per worker, with request id 0. Until then the page ends the worker only for the visitor's own actions.
   */
  | { type: 'prepared'; requestId: number };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const isBlob = (value: unknown): value is Blob => typeof Blob !== 'undefined' && value instanceof Blob;
const isOptionalString = (value: unknown) => value === undefined || typeof value === 'string';
const isSide = (value: unknown) => Number.isInteger(value) && (value as number) >= boxLimits.min && (value as number) <= boxLimits.max;

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A stem the worker accepts for names inside a zip: no path, no character some
// systems refuse or that changes text direction, no leading dot. The page's
// own cleaning already gives such stems; the worker does not rely on it.
// eslint-disable-next-line no-control-regex -- refusing control characters is the point
const refusedInStem = /[\\/\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069:*?"<>|]/;
const isStem = (value: unknown) =>
  typeof value === 'string' && value.length >= 1 && value.length <= 100 && !refusedInStem.test(value) && !value.startsWith('.');
const isZipNaming = (value: unknown) =>
  isRecord(value) &&
  isStem(value.stem) &&
  typeof value.partSuffix === 'string' &&
  idPattern.test(value.partSuffix) &&
  (value.extension === undefined || (zipExtensions as readonly unknown[]).includes(value.extension));

/** The most pictures one run may carry. */
export const maxPictures = 4;

/** A picture option's key: a plain word, as the registry test asks of every option key; never `__proto__` or a word with a space. */
const keyPattern = /^[a-z][a-zA-Z0-9]*$/;
const isKey = (value: unknown) => typeof value === 'string' && value.length <= 64 && keyPattern.test(value);

/** A run's pictures: left out, or a plain object of at most `maxPictures` own plain keys, each a Blob. */
function isPictures(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  return keys.length <= maxPictures && keys.every((key) => isKey(key) && isBlob(value[key]));
}

/** True when a message the worker received has the shape of a `ToWorker` message. Anything else is ignored. */
export function isToWorker(value: unknown): value is ToWorker {
  if (!isRecord(value) || typeof value.requestId !== 'number' || typeof value.toolId !== 'string') return false;
  if (!idPattern.test(value.toolId)) return false;
  if (value.type === 'close') return true;
  // Nothing but the type, the request id and the tool: never a file or a password.
  if (value.type === 'prepare' || value.type === 'drop-thumbnail') return hasOnly(value, ['type', 'requestId', 'toolId']);
  if (value.type === 'inspect') return isBlob(value.file) && isOptionalString(value.password);
  if (value.type === 'inspect-picture') return isKey(value.key) && isBlob(value.file);
  if (value.type === 'run') {
    return (
      Array.isArray(value.files) &&
      value.files.every(isBlob) &&
      Array.isArray(value.passwords) &&
      value.passwords.length === value.files.length &&
      value.passwords.every(isOptionalString) &&
      isRecord(value.options) &&
      isPictures(value.pictures) &&
      (value.zip === undefined || isZipNaming(value.zip))
    );
  }
  if (value.type === 'thumbnail') {
    return (
      isBlob(value.file) &&
      isOptionalString(value.password) &&
      Number.isInteger(value.page) &&
      (value.page as number) >= 1 &&
      isRecord(value.box) &&
      isSide(value.box.width) &&
      isSide(value.box.height) &&
      typeof value.documentKey === 'string' &&
      /^f[0-9]{1,9}$/.test(value.documentKey)
    );
  }
  return false;
}

const isWhole = (value: unknown, least: number) => Number.isInteger(value) && (value as number) >= least;

/** An outcome of reading a file, of a known kind, with whole numbers where it carries any. */
function isOutcome(value: unknown): boolean {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'ready':
      // A tool with no reader of its own is ready with 0 pages.
      return isWhole(value.pages, 0) && (value.pixels === undefined || isWhole(value.pixels, 1));
    case 'needs-password':
    case 'wrong-password':
    case 'damaged':
    case 'unsupported':
      return true;
    default:
      return false;
  }
}

/** A picture's outcome, of a known kind, with whole pixels above 0 when ready. */
function isPictureOutcome(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'ready') return isWhole(value.pixels, 1);
  return value.kind === 'damaged' || value.kind === 'unsupported';
}

const failureKinds: FailureKind[] = [
  'engine-load',
  'engine',
  'memory',
  'too-many-files',
  'zip-too-large',
  'too-many-pictures',
  'output-limit',
  'unsafe-page',
  'text-refused',
  'drawing-refused',
  'picture-refused',
  'picture-too-large',
  'password-refused',
  'page-too-large',
  'too-damaged',
];

/** True when a message the page received has the shape of a `FromWorker` message. */
export function isFromWorker(value: unknown): value is FromWorker {
  if (!isRecord(value) || typeof value.requestId !== 'number') return false;
  switch (value.type) {
    case 'inspected':
      return isOutcome(value.outcome);
    case 'picture-inspected':
      return isPictureOutcome(value.outcome);
    case 'progress':
      return isRecord(value.progress) && typeof value.progress.stage === 'string';
    case 'done':
      return (
        Array.isArray(value.outputs) &&
        value.outputs.every((output) => output instanceof Uint8Array) &&
        (value.parts === undefined || (Number.isInteger(value.parts) && (value.parts as number) > 1))
      );
    case 'failed':
      if (!failureKinds.includes(value.kind as FailureKind) || !hasOnly(value, ['type', 'requestId', 'kind', 'page'])) return false;
      // A page number goes with a page-too-large failure only, as a whole number from 1.
      if (value.page === undefined) return true;
      return value.kind === 'page-too-large' && Number.isSafeInteger(value.page) && (value.page as number) >= 1;
    case 'thumbnail':
      return value.image === null || value.image instanceof Uint8Array;
    case 'prepared':
      return hasOnly(value, ['type', 'requestId']);
    default:
      return false;
  }
}
