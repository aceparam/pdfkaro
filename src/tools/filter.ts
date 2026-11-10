// The rule behind the home page filter box. A plain function, so it is tested
// in Node without rendering anything.

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

/** The words that say how many tools match. Empty when nothing has been typed. */
export function matchStatus(phrase: string, count: number): string {
  if (normalise(phrase) === '') return '';
  if (count === 0) return 'No tools match.';
  if (count === 1) return '1 tool matches.';
  return `${count} tools match.`;
}
