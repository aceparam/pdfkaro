// Each tool's accepted values for each option it shows, written once. The
// registry lists the same values with their labels, and its test fails on any
// difference; an engine reads its own line here to check what it is sent, as
// engines read zip-limits.ts. A plain module: the engine, the worker and the
// page may all read it. Each tool's change adds its own line, such as
// `'add-page-numbers': { position: [...] }`.

/** Each tool's accepted values for each option, by tool id and option key. */
export const optionValues: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  'add-page-numbers': { position: ['bottom-left', 'bottom-centre', 'bottom-right', 'top-left', 'top-centre', 'top-right'] },
  'sign-pdf': {
    source: ['type', 'draw', 'picture'],
    page: ['last', 'first', 'every'],
    position: ['bottom-left', 'bottom-centre', 'bottom-right', 'top-left', 'top-centre', 'top-right'],
  },
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
export const optionTexts: TextTable = {
  'watermark-pdf': { text: { maxLength: 50, characters: 'standard-font' } },
  'sign-pdf': { name: { maxLength: 50, characters: 'standard-font' } },
};

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

// ---------------------------------------------------------------------------
// Drawings. What a drawing is, written once: lines of whole-number points in the
// pad's own units. The pad (src/components/DrawingPad) makes it, the widget holds
// and sends it, and the tool's engine checks it here, through `acceptedDrawing`,
// before it reads the file. Each tool's most lines and points are written once
// too, by tool id and key; the registry holds only a drawing's words. A drawing
// is numbers only: nothing turns it into a picture.

/** The pad's own units: 1,000 across and 400 down, y counted down from the top; its line is 6 units wide. */
export const pad = { width: 1000, height: 400, line: 6 } as const;

/** A drawing: its lines, each a flat list of whole-number points [x0, y0, x1, y1, …] in the pad's units. */
export type Drawing = readonly (readonly number[])[];

/** What one drawing takes: the most lines and the most points in all. */
export type DrawingRule = { maxLines: number; maxPoints: number };

export type DrawingTable = Readonly<Record<string, Readonly<Record<string, DrawingRule>>>>;

/** Each tool's drawings, by tool id and key. Each tool's change adds its own line, such as `'sign-pdf': { drawing: {...} }`. */
export const optionDrawings: DrawingTable = {
  // Far past a signature (a slow one at 120 points a second for ten seconds is 1,200), and small enough that its form stays a few hundred kilobytes.
  'sign-pdf': { drawing: { maxLines: 200, maxPoints: 20000 } },
};

/** A tool's own rule for one of its drawings, or `undefined`. Only own keys count, as in `acceptedValue`. */
export function drawingRule(tool: string, key: string, table: DrawingTable = optionDrawings): DrawingRule | undefined {
  if (!Object.hasOwn(table, tool)) return undefined;
  const byKey = table[tool];
  if (byKey === undefined || !Object.hasOwn(byKey, key)) return undefined;
  return byKey[key];
}

/**
 * For an engine: the drawing when `value` is one under the tool's own rule for `key`; else
 * `undefined`, and the engine throws `DrawingRefused` before it reads the file. Sizes are checked
 * before any point is read: a plain array of 1 to `maxLines` lines, each a plain array (so a typed
 * array is refused) of an even length of at least 2, their lengths summed to no more than
 * `2 × maxPoints`. Only then each point, read by index so a hole is refused: a whole number (so NaN,
 * Infinity, text and null are refused), x from 0 to 1,000 and y from 0 to 400.
 */
export function acceptedDrawing(tool: string, key: string, value: unknown, table: DrawingTable = optionDrawings): Drawing | undefined {
  const rule = drawingRule(tool, key, table);
  if (rule === undefined || !Array.isArray(value)) return undefined;
  const lines: unknown[] = value;
  if (lines.length < 1 || lines.length > rule.maxLines) return undefined;
  let total = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line: unknown = lines[index];
    if (!Array.isArray(line) || line.length < 2 || line.length % 2 !== 0) return undefined;
    total += line.length;
    if (total > 2 * rule.maxPoints) return undefined;
  }
  for (const line of lines as unknown[][]) {
    for (let index = 0; index < line.length; index += 1) {
      const v: unknown = line[index];
      if (typeof v !== 'number' || !Number.isInteger(v)) return undefined;
      const most = index % 2 === 0 ? pad.width : pad.height;
      if (v < 0 || v > most) return undefined;
    }
  }
  return lines as Drawing;
}

/** Thrown by an engine that refuses its drawing, before it reads the file. Known to the worker by its name. Its message never holds the drawing. */
export class DrawingRefused extends Error {
  override name = 'DrawingRefused';
  constructor() {
    super('The drawing was refused.');
  }
}

// ---------------------------------------------------------------------------
// Pictures. What a picture option may be, written once: each tool's types (JPG,
// PNG or both) and the sizes in bytes and pixels above which the page shows a
// notice. Nothing is refused for its size (SPEC.md sets no fixed size limit). The
// page sniffs a pick's first bytes against the types, the tool's engine reads the
// same line to check a picture before the job (`pictureOutcome` in
// src/engines/picture.ts) and again when it runs (`acceptedPicture`); the registry
// holds only a picture's words.

/** A picture option's types. Not `PictureType`, which src/engines/picture.ts already uses for 'jpeg' | 'png'. */
export type PictureMime = 'image/jpeg' | 'image/png';

/** What one picture may be: its types, and the sizes above which the page shows a notice. Nothing is refused for its size. */
export type PictureRule = { types: readonly PictureMime[]; noticeBytes: number; noticePixels: number };

