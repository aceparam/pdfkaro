// Split PDF's own words about its cuts: what the main button will give, and
// what the status region says after a cut is marked or cleared. They are used
// only for a tool whose registry entry has a 'cut-after' toggle. Plain
// functions, tested in Node.

import { list, number } from './format';

const files = (count: number) => (count === 1 ? '1 file' : `${number(count)} files`);

/** Up to this many cuts are named; past it the line gives a count. */
export const namedCuts = 5;

/** The line above the pages: what the main button will give. `cuts` are sorted. */
export function cutSummary(pages: number, cuts: readonly number[]): string {
  if (pages === 1) return 'This file has one page. You will get it back as one file.';
  if (cuts.length === 0) return `No cuts marked. You will get one file per page, ${files(pages)}.`;
  const what = cuts.length === 1 ? `Cut after page ${number(cuts[0]!)}` : cuts.length <= namedCuts ? `Cuts after pages ${list(cuts)}` : `${number(cuts.length)} cuts marked`;
  return `${what}. You will get ${files(cuts.length + 1)}.`;
}

/** What the status region says after a cut is marked or cleared. */
export function cutAnnouncement(pages: number, cuts: readonly number[], page: number, marked: boolean): string {
  const summary = cutSummary(pages, cuts);
  if (!marked) return `Cut after page ${number(page)} cleared. ${summary}`;
  // The summary names the cut unless it only counts them.
  return cuts.length > namedCuts ? `Cut after page ${number(page)}. ${summary}` : summary;
}
