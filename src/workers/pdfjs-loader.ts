// Starts PDF.js once for the tool worker, with PDF.js's own worker nested in
// it, and stops every thumbnail at once if that nested worker fails. Kept apart
// from the worker's globals so that it can be tested in Node.

/** The parts of a nested Worker this uses. */
export type NestedWorker = {
  onerror: ((event: { preventDefault(): void }) => void) | null;
  terminate(): void;
  addEventListener(type: 'message', listener: () => void): void;
  removeEventListener(type: 'message', listener: () => void): void;
};

export type PdfjsLoader = {
  /** PDF.js, ready to open documents. Rejects at once after PDF.js has failed. */
  load(): Promise<unknown>;
  /** Races a drawing against PDF.js failing, so a drawing in progress stops when it does. */
  guard<T>(drawing: Promise<T>): Promise<T>;
};

export function createPdfjsLoader(
  importPdfjs: () => Promise<{ GlobalWorkerOptions: { workerPort: unknown } }>,
  startWorker: () => NestedWorker,
): PdfjsLoader {
  let loading: Promise<unknown> | null = null;
  let failed = false;
  let stop: (reason: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    stop = reject;
  });
  stopped.catch(() => {});

  return {
    load() {
      if (failed) return Promise.reject(new Error('PDF.js is unavailable in this worker.'));
      // PDF.js's own worker starts in the same step as the PDF.js import, not after it resolves: its request
      // must not wait on this worker's event loop, which a long qpdf call holds, so its timing never follows a
      // file. It is guarded from its first moment, ended if the import fails, and handed over once PDF.js is here.
      loading ??= (() => {
        const imported = importPdfjs();
        let port: NestedWorker;
        try {
          port = startWorker();
        } catch (error) {
          imported.catch(() => {});
          failed = true;
          return Promise.reject(error instanceof Error ? error : new Error('PDF.js could not start.'));
        }
        // PDF.js's worker posts "ready" once its script has loaded, unasked, and PDF.js ignores that message for a
        // worker it is given. PDF.js counts as loaded only then: otherwise a pick that draws nothing (a damaged file,
        // one of the wrong kind) could settle and end the tool worker before that script was even asked for, so the
        // host would see it for some files only. The listener takes nothing from PDF.js, which listens on its own.
        let markStarted: () => void = () => {};
        let markFailed: (reason: Error) => void = () => {};
        const started = new Promise<void>((resolve, reject) => {
          markStarted = resolve;
          markFailed = reject;
        });
        started.catch(() => {});
        const onFirstMessage = () => {
          port.removeEventListener('message', onFirstMessage);
          markStarted();
        };
        port.addEventListener('message', onFirstMessage);
        port.onerror = (event) => {
          // Keep PDF.js's errors inside the tool worker; the page sees only a missing picture.
          event.preventDefault();
          failed = true;
          const reason = new Error('PDF.js stopped.');
          markFailed(reason);
          stop(reason);
        };
        return Promise.all([imported, started]).then(
          ([pdfjs]) => {
            if (failed) throw new Error('PDF.js is unavailable in this worker.');
            pdfjs.GlobalWorkerOptions.workerPort = port;
            return pdfjs;
          },
          (error: unknown) => {
            port.terminate();
            throw error;
          },
        );
      })();
      return loading;
    },
    guard: (drawing) => Promise.race([drawing, stopped]),
  };
}
