// Draws the pages of a PDF: as small pictures, for the thumbnails in the list
// of files, and whole, as JPG or PNG pictures (PDF to JPG and PDF to PNG).
// Shared by every tool, like inspect.ts. It keeps the engine rules: PDF.js, a
// canvas maker, PDF.js's helper data and the guard against a stopped PDF.js
// worker all come in through `tools`, so it uses no page and makes no request,
// and a Node test can run it. PDF.js itself is never imported here, not even
// for its constants: they are read from the module `tools` gives.

import type { EngineTools } from './types';

/** A canvas and its 2D context, whatever kind of canvas the caller makes. */
type CanvasAndContext = { canvas: unknown; context: unknown };

/** How the worker (OffscreenCanvas) or a Node test makes canvases and encodes them. */
export type CanvasMaker = {
  create(width: number, height: number): CanvasAndContext;
  resize(canvas: unknown, width: number, height: number): void;
  release(canvas: unknown): void;
  /** Encodes the canvas as PNG bytes. */
  png(canvas: unknown): Promise<Uint8Array>;
  /** Encodes the canvas as JPG bytes at `quality`, from 0 to 1. The worker's maker has it; a tool that saves JPGs needs it. */
  jpeg?(canvas: unknown, quality: number): Promise<Uint8Array>;
};

/** A canvas maker that can encode JPGs, as the worker gives it (Compress PDF, PDF to JPG). */
export type JpegCanvasMaker = CanvasMaker & { jpeg(canvas: unknown, quality: number): Promise<Uint8Array> };

/** Races a drawing against PDF.js's own worker stopping, so a drawing in progress fails when it does. */
export type PdfjsGuard = <T>(drawing: Promise<T>) => Promise<T>;

/** PDF.js's helper data from memory, the same fixed set for every file. */
export type HelperData = {
  font(name: string): Uint8Array | undefined;
  decoder(name: string): Uint8Array | undefined;
};

/** The parts of PDF.js used here. Exported for the tests' stand-ins. */
export type PdfjsModule = {
  getDocument(options: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(page: number): Promise<{
        getViewport(options: { scale: number }): { width: number; height: number };
        render(options: Record<string, unknown>): { promise: Promise<void> };
        /** Lets go of the page's decoded pictures and drawing steps once nothing is drawing it. */
        cleanup(): boolean;
      }>;
    }>;
    destroy(): Promise<void>;
  };
  /** How annotations are drawn. Read from the loaded module, never imported, so PDF.js stays out of every engine's file. */
  AnnotationMode: { ENABLE: number; ENABLE_STORAGE: number };
};

/**
 * The largest image inside a PDF that is decoded, and the largest picture of a whole page
 * that is drawn, in pixels: Safari's canvas limit. 4096 by 4096 for a square page.
 */
export const maxImagePixels = 16 * 1024 * 1024;

/** The live canvases one drawing may hold at once, PDF.js's own included, as a multiple of its largest picture. */
export const canvasBudgetPages = 4;

/** The options passed to PDF.js, apart from the file and the factories. Exported for the unit test. */
export const safeOptions = {
  enableXfa: false,
  // Glyphs are drawn as shapes, so no font is installed in the browser.
  disableFontFace: true,
  useSystemFonts: false,
  // PDF.js asks our factory for its helper data instead of fetching it.
  useWorkerFetch: false,
  // No address to fetch from: character maps, fonts and colour profiles have
  // none. A decoder's JavaScript fallback is loaded from wasmUrl outside the
  // factory, so wasmUrl is an address that is not on the network, which makes
  // that load fail inside the browser. PDF.js needs it to end in "/".
  wasmUrl: 'data:,/',
  maxImageSize: maxImagePixels,
  // No warning that might name a font from the file reaches the console.
  verbosity: 0,
} as const;

async function need<T>(tools: EngineTools, name: string): Promise<T> {
  const make = tools[name];
  if (!make) throw new Error(`${name} was not given to the thumbnail.`);
  return (await make()) as T;
}

/** How to draw a whole page: at `scale` (1 is 72 pixels to the inch), at most `maxPixels`, as JPG or PNG. */
export type DrawOptions = { scale: number; maxPixels: number; format: 'jpg' | 'png'; quality?: number };

/** A drawn page: the picture's bytes and its size in pixels. */
export type Drawn = { bytes: Uint8Array; width: number; height: number };

/** An open PDF, kept so that several pages can be drawn without reading the file again. */
export type OpenDocument = {
  pages: number;
  /** Draws page `page` (1-based) to fit inside `box`, keeping its shape, as PNG bytes. */
  render(page: number, box: { width: number; height: number }): Promise<Uint8Array>;
  /**
   * Draws page `page` (1-based) whole, as it shows in a PDF reader: turned by its `/Rotate`, on white,
   * with form fields drawn with their values and other annotations as their appearances show them.
   */
  draw(page: number, options: DrawOptions): Promise<Drawn>;
  /** Closes the document and lets go of its copy of the file. Safe to call twice. */
  close(): Promise<void>;
};

