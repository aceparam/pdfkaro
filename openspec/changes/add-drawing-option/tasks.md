# Tasks

Built on `add-option-conditions`, merged first. Merged before `add-picture-option` and `add-sign-pdf`.

## 1. Registry entry

- [x] 1.1 Add `DrawingOption` (`kind: 'drawing'`, `key`, `label`, `hint`, `clearLabel`, `emptySentence`, optional `refusedSentence` and `when`; no limits) to `ToolOption` in `src/tools/registry.ts`; in `src/widget/option-values.ts` add `pad`, `Drawing`, `DrawingRule`, `optionDrawings` (empty of tools), `drawingRule`, `acceptedDrawing` and `DrawingRefused`; extend the registry test with the checks of the design's decision 2 (a line for each drawing and the reverse, limits within bounds, plain words, no drawing first), each with a failing case built from a test entry and table, Add page numbers and Watermark still passing; verify with `npm test` and `npm run check`

## 2. Engine

- [x] 2.1 No engine changes: no tool has a drawing yet. `acceptedDrawing` is unit tested in `tests/unit/options.test.ts` with a filled table, as the design's Tests list it, and `DrawingRefused`'s message holds no drawing; verify the tests pass

## 3. Engine unit tests

- [x] 3.1 `tests/unit/drawing.test.ts`: `padPoint`, `extendLine`, `withLine` and `paintDrawing` (on `@napi-rs/canvas`) as the design's Tests list them; verify the tests pass

## 4. State, rules and worker wiring

- [x] 4.1 `src/widget/drawing.ts` with the four functions (and `isFull`, design decision 3); `State.choices` may hold a drawing, with its comment updated; `drawing-set` acting only while listing; `optionsToSend` sends a shown drawing and `optionsHold` holds for a shown empty one; `FailureKind` gains `drawing-refused`, mapped from `DrawingRefused` in `worker-core.ts`, accepted by `messages.ts`, with its sentence in `failures.ts`; verify with new cases in `tests/unit/options.test.ts`, `state.test.ts`, `failures.test.ts`, `worker-core.test.ts` and `messages.test.ts`, the existing cases passing unchanged
- [x] 4.2 `useToolRun` gains `setDrawing`; verify in `tests/unit/options.test.ts` that a test entry's drawing, through the reducer and `jobOptions`, reaches the real `ToolClient`'s run message unchanged, with a fake worker. No test runs the hook itself (no render harness); Sign PDF's end-to-end test is the first browser test of these lines

## 5. Page

- [x] 5.1 `src/components/DrawingPad/` with `DrawingPad.module.css` as the design's decision 5 gives it (label paragraph, canvas with `role="img"`, `aria-labelledby`, `aria-describedby`, no `tabindex`, `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`, context menu prevented, Clear described by the hint, one primary pointer captured, no dispatch until the line ends, coalesced points where offered, backing size × `devicePixelRatio` repainted on resize and on a change of colour scheme, the hint, the Clear button); `ToolWorkspace` draws it for each shown drawing, ties an empty drawing's sentence to the main button, and says "The drawing is cleared." and, once, "The drawing is full. Clear it to start again." in the status region; verify with `DrawingPad`'s markup, CSS Module and source tests in `tests/unit/components.test.tsx` as the design lists them, with `ChoiceGroup`'s and `TextField`'s tests and Add page numbers' and Watermark's unit tests passing unchanged. No test runs the pad's handlers or effects (no render harness); Sign PDF's end-to-end test is the first browser test of the pad
- [ ] 5.2 No page text: no page shows a drawing yet; verify the built pages are unchanged with `npm run build` and `npm run weigh`

## 6. End-to-end test

- [ ] 6.1 No end-to-end test in this change, as no published page has a drawing; every existing end-to-end test must pass unchanged; verify with `npm run e2e -- --trace off`

## 7. No-upload test

- [ ] 7.1 No request, storage or address is added, and the existing no-upload tests must pass unchanged; verify they do. Sign PDF's no-upload test draws in the box and checks no request carries anything

## 8. Screenshots

- [ ] 8.1 No page changes how it looks, so no screenshots; the pull request says so, and Sign PDF's pull request carries the pad at 360px and 1280px, light and dark, empty and drawn, and at 200% text

## 9. Checks and review

- [ ] 9.1 Run the tool checks against every file in `tests/fixtures/`: not applicable, as no engine changes; record that in the pull request, with the fixtures README unchanged
- [ ] 9.2 `LICENSES.md`: no change, as no dependency is added (`@napi-rs/canvas` is already a development dependency of the tests)
- [ ] 9.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests and `npm run spec`; verify each passes
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (the drawing kind and its words; whole-number lines in a 1,000 by 400 box; a 5 to 2 box the column's width; a line 6 units wide in the text colour; one pointer at a time; 3 units between points; limits written once in `option-values.ts`; never first and never a picture; Clear with no undo; a drawing read as the job's input, the agent's reading; the `drawing-refused` failure; `DrawingPad` in its own folder) and that it is merged before `add-picture-option` and `add-sign-pdf`

## Workflow follow-up

- After merge, archive the change with `/opsx:archive` and note it in "Where the project stands" in `CLAUDE.md`; then build `add-picture-option` on top of it.
