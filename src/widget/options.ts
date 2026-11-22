// The rules for the options a tool shows (`options` in its registry words), as
// plain functions. A choice always holds a value with which the main button
// works, so it never holds the button back. A text is the job's input: it starts
// empty, and it holds the button back while it is empty, too long, or has a
// character its rule does not take (src/widget/option-values.ts). A drawing is
// the job's input too: it starts empty, and it holds the button back while
// nothing is drawn. A picture is the job's input as well: it holds the button
// back until one is chosen and read, and while the one chosen cannot be used.
// A new password is the job's input too: two hidden fields, both empty at first,
// holding the button back until both hold the same password its rule takes. Its
// value is never in the widget's state: useToolRun holds it, and passes it in.

import type { ChoiceOption, DrawingOption, NewPasswordOption, PictureOption, TextOption, ToolOption } from '../tools/registry';
import { formatSize, number } from './format';
import {
  cleanText,
  drawingRule,
  optionPasswords,
  optionPictures,
  passwordProblem,
  passwordRule,
  pictureRule,
  textProblem,
  textRule,
  type CharacterRule,
  type Drawing,
  type DrawingTable,
  type PasswordCharacterRule,
  type PasswordProblem,
  type PasswordRule,
  type PasswordTable,
  type PictureRule,
  type PictureTable,
  type TextProblem,
  type TextRule,
  type TextTable,
} from './option-values';
import type { PictureEntry, State } from './state';

/** What each option holds, by option key: a choice's value, a text as typed, or a drawing's lines. `{}` is every option at its start. */
export type Choices = Readonly<Record<string, string | Drawing>>;

/** Which of a new password's two fields: the password, or the same password again. */
export type NewPasswordField = 'first' | 'again';

/** What each new password's two fields hold, by option key, exactly as typed. Held by useToolRun, never in the state. */
export type NewPasswords = Readonly<Record<string, { readonly first: string; readonly again: string }>>;

/**
 * What the rules read besides the choices, each part defaulting as before when left out: the tables (texts,
 * drawings, pictures and new passwords; their own modules' when left out), the pictures chosen (the state's),
 * what each new password's fields hold (useToolRun's), and the keys of the new passwords whose first field is
 * still being typed (`typing`: focus is in it and nothing has asked for its sentence since the last key).
 */
export type Held = {
  texts?: TextTable;
  drawings?: DrawingTable;
  pictures?: Readonly<Record<string, PictureEntry>>;
  pictureTable?: PictureTable;
  newPasswords?: NewPasswords;
  passwordTable?: PasswordTable;
  typing?: ReadonlySet<string>;
};

/** What a new password's fields hold, as typed; both '' when nothing is. Only own keys count. */
export function typedPasswords(option: Pick<NewPasswordOption, 'key'>, newPasswords: NewPasswords | undefined): { first: string; again: string } {
  const held = newPasswords !== undefined && Object.hasOwn(newPasswords, option.key) ? newPasswords[option.key] : undefined;
  return { first: typeof held?.first === 'string' ? held.first : '', again: typeof held?.again === 'string' ? held.again : '' };
}

/** The value a choice shows: the one chosen when it is among the option's values, else its starting value. */
export function chosenValue(option: ChoiceOption, choices: Choices): string {
  const chosen = Object.hasOwn(choices, option.key) ? choices[option.key] : undefined;
  return typeof chosen === 'string' && option.choices.some((choice) => choice.value === chosen) ? chosen : option.initial;
}

/** What a drawing's box shows: its lines, else none. A string under its key is never taken for a drawing. */
/** One shared empty drawing, so an empty pad is not given a new array, and repainted, on every render. */
const noDrawing: Drawing = Object.freeze([]) as Drawing;

export function drawnLines(option: DrawingOption, choices: Choices): Drawing {
  const drawn = Object.hasOwn(choices, option.key) ? choices[option.key] : undefined;
  return Array.isArray(drawn) ? drawn : noDrawing;
}

/** What a text's field shows: the text exactly as typed, else ''. */
export function typedText(option: TextOption, choices: Choices): string {
  const typed = Object.hasOwn(choices, option.key) ? choices[option.key] : undefined;
  return typeof typed === 'string' ? typed : '';
}

