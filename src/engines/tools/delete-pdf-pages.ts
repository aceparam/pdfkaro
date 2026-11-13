// Delete pages: writes one new PDF of the pages the visitor did not mark, in
// page order. It is Extract pages with the marks turned round.
//
// By the owner's decisions of 13 Nov 2026 the new file:
// - keeps the bookmarks that point to a page left, and the files attached to the document;
// - keeps the document's details, accessibility tags, named destinations and reading threads whole;
// - has no password and no restrictions.
//
// It works on the shared plain copy and writes through the shared `keepPages`.

import { chosenPages, keepPages, passwordFrom, plainCopy } from '../plain';
import type { Engine, Inspector } from '../types';
import { inspectPdf } from '../inspect';

type Options = { passwords?: unknown; pages?: unknown };

/**
 * The pages left once the marked ones are taken out, in page order. The marks
 * are checked as `chosenPages` checks them; marking every page is refused,
 * because a PDF needs at least one page. One pass over the pages.
 */
export function pagesLeft(pages: number, marked: unknown): number[] {
  const marks = chosenPages(pages, marked);
  if (marks.length >= pages) throw new Error('Every page was marked; a PDF needs at least one page.');
  const left: number[] = [];
  let next = 0;
  for (let page = 1; page <= pages; page++) {
    if (marks[next] === page) next++;
    else left.push(page);
  }
  return left;
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Delete takes one file.');
  const { plain, pages } = await plainCopy(tools, file, passwordFrom(options));
  const keep = pagesLeft(pages, options.pages);
  onProgress({ stage: 'writing', percent: 0 });
  const output = await keepPages(tools, plain, keep);
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};

export const inspect: Inspector = inspectPdf;
