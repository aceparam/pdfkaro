// What each kind of per-page toggle means, in one place: which pages have no
// toggle, what the engine is sent, the line above the pages, what the status
// region says, whether the main button can run, and how many pages the one
// result has. ToolWorkspace, useToolRun and PageGrid ask here and name no kind.
// Plain functions, tested in Node.

import type { ToggleKind } from '../tools/registry';
import { cutAnnouncement, cutSummary } from './cuts';
import { list, number } from './format';

export type ToggleRules = {
  /** Pages with no toggle. */
  skip(pages: number): number[];
  /** What the engine is sent, from the pages marked (sorted). */
  option(marks: readonly number[]): Record<string, unknown>;
  /** The line above the pages. */
  summary(pages: number, marks: readonly number[]): string;
  /** What the status region says after `page` is marked or cleared; `marks` is the new list. */
  announce(pages: number, marks: readonly number[], page: number, marked: boolean): string;
  /** The sentence tied to the main button when it cannot run yet, or null when it can. */
  blocked(pages: number, marks: readonly number[]): string | null;
  /** How many pages the one result has, when the kind knows. */
  resultPages?(pages: number, marks: readonly number[]): number;
  /** Whether a pressed toggle draws a cut line on its page. */
  drawsCut: boolean;
};

/** Up to this many chosen pages are named; past it the line gives a count. */
const namedPages = 5;

export const toggleRules: Record<ToggleKind, ToggleRules> = {
  'cut-after': {
    skip: (pages) => [pages],
    option: (marks) => ({ cuts: [...marks] }),
    summary: cutSummary,
    announce: cutAnnouncement,
    blocked: () => null,
    drawsCut: true,
  },
  take: {
    skip: () => [],
    option: (marks) => ({ pages: [...marks] }),
    summary: (_pages, marks) => {
      if (marks.length === 0) return 'No pages chosen. Press “Take” under each page you want.';
      if (marks.length === 1) return `Page ${number(marks[0]!)} chosen.`;
      if (marks.length <= namedPages) return `Pages ${list(marks)} chosen.`;
      return `${number(marks.length)} pages chosen.`;
    },
    announce: (_pages, marks, page, marked) => {
      if (marked) return `Page ${number(page)} chosen, ${number(marks.length)} in all.`;
      if (marks.length === 0) return `Page ${number(page)} no longer chosen. No pages chosen.`;
      return `Page ${number(page)} no longer chosen, ${number(marks.length)} in all.`;
    },
    blocked: (_pages, marks) => (marks.length === 0 ? 'Choose at least one page for the new file.' : null),
    resultPages: (_pages, marks) => marks.length,
    drawsCut: false,
  },
  drop: {
    skip: () => [],
    option: (marks) => ({ pages: [...marks] }),
    summary: (pages, marks) => {
      if (marks.length === 0) return 'No pages marked. Press “Delete” under each page you want to delete.';
      const left = pages - marks.length;
      const leftLine = left === 0 ? 'No pages will be left.' : left === 1 ? '1 page will be left.' : `${number(left)} pages will be left.`;
      if (marks.length === 1) return `Page ${number(marks[0]!)} will be deleted. ${leftLine}`;
      if (marks.length <= namedPages) return `Pages ${list(marks)} will be deleted. ${leftLine}`;
      return `${number(marks.length)} pages will be deleted. ${leftLine}`;
    },
    announce: (pages, marks, page, marked) => {
      // Marking the last unmarked page makes the main button unavailable, so it is said.
      if (marked && marks.length >= pages) return `Page ${number(page)} marked to delete. Every page is marked, so no pages will be left.`;
      if (marked) return `Page ${number(page)} marked to delete, ${number(marks.length)} in all.`;
      if (marks.length === 0) return `Page ${number(page)} no longer marked. No pages marked.`;
      return `Page ${number(page)} no longer marked, ${number(marks.length)} in all.`;
    },
    blocked: (pages, marks) => {
      if (marks.length === 0) return 'Mark at least one page to delete.';
      if (marks.length >= pages) return 'A PDF needs at least one page. Leave one or more pages unmarked.';
      return null;
    },
    resultPages: (pages, marks) => pages - marks.length,
    drawsCut: false,
  },
};

/** The marks after `page` is toggled: added in number order, or taken out. Shared by the reducer and the announcement. */
export function toggledMarks(marks: readonly number[], page: number): number[] {
  return marks.includes(page) ? marks.filter((each) => each !== page) : [...marks, page].sort((a, b) => a - b);
}
