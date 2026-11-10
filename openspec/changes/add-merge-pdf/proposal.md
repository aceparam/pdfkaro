# Proposal

## Why

The site has a Merge PDF page with a heading and nothing to use. The owner has asked for the tool itself. Merge PDF is the first tool in the catalogue, and it is the one that proves the shared parts every later tool needs: the file picker, the working area, the result block and the Web Worker plumbing. This change finishes steps 4, 5 and 6 of Phase 0.

## What Changes

One change, for one tool: Merge PDF, with the shared parts it is the first to use.

- **Engine.** `src/engines/merge.ts` joins PDFs in the order given, using qpdf compiled to WebAssembly. `src/engines/inspect.ts` reads one file and reports its page count, or that it needs a password, or that it is damaged.
- **Worker plumbing.** Typed messages, progress, cancel, and late loading: the engine and the WebAssembly file are fetched only after a file is picked.
- **Shared components.** `FilePicker`, `PageGrid`, `Result`, and one generic island, `ToolWidget`, that every tool page will use. Small parts they share: a progress bar, a problem box, a password field.
- **Logic apart from views.** The steps a tool goes through (empty, getting ready, files listed, working, done, failed) are a plain state function, tested in Node. So are output names, sizes in plain units and reordering.
- **The page.** The Merge PDF page gets the working tool and the text below it: how-to steps and questions, drafted and marked for the owner.
- **Registry.** The Merge PDF entry gains the words its widget shows: the picker label, the main button, the suffix for the output name.
- **Tests.** Unit tests for the engines and the logic, an end-to-end test of the whole job, the no-upload test, and a test set of PDFs under `tests/fixtures/`.

### Why this is one change and not two

`CLAUDE.md` planned the worker plumbing and shared components as one change and Merge PDF as the next. `SPEC.md` ("Build phases") says a tool that needs a new shared component adds it in its own pull request first. Here they are built together, for two reasons. The shared components have no other user and cannot be tested end to end without a tool; `SPEC.md` itself says Merge PDF is first "because every shared component gets exercised by it". And the owner asked for the tool. From the next tool on, a new shared component goes in its own change first.

### Out of scope

- **Page thumbnails.** The working area lists each file with its name, page count and size, but draws no thumbnail. Thumbnails need PDF.js, a second large library, and are left for the next change. Until then Merge PDF does not pass "Tool page anatomy" part 4 in full, and the Phase 0 gate is not claimed.
- **Carrying the result into another tool.** No other tool exists yet, so the result block shows no next steps.
- **A link to Repair PDF** from a damaged file. Repair PDF is a phase 2 tool; the registry rule is that a page links only to published tools.
- **A file over 100 MB in CI.** The script that makes one is added; the run against it is manual.
- **Text in Hindi, Telugu, Arabic and Chinese in the test set.** It needs four fonts that are not on the build machine. Recorded as a gap; Merge PDF copies pages whole and does not touch text.

## Capabilities

### New Capabilities

- `merge-pdf`: what the Merge PDF tool does, state by state.

### Modified Capabilities

- `tool-page`: adds the requirement that every tool page uses one generic widget island, and that only the file picker loads before a file is picked.

## Impact

- **`SPEC.md` sections implemented:** "Tool catalogue" (Merge PDF, `/merge-pdf`, browser, phase 1 order, built in Phase 0 as the first tool), "Tool page anatomy" (parts 3 to 7 and every state), "Architecture and tech stack" (rules 2, 3 and 4; qpdf for page structure), "Privacy, limits and security" (browser tools), "Definition of done".
- **Where files are processed:** in the visitor's browser, in a Web Worker. No request carries a file, a file name or a password. The only new requests are for the site's own script and WebAssembly files, after a file is picked.
- **Open decisions touched:** none is settled. Licence: qpdf is Apache-2.0 and its WebAssembly build is ISC; no AGPL code is added and no `LICENSE` file. Ghostscript is not used.
- **Questions for the owner that this change builds a default for:**
  1. **Two steps to download.** "Merge and download" starts the job; the result then has its own Download button, because `SPEC.md` says nothing downloads on its own. Built as `SPEC.md` has it.
  2. **Bookmarks and attachments.** The first file's are kept. Those of later files are lost; qpdf joins pages, not whole documents. The page says so.
  3. **Passwords and restrictions.** The merged file has none, even when an input had them. The page says so.
  4. **The name of the merged file** is the first file's name with `-merged`.
  5. **The 100 MB warning** is shown when the files together pass 100 MB.
- **Dependencies:** `@neslinesli93/qpdf-wasm` at run time, loaded late; `@cantoo/pdf-lib` for making and checking test files only.
- **Page weight:** the tool page loads React, the widget and the file picker before a file is picked, and must stay under 100 KB by gzip. The engine (about 17 KB of script and 443 KB of WebAssembly, by gzip) loads after.
- **Definition of done:** not met in full by this change. Open after it: thumbnails; the multilingual fixture; opening the output by hand in Chrome, Firefox, Adobe Reader and macOS Preview; Firefox, Safari and phone browsers; the owner's review of the page text.
