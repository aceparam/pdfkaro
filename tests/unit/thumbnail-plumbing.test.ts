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
    expect(isToWorker({ type: 'thumbnail', requestId: 1, toolId: 'merge-pdf', file, page: 1, box, documentKey: 'f1' })).toBe(true);
    expect(isToWorker({ type: 'thumbnail', requestId: 1, toolId: 'merge-pdf', file, password: 'x', page: 3, box: { width: 16, height: 400 }, documentKey: 'f123456789' })).toBe(true);
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
      { documentKey: undefined },
      { documentKey: 'report.pdf' },
      { documentKey: 'f' },
      { documentKey: 'f1234567890' },
      { documentKey: 'f1:2' },
      { documentKey: 1 },
    ]) {
      expect(isToWorker({ type: 'thumbnail', requestId: 1, toolId: 'merge-pdf', file, page: 1, box, documentKey: 'f1', ...change }), JSON.stringify(change)).toBe(false);
    }
  });

  it('accept a close message', () => {
    expect(isToWorker({ type: 'close', requestId: 1, toolId: 'merge-pdf' })).toBe(true);
    expect(isToWorker({ type: 'close', requestId: 1, toolId: '../x' })).toBe(false);
  });

  it('accept a reply with a picture or with none, and nothing else', () => {
    expect(isFromWorker({ type: 'thumbnail', requestId: 1, image: new Uint8Array([1]) })).toBe(true);
    expect(isFromWorker({ type: 'thumbnail', requestId: 1, image: null })).toBe(true);
    expect(isFromWorker({ type: 'thumbnail', requestId: 1, image: 'data:image/png;base64,' })).toBe(false);
    expect(isFromWorker({ type: 'thumbnail', requestId: 1 })).toBe(false);
  });
});

