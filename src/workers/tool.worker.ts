// The one worker for every tool. It loads a tool's engine only when that tool
// first asks for it, from src/engines/tools/<tool id>.ts.

import qpdfWasm from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import type { EngineModule, EngineTools } from '../engines/types';
import type { FromWorker } from './messages';
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
};

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
});

scope.onmessage = (event) => {
  void handle(event.data);
};
