// Checks the stand-in host of uniform-requests.spec.ts: that it sends GitHub Pages' cache headers, so the
// browser's own cache answers repeats and the server sees nothing of them, that it refuses what it must, and
// that slow mode holds back PDF.js's files.

import { request as httpRequest } from 'node:http';
import { builtFiles } from './no-upload';
import { expect, test, watchPolicy } from './fixtures';
import { slowMs, startHostLog, type HostLog } from './host-log';

/** A raw request, so the path reaches the server exactly as written, with no normalising of `..`. */
function raw(log: HostLog, method: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  const { port } = new URL(log.origin);
  return new Promise((resolve, reject) => {
    const sent = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body, headers: response.headers }));
    });
    sent.on('error', reject);
    sent.end();
  });
}

test.describe('the stand-in host @desktop', () => {
  let log: HostLog;
  test.beforeAll(async () => {
    log = await startHostLog();
  });
  test.afterAll(async () => {
    await log.close();
  });

  test('sends the cache headers, so a page loaded twice in one browser asks for its scripts once', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: log.origin });
    await watchPolicy(context);
    const page = await context.newPage();
    const from = log.mark();
    await page.goto('/merge-pdf');
    await page.waitForLoadState('networkidle');
    await page.goto('/merge-pdf');
    await page.waitForLoadState('networkidle');
    const scripts = log.since(from).filter((entry) => entry.path.endsWith('.js'));
    expect(scripts.length).toBeGreaterThan(0);
    expect(new Set(scripts.map((entry) => entry.path)).size).toBe(scripts.length);
    await context.close();
  });

  test('answers a matching If-None-Match with 304, and a clean address with its page', async () => {
    const script = builtFiles(/^tool\.worker-[A-Za-z0-9_-]{8}\.js$/)[0]!;
    const first = await raw(log, 'GET', script);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('max-age=600');
    expect(first.headers['access-control-allow-origin']).toBeUndefined();
    const again = await raw(log, 'GET', script, { 'If-None-Match': String(first.headers.etag) });
    expect(again.status).toBe(304);
    expect(again.body).toBe('');
    expect((await raw(log, 'GET', '/merge-pdf')).status).toBe(200);
    expect((await raw(log, 'GET', '/no-such-page')).status).toBe(404);
    expect((await raw(log, 'HEAD', script)).status).toBe(200);
  });

  test('refuses a path that leaves dist/, a NUL and any method but GET and HEAD', async () => {
    for (const path of ['/%2e%2e/package.json', '/../package.json', '/_astro/%2e%2e/%2e%2e/package.json']) {
      const answered = await raw(log, 'GET', path);
      expect(answered.status, path).not.toBe(200);
      expect(answered.body, path).not.toContain('"devDependencies"');
    }
    expect((await raw(log, 'GET', '/%00')).status).toBe(400);
    expect((await raw(log, 'GET', '/index.html%00.js')).status).toBe(400);
    expect((await raw(log, 'POST', '/merge-pdf')).status).toBe(405);
    expect((await raw(log, 'PUT', '/merge-pdf')).status).toBe(405);
  });

  test('holds back a PDF.js file for about 12 seconds in slow mode, and nothing else', async () => {
    test.setTimeout(60_000);
    const pdfjs = builtFiles(/^pdf-[A-Za-z0-9_-]{8}\.js$/)[0]!;
    const other = builtFiles(/^tool\.worker-[A-Za-z0-9_-]{8}\.js$/)[0]!;
    log.setSlow(true);
    try {
      let started = Date.now();
      expect((await raw(log, 'GET', other)).status).toBe(200);
      expect(Date.now() - started).toBeLessThan(2000);
      started = Date.now();
      expect((await raw(log, 'GET', pdfjs)).status).toBe(200);
      expect(Date.now() - started).toBeGreaterThanOrEqual(slowMs - 500);
    } finally {
      log.setSlow(false);
    }
  });
});
