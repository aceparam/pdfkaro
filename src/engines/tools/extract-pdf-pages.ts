// Extract pages: copies the pages the visitor chose, in page order, into one
// new PDF.
//
// By the owner's decisions of 13 Nov 2026 the new file:
// - keeps the bookmarks that point to a chosen page, and the files attached to the document;
// - keeps the document's details, accessibility tags, named destinations and reading threads whole;
// - has no password and no restrictions.
//
// It works on the shared plain copy, keeps bookmarks through the shared outline
// update, and passes its arguments to qpdf through an argument file, because
// qpdf copies command-line arguments onto its small stack and a long page list
// would overflow it. Bookmark titles never go into an error.

import { outlineUpdate, readStructure, updateJson } from '../outline';
import { freshQpdf, passwordFrom, plainCopy } from '../plain';
import { finished, type Qpdf } from '../qpdf';
import type { Engine, Inspector } from '../types';
import { inspectPdf } from '../inspect';

type Options = { passwords?: unknown; pages?: unknown };

/** The pages to take: sorted, unique whole numbers from 1 to `pages`, at least one. */
export function chosenPages(pages: number, chosen: unknown): number[] {
  if (!Array.isArray(chosen) || chosen.length === 0) throw new Error('No pages were chosen.');
  let previous = 0;
  for (const page of chosen) {
    if (!Number.isInteger(page) || page <= previous || page > pages) throw new Error('The pages chosen are not valid.');
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
 * Runs qpdf with its arguments in an argument file, one per line, so no length
 * reaches qpdf's stack. Every argument is a made-up path, an option or a checked
 * page list, so none holds a line break.
 */
export function callWithArgumentFile(qpdf: Qpdf, args: readonly string[]): { code: number } {
  if (args.some((arg) => /[\r\n]/.test(arg))) throw new Error('An argument held a line break.');
  qpdf.write('/args', new TextEncoder().encode(`${args.join('\n')}\n`));
  return qpdf.call(['@/args']);
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Extract takes one file.');
  const { plain, pages } = await plainCopy(tools, file, passwordFrom(options));
  const chosen = chosenPages(pages, options.pages);
  onProgress({ stage: 'writing', percent: 0 });

  const structure = await readStructure(() => freshQpdf(tools, plain), []);
  const keep = new Set(chosen);
  const update = outlineUpdate(structure, (page) => keep.has(page), { dropAttachments: false });

  const qpdf = await freshQpdf(tools, plain);
  const args = ['/in.pdf'];
  if (update.size > 0) {
    qpdf.write('/u.json', new TextEncoder().encode(updateJson(structure.maxObjectId, update)));
    args.push('--update-from-json=/u.json');
  }
  args.push('--pages', '.', pageList(chosen), '--', '/out.pdf');
  const written = callWithArgumentFile(qpdf, args);
  if (!finished(written.code)) throw new Error(`qpdf could not write the new file (exit ${written.code}).`);
  if (!finished(qpdf.call(['--check', '/out.pdf']).code)) throw new Error("The new file did not pass qpdf's check.");
  const output = qpdf.read('/out.pdf');
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};

export const inspect: Inspector = inspectPdf;
