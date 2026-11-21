# Design

## Context

- `add-tool-options` gave the registry `ToolOption` with one kind, a choice; `src/widget/option-values.ts` with each tool's accepted values and `acceptedValue`; the state's `choices` (kept through Cancel, a failure and "Choose another file", cleared by "Start again" and by removing the last file); `ChoiceGroup`, inside `ToolWorkspace.tsx`, with its styles in `ToolWorkspace.module.css`; focus moving to the first option once the file is read (`readyKey`, `focusMovesToOptions`); and `jobOptions` in `useToolRun`, which sends `{ ...preset, ...items, ...options }`. Add page numbers is its one user. Its design left moving `ChoiceGroup` to its own folder for when a second kind of option arrived; this is that change.
- The main button already waits with a sentence tied to it: `aria-disabled`, a paragraph under it with the sentence, `aria-describedby` pointing at it, and a press that does nothing (Merge PDF's too few files, Extract's no page chosen, Rotate's nothing turned).
- `PasswordField` is the one typed field in the widget: a visible label, `autoComplete="off"`, no `name`, in no form, a note read with the field, and after a wrong password a bold sentence with `aria-invalid`. Enter does what its button does.
- `stamp.ts`'s `OutputLimit` is the precedent for an engine error that `worker-core` knows by its name and the page explains in its own sentence.
- **Found by experiment** (Node, `@cantoo/pdf-lib` 2.11.1): a standard font's `encodeText` does not refuse a character outside its encoding. "नम" comes out as `<3F3F>` and "Ł" as `<3F>`, that is "??" and "?", with no error. So a tool that draws typed text with a standard font must check the characters itself, or it draws question marks.

## Goals / Non-Goals

**Goals:**
- One way to declare, show, check, keep and send a typed text, reusable by Watermark and later by Sign PDF's typed signature.
- What a text accepts written once and read by the widget, the registry test and the engine.
- Keyboard, screen reader and phone use from the first version, and no way for the text to leave the page except to the tool worker.

**Non-Goals:**
- A text with a starting value or one the main button does not wait for; several lines; a live character count; characters beyond the standard fonts; a number, a colour or a slider.

## Decisions

### 1. The registry type

```ts
import type { CharacterRule } from '../widget/option-values';

/** A choice of one value from several. Its values are also listed in src/widget/option-values.ts. */
export type ChoiceOption = { kind: 'choice'; key: string; legend: string; choices: { value: string; label: string }[]; initial: string };

/**
 * A typed text, one line. It is the job's input: it starts empty, and the main button waits until it holds text.
 * Its limit and character rule are written once, in src/widget/option-values.ts, by tool id and key.
 */
export type TextOption = {
  kind: 'text';
  /** The key the engine receives: `text`. */
  key: string;
  /** The field's visible label: "Watermark text". */
  label: string;
  /** Under the field, read with it: what it takes. "Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks." */
  hint: string;
  /** Tied to the main button while the field holds no text: "Type the watermark text first." */
  emptySentence: string;
  /** When the engine refuses the text. Left out: "The text could not be used. Check it and try again." */
  refusedSentence?: string;
};

export type ToolOption = ChoiceOption | TextOption;
```

- **The limit and the rule are not in the registry** (the architect, stage 1). They are written once, in `optionTexts`, because the engine must read them and engines do not import the registry. The widget looks them up by the tool's id and the option's key (decision 5); the registry keeps only words. A choice's values stay in both places, checked equal by the test, as `add-tool-options` built them.
- `CharacterRule` is declared in `option-values.ts`, beside what each rule means, and the registry imports it as a type only, so the registry stays data and types.
- **A text starts empty and is the job's input,** so the main button waits (decision 6). A starting text was considered: it would let the main button work untouched, as `SPEC.md` "Tool page anatomy" 4 asks of options, but for Watermark it means words the visitor did not choose ("Draft") going onto their file if they press at once, and for a typed signature there is no sensible default. The owner decided that Extract pages starts with no page chosen (13 Nov 2026); that the pages chosen are the job's input and not an option is the agent's reading, recorded in `CLAUDE.md`. This change reads a typed text the same way; that is the agent's reading too, and the pull request names it for the owner. A later tool that needs an optional text with a default adds `initial` in its own change.
- `ChoiceOption` is `add-tool-options`' type, unchanged, now named.

### 2. What a text takes, written once: `src/widget/option-values.ts`

Beside `optionValues` and `acceptedValue`:

```ts
/** The rules for which characters a text takes. One for now. */
export type CharacterRule = 'standard-font';
export type TextRule = { maxLength: number; characters: CharacterRule };

/** Each tool's texts, by tool id and key: the most characters and the character rule. The widget and engines read this. */
export const optionTexts: Readonly<Record<string, Readonly<Record<string, TextRule>>>> = {};

/** The characters each rule takes. */
export const characterRules: Readonly<Record<CharacterRule, ReadonlySet<number>>>;

/** The text as it is counted, checked and drawn: composed (NFC), then trimmed at both ends. */
export function cleanText(raw: string): string;

/** What is wrong with a cleaned text, or null: empty, characters the rule does not take (each once, in order), or too long. */
export function textProblem(text: string, rule: TextRule):
  { kind: 'empty' } | { kind: 'characters'; refused: string[] } | { kind: 'too-long'; length: number } | null;

/** For the widget and an engine: a tool's own rule for a key, or undefined. */
export function textRule(tool: string, key: string, table = optionTexts): TextRule | undefined;

/** For an engine: the cleaned text when `value` is a string with no problem under the tool's own rule; else undefined. */
export function acceptedText(tool: string, key: string, value: unknown, table = optionTexts): string | undefined;

/** Thrown by an engine that refuses its text, before it reads the file. Known to the worker by its name. Its message never holds the text. */
export class TextRefused extends Error { override name = 'TextRefused'; }
```

- **`'standard-font'`** is what the standard PDF fonts Helvetica, Times and Courier (in every weight) can draw with pdf-lib's encoding for them, Windows Western (WinAnsi): U+0020 to U+007E, U+00A0 to U+00FF and the 27 characters WinAnsi places at 0x80 to 0x9F (€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ), 217 in all, written out as a list of code points. The soft hyphen, U+00AD, is left out: it is invisible in the field but would draw as a hyphen. Everything else is refused, including tabs and other control characters, direction marks such as U+202E, emoji, and letters of other scripts or of Central European languages (Ł, ő, ğ). Symbol and ZapfDingbats, the other two standard fonts, use other encodings and are not covered by this rule.
- **Cleaning:** composed form first, so "Café" typed with a separate accent is the one character "é" the rule takes; then `String.prototype.trim`, so spaces at either end are neither drawn nor counted and a text of only spaces is empty. Spaces inside are kept as typed.
- **Counting** is by code point (`[...text].length`) after cleaning, so an emoji counts as one character in the sentence.
- **Order of problems:** empty, then characters, then length, so a visitor who pasted a long Hindi line first learns that the characters cannot be used, which shortening alone would not fix. `refused` lists each refused character once, in the order typed.
- `textRule` and `acceptedText` read only own keys with `Object.hasOwn`, as `acceptedValue` does, so `__proto__` or `toString` is never taken for a tool or a key; a value that is not a string is refused.
- It sits here because engines may import from `src/widget/` and components already do (lint), and because it is where `add-tool-options` put the accepted values.

### 3. The registry test

For every tool, beside the choice checks of `add-tool-options`:
- a text's key is a plain word, unique among the tool's options, not a preset key and not a key the page's items send;
- its label, hint, `emptySentence` and `refusedSentence` (if given) are not empty and hold no exclamation mark;
- `textRule(tool.id, key)` exists, with `maxLength` a whole number from 1 to 200 and `characters` a key of `characterRules`; and every line in `optionTexts` belongs to a text the registry shows;
- a hint that names a number of characters ("Up to 50 characters") names that `maxLength`, so the hint and the limit cannot drift apart;
- a failing case for each check, built in the test with a test entry and a test table, as `optionTexts` is empty in this change.

### 4. The state and the failure

- No new field or action. `option-set { key, value }` already stores any string by key while listing, and `choices` now holds a text's raw value too, exactly as typed, so the field shows what the visitor typed. The comment on `choices` says so; its name is kept, so no other tool's code changes.
- The kept and reset rules are those of choices (the `add-tool-options` design, section 4): kept through `added`, `started`, `progressed`, `failed`, `back-to-files` and removing a file that is not the last; cleared by `reset` and by removing the last file.
- No cap on what is stored: a pasted megabyte is held, counted and refused like any other long text, and never sent. The state is still never written to storage or the address.
- **`FailureKind` gains `text-refused`** (the UX reviewer, stage 1). `worker-core` maps an error named `TextRefused` to it, as it maps `OutputLimit`; `messages.ts` accepts it. `failureSentence` gives the first text option's `refusedSentence`, else "The text could not be used. Check it and try again." The page should never send a text the engine refuses, so this is reached only if the widget and the engine disagree; it still says what to do, and "Go back to your file" keeps the text.

### 5. The rules: `src/widget/options.ts`

Plain functions, tested in Node, each given the tool's id where it needs a rule:
- `chosenValue(option, choices)` for a choice, as now; `typedText(option, choices)` for a text: the raw string stored, else `''`;
- `optionsToSend(tool, options, choices)`: a choice's value, and a text's cleaned text (`cleanText`), by key. The main button cannot start a job while a text has a problem, and the engine checks again;
- `textSentence(option, rule, problem)`:
  - `characters` with one to three refused characters, all visible letters or marks of the Latin script or common signs (not a control, format, combining or white-space character, and not of another script): "Ł and ź cannot be used. Use letters from English and other Western European languages, numbers and common marks." ("Ł cannot be used.", "Ł, ź and ő cannot be used.");
  - `characters` otherwise (another script, more than three, or anything invisible): "Use letters from English and other Western European languages, numbers and common marks." alone, since a list of Devanagari or Arabic letters, or of invisible marks, says nothing useful;
  - `too-long`: "This text has 63 characters. Use 50 or fewer." with both numbers from the text and the rule (written with `number`, so 1,204);
  - `empty`: the option's `emptySentence`;
- `optionsHold(tool, options, choices)`: the first text with a problem, as `{ key, kind, sentence }`, or null. `empty` goes under the main button; `characters` and `too-long` go by the field and are tied to the main button from there (decision 6);
- `optionsShown`, `readyKey` and `focusMovesToOptions` are unchanged.

### 6. The components and `ToolWorkspace`

**Folders** (the architect, stage 1). `src/components/ChoiceGroup/ChoiceGroup.tsx` with `ChoiceGroup.module.css` (the group's rules moved unchanged from `ToolWorkspace.module.css`), and `src/components/TextField/TextField.tsx` with `TextField.module.css`. Neither has hooks, so each can be drawn and tested alone; `ToolWorkspace` gives them their ids from its `useId`. Copying `PasswordField`'s two small rules (`.note`, muted; `.error`, bold on its own line in the text colour) into `TextField.module.css` is deliberate: each component owns its CSS Module, as the repo's layout asks, and a shared stylesheet for two rules would tie two components together for no gain.

**`TextField`'s markup:**

```tsx
<div className={`field field-short ${styles.text}`}>
  <label htmlFor={id}>{option.label}</label>
  {error ? <p id={`${id}-error`} className={styles.error}>{error}</p> : null}
  <input ref={focusRef} id={id} type="text" autoComplete="off" spellCheck={false} enterKeyHint="go" value={raw}
         aria-invalid={error ? true : undefined}
         aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
         onChange={(event) => onType(event.currentTarget.value)}
         onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onEnter(); } }} />
  <p id={`${id}-hint`} className={styles.note}>{option.hint}</p>
</div>
```

- **The sentence between the label and the field** (the UX reviewer, stage 1), as GOV.UK places error messages: on a phone the on-screen keyboard covers the lower half of the screen, and a sentence under the field would be hidden while the visitor types. The hint stays under the field. The sentence is bold in the text colour, as a wrong password's is; no red, as the site has none.
- No `name`, no form and no `maxlength`, as decided in the proposal. `field` and `field-short` are the site's own field style (a 3rem field, `--control` edge, the label bold), so nothing new is drawn; the CSS Module adds only `margin-top: 1.5rem` and the two copied rules.
- `enterKeyHint="go"` labels a phone keyboard's Enter key for what Enter does here.

**In `ToolWorkspace`:**
- **Where:** in the same place as choices, in registry order, once the file has been read, while listing.
- **The main button:**
  - while a text is empty, the existing tied paragraph shows the option's `emptySentence` (after "too few files", which comes first) and the button is `aria-disabled`;
  - while a text is too long or has characters it cannot take, the sentence is by the field, the button is `aria-disabled`, and its `aria-describedby` points at the sentence's own id (`${id}-error`), so the button reads the sentence alone, without the hint. It is not repeated under the button, so it is on screen once;
  - in both cases the button stays focusable and a press does nothing, as now. `ready` adds `optionsHold(...) === null` to what it checks.
- **Enter** in the field calls the same handler as the main button, which starts the job only when the button works, as Enter in the password field presses its button.
- **Said once:** an effect keyed on the first problem's key and kind (not its sentence, which changes with every character past the limit) says the sentence through the status region when a `characters` or `too-long` problem appears or changes kind. It says nothing when the problem goes or for `empty`, which is tied to the button from the start. Focus never moves for it, so it is announced once.
- **Focus:** `optionRef` goes on the first option's focus target: the chosen radio button of a choice, or the field of a text. `focusMovesToOptions` is unchanged, so focus moves once per set of files read, only while still free, never after Cancel or "Go back to your file".
- **Tab** from the field reaches the next option, then "Choose another file" in a one-file tool's actions row, then the main button, as for a choice.

### 7. Sending: `useToolRun`

`jobOptions(preset, jobOption(), toolId, words.options, state.choices)` now sends a text's cleaned value through `optionsToSend`. A later tool's engine checks it with `acceptedText` before it reads the file, and throws `TextRefused` if it does not take it.

## Page weight and late loading

The script before a pick is unchanged: the island's props are the same for every published tool, none of which has a text, and the components, the character list and the rules are in the workspace chunk, fetched after a pick. The character list is 217 numbers, under 1 KB before compression. The choice group's styles move from one CSS Module to another and the field adds a few lines; the stylesheets every tool page links grow by well under 0.1 KB by gzip. `npm run weigh` must pass; nothing about WebAssembly changes.

## Threats

- **What is typed.** It is the visitor's own text, but it is checked like anything from the page: only own keys, only strings, the character list, the limit, before the engine reads the file. Direction overrides, control characters and invisible marks are outside the list and refused, so a text cannot reorder or hide what is drawn. A refused character is shown back to the visitor only when it is a visible Latin letter or common sign, so the page never prints an invisible or direction-changing mark into its own sentence.
- **A huge paste.** Cleaning and counting a megabyte takes milliseconds; it is shown as too long and never sent.
- **Leaks.**
  - No `name` and no form, so it can never be submitted to an address.
  - `autocomplete="off"`, for three reasons (the privacy reviewer, stage 1): the browser does not offer or keep the text in its form memory for later suggestions; Chrome and Firefox leave such a field out of the form state they save to restore a page from the back/forward history; and they leave it out of session restore after a crash or restart, which Firefox writes to disk in its session file. The widget also forgets everything on `pagehide`, so a page brought back has no file or text anyway.
  - `spellcheck="false"`, so a browser's online spell checker (such as Chrome's enhanced spell check or Edge's Editor) is not offered it.
  - It is never in storage, the address, the title or an error; `TextRefused`'s message holds no text.
  - Keyboard apps on phones and browser extensions are outside the page's control; the page text of a tool that takes a text claims nothing about them.
- **No file parsing** is added. Malicious PDFs, oversized files and hostile file names are untouched by this change.

## Tests

- **Unit, `tests/unit/options.test.ts`:** `cleanText` (composed form, "Cafe" plus a separate accent becomes "Café"; trimming spaces and no-break spaces at both ends; inside spaces kept); `textProblem` (empty, only spaces, 50 taken and 51 too long with the count, an emoji counted once and refused, a tab, a soft hyphen, U+202E, "नमस्ते", "తెలుగు", "مرحبا", "中文", "Łódź" with `refused` `['Ł', 'ź']`, and characters before length); `textRule` and `acceptedText` with a filled table (a good text cleaned, a number, `null`, an empty string, too long, a refused character, `__proto__`, `toString`); `typedText`, `optionsToSend` (a choice and a text together, the text cleaned), `textSentence` (one, two and three refused Latin characters; four; Devanagari, Arabic and Chinese with no list; a tab or U+202E with no list; too long with numbers written with `number`; empty), `optionsHold` (empty, then a problem, then none; a choice never holds); the reducer's `option-set` with a text, kept and cleared as choices are.
- **The character rule against pdf-lib:** every code point in `'standard-font'` encoded by Helvetica, Helvetica Bold, Times Roman and Courier gives a code other than `3F` (except "?" itself) and a width above 0 (except the spaces); a sample of refused characters is refused by the rule.
- **Failure:** `worker-core` maps an error named `TextRefused` to `text-refused`; `failureSentence` gives the generic sentence and a test entry's own; `messages.ts` accepts the kind.
- **Worker message:** a test entry's text, set through the reducer and passed through `jobOptions`, reaches the real `ToolClient`'s run message, cleaned, with a fake worker.
- **Registry:** the checks in section 3, run on every entry, with a failing case for each.
- **Component,** `tests/unit/components.test.tsx`:
  - `ChoiceGroup`'s existing tests, imported from its new folder, unchanged;
  - `TextField` by its markup: the label's `for` matches the field's `id`; `type="text"`, `autocomplete="off"`, `spellcheck="false"`, `enterkeyhint="go"`; no `name`, no `maxlength`, no form; without an error, no `aria-invalid`, no sentence and `aria-describedby` naming the hint; with an error, the sentence in its own paragraph between the label and the field, `aria-invalid="true"`, and `aria-describedby` naming the sentence and then the hint;
  - `TextField` by its handlers: `onType` gets the value; Enter calls `onEnter` and prevents the default, another key does not; the focus ref is on the field.
  - `ToolWorkspace` is not rendered and its effects are not run in a test, as in `add-tool-options`: the repo has no harness that renders components or runs effects in Node, and adding one is a dependency this change does not add.
- **End-to-end:** none in this change, as no published page has a text. Watermark's end-to-end test is the first browser test of these lines: focus on the field after reading and after a password, the main button waiting and its sentence, typing, refused characters named or not, a long paste, Enter, Tab order, the status message once, Cancel and "Start again", and phone width; its screenshots show the field at 360px and 1280px, light and dark, and at 200% text.
- **Other tools:** every existing unit and end-to-end test passes unchanged, including Add page numbers' choice, its look and its focus.

## Risks / Trade-offs

- **[Built before its first user]** The shape could miss what Watermark or Sign PDF need. → `add-watermark` is planned alongside and uses exactly these words; anything more comes in its own change.
- **[Only Western European characters]** Visitors writing in Hindi, Telugu, Arabic or Chinese cannot use a text with this rule. → Refused with a plain sentence and said in each tool's hint, never drawn as question marks. A rule backed by a font put inside the file is an owner question raised by `add-watermark` (size and licence); `CharacterRule` leaves room for a second rule.
- **[The main button waits]** A tool with a text does not work untouched, which `SPEC.md` asks of options. → The agent's reading that a text is the job's input; named in the pull request for the owner.
- **[Focus into a field on a phone]** Moving focus to a field after the file is read may open the on-screen keyboard on some phones and cover the file's row. → Browsers seldom open the keyboard for focus that no tap caused; the sentence sits above the field so the keyboard does not hide it; Watermark's hand checks in issue #7 cover Android Chrome and iOS Safari.
- **[The sentence away from the button]** A sighted visitor who presses the waiting button sees nothing happen, with the sentence above, by the field. → It is directly above the actions row, and the button reads it to a screen reader; the same press-does-nothing rule as every waiting main button.

## Migration Plan

None. No tool uses a text until Watermark. Moving `ChoiceGroup` changes no markup or style, which Add page numbers' tests and screenshots confirm.
