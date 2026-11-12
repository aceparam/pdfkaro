// The no-upload watcher itself, shown to work: each kind of request that could
// carry a file out is planted, and the watcher must catch it. Run once, against
// the shared watcher every tool's no-upload test uses.

import { expect, test, type Page } from '@playwright/test';
import { violations, watch } from './no-upload';

async function open(page: Page) {
  await page.goto('/merge-pdf');
  await page.waitForLoadState('networkidle');
}

test.describe('the no-upload watcher', () => {
  test('the watcher catches a POST, a beacon, an image address with a file name, and a fetch from a worker', async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await open(page);
    // Each plant goes to its own address, and the test checks that very request was seen and judged wrong.
    const plants: [string, string, (page: Page) => Promise<unknown>][] = [
      ['a POST', '/planted-post', (p) => p.evaluate(() => fetch('/planted-post', { method: 'POST', body: 'x' }).catch(() => {}))],
      ['a beacon', '/planted-beacon', (p) => p.evaluate(() => navigator.sendBeacon('/planted-beacon', 'text.pdf'))],
      [
        'an image address',
        '/text.pdf.png',
        (p) =>
          p.evaluate(
            () =>
              new Promise<void>((done) => {
                const image = new Image();
                image.onload = image.onerror = () => done();
                image.src = '/text.pdf.png';
              }),
          ),
      ],
      [
        'a fetch from a worker',
        '/planted-worker',
        (p) =>
          p.evaluate(
            (site) =>
              new Promise<void>((done) => {
                // A worker made from a blob has no address of its own to resolve "/planted-worker" against, so the full address is given.
                const source = `fetch(${JSON.stringify(`${site}/planted-worker`)}).catch(() => {}).finally(() => postMessage('done'))`;
                const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
                worker.onmessage = () => done();
              }),
            origin,
          ),
      ],
      [
        'a fetch from a worker inside a worker',
        '/planted-nested',
        (p) =>
          p.evaluate(
            (site) =>
              new Promise<void>((done) => {
                // As PDF.js's own worker is started by the tool worker, this worker starts one of its own, which fetches.
                const inner = `fetch(${JSON.stringify(`${site}/planted-nested`)}).catch(() => {}).finally(() => postMessage('done'))`;
                const outer = `const nested = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(inner)}], { type: 'text/javascript' }))); nested.onmessage = () => postMessage('done');`;
                const worker = new Worker(URL.createObjectURL(new Blob([outer], { type: 'text/javascript' })));
                worker.onmessage = () => done();
              }),
            origin,
          ),
      ],
      [
        'a blob: address of another origin',
        '/planted-blob',
        // A made-up record: a page cannot make a blob: address of another origin, so the watcher is handed one.
        async () => undefined,
      ],
    ];
    for (const [what, path, plant] of plants) {
      if (path === '/planted-blob') {
        const forged = [{ url: 'blob:https://example.org/planted-blob', method: 'GET', body: null, origin: 'https://example.org' }];
        expect(violations(forged, origin, [], []).length, what).toBeGreaterThan(0);
        continue;
      }
      const seen = watch(context, page);
      await plant(page);
      await expect.poll(() => seen.some((request) => new URL(request.url).pathname === path), { message: `${what} was seen` }).toBe(true);
      const planted = seen.filter((request) => new URL(request.url).pathname === path);
      expect(violations(planted, origin, ['text.pdf'], []).length, what).toBeGreaterThan(0);
    }
  });
});
