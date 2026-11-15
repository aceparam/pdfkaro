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

export type Seen = { url: string; method: string; body: string | null; origin: string; headers?: Record<string, string> };

/**
 * The request headers a browser sends by itself. A header outside this list was
 * set by a script, and could carry a file's name or contents, so it is refused.
 * `cookie` is left out on purpose: the site sets none, so a cookie is refused too.
 */
export const browserHeaders = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'host',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'priority',
  'purpose',
  'range',
  'referer',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-storage-access',
  'sec-fetch-user',
  'sec-purpose',
  'upgrade-insecure-requests',
  'user-agent',
]);

/** Watches every request from the page and its workers, and every WebSocket. */
export function watch(context: BrowserContext, page: Page): Seen[] {
  const seen: Seen[] = [];
  const record = (request: Request) => {
    // The headers Playwright knows at once, then every header the browser really sent once they are read.
    const entry: Seen = { url: request.url(), method: request.method(), body: request.postData(), origin: new URL(request.url()).origin, headers: request.headers() };
    seen.push(entry);
    request
      .allHeaders()
      .then((headers) => {
        entry.headers = { ...entry.headers, ...headers };
      })
      .catch(() => {});
  };
  context.on('request', record);
  page.on('websocket', (socket) => seen.push({ url: socket.url(), method: 'WEBSOCKET', body: null, origin: new URL(socket.url()).origin }));
  return seen;
}

/** A value with its percent escapes decoded, or null when they are malformed, which is reported, never thrown. */
function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
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
    const where = decoded(request.url) ?? request.url;
    if (decoded(request.url) === null) problems.push(`a malformed percent escape in the address: ${request.url}`);
    if (request.origin !== siteOrigin) problems.push(`another origin: ${request.url}`);
    if (request.method !== 'GET') problems.push(`${request.method} ${request.url}`);
    if (request.body) problems.push(`a body: ${request.url}`);
    if (url.search) problems.push(`data in the address: ${request.url}`);
    if (!allowed.has(url.pathname)) problems.push(`not on the list: ${request.url}`);
    for (const secret of secrets) if (where.includes(secret)) problems.push(`"${secret}" in ${request.url}`);
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      // HTTP/2 names its address parts as headers starting with a colon; they are the address, checked above.
      if (name.startsWith(':')) continue;
      if (name.toLowerCase() === 'cookie') problems.push(`a cookie, which the site never sets: ${request.url}`);
      else if (!browserHeaders.has(name.toLowerCase())) problems.push(`a header the browser does not send itself, ${name}: ${request.url}`);
      const plain = decoded(value);
      if (plain === null) problems.push(`a malformed percent escape in the ${name} header of ${request.url}`);
      for (const secret of secrets) if ((plain ?? value).includes(secret)) problems.push(`"${secret}" in the ${name} header of ${request.url}`);
    }
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
