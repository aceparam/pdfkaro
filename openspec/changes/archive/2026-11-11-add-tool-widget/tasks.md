# Tasks

This change has no engine and mounts nothing on a page, so the engine, fixtures, end-to-end, no-upload, page weight and screenshot tasks belong to `add-merge-pdf`.

## 1. Engine contract and worker

- [x] 1.1 Add `src/engines/types.ts`, with no library named
- [x] 1.2 Add `src/workers/messages.ts`, `tool.worker.ts` and `client.ts`; build workers as ES modules
- [x] 1.3 Add the lint rules: engines use no DOM or network; components and pages do not import engines or workers
- [x] 1.4 ~~Add a build check that no engine's code lands in the worker file~~ Moved to `add-merge-pdf` (task 6.1a): with no engine yet there is nothing for the check to find, so it could not be shown to fail

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
- [x] 5.3 Run the review panel (see the review-panel skill) and resolve its findings (section 6)

## 6. Found while building

- [x] 6.1 The workspace told the widget "no files left" on its first render, before the first files arrived, so the widget fell back to the picker at once. It now does so only after files have been listed and then all removed. Found by driving the widget in a browser in a scratch copy, with a made-up engine
- [x] 6.2 Review panel, stage 2: hooks now get the no-engines lint rule, as they ship with the island; engines may not use `self`, `globalThis`, `importScripts`, `postMessage` or `caches`; the worker and client may not fetch or store; components and hooks may not `import()` an engine
- [x] 6.3 Review panel, stage 2: a result that is part of a larger buffer, or shares one with another result, is copied before it is moved to the page, so moving it cannot fail (`ownBuffers` in `worker-core.ts`, unit tested)
- [x] 6.4 Review panel, stage 2: the widget drops its list of picked files at `pagehide` at once, so a page kept for the Back button holds no file or name
- [x] 6.5 Review panel, stage 2: choosing only files of the wrong type goes back to the picker, which says why under it, instead of leaving an empty area
- [x] 6.6 Review panel, stage 2: a file whose password is being tried stays the problem on screen, so the next problem is not shown or announced meanwhile; after a right password, focus goes to the next problem or the main button; a second wrong password is announced again
- [x] 6.7 Review panel, stage 2: the button beside a damaged file says "Leave this file out", as it removes the file and does not start the job; the `carryOnOne` and `carryOnMany` words are dropped from the registry type
- [x] 6.8 Review panel, stage 2: the summary counts pages only once every file is open, and leaves out the tool's note on order while no file is
- [x] 6.9 Review panel, stage 2: the writing line gives no percentage, which disagreed with the bar
- [x] 6.10 Review panel, stage 2: after the engine cannot be fetched, the client ends that worker (which would keep the failure), and "Go back to your files" reads again any file left unread
- [x] 6.11 Review panel, stage 2: a file dropped while the workspace loads, works, or shows a result or failure is kept from the browser, which would open it in place of the page
- [x] 6.12 Review panel, stage 2: only memory errors count as running out of memory, not every `RangeError`; the download address is released from a ref, so it is released on unmount too; unused `PageGrid` props removed
