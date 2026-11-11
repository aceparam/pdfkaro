// The one worker for every tool. It loads a tool's engine only when that tool
// first asks for it, from src/engines/tools/<tool id>.ts.

import type { EngineModule, EngineTools } from '../engines/types';
import type { FromWorker } from './messages';
import { createHandler } from './worker-core';

// Lazy: each engine stays its own file and is fetched only when its tool runs.
const engines = import.meta.glob<EngineModule>('../engines/tools/*.ts');

// Each tool's change adds the libraries its engine asks for.
const tools: EngineTools = {};

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