/**
 * The picture's size for a page whose viewport at the asked scale is `width` by `height`:
 * scaled down, keeping its shape, to at most `maxPixels`, each side whole and at least 1.
 * Exported for the unit test.
 */
export function pictureSize(width: number, height: number, maxPixels: number): { width: number; height: number; shrink: number } {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error('The page has no size.');
  const shrink = width * height > maxPixels ? Math.sqrt(maxPixels / (width * height)) : 1;
  let w = Math.max(1, Math.round(width * shrink));
  let h = Math.max(1, Math.round(height * shrink));
  // Rounding both sides up can pass the cap by a few pixels; rounding down never does, short of a side of 1.
  if (w * h > maxPixels) {
    w = Math.max(1, Math.floor(width * shrink));
    h = Math.max(1, Math.floor(height * shrink));
  }
  // A page so thin that its narrow side is held at 1: the long side gives way, so the shape is not kept. Intended:
  // the cap matters more than the shape of a page no reader could show.
  if (w * h > maxPixels) {
    if (w === 1) h = maxPixels;
    else w = maxPixels;
  }
  return { width: w, height: h, shrink };
}

/** Thrown when one drawing would hold more canvas than its budget. Exported for the unit test. */
export class CanvasBudgetError extends Error {
  override name = 'CanvasBudgetError';
  constructor() {
    super('The page needs more canvas than one drawing may hold.');
  }
}

/** Counts the pixels of every live canvas of one document, and refuses past the limit of the drawing in progress. */
function canvasBudget() {
  const live = new Map<unknown, number>();
  let total = 0;
  let limit = canvasBudgetPages * maxImagePixels;
  const settle = (canvas: unknown, pixels: number) => {
    const before = live.get(canvas) ?? 0;
    if (total - before + pixels > limit) throw new CanvasBudgetError();
    total += pixels - before;
    live.set(canvas, pixels);
  };
  return {
    /** Sets the limit for the drawing about to start, from its largest picture. */
    limitTo(maxPixels: number) {
      limit = canvasBudgetPages * maxPixels;
    },
    /** Counts a canvas made or resized; throws, counting nothing, if that would pass the limit. */
    take: settle,
    /** Lets go of a canvas. */
    give(canvas: unknown) {
      total -= live.get(canvas) ?? 0;
      live.delete(canvas);
    },
    /**
     * Forgets every canvas counted, once a drawing has settled. PDF.js does not destroy every canvas it
     * makes: it empties its cache of image masks at the end of a drawing without telling the factory, and
     * a drawing that fails part way leaves its temporary canvases behind. None of them is drawn on again.
     */
    forgetAll() {
      live.clear();
      total = 0;
    },
    /** The pixels counted, given back for a canvas whose resize failed. */
    pixelsOf(canvas: unknown) {
      return live.get(canvas);
    },
    get total() {
      return total;
    },
  };
}

/**
 * Opens a PDF for drawing. `file` is handed to PDF.js, which takes it over:
 * the caller must not use it after. Close the result when done with it.
 */
