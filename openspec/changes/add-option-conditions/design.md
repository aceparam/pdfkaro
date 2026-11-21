# Design

## Context

- `add-tool-options` and `add-text-option` (both archived) give the registry `ToolOption = ChoiceOption | TextOption`; `src/widget/options.ts` with `chosenValue`, `typedText`, `optionsToSend`, `jobOptions`, `optionsHold`, `optionsShown`, `readyKey` and `focusMovesToOptions`; the state's `choices`, kept through Cancel, a failure and "Choose another file" and cleared by "Start again" and by removing the last file; and `ToolWorkspace`, which draws every option in registry order once the file is read, puts `optionRef` on the first option's focus target, and ties the first holding text's sentence to the main button.
- Add page numbers (one choice) and Watermark (one text, PR open) use them. Neither needs a condition.
- Sign PDF (`add-sign-pdf`) needs a choice of how the signature is made, then one of three inputs: a text (`add-text-option`), a drawing (`add-drawing-option`) or a picture (`add-picture-option`). The drawing and picture changes come after this one and use its rule, so each new kind is hidden, held and sent through one place.

## Goals / Non-Goals

**Goals:**
- One rule for which options are on screen, held and sent, written once and tested in Node.
- No change to how a choice or a text is drawn, kept or reset, and none for tools without conditions.

**Non-Goals:**
- Conditions on anything but one earlier choice's value; several values; conditions on conditional options; options before a pick.

## Decisions

### 1. The registry type

Each option kind gains one optional field:

```ts
/** Shown only while the earlier choice `key` holds `value`. Left out, always shown. */
when?: { key: string; value: string };
```

It sits on `ChoiceOption` and `TextOption` (and on the kinds the later changes add), so a choice can be conditional too. The registry keeps it as data only.

### 2. The registry test

For every tool with options, beside the existing checks:
- `when.key` is the key of a `choice` listed **earlier** in the tool's options;
- `when.value` is one of that choice's values;
- the choice named has no `when` of its own (one level only, so what is shown never depends on something hidden);
- the first option has no `when`, so `optionRef`, which goes on the first option, always has a target on screen once the file is read (the `add-tool-options` focus rule is unchanged);
- a failing case for each, built from a test entry, as no published tool has a condition.

### 3. The rules: `src/widget/options.ts`

```ts
/** Whether an option is shown: it names no condition, or the choice it names holds its value. */
export function optionShown(option: ToolOption, options: readonly ToolOption[], choices: Choices): boolean;

/** The options shown, in registry order. */
export function shownOptions(options: readonly ToolOption[] | undefined, choices: Choices): ToolOption[];
```

- `optionShown` finds the named choice in `options` and compares `chosenValue(choice, choices)` with `when.value`, so a stored value that is not one of the choice's values falls back to the choice's start, as everywhere else. A condition that names no choice (which the registry test forbids) hides its option, so nothing unchecked is ever sent.
- `optionsToSend(options, choices)` and `optionsHold(tool, options, choices)` loop over `shownOptions(options, choices)` instead of `options`. Their signatures, and `jobOptions`', are unchanged, so `useToolRun` does not change. A hidden option sends no key at all, rather than an empty value, so an engine can tell "not this way" from "this way, empty".
- `optionsShown`, `readyKey` and `focusMovesToOptions` are unchanged.

### 4. `ToolWorkspace`

- It maps over `shownOptions(options, state.choices)`, memoised on the options and `state.choices`. `optionRef` stays on index 0, which the registry test keeps unconditional.
- **Where a shown option appears:** in registry order, so directly after the choice that shows it when it is listed next. GOV.UK reveals conditional content under the chosen radio button, inside the group. That was considered and dropped: it means drawing other kinds inside `ChoiceGroup`, and moving the rest of the group down on every change; after the group is plainer, and is where Tab goes next.
- **Focus and announcements:** none. The arrow keys move between radio buttons and choose as they go; moving focus to the shown option would break them. The radio button's own label is what a screen reader says; the option shown is reached by the next Tab, with its own label and hint. Nothing new goes to the status region, so nothing is said twice.
- `fieldHold`, the status message for a text's sentence and `enterAction` read `hold`, which now comes only from shown options, so a hidden text's sentence is never shown, tied or said.

### 5. The state

No change. `choices` already keeps every option's value by key whether or not it is shown, so a hidden text keeps what was typed, and "Start again" and removing the last file clear it, as now.

## Page weight and late loading

The script before a pick is unchanged: no published tool has a condition, and the rule is a few lines in the workspace chunk, fetched after a pick. Nothing about WebAssembly changes. `npm run weigh` must pass.

## Threats

- **No new input.** A condition is registry data, checked by the registry test; the visitor only picks among a choice's values, as before.
- **A hidden value is not sent,** so an engine never receives an input the visitor cannot see. Each engine still checks every value it reads (`acceptedValue`, `acceptedText`).
- **No file parsing, request or storage** is added; malicious PDFs, oversized files and hostile file names are untouched by this change.

## Tests

- **Unit, `tests/unit/options.test.ts`:** `optionShown` and `shownOptions` with a test entry (a choice of "a" or "b" starting at "a", a text for "a", a text for "b", and an unconditional choice after them): at the start; after choosing "b"; with an unknown stored value (falls back to the start); with a condition naming no choice (hidden). `optionsToSend` sends the choice, the text for the value chosen and the unconditional choice, and no key for the hidden text; `optionsHold` ignores a hidden empty text and holds for the shown one; a tool with no conditions gives exactly what it gave before (Add page numbers' and Watermark's options).
- **State:** typing in the text for "a", choosing "b", then "a" again keeps the typed text; "Start again" and removing the last file clear both (the existing reducer, with new cases).
- **Worker message:** a test entry's choice and texts, through the reducer and `jobOptions`, reach the real `ToolClient`'s run message with the hidden text's key absent, with a fake worker.
- **Registry:** each check of section 2, run on every entry, with a failing case for each.
- **Component:** none new. No harness here renders `ToolWorkspace` or runs its effects (the reason given in `add-tool-options`); what it draws rests on `shownOptions`, tested in Node. Sign PDF's end-to-end test is the first browser test of a condition: the arrow keys, Tab to the option shown, focus not moved, and phone width.
- **Other tools:** every existing unit and end-to-end test passes unchanged, Add page numbers' and Watermark's included.

## Risks / Trade-offs

- **[Built before its first user]** The rule could miss what Sign PDF needs. → `add-sign-pdf` is planned alongside and uses exactly this: one choice, three conditional inputs.
- **[Nothing said when an option appears]** A screen reader user may not know a field appeared after the group. → It is the next Tab stop, and each choice's label names what it does ("Type your name", "Draw it", "Use a picture of it"). Sign PDF's end-to-end test and its hand checks in issue #7 cover it with a screen reader.
- **[Values kept while hidden]** A typed name stays in memory while the visitor draws instead. → Only in the page's memory, as every option's value, never sent while hidden, and cleared with the rest on "Start again", on removing the last file and on leaving the page.

## Migration Plan

None. No tool names a condition until Sign PDF.
