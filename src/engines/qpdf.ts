// A thin wrapper around qpdf compiled to WebAssembly. It runs qpdf like a
// command, on files kept in qpdf's own memory, and catches what qpdf prints so
// that nothing reaches the console. No page, no network: the caller says where
// the WebAssembly file is, and the worker or a Node test passes that in.

import type { EngineTools } from './types';

/** The parts of the Emscripten module that are used here. */
type QpdfModule = {
  callMain(args: string[]): number;
  FS: {
    init(input: null, output: (code: number | null) => void, error: (code: number | null) => void): void;
    mkdir(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    stat(path: string): { size: number };
    open(path: string, flags: string): { node?: Record<string, unknown> };
    write(stream: unknown, buffer: Uint8Array, offset: number, length: number): number;
    close(stream: unknown): void;
  };
};

type QpdfFactory = (options: Record<string, unknown>) => Promise<QpdfModule>;

/** One run of qpdf. A fresh one is made for each engine call, so a crash or used memory never carries over. */
export type Qpdf = {
  /** Makes a folder in qpdf's memory. */
  mkdir(path: string): void;
  /** Writes a file into qpdf's memory. Paths are made up by the engine, never taken from a file name. */
  write(path: string, data: Uint8Array): void;
  read(path: string): Uint8Array;
  /**
   * Adds bytes to the end of a file in qpdf's memory, making it if it is not there, so a large
   * file can be written in pieces and each piece let go once it is in (the drawing step's update).
   */
  append(path: string, data: Uint8Array): void;
  /** Removes a file from qpdf's memory, so a step that has read it does not keep it twice. */
  remove(path: string): void;
  /** A file's length in bytes, read without reading the file. */
  size(path: string): number;
  /**
   * Makes an empty file at `path` that refuses any write past `limit` bytes, so
   * qpdf, writing to it, fails as soon as it passes the limit and never fills
   * memory with more. Gives false when this build of qpdf does not let the file
   * be capped; the caller then still checks the size afterwards.
   */
  capFile(path: string, limit: number): boolean;
  /**
   * Whether a file made by `capFile` has refused a write. qpdf does not always say so: writing
   * object streams, it can finish with exit 0 and leave the file cut off at the cap.
   */
  refused(path: string): boolean;
  /**
   * Runs qpdf with these arguments. Gives its exit code, what it wrote as its
   * answer (`out`, standard output) and everything it printed (`printed`,
   * standard output and its warnings and errors together).
   */
  call(args: string[]): { code: number; out: string; printed: string };
  /** Called with each line qpdf prints while it runs, such as write progress. */
  onLine: ((line: string) => void) | null;
};

/** Exit codes that mean qpdf finished: 0, or 3 when it finished with warnings. */
export const finished = (code: number) => code === 0 || code === 3;

/**
 * Makes a fresh qpdf. `load` brings in the Emscripten factory (late, so the
 * script is fetched only when needed); `wasm` is the address or path of
 * `qpdf.wasm`.
 */
export async function createQpdf(load: () => Promise<unknown>, wasm: string): Promise<Qpdf> {
  const loaded = (await load()) as { default?: QpdfFactory } | QpdfFactory;
  const factory = (typeof loaded === 'function' ? loaded : loaded.default) as QpdfFactory;

  // One line in progress for each stream, so a warning never runs into an answer.
  // qpdf writes UTF-8 (its JSON holds document text, such as bookmark titles),
  // so the bytes of a line are kept and decoded whole.
  const lines: Record<'out' | 'err', number[]> = { out: [], err: [] };
  const utf8 = new TextDecoder();
  let out = '';
  let printed = '';
  // The capped files that have refused a write.
  const refusals = new Set<string>();
  const qpdf: Qpdf = {
    onLine: null,
    mkdir: (path) => module.FS.mkdir(path),
    write: (path, data) => module.FS.writeFile(path, data),
    read: (path) => module.FS.readFile(path),
    append(path, data) {
      const stream = module.FS.open(path, 'a');
      try {
        let written = 0;
        while (written < data.length) {
          const step = module.FS.write(stream, data, written, data.length - written);
          if (!(step > 0)) throw new Error('A file in qpdf’s memory could not be written.');
          written += step;
        }
      } finally {
        module.FS.close(stream);
      }
    },
    remove: (path) => module.FS.unlink(path),
    size: (path) => module.FS.stat(path).size,
    refused: (path) => refusals.has(path),
    capFile(path, limit) {
      refusals.delete(path);
      module.FS.writeFile(path, new Uint8Array(0));
      // The file system's names are shortened in this build, so its parts are found by what they do:
      // the error a missing file throws, and the file's own table of read and write steps.
      let ErrnoError: (new (errno: number) => Error) | undefined;
      try {
        module.FS.stat('/no such file here');
      } catch (error) {
        ErrnoError = (error as { constructor: new (errno: number) => Error }).constructor;
      }
      const stream = module.FS.open(path, 'r');
      const node = stream.node;
      module.FS.close(stream);
      if (!node || !ErrnoError) return false;
      type Write = (stream: unknown, buffer: unknown, offset: number, length: number, position: number, canOwn?: boolean) => number;
      const key = Object.keys(node).find((name) => {
        const ops = node[name] as Record<string, unknown> | null;
        return typeof ops === 'object' && ops !== null && typeof ops.write === 'function' && typeof ops.read === 'function';
      });
      if (!key) return false;
      const ops = node[key] as Record<string, unknown> & { write: Write };
      const Refusal = ErrnoError;
      // ENOSPC: no space left. Each file has its own copy of the table, so other files are untouched.
      node[key] = {
        ...ops,
        write(stream: unknown, buffer: unknown, offset: number, length: number, position: number, canOwn?: boolean) {
          if (position + length > limit) {
            refusals.add(path);
            throw new Refusal(51);
          }
          return ops.write(stream, buffer, offset, length, position, canOwn);
        },
      };
      return true;
    },
    call(args) {
      out = '';
      printed = '';
      lines.out = [];
      lines.err = [];
      let code: number;
      try {
        code = module.callMain(args);
      } catch (error) {
        // qpdf leaves through exit(), which Emscripten may throw as an exit status.
        const status = (error as { status?: unknown }).status;
        if (typeof status !== 'number') throw error;
        code = status;
      }
      if (lines.out.length) take('out');
      if (lines.err.length) take('err');
      return { code, out, printed };
    },
  };

  function take(stream: 'out' | 'err') {
    const line = utf8.decode(new Uint8Array(lines[stream]));
    lines[stream] = [];
    if (stream === 'out') out += `${line}\n`;
    printed += `${line}\n`;
    qpdf.onLine?.(line);
  }
  const capture = (stream: 'out' | 'err') => (code: number | null) => {
    if (code === null) return;
    if (code === 10) take(stream);
    // Emscripten gives bytes as signed or unsigned numbers depending on the stream.
    else lines[stream].push(code & 0xff);
  };

  const module = await factory({
    locateFile: () => wasm,
    noInitialRun: true,
    // Emscripten's own notices, such as an abort, go nowhere rather than to the console.
    print: () => {},
    printErr: () => {},
    preRun: [(m: QpdfModule) => m.FS.init(null, capture('out'), capture('err'))],
  });
  return qpdf;
}

/** Takes qpdf from the tools the worker or a test passes in. */
export async function qpdfFrom(tools: EngineTools): Promise<Qpdf> {
  const make = tools.qpdf;
  if (!make) throw new Error('qpdf was not given to this engine.');
  return (await make()) as Qpdf;
}

/** Whether qpdf said the password was missing or wrong. */
export const saidInvalidPassword = (printed: string) => /invalid password/i.test(printed);