/**
 * Whether an option is shown: it names no condition, or the earlier choice it names holds the value
 * it names. The choice's value is read as everywhere else (`chosenValue`), so a stored value that is
 * not one of its values counts as its start. A condition that names no choice (which the registry
 * test forbids) hides its option, so nothing unchecked is ever held or sent.
 */
export function optionShown(option: ToolOption, options: readonly ToolOption[], choices: Choices): boolean {
  const when = option.when;
  if (when === undefined) return true;
  const named = options.find((each) => each.key === when.key);
  if (named === undefined || named.kind !== 'choice') return false;
  return chosenValue(named, choices) === when.value;
}

/**
 * The options on screen, held and sent, in registry order: every option of a tool whose options
 * name no condition. A hidden option keeps what it holds in `choices`, for when it is shown again.
 */
export function shownOptions(options: readonly ToolOption[] | undefined, choices: Choices): ToolOption[] {
  const all = options ?? [];
  return all.filter((option) => optionShown(option, all, choices));
}

/**
 * What the engine is sent for the tool's options: a choice's value, a text cleaned (composed and
 * trimmed), a drawing's lines as they are and a new password's first field exactly as typed, by key,
 * or `{}` for a tool with none. Only shown options are sent: a hidden one sends no key at all. A new
 * password's second field is never sent. The main button cannot start a job while a text or a new
 * password has a problem or a drawing is empty, and the engine checks each again.
 */
export function optionsToSend(options: readonly ToolOption[] | undefined, choices: Choices, held: Held = {}): Record<string, string | Drawing> {
  const sent: Record<string, string | Drawing> = {};
  for (const option of shownOptions(options, choices)) {
    if (option.kind === 'choice') sent[option.key] = chosenValue(option, choices);
    else if (option.kind === 'text') sent[option.key] = cleanText(typedText(option, choices));
    else if (option.kind === 'drawing') sent[option.key] = drawnLines(option, choices);
    else if (option.kind === 'new-password') sent[option.key] = typedPasswords(option, held.newPasswords).first;
    // A picture's bytes go beside the files (`picturesToSend`), never in the options.
  }
  return sent;
}

/**
 * Everything a job is sent besides the files: the page's preset, then what the page's items
 * say (marks, order or turns), then the options. No preset key is an option key (the registry
 * test), so nothing the page promises is replaced.
 */
export function jobOptions(
  preset: Readonly<Record<string, string | number | boolean>> | undefined,
  itemOption: Readonly<Record<string, unknown>>,
  options: readonly ToolOption[] | undefined,
  choices: Choices,
  held: Held = {},
): Record<string, unknown> {
  return { ...preset, ...itemOption, ...optionsToSend(options, choices, held) };
}

/** What each character rule takes, in words: the second sentence when characters are refused, and the end of each tool's hint. */
export const ruleAdvice: Readonly<Record<CharacterRule, string>> = {
  'standard-font': 'Use letters from English and other Western European languages, numbers and common marks.',
};

/**
 * Whether a refused character is shown back to the visitor by name: only a Latin letter of one code
 * point, capital, small or title case (Ł, ő, ğ), and not a fullwidth one (U+FF00 to U+FFEF), which
 * looks like a letter the rule takes. Never a number, punctuation or symbol, since a refused one
 * often looks like one the rule takes (U+2010 hyphen beside "-", U+2212 minus, fullwidth marks);
 * never a modifier letter, mark, space, control or format character, a letter of another script or
 * an emoji. So the page never prints an invisible or direction-changing mark, or a name that looks
 * like an allowed character; the rest get "Some characters cannot be used."
 */
function nameable(character: string): boolean {
  const point = character.codePointAt(0) ?? 0;
  return /^[\p{Lu}\p{Ll}\p{Lt}]$/u.test(character) && /^\p{Script=Latin}$/u.test(character) && !(point >= 0xff00 && point <= 0xffef);
}

/** "Ł", "Ł and ź", "Ł, ź and ő". */
function listed(characters: readonly string[]): string {
  if (characters.length === 1) return characters[0] ?? '';
  return `${characters.slice(0, -1).join(', ')} and ${characters[characters.length - 1] ?? ''}`;
}

