# Design

## Context

- `add-tool-options` gave the registry `ToolOption` with one kind, a choice; `src/widget/option-values.ts` with each tool's accepted values and `acceptedValue`; the state's `choices` (kept through Cancel, a failure and "Choose another file", cleared by "Start again" and by removing the last file); `ChoiceGroup` in `ToolWorkspace`; focus moving to the first option once the file is read (`readyKey`, `focusMovesToOptions`); and `jobOptions` in `useToolRun`, which sends `{ ...preset, ...items, ...options }`. Add page numbers is its one user.
- The main button already waits with a sentence tied to it: `aria-disabled`, a paragraph under it with the sentence, `aria-describedby` pointing at it, and a press that does nothing (Merge PDF's too few files, Extract's no page chosen, Rotate's nothing turned).
- `PasswordField` is the one typed field in the widget: a visible label, `autoComplete="off"`, no `name`, in no form, a note read with the field, and after a wrong password a bold sentence before the note with `aria-invalid`. Enter does what its button does.
- **Found by experiment** (Node, `@cantoo/pdf-lib` 2.11.1): a standard font's `encodeText` does not refuse a character outside its encoding. "नम" comes out as `<3F3F>` and "Ł" as `<3F>`, that is "??" and "?", with no error. So a tool that draws typed text with a standard font must check the characters itself, or it draws question marks.

## Goals / Non-Goals

**Goals:**
- One way to declare, show, check, keep and send a typed text, reusable by Watermark and later by Sign PDF's typed signature.
- What a text accepts written once and checked by the widget, the registry test and the engine with the same function.
- Keyboard, screen reader and phone use from the first version, and no way for the text to leave the page except to the tool worker.

**Non-Goals:**
- A text with a starting value or one the main button does not wait for; several lines; a live character count; characters beyond the standard fonts; a number, a colour or a slider.

## Decisions

### 1. The registry type

```ts
/** The rules for which characters a text takes. One for now; what each means is in src/widget/option-values.ts. */
export type CharacterRule = 'standard-font';

/** A choice of one value from several. */
export type ChoiceOption = { kind: 'choice'; key: string; legend: string; choices: { value: string; label: string }[]; initial: string };

/**
 * A typed text, one line. It is the job's input: it starts empty, and the main button waits until it holds text.
 * Its limit and rule are also in src/widget/option-values.ts, which the engine reads.
 */
export type TextOption = {
  kind: 'text';
  /** The key the engine receives: `text`. */
  key: string;
  /** The field's visible label: "Watermark text". */
  label: string;
  /** Under the field, read with it: what it takes. */
  hint: string;
  /** Tied to the main button while the field holds no text: "Type the text for the watermark." */
  emptySentence: string;
  /** The most characters, counted after the text is cleaned. */
  maxLength: number;
  /** Which characters it takes. */
  characters: CharacterRule;
};

export type ToolOption = ChoiceOption | TextOption;
```

- **A text starts empty and is the job's input,** so the main button waits (decision 6). A starting text was considered: it would let the main button work untouched, as `SPEC.md` "Tool page anatomy" 4 asks of options, but for Watermark it means words the visitor did not choose ("DRAFT", "CONFIDENTIAL") going onto their file if they press at once, and for a typed signature there is no sensible default at all. A text is the thing the job puts on the page, as Extract's chosen pages are the pages it takes, so it is read as input, not an option, as `CLAUDE.md` records for Extract. The proposal names this reading for the owner. A later tool that needs an optional text with a default adds `initial` in its own change.
- `ChoiceOption` is `add-tool-options`' type, unchanged, now named.

### 2. What a text takes, written once: `src/widget/option-values.ts`

Beside `optionValues` and `acceptedValue`:

```ts
/** Each tool's texts: the most characters and the character rule, by tool id and key. Engines read this to check what they are sent. */
export const optionTexts: Readonly<Record<string, Readonly<Record<string, TextRule>>>> = {};
export type TextRule = { maxLength: number; characters: CharacterRule };

/** The characters each rule takes. */
export const characterRules: Readonly<Record<CharacterRule, ReadonlySet<number>>>;

/** The text as it is counted, checked and drawn: composed (NFC), then trimmed at both ends. */
export function cleanText(raw: string): string;

/** What is wrong with a cleaned text, or null: empty, a character the rule does not take, or too long, in that order. */
export function textProblem(text: string, rule: TextRule): { kind: 'empty' } | { kind: 'characters' } | { kind: 'too-long'; length: number } | null;

/** For an engine: the cleaned text when `value` is a string with no problem under the tool's own line; else undefined. */
export function acceptedText(tool: string, key: string, value: unknown, table = optionTexts): string | undefined;
```

- **`'standard-font'`** is what the standard PDF fonts Helvetica, Times and Courier (in every weight) can draw with pdf-lib's encoding for them, Windows Western (WinAnsi): U+0020 to U+007E, U+00A0 to U+00FF and the 27 characters WinAnsi places at 0x80 to 0x9F (€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ), 217 in all, written out as a list of code points. The soft hyphen, U+00AD, is left out: it is invisible in the field but would draw as a hyphen. Everything else is refused, including tabs and other control characters, direction marks such as U+202E, emoji, and letters of other scripts or of Central European languages (Ł, ő, ğ). Symbol and ZapfDingbats, the other two standard fonts, use other encodings and are not covered by this rule.
- **Cleaning:** composed form first, so "Café" typed with a separate accent (as some keyboards and macOS file names give it) is the one character "é" the rule takes; then `String.prototype.trim`, so spaces at either end are neither drawn nor counted and a text of only spaces is empty. Spaces inside are kept as typed.
- **Counting** is by code point (`[...text].length`) after cleaning, so an emoji counts as one character in the sentence, not two, even though it is then refused.
- **Order of problems:** empty, then characters, then length, so a visitor who pasted a long Hindi line first learns that the characters cannot be drawn, which shortening alone would not fix.
- `acceptedText` reads only own keys with `Object.hasOwn`, as `acceptedValue` does, so `__proto__` or `toString` is never taken for a tool or a key; a value that is not a string is refused.
- It sits here because engines may import from `src/widget/` and components already do (lint), and because it is where `add-tool-options` put the accepted values.

### 3. The registry test

For every tool, beside the choice checks of `add-tool-options`:
- a text's key is a plain word, unique among the tool's options, not a preset key and not a key the page's items send;
- its label, hint and `emptySentence` are not empty and hold no exclamation mark;
- `maxLength` is a whole number from 1 to 200; `characters` is a key of `characterRules`;
- `maxLength` and `characters` are exactly the tool's line in `optionTexts`, and every line in `optionTexts` belongs to a text the registry shows;
- a failing case for each check, built in the test with a test entry, as `optionValues` and `optionTexts` are empty of texts in this change.

### 4. The state

- No new field or action. `option-set { key, value }` already stores any string by key while listing, and `choices` now holds a text's raw value too, exactly as typed, so the field shows what the visitor typed. The comment on `choices` says so; its name is kept, so no other tool's code changes.
- The kept and reset rules are those of choices (the `add-tool-options` design, section 4): kept through `added`, `started`, `progressed`, `failed`, `back-to-files` and removing a file that is not the last; cleared by `reset` and by removing the last file.
- No cap on what is stored: a pasted megabyte is held, counted and refused like any other long text, and never sent. The state is still never written to storage or the address.

### 5. The rules: `src/widget/options.ts`

Plain functions, tested in Node:
- `chosenValue(option, choices)` for a choice, as now; `typedText(option, choices)` for a text: the raw string stored, else `''`;
- `optionsToSend(options, choices)`: a choice's value, and a text's cleaned text (`cleanText`), by key. The main button cannot start a job while a text has a problem, and the engine checks again;
- `textSentence(option, problem)`: for `characters`, "Some of these characters cannot be drawn. Use English letters, numbers and common marks."; for `too-long`, "This text has 63 characters. Use 50 or fewer." with both numbers from the text and the option (written with `number`, so 1,204); for `empty`, the option's `emptySentence`;
- `optionsHold(options, choices)`: the first text with a problem, as `{ key, kind, sentence }`, or null. `empty` goes under the main button; `characters` and `too-long` go under the field and are tied to the main button from there (decision 6);
- `optionsShown`, `readyKey` and `focusMovesToOptions` are unchanged.

### 6. Drawing a text in `ToolWorkspace`

- **Where:** in the same place as choices, in registry order, once the file has been read, while listing.
- **Markup,** `TextField` in the same file as `ChoiceGroup`, with no hooks so it can be drawn and tested alone; its ids come from `ToolWorkspace`'s `useId`:

  ```tsx
  <div className={`field field-short ${styles.textOption}`}>
    <label htmlFor={id}>{option.label}</label>
    <input ref={focusRef} id={id} type="text" autoComplete="off" spellCheck={false} value={raw}
           aria-invalid={error ? true : undefined} aria-describedby={`${id}-note`}
           onChange={(event) => onType(event.currentTarget.value)}
           onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onEnter(); } }} />
    <p id={`${id}-note`} className={styles.note}>
      {error ? <strong id={`${id}-error`} className={styles.error}>{error} </strong> : null}
      {option.hint}
    </p>
  </div>
  ```

  No `name`, no form and no `maxlength`, as decided in the proposal. `field` and `field-short` are the site's own field style (a 3rem field, `--control` edge, the label bold), so nothing new is drawn; the CSS Module adds only `margin-top: 1.5rem`, and `.note` and `.error` as `PasswordField`'s (the note in the muted colour, the sentence bold on its own line in the text colour). No red: the site has none, and a wrong password is shown the same way.
- **The main button:**
  - while a text is empty, the existing tied paragraph shows the option's `emptySentence` (after "too few files", which comes first) and the button is `aria-disabled`;
  - while a text is too long or has characters it cannot take, the sentence is under the field, the button is `aria-disabled`, and its `aria-describedby` points at the sentence's own id (`${id}-error`), so the button reads the sentence alone, without the hint. It is not repeated under the button, so it is on screen once;
  - in both cases the button stays focusable and a press does nothing, as now. `ready` adds `optionsHold(...) === null` to what it checks.
- **Enter** in the field calls the same handler as the main button, which starts the job only when the button works, as Enter in the password field presses its button.
- **Said once:** an effect keyed on the first problem's key and kind (not its sentence, which changes with every character past the limit) says the sentence through the status region when a `characters` or `too-long` problem appears or changes kind. It says nothing when the problem goes or for `empty`, which is tied to the button from the start. Focus never moves for it, so it is announced once.
- **Focus:** `optionRef` goes on the first option's focus target: the chosen radio button of a choice, or the field of a text. `focusMovesToOptions` is unchanged, so focus moves once per set of files read, only while still free, never after Cancel or "Go back to your file".
- **Tab** from the field reaches the next option, then "Choose another file" in a one-file tool's actions row, then the main button, as for a choice.

### 7. Sending: `useToolRun`

Unchanged: `jobOptions(preset, jobOption(), words.options, state.choices)` now sends a text's cleaned value through `optionsToSend`. A later tool's engine checks it with `acceptedText` before it reads the file, and refuses with an error that does not hold the text ("The text is not valid.").

## Page weight and late loading

The script before a pick is unchanged: the island's props are the same for every published tool, none of which has a text, and the field's code, the character list and the rules are in the workspace chunk, fetched after a pick. The character list is 217 numbers, under 1 KB before compression. The workspace stylesheet grows by a few lines. `npm run weigh` must pass; nothing about WebAssembly changes.

## Threats

- **What is typed.** It is the visitor's own text, but it is checked like anything from the page: only own keys, only strings, the character list, the limit, before the engine reads the file. Direction overrides, control characters and invisible marks are outside the list and refused, so a text cannot reorder or hide what is drawn.
- **A huge paste.** Cleaning and counting a megabyte takes milliseconds; it is shown as too long and never sent.
- **Leaks.** No `name` and no form, so it can never be submitted to an address; `autocomplete="off"`, so the browser's form memory does not keep it; `spellcheck="false"`, so a browser's online spell checker (such as Chrome's enhanced spell check or Edge's Editor) is not offered it. It is never in storage, the address, the title or an error. Keyboard apps on phones and browser extensions are outside the page's control; the page text of a tool that takes a text need not claim more than the page does.
- **No file parsing** is added. Malicious PDFs, oversized files and hostile file names are untouched by this change.

## Tests

- **Unit, `tests/unit/options.test.ts`:** `cleanText` (composed form, "Cafe" plus a separate accent becomes "Café"; trimming spaces and no-break spaces at both ends; inside spaces kept); `textProblem` (empty, only spaces, 50 taken and 51 too long with the count, an emoji counted once and refused, a tab, a soft hyphen, U+202E, "नमस्ते", "తెలుగు", "مرحبا", "中文", "Łódź", and characters before length); `acceptedText` with a filled table (a good text cleaned, a number, `null`, an empty string, too long, a refused character, `__proto__`, `toString`); `typedText`, `optionsToSend` (a choice and a text together, the text cleaned), `textSentence` (each kind, numbers written with `number`), `optionsHold` (empty, then a problem, then none; a choice never holds); the reducer's `option-set` with a text, kept and cleared as choices are.
- **The character rule against pdf-lib:** every code point in `'standard-font'` encoded by Helvetica, Helvetica Bold, Times Roman and Courier gives a code other than `3F` (except "?" itself) and a width above 0 (except the spaces); a sample of refused characters is refused by the rule. This keeps the list and pdf-lib from drifting apart.
- **Worker message:** a test entry's text, set through the reducer and passed through `jobOptions`, reaches the real `ToolClient`'s run message, cleaned, with a fake worker.
- **Registry:** the checks in section 3, run on every entry, with a failing case for each.
- **Component,** `tests/unit/components.test.tsx`: `TextField` by its markup (the label's `for` matches the field's `id`; `type="text"`, `autocomplete="off"`, `spellcheck="false"`; no `name`, no `maxlength`, no form; `aria-describedby` names the note; no `aria-invalid` and no sentence without an error; with an error, `aria-invalid="true"` and the sentence in a `strong` with its own id before the hint) and by calling its handlers (`onType` gets the value; Enter calls `onEnter` and prevents the default, another key does not; the focus ref is on the field). `ToolWorkspace` is not rendered and its effects are not run in a test, as in `add-tool-options`: the repo has no harness that renders components or runs effects in Node, and adding one is a dependency this change does not add.
- **End-to-end:** none in this change, as no published page has a text. Watermark's end-to-end test is the first browser test of these lines: focus on the field after reading and after a password, the main button waiting and its sentence, typing, a refused character and a long paste, Enter, Tab order, the status message once, Cancel and "Start again", and phone width; its screenshots show the field at 360px and 1280px, light and dark, and at 200% text.
- **Other tools:** every existing unit and end-to-end test passes unchanged, including Add page numbers' choice and focus.

## Risks / Trade-offs

- **[Built before its first user]** The shape could miss what Watermark or Sign PDF need. → `add-watermark` is planned alongside and uses exactly these fields; anything more comes in its own change.
- **[Only Western European characters]** Visitors writing in Hindi, Telugu, Arabic or Chinese cannot use a text with this rule. → Refused with a plain sentence and said in each tool's hint, never drawn as question marks. A rule backed by a font put inside the file is an owner question raised by `add-watermark` (size and licence); this change leaves room for a second `CharacterRule`.
- **[The main button waits]** A tool with a text does not work untouched, which `SPEC.md` asks of options. → A text is read as the job's input, as Extract's chosen pages are; named in the pull request for the owner.
- **[Focus into a field on a phone]** Moving focus to a field after the file is read may open the on-screen keyboard on some phones and cover the file's row. → Browsers seldom open the keyboard for focus that no tap caused; Watermark's hand checks in issue #7 cover Android Chrome and iOS Safari.
- **[The sentence away from the button]** A sighted visitor who presses the waiting button sees nothing happen, with the sentence above, by the field. → It is directly above the actions row, and the button reads it to a screen reader; the same press-does-nothing rule as every waiting main button.

## Migration Plan

None. No tool uses a text until Watermark.
