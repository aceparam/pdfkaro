// The one worker for every tool. It loads a tool's engine only when that tool
// first asks for it, from src/engines/tools/<tool id>.ts.

import qpdfWasm from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { EngineModule, EngineTools } from '../engines/types';
import type { FromWorker } from './messages';
import { createPdfjsLoader, type NestedWorker } from './pdfjs-loader';
import { createHandler } from './worker-core';

// Lazy: each engine stays its own file and is fetched only when its tool runs.
const engines = import.meta.glob<EngineModule>('../engines/tools/*.ts');

// Note: the bundler may put a helper that the qpdf script imports into this
// file, so that script imports this file back. A module worker keeps one copy
// of each module per address, so nothing runs twice. That holds only while the
// worker is started at its plain address: never add a query string to it.

// The libraries engines ask for. Each is fetched only when first asked for;
// qpdf is made afresh for each call, so one file's crash or memory never
// carries over to the next.
const tools: EngineTools = {
  qpdf: async () => {
    const { createQpdf } = await import('../engines/qpdf');
    return createQpdf(() => import('@neslinesli93/qpdf-wasm'), qpdfWasm);
  },
  pdfjs: () => pdfjsLoader.load(),
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
  }),
  // PDF.js's fonts and decoders: one fixed set, loaded late, never statically.
  pdfjsData: async () => (await import('./pdfjs-data')).pdfjsData,
};

// PDF.js runs its own worker, started from this one, once. If it fails, PDF.js
// is unavailable for the rest of this worker's life, and every thumbnail,
// including one being drawn, gives no picture at once.
const pdfjsLoader = createPdfjsLoader(
  () => import('pdfjs-dist'),
  () => new Worker(pdfjsWorkerUrl, { type: 'module' }) as unknown as NestedWorker,
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
  tools,
  post: (message, transfer) => scope.postMessage(message, { transfer: transfer ?? [] }),
  renderPage: async (file, page, box, password, given) => {
    const { renderPage } = await import('../engines/thumbnail');
    return pdfjsLoader.guard(renderPage(file, page, box, password, given));
  },
});

scope.onmessage = (event) => {
  void handle(event.data);
};
