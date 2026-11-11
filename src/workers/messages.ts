// The messages between the page and the tool worker. Both sides use these
// types, and the worker checks every message it receives against them.

import type { InspectOutcome, Progress } from '../engines/types';
import type { FailureKind } from '../widget/state';

export type ToWorker =
  | { type: 'inspect'; requestId: number; toolId: string; file: Blob; password?: string }
  | { type: 'run'; requestId: number; toolId: string; files: Blob[]; passwords: (string | undefined)[]; options: Record<string, unknown> }
  | { type: 'thumbnail'; requestId: number; toolId: string; file: Blob; password?: string; page: number; box: ThumbnailBox };

/** The most a thumbnail may measure, in pixels; the page fits inside it. */
export type ThumbnailBox = { width: number; height: number };

/** The smallest and largest side a thumbnail box may have. */
export const boxLimits = { min: 16, max: 400 } as const;

export type FromWorker =
  | { type: 'inspected'; requestId: number; outcome: InspectOutcome }
  | { type: 'progress'; requestId: number; progress: Progress }
  | { type: 'done'; requestId: number; outputs: Uint8Array[] }
  | { type: 'failed'; requestId: number; kind: FailureKind }
  /** A thumbnail: PNG bytes, or null when the page could not be drawn. Never a failure of the tool. */
  | { type: 'thumbnail'; requestId: number; image: Uint8Array | null };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isBlob = (value: unknown): value is Blob => typeof Blob !== 'undefined' && value instanceof Blob;
const isOptionalString = (value: unknown) => value === undefined || typeof value === 'string';
const isSide = (value: unknown) => Number.isInteger(value) && (value as number) >= boxLimits.min && (value as number) <= boxLimits.max;

/** True when a message the worker received has the shape of a `ToWorker` message. Anything else is ignored. */
export function isToWorker(value: unknown): value is ToWorker {
  if (!isRecord(value) || typeof value.requestId !== 'number' || typeof value.toolId !== 'string') return false;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.toolId)) return false;
  if (value.type === 'inspect') return isBlob(value.file) && isOptionalString(value.password);
  if (value.type === 'run') {
    return (
      Array.isArray(value.files) &&
      value.files.every(isBlob) &&
      Array.isArray(value.passwords) &&
      value.passwords.length === value.files.length &&
      value.passwords.every(isOptionalString) &&
      isRecord(value.options)
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
      isSide(value.box.height)
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
      return Array.isArray(value.outputs) && value.outputs.every((output) => output instanceof Uint8Array);
    case 'failed':
      return failureKinds.includes(value.kind as FailureKind);
    case 'thumbnail':
      return value.image === null || value.image instanceof Uint8Array;
    default:
      return false;
  }
}
