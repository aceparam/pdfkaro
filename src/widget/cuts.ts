// Split PDF's own words about its cuts: what the main button will give, and
// what the status region says after a cut is marked or cleared. They are used
// only for a tool whose registry entry has a 'cut-after' toggle. Plain
// functions, tested in Node.

const number = (value: number) => value.toLocaleString('en-GB');
const files = (count: number) => (count === 1 ? '1 file' : `${number(count)} files`);

/** "3 and 7", "3, 7 and 9". */
function list(pages: readonly number[]): string {
  const shown = pages.map(number);
  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

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

/** The button that shows the next batch of pages, in real units. */
export function showMoreLabel(shown: number, pages: number, batch: number): string {
  return `Show pages ${number(shown + 1)} to ${number(Math.min(pages, shown + batch))}`;
}

/** What the status region says after more pages are shown. */
export function shownAnnouncement(shown: number, pages: number): string {
  return `Showing ${number(Math.min(shown, pages))} of ${number(pages)} pages`;
}
