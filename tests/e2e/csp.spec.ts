// The Content Security Policy, shown to block what it should, on the page and
// inside workers started the way the site starts them (a blob: script that
// imports the real file), nested ones included; and real jobs of each engine
// kind, shown to run under it with no violation.
//
// The firefox and webkit projects in playwright.config.ts run this file only.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test, type PolicyViolation } from './fixtures';
import { allPages } from './pages';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, '../fixtures', name);

const hashes = "( 'sha256-[A-Za-z0-9+/]+=*')*";
const policy = new RegExp(
  `^default-src 'none'; script-src 'self' 'wasm-unsafe-eval'${hashes}; style-src 'self'${hashes}; img-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'$`,
);

/** An address on another origin, served by the same test server: 127.0.0.1 is not localhost. */
const otherOrigin = (baseURL: string) => `http://127.0.0.1:${new URL(baseURL).port}`;

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.locator('astro-island:not([ssr])').waitFor({ state: 'attached' });
}

/** Records every request the browser sends to the other origin; a blocked request never reaches it. */
async function otherOriginHits(context: BrowserContext, baseURL: string) {
  const hits: string[] = [];
  await context.route(`${otherOrigin(baseURL)}/**`, (route) => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: 'window.otherRan = true' });
  });
  return hits;
}

