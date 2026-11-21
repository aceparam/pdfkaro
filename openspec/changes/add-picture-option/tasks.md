# Tasks

Built on `add-option-conditions` and `add-drawing-option`, merged first. Merged before `add-sign-pdf`.

## 1. Registry entry

- [ ] 1.1 Add `PictureOption` (`kind: 'picture'`, `key`, `label`, `pickLabel`, `againLabel`, `hint`, `acceptsName`, `emptySentence`, optional `refusedSentence` and `when`; no types or limits) to `ToolOption` in `src/tools/registry.ts`; in `src/widget/option-values.ts` add `PictureType`, `PictureRule`, `optionPictures` (empty of tools), `pictureRule` and `PictureRefused`; extend the registry test with the checks of the design's decision 2 (a line for each picture and the reverse, types and limits within bounds, plain words, a hint's size matching `maxBytes`, `passwords` refused as an option key) and `engines-match-registry.test.ts` with "a tool with a picture exports `inspectPicture`", each with a failing case from a test entry and table; verify with `npm test` and `npm run check`

## 2. Engine

- [ ] 2.1 In `src/engines/picture.ts` add `PictureOutcome`, `pictureOutcome` and `acceptedPicture` as the design's decision 3 gives them, reading only, with the caps already there; in `src/engines/types.ts` add the optional `inspectPicture` to `EngineModule`; no tool's engine changes; verify with `npm run check` and 3.1

## 3. Engine unit tests

- [ ] 3.1 In `tests/unit/picture.test.ts`: `pictureOutcome` for every picture in `tests/fixtures/pictures/` under the rules the design's Tests list, and `acceptedPicture` with a filled table; verify the tests pass, then add each picture's outcome for a picture option to the pictures table in `tests/fixtures/README.md`

## 4. State, rules and worker wiring

- [ ] 4.1 `State.pictures` with `picture-chosen` and `picture-read`, kept and cleared as choices; `src/widget/options.ts`: `pictureSentence`, `picturesToSend`, and `optionsHold` holding for a shown picture that is not ready (empty and reading under the button, a problem by the field); `FailureKind` gains `picture-refused`, mapped from `PictureRefused` in `worker-core.ts`, accepted by `messages.ts`, with its sentence in `failures.ts`; verify with new cases in `tests/unit/options.test.ts`, `state.test.ts` and `failures.test.ts`, the existing cases passing unchanged
- [ ] 4.2 `messages.ts`: the `inspect-picture` message, the run message's `pictures`, and `picture-inspected`, each checked; `client.ts`: `inspectPicture` and `run` with pictures; `worker-core.ts`: `inspect-picture` through the engine's `inspectPicture` (damaged when it has none), and a run handing each picture's bytes to the engine under its key before `passwords`; `useToolRun`: `pickPicture` (sniff, size, hold, read, record only if still held), pictures forgotten by `clear` and by removing the last file, and `start` sending `picturesToSend`; verify with new cases in `tests/unit/messages.test.ts`, `client.test.ts` and `worker-core.test.ts` as the design's Tests list them, and in `tests/unit/options.test.ts` that a test entry's ready picture reaches the real `ToolClient`'s run message and a hidden one does not, with a fake worker. No test runs the hook itself (no render harness); Sign PDF's end-to-end test is the first browser test of these lines

## 5. Page

- [ ] 5.1 `FilePicker` gains an optional `describedBy`; `src/components/PictureField/` with `PictureField.module.css` as the design's decision 7 gives it (label, sentence between the label and the button, the line naming the picture, the button's words before and after a pick, the hint, no picture shown, a long name wrapping, `.error` and `.note` copied from `TextField` on purpose); `ToolWorkspace` draws it for each shown picture, ties its hold to the main button, and says "name, size." once when ready and each problem's sentence once; verify with `PictureField`'s and `FilePicker`'s markup tests in `tests/unit/components.test.tsx` as the design lists them, with the other component tests and Add page numbers' and Watermark's unit tests passing unchanged. No test renders `ToolWorkspace` (no render harness); Sign PDF's end-to-end test is the first browser test of the field
- [ ] 5.2 No page text: no page shows a picture option yet; verify the built pages are unchanged with `npm run build` and `npm run weigh`

## 6. End-to-end test

- [ ] 6.1 No end-to-end test in this change, as no published page has a picture option; every existing end-to-end test must pass unchanged; verify with `npm run e2e -- --trace off`

## 7. No-upload test

- [ ] 7.1 No request, storage or address is added, and the existing no-upload tests must pass unchanged; verify they do. Sign PDF's no-upload test chooses a picture with a marked name and checks it reaches no request and no `blob:` address is made for it

## 8. Screenshots

- [ ] 8.1 No page changes how it looks, so no screenshots; the pull request says so, and Sign PDF's pull request carries the field at 360px and 1280px, light and dark, before a pick, ready, with a problem, and at 200% text

## 9. Checks and review

- [ ] 9.1 Run the tool checks against every file in `tests/fixtures/`: the PDFs are not applicable, as no tool's engine changes; every picture in `tests/fixtures/pictures/` is run through `pictureOutcome` (task 3.1) and its outcome recorded in the fixtures README
- [ ] 9.2 `LICENSES.md`: no change, as no dependency is added
- [ ] 9.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests and `npm run spec`; verify each passes
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (the picture kind and its words; types and limits written once; checked in the worker before the job; no preview; drops and pastes not taken; bytes beside the files, never in the state; replaced by the next pick; a picture read as the job's input, the agent's reading; the `picture-refused` failure; `PictureField` in its own folder), puts the per-tool picture limit to the owner as a question that does not block, and says it is merged before `add-sign-pdf`

## Workflow follow-up

- After merge, archive the change with `/opsx:archive` and note it in "Where the project stands" in `CLAUDE.md`; then build `add-sign-pdf` on top of it.
