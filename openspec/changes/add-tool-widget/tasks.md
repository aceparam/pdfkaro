# Tasks

This change has no engine and mounts nothing on a page, so the engine, fixtures, end-to-end, no-upload, page weight and screenshot tasks belong to `add-merge-pdf`.

## 1. Engine contract and worker

- [x] 1.1 Add `src/engines/types.ts`, with no library named
- [x] 1.2 Add `src/workers/messages.ts`, `tool.worker.ts` and `client.ts`; build workers as ES modules
- [x] 1.3 Add the lint rules: engines use no DOM or network; components and pages do not import engines or workers
- [x] 1.4 Add a build check that no engine's code lands in the worker file

## 2. Widget logic

- [x] 2.1 Add `src/widget/state.ts`, `src/widget/format.ts` and the accepted-type check
- [x] 2.2 Add `src/hooks/useToolRun.ts` and `src/hooks/useFileDrop.ts`

## 3. Components

- [x] 3.1 Add `FilePicker`, `PageGrid`, `Result`, `ProgressBar`, `Notice` and `PasswordField`, with styles
- [x] 3.2 Add `ToolWidget` and `ToolWorkspace`
- [x] 3.3 Add the widget's words and the minimum number of files to the tool type in the registry

## 4. Tests

- [x] 4.1 Unit test the reducer, the formatting, the PDF check and the worker messages
- [x] 4.2 Unit test the client against a fake worker: progress, cancel, failure kinds, files posted as `File`s, results transferred, and the worker ended after every job, on Cancel and on "Start again"
- [x] 4.3 Render each component to HTML in Node and check its labels, roles and disabled states

## 5. Housekeeping

- [x] 5.1 Update "Where the project stands" in `CLAUDE.md`
- [x] 5.2 Run lint, the type check, the unit tests, the build and `openspec validate --all --strict`
- [ ] 5.3 Run the review panel (see the review-panel skill) and resolve its findings

## 6. Found while building

- [x] 6.1 The workspace told the widget "no files left" on its first render, before the first files arrived, so the widget fell back to the picker at once. It now does so only after files have been listed and then all removed. Found by driving the widget in a browser in a scratch copy, with a made-up engine