/** The one sentence for a text's problem, in the tool's words where it has them; a refused character's with the tool's `charactersAdvice` after it. */
export function textSentence(option: TextOption, rule: TextRule, problem: TextProblem): string {
  switch (problem.kind) {
    case 'empty':
      return option.emptySentence;
    case 'too-long':
      return `This text has ${number(problem.length)} characters. Use ${number(rule.maxLength)} or fewer.`;
    case 'characters': {
      // The rule itself is said by the hint under the field (the registry test checks every hint ends with it), so not again here.
      const named = problem.refused.length >= 1 && problem.refused.length <= 3 && problem.refused.every(nameable);
      const sentence = named ? `${listed(problem.refused)} cannot be used.` : 'Some characters cannot be used.';
      // The tool's way forward for another script (Sign PDF: drawing or a picture), after either sentence: a name with Ł needs it too.
      return option.charactersAdvice ? `${sentence} ${option.charactersAdvice}` : sentence;
    }
  }
}

/** What is wrong between a new password's two fields, once the first has no problem of its own. */
export type PairProblem = 'again-empty' | 'again-partial' | 'mismatch';

/**
 * How the second field stands against the first: null when the two are the same; `again-empty` while the second is
 * empty; `again-partial` while it is a shorter start of the first, so still being typed; else `mismatch`.
 */
export function pairProblem(first: string, again: string): PairProblem | null {
  if (again === first) return null;
  if (again === '') return 'again-empty';
  if (again.length < first.length && first.startsWith(again)) return 'again-partial';
  return 'mismatch';
}

/** What each password character rule takes, in words: the end of each tool's hint. A draft for the owner's review. */
export const passwordAdvice: Readonly<Record<PasswordCharacterRule, string>> = {
  'printable-ascii': 'Use English letters without accents, numbers, spaces and marks such as @, # and -.',
};

/** What holds the main button back for a new password: the first field's problem, a quiet space at its end while typed, or the pair's. */
export type PasswordHoldKind = PasswordProblem['kind'] | 'edge-space-quiet' | PairProblem;

/**
 * The one sentence for a new password's problem: fixed words only, each saying what to do next. Never a character,
 * a number of characters typed, or the password: the status region reads these aloud, and a refused character or a
 * length is part of the secret. Only the tool's own limit is said, for a password too long.
 */
export function passwordSentence(option: Pick<NewPasswordOption, 'emptySentence' | 'againSentence'>, rule: Pick<PasswordRule, 'maxLength'>, problem: { kind: PasswordHoldKind }): string {
  switch (problem.kind) {
    case 'empty':
      return option.emptySentence;
    case 'characters':
      return 'Some characters cannot be used. Use only the characters listed under the box.';
    case 'edge-space':
      return 'A password cannot start or end with a space.';
    case 'too-long':
      return `This password is too long. Use ${number(rule.maxLength)} characters or fewer.`;
    // The first field has text in it, so "Type a password first." would not be true: the step that comes next.
    case 'edge-space-quiet':
    case 'again-empty':
    case 'again-partial':
      return option.againSentence;
    case 'mismatch':
      return 'The two passwords are not the same. Type the password again in this box.';
  }
}

/**
 * What holds the main button back. A text's problem kinds; `reading` for a picture still being read; a picture's
 * problem by its status (`refused`, `damaged`, `unsupported`); a new password's (`PasswordHoldKind`). `empty`,
 * `reading`, `again-empty`, `again-partial` and `edge-space-quiet` are said under the main button.
 */
export type HoldKind = TextProblem['kind'] | 'reading' | 'refused' | 'damaged' | 'unsupported' | PasswordHoldKind;

/**
 * A text, a drawing, a picture or a new password holding the main button back: its key, what is wrong, and the
 * sentence. A drawing is only ever `empty`. A new password's says which of its fields the sentence belongs to.
 */
export type OptionHold = { key: string; kind: HoldKind; sentence: string; field?: NewPasswordField };

/**
 * Whether a hold's sentence goes under the main button (nothing chosen or typed yet, a picture still being read, a
 * new password's second field empty or still being typed, or a space at the end of a first field still being typed),
 * not by its field.
 */
export function holdsUnderButton(hold: Pick<OptionHold, 'kind'>): boolean {
  return hold.kind === 'empty' || hold.kind === 'reading' || hold.kind === 'again-empty' || hold.kind === 'again-partial' || hold.kind === 'edge-space-quiet';
}

/** The ids the main button's `aria-describedby` may name for a hold: the paragraph under it, and each field's sentence by key. */
export type HoldIds = {
  tied: string;
  text(key: string): string;
  picture(key: string): string;
  firstPassword(key: string): string;
  againPassword(key: string): string;
};

