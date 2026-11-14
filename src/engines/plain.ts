// The steps the page engines share. Every page engine (Split PDF, Extract
// pages, Delete pages, and the page tools after them) starts from the plain
// copy: the input copied once, decrypted, by the owner's decision that page
// tools give back files with no password, and with no object streams, because
// qpdf's JSON update does not reach objects kept in an object stream. Every
// later step works on this copy, with no password.
//
// The tools that give back one file with fewer pages (Extract and Delete) also
// share `keepPages`: the kept pages, in page order, with the bookmarks that
// still apply and the files attached to the document. Its last step,
// `writePages`, writes any list of pages in any order through an argument file
// and checks the result; a tool that keeps every page (Reorder) calls it alone.

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
 * would overflow it. Every argument is a made-up path, an option or a page
 * list built from checked page numbers, in any order, so none holds a line break.
 */
export function callWithArgumentFile(qpdf: Qpdf, args: readonly string[]): { code: number } {
  if (args.some((arg) => /[\r\n]/.test(arg))) throw new Error('An argument held a line break.');
  qpdf.write('/args', new TextEncoder().encode(`${args.join('\n')}\n`));
  return qpdf.call(['@/args']);
}

/**
 * Writes the pages in `list` from the plain copy as one new file, in the order
 * given, and checks it with qpdf. The list may be in any order: a sorted, unique
 * list from `chosenPages`, or every page once from a tool that reorders them.
 * `update`, when given, is a qpdf JSON update written first (`keepPages` gives
 * its outline update; a tool that keeps every page gives none, so the file's
 * bookmarks and other document-level parts are left exactly as they were).
 */
export async function writePages(tools: EngineTools, plain: Uint8Array, list: readonly number[], update?: string): Promise<Uint8Array> {
  const qpdf = await freshQpdf(tools, plain);
  const args = ['/in.pdf'];
  if (update !== undefined) {
    qpdf.write('/u.json', new TextEncoder().encode(update));
    args.push('--update-from-json=/u.json');
  }
  args.push('--pages', '.', pageList(list), '--', '/out.pdf');
  const written = callWithArgumentFile(qpdf, args);
  if (!finished(written.code)) throw new Error(`qpdf could not write the new file (exit ${written.code}).`);
  if (!finished(qpdf.call(['--check', '/out.pdf']).code)) throw new Error("The new file did not pass qpdf's check.");
  return qpdf.read('/out.pdf');
}

/** Pages grouped by the quarters to add to their turn: 1 (right), 2 (half round), 3 (left). */
export type TurnGroups = { 1: number[]; 2: number[]; 3: number[] };

/**
 * Writes every page of the plain copy, adding a turn to the pages in each
 * group, and checks the result. Only each page's /Rotate changes. The lists
 * must not repeat: qpdf keeps only the last --rotate with the same list text
 * and drops the earlier one silently. The groups never share a page, so never
 * share a list. Object streams go back in, so the result is no bigger than the
 * input for being written from the plain copy.
 */
export async function writeTurned(tools: EngineTools, plain: Uint8Array, groups: TurnGroups): Promise<Uint8Array> {
  const qpdf = await freshQpdf(tools, plain);
  const args = ['/in.pdf'];
  for (const quarters of [1, 2, 3] as const) {
    const pages = groups[quarters];
    if (pages.length > 0) args.push(`--rotate=+${quarters * 90}:${pageList(pages)}`);
  }
  args.push('--object-streams=generate', '/out.pdf');
  const written = callWithArgumentFile(qpdf, args);
  if (!finished(written.code)) throw new Error(`qpdf could not write the new file (exit ${written.code}).`);
  if (!finished(qpdf.call(['--check', '/out.pdf']).code)) throw new Error("The new file did not pass qpdf's check.");
  return qpdf.read('/out.pdf');
}

/**
 * One new file of the pages in `keep` (sorted, unique, in range), in page
 * order, from the plain copy, for a tool that leaves pages out. It keeps the
 * bookmarks that point to a kept page, with kept children of a dropped bookmark
 * moved up, and the files attached to the document; it must pass qpdf's check.
 * Bookmark titles never go into an error.
 */
export async function keepPages(tools: EngineTools, plain: Uint8Array, keep: readonly number[]): Promise<Uint8Array> {
  const structure = await readStructure(() => freshQpdf(tools, plain), []);
  // Delete can keep almost every page of a long file, and the check runs once per bookmark.
  const kept = new Set(keep);
  const update = outlineUpdate(structure, (page) => kept.has(page), { dropAttachments: false });
  return writePages(tools, plain, keep, update.size > 0 ? updateJson(structure.maxObjectId, update) : undefined);
}
