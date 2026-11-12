// The messages between the page and the tool worker. Both sides use these
// types, and the worker checks every message it receives against them.

import type { InspectOutcome, Progress } from '../engines/types';
import type { FailureKind } from '../widget/state';

export type ToWorker =
  | { type: 'inspect'; requestId: number; toolId: string; file: Blob; password?: string }
  | {
      type: 'run';
      requestId: number;
      toolId: string;
      files: Blob[];
      passwords: (string | undefined)[];
      options: Record<string, unknown>;
      /** For a tool that can give several files: how to name them inside the one zip. */
      zip?: ZipNaming;
    }
  | { type: 'thumbnail'; requestId: number; toolId: string; file: Blob; password?: string; page: number; box: ThumbnailBox; documentKey: string }
  /** Closes the document kept open for thumbnails, such as when its file is removed. */
  | { type: 'close'; requestId: number; toolId: string };

/** The cleaned base of the input's name, and the word for each file inside a zip. */
export type ZipNaming = { stem: string; partSuffix: string };

/** The most a thumbnail may measure, in pixels; the page fits inside it. */
export type ThumbnailBox = { width: number; height: number };

/** The smallest and largest side a thumbnail box may have. */
export const boxLimits = { min: 16, max: 400 } as const;

export type FromWorker =
  | { type: 'inspected'; requestId: number; outcome: InspectOutcome }
  | { type: 'progress'; requestId: number; progress: Progress }
  /** `parts` says how many files the one output, a zip, holds. */
  | { type: 'done'; requestId: number; outputs: Uint8Array[]; parts?: number }
  | { type: 'failed'; requestId: number; kind: FailureKind }
  /** A thumbnail: PNG bytes, or null when the page could not be drawn. Never a failure of the tool. */
  | { type: 'thumbnail'; requestId: number; image: Uint8Array | null };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
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
const isZipNaming = (value: unknown) => isRecord(value) && isStem(value.stem) && typeof value.partSuffix === 'string' && idPattern.test(value.partSuffix);

/** True when a message the worker received has the shape of a `ToWorker` message. Anything else is ignored. */
export function isToWorker(value: unknown): value is ToWorker {
  if (!isRecord(value) || typeof value.requestId !== 'number' || typeof value.toolId !== 'string') return false;
  if (!idPattern.test(value.toolId)) return false;
  if (value.type === 'close') return true;
  if (value.type === 'inspect') return isBlob(value.file) && isOptionalString(value.password);
  if (value.type === 'run') {
    return (
      Array.isArray(value.files) &&
      value.files.every(isBlob) &&
      Array.isArray(value.passwords) &&
      value.passwords.length === value.files.length &&
      value.passwords.every(isOptionalString) &&
      isRecord(value.options) &&
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

const failureKinds: FailureKind[] = ['engine-load', 'engine', 'memory'];

/** True when a message the page received has the shape of a `FromWorker` message. */
export function isFromWorker(value: unknown): value is FromWorker {
  if (!isRecord(value) || typeof value.requestId !== 'number') return false;
  switch (value.type) {
    case 'inspected':
      return isRecord(value.outcome) && typeof value.outcome.kind === 'string';
    case 'progress':
      return isRecord(value.progress) && typeof value.progress.stage === 'string';
    case 'done':
      return (
        Array.isArray(value.outputs) &&
        value.outputs.every((output) => output instanceof Uint8Array) &&
        (value.parts === undefined || (Number.isInteger(value.parts) && (value.parts as number) > 1))
      );
    case 'failed':
      return failureKinds.includes(value.kind as FailureKind);
    case 'thumbnail':
      return value.image === null || value.image instanceof Uint8Array;
    default:
      return false;
  }
}
