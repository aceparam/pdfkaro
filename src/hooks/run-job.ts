// The step of a job from sending it to the worker to reading its outcome, as a
// plain function, so a Node test with a made-up client can check what it does
// with a new password. The one plain function in src/hooks/: useToolRun's
// `start` calls it, then does the dispatches and makes the download's address.

import type { Progress } from '../engines/types';
import { finishedAs, type FailureKind } from '../widget/state';
import { ToolError, type RunResult } from '../workers/client';
import type { ZipNaming } from '../workers/messages';

/** What a job ended with: one output (a file or a zip of `parts` files), no new file, a failure, or Cancel. */
export type JobOutcome =
  | { kind: 'file'; output: Uint8Array; parts?: number }
  | { kind: 'no-new-file' }
  | { kind: 'failed'; failure: FailureKind }
  | { kind: 'cancelled' };

export type Job = {
  /** The page's client, or a made-up one in a test. */
  client: { run(files: Blob[], passwords: (string | undefined)[], options: Record<string, unknown>, onProgress: (progress: Progress) => void, zip?: ZipNaming, pictures?: Record<string, Blob>): Promise<RunResult> };
  inputs: Blob[];
  /** Each input's own password, in order. */
  passwords: (string | undefined)[];
  /** Everything the engine is sent besides the files, a new password's first field among them. */
  options: Record<string, unknown>;
  zip?: ZipNaming;
  pictures?: Record<string, Blob>;
  /** Whether the tool has words for a job that gives no new file (`noSmaller`). */
  hasNoSmallerWords: boolean;
  onProgress(progress: Progress): void;
  /** Forgets every new password the page holds. Called here, as soon as the job has finished with a file or with no new file. */
  forgetNewPasswords(): void;
};

/**
 * Runs one job and gives its outcome. A job that finished with a file, or with no new file for a tool with words
 * for that, forgets the new passwords before it returns: a new password is held no longer than the job needs. A
 * failure, a run that throws and Cancel keep them, so the visitor need not type them again.
 */
export async function runJob(job: Job): Promise<JobOutcome> {
  try {
    const { outputs, parts } = await job.client.run(job.inputs, job.passwords, job.options, job.onProgress, job.zip, job.pictures);
    const output = outputs[0];
    // No file is "no smaller", for a tool with words for it; for any other tool, the engine's failure.
    const shown = finishedAs(output !== undefined, job.hasNoSmallerWords);
    // The job has finished with a file or with no new file: a new password is held no longer than the job needs.
    if (shown !== 'engine-failure') job.forgetNewPasswords();
    if (shown === 'no-new-file') return { kind: 'no-new-file' };
    if (shown === 'engine-failure' || !output) return { kind: 'failed', failure: 'engine' };
    return { kind: 'file', output, parts };
  } catch (error) {
    if (error instanceof ToolError && error.kind === 'cancelled') return { kind: 'cancelled' };
    return { kind: 'failed', failure: error instanceof ToolError && error.kind !== 'cancelled' ? error.kind : 'engine' };
  }
}
