# Proposal

## Why

The Merge PDF page has a heading and nothing to use. The owner has asked for the tool itself. Merge PDF is first in the catalogue and the first user of the shared widget from `add-tool-widget`, which must be merged before this change. This change finishes step 6 of Phase 0.

## What Changes

- **Engine.** `src/engines/tools/merge-pdf.ts` joins PDFs in the order given, using qpdf compiled to WebAssembly. `src/engines/inspect.ts` reads one file and reports its page count, that it needs a password, or that it is damaged.
- **The page.** The Merge PDF page mounts `ToolWidget` and gains the text below the tool: how-to steps and questions, drafted and marked for the owner.
- **Registry.** The Merge PDF entry gains its widget words: the picker label, "Merge and download", the output suffix `merged`, at least two files.
- **Test set.** `tests/fixtures/` gains the shared test PDFs, made by a committed script, and a script for a file over 100 MB that is not committed.
- **Tests.** Engine unit tests against every fixture; end-to-end tests of every state; the no-upload test.

### Owner decisions, 11 Nov 2026

Asked by the agent, answered by the owner:

1. **Bookmarks and attachments come from the first file only.** qpdf joins pages, not whole documents. The page says so. This leaves a gap against "Definition of done" ("leaves alone what it was not asked to change: bookmarks"), which the owner accepted; keeping every file's bookmarks can come later.
2. **The merged file has no password and no restrictions,** even when an input had them. The page says so.

### Defaults from `SPEC.md`, built as written

- **Two steps to download.** "Merge and download" starts the job; the result then has its own Download button, because nothing downloads on its own.
- **The merged file's name** is the first file's name with `-merged`.
- **The 100 MB warning** is shown when the listed files together pass 100 MB.

### Out of scope

- **Thumbnails** (needs PDF.js; next change). Until then "Tool page anatomy" part 4 is not met in full.
- **Handing the result to another tool.** No other tool exists.
- **A link to Repair PDF.** Not published; see the `tool-page` change in `add-tool-widget`.
- **Text in Hindi, Telugu, Arabic and Chinese** in the test set. It needs fonts that are not on the build machine. Merge copies pages whole and does not touch text.

### What stays open after this change

So the Phase 0 gate is **not** claimed: thumbnails; the multilingual fixture; opening the output by hand in Chrome, Firefox, Adobe Reader and macOS Preview; Firefox, Safari and phone browsers; the owner's review of the page text.

## Capabilities

### New Capabilities

- `merge-pdf`: what the Merge PDF tool does, state by state.

### Modified Capabilities

None.

## Impact

- **`SPEC.md` sections implemented:** "Tool catalogue" (Merge PDF, `/merge-pdf`, browser), "Tool page anatomy" (parts 3 to 7, every state), "Architecture and tech stack" (rule 2; qpdf for page structure), "Privacy, limits and security" (browser tools), "Definition of done".
- **Where files are processed:** in the visitor's browser, in a Web Worker. No request carries a file, a file name or a password. The only new requests are for the site's own worker, engine and WebAssembly files, after a file is picked.
- **Open decisions touched:** none settled. qpdf is Apache-2.0 and its WebAssembly wrapper ISC; no AGPL code and no `LICENSE` file.
- **Page budget:** the tool page before a pick must stay under 100 KB by gzip. If it does not, work stops and the owner is asked, as `CLAUDE.md` says.
- **Dependencies:** `@neslinesli93/qpdf-wasm` at run time, after a pick; `@cantoo/pdf-lib` for making and checking test files only.
