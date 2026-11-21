// The rules for the options a tool shows (`options` in its registry words), as
// plain functions. A choice always holds a value with which the main button
// works, so no option ever holds it back and there is no "not valid" state.

import type { ToolOption } from '../tools/registry';
import type { State } from './state';

/** What the visitor has chosen, by option key. `{}` is every option at its start. */
export type Choices = Readonly<Record<string, string>>;

/** The value an option shows: the one chosen when it is among the option's values, else its starting value. */
export function chosenValue(option: ToolOption, choices: Choices): string {
  const chosen = Object.hasOwn(choices, option.key) ? choices[option.key] : undefined;
  return chosen !== undefined && option.choices.some((choice) => choice.value === chosen) ? chosen : option.initial;
}

/** What the engine is sent for the tool's options: every option's value by its key, or `{}` for a tool with none. */
export function optionsToSend(options: readonly ToolOption[] | undefined, choices: Choices): Record<string, string> {
  const sent: Record<string, string> = {};
  for (const option of options ?? []) sent[option.key] = chosenValue(option, choices);
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
 * Whether focus moves to the chosen radio button of the first option: in a tool with options, when
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
