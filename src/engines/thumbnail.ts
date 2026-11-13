// Draws one page of a PDF as a small picture, for the thumbnails in the list
// of files. Shared by every tool, like inspect.ts. It keeps the engine rules:
// PDF.js, a canvas maker and PDF.js's helper data all come in through `tools`,
// so it uses no page and makes no request, and a Node test can run it.

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
};

/** PDF.js's helper data from memory, the same fixed set for every file. */
export type HelperData = {
  font(name: string): Uint8Array | undefined;
  decoder(name: string): Uint8Array | undefined;
};

/** The parts of PDF.js used here. */
type PdfjsModule = {
  getDocument(options: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(page: number): Promise<{
        getViewport(options: { scale: number }): { width: number; height: number };
        render(options: Record<string, unknown>): { promise: Promise<void> };
      }>;
    }>;
    destroy(): Promise<void>;
  };
};

/** The largest image inside a PDF that is decoded for a thumbnail, in pixels. */
export const maxImagePixels = 16 * 1024 * 1024;

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

/** An open PDF, kept so that several pages can be drawn without reading the file again. */
export type OpenDocument = {
  pages: number;
  /** Draws page `page` (1-based) to fit inside `box`, keeping its shape, as PNG bytes. */
  render(page: number, box: { width: number; height: number }): Promise<Uint8Array>;
  /** Closes the document and lets go of its copy of the file. Safe to call twice. */
  close(): Promise<void>;
};

/**
 * Opens a PDF for drawing. `file` is handed to PDF.js, which takes it over:
 * the caller must not use it after. Close the result when done with it.
 */
export async function openDocument(file: Uint8Array, password: string | undefined, tools: EngineTools): Promise<OpenDocument> {
  const pdfjs = await need<PdfjsModule>(tools, 'pdfjs');
  const canvases = await need<CanvasMaker>(tools, 'canvas');
  const data = await need<HelperData>(tools, 'pdfjsData');

  // PDF.js makes these with `new`, with options it chooses; ours ignore them.
  class CanvasFactory {
    create(width: number, height: number) {
      if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
      return canvases.create(width, height);
    }
    reset(pair: CanvasAndContext, width: number, height: number) {
      if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
      canvases.resize(pair.canvas, width, height);
    }
    destroy(pair: CanvasAndContext) {
      canvases.release(pair.canvas);
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
  const close = async () => {
    if (closed) return;
    closed = true;
    await task.destroy();
  };
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await close();
    throw error;
  }
  return {
    pages: doc.numPages,
    close,
    async render(page, box) {
      if (closed) throw new Error('The document is closed.');
      if (!Number.isInteger(page) || page < 1 || page > doc.numPages) throw new Error('No such page.');
      const pdfPage = await doc.getPage(page);
      const natural = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(box.width / natural.width, box.height / natural.height);
      const viewport = pdfPage.getViewport({ scale });
      const width = Math.max(1, Math.round(viewport.width));
      const height = Math.max(1, Math.round(viewport.height));
      const { canvas, context } = canvases.create(width, height);
      try {
        await pdfPage.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
        return await canvases.png(canvas);
      } finally {
        canvases.release(canvas);
      }
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
