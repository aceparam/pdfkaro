// Reads one PDF before a job: how many pages it has, or why it cannot be read.
// Shared by every tool that takes PDFs and uses qpdf.

import { finished, qpdfFrom, saidInvalidPassword } from './qpdf';
import type { Inspector } from './types';

export const inspectPdf: Inspector = async (file, password, tools) => {
  const qpdf = await qpdfFrom(tools);
  qpdf.write('/in.pdf', file);
  // A password goes only inside --password=, where qpdf takes it as it is.
  const args = password === undefined ? [] : [`--password=${password}`];
  const { code, out, printed } = qpdf.call([...args, '--show-npages', '/in.pdf']);
  if (finished(code)) {
    // The answer is the one line of digits qpdf writes to standard output; warnings go elsewhere.
    const answer = out.split('\n').find((line) => /^\d+$/.test(line.trim()));
    const pages = answer === undefined ? Number.NaN : Number(answer.trim());
    return Number.isInteger(pages) && pages > 0 ? { kind: 'ready', pages } : { kind: 'damaged' };
  }
  if (saidInvalidPassword(printed)) return password === undefined ? { kind: 'needs-password' } : { kind: 'wrong-password' };
  return { kind: 'damaged' };
};