describe('the worker handling a thumbnail', () => {
  function setup(renderPage?: (page: number, box: unknown, password: string | undefined) => Promise<Uint8Array>) {
    const posted: { message: FromWorker; transfer?: Transferable[] }[] = [];
    const handle = createHandler({
      loadEngine: async () => {
        throw new Error('no engine is loaded for a thumbnail');
      },
      tools: {},
      post: (message, transfer) => posted.push({ message, transfer }),
      openDocument: renderPage
        ? async (_file, password) => ({ render: (page, given) => renderPage(page, given, password), close: async () => {} })
        : undefined,
    });
    return { handle, posted };
  }
  const request: ToWorker = { type: 'thumbnail', requestId: 7, toolId: 'merge-pdf', file, password: 'pw', page: 1, box, documentKey: 'f1' };

  it('sends the picture back, moved, without loading a tool engine', async () => {
    const seen: unknown[] = [];
    const { handle, posted } = setup(async (...args) => {
      seen.push(args);
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
    const asked = tool.thumbnail(file, undefined, 1, box, 'f1');
    const sent = workers[0]!.sent[0]!;
    expect(sent).toMatchObject({ type: 'thumbnail', page: 1, box, documentKey: 'f1' });
    workers[0]!.reply({ type: 'thumbnail', requestId: sent.requestId, image: null });
    await expect(asked).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(false);
  });

  it('ends the worker and gives null when drawing takes too long', async () => {
    vi.useFakeTimers();
    try {
      const { tool, workers } = client(50);
      const asked = tool.thumbnail(file, undefined, 1, box, 'f1');
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

  it('cancels its time limit once the picture arrives, so a later read is never ended by it', async () => {
    vi.useFakeTimers();
    try {
      const { tool, workers } = client(50);
      const asked = tool.thumbnail(file, undefined, 1, box, 'f1');
      workers[0]!.reply({ type: 'thumbnail', requestId: workers[0]!.sent[0]!.requestId, image: new Uint8Array([1]) });
      await expect(asked).resolves.toEqual(new Uint8Array([1]));
      const read = tool.inspect(file);
      vi.advanceTimersByTime(200);
      expect(workers[0]!.ended).toBe(false);
      workers[0]!.reply({ type: 'inspected', requestId: workers[0]!.sent[1]!.requestId, outcome: { kind: 'ready', pages: 1 } });
      await expect(read).resolves.toEqual({ kind: 'ready', pages: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a read that follows a stopped thumbnail finish on a fresh worker, so no file is left reading', async () => {
    const { tool, workers } = client();
    const asked = tool.thumbnail(file, undefined, 1, box, 'f1');
    // What the page does when a file is about to be read while a thumbnail is drawn.
    tool.end();
    await expect(asked).resolves.toBeNull();
    const read = tool.inspect(file);
    expect(workers).toHaveLength(2);
    workers[1]!.reply({ type: 'inspected', requestId: workers[1]!.sent[0]!.requestId, outcome: { kind: 'ready', pages: 1 } });
    await expect(read).resolves.toEqual({ kind: 'ready', pages: 1 });
  });

  it('leaves a pending read alone when a thumbnail fails', async () => {
    const { tool, workers } = client();
    const read = tool.inspect(file);
    const asked = tool.thumbnail(file, undefined, 1, box, 'f1');
    const [readRequest, thumbRequest] = workers[0]!.sent;
    workers[0]!.reply({ type: 'thumbnail', requestId: thumbRequest!.requestId, image: null });
    await expect(asked).resolves.toBeNull();
    expect(workers[0]!.ended).toBe(false);
    workers[0]!.reply({ type: 'inspected', requestId: readRequest!.requestId, outcome: { kind: 'ready', pages: 2 } });
    await expect(read).resolves.toEqual({ kind: 'ready', pages: 2 });
  });
});

describe('the one document kept open in the worker', () => {
  function setup(failOpen = false) {
    const log: string[] = [];
    let opened = 0;
    const posted: FromWorker[] = [];
    const handle = createHandler({
      loadEngine: async () => ({
        inspect: async () => {
          log.push('inspect');
          return { kind: 'ready', pages: 2 };
        },
        run: async () => {
          log.push('run');
          return [new Uint8Array([1])];
        },
      }),
      tools: {},
      post: (message) => posted.push(message),
      openDocument: async (bytes) => {
        const id = ++opened;
        log.push(`open ${id} (${bytes.length} bytes)`);
        if (failOpen) throw new Error('damaged');
        return {
          render: async (page) => {
            log.push(`draw ${id}:${page}`);
            return new Uint8Array([page]);
          },
          close: async () => {
            log.push(`close ${id}`);
          },
        };
      },
    });
    const thumb = (documentKey: string, page: number, blob = file): ToWorker => ({
      type: 'thumbnail',
      requestId: page,
      toolId: 'merge-pdf',
      file: blob,
      page,
      box,
      documentKey,
    });
    return { handle, log, posted, thumb };
  }

  it('draws many pages of one file from one open document', async () => {
    const { handle, log, thumb } = setup();
    for (const page of [1, 2, 40]) await handle(thumb('f1', page));
    expect(log).toEqual(['open 1 (8 bytes)', 'draw 1:1', 'draw 1:2', 'draw 1:40']);
  });

  it('closes it when another file is asked for', async () => {
    const { handle, log, thumb } = setup();
    await handle(thumb('f1', 1));
    await handle(thumb('f2', 1, new Blob(['%PDF-2.0 other'])));
    expect(log).toEqual(['open 1 (8 bytes)', 'draw 1:1', 'close 1', 'open 2 (14 bytes)', 'draw 2:1']);
  });

  it('closes it before a read and before a job, so neither runs beside a kept copy', async () => {
    const { handle, log, thumb } = setup();
    await handle(thumb('f1', 1));
    await handle({ type: 'inspect', requestId: 2, toolId: 'merge-pdf', file });
    await handle(thumb('f1', 2));
    await handle({ type: 'run', requestId: 3, toolId: 'merge-pdf', files: [file], passwords: [undefined], options: {} });
    expect(log).toEqual(['open 1 (8 bytes)', 'draw 1:1', 'close 1', 'inspect', 'open 2 (8 bytes)', 'draw 2:2', 'close 2', 'run']);
  });

  it('closes it when the page says so, and opens it again when asked', async () => {
    const { handle, log, thumb } = setup();
    await handle(thumb('f1', 1));
    await handle({ type: 'close', requestId: 2, toolId: 'merge-pdf' });
    await handle({ type: 'close', requestId: 3, toolId: 'merge-pdf' });
    await handle(thumb('f1', 2));
    expect(log).toEqual(['open 1 (8 bytes)', 'draw 1:1', 'close 1', 'open 2 (8 bytes)', 'draw 2:2']);
  });

  it('keeps nothing for a file that cannot be opened, and gives no picture', async () => {
    const { handle, log, posted, thumb } = setup(true);
    await handle(thumb('f1', 1));
    await handle(thumb('f1', 2));
    expect(log).toEqual(['open 1 (8 bytes)', 'open 2 (8 bytes)']);
    expect(posted).toEqual([
      { type: 'thumbnail', requestId: 1, image: null },
      { type: 'thumbnail', requestId: 2, image: null },
    ]);
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

describe('closing and opening documents in the worker', () => {
  it('never opens a document while the last one is still closing', async () => {
    const log: string[] = [];
    let closing = 0;
    let overlapped = false;
    const handle = createHandler({
      loadEngine: async () => undefined,
      tools: {},
      post: () => {},
      openDocument: async () => {
        if (closing > 0) overlapped = true;
        log.push('open');
        return {
          render: async () => new Uint8Array([1]),
          close: async () => {
            closing++;
            log.push('close start');
            // PDF.js tears a document down over a few turns of the event loop.
            await new Promise((done) => setTimeout(done, 20));
            log.push('close end');
            closing--;
          },
        };
      },
    });
    const thumb = (documentKey: string, requestId: number): ToWorker => ({ type: 'thumbnail', requestId, toolId: 'merge-pdf', file, page: 1, box, documentKey });
    await handle(thumb('f1', 1));
    // What the page does for a list of files: close, then at once ask for the next file, without waiting.
    const closed = handle({ type: 'close', requestId: 2, toolId: 'merge-pdf' });
    const next = handle(thumb('f2', 3));
    await Promise.all([closed, next]);
    expect(overlapped).toBe(false);
    expect(log).toEqual(['open', 'close start', 'close end', 'open']);
  });
});
