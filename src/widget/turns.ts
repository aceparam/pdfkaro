// The turns of a tool whose pages turn: Rotate PDF. A turn for every page and
// a turn for single pages on top of it, so turning every page of a 120,000-page
// file is one number. Words say how far a page is from how it was in the file,
// never which way it points, because the file may already turn it.
// Plain functions, tested in Node.

import { number } from './format';

/** `all`: quarters every page is turned (0 to 3). `pages[n]`: page n's own quarters on top (1 to 3). */
export type Turns = { all: number; pages: Record<number, number> };

const quarter = (value: number) => ((value % 4) + 4) % 4;

/** A page's turn in quarters, 0 to 3. */
export function turnOf(turns: Turns | null, page: number): number {
  return turns ? quarter(turns.all + (turns.pages[page] ?? 0)) : 0;
}

/** Turns after one page is turned a quarter by `by` (1 right, -1 left). */
export function turnedPage(turns: Turns | null, page: number, by: 1 | -1): Turns {
  const pages = { ...(turns?.pages ?? {}) };
  const own = quarter((pages[page] ?? 0) + by);
  if (own === 0) delete pages[page];
  else pages[page] = own;
  return { all: turns?.all ?? 0, pages };
}

/** Turns after every page is turned a quarter by `by`. */
export function turnedAll(turns: Turns | null, by: 1 | -1): Turns {
  return { all: quarter((turns?.all ?? 0) + by), pages: { ...(turns?.pages ?? {}) } };
}

/** How many pages will be turned, without walking every page. */
export function turnedCount(turns: Turns | null, pages: number): number {
  if (!turns) return 0;
  const own = Object.entries(turns.pages).filter(([page]) => Number(page) <= pages);
  if (turns.all === 0) return own.length;
  // With every page turned, a page is not turned only when its own turn brings it back.
  return pages - own.filter(([, quarters]) => quarter(turns.all + quarters) === 0).length;
}

const howFar = ['', 'turned right', 'turned half round', 'turned left'] as const;

/** "Page 3, turned right", or "Page 3" for a page as it was. */
export function turnCaption(title: string, turn: number): string {
  return turn === 0 ? title : `${title}, ${howFar[turn]}`;
}

/** What the status region says after a page is turned. */
export function turnAnnouncement(page: number, turn: number): string {
  return turn === 0 ? `Page ${number(page)} is back the way it was.` : `Page ${number(page)} is now ${howFar[turn]}.`;
}

/** What the status region says after every page is turned: where they are, when no page has its own turn. */
export function allAnnouncement(turns: Turns, by: 1 | -1): string {
  if (Object.keys(turns.pages).length > 0) return `Every page turned ${by === 1 ? 'right' : 'left'}.`;
  return turns.all === 0 ? 'Every page is back the way it was.' : `Every page is now ${howFar[turns.all]}.`;
}

/** The line above the pages: how many will be turned, and always how to turn one. */
export function turnSummary(turns: Turns | null, pages: number): string {
  const how = pages === 1 ? 'Press “Turn left” or “Turn right” under it to turn it.' : 'Press “Turn left” or “Turn right” under a page to turn it, or turn every page at once.';
  const count = turnedCount(turns, pages);
  const what =
    count === 0 ? 'No pages will be turned.' : count === pages && pages > 1 ? 'Every page will be turned.' : count === 1 ? '1 page will be turned.' : `${number(count)} pages will be turned.`;
  return `${what} ${how}`;
}

/** The sentence tied to the main button while no page will be turned, or null. */
export function turnsBlocked(turns: Turns | null, pages: number): string | null {
  return turnedCount(turns, pages) === 0 ? 'Turn a page to make a new file.' : null;
}

/** The option for the engine: every page's turn and the pages' own turns, sorted by page. */
export function turnsToSend(turns: Turns | null, pages: number): { all: number; pages: [number, number][] } {
  const own = Object.entries(turns?.pages ?? {})
    .map(([page, quarters]) => [Number(page), quarters] as [number, number])
    .filter(([page]) => page <= pages)
    .sort((a, b) => a[0] - b[0]);
  return { all: turns?.all ?? 0, pages: own };
}

/** What ToolWorkspace and useToolRun ask of a tool whose pages turn, in one place. */
export const turnRules = { summary: turnSummary, blocked: turnsBlocked, option: (turns: Turns | null, pages: number) => ({ turns: turnsToSend(turns, pages) }) };