test.describe('every page carries the policy', () => {
  for (const path of allPages) {
    test(`${path} has one policy tag, first after the character set tag @desktop`, async ({ page, request }) => {
      const html = await (await request.get(path)).text();
      expect(html.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
      expect(html).toMatch(/<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
      const content = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!;
      expect(content).toMatch(policy);
      expect(content).not.toMatch(/'unsafe-inline'|'unsafe-eval'|'strict-dynamic'|data:|\*/);
      // As the browser reads it: the second element of the head.
      await page.goto(path);
      expect(await page.evaluate(() => [...document.head.children].slice(0, 2).map((element) => element.outerHTML.slice(0, 50)))).toEqual([
        '<meta charset="utf-8">',
        '<meta http-equiv="Content-Security-Policy" content',
      ]);
    });
  }
});

test.describe('on the page', () => {
  test.use({ blocksOnPurpose: true });

  test('an added inline script does not run, and the violation is seen', async ({ page, policyViolations }) => {
    await open(page, '/merge-pdf');
    await page.addScriptTag({ content: 'window.inlineRan = true' }).catch(() => {});
    expect(await page.evaluate(() => (window as unknown as { inlineRan?: boolean }).inlineRan)).toBeUndefined();
    await expect.poll(() => policyViolations.map((each) => each.directive)).toContain('script-src-elem');
    expect(policyViolations.every((each) => each.where === 'page')).toBe(true);
  });

  test('a script and a fetch from another origin are blocked before they are sent', async ({ page, context, baseURL, policyViolations }) => {
    const hits = await otherOriginHits(context, baseURL!);
    await open(page, '/merge-pdf');
    await page.addScriptTag({ url: `${otherOrigin(baseURL!)}/other.js` }).catch(() => {});
    const fetched = await page.evaluate((address) => fetch(address).then(() => 'sent', () => 'refused'), `${otherOrigin(baseURL!)}/csp-probe`);
    expect(fetched).toBe('refused');
    expect(await page.evaluate(() => (window as unknown as { otherRan?: boolean }).otherRan)).toBeUndefined();
    await expect.poll(() => policyViolations.map((each) => each.directive).sort()).toEqual(['connect-src', 'script-src-elem']);
    expect(hits).toEqual([]);
  });
});

// The probe starts a worker exactly as src/workers/start-worker.ts does, with the same blob text (its unit
// test pins it), and that worker starts a nested one the same way. Each waits until the watch has reached
// it, then tries eval, a tiny WebAssembly module and a fetch from another origin, and reports.
const probePage = `
const start = (file, name) => new Worker(
  URL.createObjectURL(new Blob(['import ' + JSON.stringify(new URL(file, location.href).href) + ';'], { type: 'text/javascript' })),
  { type: 'module', name },
);
window.probeResults = [];
const outer = start('/_test/probe-worker.js', 'outer');
outer.onmessage = (event) => window.probeResults.push(event.data);
outer.onerror = () => window.probeResults.push({ name: 'outer', failed: true });
`;
const probeWorker = (other: string) => `
// This file runs at its own address; the worker's own address is the blob:.
const site = import.meta.url;
const watched = () => new Promise((done) => {
  const look = () => (self.policyWatched ? done() : setTimeout(look, 20));
  look();
});
(async () => {
  await watched();
  let evalBlocked = false;
  try { eval('1'); } catch { evalBlocked = true; }
  let wasm = false;
  try { await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); wasm = true; } catch {}
  const fetched = await fetch(${JSON.stringify(`${other}/csp-probe`)}).then(() => 'sent', () => 'refused');
  postMessage({ name: self.name, evalBlocked, wasm, fetched });
  if (self.name === 'outer') {
    const nested = new Worker(
      URL.createObjectURL(new Blob(['import ' + JSON.stringify(site) + ';'], { type: 'text/javascript' })),
      { type: 'module', name: 'nested' },
    );
    nested.onmessage = (event) => postMessage(event.data);
    nested.onerror = () => postMessage({ name: 'nested', failed: true });
  }
})();
`;

test.describe('inside workers started the site’s way', () => {
  test.use({ blocksOnPurpose: true });

  test('eval is blocked, WebAssembly compiles and a fetch to another origin is refused, in the worker and in one nested in it', async ({
    page,
    context,
    baseURL,
    policyViolations,
  }) => {
    const hits = await otherOriginHits(context, baseURL!);
    await context.route('**/_test/probe.js', (route) => route.fulfill({ contentType: 'text/javascript', body: probePage }));
    await context.route('**/_test/probe-worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: probeWorker(otherOrigin(baseURL!)) }));
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    await open(page, '/merge-pdf');
    await page.addScriptTag({ url: '/_test/probe.js' });
    const results = () => page.evaluate(() => (window as unknown as { probeResults: unknown[] }).probeResults);
    await expect.poll(async () => (await results()).length, { timeout: 15000 }).toBe(2);
    expect(await results()).toEqual([
      { name: 'outer', evalBlocked: true, wasm: true, fetched: 'refused' },
      { name: 'nested', evalBlocked: true, wasm: true, fetched: 'refused' },
    ]);
    // Both are blob: workers, and each reported its own violations on its own scope.
    expect(workers).toHaveLength(2);
    expect(workers.every((url) => url.startsWith('blob:'))).toBe(true);
    const on = (url: string) => policyViolations.filter((each: PolicyViolation) => each.where === `worker ${url}`).map((each) => each.directive);
    for (const url of workers) {
      await expect.poll(() => on(url).sort()).toEqual(['connect-src', 'script-src']);
    }
    expect(policyViolations.filter((each) => each.where === 'page')).toEqual([]);
    expect(hits).toEqual([]);
  });
});

test.describe('real jobs run under the policy, with no violation', () => {
  /** Every worker the page starts, by address. */
  const startedWorkers = (page: Page) => {
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    return workers;
  };

  test('Merge PDF (qpdf): the tool worker and PDF.js worker both start from blob: addresses', async ({ page }) => {
    const workers = startedWorkers(page);
    await open(page, '/merge-pdf');
    await page.locator('input[type=file]').first().setInputFiles([fixture('text.pdf'), fixture('images.pdf')]);
    await expect(page.locator('astro-island ol img')).toHaveCount(2, { timeout: 20000 });
    await page.getByRole('button', { name: 'Merge and download' }).click();
    await expect(page.getByRole('heading', { name: 'Your merged file is ready' })).toBeVisible({ timeout: 60000 });
    // At least a tool worker and the PDF.js worker it started for the thumbnails.
    expect(workers.length).toBeGreaterThanOrEqual(2);
    expect(workers.every((url) => url.startsWith('blob:'))).toBe(true);
  });

  test('PDF to JPG (PDF.js drawing and its picture decoders)', async ({ page }) => {
    const workers = startedWorkers(page);
    await open(page, '/pdf-to-jpg');
    await page.locator('input[type=file]').first().setInputFiles(fixture('images.pdf'));
    await page.getByRole('button', { name: 'Convert to JPG and download' }).click();
    await expect(page.getByRole('heading', { name: 'Your download is ready' })).toBeVisible({ timeout: 90000 });
    expect(workers.length).toBeGreaterThanOrEqual(2);
    expect(workers.every((url) => url.startsWith('blob:'))).toBe(true);
  });

  test('Sign PDF (pdf-lib)', async ({ page }) => {
    await open(page, '/sign-pdf');
    await page.locator('input[type=file]').first().setInputFiles(fixture('text.pdf'));
    await expect(page.getByRole('radio', { name: 'Type your name', exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('textbox', { name: 'Your name' }).fill('Ana Ruiz');
    await page.getByRole('button', { name: 'Sign and download' }).click();
    await expect(page.getByRole('heading', { name: 'Your signed file is ready' })).toBeVisible({ timeout: 60000 });
  });

  test('Split PDF (the zip)', async ({ page }) => {
    await open(page, '/split-pdf');
    await page.locator('input[type=file]').first().setInputFiles(fixture('text.pdf'));
    await expect(page.getByRole('button', { name: 'Split and download' })).toBeEnabled({ timeout: 30000 });
    await page.getByRole('button', { name: 'Split and download' }).click();
    await expect(page.getByRole('heading', { name: 'Your files are ready' })).toBeVisible({ timeout: 60000 });
  });
});
