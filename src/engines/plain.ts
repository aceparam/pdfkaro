// The steps the page engines share. Every page engine (Split PDF, Extract
// pages, Delete pages, and the page tools after them) starts from the plain
// copy: the input copied once, decrypted, by the owner's decision that page
// tools give back files with no password, and with no object streams, because
// qpdf's JSON update does not reach objects kept in an object stream. Every
// later step works on this copy, with no password.
//
// The tools that give back one file with fewer pages (Extract and Delete) also
// share the last step, `keepPages`: the kept pages, in page order, with the
// bookmarks that still apply and the files attached to the document, written
// through an argument file and checked by qpdf.

import { outlineUpdate, readStructure, updateJson } from './outline';
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

/** Pages named by number: sorted, unique whole numbers from 1 to `pages`, at least one. */
export function chosenPages(pages: number, chosen: unknown): number[] {
  if (!Array.isArray(chosen) || chosen.length === 0) throw new Error('No pages were given.');
  let previous = 0;
  for (const page of chosen) {
    if (!Number.isInteger(page) || page <= previous || page > pages) throw new Error('The pages given are not valid.');
    previous = page;
  }
  return chosen as number[];
}

/** qpdf's page list, with runs of pages joined as ranges: [1, 2, 3, 7] gives "1-3,7". */
export function pageList(pages: readonly number[]): string {
  const parts: string[] = [];
  let start = pages[0]!;
  let end = start;
  for (const page of pages.slice(1)) {
    if (page === end + 1) {
      end = page;
      continue;
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    start = end = page;
  }
  parts.push(start === end ? `${start}` : `${start}-${end}`);
  return parts.join(',');
}

/**
 * Runs qpdf with its arguments in an argument file, one per line, because qpdf
 * copies command-line arguments onto its small stack and a long page list
 * would overflow it. Every argument is a made-up path, an option or a checked
 * page list, so none holds a line break.
 */
export function callWithArgumentFile(qpdf: Qpdf, args: readonly string[]): { code: number } {
  if (args.some((arg) => /[\r\n]/.test(arg))) throw new Error('An argument held a line break.');
  qpdf.write('/args', new TextEncoder().encode(`${args.join('\n')}\n`));
  return qpdf.call(['@/args']);
}

/**
 * One new file of the pages in `keep` (sorted, unique, in range), in page
 * order, from the plain copy. It keeps the bookmarks that point to a kept page,
 * with kept children of a dropped bookmark moved up, and the files attached to
 * the document; it must pass qpdf's check. Bookmark titles never go into an error.
 */
export async function keepPages(tools: EngineTools, plain: Uint8Array, keep: readonly number[]): Promise<Uint8Array> {
  const structure = await readStructure(() => freshQpdf(tools, plain), []);
  // Delete can keep almost every page of a long file, and the check runs once per bookmark.
  const kept = new Set(keep);
  const update = outlineUpdate(structure, (page) => kept.has(page), { dropAttachments: false });

  const qpdf = await freshQpdf(tools, plain);
  const args = ['/in.pdf'];
  if (update.size > 0) {
    qpdf.write('/u.json', new TextEncoder().encode(updateJson(structure.maxObjectId, update)));
    args.push('--update-from-json=/u.json');
  }
  args.push('--pages', '.', pageList(keep), '--', '/out.pdf');
  const written = callWithArgumentFile(qpdf, args);
  if (!finished(written.code)) throw new Error(`qpdf could not write the new file (exit ${written.code}).`);
  if (!finished(qpdf.call(['--check', '/out.pdf']).code)) throw new Error("The new file did not pass qpdf's check.");
  return qpdf.read('/out.pdf');
}
