# Tasks

## 1. Registry entry

- [x] 1.1 Add `ToolOption` (the `choice` kind) and `options?: ToolOption[]` to the widget words in `src/tools/registry.ts`, and `src/widget/option-values.ts` with an empty `optionValues` and `acceptedValue`; the registry test checks unique keys, at least two labelled values, `initial` among them, values exactly those of `optionValues`, and no preset key that is an option key, with a failing case built in the test for each; verify with `npm test` and `npm run check`

## 2. Engine

- [x] 2.1 No engine changes: no tool has options yet. `acceptedValue` is unit tested in `tests/unit/options.test.ts` (a listed value, an unlisted one, a number, `__proto__`, `toString`); verify the test passes

## 3. State and rules

- [x] 3.1 `State.choices` (`{}` is every option at its start) with `option-set { key, value }` acting only while listing and cleared only by `reset`; `src/widget/options.ts` with `chosenValue` and `optionsToSend`; verify with `tests/unit/options.test.ts` and new cases in `tests/unit/state.test.ts`, the existing state tests passing unchanged

## 4. Worker wiring

- [x] 4.1 `useToolRun` sends `jobOptions(preset, jobOption(), words.options, state.choices)`, which is `{ ...preset, ...jobOption(), ...optionsToSend(...) }`; no change to the worker or its messages, which already carry an options object; verify in `tests/unit/options.test.ts` that a test entry's choice, set through the reducer and passed through `jobOptions`, reaches the real `ToolClient`'s run message, with the worker-core and messages tests passing unchanged. No test runs the hook itself: the repo has no harness that renders components or runs hooks and effects in Node, and adding one (jsdom or similar) is a new dependency this change does not add. Add page numbers' end-to-end test is the first real browser test of these lines

## 5. Page

- [x] 5.1 `ToolWorkspace` draws each choice (`ChoiceGroup`, in the same file) once the file has been read, while listing, below the file and above the main button: a `fieldset` with no border and no padding, a `legend` styled as the field labels, one native radio per line in a label at least 2.75rem tall, `accent-color: var(--text)`, the site's focus ring; focus moves to the chosen radio of the first option once a new set of files has been read, if focus is still on the main button, the file's line or summary, or the body; verify with unit tests in Node: the rules for when the group is shown (`optionsShown`: hidden while reading, for a password, while one is tried, for a damaged or unsupported file, during the job, on a failure and on the result) and when focus moves (`readyKey`, `focusMovesToOptions`) as plain functions, and `ChoiceGroup` by its markup (fieldset and legend, one radio per value, the chosen one checked) and by calling its change handler (`option-set` value, focus ref on the chosen radio only); with Compress PDF's and Rotate PDF's rendering and focus tests passing unchanged. No test renders `ToolWorkspace` or runs its effects, for the reason in 4.1; Add page numbers' end-to-end test is the first real browser test of focus, the arrow keys and Tab
- [x] 5.2 No page text: no page shows an option yet; verify the built pages are unchanged with `npm run build` and `npm run weigh`

## 6. End-to-end test

- [x] 6.1 No end-to-end test in this change, as no published page has options; the other tools' end-to-end tests must pass unchanged; verify with `npm run e2e -- --trace off`

## 7. No-upload test

- [x] 7.1 No request, storage or address is added; the existing no-upload tests must pass unchanged; verify they do

## 8. Screenshots

- [x] 8.1 No page changes how it looks, so no screenshots; the pull request says so, and Add page numbers' pull request carries the group at 360px and 1280px

## 9. Checks and review

- [x] 9.1 `LICENSES.md`: no change, as no dependency is added
- [x] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests and `npm run spec`; verify each passes
- [ ] 9.3 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (one kind for now, one radio per line, focus to the first option after reading, choices kept until "Start again", `src/widget/option-values.ts`) and that it is merged before `add-page-numbers`

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`, then build `add-page-numbers` on top of it.
