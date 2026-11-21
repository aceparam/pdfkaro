// The rules for the options a tool shows (`options` in its registry words), as
// plain functions. A choice always holds a value with which the main button
// works, so it never holds the button back. A text is the job's input: it starts
// empty, and it holds the button back while it is empty, too long, or has a
// character its rule does not take (src/widget/option-values.ts).

import type { ChoiceOption, TextOption, ToolOption } from '../tools/registry';
import { number } from './format';
import { cleanText, textProblem, textRule, type CharacterRule, type TextProblem, type TextRule, type TextTable } from './option-values';
import type { State } from './state';

/** What each option holds, by option key: a choice's value, or a text as typed. `{}` is every option at its start. */
export type Choices = Readonly<Record<string, string>>;

/** The value a choice shows: the one chosen when it is among the option's values, else its starting value. */
export function chosenValue(option: ChoiceOption, choices: Choices): string {
  const chosen = Object.hasOwn(choices, option.key) ? choices[option.key] : undefined;
  return chosen !== undefined && option.choices.some((choice) => choice.value === chosen) ? chosen : option.initial;
}

/** What a text's field shows: the text exactly as typed, else ''. */
export function typedText(option: TextOption, choices: Choices): string {
  const typed = Object.hasOwn(choices, option.key) ? choices[option.key] : undefined;
  return typeof typed === 'string' ? typed : '';
}

/**
 * What the engine is sent for the tool's options: a choice's value and a text cleaned (composed and
 * trimmed), by key, or `{}` for a tool with none. The main button cannot start a job while a text has
 * a problem, and the engine checks the text again.
 */
export function optionsToSend(options: readonly ToolOption[] | undefined, choices: Choices): Record<string, string> {
  const sent: Record<string, string> = {};
  for (const option of options ?? []) sent[option.key] = option.kind === 'choice' ? chosenValue(option, choices) : cleanText(typedText(option, choices));
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
): Record<string, unknown> {
  return { ...preset, ...itemOption, ...optionsToSend(options, choices) };
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

/** The one sentence for a text's problem, in the tool's words where it has them. */
export function textSentence(option: TextOption, rule: TextRule, problem: TextProblem): string {
  switch (problem.kind) {
    case 'empty':
      return option.emptySentence;
    case 'too-long':
      return `This text has ${number(problem.length)} characters. Use ${number(rule.maxLength)} or fewer.`;
    case 'characters': {
      // The rule itself is said by the hint under the field (the registry test checks every hint ends with it), so not again here.
      const named = problem.refused.length >= 1 && problem.refused.length <= 3 && problem.refused.every(nameable);
      return named ? `${listed(problem.refused)} cannot be used.` : 'Some characters cannot be used.';
    }
  }
}

/** A text holding the main button back: its key, what is wrong, and the sentence. */
export type OptionHold = { key: string; kind: TextProblem['kind']; sentence: string };

/**
 * The first text, in registry order, that holds the main button back, or null. A choice never holds
 * it. `empty` is tied to the main button under it; `characters` and `too-long` are shown by the field
 * and tied to the main button from there. A text with no line in optionTexts (which the registry test
 * forbids) always holds, with its empty sentence, so a text is never sent unchecked.
 */
export function optionsHold(tool: string, options: readonly ToolOption[] | undefined, choices: Choices, texts?: TextTable): OptionHold | null {
  for (const option of options ?? []) {
    if (option.kind !== 'text') continue;
    const rule = textRule(tool, option.key, texts);
    if (rule === undefined) return { key: option.key, kind: 'empty', sentence: option.emptySentence };
    const problem = textProblem(cleanText(typedText(option, choices)), rule);
    if (problem) return { key: option.key, kind: problem.kind, sentence: textSentence(option, rule, problem) };
  }
  return null;
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

/** What Enter in a text's field does: start the job, say why the main button waits, or nothing. */
export type EnterAction = { kind: 'start' } | { kind: 'say'; sentence: string } | { kind: 'nothing' };

/**
 * Enter in a text's field does what the main button does when it works. When the button waits, the
 * first sentence that says why (the one tied to the button, then the field's own) is said by the status
 * region, on every press, so Enter is never silent; the page makes a repeated sentence differ, so it is said again.
 */
export function enterAction(ready: boolean, sentences: readonly (string | null | undefined)[]): EnterAction {
  if (ready) return { kind: 'start' };
  const sentence = sentences.find((each): each is string => typeof each === 'string' && each !== '');
  return sentence === undefined ? { kind: 'nothing' } : { kind: 'say', sentence };
}
