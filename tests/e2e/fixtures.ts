// Every end-to-end test runs with a watch for Content Security Policy
// violations, on the page and on the scope of each of its workers, the
// PDF.js worker started inside the tool worker included. A test that sees one
// fails, naming the directive and what was blocked.
//
// A browser writes no console message of its own for a violation in a worker,
// and Playwright's init scripts do not reach workers. So a listener is added
// on each worker's own scope as Playwright reports it, and it writes a line
// with a fixed marker to that worker's console, which is read here. The page
// gets the same listener from an init script.
//
// Specs import `test` and `expect` from here, never from @playwright/test
// (lint enforces it). A test that opens its own browser context calls
// `await watchPolicy(context)` before opening a page in it.

import { test as base, expect, type BrowserContext, type ConsoleMessage, type Page, type Worker } from '@playwright/test';

export { expect };

/** One violation the browser reported: where, the directive it broke, and what was blocked. */
export type PolicyViolation = { where: string; directive: string; blocked: string };

const marker = '[pdfkaro csp violation] ';

// The watches opened during the current test; the automatic fixture checks them all after it.
let current: PolicyViolation[][] = [];

// Every page and worker watched in the current test, each able to say when its console has caught up.
// A violation's line can reach the test a moment after the test's last step, so before the check each live
// page and worker writes a line of its own and the check waits for it, at most two seconds. Console lines from
// one page or worker arrive in order, so once that line is in, every earlier one is too. A page or worker
// already closed is skipped.
const sentinel = '[pdfkaro csp watch caught up] ';
const flushWait = 2000;
let flushers: (() => Promise<void>)[] = [];

function flusher(target: { evaluate(fn: (token: string) => void, token: string): Promise<unknown> }) {
  const waiting = new Map<string, () => void>();
  const onConsole = (message: ConsoleMessage) => {
    const done = waiting.get(message.text());
    if (done) {
      waiting.delete(message.text());
      done();
    }
  };
  const flush = async () => {
    const token = `${sentinel}${Math.random()}`;
    const arrived = new Promise<void>((done) => waiting.set(token, done));
    try {
      await target.evaluate((line) => console.log(line), token);
    } catch {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([arrived, new Promise<void>((done) => (timer = setTimeout(done, flushWait)))]);
    clearTimeout(timer);
  };
  flushers.push(flush);
  return onConsole;
}

function readLine(where: string, records: PolicyViolation[]) {
  return (message: ConsoleMessage) => {
    const text = message.text();
    if (!text.startsWith(marker)) return;
    const { directive, blocked } = JSON.parse(text.slice(marker.length)) as { directive: string; blocked: string };
    records.push({ where, directive, blocked });
  };
}

function watchWorker(worker: Worker, records: PolicyViolation[]) {
  worker.on('console', readLine(`worker ${worker.url()}`, records));
  worker.on('console', flusher(worker));
  // The tool client ends a worker after every job, so it may be gone before the listener is added.
  worker
    .evaluate((line) => {
      self.addEventListener('securitypolicyviolation', (event) => {
        console.log(line + JSON.stringify({ directive: event.effectiveDirective, blocked: event.blockedURI }));
      });
      // Lets a test's own probe worker wait until it is watched before it tries anything.
      (self as unknown as { policyWatched: boolean }).policyWatched = true;
    }, marker)
    .catch(() => {});
}

function watchPage(page: Page, records: PolicyViolation[]) {
  // Playwright gives the page a worker's console lines too; those are read from the worker itself, below.
  const fromPage = readLine('page', records);
  const caughtUp = flusher(page);
  page.on('console', (message) => {
    if (message.worker()) return;
    fromPage(message);
    caughtUp(message);
  });
  page.on('worker', (worker) => watchWorker(worker, records));
}

/**
 * Watches every page of `context`, and every worker of those pages, for
 * policy violations, and has the current test fail on any. Call it before
 * opening a page in a context the test made itself. Returns the list the
 * violations go into.
 */
export async function watchPolicy(context: BrowserContext): Promise<PolicyViolation[]> {
  const records: PolicyViolation[] = [];
  current.push(records);
  await context.addInitScript((line) => {
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        console.log(line + JSON.stringify({ directive: event.effectiveDirective, blocked: event.blockedURI }));
      },
      true,
    );
  }, marker);
  for (const page of context.pages()) watchPage(page, records);
  context.on('page', (page) => watchPage(page, records));
  return records;
}

type PolicyFixtures = {
  /** Set to true in a test that blocks something on purpose; it then checks `policyViolations` itself. */
  blocksOnPurpose: boolean;
  /** What the watch on the test's own context saw. */
  policyViolations: PolicyViolation[];
};

export const test = base.extend<PolicyFixtures>({
  blocksOnPurpose: [false, { option: true }],
  policyViolations: [
    async ({ context, blocksOnPurpose }, use) => {
      current = [];
      flushers = [];
      const records = await watchPolicy(context);
      await use(records);
      await Promise.all(flushers.map((flush) => flush()));
      const seen = current.flat();
      current = [];
      flushers = [];
      if (!blocksOnPurpose) {
        expect(
          seen.map(({ where, directive, blocked }) => `${directive} blocked ${blocked || '(inline)'} in the ${where}`),
          'Content Security Policy violations',
        ).toEqual([]);
      }
    },
    { auto: true },
  ],
});
