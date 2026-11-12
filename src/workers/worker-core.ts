// What the tool worker does with each message, kept apart from the worker's
// own globals so that it can be tested in Node with a made-up engine.

import type { EngineModule, EngineTools } from '../engines/types';
import type { FailureKind } from '../widget/state';
import { partName } from '../widget/format';
import { isToWorker, type FromWorker, type ThumbnailBox } from './messages';

/** A document kept open so that several pages can be drawn without reading the file again. */
export type KeptDocument = {
  render(page: number, box: ThumbnailBox): Promise<Uint8Array>;
  close(): Promise<void>;
};

/** The one zip function used, from fflate. */
export type ZipSync = (entries: Record<string, Uint8Array>, options: { level: 0 }) => Uint8Array;

export type WorkerDeps = {
  /** Loads a tool's engine by its id, or gives undefined when there is none. */
  loadEngine(toolId: string): Promise<EngineModule | undefined>;
  tools: EngineTools;
  post(message: FromWorker, transfer?: Transferable[]): void;
  /** Opens a PDF for drawing thumbnails. Loaded late by the worker, so its code and PDF.js stay out of the worker file. */
  openDocument?(file: Uint8Array, password: string | undefined, tools: EngineTools): Promise<KeptDocument>;
  /** Loads fflate's zipSync. Loaded late by the worker, at the start of every run that may give several files. */
  loadZip?(): Promise<ZipSync>;
};

class EngineLoadError extends Error {}

/** Sorts a thrown error into the kinds the page can explain. No message or stack leaves the worker. */
export function failureKind(error: unknown): FailureKind {
  if (error instanceof EngineLoadError) return 'engine-load';
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  // Not every RangeError: a stack overflow or a bad offset in a damaged file is the engine's failure, not memory.
  if (/out of memory|\boom\b|cannot enlarge memory|allocation failed|invalid array buffer length|invalid typed array length/i.test(text)) {
    return 'memory';
  }
  return 'engine';
}

/**
 * Makes each result own its whole buffer, once, so that it can be moved to the
 * page. A result that is a view into a larger buffer, or that shares a buffer
 * with another result, is copied first; moving it as it is would fail.
 */
export function ownBuffers(outputs: Uint8Array[]): { outputs: Uint8Array[]; transfer: ArrayBuffer[] } {
  const seen = new Set<ArrayBufferLike>();
  const owned = outputs.map((output) => {
    const whole = output.byteOffset === 0 && output.byteLength === output.buffer.byteLength;
    if (whole && !seen.has(output.buffer) && output.buffer instanceof ArrayBuffer) {
      seen.add(output.buffer);
      return output;
    }
    const copy = output.slice();
    seen.add(copy.buffer);
    return copy;
  });
  return { outputs: owned, transfer: owned.map((output) => output.buffer as ArrayBuffer) };
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

  async function zipFor(): Promise<ZipSync> {
    if (!deps.loadZip) throw new EngineLoadError();
    try {
      return await deps.loadZip();
    } catch {
      throw new EngineLoadError();
    }
  }

  // At most one document is kept open, for drawing thumbnails of one file's pages.
  let kept: { key: string; doc: Promise<KeptDocument> } | null = null;
  async function closeKept() {
    const closing = kept;
    kept = null;
    if (!closing) return;
    try {
      await (await closing.doc).close();
    } catch {
      // A document that never opened has nothing to close.
    }
  }

  return async function handle(data: unknown): Promise<void> {
    if (!isToWorker(data)) return;
    const { requestId } = data;
    if (data.type === 'close') {
      await closeKept();
      return;
    }
    if (data.type === 'thumbnail') {
      // A thumbnail never fails the tool: any problem gives no picture.
      let image: Uint8Array | null = null;
      try {
        if (deps.openDocument) {
          if (kept?.key !== data.documentKey) {
            await closeKept();
            const opening = deps.openDocument(await bytesOf(data.file), data.password, deps.tools);
            kept = { key: data.documentKey, doc: opening };
            // A file that cannot be opened is not kept, so it is tried afresh if asked for again.
            opening.catch(() => {
              if (kept?.doc === opening) kept = null;
            });
          }
          const current = kept;
          if (current) image = await (await current.doc).render(data.page, data.box);
        }
      } catch {
        image = null;
      }
      if (!image) {
        deps.post({ type: 'thumbnail', requestId, image: null });
        return;
      }
      const moved = ownBuffers([image]);
      deps.post({ type: 'thumbnail', requestId, image: moved.outputs[0]! }, moved.transfer);
      return;
    }
    // A job or a read never runs beside a kept copy of a file.
    await closeKept();
    try {
      // For a tool that can give several files, the zip code is fetched before the engine has given anything,
      // so the request is the same whatever the file gives.
      const zipSync = data.type === 'run' && data.zip ? await zipFor() : undefined;
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
      const zip = data.type === 'run' ? data.zip : undefined;
      if (outputs.length > 1 && zip) {
        if (!zipSync) throw new EngineLoadError();
        const total = outputs.length;
        const entries: Record<string, Uint8Array> = {};
        outputs.forEach((output, index) => {
          entries[partName(zip.stem, zip.partSuffix, index + 1, total)] = output;
        });
        // PDFs are already compressed, so the files are stored, which is fast and keeps memory low.
        const zipped = zipSync(entries, { level: 0 });
        // The parts and the zip have to exist together while it is made; the parts are let go here.
        outputs.length = 0;
        for (const name of Object.keys(entries)) delete entries[name];
        const moved = ownBuffers([zipped]);
        deps.post({ type: 'done', requestId, outputs: moved.outputs, parts: total }, moved.transfer);
        return;
      }
      const moved = ownBuffers(outputs);
      deps.post({ type: 'done', requestId, outputs: moved.outputs }, moved.transfer);
    } catch (error) {
      deps.post({ type: 'failed', requestId, kind: failureKind(error) });
    }
  };
}
