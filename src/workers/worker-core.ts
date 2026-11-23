// What the tool worker does with each message, kept apart from the worker's
// own globals so that it can be tested in Node with a made-up engine.

import type { EngineModule, EngineTools, LibraryName } from '../engines/types';
import type { FailureKind } from '../widget/state';
import { partName } from '../widget/format';
import { outOfMemory } from '../widget/memory';
import { fitsInOneZip, TooBigForZip } from '../widget/zip-limits';
import { drawSet, inOrder, libraryOf } from './libraries';
import { isToWorker, settleHoldMs, type FromWorker, type ThumbnailBox } from './messages';

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
  /**
   * Loads each library by name, fetching its files, before any file is read: `qpdf` makes the spare qpdf,
   * `fflate` gives the module with `zipSync`, `pdfjs` starts PDF.js, its worker, its data and the thumbnail
   * step together. A library with no loader here counts as one that failed to load.
   */
  libraries: Partial<Record<LibraryName, () => Promise<unknown>>>;
  /** Every key a library gives an engine; each step's engine sees only the keys its declared set allows. */
  tools: EngineTools;
  post(message: FromWorker, transfer?: Transferable[]): void;
  /**
   * Opens a file for drawing thumbnails. Loaded late by the worker, so its code and PDF.js stay out of the worker file.
   * `kind` is the tool's engine's `thumbnails`: left out for a PDF, drawn by PDF.js; `'picture'` for a JPG or PNG,
   * drawn by the browser's image decoder. It comes from the tool, never from the file.
   */
  openDocument?(file: Uint8Array, password: string | undefined, tools: EngineTools, kind: EngineModule['thumbnails']): Promise<KeptDocument>;
  /** How long a reading failure waits for the pick set to settle before it is posted. Tests make it short. */
  settleHoldMs?: number;
};


class EngineLoadError extends Error {}

