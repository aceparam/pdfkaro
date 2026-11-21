# Tasks

Built on `add-tool-options` (archived). Merged before `add-watermark`.

## 1. Registry entry

- [x] 1.1 Split `ToolOption` in `src/tools/registry.ts` into `ChoiceOption` (unchanged) and `TextOption` (`kind: 'text'`, `key`, `label`, `hint`, `emptySentence`, optional `refusedSentence`; no limit or rule); in `src/widget/option-values.ts` declare `CharacterRule` (the registry does not import it, as a text there holds no rule) and add `TextRule`, `optionTexts` (empty of tools), `characterRules` (the 217 code points listed in the design, no soft hyphen), `cleanText`, `textProblem` (with the refused characters), `textRule`, `acceptedText` and `TextRefused`; extend the registry test with the text checks of the design's section 3 (a line in `optionTexts` for each text and the reverse, a hint's number of characters matching `maxLength`), each with a failing case built from a test entry and table, and with Add page numbers still passing; verify with `npm test` and `npm run check`

## 2. Engine

- [x] 2.1 No engine changes: no tool has a text yet. `textRule` and `acceptedText` are unit tested in `tests/unit/options.test.ts` with a filled table (a good text cleaned, a number, `null`, empty, only spaces, too long, a refused character, `__proto__`, `toString`), and `TextRefused`'s message holds no text; verify the tests pass

## 3. Engine unit tests

- [x] 3.1 In `tests/unit/options.test.ts`: `cleanText` and `textProblem` as the design's Tests list them, including "नमस्ते", "తెలుగు", "مرحبا", "中文", "Łódź", an emoji, a tab, a soft hyphen and U+202E refused, "Cafe" with a separate accent taken as "Café", `refused` for "Łódź" being `['Ł', 'ź']`, and characters reported before length; and the rule checked against pdf-lib: every code point of `'standard-font'` encoded by Helvetica, Helvetica Bold, Times Roman and Courier gives a code other than `3F` (except "?") and a width above 0 (except the spaces); verify the tests pass

## 4. State, rules and worker wiring

- [x] 4.1 `src/widget/options.ts`: `typedText`, `optionsToSend` and `jobOptions` sending a text cleaned (with no tool id, which cleaning does not need, so their signatures are unchanged), `textSentence` (refused characters named when one to three visible Latin letters or common signs, else "Some characters cannot be used." followed by the second sentence; too long; empty) and `optionsHold`; the comment on `State.choices` says it holds a text's raw value too, with no new action; `FailureKind` gains `text-refused`, mapped from `TextRefused` in `worker-core.ts`, accepted by `messages.ts`, with its sentence in `failures.ts` (the tool's `refusedSentence`, else "The text could not be used. Check it and try again."); verify with new cases in `tests/unit/options.test.ts`, `tests/unit/state.test.ts` (`option-set` with a text only while listing; kept through Cancel, a failure and "Choose another file"; cleared by "Start again" and removing the last file), `tests/unit/failures.test.ts`, `tests/unit/worker-core.test.ts` and `tests/unit/messages.test.ts`, the existing cases passing unchanged
- [x] 4.2 `useToolRun` is unchanged in shape; verify in `tests/unit/options.test.ts` that a test entry's text, set through the reducer and passed through `jobOptions`, reaches the real `ToolClient`'s run message cleaned, with a fake worker, and that the worker-core and messages tests pass unchanged. No test runs the hook itself, for the reason in the design (no render harness); Watermark's end-to-end test is the first browser test of these lines

## 5. Page

- [x] 5.1 Move `ChoiceGroup` into `src/components/ChoiceGroup/` with `ChoiceGroup.module.css` (its rules moved unchanged from `ToolWorkspace.module.css`); add `src/components/TextField/` with `TextField.module.css` (a top margin and the `.note` and `.error` rules copied from `PasswordField`, on purpose, as the design says); `TextField` uses the site's `field field-short` style, the sentence in its own paragraph between the label and the field, the hint under the field, no `name`, no form, no `maxlength`, `autocomplete="off"`, `spellcheck="false"`, `enterKeyHint="go"`, `aria-invalid` and `aria-describedby` (sentence, then hint); `ToolWorkspace` draws each option with these components once the file has been read, while listing, below the file and above the main button; the main button `aria-disabled` while `optionsHold` gives a problem, with `emptySentence` in the tied paragraph or `aria-describedby` on the sentence's id; Enter calls the main button's handler; the status region says a `characters` or `too-long` sentence once when it appears or changes kind; `optionRef` on the first option's focus target, radio or field; verify with `TextField`'s markup and handler tests in `tests/unit/components.test.tsx` as the design lists (the component called as a plain function and its markup drawn with `renderToStaticMarkup`; Vitest has no render harness here, no jsdom, and adding one would be a new dependency, so no test renders `ToolWorkspace` or runs its effects: its wiring of the main button, Enter, the status message and focus rests on the plain functions in `src/widget/options.ts`, tested in Node, and is first tested in a browser by Watermark's end-to-end test), `ChoiceGroup`'s tests passing from its new folder with their assertions unchanged (only the import path, and a narrowing of Add page numbers' option to the choice kind, which the type now needs), and Compress PDF's, Rotate PDF's and Add page numbers' unit and end-to-end tests passing unchanged
- [x] 5.2 No page text: no page shows a text yet; verify the built pages are unchanged with `npm run build` and `npm run weigh`

## 6. End-to-end test

- [x] 6.1 No end-to-end test in this change, as no published page has a text; every existing end-to-end test, Add page numbers' included, must pass unchanged; verify with `npm run e2e -- --trace off`

## 7. No-upload test

- [x] 7.1 No request, storage or address is added, and the existing no-upload tests must pass unchanged; verify they do. The first tool with a text (Watermark) carries its text as a secret in its own no-upload test

## 8. Screenshots

- [x] 8.1 No page changes how it looks, so no screenshots; the pull request says so, and Watermark's pull request carries the field at 360px and 1280px, light and dark, and at 200% text

## 9. Checks and review

- [x] 9.1 Run the tool checks against every file in `tests/fixtures/`: not applicable, as no engine changes; record that in the pull request, with the fixtures README unchanged
- [x] 9.2 `LICENSES.md`: no change, as no dependency is added
- [x] 9.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests and `npm run spec`; verify each passes
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (the text kind and its words; a text read as the job's input, the agent's reading, so it starts empty and the main button waits; limits and rules written once in `src/widget/option-values.ts`, not in the registry; the `'standard-font'` rule less the soft hyphen; composed form and trimming; refused characters named when few; the sentence between the label and the field; no `maxlength`; `autocomplete="off"`, `spellcheck="false"` and `enterkeyhint="go"`; Enter does what the main button does; the sentence said once; the `text-refused` failure; `ChoiceGroup` and `TextField` in their own folders) and that it is merged before `add-watermark`

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`; note it in "Where the project stands" in `CLAUDE.md`, and in `add-tool-options`' entry there replace "Left for later: move `ChoiceGroup` to its own folder when a second kind of option arrives" with a note that `add-text-option` moved it; then build `add-watermark` on top of it.
