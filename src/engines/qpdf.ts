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
  const lines = { out: '', err: '' };
  let out = '';
  let printed = '';
  const qpdf: Qpdf = {
    onLine: null,
    mkdir: (path) => module.FS.mkdir(path),
    write: (path, data) => module.FS.writeFile(path, data),
    read: (path) => module.FS.readFile(path),
    call(args) {
      out = '';
      printed = '';
      lines.out = '';
      lines.err = '';
      let code: number;
      try {
        code = module.callMain(args);
      } catch (error) {
        // qpdf leaves through exit(), which Emscripten may throw as an exit status.
        const status = (error as { status?: unknown }).status;
        if (typeof status !== 'number') throw error;
        code = status;
      }
      if (lines.out) take('out');
      if (lines.err) take('err');
      return { code, out, printed };
    },
  };

  function take(stream: 'out' | 'err') {
    const line = lines[stream];
    lines[stream] = '';
    if (stream === 'out') out += `${line}\n`;
    printed += `${line}\n`;
    qpdf.onLine?.(line);
  }
  const capture = (stream: 'out' | 'err') => (code: number | null) => {
    if (code === null) return;
    if (code === 10) take(stream);
    else lines[stream] += String.fromCharCode(code);
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
