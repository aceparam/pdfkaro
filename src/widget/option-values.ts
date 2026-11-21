// Each tool's accepted values for each option it shows, written once. The
// registry lists the same values with their labels, and its test fails on any
// difference; an engine reads its own line here to check what it is sent, as
// engines read zip-limits.ts. A plain module: the engine, the worker and the
// page may all read it. Each tool's change adds its own line, such as
// `'add-page-numbers': { position: [...] }`.

/** Each tool's accepted values for each option, by tool id and option key. */
export const optionValues: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  'add-page-numbers': { position: ['bottom-left', 'bottom-centre', 'bottom-right', 'top-left', 'top-centre', 'top-right'] },
};

/**
 * The value an engine was sent for one of its options, when it is a string
 * among that option's accepted values; else `undefined`, which the engine
 * refuses before it reads the file. Only own keys count, so `__proto__` or
 * `toString` is never taken for a tool or an option.
 */
export function acceptedValue(
  tool: string,
  key: string,
  value: unknown,
  values: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = optionValues,
): string | undefined {
  if (typeof value !== 'string' || !Object.hasOwn(values, tool)) return undefined;
  const byKey = values[tool];
  if (byKey === undefined || !Object.hasOwn(byKey, key)) return undefined;
  const accepted = byKey[key];
  return accepted !== undefined && accepted.includes(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// Texts. Each tool's typed texts, written once like the values above: the most
// characters and the character rule, by tool id and key. The registry holds only
// a text's words; its test checks each text has its line here and the reverse.
// The widget reads a line to check what is typed, and the tool's engine reads
// the same line, through `acceptedText`, to check what it is sent.

/** The rules for which characters a text takes. One for now. */
export type CharacterRule = 'standard-font';

/** What one text takes: the most characters, counted after cleaning, and its character rule. */
export type TextRule = { maxLength: number; characters: CharacterRule };

export type TextTable = Readonly<Record<string, Readonly<Record<string, TextRule>>>>;

/** Each tool's texts, by tool id and key. Each tool's change adds its own line, such as `'watermark-pdf': { text: {...} }`. */
export const optionTexts: TextTable = {};

/**
 * The characters the standard PDF fonts Helvetica, Times and Courier, in every weight, draw with
 * pdf-lib's encoding for them, Windows Western (WinAnsi): U+0020 to U+007E, U+00A0 to U+00FF less
 * the soft hyphen U+00AD (invisible in the field, but drawn as a hyphen), and the 27 characters
 * WinAnsi places at 0x80 to 0x9F. 217 in all. pdf-lib draws any other character as "?" without a word.
 */
const winAnsiExtra = [
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
];
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** The characters each rule takes, as code points. */
export const characterRules: Readonly<Record<CharacterRule, ReadonlySet<number>>> = {
  'standard-font': new Set([...range(0x20, 0x7e), ...range(0xa0, 0xff).filter((point) => point !== 0xad), ...winAnsiExtra]),
};

/** The text as it is counted, checked and drawn: composed (NFC), then trimmed at both ends. Spaces inside are kept. */
export function cleanText(raw: string): string {
  return raw.normalize('NFC').trim();
}

/** What is wrong with a text. */
export type TextProblem = { kind: 'empty' } | { kind: 'characters'; refused: string[] } | { kind: 'too-long'; length: number };

/**
 * What is wrong with a cleaned text, or null. Empty first, then characters the rule does not take
 * (each once, in the order typed), then length, counted by code point: a visitor who pasted a long
 * line in another script learns first that its characters cannot be used, which shortening would not fix.
 */
export function textProblem(text: string, rule: TextRule): TextProblem | null {
  if (text === '') return { kind: 'empty' };
  const takes = characterRules[rule.characters];
  const characters = [...text];
  const refused = [...new Set(characters.filter((character) => !takes.has(character.codePointAt(0) ?? -1)))];
  if (refused.length > 0) return { kind: 'characters', refused };
  if (characters.length > rule.maxLength) return { kind: 'too-long', length: characters.length };
  return null;
}

/** A tool's own rule for one of its texts, or `undefined`. Only own keys count, as in `acceptedValue`. */
export function textRule(tool: string, key: string, table: TextTable = optionTexts): TextRule | undefined {
  if (!Object.hasOwn(table, tool)) return undefined;
  const byKey = table[tool];
  if (byKey === undefined || !Object.hasOwn(byKey, key)) return undefined;
  return byKey[key];
}

/**
 * For an engine: the cleaned text when `value` is a string with no problem under the tool's own
 * rule for `key`; else `undefined`, and the engine throws `TextRefused` before it reads the file.
 */
export function acceptedText(tool: string, key: string, value: unknown, table: TextTable = optionTexts): string | undefined {
  if (typeof value !== 'string') return undefined;
  const rule = textRule(tool, key, table);
  if (rule === undefined) return undefined;
  const text = cleanText(value);
  return textProblem(text, rule) === null ? text : undefined;
}

/** Thrown by an engine that refuses its text, before it reads the file. Known to the worker by its name. Its message never holds the text. */
export class TextRefused extends Error {
  override name = 'TextRefused';
  constructor() {
    super('The text was refused.');
  }
}
