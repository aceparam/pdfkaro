// Reads one PDF before a job: how many pages it has, or why it cannot be read.
// Shared by every tool that takes PDFs and uses qpdf.

import { finished, qpdfFrom, saidInvalidPassword } from './qpdf';
import type { Inspector } from './types';

export const inspectPdf: Inspector = async (file, password, tools) => {
  const qpdf = await qpdfFrom(tools);
  qpdf.write('/in.pdf', file);
  // A password goes only inside --password=, where qpdf takes it as it is.
  const args = password === undefined ? [] : [`--password=${password}`];
  const { code, printed } = qpdf.call([...args, '--show-npages', '/in.pdf']);
  if (finished(code)) {
    const pages = Number.parseInt(printed.trim().split('\n').pop() ?? '', 10);
    return Number.isInteger(pages) && pages > 0 ? { kind: 'ready', pages } : { kind: 'damaged' };
  }
  if (saidInvalidPassword(printed)) return password === undefined ? { kind: 'needs-password' } : { kind: 'wrong-password' };
  return { kind: 'damaged' };
};