/**
 * The id of the element that holds a hold's sentence: the paragraph under the main button for a hold said there,
 * else its field's sentence, by the kind of option it belongs to and, for a new password, by its field.
 */
export function holdErrorId(hold: OptionHold, options: readonly ToolOption[], ids: HoldIds): string {
  if (holdsUnderButton(hold)) return ids.tied;
  const kind = options.find((option) => option.key === hold.key)?.kind;
  if (kind === 'picture') return ids.picture(hold.key);
  if (kind === 'new-password') return hold.field === 'again' ? ids.againPassword(hold.key) : ids.firstPassword(hold.key);
  return ids.text(hold.key);
}

/**
 * What holds the main button back for one shown new password, or null. The first field's problem, then the pair's.
 * A space at the end of a first field still being typed (its key in `typing`) holds quietly, under the button, since
 * every password with a space inside passes through one; a space at the start never does. One with no rule (which
 * the registry test forbids) always holds, with its empty sentence, so none is sent unchecked.
 */
function newPasswordHold(tool: string, option: NewPasswordOption, held: Held): OptionHold | null {
  const rule = passwordRule(tool, option.key, held.passwordTable ?? optionPasswords);
  if (rule === undefined) return { key: option.key, kind: 'empty', sentence: option.emptySentence, field: 'first' };
  const { first, again } = typedPasswords(option, held.newPasswords);
  const problem = passwordProblem(first, rule);
  if (problem) {
    const quiet = problem.kind === 'edge-space' && !first.startsWith(' ') && held.typing?.has(option.key) === true;
    const kind: PasswordHoldKind = quiet ? 'edge-space-quiet' : problem.kind;
    return { key: option.key, kind, sentence: passwordSentence(option, rule, { kind }), field: 'first' };
  }
  const pair = pairProblem(first, again);
  if (pair === null) return null;
  return { key: option.key, kind: pair, sentence: passwordSentence(option, rule, { kind: pair }), field: 'again' };
}

/**
 * Whether a new password's first field holds a password with no problem under the tool's rule for it, so Enter there
 * moves on to the second field. False with no rule, which the registry test forbids.
 */
export function firstPasswordAccepted(tool: string, option: Pick<NewPasswordOption, 'key'>, held: Held = {}): boolean {
  const rule = passwordRule(tool, option.key, held.passwordTable ?? optionPasswords);
  return rule !== undefined && passwordProblem(typedPasswords(option, held.newPasswords).first, rule) === null;
}

/** Tied to the main button while a picture is being read. */
export const pictureReadingSentence = 'The picture is still being read.';

/**
 * The first shown text, drawing, picture or new password, in registry order, that holds the main button back, or null. A
 * hidden one and a choice never hold it. Holds said under the main button (`holdsUnderButton`) are tied to it there; a text's `characters` and
 * `too-long`, a picture's problem and a new password's field problems are shown by the field and tied to the main button from there. A drawing holds while it has
 * no lines. A picture holds until it is chosen and read, and while it cannot be used; a ready one never holds, however large. A text,
 * drawing, picture or new password with no line in its table (which the registry test forbids) always holds, with its empty sentence, so none is
 * sent unchecked. Every part of `held` may be left out.
 */
