# Tasks

Built on `add-tool-options` and `add-text-option` (archived), after `add-watermark` (merged and archived, PR #22). Merged before `add-drawing-option`, `add-picture-option` and `add-sign-pdf`.

## 1. Registry entry

- [x] 1.1 Add `when?: { key: string; value: string }` to `ChoiceOption` and `TextOption` in `src/tools/registry.ts`, with its comment; extend the registry test with the checks of the design's section 2 (an earlier choice of the same tool, one of its values, a choice with no condition of its own, a first option with none), each with a failing case built from a test entry, Add page numbers and Watermark still passing; verify with `npm test` and `npm run check`

## 2. Engine

- [x] 2.1 No engine changes: no tool has a condition yet, and engines already check each value they read; verify the engine tests pass unchanged with `npm test`

## 3. Engine unit tests

- [x] 3.1 None needed beyond 2.1, as no engine changes; verify every engine test file passes unchanged

## 4. Rules, state and worker wiring

- [x] 4.1 `src/widget/options.ts`: `optionShown` and `shownOptions`; `optionsToSend` and `optionsHold` read only shown options, with their signatures and `jobOptions`' unchanged; verify with new cases in `tests/unit/options.test.ts` as the design's Tests list them, and new cases in `tests/unit/state.test.ts` (a hidden text keeps what was typed; "Start again" and removing the last file clear it), the existing cases passing unchanged
- [x] 4.2 `useToolRun` is unchanged; verify in `tests/unit/options.test.ts` that a test entry's choice and texts, through the reducer and `jobOptions`, reach the real `ToolClient`'s run message with the hidden text's key absent, with a fake worker, and that the worker-core and messages tests pass unchanged

## 5. Page

- [x] 5.1 `ToolWorkspace` draws `shownOptions(options, state.choices)`, memoised, with `optionRef` on the first; no focus move and no status message when the choice changes; verify the component tests (`ChoiceGroup`, `TextField`) and Add page numbers' and Watermark's unit tests pass unchanged. No test renders `ToolWorkspace`, for the reason in the design; Sign PDF's end-to-end test is the first browser test of a condition
- [x] 5.2 No page text: no page shows a conditional option yet; verify the built pages are unchanged with `npm run build` and `npm run weigh`

## 6. End-to-end test

- [x] 6.1 No end-to-end test in this change, as no published page has a condition; every existing end-to-end test must pass unchanged; verify with `npm run e2e -- --trace off`

## 7. No-upload test

- [x] 7.1 No request, storage or address is added, and the existing no-upload tests must pass unchanged; verify they do

## 8. Screenshots

- [x] 8.1 No page changes how it looks, so no screenshots; the pull request says so, and Sign PDF's pull request carries the conditional inputs at 360px and 1280px

## 9. Checks and review

- [x] 9.1 Run the tool checks against every file in `tests/fixtures/`: not applicable, as no engine changes; record that in the pull request, with the fixtures README unchanged
- [x] 9.2 `LICENSES.md`: no change, as no dependency is added
- [x] 9.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests and `npm run spec`; verify each passes
- [x] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (one condition per option, on one earlier choice's value; the option shown after the group, not inside it; nothing announced and focus not moved; a hidden option kept but not held or sent; the first option has no condition) and that it is merged before `add-drawing-option`, `add-picture-option` and `add-sign-pdf`

## Workflow follow-up

- After merge, archive the change with `/opsx:archive` and note it in "Where the project stands" in `CLAUDE.md`; then build `add-drawing-option` on top of it.
- [x] 9.5 Stage 2 review fix (code reviewer): a `text-refused` failure takes its sentence from the first *shown* text (`failureSentence` gains `choices` and reads `shownOptions`), so a hidden text's words never apply; a unit test in `tests/unit/failures.test.ts` covers two conditional texts
