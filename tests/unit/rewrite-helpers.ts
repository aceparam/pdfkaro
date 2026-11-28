// The code of the shared steps that Protect with a password and Remove a password run, read from their source, so
// each tool's scan for forbidden options and console use covers them as well as the tool's own file. Only the code
// is taken, from each step's `export` to its end, never the comments above it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The code of one exported step: a function to its closing brace at the line start, or a one-line const. */
function stepCode(path: string, name: string): string {
  const source = readFileSync(join(__dirname, '../../src/engines', path), 'utf8');
  const start = source.search(new RegExp(`^export (?:async function|function|const) ${name}\\b`, 'm'));
  if (start < 0) throw new Error(`${name} was not found in ${path}.`);
  const line = source.slice(start, source.indexOf('\n', start));
  const end = line.trimEnd().endsWith(';') ? start + line.length : source.indexOf('\n}', start) + 2;
  return source.slice(start, end);
}

/** The shared one-file rewrite and its arguments (qpdf.ts) and the certificate check (inspect.ts), code only. */
export const sharedStepCode = (): Record<string, string> => ({
  rewriteArgs: stepCode('qpdf.ts', 'rewriteArgs'),
  rewrite: stepCode('qpdf.ts', 'rewrite'),
  certificateEncrypted: stepCode('inspect.ts', 'certificateEncrypted'),
  inspectPdfNamingCertificates: stepCode('inspect.ts', 'inspectPdfNamingCertificates'),
});

/** Every console method, replaced while `work` runs; gives what each was called with. */
export async function withSilentConsole(work: () => Promise<void>): Promise<unknown[][]> {
  const said: unknown[][] = [];
  const methods = Object.keys(console).filter((key) => typeof (console as unknown as Record<string, unknown>)[key] === 'function');
  const saved = new Map(methods.map((key) => [key, (console as unknown as Record<string, unknown>)[key]]));
  for (const key of methods) (console as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => said.push([key, ...args]);
  try {
    await work();
  } finally {
    for (const [key, value] of saved) (console as unknown as Record<string, unknown>)[key] = value;
  }
  return said;
}
