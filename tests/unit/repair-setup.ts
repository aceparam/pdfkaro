// Repair PDF's unit tests share this: it makes no request and logs nothing. Kept apart from repair-helpers.ts, which
// the end-to-end tests import too and which must not import Vitest.

import { afterAll, beforeAll, expect } from 'vitest';

/**
 * Replaces `fetch` and every console method for the file's tests, recording each use, and fails after them if any was
 * used: Repair PDF makes no request and logs nothing (its guards silence pdf-lib's console while it runs).
 */
export function noRequestsOrLogs(): void {
  const fetched: unknown[] = [];
  const logged: string[] = [];
  const realFetch = globalThis.fetch;
  const realConsole = new Map<string, unknown>();
  beforeAll(() => {
    globalThis.fetch = ((...args: unknown[]) => {
      fetched.push(args[0]);
      throw new Error('No request may be made by Repair PDF.');
    }) as typeof fetch;
    const target = console as unknown as Record<string, unknown>;
    for (const key of Object.keys(target)) {
      if (typeof target[key] !== 'function') continue;
      realConsole.set(key, target[key]);
      target[key] = () => logged.push(key);
    }
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    const target = console as unknown as Record<string, unknown>;
    for (const [key, value] of realConsole) target[key] = value;
    expect(fetched).toEqual([]);
    expect(logged).toEqual([]);
  });
}
