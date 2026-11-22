// The contract every engine keeps. Engines are pure: they take bytes and give
// bytes, never fetch, and never touch the page. What they need from outside,
// such as a PDF library that has to be loaded, comes in through `tools`.

/**
 * How far a job has got, in real units. A reading of `done: 0, total: 1` says one
 * file is being read, before the work starts (Compress PDF's "Reading the file").
 */
export type Progress =
  | {
      stage: 'reading' | 'working';
      unit: 'file' | 'page' | 'picture';
      done: number;
      total: number;
      /**
       * Set by an engine that writes a file after counting pages (Add page numbers), so the count
       * fills the bar to 0.8 only, as pictures do, and the last fifth is left for writing.
       */
      writesAfter?: true;
    }
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

/**
 * What reading a picture chosen for an option tells the page (`pictureOutcome` in picture.ts): ready, with
 * its pixels as stored (width × height), damaged, or saved in a way the tool cannot read. Nothing else.
 */
export type PictureOutcome = { kind: 'ready'; pixels: number } | { kind: 'damaged' } | { kind: 'unsupported' };

/**
 * A library the worker can load for an engine, by name. Each covers one or more keys of `tools`
 * (`toolLibrary` in src/workers/libraries.ts): `'pdfjs'` is PDF.js, its worker, its helper data and the
 * thumbnail step; `'pictureThumbnail'` is the picture thumbnail step. Defined here, beside the engines,
 * because engines must not import worker code.
 */
export type LibraryName = 'qpdf' | 'fflate' | 'pdflib' | 'pdfjs' | 'pictureThumbnail';

/** What a file in src/engines/tools/ exports. Its name is the tool's id. */
export type EngineModule = {
  run: Engine<Record<string, unknown>>;
  /**
   * The libraries this engine's reading (`inspect` and `inspectPicture`) and its job (`run`) may use.
   * Chosen by tool, never by a file: the worker loads the whole set for a step before it reads any file,
   * whatever the file holds or how the step ends, so which of the site's files a page fetches says nothing
   * about the file. A step that asks for a library outside its set fails as `engine-load`. The thumbnail
   * code is not listed: it follows from `thumbnails` (`drawSet` in src/workers/libraries.ts).
   */
  loads: { read: readonly LibraryName[]; job: readonly LibraryName[] };
  inspect?: Inspector;
  /**
   * How the worker draws this tool's thumbnails. Left out, a file is a PDF drawn by PDF.js;
   * `'picture'`, a JPG or PNG drawn by the browser's own image decoder (Image to PDF).
   * Chosen by tool, never by a file's bytes, so a PDF tool never hands a file to the image decoder.
   */
  thumbnails?: 'picture';
  /**
   * Reads a picture chosen for one of the tool's picture options, by its key, before the job: one line,
   * `pictureOutcome` with the tool's rule. Every tool with a picture option exports it (the registry test);
   * the worker answers `damaged` for a tool without one, so nothing unread is ever called ready.
   */
  inspectPicture?: (key: string, bytes: Uint8Array, tools: EngineTools) => Promise<PictureOutcome>;
};
