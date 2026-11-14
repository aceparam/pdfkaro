// Reorder pages: writes every page of one PDF, in the order the visitor chose.
//
// Every page is kept, so nothing is left out: the file's bookmarks, attached
// files, details, tags, named destinations and threads are left exactly as they
// were (bookmarks point to pages, so they follow them). The new file has no
// password and no restrictions, by the owner's decision of 13 Nov 2026.
//
// It works on the shared plain copy and writes through the shared
// `writePages`, with no outline update, so no bookmark is rewritten.

import { passwordFrom, plainCopy, writePages } from '../plain';
import type { Engine, Inspector } from '../types';
import { inspectPdf } from '../inspect';

type Options = { passwords?: unknown; order?: unknown };

/**
 * The order to write: every page from 1 to `pages` exactly once. The length is
 * checked first, so the work is bounded by the file, not by what was sent.
 */
export function pageOrder(pages: number, order: unknown): number[] {
  if (!Array.isArray(order) || order.length !== pages) throw new Error('The page order is not valid.');
  const seen = new Uint8Array(pages + 1);
  const copy: number[] = new Array<number>(pages);
  for (let index = 0; index < pages; index++) {
    const page: unknown = order[index];
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > pages || seen[page]) throw new Error('The page order is not valid.');
    seen[page] = 1;
    copy[index] = page;
  }
  return copy;
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Reorder takes one file.');
  const { plain, pages } = await plainCopy(tools, file, passwordFrom(options));
  const order = pageOrder(pages, options.order);
  onProgress({ stage: 'writing', percent: 0 });
  const output = await writePages(tools, plain, order);
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};

export const inspect: Inspector = inspectPdf;
