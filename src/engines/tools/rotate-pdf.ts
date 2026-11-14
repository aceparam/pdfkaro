// Rotate PDF: writes every page of one PDF, each turned as the visitor chose.
//
// Only each page's /Rotate changes: text, links, form fields, notes,
// bookmarks, attached files, details and tags are left as they were. qpdf
// adds the turn to the one a page already has, normalising odd values as
// PDF.js draws them, so the result matches the turned thumbnail. The new file
// has no password and no restrictions, by the owner's decision of 13 Nov 2026.

import { passwordFrom, plainCopy, writeTurned, type TurnGroups } from '../plain';
import type { Engine, Inspector } from '../types';
import { inspectPdf } from '../inspect';

type Options = { passwords?: unknown; turns?: unknown };

const invalid = () => new Error('The page turns are not valid.');
const isQuarters = (value: unknown, least: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= least && value <= 3;

/**
 * The pages grouped by the quarters to add, from `{ all, pages: [[page, quarters], …] }`:
 * `all` turns every page, and a page's own quarters add to it. The list is
 * checked against the file before it is read, so the work is bounded by the file.
 */
export function pageTurns(pages: number, turns: unknown): TurnGroups {
  if (typeof turns !== 'object' || turns === null) throw invalid();
  const { all, pages: own } = turns as { all?: unknown; pages?: unknown };
  if (!isQuarters(all, 0) || !Array.isArray(own) || own.length > pages) throw invalid();
  const groups: TurnGroups = { 1: [], 2: [], 3: [] };
  const add = (page: number, quarters: number) => {
    const turn = quarters % 4;
    if (turn !== 0) groups[turn as 1 | 2 | 3].push(page);
  };
  let next = 1;
  for (const entry of own) {
    if (!Array.isArray(entry) || entry.length !== 2) throw invalid();
    const [page, quarters] = entry as unknown[];
    if (typeof page !== 'number' || !Number.isInteger(page) || page < next || page > pages || !isQuarters(quarters, 1)) throw invalid();
    // The pages between the last one named and this one take the turn of every page.
    for (; next < page; next++) add(next, all);
    add(page, all + quarters);
    next = page + 1;
  }
  for (; next <= pages; next++) add(next, all);
  return groups;
}

export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const file = files[0];
  if (!file || files.length !== 1) throw new Error('Rotate takes one file.');
  const { plain, pages } = await plainCopy(tools, file, passwordFrom(options));
  const groups = pageTurns(pages, options.turns);
  onProgress({ stage: 'writing', percent: 0 });
  const output = await writeTurned(tools, plain, groups);
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};

export const inspect: Inspector = inspectPdf;