export function optionsHold(tool: string, options: readonly ToolOption[] | undefined, choices: Choices, held: Held = {}): OptionHold | null {
  const pictures = held.pictures ?? {};
  const pictureTable = held.pictureTable ?? optionPictures;
  for (const option of shownOptions(options, choices)) {
    if (option.kind === 'new-password') {
      const hold = newPasswordHold(tool, option, held);
      if (hold) return hold;
      continue;
    }
    if (option.kind === 'drawing') {
      if (drawingRule(tool, option.key, held.drawings) === undefined || drawnLines(option, choices).length === 0) {
        return { key: option.key, kind: 'empty', sentence: option.emptySentence };
      }
      continue;
    }
    if (option.kind === 'picture') {
      const entry = chosenPicture(option, pictures);
      if (pictureRule(tool, option.key, pictureTable) === undefined || entry === undefined) return { key: option.key, kind: 'empty', sentence: option.emptySentence };
      if (entry.status === 'ready') continue;
      if (entry.status === 'reading') return { key: option.key, kind: 'reading', sentence: pictureReadingSentence };
      return { key: option.key, kind: entry.status, sentence: pictureSentence(option, entry) ?? option.emptySentence };
    }
    if (option.kind !== 'text') continue;
    const rule = textRule(tool, option.key, held.texts);
    if (rule === undefined) return { key: option.key, kind: 'empty', sentence: option.emptySentence };
    const problem = textProblem(cleanText(typedText(option, choices)), rule);
    if (problem) return { key: option.key, kind: problem.kind, sentence: textSentence(option, rule, problem) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pictures. Their bytes never reach the state: useToolRun holds them beside the files.

/** A picture option's chosen picture, or none. Only own keys count. */
export function chosenPicture(option: Pick<PictureOption, 'key'>, pictures: Readonly<Record<string, PictureEntry>>): PictureEntry | undefined {
  return Object.hasOwn(pictures, option.key) ? pictures[option.key] : undefined;
}

/**
 * The one sentence for a chosen picture's problem, naming the file, or null when it has none. Shown between the
 * field's label and its button, as React text, so a hostile name is shown, never run.
 */
export function pictureSentence(option: Pick<PictureOption, 'acceptsName'>, entry: PictureEntry): string | null {
  switch (entry.status) {
    case 'refused':
      return `${entry.name} is not ${option.acceptsName}, so it was not used. No picture is chosen.`;
    case 'damaged':
      return `${entry.name} is damaged and cannot be read. Choose another picture.`;
    case 'unsupported':
      return `${entry.name} is saved in a way this tool cannot read. Open it in a photo app, save a copy, and choose the copy.`;
    default:
      return null;
  }
}

/**
 * The line naming a chosen picture: "signature.png, 120 KB." when ready, "signature.png, Getting ready." while read;
 * none for a problem, which its sentence names. It ends with a full stop, so a screen reader pauses before the hint.
 */
export function pictureLine(entry: PictureEntry | undefined): string | null {
  if (entry === undefined) return null;
  if (entry.status === 'ready') return `${entry.name}, ${formatSize(entry.size)}.`;
  if (entry.status === 'reading') return `${entry.name}, Getting ready.`;
  return null;
}

/**
 * Whether the field's button reads its words for a second pick ("Choose another picture"): a picture is chosen,
 * being read, or was read and cannot be used. Not after a wrong pick, which leaves no picture chosen.
 */
export function picturePicked(entry: PictureEntry | undefined): boolean {
  return entry !== undefined && entry.status !== 'refused';
}

/** What the notice for a very large picture says under its heading, for a tool with no words of its own. */
export const largePictureAdvice =
  'A picture this large makes the new file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead.';

/** Pixels in words: "24 million", "16.5 million", or the count under a million. */
function pixelWords(pixels: number): string {
  if (pixels < 1_000_000) return `${number(pixels)}`;
  return `${number(Math.floor(pixels / 100_000) / 10)} million`;
}

/**
 * The notice for a ready picture over the tool's notice size in bytes or in pixels, or null: a heading naming its
 * size and pixels, and what to try. It holds nothing back: the job still runs.
 */
export function pictureNotice(
  option: Pick<PictureOption, 'largeAdvice'>,
  entry: PictureEntry | undefined,
  rule: Pick<PictureRule, 'noticeBytes' | 'noticePixels'> | undefined,
): { heading: string; advice: string } | null {
  if (entry === undefined || rule === undefined || entry.status !== 'ready' || entry.pixels === undefined) return null;
  if (entry.size <= rule.noticeBytes && entry.pixels <= rule.noticePixels) return null;
  return { heading: `${entry.name} is ${formatSize(entry.size)}, with ${pixelWords(entry.pixels)} pixels.`, advice: option.largeAdvice ?? largePictureAdvice };
}

/**
 * What a job sends beside the files: for each shown picture option whose entry is ready, its held file, by key.
 * A hidden, unchosen or unready picture is not sent.
 */
export function picturesToSend<T>(
  options: readonly ToolOption[] | undefined,
  choices: Choices,
  pictures: Readonly<Record<string, PictureEntry>>,
  held: ReadonlyMap<string, T>,
): Record<string, T> {
  const sent: Record<string, T> = {};
  for (const option of shownOptions(options, choices)) {
    if (option.kind !== 'picture' || chosenPicture(option, pictures)?.status !== 'ready') continue;
    const file = held.get(option.key);
    if (file !== undefined) sent[option.key] = file;
  }
  return sent;
}

/** How many times a picture's read, cut short by the worker being ended, is started again before it is called damaged. */
export const pictureRereads = 2;

/**
 * What to do when a picture's read was cut short (the worker was ended, such as by a thumbnail's time limit):
 * read it again while the files are listed, the same file is still held and its entry still being read, up to
 * `pictureRereads` times, then call it damaged, so a picture never stays "Getting ready"; else nothing. Never during
 * the job or on its result, where the job's own end cancels the read: a read again there would start a worker
 * holding the picture. "Go back to your file" reads it again after a failure (`picturesToReread`). A file replaced
 * by a newer pick is not held, so it is never read again, and the newer pick counts its own tries from 0.
 */
export function rereadPicture(entry: PictureEntry | undefined, stillHeld: boolean, tries: number, listing: boolean): 'read-again' | 'damaged' | 'nothing' {
  if (!listing || !stillHeld || entry?.status !== 'reading') return 'nothing';
  return tries < pictureRereads ? 'read-again' : 'damaged';
}

/** The keys of the pictures still being read, which "Go back to your file" reads again. */
export function picturesToReread(state: Pick<State, 'pictures'>): string[] {
  return Object.keys(state.pictures).filter((key) => state.pictures[key]?.status === 'reading');
}

/**
 * Whether the options are on screen: while listing, once every listed file has been read and
 * opened. Not while a file is read, while a password is asked for or tried, or for a file that
 * cannot be read; not during the job or on the result.
 */
export function optionsShown(state: Pick<State, 'step' | 'files'>): boolean {
  return state.step === 'listing' && everyFileOpen(state);
}

/** Whether files are listed and every one has been read and opened, with no password being tried. */
function everyFileOpen(state: Pick<State, 'files'>): boolean {
  return state.files.length > 0 && state.files.every((file) => file.status === 'ready' && !file.checking);
}

/**
 * A key that changes each time a new set of files has been read: the listed files' ids once every
 * one has been read and opened, else ''. It does not follow the step, so the job, Cancel and "Go
 * back to your file" keep it and focus is not moved again after them.
 */
export function readyKey(state: Pick<State, 'files'>): string {
  return everyFileOpen(state) ? state.files.map((file) => file.id).join(' ') : '';
}

/**
 * Whether focus moves to the first option (a choice's chosen radio button, or a text's field): in a tool with options, when
 * a new set of files has just been read, and only if focus is still where the widget put it (the
 * main button, the file's line or summary) or on the page body, so a visitor who went elsewhere
 * while a large file was read is left there.
 *
 * Built for a tool that takes one file. In a tool of several files, adding a file or "Leave this
 * file out" (which puts focus on the summary) gives a new key with focus still free, so focus would
 * move to the options again: the change that first gives such a tool options must handle that.
 */
export function focusMovesToOptions(hasOptions: boolean, keyNow: string, keyBefore: string, focusIsFree: boolean): boolean {
  return hasOptions && keyNow !== '' && keyNow !== keyBefore && focusIsFree;
}

/**
 * What Enter in a text's or a new password's field does: start the job, move focus to a new password's second
 * field, say why the main button waits, or nothing.
 */
export type EnterAction = { kind: 'start' } | { kind: 'next-field' } | { kind: 'say'; sentence: string } | { kind: 'nothing' };

/**
 * Enter in a text's field does what the main button does when it works. When the button waits, the
 * first sentence that says why (the one tied to the button, then the field's own) is said by the status
 * region, on every press, so Enter is never silent; the page makes a repeated sentence differ, so it is said again.
 * Enter in a new password's first field (`firstPasswordAccepted` given) moves on to its second field once the
 * first holds a password with no problem under its rule, whether or not the button works; otherwise it gives
 * the answers above.
 */
export function enterAction(ready: boolean, sentences: readonly (string | null | undefined)[], firstPasswordAccepted = false): EnterAction {
  if (firstPasswordAccepted) return { kind: 'next-field' };
  if (ready) return { kind: 'start' };
  const sentence = sentences.find((each): each is string => typeof each === 'string' && each !== '');
  return sentence === undefined ? { kind: 'nothing' } : { kind: 'say', sentence };
}
