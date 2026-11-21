# Tasks

Built on `add-tool-options` (archived). Merged before `add-watermark`.

## 1. Registry entry

- [ ] 1.1 Split `ToolOption` in `src/tools/registry.ts` into `ChoiceOption` (unchanged) and `TextOption` (`kind: 'text'`, `key`, `label`, `hint`, `emptySentence`, `maxLength`, `characters`) with `CharacterRule = 'standard-font'`; in `src/widget/option-values.ts` add `optionTexts` (empty of tools), `TextRule`, `characterRules` (the 217 code points listed in the design, no soft hyphen), `cleanText`, `textProblem` and `acceptedText`; extend the registry test with the text checks of the design's section 3, each with a failing case built from a test entry, and with Add page numbers still passing; verify with `npm test` and `npm run check`

## 2. Engine

- [ ] 2.1 No engine changes: no tool has a text yet. `acceptedText` is unit tested in `tests/unit/options.test.ts` with a filled table (a good text cleaned, a number, `null`, empty, only spaces, too long, a refused character, `__proto__`, `toString`), and the error a later engine throws must not hold the text; verify the tests pass

## 3. Engine unit tests

- [ ] 3.1 In `tests/unit/options.test.ts`: `cleanText` and `textProblem` as the design's Tests list them, including "नमस्ते", "తెలుగు", "مرحبا", "中文", "Łódź", an emoji, a tab, a soft hyphen and U+202E refused, "Cafe" with a separate accent taken as "Café", and characters reported before length; and the rule checked against pdf-lib: every code point of `'standard-font'` encoded by Helvetica, Helvetica Bold, Times Roman and Courier gives a code other than `3F` (except "?") and a width above 0 (except the spaces); verify the tests pass

## 4. State, rules and worker wiring

- [ ] 4.1 `src/widget/options.ts`: `typedText`, `optionsToSend` sending a text cleaned, `textSentence` and `optionsHold`; the comment on `State.choices` says it holds a text's raw value too, with no new action; verify with new cases in `tests/unit/options.test.ts` and `tests/unit/state.test.ts` (`option-set` with a text only while listing; kept through Cancel, a failure and "Choose another file"; cleared by "Start again" and removing the last file), the existing cases passing unchanged
- [ ] 4.2 `useToolRun` is unchanged in shape; verify in `tests/unit/options.test.ts` that a test entry's text, set through the reducer and passed through `jobOptions`, reaches the real `ToolClient`'s run message cleaned, with a fake worker, and that the worker-core and messages tests pass unchanged. No test runs the hook itself, for the reason in the design (no render harness); Watermark's end-to-end test is the first browser test of these lines

## 5. Page

- [ ] 5.1 `ToolWorkspace` draws each text (`TextField`, beside `ChoiceGroup`) once the file has been read, while listing, below the file and above the main button, with the site's `field field-short` style, the hint in a note read with the field, no `name`, no form, no `maxlength`, `autocomplete="off"` and `spellcheck="false"`; an error sentence in a `strong` with its own id and `aria-invalid`; the main button `aria-disabled` while `optionsHold` gives a problem, with `emptySentence` in the tied paragraph or `aria-describedby` on the error's id; Enter calls the main button's handler; the status region says a `characters` or `too-long` sentence once when it appears or changes kind; `optionRef` on the first option's focus target, radio or field; verify with `TextField`'s markup and handler tests in `tests/unit/components.test.tsx` as the design lists, `ChoiceGroup`'s tests unchanged, and Compress PDF's, Rotate PDF's and Add page numbers' tests passing unchanged
- [ ] 5.2 No page text: no page shows a text yet; verify the built pages are unchanged with `npm run build` and `npm run weigh`

## 6. End-to-end test

- [ ] 6.1 No end-to-end test in this change, as no published page has a text; every existing end-to-end test, Add page numbers' included, must pass unchanged; verify with `npm run e2e -- --trace off`

## 7. No-upload test

- [ ] 7.1 No request, storage or address is added, and the existing no-upload tests must pass unchanged; verify they do. The first tool with a text (Watermark) carries its text as a secret in its own no-upload test

## 8. Screenshots

- [ ] 8.1 No page changes how it looks, so no screenshots; the pull request says so, and Watermark's pull request carries the field at 360px and 1280px, light and dark, and at 200% text

## 9. Checks and review

- [ ] 9.1 Run the tool checks against every file in `tests/fixtures/`: not applicable, as no engine changes; record that in the pull request, with the fixtures README unchanged
- [ ] 9.2 `LICENSES.md`: no change, as no dependency is added
- [ ] 9.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests and `npm run spec`; verify each passes
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (the text kind and its fields; a text is the job's input, starts empty and the main button waits; the `'standard-font'` rule less the soft hyphen; composed form and trimming; no `maxlength`; `autocomplete="off"` and `spellcheck="false"`; Enter does what the main button does; the sentence said once; the rule and limits in `src/widget/option-values.ts`) and that it is merged before `add-watermark`

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`, note it in "Where the project stands" in `CLAUDE.md`, then build `add-watermark` on top of it.
