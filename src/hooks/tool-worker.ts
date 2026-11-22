// Starts the tool worker for the page. Components may not import workers, so
// the workspace takes this from a hook, as it takes the rest of its running.
//
// The worker starts from a blob: address that imports the worker file
// (src/workers/start-worker.ts), so it runs under the page's Content Security
// Policy. `?worker&url` gives the built worker file's address, with the worker
// bundled as a module worker, as `new Worker(new URL(...))` did before.

import toolWorker from '../workers/tool.worker.ts?worker&url';
import type { WorkerLike } from '../workers/client';
import { workerFromBlob } from '../workers/start-worker';

export const createToolWorker = (): WorkerLike => workerFromBlob(toolWorker, location.href) as unknown as WorkerLike;
