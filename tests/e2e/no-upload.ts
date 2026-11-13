// The no-upload watcher, shared by every browser tool's end-to-end test. It
// watches every request from the page and its workers, and judges each one
// against a tool's own exact list of the site's files. Each tool passes its own
// list, so one tool's files never widen another's.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page, Request } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

/** The built files whose names match, as the addresses a page asks for. */
export function builtFiles(pattern: RegExp): string[] {
  return readdirSync(join(here, '../../dist/_astro'))
    .filter((name) => pattern.test(name))
    .map((name) => `/_astro/${name}`);
}

export type Seen = { url: string; method: string; body: string | null; origin: string };

/** Watches every request from the page and its workers, and every WebSocket. */
export function watch(context: BrowserContext, page: Page): Seen[] {
  const seen: Seen[] = [];
  const record = (request: Request) =>
    seen.push({ url: request.url(), method: request.method(), body: request.postData(), origin: new URL(request.url()).origin });
  context.on('request', record);
  page.on('websocket', (socket) => seen.push({ url: socket.url(), method: 'WEBSOCKET', body: null, origin: new URL(socket.url()).origin }));
  return seen;
}

/** Everything wrong with the requests made after a pick. Empty when nothing broke the promise. */
export function violations(seen: Seen[], siteOrigin: string, secrets: string[], allowedFiles: string[]): string[] {
  const allowed = new Set(allowedFiles);
  const problems: string[] = [];
  for (const request of seen) {
    // A thumbnail is shown through a blob: address, which never leaves the browser. Only those of the site's own origin pass.
    if (request.url.startsWith('blob:')) {
      if (new URL(request.url.slice('blob:'.length)).origin !== siteOrigin) problems.push(`a blob: address of another origin: ${request.url}`);
      if (request.method !== 'GET' || request.body) problems.push(`a blob: address used to send: ${request.url}`);
      continue;
    }
    const url = new URL(request.url, siteOrigin);
    const where = decodeURIComponent(request.url);
    if (request.origin !== siteOrigin) problems.push(`another origin: ${request.url}`);
    if (request.method !== 'GET') problems.push(`${request.method} ${request.url}`);
    if (request.body) problems.push(`a body: ${request.url}`);
    if (url.search) problems.push(`data in the address: ${request.url}`);
    if (!allowed.has(url.pathname)) problems.push(`not on the list: ${request.url}`);
    for (const secret of secrets) if (where.includes(secret)) problems.push(`"${secret}" in ${request.url}`);
  }
  return problems;
}

/** What the browser holds after a job: storage, the title and the address. */
export async function traces(page: Page, context: BrowserContext) {
  const stored = await page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const opfsNames: string[] = [];
    for await (const name of (opfs as unknown as { keys(): AsyncIterable<string> }).keys()) opfsNames.push(name);
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length,
      opfs: opfsNames,
      title: document.title,
      address: location.href,
    };
  });
  return { ...stored, cookies: await context.cookies() };
}
