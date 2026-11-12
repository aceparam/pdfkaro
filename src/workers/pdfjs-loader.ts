// Starts PDF.js once for the tool worker, with PDF.js's own worker nested in
// it, and stops every thumbnail at once if that nested worker fails. Kept apart
// from the worker's globals so that it can be tested in Node.

/** The parts of a nested Worker this uses. */
export type NestedWorker = { onerror: ((event: { preventDefault(): void }) => void) | null };

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
      loading ??= (async () => {
        const pdfjs = await importPdfjs();
        const port = startWorker();
        port.onerror = (event) => {
          // Keep PDF.js's errors inside the tool worker; the page sees only a missing picture.
          event.preventDefault();
          failed = true;
          stop(new Error('PDF.js stopped.'));
        };
        pdfjs.GlobalWorkerOptions.workerPort = port;
        return pdfjs;
      })();
      return loading;
    },
    guard: (drawing) => Promise.race([drawing, stopped]),
  };
}
