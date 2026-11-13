// The page's side of the tool worker. It starts the worker on first use,
// turns messages into promises, and ends the worker after every job, on
// Cancel and when the visitor starts again or leaves.

import type { InspectOutcome, Progress } from '../engines/types';
import type { FailureKind } from '../widget/state';
import { isFromWorker, type ThumbnailBox, type ToWorker, type ZipNaming } from './messages';

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
  constructor(readonly kind: FailureKind | 'cancelled') {
    super(kind);
    this.name = 'ToolError';
  }
}

type Pending = {
  resolve(value: unknown): void;
  reject(error: ToolError): void;
  onProgress?: (progress: Progress) => void;
};

export class ToolClient {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly toolId: string,
    private readonly createWorker: () => WorkerLike,
    /** How long a thumbnail may take before its worker is ended. Tests make it short. */
    private readonly thumbnailLimitMs = 10_000,
  ) {}

  /** Reads one file, with a password if one was typed. */
  inspect(file: Blob, password?: string): Promise<InspectOutcome> {
    return this.send<InspectOutcome>({ type: 'inspect', requestId: 0, toolId: this.toolId, file, password });
  }

  /**
   * Draws one page of a file to fit inside `box`, as PNG bytes. Gives null
   * when the page cannot be drawn, and never fails the tool. If drawing takes
   * longer than the limit, the worker is ended, which stops PDF.js too; the
   * page asks for thumbnails only when nothing else is waiting on the worker.
   */
  async thumbnail(file: Blob, password: string | undefined, page: number, box: ThumbnailBox, documentKey: string): Promise<Uint8Array | null> {
    const reply = this.send<Uint8Array | null>({ type: 'thumbnail', requestId: 0, toolId: this.toolId, file, password, page, box, documentKey });
    reply.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        this.end();
        resolve(null);
      }, this.thumbnailLimitMs);
    });
    try {
      return await Promise.race([reply, limit]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Asks the worker to close the document it keeps open for thumbnails. Nothing happens when no worker is running. */
  closeDocument(): void {
    this.worker?.postMessage({ type: 'close', requestId: this.nextId++, toolId: this.toolId });
  }

  /** Runs the tool on the files in order. The worker is ended when the job ends, whatever the outcome. */
  async run(
    files: Blob[],
    passwords: (string | undefined)[],
    options: Record<string, unknown>,
    onProgress: (progress: Progress) => void,
    zip?: ZipNaming,
  ): Promise<RunResult> {
    try {
      return await this.send<RunResult>(
        { type: 'run', requestId: 0, toolId: this.toolId, files, passwords, options, ...(zip ? { zip } : {}) },
        onProgress,
      );
    } finally {
      this.end();
    }
  }

  /** Stops whatever is running. A WebAssembly call cannot be interrupted, so the worker is ended. */
  end(): void {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const request of waiting) request.reject(new ToolError('cancelled'));
  }

  /** Whether a worker is running now. */
  get running(): boolean {
    return this.worker !== null;
  }

  private send<T>(message: ToWorker, onProgress?: (progress: Progress) => void): Promise<T> {
    const worker = this.ensureWorker();
    const requestId = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, onProgress });
      worker.postMessage({ ...message, requestId });
    });
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.receive(event.data);
    worker.onerror = () => this.failAll('engine-load');
    this.worker = worker;
    return worker;
  }

  private receive(data: unknown): void {
    if (!isFromWorker(data)) return;
    const request = this.pending.get(data.requestId);
    if (!request) return;
    switch (data.type) {
      case 'progress':
        request.onProgress?.(data.progress);
        return;
      case 'inspected':
        this.pending.delete(data.requestId);
        request.resolve(data.outcome);
        return;
      case 'done':
        this.pending.delete(data.requestId);
        request.resolve({ outputs: data.outputs, parts: data.parts } satisfies RunResult);
        return;
      case 'thumbnail':
        this.pending.delete(data.requestId);
        request.resolve(data.image);
        return;
      case 'failed':
        this.pending.delete(data.requestId);
        request.reject(new ToolError(data.kind));
        // A worker whose engine could not be fetched keeps that failure (the
        // browser remembers a failed module), and one that ran out of memory
        // keeps its memory. End it, so that the next try starts a fresh one.
        if (data.kind !== 'engine') this.failAll(data.kind);
        return;
    }
  }

  private failAll(kind: FailureKind): void {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const request of waiting) request.reject(new ToolError(kind));
  }
}