/** Sorts a thrown error into the kinds the page can explain. No message or stack leaves the worker. */
export function failureKind(error: unknown): FailureKind {
  if (error instanceof EngineLoadError) return 'engine-load';
  // An engine's files would not fit in one zip. Known by name, so engines need not import worker code.
  if (error instanceof Error && error.name === 'TooBigForZip') {
    return (error as Error & { reason?: unknown }).reason === 'files' ? 'too-many-files' : 'zip-too-large';
  }
  // An engine's outputs would pass the most it makes at once (PDF to JPG's 1 GB). Known by name, as above.
  if (error instanceof Error && error.name === 'TooManyPictures') return 'too-many-pictures';
  // The drawing step's new file, or its update, would pass their size budget (stamp.ts). Known by name, as above.
  if (error instanceof Error && error.name === 'OutputLimit') return 'output-limit';
  // An engine refused the text it was sent (option-values.ts's `TextRefused`). Known by name, as above.
  if (error instanceof Error && error.name === 'TextRefused') return 'text-refused';
  // An engine refused the drawing it was sent (option-values.ts's `DrawingRefused`). Known by name, as above.
  if (error instanceof Error && error.name === 'DrawingRefused') return 'drawing-refused';
  // An engine refused the picture it was sent (option-values.ts's `PictureRefused`), or found it alone would pass the
  // new file's size budget (`PictureTooLarge`). Known by name, as above; the page names the picture from its own state.
  if (error instanceof Error && error.name === 'PictureRefused') return 'picture-refused';
  if (error instanceof Error && error.name === 'PictureTooLarge') return 'picture-too-large';
  // An engine refused the new password it was sent (option-values.ts's `PasswordRefused`). Known by name, as above; its message holds nothing of it.
  if (error instanceof Error && error.name === 'PasswordRefused') return 'password-refused';
  // Not every RangeError: a stack overflow or a bad offset in a damaged file is the engine's failure, not memory.
  if (outOfMemory(error)) return 'memory';
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

  // What each library gave once loaded, by name: the fflate module's zipSync is taken from here.
  const loaded = new Map<LibraryName, unknown>();
  const loading = new Map<LibraryName, Promise<unknown>>();
  function load(name: LibraryName): Promise<unknown> {
    let started = loading.get(name);
    if (!started) {
      const loader = deps.libraries[name];
      started = (loader ? loader() : Promise.reject(new Error(`No loader for ${name}.`))).then((value) => {
        loaded.set(name, value);
        return value;
      });
      started.catch(() => {});
      loading.set(name, started);
    }
    return started;
  }
  /** Starts every library of `names`, in the one order, in one synchronous step, and waits for them all. */
  async function loadAll(names: readonly LibraryName[]): Promise<void> {
    const started = inOrder(names).map(load);
    try {
      await Promise.all(started);
    } catch {
      throw new EngineLoadError();
    }
  }

  // The pick set has settled once the thumbnail code has loaded or failed, or the reading set failed.
  // `prepared` is posted then, once for this worker.
  let settle: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  let postedPrepared = false;
  void settled.then(() => {
    postedPrepared = true;
    deps.post({ type: 'prepared', requestId: 0 });
  });
  const hold = deps.settleHoldMs ?? settleHoldMs;
  /** Waits until the set has settled, or `hold` has passed, whichever is first. */
  function settledOrHeld(): Promise<void> {
    if (postedPrepared) return Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([settled, new Promise<void>((resolve) => (timer = setTimeout(resolve, hold)))]).finally(() => clearTimeout(timer));
  }

  type Phase = 'read' | 'job';
  // By phase and tool: one page's worker serves one tool, but nothing of one tool is ever used for another.
  const readies = new Map<string, Promise<EngineModule>>();
  /**
   * Loads, for one phase, the engine, then every library its declared set names, in the one order, all before
   * any file is read. The read phase then starts the thumbnail code and does not wait for it. Memoised: every
   * message of the phase waits for the same step, so the files fetched are the same whatever the message.
   */
  function ready(phase: Phase, toolId: string): Promise<EngineModule> {
    let step = readies.get(`${phase} ${toolId}`);
    if (!step) {
      step = (async () => {
        let engine: EngineModule;
        try {
          engine = await engineFor(toolId);
          if (!engine.loads) throw new EngineLoadError();
          await loadAll(engine.loads[phase]);
        } catch (error) {
          if (phase === 'read') settle();
          throw error;
        }
        if (phase === 'read') {
          // Started now, after the reading set, so it does not share the connection with qpdf, and never waited for:
          // a missing PDF.js means blank boxes, as before, and the main button never waits for a thumbnail.
          void Promise.allSettled(inOrder(drawSet(engine)).map(load)).then(() => settle());
        }
        return engine;
      })();
      step.catch(() => {});
      readies.set(`${phase} ${toolId}`, step);
    }
    return step;
  }

  /**
   * The libraries an engine may reach in one step: the keys whose library the step allows, and the keys marked
   * `'always'`, which fetch nothing. Any other key is refused, fetches nothing, and marks the step, which then
   * fails as `engine-load` whatever the engine did with the refusal.
   */
  function gated(allowed: readonly LibraryName[]): { tools: EngineTools; refused: () => boolean } {
    let refused = false;
    const tools = new Proxy(deps.tools, {
      get(target, key) {
        // Not thenable: awaiting the tools themselves must not ask for a library called `then`.
        if (typeof key !== 'string' || key === 'then') return undefined;
        const library = libraryOf(key);
        const make = Object.hasOwn(target, key) ? target[key] : undefined;
        if (make && (library === 'always' || (library !== undefined && allowed.includes(library)))) return make;
        return () => {
          refused = true;
          return Promise.reject(new EngineLoadError());
        };
      },
    });
    return { tools, refused: () => refused };
  }

  // Thumbnails still waiting for the set, and those the page dropped. A dropped thumbnail is answered with no
  // picture at once and never opens its document, so a file that stalls PDF.js can never hold the next read.
  const waitingThumbnails = new Set<number>();
  const droppedThumbnails = new Set<number>();

  // At most one document is kept open, for drawing thumbnails of one file's pages.
  let kept: { key: string; doc: Promise<KeptDocument> } | null = null;
  // Messages are handled side by side, so every close goes on one chain, and whatever opens a
  // document, reads or runs waits for it: PDF.js must never open one while it tears another down.
  let closing: Promise<void> = Promise.resolve();
  function closeKept(): Promise<void> {
    const leaving = kept;
    kept = null;
    if (leaving) {
      closing = closing.then(async () => {
        try {
          await (await leaving.doc).close();
        } catch {
          // A document that never opened has nothing to close.
        }
      });
    }
    return closing;
  }

  return async function handle(data: unknown): Promise<void> {
    if (!isToWorker(data)) return;
    const { requestId } = data;
    if (data.type === 'close') {
      await closeKept();
      return;
    }
    if (data.type === 'prepare') {
      // The pick set and nothing else; a failure shows when a file is read.
      await ready('read', data.toolId).catch(() => {});
      return;
    }
    if (data.type === 'drop-thumbnail') {
      // Only a thumbnail still waiting is dropped. One already past the wait has posted `prepared` first, in the same
      // turn, so the page knows from the order of replies that the drop came too late.
      droppedThumbnails.add(requestId);
      if (waitingThumbnails.delete(requestId)) deps.post({ type: 'thumbnail', requestId, image: null });
      return;
    }
    if (data.type === 'thumbnail') {
      // A thumbnail never fails the tool: any problem gives no picture.
      let image: Uint8Array | null = null;
      waitingThumbnails.add(requestId);
      try {
        // The read set, then the thumbnail code, have settled before anything is opened.
        const engine = await ready('read', data.toolId).catch(() => undefined);
        await settled;
        if (droppedThumbnails.has(requestId)) return;
        waitingThumbnails.delete(requestId);
        if (engine && deps.openDocument) {
          const { tools, refused } = gated([...engine.loads.read, ...drawSet(engine)]);
          if (kept?.key !== data.documentKey) {
            // The engine's `thumbnails` says how its files are drawn. The page asks for one thumbnail at a time, so no
            // second request lands between closing the last document and keeping the new one.
            await closeKept();
            const opening = deps.openDocument(await bytesOf(data.file), data.password, tools, engine.thumbnails);
            kept = { key: data.documentKey, doc: opening };
            // A file that cannot be opened is not kept, so it is tried afresh if asked for again.
            opening.catch(() => {
              if (kept?.doc === opening) kept = null;
            });
          }
          const current = kept;
          if (current) image = await (await current.doc).render(data.page, data.box);
          if (refused()) image = null;
        }
      } catch {
        image = null;
      } finally {
        waitingThumbnails.delete(requestId);
      }
      if (!image) {
        deps.post({ type: 'thumbnail', requestId, image: null });
        return;
      }
      const moved = ownBuffers([image]);
      deps.post({ type: 'thumbnail', requestId, image: moved.outputs[0]! }, moved.transfer);
      return;
    }
    const phase = data.type === 'run' ? 'job' : 'read';
    try {
      // Every library of the phase is loaded before any file is touched, whatever the file or how the step ends.
      const engine = await ready(phase, data.toolId);
      // A job or a read never runs beside a kept copy of a file.
      await closeKept();
      const { tools, refused } = gated(engine.loads[phase]);
      const checked = <T>(value: T): T => {
        if (refused()) throw new EngineLoadError();
        return value;
      };
      // A refused library fails the step as engine-load even when the engine caught the refusal and threw something else.
      const guarded = async <T>(step: () => Promise<T>): Promise<T> => {
        try {
          return checked(await step());
        } catch (error) {
          throw refused() ? new EngineLoadError() : error;
        }
      };
      if (data.type === 'inspect-picture') {
        // A tool with no picture reader calls every picture damaged, so nothing unread is ever called ready.
        const inspectPicture = engine.inspectPicture;
        const outcome = inspectPicture ? await guarded(async () => inspectPicture(data.key, await bytesOf(data.file), tools)) : { kind: 'damaged' as const };
        deps.post({ type: 'picture-inspected', requestId, outcome });
        return;
      }
      if (data.type === 'inspect') {
        if (!engine.inspect) {
          deps.post({ type: 'inspected', requestId, outcome: { kind: 'ready', pages: 0 } });
          return;
        }
        const inspect = engine.inspect;
        const outcome = await guarded(async () => inspect(await bytesOf(data.file), data.password, tools));
        deps.post({ type: 'inspected', requestId, outcome });
        return;
      }
      // The zip step comes from the fflate library, loaded with the job's set; a zip run without it is a mistake.
      const zipSync = data.zip ? (loaded.get('fflate') as { zipSync?: ZipSync } | undefined)?.zipSync : undefined;
      if (data.zip && !zipSync) throw new EngineLoadError();
      const files: Uint8Array[] = [];
      for (const file of data.files) files.push(await bytesOf(file));
      // Each picture's bytes, under its option's key, beside the page's options; the passwords last, so no key replaces them.
      const pictureBytes: Record<string, Uint8Array> = {};
      for (const [key, picture] of Object.entries(data.pictures ?? {})) pictureBytes[key] = await bytesOf(picture);
      let outputs: Uint8Array[];
      try {
        outputs = await engine.run(
          files,
          { ...data.options, ...pictureBytes, passwords: data.passwords },
          (progress) => deps.post({ type: 'progress', requestId, progress }),
          tools,
        );
      } catch (error) {
        throw refused() ? new EngineLoadError() : error;
      }
      checked(outputs);
      // The worker's copies of the inputs are dropped here; only the results go back, moved, not copied.
      files.length = 0;
      const zip = data.zip;
      if (outputs.length > 1 && zip && zipSync) {
        const total = outputs.length;
        // The engine has finished; say the files are being put together, so the line does not sit on the last file.
        deps.post({ type: 'progress', requestId, progress: { stage: 'writing', percent: 100 } });
        const entries: Record<string, Uint8Array> = {};
        outputs.forEach((output, index) => {
          entries[partName(zip.stem, zip.partSuffix, index + 1, total, zip.extension ?? 'pdf')] = output;
        });
        // zipSync writes no ZIP64 and does not check: past its limits it would write a broken zip.
        const fit = fitsInOneZip(Object.keys(entries), outputs.map((output) => output.byteLength));
        if (!fit.fits) throw new TooBigForZip(fit.reason);
        // PDFs, JPGs and PNGs are already compressed, so the files are stored, which is fast and keeps memory low.
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
      // A reading failure is posted only once the pick set has settled (held to a limit), so the page never ends a
      // worker for it while the set's files are still arriving.
      if (phase === 'read') await settledOrHeld();
      deps.post({ type: 'failed', requestId, kind: failureKind(error) });
    }
  };
}