export async function openDocument(file: Uint8Array, password: string | undefined, tools: EngineTools): Promise<OpenDocument> {
  // The guard is given by the worker; a Node test may leave it out, and then nothing is raced.
  const guard: PdfjsGuard = tools.pdfjsGuard ? await need<PdfjsGuard>(tools, 'pdfjsGuard') : (drawing) => drawing;
  const pdfjs = await need<PdfjsModule>(tools, 'pdfjs');
  const canvases = await need<CanvasMaker>(tools, 'canvas');
  const data = await need<HelperData>(tools, 'pdfjsData');
  // Every live canvas of this document, PDF.js's own temporary ones for transparency and soft masks
  // included, and each drawing's own picture: so one page can never take gigabytes.
  const budget = canvasBudget();

  // PDF.js makes these with `new`, with options it chooses; ours ignore them.
  class CanvasFactory {
    create(width: number, height: number) {
      if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
      const pixels = width * height;
      // Counted under a key of its own first, so a refusal makes no canvas at all.
      const key = {};
      budget.take(key, pixels);
      try {
        const pair = canvases.create(width, height);
        budget.give(key);
        budget.take(pair.canvas, pixels);
        return pair;
      } catch (error) {
        budget.give(key);
        throw error;
      }
    }
    reset(pair: CanvasAndContext, width: number, height: number) {
      if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
      const before = budget.pixelsOf(pair.canvas);
      budget.take(pair.canvas, width * height);
      try {
        canvases.resize(pair.canvas, width, height);
      } catch (error) {
        // The canvas keeps its old size, so it keeps its old count.
        if (before === undefined) budget.give(pair.canvas);
        else budget.take(pair.canvas, before);
        throw error;
      }
    }
    destroy(pair: CanvasAndContext) {
      canvases.release(pair.canvas);
      budget.give(pair.canvas);
      pair.canvas = null;
      pair.context = null;
    }
    getNoAlphaContext(canvas: { getContext(kind: '2d', options: object): unknown }) {
      return canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    }
  }

  // Filters serve a few rare effects; a thumbnail does without them.
  class FilterFactory {
    addFilter() {
      return 'none';
    }
    addHCMFilter() {
      return 'none';
    }
    addAlphaFilter() {
      return 'none';
    }
    addLuminosityFilter() {
      return 'none';
    }
    addKnockoutFilter() {
      return 'none';
    }
    addHighlightHCMFilter() {
      return 'none';
    }
    addSelectionHCMFilter() {
      return 'none';
    }
    addSelectionFilter() {
      return 'none';
    }
    createSelectionStyle() {
      return null;
    }
    destroy() {}
  }

  // Fonts and decoders from the fixed set in memory. Character maps are never
  // shipped; PDF.js leaves such text out when this refuses one.
  class BinaryDataFactory {
    async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
      const found = kind === 'standardFontDataUrl' ? data.font(filename) : kind === 'wasmUrl' ? data.decoder(filename) : undefined;
      if (!found) throw new Error(`No ${kind} data for this file.`);
      return found;
    }
  }

  const task = pdfjs.getDocument({
    ...safeOptions,
    // PDF.js takes ownership of these bytes. They are the worker's own copy, read for this call, so no further copy is made.
    data: file,
    password,
    CanvasFactory,
    FilterFactory,
    BinaryDataFactory,
  });
  let closed = false;
  // Closing waits for PDF.js's worker to answer, so it is raced too: a stopped worker never answers.
  const close = async () => {
    if (closed) return;
    closed = true;
    await guard(task.destroy());
  };
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await guard(task.promise);
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }

  /** The page, after the checks every drawing makes. */
  const pageOf = async (page: number) => {
    if (closed) throw new Error('The document is closed.');
    if (!Number.isInteger(page) || page < 1 || page > doc.numPages) throw new Error('No such page.');
    return guard(doc.getPage(page));
  };

  async function drawPage(
    pdfPage: Awaited<ReturnType<typeof pageOf>>,
    scale: number,
    { maxPixels, format, quality, annotationMode }: Omit<DrawOptions, 'scale'> & { annotationMode: number },
  ): Promise<Drawn> {
    if (!Number.isInteger(maxPixels) || maxPixels < 1) throw new Error('The picture has no size.');
    const asked = pdfPage.getViewport({ scale });
    const size = pictureSize(asked.width, asked.height, maxPixels);
    // The viewport at the final scale, so the page fills the picture; it carries the page's /Rotate.
    const viewport = size.shrink === 1 ? asked : pdfPage.getViewport({ scale: scale * size.shrink });
    budget.limitTo(maxPixels);
    // The picture's own canvas is counted under a key of its own, from before it is made.
    const own = {};
    let made: CanvasAndContext | undefined;
    try {
      budget.take(own, size.width * size.height);
      made = canvases.create(size.width, size.height);
      await guard(pdfPage.render({ canvas: made.canvas, canvasContext: made.context, viewport, background: '#ffffff', annotationMode }).promise);
      let bytes: Uint8Array;
      if (format === 'png') bytes = await canvases.png(made.canvas);
      else if (canvases.jpeg) bytes = await canvases.jpeg(made.canvas, quality ?? 0.85);
      else throw new Error('No JPG encoder was given.');
      return { bytes, width: size.width, height: size.height };
    } finally {
      // The picture's canvas is let go, then the page's decoded pictures and drawing steps, before the next page.
      // Every canvas counted for this drawing is forgotten, PDF.js's cached masks and a failed drawing's leftovers
      // included, so the count starts again from nothing for the next page or thumbnail.
      if (made) canvases.release(made.canvas);
      budget.give(own);
      budget.forgetAll();
      pdfPage.cleanup();
    }
  }

  return {
    pages: doc.numPages,
    close,
    async render(page, box) {
      const pdfPage = await pageOf(page);
      const natural = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(box.width / natural.width, box.height / natural.height);
      // Thumbnails keep the way PDF.js draws annotations by default.
      return (await drawPage(pdfPage, scale, { maxPixels: maxImagePixels, format: 'png', annotationMode: pdfjs.AnnotationMode.ENABLE })).bytes;
    },
    async draw(page, options) {
      if (options.format !== 'jpg' && options.format !== 'png') throw new Error('The picture format is not valid.');
      if (!(options.scale > 0) || !Number.isFinite(options.scale)) throw new Error('The scale is not valid.');
      const pdfPage = await pageOf(page);
      // Form fields with their values, from the document's own storage, and other annotations as their appearances show them.
      return drawPage(pdfPage, options.scale, { ...options, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE });
    },
  };
}

/**
 * Draws one page of a PDF to fit inside `box`, keeping its shape, and gives
 * back PNG bytes, closing the document after. `file` is handed to PDF.js,
 * which takes it over: the caller must not use it after.
 */
export async function renderPage(
  file: Uint8Array,
  page: number,
  box: { width: number; height: number },
  password: string | undefined,
  tools: EngineTools,
): Promise<Uint8Array> {
  const doc = await openDocument(file, password, tools);
  try {
    return await doc.render(page, box);
  } finally {
    await doc.close();
  }
}