export type PictureTable = Readonly<Record<string, Readonly<Record<string, PictureRule>>>>;

/** Each tool's pictures, by tool id and key. Each tool's change adds its own line, such as `'sign-pdf': { picture: {...} }`. */
export const optionPictures: PictureTable = {
  // A notice, not a limit: 16 million pixels is the cap PDF to JPG sets on each picture it makes, and 8 MB is half the drawing step's fixed 16 MB of room.
  'sign-pdf': { picture: { types: ['image/jpeg', 'image/png'], noticeBytes: 8 * 1024 * 1024, noticePixels: 16_000_000 } },
};

/** A tool's own rule for one of its pictures, or `undefined`. Only own keys count, as in `acceptedValue`. */
export function pictureRule(tool: string, key: string, table: PictureTable = optionPictures): PictureRule | undefined {
  if (!Object.hasOwn(table, tool)) return undefined;
  const byKey = table[tool];
  if (byKey === undefined || !Object.hasOwn(byKey, key)) return undefined;
  return byKey[key];
}

/** Thrown by an engine that refuses its picture, before it reads the file. Known to the worker by its name. Its message holds nothing of the picture. */
export class PictureRefused extends Error {
  override name = 'PictureRefused';
  constructor() {
    super('The picture was refused.');
  }
}

/**
 * Thrown by an engine that finds the picture alone would make its new file pass its size budget. Known to
 * the worker by its name. Its message holds nothing of the picture: the page names it from its own state.
 */
export class PictureTooLarge extends Error {
  override name = 'PictureTooLarge';
  constructor() {
    super('The picture is too large to place.');
  }
}

// ---------------------------------------------------------------------------
// New passwords. What a password the visitor sets may hold, written once: each
// tool's most characters and character rule, by tool id and key. The registry
// holds only its words. The widget checks what is typed here, and the tool's
// engine checks what it is sent with `acceptedPassword`. A password is never
// changed: not trimmed, not composed, not cut.

/** The rules for which characters a new password takes. One for now. */
export type PasswordCharacterRule = 'printable-ascii';

/** What one new password takes: the most characters (1 to 127, the format's own limit for a 256-bit key) and its character rule. */
export type PasswordRule = { maxLength: number; characters: PasswordCharacterRule };

export type PasswordTable = Readonly<Record<string, Readonly<Record<string, PasswordRule>>>>;

/** Each tool's new passwords, by tool id and key. */
export const optionPasswords: PasswordTable = {
  // 127 is the format's own limit for a 256-bit key.
  'protect-pdf': { newPassword: { maxLength: 127, characters: 'printable-ascii' } },
};

/**
 * The characters each rule takes, as one inclusive range of code points. Printable ASCII, U+0020 to U+007E: the
 * only set every PDF reader turns into the same bytes for a 256-bit key (Adobe applies SASLprep first, PDF.js and
 * qpdf do not, and inside this range SASLprep changes nothing). Checked as a range everywhere, never as a set.
 */
export const passwordCharacters: Readonly<Record<PasswordCharacterRule, { from: number; to: number }>> = {
  'printable-ascii': { from: 0x20, to: 0x7e },
};

/** What is wrong with a new password. It holds nothing of the password: no character and no length. */
export type PasswordProblem = { kind: 'empty' } | { kind: 'characters' } | { kind: 'edge-space' } | { kind: 'too-long' };

/**
 * What is wrong with one password as typed, or null. Empty first, then characters the rule does not take, then a
 * space first or last, then length, so a visitor who pasted a long line in another script first learns its
 * characters cannot be used. Counted by UTF-16 length, which equals bytes for the characters the rule takes.
 * Never changes the password: no trimming, composing or cutting.
 */
export function passwordProblem(password: string, rule: PasswordRule): PasswordProblem | null {
  if (password === '') return { kind: 'empty' };
  const range = Object.hasOwn(passwordCharacters, rule.characters) ? passwordCharacters[rule.characters] : undefined;
  for (let index = 0; index < password.length; index += 1) {
    const unit = password.charCodeAt(index);
    if (range === undefined || unit < range.from || unit > range.to) return { kind: 'characters' };
  }
  if (password.startsWith(' ') || password.endsWith(' ')) return { kind: 'edge-space' };
  if (password.length > rule.maxLength) return { kind: 'too-long' };
  return null;
}

/** A tool's own rule for one of its new passwords, or `undefined`. Only own keys count, as in `acceptedValue`. */
export function passwordRule(tool: string, key: string, table: PasswordTable = optionPasswords): PasswordRule | undefined {
  if (!Object.hasOwn(table, tool)) return undefined;
  const byKey = table[tool];
  if (byKey === undefined || !Object.hasOwn(byKey, key)) return undefined;
  return byKey[key];
}

/**
 * For an engine: `value` itself, the very string it was sent, when it is a string with no problem under the tool's
 * own rule for `key`; else `undefined`, and the engine throws `PasswordRefused` before it reads the file.
 */
export function acceptedPassword(tool: string, key: string, value: unknown, table: PasswordTable = optionPasswords): string | undefined {
  if (typeof value !== 'string') return undefined;
  const rule = passwordRule(tool, key, table);
  if (rule === undefined) return undefined;
  return passwordProblem(value, rule) === null ? value : undefined;
}

/** Thrown by an engine that refuses its new password, before it reads the file. Known to the worker by its name. Its message never holds the password. */
export class PasswordRefused extends Error {
  override name = 'PasswordRefused';
  constructor() {
    super('The password was refused.');
  }
}
