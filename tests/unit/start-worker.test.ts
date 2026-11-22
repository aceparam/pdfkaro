import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workerFromBlob } from '../../src/workers/start-worker';

// Made-up Worker, Blob and object addresses, so the start can be read in Node.
function stub() {
  const blobs: { parts: unknown[]; type?: string }[] = [];
  const workers: { url: string; options: unknown; ended: boolean }[] = [];
  const revoked: string[] = [];
  class FakeBlob {
    constructor(
      readonly parts: unknown[],
      readonly options?: { type?: string },
    ) {
      blobs.push({ parts, type: options?.type });
    }
  }
  class FakeWorker {
    record: { url: string; options: unknown; ended: boolean };
    constructor(url: string, options: unknown) {
      this.record = { url, options, ended: false };
      workers.push(this.record);
    }
    terminate() {
      this.record.ended = true;
    }
  }
  vi.stubGlobal('Blob', FakeBlob);
  vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:https://pdfkaro.example/${blobs.length}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url);
  });
  return { blobs, workers, revoked };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('workerFromBlob', () => {
  it('starts a module worker from a blob: address whose text is one import of the full same-origin address', () => {
    const { blobs, workers } = stub();
    workerFromBlob('/_astro/tool.worker-AbCd1234.js', 'https://pdfkaro.example/merge-pdf');
    expect(blobs).toEqual([{ parts: ['import "https://pdfkaro.example/_astro/tool.worker-AbCd1234.js";'], type: 'text/javascript' }]);
    expect(workers).toEqual([{ url: 'blob:https://pdfkaro.example/1', options: { type: 'module' }, ended: false }]);
  });

  it('resolves addresses at the root and under /pdfkaro', () => {
    const { blobs } = stub();
    workerFromBlob('/pdfkaro/_astro/tool.worker-AbCd1234.js', 'https://aceparam.github.io/pdfkaro/merge-pdf');
    // Inside the tool worker, PDF.js's worker is resolved against the worker file's own address.
    workerFromBlob('./pdf.worker.min-AbCd1234.mjs', 'https://aceparam.github.io/pdfkaro/_astro/tool.worker-AbCd1234.js');
    workerFromBlob('/_astro/pdf.worker.min-AbCd1234.mjs', 'http://localhost:4321/_astro/tool.worker-AbCd1234.js');
    expect(blobs.map((blob) => blob.parts)).toEqual([
      ['import "https://aceparam.github.io/pdfkaro/_astro/tool.worker-AbCd1234.js";'],
      ['import "https://aceparam.github.io/pdfkaro/_astro/pdf.worker.min-AbCd1234.mjs";'],
      ['import "http://localhost:4321/_astro/pdf.worker.min-AbCd1234.mjs";'],
    ]);
  });

  it('writes the address as a string, so no character in it can end the import', () => {
    const { blobs } = stub();
    workerFromBlob('/_astro/a"b.js', 'https://pdfkaro.example/');
    expect(blobs[0]!.parts).toEqual(['import "https://pdfkaro.example/_astro/a%22b.js";']);
  });

  it('refuses a file from another site', () => {
    const { blobs, workers } = stub();
    expect(() => workerFromBlob('https://example.com/w.js', 'https://pdfkaro.example/merge-pdf')).toThrow('only from a file of the site itself');
    expect(() => workerFromBlob('//example.com/w.js', 'https://pdfkaro.example/merge-pdf')).toThrow('only from a file of the site itself');
    expect(blobs).toEqual([]);
    expect(workers).toEqual([]);
  });

  it('ends the worker and revokes the blob: address on terminate()', () => {
    const { workers, revoked } = stub();
    const worker = workerFromBlob('/_astro/tool.worker-AbCd1234.js', 'https://pdfkaro.example/merge-pdf');
    expect(revoked).toEqual([]);
    worker.terminate();
    expect(workers[0]!.ended).toBe(true);
    expect(revoked).toEqual(['blob:https://pdfkaro.example/1']);
  });
});

describe("PDF.js's own worker starts", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it('are never reached: nothing in src/ sets GlobalWorkerOptions.workerSrc or rendererSrc', () => {
    const found = walk('src')
      .filter((file) => /\.(ts|tsx|astro|mjs|js)$/.test(file))
      .filter((file) => /\b(workerSrc|rendererSrc)\b/.test(readFileSync(file, 'utf8')));
    expect(found).toEqual([]);
  });
});
