// The thumbnail's way through the worker: the message checks, the handler that
// turns every drawing problem into "no picture", the client's time limit, and
// the PDF.js loader that stops drawing once PDF.js's own worker fails.

import { describe, expect, it, vi } from 'vitest';
import type { FromWorker, ToWorker } from '../../src/workers/messages';
import { isFromWorker, isToWorker } from '../../src/workers/messages';
import { createHandler } from '../../src/workers/worker-core';
import { ToolClient, type WorkerLike } from '../../src/workers/client';
import { createPdfjsLoader, type NestedWorker } from '../../src/workers/pdfjs-loader';

const file = new Blob(['%PDF-1.7']);
const box = { width: 104, height: 136 };

describe('thumbnail messages', () => {
  it('accept a request for a page that fits inside a sensible box', () => {
    expect(isToWorker({ type: 'thumbnail', requestId: 1, toolId: 'merge-pdf', file, page: 1, box })).toBe(true);
    expect(isToWorker({ type: 'thumbnail', requestId: 1, toolId: 'merge-pdf', file, password: 'x', page: 3, box: { width: 16, height: 400 } })).toBe(true);
  });

  it('refuse a bad page, box or file', () => {
    for (const change of [
      { page: 0 },
      { page: 1.5 },
      { page: '1' },
      { box: { width: 15, height: 136 } },
      { box: { width: 104, height: 401 } },
      { box: { width: 104.5, height: 136 } },
      { box: null },
      { file: 'not a blob' },
      { password: 42 },
    ]) {
      expect(isToWorker({ type: 'thumbnail', requestId: 1, toolId: 'merge-pdf', file, page: 1, box, ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it('accept a reply with a picture or with none, and nothing else', () => {
    expect(isFromWorker({ type: 'thumbnail', requestId: 1, image: new Uint8Array([1]) })).toBe(true);
    expect(isFromWorker({ type: 'thumbnail', requestId: 1, image: null })).toBe(true);
    expect(isFromWorker({ type: 'thumbnail', requestId: 1, image: 'data:image/png;base64,' })).toBe(false);
    expect(isFromWorker({ type: 'thumbnail', requestId: 1 })).toBe(false);
  });
});

describe('the worker handling a thumbnail', () => {
  function setup(renderPage?: (...args: unknown[]) => Promise<Uint8Array>) {
    const posted: { message: FromWorker; transfer?: Transferable[] }[] = [];
    const handle = createHandler({
      loadEngine: async () => {
        throw new Error('no engine is loaded for a thumbnail');
      },
      tools: {},
      post: (message, transfer) => posted.push({ message, transfer }),
      renderPage: renderPage as never,
    });
    return { handle, posted };
  }
  const request: ToWorker = { type: 'thumbnail', requestId: 7, toolId: 'merge-pdf', file, password: 'pw', page: 1, box };

  it('sends the picture back, moved, without loading a tool engine', async () => {
    const seen: unknown[] = [];
    const { handle, posted } = setup(async (...args) => {
      seen.push(args.slice(1, 4));
      return new Uint8Array([137, 80]);
    });
    await handle(request);
    expect(seen).toEqual([[1, box, 'pw']]);
    expect(posted[0]!.message).toEqual({ type: 'thumbnail', requestId: 7, image: new Uint8Array([137, 80]) });
    expect(posted[0]!.transfer).toHaveLength(1);
  });

  it('turns a drawing error into no picture, never a failure', async () => {
    const { handle, posted } = setup(async () => {
      throw new RangeError('Array buffer allocation failed');
    });
    await handle(request);
    expect(posted).toEqual([{ message: { type: 'thumbnail', requestId: 7, image: null }, transfer: undefined }]);
  });

  it('gives no picture when it has nothing to draw with', async () => {
    const { handle, posted } = setup(undefined);
    await handle(request);
    expect(posted[0]!.message).toEqual({ type: 'thumbnail', requestId: 7, image: null });
  });
});

class FakeWorker implements WorkerLike {
  sent: ToWorker[] = [];
  ended = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  postMessage(message: ToWorker) {
    this.sent.push(message);
  }
  terminate() {
    this.ended = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}

function client(limitMs = 10_000) {
  const workers: FakeWorker[] = [];
  const tool = new ToolClient(
    'merge-pdf',
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    limitMs,
  );
  return { tool, workers };
}

describe('the client asking for a thumbnail', () => {
  it('gives the picture, or null, and keeps the worker', async () => {
    const { tool, workers } = client();
    const asked = tool.thumbnail(file, undefined, 1, box);
    const sent = workers[0]!.sent[0]!;
    expect(sent).toMatchObject({ type: 'thumbnail', page: 1, box });
    workers[0]!.reply({ type: 'thumbnail', requestId: sent.requestId, image: null });
    await expect(asked).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(false);
  });

  it('ends the worker and gives null when drawing takes too long', async () => {
    vi.useFakeTimers();
    try {
      const { tool, workers } = client(50);
      const asked = tool.thumbnail(file, undefined, 1, box);
      vi.advanceTimersByTime(60);
      await expect(asked).resolves.toBeNull();
      expect(workers[0]!.ended).toBe(true);
      // The next request starts a fresh worker.
      void tool.inspect(file);
      expect(workers).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a pending read alone when a thumbnail fails', async () => {
    const { tool, workers } = client();
    const read = tool.inspect(file);
    const asked = tool.thumbnail(file, undefined, 1, box);
    const [readRequest, thumbRequest] = workers[0]!.sent;
    workers[0]!.reply({ type: 'thumbnail', requestId: thumbRequest!.requestId, image: null });
    await expect(asked).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(false);
    workers[0]!.reply({ type: 'inspected', requestId: readRequest!.requestId, outcome: { kind: 'ready', pages: 2 } });
    await expect(read).resolves.toEqual({ kind: 'ready', pages: 2 });
  });
});

describe('the PDF.js loader', () => {
  function setup() {
    const started: NestedWorker[] = [];
    const pdfjs = { GlobalWorkerOptions: { workerPort: null as unknown } };
    const loader = createPdfjsLoader(
      async () => pdfjs,
      () => {
        const nested: NestedWorker = { onerror: null };
        started.push(nested);
        return nested;
      },
    );
    return { loader, started, pdfjs };
  }

  it("starts PDF.js's own worker once, however many thumbnails ask", async () => {
    const { loader, started, pdfjs } = setup();
    await Promise.all([loader.load(), loader.load(), loader.load()]);
    expect(started).toHaveLength(1);
    expect(pdfjs.GlobalWorkerOptions.workerPort).toBe(started[0]);
  });

  it('stops a drawing in progress and refuses later ones at once when that worker fails', async () => {
    const { loader, started } = setup();
    await loader.load();
    const drawing = loader.guard(new Promise<Uint8Array>(() => {}));
    const preventDefault = vi.fn();
    started[0]!.onerror!({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    await expect(drawing).rejects.toThrow(/stopped/);
    await expect(loader.load()).rejects.toThrow(/unavailable/);
    expect(started).toHaveLength(1);
  });
});
