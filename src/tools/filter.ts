// The rules behind the home page filter box. Plain functions, so they are
// tested in Node without rendering anything.

export type Filterable = {
  name: string;
  summary: string;
};

function normalise(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * True when the phrase is found in the item's name or summary.
 * The phrase is compared as plain text: no pattern is built from it.
 * An empty phrase matches everything.
 */
export function matchesPhrase(item: Filterable, phrase: string): boolean {
  const wanted = normalise(phrase);
  if (wanted === '') return true;
  return normalise(item.name).includes(wanted) || normalise(item.summary).includes(wanted);
}

export type FilteredGroup<Group extends { items: Filterable[] }> = Omit<Group, 'items'> & {
  /** Every item, each marked hidden when it does not match. */
  items: (Group['items'][number] & { hidden: boolean })[];
  /** How many items in the group match. A group with none is hidden with its heading. */
  shown: number;
};

/**
 * Marks which items match the phrase, group by group, and counts the matches.
 * Nothing is removed: an item that does not match is marked hidden, so the
 * list keeps its shape and the page can hide it.
 */
export function filterGroups<Group extends { items: Filterable[] }>(
  groups: Group[],
  phrase: string,
): { groups: FilteredGroup<Group>[]; count: number } {
  let count = 0;
  const filtered = groups.map((group) => {
    const items = group.items.map((item: Group['items'][number]) => ({
      ...item,
      hidden: !matchesPhrase(item, phrase),
    }));
    const shown = items.filter((item) => !item.hidden).length;
    count += shown;
    return { ...group, items, shown };
  });
  return { groups: filtered, count };
}

/**
 * The words that say how many tools match. Empty when nothing has been typed.
 * When nothing matches, the words also say what to try.
 */
export function matchStatus(phrase: string, count: number): string {
  if (normalise(phrase) === '') return '';
  if (count === 0) return 'No tools match. Try a shorter word.';
  if (count === 1) return '1 tool matches.';
  return `${count} tools match.`;
}
