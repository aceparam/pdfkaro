// A small server for the built site that stands in for the host, GitHub Pages, and records each request it
// receives: what the host's logs would show of a visit. It sends GitHub Pages' cache headers
// (`Cache-Control: max-age=600`, an `ETag` and `Last-Modified`, and 304 for a matching `If-None-Match`), so the
// browser answers repeats from its own cache as it would on the host, and the server, like the host, sees
// nothing of them. It is test code, never shipped: it binds to 127.0.0.1 only, answers GET and HEAD only,
// sends no CORS headers, and refuses NUL and any path whose real path leaves dist/.
//
// A slow mode holds back PDF.js's files (PDF.js, its worker, its data and the thumbnail step) for longer than
// the page's 10-second thumbnail limit. Holding them at the server keeps the browser's cache on, where
// Playwright's `route` would turn it off.

import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distRoot = join(here, '../../dist');

/** GitHub Pages' cache lifetime, read from the preview with `curl -sI` on 22 Nov 2026. */
export const cacheSeconds = 600;

/** How long slow mode holds each of PDF.js's files: longer than the page's 10-second thumbnail limit. */
export const slowMs = 12_000;

/** PDF.js's files, held back in slow mode. */
export const slowFiles = /^\/_astro\/(pdf-[A-Za-z0-9_-]{8}\.js|pdf\.worker\.min-[A-Za-z0-9_-]{8}\.mjs|pdfjs-data-[A-Za-z0-9_-]{8}\.js|thumbnail-[A-Za-z0-9_-]{8}\.js)$/;

/** The content types GitHub Pages sends, by extension. */
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pfb': 'application/octet-stream',
};

/** One request the server received: the method, the path as asked for, and the status it was answered with. */
export type Logged = { method: string; path: string; status: number | null };

export type HostLog = {
  /** The server's origin, such as `http://127.0.0.1:43123`. */
  origin: string;
  /** Every request received, in order. */
  requests: Logged[];
  /** A place in the log, to split it into phases. */
  mark(): number;
  /** The requests received since a mark (and before another, if given). */
  since(from: number, to?: number): Logged[];
  /** How many requests are still being answered. */
  open(): number;
  /** Turns slow mode on or off. */
  setSlow(on: boolean): void;
  close(): Promise<void>;
};

/** A file under dist/ for a decoded path, or null when there is none or it would leave dist/. */
async function fileFor(root: string, decoded: string): Promise<string | null> {
  const candidates = decoded.endsWith('/') ? [`${decoded}index.html`] : [decoded, `${decoded}.html`, `${decoded}/index.html`];
  for (const candidate of candidates) {
    const full = resolve(root, `.${candidate}`);
    let real: string;
    try {
      real = await realpath(full);
    } catch {
      continue;
    }
    if (!real.startsWith(root + sep)) return null;
    try {
      if ((await stat(real)).isFile()) return real;
    } catch {
      continue;
    }
  }
  return null;
}

/** Starts the server on a free port of 127.0.0.1. */
export async function startHostLog(): Promise<HostLog> {
  const root = await realpath(distRoot);
  const requests: Logged[] = [];
  let open = 0;
  let slow = false;

  const answer = async (request: IncomingMessage, response: ServerResponse, entry: Logged) => {
    const send = (status: number, headers: Record<string, string> = {}, body?: Buffer | string) => {
      entry.status = status;
      response.writeHead(status, headers);
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') return send(405, { Allow: 'GET, HEAD' });
    const raw = (request.url ?? '/').split('?')[0]!;
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return send(400);
    }
    if (decoded.includes('\0') || !decoded.startsWith('/')) return send(400);
    const file = await fileFor(root, decoded);
    if (!file) {
      const page = await readFile(join(root, '404.html'));
      return send(404, { 'Content-Type': contentTypes['.html']! }, page);
    }
    const body = await readFile(file);
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    const headers = {
      'Cache-Control': `max-age=${cacheSeconds}`,
      ETag: etag,
      'Last-Modified': (await stat(file)).mtime.toUTCString(),
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    };
    if (slow && slowFiles.test(decoded)) await new Promise((done) => setTimeout(done, slowMs));
    if (request.headers['if-none-match'] === etag) return send(304, { 'Cache-Control': headers['Cache-Control'], ETag: etag });
    send(200, headers, body);
  };

  const server = createServer((request, response) => {
    const entry: Logged = { method: request.method ?? '', path: (request.url ?? '').split('?')[0]!, status: null };
    requests.push(entry);
    open += 1;
    response.on('close', () => {
      open -= 1;
    });
    answer(request, response, entry).catch(() => {
      if (!response.headersSent) {
        entry.status = 500;
        response.writeHead(500);
      }
      response.end();
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    mark: () => requests.length,
    since: (from, to) => requests.slice(from, to),
    open: () => open,
    setSlow(on) {
      slow = on;
    },
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
