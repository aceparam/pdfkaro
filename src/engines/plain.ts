// The first steps every page engine shares (Split PDF, Extract pages, and the
// page tools after them). The input is copied once, decrypted, by the owner's
// decision that page tools give back files with no password, and with no
// object streams, because qpdf's JSON update does not reach objects kept in an
// object stream. Every later step works on this copy, with no password.

import { finished, qpdfFrom, saidInvalidPassword, type Qpdf } from './qpdf';
import type { EngineTools } from './types';

/** The password given for the one file, if any. */
export function passwordFrom(options: { passwords?: unknown }): string | undefined {
  const passwords = Array.isArray(options.passwords) ? options.passwords : [];
  return typeof passwords[0] === 'string' ? passwords[0] : undefined;
}

/**
 * A fresh qpdf holding these bytes as /in.pdf. One instance breaks after a few
 * hundred calls, and qpdf will not write JSON on an instance that has already
 * written anything else, so every step that needs one makes its own.
 */
export async function freshQpdf(tools: EngineTools, bytes: Uint8Array): Promise<Qpdf> {
  const qpdf = await qpdfFrom(tools);
  qpdf.write('/in.pdf', bytes);
  return qpdf;
}

/**
 * The plain copy and its page count. Only bytes come back, so the instances
 * that made them, with the input in their memory, can be let go.
 */
export async function plainCopy(tools: EngineTools, file: Uint8Array, password: string | undefined): Promise<{ plain: Uint8Array; pages: number }> {
  const passwordArgs = password === undefined ? [] : [`--password=${password}`];
  const opener = await freshQpdf(tools, file);
  const opened = opener.call([...passwordArgs, '--decrypt', '/in.pdf', '--object-streams=disable', '/plain.pdf']);
  if (!finished(opened.code)) {
    throw new Error(saidInvalidPassword(opened.printed) ? 'A password did not open the file.' : 'qpdf could not read the file.');
  }
  const plain = opener.read('/plain.pdf');
  const counted = (await freshQpdf(tools, plain)).call(['--show-npages', '/in.pdf']);
  if (!finished(counted.code)) throw new Error('qpdf could not read the file.');
  const pages = Number(counted.out.split('\n').find((line) => /^\d+$/.test(line.trim())));
  if (!Number.isInteger(pages) || pages < 1) throw new Error('The file has no pages.');
  return { plain, pages };
}
