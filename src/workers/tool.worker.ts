// The one worker for every tool. It loads a tool's engine only when that tool
// first asks for it, from src/engines/tools/<tool id>.ts, with the libraries the
// engine declares for the step (worker-core's `ready`).

import qpdfWasm from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EngineModule, LibraryName } from '../engines/types';
import type { ToolKey } from './libraries';
import type { FromWorker } from './messages';
import { createPdfjsLoader, type NestedWorker } from './pdfjs-loader';
import { createSpareQpdf } from './spare-qpdf';
import { workerFromBlob } from './start-worker';
import { createHandler } from './worker-core';

// Lazy: each engine stays its own file and is fetched only when its tool runs.
const engines = import.meta.glob<EngineModule>('../engines/tools/*.ts');

// Note: the bundler may put a helper that the qpdf script imports into this
// file, so that script imports this file back. A module worker keeps one copy
// of each module per address, so nothing runs twice. That holds only while this
// file is loaded at its plain address: the page starts the worker from a blob:
// script that imports this file by that address (src/workers/start-worker.ts),
// so this file is never the blob itself. Never add a query string to it.
//
// Started that way, the worker's own address is the blob:, which has no path,
// so a root-relative address cannot be resolved against it. Every address this
// file hands on is made absolute against this file's own address instead.
const absolute = (address: string) => new URL(address, import.meta.url).href;

// fflate's three parts the site uses, picked by name so the rest of fflate (its own workers among it) is left out
// of the build. Imported straight from the package: a module of our own re-exporting them would be a built file,
// and a request, of its own.
const loadFflate = async () => {
  const { Inflate, Deflate, zipSync } = await import('fflate');
  return { Inflate, Deflate, zipSync };
};

// qpdf is made afresh for each call, so one file's crash or memory never carries over to the next. The first
// instance is made while the step's libraries load (the spare), so its WebAssembly is asked for before any
// file is read, and handed unused to the first call.
const spareQpdf = createSpareQpdf(async () => {
  const { createQpdf } = await import('../engines/qpdf');
  return createQpdf(() => import('@neslinesli93/qpdf-wasm'), absolute(qpdfWasm));
});

// The libraries engines ask for, by the keys of `toolLibrary` in libraries.ts: every key has a row there, and
// worker-core hands each step's engine only the keys its declared set allows. Each library's files are loaded
// by `libraries` below, before any file is read; these give an engine what was loaded.
const tools = {
  qpdf: () => spareQpdf.take(),
  pdfjs: () => pdfjsLoader.load(),
  // Races every drawing, and opening and closing a document, against PDF.js's own worker stopping, so
  // a job or a thumbnail fails at once instead of waiting on a worker that will never answer.
  pdfjsGuard: async () => pdfjsLoader.guard,
  // Pages are drawn on an OffscreenCanvas: a worker has no page to draw on.
  canvas: async () => ({
    create(width: number, height: number) {
      const canvas = new OffscreenCanvas(width, height);
      return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
    },
    resize(canvas: unknown, width: number, height: number) {
      (canvas as OffscreenCanvas).width = width;
      (canvas as OffscreenCanvas).height = height;
    },
    release(canvas: unknown) {
      (canvas as OffscreenCanvas).width = 0;
      (canvas as OffscreenCanvas).height = 0;
    },
    png: async (canvas: unknown) => new Uint8Array(await (await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })).arrayBuffer()),
    // A JPG at `quality` from 0 to 1, for an engine that saves pictures again (Compress PDF).
    jpeg: async (canvas: unknown, quality: number) =>
      new Uint8Array(await (await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer()),
  }),
  // PDF.js's fonts and decoders: one fixed set, loaded late, never statically.
  pdfjsData: async () => (await import('./pdfjs-data')).pdfjsData,
  // pdf-lib, for an engine that writes a PDF from nothing or draws on pages; its own chunk.
  pdflib: () => import('./pdflib'),
  // fflate, from the same chunk pdf-lib uses, as one library: its streaming Inflate and Deflate, never
  // inflateSync, and zipSync, which worker-core takes for a job that zips several files.
  fflate: () => loadFflate(),
  // The browser's own image decoder. For pictures' thumbnails (Image to PDF), the picture is turned as
  // its camera recorded, and scaled down while it is decoded where the browser can. With
  // `colours: 'none'` (Compress PDF), its colours are left as they are and it is scaled with care; the
  // engine has already removed any camera turn and colour profile from it.
  decodePicture: async () => ({
    async decode(bytes: Uint8Array, width: number, height: number, options?: { colours?: 'none' }) {
      const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
        imageOrientation: 'from-image',
        resizeWidth: width,
        resizeHeight: height,
        ...(options?.colours === 'none' ? { colorSpaceConversion: 'none', resizeQuality: 'high' } : { resizeQuality: 'medium' }),
      });
      return { image: bitmap, close: () => bitmap.close() };
    },
  }),
} satisfies Record<ToolKey, () => Promise<unknown>>;

// Each library's files, by name, loaded for a step before any file is read (worker-core's `ready`): the same
// files, in the same order, whatever the file.
const libraries: Record<LibraryName, () => Promise<unknown>> = {
  qpdf: () => spareQpdf.load(),
  fflate: () => loadFflate(),
  pdflib: () => import('./pdflib'),
  // PDF.js and its own worker, its data and the thumbnail step, started together.
  pdfjs: () => Promise.all([pdfjsLoader.load(), tools.pdfjsData(), import('../engines/thumbnail')]),
  pictureThumbnail: () => import('../engines/picture-thumbnail'),
};

// PDF.js runs its own worker, started from this one, once. If it fails, PDF.js
// is unavailable for the rest of this worker's life: every thumbnail, including
// one being drawn, gives no picture at once, and a job drawing pages fails.
const pdfjsLoader = createPdfjsLoader(
  () => import('pdfjs-dist'),
  // Started the same blob: way, so PDF.js's worker runs under the page's policy too. It ends with this worker.
  () => workerFromBlob(pdfjsWorkerUrl, import.meta.url) as unknown as NestedWorker,
);

type WorkerScope = {
  postMessage(message: FromWorker, options?: { transfer?: Transferable[] }): void;
  onmessage: ((event: MessageEvent) => void) | null;
};
const scope = self as unknown as WorkerScope;

const handle = createHandler({
  loadEngine: async (toolId) => {
    const load = engines[`../engines/tools/${toolId}.ts`];
    return load ? await load() : undefined;
  },
  libraries,
  tools,
  post: (message, transfer) => scope.postMessage(message, { transfer: transfer ?? [] }),
  openDocument: async (file, password, given, kind) => {
    // A picture tool's files are drawn by the browser's image decoder; PDF.js is never loaded for them.
    if (kind === 'picture') {
      const { openPicture } = await import('../engines/picture-thumbnail');
      return openPicture(file, given);
    }
    // The guard comes through `tools`, as it does for an engine: opening, drawing and closing are all raced.
    const { openDocument } = await import('../engines/thumbnail');
    const doc = await openDocument(file, password, given);
    return { render: (page, box) => doc.render(page, box), close: () => doc.close() };
  },
});

scope.onmessage = (event) => {
  void handle(event.data);
};
