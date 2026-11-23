// The first qpdf of a worker is made while the step's libraries load, so qpdf's WebAssembly is asked for at
// that fixed point, before any file is read, and not after a file has been copied into the worker. The
// instance is kept unused as a spare and handed to the first `tools.qpdf()` call, so every engine call still
// gets a qpdf that has never run. Every later call makes a new one, as before. A plain function, tested in Node.

export type SpareQpdf<T> = {
  /** Makes the spare, once per worker, and waits until it is ready. A second call makes nothing. */
  load(): Promise<void>;
  /** The spare if there is one, cleared so it is never handed out twice; otherwise a new instance. */
  take(): Promise<T>;
};

export function createSpareQpdf<T>(make: () => Promise<T>): SpareQpdf<T> {
  let spare: Promise<T> | null = null;
  let loaded: Promise<void> | null = null;
  return {
    load() {
      loaded ??= (() => {
        const made = make();
        spare = made;
        return made.then(() => undefined);
      })();
      return loaded;
    },
    take() {
      const given = spare;
      spare = null;
      return given ?? make();
    },
  };
}
