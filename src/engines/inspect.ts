// Reads one PDF before a job: how many pages it has, or why it cannot be read.
// Shared by every tool that takes PDFs and uses qpdf.

import { finished, qpdfFrom, saidInvalidPassword } from './qpdf';
import type { EngineTools, InspectOutcome, Inspector } from './types';

/**
 * Reads one PDF with qpdf: the outcome, and what qpdf printed, for an engine that needs to tell kinds of failure
 * apart (Remove a password tells a certificate from damage). The printed text stays in the worker: the worker's
 * answer to the page carries the outcome only.
 */
export async function readPdf(file: Uint8Array, password: string | undefined, tools: EngineTools): Promise<{ outcome: InspectOutcome; printed: string }> {
  const qpdf = await qpdfFrom(tools);
  qpdf.write('/in.pdf', file);
  // A password goes only inside --password=, where qpdf takes it as it is.
  const args = password === undefined ? [] : [`--password=${password}`];
  const { code, out, printed } = qpdf.call([...args, '--show-npages', '/in.pdf']);
  if (finished(code)) {
    // The answer is the one line of digits qpdf writes to standard output; warnings go elsewhere.
    const answer = out.split('\n').find((line) => /^\d+$/.test(line.trim()));
    const pages = answer === undefined ? Number.NaN : Number(answer.trim());
    return { outcome: Number.isInteger(pages) && pages > 0 ? { kind: 'ready', pages } : { kind: 'damaged' }, printed };
  }
  if (saidInvalidPassword(printed)) return { outcome: password === undefined ? { kind: 'needs-password' } : { kind: 'wrong-password' }, printed };
  return { outcome: { kind: 'damaged' }, printed };
}

export const inspectPdf: Inspector = async (file, password, tools) => (await readPdf(file, password, tools)).outcome;
