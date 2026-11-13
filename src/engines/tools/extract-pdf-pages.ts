// Extract pages: copies the pages the visitor chose, in page order, into one
// new PDF.
//
// By the owner's decisions of 13 Nov 2026 the new file:
// - keeps the bookmarks that point to a chosen page, and the files attached to the document;
// - keeps the document's details, accessibility tags, named destinations and reading threads whole;
// - has no password and no restrictions.
//
// It works on the shared plain copy and writes through the shared `keepPages`,
// which Delete pages uses too.

import { chosenPages, keepPages, passwordFrom, plainCopy } from '../plain';
import type { Engine, Inspector } from '../types';
import { inspectPdf } from '../inspect';

type Options = { passwords?: unknown; pages?: unknown };

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Extract takes one file.');
  const { plain, pages } = await plainCopy(tools, file, passwordFrom(options));
  const chosen = chosenPages(pages, options.pages);
  onProgress({ stage: 'writing', percent: 0 });
  const output = await keepPages(tools, plain, chosen);
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};

export const inspect: Inspector = inspectPdf;
