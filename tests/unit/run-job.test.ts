// The job step of useToolRun's `start` (src/hooks/run-job.ts), with a made-up client: what it gives back, and
// that a job which finished with a file or with no new file has forgotten the new password and the input file's
// own password by the time it returns, before anything else could clear them, while a failure, a run that throws
// and Cancel keep them.

import { describe, expect, it } from 'vitest';
import type { Progress } from '../../src/engines/types';
import { runJob, type Job } from '../../src/hooks/run-job';
import type { NewPasswords } from '../../src/widget/options';
import { ToolError, type RunResult } from '../../src/workers/client';

const typed = 'Qz7 pw#%@ Kv4';

/** A holder like useToolRun's, and a job whose client answers with `answer`. */
function setUp(answer: () => Promise<RunResult>, hasNoSmallerWords = false) {
  const holder: { current: NewPasswords } = { current: { newPassword: { first: typed, again: typed } } };
  // Like useToolRun's map of each listed file's own password.
  const inputPasswords = new Map([['f1', 'open-sesame']]);
  // Which forgets ran, in order, so a test can tell they ran before the job returned.
  const order: string[] = [];
  const sent: { options?: Record<string, unknown>; passwords?: (string | undefined)[] } = {};
  const progress: Progress[] = [];
  const job: Job = {
    client: {
      async run(_files, passwords, options, onProgress) {
        sent.options = options;
        sent.passwords = passwords;
        onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 });
        return answer();
      },
    },
    inputs: [new Blob(['%PDF-1.7'])],
    passwords: [...inputPasswords.values()],
    options: { newPassword: holder.current.newPassword!.first },
    hasNoSmallerWords,
    onProgress: (step) => progress.push(step),
    forgetNewPasswords: () => {
      order.push('new');
      holder.current = {};
    },
    forgetInputPasswords: () => {
      order.push('input');
      inputPasswords.clear();
    },
  };
  return { holder, inputPasswords, order, sent, progress, job };
}

describe('runJob', () => {
  it('a run that gives a file: the file, and the new password forgotten as it returns', async () => {
    const output = new Uint8Array([1, 2, 3]);
    const { holder, inputPasswords, order, sent, progress, job } = setUp(async () => ({ outputs: [output] }));
    const outcome = await runJob(job);
    expect(holder.current).toEqual({});
    // The input file's own password, forgotten by runJob itself as it returns, beside the new password.
    expect(inputPasswords.size).toBe(0);
    expect(order).toEqual(['new', 'input']);
    expect(outcome).toEqual({ kind: 'file', output, parts: undefined });
    expect(sent).toEqual({ options: { newPassword: typed }, passwords: ['open-sesame'] });
    expect(progress).toEqual([{ stage: 'reading', unit: 'file', done: 0, total: 1 }]);
  });

  it('a zip of several files: the zip and how many it holds', async () => {
    const output = new Uint8Array([9]);
    const { job } = setUp(async () => ({ outputs: [output], parts: 3 }));
    expect(await runJob(job)).toEqual({ kind: 'file', output, parts: 3 });
  });

  it('a run that gives no new file, for a tool with words for it: no new file, and the new password forgotten', async () => {
    const { holder, inputPasswords, order, job } = setUp(async () => ({ outputs: [] }), true);
    expect(await runJob(job)).toEqual({ kind: 'no-new-file' });
    expect(holder.current).toEqual({});
    expect(inputPasswords.size).toBe(0);
    expect(order).toEqual(['new', 'input']);
  });

  it('no file from a tool without words for it is the engine failure, and keeps the new password', async () => {
    const { holder, inputPasswords, order, job } = setUp(async () => ({ outputs: [] }), false);
    expect(await runJob(job)).toEqual({ kind: 'failed', failure: 'engine' });
    expect(holder.current).toEqual({ newPassword: { first: typed, again: typed } });
    expect(inputPasswords.get('f1')).toBe('open-sesame');
    expect(order).toEqual([]);
  });

  it('an engine failure keeps the new password and the input password, and gives its kind', async () => {
    for (const kind of ['engine', 'memory', 'output-limit', 'password-refused', 'engine-load'] as const) {
      const { holder, inputPasswords, order, job } = setUp(async () => Promise.reject(new ToolError(kind)));
      expect(await runJob(job)).toEqual({ kind: 'failed', failure: kind });
      expect(holder.current).toEqual({ newPassword: { first: typed, again: typed } });
      expect(inputPasswords.get('f1')).toBe('open-sesame');
      expect(order).toEqual([]);
    }
  });

  it('a run that throws something else is the engine failure, and keeps the new password and the input password', async () => {
    const { holder, inputPasswords, order, job } = setUp(async () => Promise.reject(new Error('broken')));
    expect(await runJob(job)).toEqual({ kind: 'failed', failure: 'engine' });
    expect(holder.current).toEqual({ newPassword: { first: typed, again: typed } });
    expect(inputPasswords.get('f1')).toBe('open-sesame');
    expect(order).toEqual([]);
  });

  it('Cancel keeps the new password and the input password', async () => {
    const { holder, inputPasswords, order, job } = setUp(async () => Promise.reject(new ToolError('cancelled')));
    expect(await runJob(job)).toEqual({ kind: 'cancelled' });
    expect(holder.current).toEqual({ newPassword: { first: typed, again: typed } });
    expect(inputPasswords.get('f1')).toBe('open-sesame');
    expect(order).toEqual([]);
  });
});
