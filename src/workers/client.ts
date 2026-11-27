// The page's side of the tool worker. It starts the worker on first use,
// turns messages into promises, and ends the worker after every job, on
// Cancel and when the visitor starts again or leaves.
//
// A reading worker loads one fixed set first (worker-core's `ready`) and says
// `prepared` once it has settled. Until then it is ended only for the visitor's
// own actions (`end()`): never for a thumbnail's time limit, a drop, a replaced
// picture or a reading failure, so how often the site's files are asked for
// never follows the file. When the page stops waiting for a set (the hold, on
// a slow link), the worker is retired, not ended: the client stops using it,
// and it ends itself once its set has settled, or on the visitor's own end.

import type { InspectOutcome, PictureOutcome, Progress } from '../engines/types';
import type { FailureKind } from '../widget/state';
import { isFromWorker, settleHoldMs, type ThumbnailBox, type ToWorker, type ZipNaming } from './messages';

/** What a job gives back: its files, or one zip holding `parts` files. */
export type RunResult = { outputs: Uint8Array[]; parts?: number };

/** The parts of a Worker the client uses, so tests can pass a made-up one. */
export type WorkerLike = {
  postMessage(message: ToWorker): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

export class ToolError extends Error {
  /** The page a `page-too-large` failure names, as the worker sent it; undefined for every other failure. */
  readonly page: number | undefined;
  constructor(
    readonly kind: FailureKind | 'cancelled',
    page?: number,
  ) {
    super(kind);
    this.name = 'ToolError';
    this.page = kind === 'page-too-large' ? page : undefined;
  }
}

/** How a wait for a worker's set ended: it settled, the worker was ended, or the hold passed. */
export type SettleOutcome = 'settled' | 'ended' | 'timeout';


type Pending = {
  resolve(value: unknown): void;
  reject(error: ToolError): void;
  onProgress?: (progress: Progress) => void;
};

export class ToolClient {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  // The current worker's set: whether it has settled, and who is waiting for it.
  private settledNow = false;
  private readonly settleWaiters = new Set<(outcome: 'settled' | 'ended') => void>();
  // The one thumbnail asked for, and a drop of it waiting for its answer.
  private thumbnailRequest: number | null = null;
  private dropWatch: { requestId: number; resolve(outcome: 'dropped' | 'too-late'): void } | null = null;
  // Whether the current worker has been sent a job: a job's worker loads its whole set before the engine, posts no
  // `prepared`, and is ended when the job ends.
  private jobWorker = false;
  // Workers no longer used, each left to finish loading its set and then ended.
  private readonly retired = new Set<WorkerLike>();
  // Workers that were ever sent a file, a password or a picture (a read, a picture read, a thumbnail or a job). Such a
  // worker is never left behind when the workspace goes: it holds what the visitor gave it.
  private readonly carried = new WeakSet<WorkerLike>();

  constructor(
    private readonly toolId: string,
    private readonly createWorker: () => WorkerLike,
    /** How long a thumbnail may take, once the set has settled, before its worker is ended. Tests make it short. */
    private readonly thumbnailLimitMs = 10_000,
    /** How long the page waits for a worker's set to settle. Tests make it short. */
    private readonly holdMs = settleHoldMs,
  ) {}

  /** Whether the current worker's set has settled. False with no worker. */
  get settled(): boolean {
    return this.worker !== null && this.settledNow;
  }

  /** Whether any retired worker is still finishing its set. */
  get lingering(): boolean {
    return this.retired.size > 0;
  }

  /**
   * Starts a worker if none runs and has it load the tool's pick set, with no file. Resolves when the set has
   * settled, with `'ended'` when the worker is ended or fails first, or with `'timeout'` once `holdMs` has passed
   * (the worker is then left running: only the caller decides what follows).
   */
  prepare(holdMs?: number): Promise<SettleOutcome> {
    const worker = this.ensureWorker();
    worker.postMessage({ type: 'prepare', requestId: this.nextId++, toolId: this.toolId });
    return this.whenSettled(holdMs);
  }

  /** Waits for the current worker's set to settle, at most `limitMs` when given. */
  private whenSettled(limitMs?: number): Promise<SettleOutcome> {
    if (!this.worker) return Promise.resolve('ended');
    if (this.settledNow) return Promise.resolve('settled');
    return new Promise<SettleOutcome>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (outcome: SettleOutcome) => {
        clearTimeout(timer);
        this.settleWaiters.delete(waiter);
        resolve(outcome);
      };
      const waiter = (outcome: 'settled' | 'ended') => done(outcome);
      this.settleWaiters.add(waiter);
      if (limitMs !== undefined) timer = setTimeout(() => done('timeout'), limitMs);
    });
  }

  /**
   * Ends the current worker once its set has settled, or once the hold has passed, whichever is first; the next
   * request starts a fresh worker. Used for a picture read replaced by a new pick: that worker holds the old picture
   * and may be busy with it for minutes, so it is ended rather than left beside the next (stage 2 re-review,
   * security; past the hold this can cut its files short, a named exception in design.md Risks). The visitor's own
   * `end()` ends it at once, and this then returns.
   */
  async endWhenSettled(): Promise<void> {
    const worker = this.worker;
    if (!worker) return;
    await this.whenSettled(this.holdMs);
    if (this.worker === worker) this.endCurrent('cancelled');
  }

  /**
   * For a workspace that is going away without the visitor ending anything (the picker came back after a wrong-kind
   * pick): ends the current worker and every retired worker that was ever sent a file, a password or a picture, and
   * leaves only file-less retired workers to finish their sets. Says whether any is left.
   */
  releaseOnUnmount(): boolean {
    this.endCurrent('cancelled');
    for (const worker of [...this.retired]) {
      if (!this.carried.has(worker)) continue;
      this.retired.delete(worker);
      worker.terminate();
    }
    return this.retired.size > 0;
  }

  /**
   * Stops using the current worker now, answering what waits on it with `kind`: ended at once if its set has
   * settled (or it ran a job), otherwise retired until its set settles.
   */
  retire(kind: FailureKind | 'cancelled' = 'cancelled'): void {
    const worker = this.worker;
    if (!worker) return;
    const finished = this.settledNow || this.jobWorker;
    this.detach(kind);
    if (finished) worker.terminate();
    else this.retired.add(worker);
  }

  /**
   * Drops the thumbnail being waited for, before the set has settled, keeping the worker. Resolves `'dropped'`
   * when the worker answered it with no picture, or `'too-late'` when the set settled first (the page may then end
   * the worker), or `'none'` when no thumbnail is waiting. Once the set has settled it is always `'too-late'`.
   */
  dropThumbnail(): Promise<'dropped' | 'too-late' | 'none'> {
    const requestId = this.thumbnailRequest;
    const worker = this.worker;
    if (requestId === null || !worker || !this.pending.has(requestId)) return Promise.resolve('none');
    if (this.settledNow) return Promise.resolve('too-late');
    return new Promise((resolve) => {
      this.dropWatch?.resolve('dropped');
      this.dropWatch = { requestId, resolve };
      worker.postMessage({ type: 'drop-thumbnail', requestId, toolId: this.toolId });
    });
  }

  /** Reads one file, with a password if one was typed. */
  inspect(file: Blob, password?: string): Promise<InspectOutcome> {
    return this.send<InspectOutcome>({ type: 'inspect', requestId: 0, toolId: this.toolId, file, password });
  }

  /** Reads a picture chosen for the tool's picture option `key`, before the job. */
  inspectPicture(file: Blob, key: string): Promise<PictureOutcome> {
    return this.send<PictureOutcome>({ type: 'inspect-picture', requestId: 0, toolId: this.toolId, key, file });
  }

  /**
   * Draws one page of a file to fit inside `box`, as PNG bytes. Gives null
   * when the page cannot be drawn, and never fails the tool. The time limit
   * starts only once the worker's set has settled; if drawing then takes longer
   * than the limit, the worker is ended, which stops PDF.js too. Before then, a
   * thumbnail waits for the set at most the hold; then it is dropped by message
   * and gives no picture, and the worker is kept. The page asks for thumbnails
   * only when nothing else is waiting on the worker.
   */
  async thumbnail(file: Blob, password: string | undefined, page: number, box: ThumbnailBox, documentKey: string): Promise<Uint8Array | null> {
    const worker = this.ensureWorker();
    const reply = this.send<Uint8Array | null>({ type: 'thumbnail', requestId: 0, toolId: this.toolId, file, password, page, box, documentKey });
    reply.catch(() => {});
    const requestId = this.nextId - 1;
    this.thumbnailRequest = requestId;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = (async (): Promise<null> => {
      const waited = await this.whenSettled(this.holdMs);
      if (finished || waited === 'ended') return null;
      // The hold ran out: the network is slow, not the file. Drop the thumbnail and keep the worker; a drop that comes
      // too late means the set has just settled, so the drawing gets the usual limit.
      if (waited === 'timeout' && (await this.dropThumbnail()) !== 'too-late') return null;
      if (finished) return null;
      await new Promise<void>((resolve) => (timer = setTimeout(resolve, this.thumbnailLimitMs)));
      if (!finished && this.worker === worker) this.endCurrent('cancelled');
      return null;
    })();
    try {
      return await Promise.race([reply, limit]);
    } catch {
      return null;
    } finally {
      finished = true;
      clearTimeout(timer);
      if (this.thumbnailRequest === requestId) this.thumbnailRequest = null;
    }
  }

  /** Asks the worker to close the document it keeps open for thumbnails. Nothing happens when no worker is running. */
  closeDocument(): void {
    this.worker?.postMessage({ type: 'close', requestId: this.nextId++, toolId: this.toolId });
  }

  /**
   * Runs the tool on the files in order, with any pictures chosen for its options beside them. The worker is
   * ended when the job ends, whatever the outcome.
   */
  async run(
    files: Blob[],
    passwords: (string | undefined)[],
    options: Record<string, unknown>,
    onProgress: (progress: Progress) => void,
    zip?: ZipNaming,
    pictures?: Record<string, Blob>,
  ): Promise<RunResult> {
    const withPictures = pictures !== undefined && Object.keys(pictures).length > 0 ? { pictures } : {};
    try {
      return await this.send<RunResult>(
        { type: 'run', requestId: 0, toolId: this.toolId, files, passwords, options, ...(zip ? { zip } : {}), ...withPictures },
        onProgress,
      );
    } finally {
      this.endCurrent('cancelled');
    }
  }

  /**
   * Stops whatever is running, at the visitor's own action or on leaving: the current worker and every retired one
   * are ended. A WebAssembly call cannot be interrupted, so workers are ended.
   */
  end(): void {
    this.endCurrent('cancelled');
    for (const worker of this.retired) worker.terminate();
    this.retired.clear();
  }

  /** Ends the current worker only, leaving retired ones to finish their sets. */
  endCurrent(kind: FailureKind | 'cancelled'): void {
    const worker = this.worker;
    this.detach(kind);
    worker?.terminate();
  }

  /** Stops using the current worker, answering everything waiting on it: requests with `kind`, waits with `'ended'`. */
  private detach(kind: FailureKind | 'cancelled'): void {
    this.worker = null;
    this.jobWorker = false;
    this.settledNow = false;
    this.thumbnailRequest = null;
    const watch = this.dropWatch;
    this.dropWatch = null;
    watch?.resolve('dropped');
    for (const waiter of [...this.settleWaiters]) waiter('ended');
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const request of waiting) request.reject(new ToolError(kind));
  }

  /** Whether a worker is running now. */
  get running(): boolean {
    return this.worker !== null;
  }

  private send<T>(message: ToWorker, onProgress?: (progress: Progress) => void): Promise<T> {
    const worker = this.ensureWorker();
    if (message.type === 'run') this.jobWorker = true;
    if (message.type === 'inspect' || message.type === 'inspect-picture' || message.type === 'thumbnail' || message.type === 'run') this.carried.add(worker);
    const requestId = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, onProgress });
      worker.postMessage({ ...message, requestId });
    });
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    this.settledNow = false;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.receive(worker, event.data);
    worker.onerror = () => {
      if (this.worker === worker) this.endCurrent('engine-load');
      else this.dropRetired(worker);
    };
    this.worker = worker;
    return worker;
  }

  private dropRetired(worker: WorkerLike): void {
    if (!this.retired.delete(worker)) return;
    worker.terminate();
  }

  private receive(worker: WorkerLike, data: unknown): void {
    if (!isFromWorker(data)) return;
    // A retired worker is ended once its set has settled; nothing else from it is read.
    if (worker !== this.worker) {
      if (data.type === 'prepared') this.dropRetired(worker);
      return;
    }
    if (data.type === 'prepared') {
      this.settledNow = true;
      // A drop the worker met only after its set settled came too late: the thumbnail is still being drawn.
      const watch = this.dropWatch;
      if (watch && this.pending.has(watch.requestId)) {
        this.dropWatch = null;
        watch.resolve('too-late');
      }
      for (const waiter of [...this.settleWaiters]) waiter('settled');
      return;
    }
    const request = this.pending.get(data.requestId);
    if (!request) return;
    switch (data.type) {
      case 'progress':
        request.onProgress?.(data.progress);
        return;
      case 'inspected':
      case 'picture-inspected':
        this.pending.delete(data.requestId);
        request.resolve(data.outcome);
        return;
      case 'done':
        this.pending.delete(data.requestId);
        request.resolve({ outputs: data.outputs, parts: data.parts } satisfies RunResult);
        return;
      case 'thumbnail':
        this.pending.delete(data.requestId);
        if (this.dropWatch?.requestId === data.requestId) {
          this.dropWatch.resolve('dropped');
          this.dropWatch = null;
        }
        request.resolve(data.image);
        return;
      case 'failed':
        this.pending.delete(data.requestId);
        request.reject(new ToolError(data.kind, data.page));
        // A worker whose engine could not be fetched keeps that failure (the
        // browser remembers a failed module), and one that ran out of memory
        // keeps its memory. Stop using it, so that the next try starts a fresh
        // one; a reading worker whose set is still arriving is retired, not
        // ended, so its files are never cut short for a file's sake.
        // A worker that ran out of memory is ended at once, as a crash is (a named exception in design.md Risks).
        if (data.kind === 'memory') this.endCurrent('memory');
        else if (data.kind !== 'engine') this.retire(data.kind);
        return;
    }
  }
}
