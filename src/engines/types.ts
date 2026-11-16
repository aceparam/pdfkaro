// The contract every engine keeps. Engines are pure: they take bytes and give
// bytes, never fetch, and never touch the page. What they need from outside,
// such as a PDF library that has to be loaded, comes in through `tools`.

/**
 * How far a job has got, in real units. A reading of `done: 0, total: 1` says one
 * file is being read, before the work starts (Compress PDF's "Reading the file").
 */
export type Progress =
  | { stage: 'reading' | 'working'; unit: 'file' | 'page' | 'picture'; done: number; total: number }
  | { stage: 'writing'; percent: number };

/**
 * Libraries an engine may ask for. Each is loaded only when first asked for.
 * The worker fills this in; a Node test fills it in from files on disk.
 * Each tool's change adds the library it needs.
 */
export type EngineTools = Record<string, () => Promise<unknown>>;

/**
 * Turns input files into output files. An engine may give no files, meaning the
 * input could not be improved; only a tool whose words say what that means
 * (`noSmaller` in the registry) may do so. For any other tool the page treats
 * no files as the engine's failure.
 */
export type Engine<Options = Record<string, never>> = (
  files: Uint8Array[],
  options: Options,
  onProgress: (progress: Progress) => void,
  tools: EngineTools,
) => Promise<Uint8Array[]>;

/** What reading one file before a job tells the page. */
export type InspectOutcome =
  /** `pixels` is given only for a picture so large that the page warns about it (Image to PDF). */
  | { kind: 'ready'; pages: number; pixels?: number }
  | { kind: 'needs-password' }
  | { kind: 'wrong-password' }
  | { kind: 'damaged' }
  /** Not damaged, but saved in a way the tool cannot read, such as a JPG with arithmetic coding. */
  | { kind: 'unsupported' };

/** Reads one file before a job, so the page can show its page count or a problem. */
export type Inspector = (file: Uint8Array, password: string | undefined, tools: EngineTools) => Promise<InspectOutcome>;

/** What a file in src/engines/tools/ exports. Its name is the tool's id. */
export type EngineModule = {
  run: Engine<Record<string, unknown>>;
  inspect?: Inspector;
  /**
   * How the worker draws this tool's thumbnails. Left out, a file is a PDF drawn by PDF.js;
   * `'picture'`, a JPG or PNG drawn by the browser's own image decoder (Image to PDF).
   * Chosen by tool, never by a file's bytes, so a PDF tool never hands a file to the image decoder.
   */
  thumbnails?: 'picture';
};
