# Proposal

## Why

Every tool page needs the same moving parts: a file picker, a working area, progress with Cancel, a result block, and a Web Worker that runs the engine away from the page. None exist yet. `SPEC.md` ("Build phases", rule 3) says shared components arrive in their own change before the tool that first needs them. This is that change. Merge PDF follows in `add-merge-pdf`.

## What Changes

Phase 0 steps 4 and 5 in `CLAUDE.md`.

- **Worker plumbing.** Typed messages, progress, cancel, and late loading: a worker and engine are fetched only after a file is picked. One worker entry serves every tool; a tool adds one engine file.
- **Widget logic, apart from views.** The steps a tool goes through (empty, getting ready, files listed, working, done, failed) as a plain reducer, plus file sizes, counts, output names and reordering, all tested in Node.
- **Shared components.** `ToolWidget` (the one island), `FilePicker`, `ToolWorkspace` (loaded after a pick), `PageGrid`, `Result`, and small parts: `ProgressBar`, `Notice`, `PasswordField`.
- **A check that a file is a PDF** before any engine loads, by its first bytes.
- **Tests** in Node for the reducer, the formatting, the PDF check, the worker messages and the client (against a fake worker), and for the components rendered to HTML.

Not in this change:

- **No page uses the widget yet.** It is mounted on the Merge PDF page by `add-merge-pdf`, together with the first engine, so the end-to-end tests run against a real job.
- **Thumbnails.** `PageGrid` takes an optional thumbnail per item; nothing passes one yet. Thumbnails need PDF.js and come in a later change.
- **Handing a result to another tool.** No second tool exists.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: adds the one generic widget, the keyboard and pre-script rules for the picker, and the focus rules; changes the damaged-file state so that it links to Repair PDF only once Repair PDF is published.

## Impact

- **`SPEC.md` sections implemented:** "Tool page anatomy" (parts 3 to 6 and every state), "Architecture and tech stack" (rules 3 and 4), "Definition of done" (keyboard and screen reader use).
- **Phase:** Phase 0. No tool is completed by this change, and no gate is passed.
- **Where files are processed:** nowhere yet; no engine exists. The worker plumbing is built so that no message leaves the page and the worker.
- **Open decisions touched:** none.
- **Dependencies:** none.
- **Page weight:** `ToolWidget` and `FilePicker` will be the only script on a tool page before a pick, beside React. Measured in `add-merge-pdf`, when they are first mounted.
