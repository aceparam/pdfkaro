// The contract every engine keeps. Engines are pure: they take bytes and give
// bytes, never fetch, and never touch the page. What they need from outside,
// such as a PDF library that has to be loaded, comes in through `tools`.

/** How far a job has got, in real units. */
export type Progress =
  | { stage: 'reading' | 'working'; unit: 'file' | 'page'; done: number; total: number }
  | { stage: 'writing'; percent: number };

/**
 * Libraries an engine may ask for. Each is loaded only when first asked for.
 * The worker fills this in; a Node test fills it in from files on disk.
 * Each tool's change adds the library it needs.
 */
export type EngineTools = Record<string, () => Promise<unknown>>;

/** Turns input files into output files. */
export type Engine<Options = Record<string, never>> = (
  files: Uint8Array[],
  options: Options,
  onProgress: (progress: Progress) => void,
  tools: EngineTools,
) => Promise<Uint8Array[]>;

/** What reading one file before a job tells the page. */
export type InspectOutcome =
  | { kind: 'ready'; pages: number }
  | { kind: 'needs-password' }
  | { kind: 'wrong-password' }
  | { kind: 'damaged' };

/** Reads one file before a job, so the page can show its page count or a problem. */
export type Inspector = (file: Uint8Array, password: string | undefined, tools: EngineTools) => Promise<InspectOutcome>;

/** What a file in src/engines/tools/ exports. Its name is the tool's id. */
export type EngineModule = {
  run: Engine<Record<string, unknown>>;
  inspect?: Inspector;
};
