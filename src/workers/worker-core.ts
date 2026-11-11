// What the tool worker does with each message, kept apart from the worker's
// own globals so that it can be tested in Node with a made-up engine.

import type { EngineModule, EngineTools } from '../engines/types';
import type { FailureKind } from '../widget/state';
import { isToWorker, type FromWorker } from './messages';

export type WorkerDeps = {
  /** Loads a tool's engine by its id, or gives undefined when there is none. */
  loadEngine(toolId: string): Promise<EngineModule | undefined>;
  tools: EngineTools;
  post(message: FromWorker, transfer?: Transferable[]): void;
};

class EngineLoadError extends Error {}

/** Sorts a thrown error into the kinds the page can explain. No message or stack leaves the worker. */
export function failureKind(error: unknown): FailureKind {
  if (error instanceof EngineLoadError) return 'engine-load';
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (error instanceof RangeError || /out of memory|\boom\b|cannot enlarge memory|allocation failed/i.test(text)) {
    return 'memory';
  }
  return 'engine';
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function createHandler(deps: WorkerDeps) {
  async function engineFor(toolId: string): Promise<EngineModule> {
    let engine: EngineModule | undefined;
    try {
      engine = await deps.loadEngine(toolId);
    } catch {
      throw new EngineLoadError();
    }
    if (!engine) throw new EngineLoadError();
    return engine;
  }

  return async function handle(data: unknown): Promise<void> {
    if (!isToWorker(data)) return;
    const { requestId } = data;
    try {
      const engine = await engineFor(data.toolId);
      if (data.type === 'inspect') {
        if (!engine.inspect) {
          deps.post({ type: 'inspected', requestId, outcome: { kind: 'ready', pages: 0 } });
          return;
        }
        const outcome = await engine.inspect(await bytesOf(data.file), data.password, deps.tools);
        deps.post({ type: 'inspected', requestId, outcome });
        return;
      }
      const files: Uint8Array[] = [];
      for (const file of data.files) files.push(await bytesOf(file));
      const outputs = await engine.run(
        files,
        { ...data.options, passwords: data.passwords },
        (progress) => deps.post({ type: 'progress', requestId, progress }),
        deps.tools,
      );
      // The worker's copies of the inputs are dropped here; only the results go back, moved, not copied.
      files.length = 0;
      deps.post({ type: 'done', requestId, outputs }, outputs.map((output) => output.buffer as ArrayBuffer));
    } catch (error) {
      deps.post({ type: 'failed', requestId, kind: failureKind(error) });
    }
  };
}
