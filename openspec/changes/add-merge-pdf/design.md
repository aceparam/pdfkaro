# Design

## Context

`add-tool-widget` gives the worker plumbing, the widget and the engine contract. A trial in Node showed that qpdf 12.2 compiled to WebAssembly merges files, counts pages, rejects a wrong password, fails on damaged files, and reports write progress. A trial in Chromium showed it loads in a module worker from `_astro/` under the `/pdfkaro` sub-path when given the address of its WebAssembly file (`locateFile`); it ignores a `wasmBinary` option.

## Goals / Non-Goals

**Goals:** Merge PDF works end to end in the browser, at 360px and 1280px, with keyboard and screen reader, and nothing about a file leaves the device.

**Non-Goals:** see the proposal's out-of-scope list.

## Decisions

### 1. The engine

- Files are written into qpdf's in-memory file system as `/in/0.pdf`, `/in/1.pdf` and so on. Visitor file names are never used as paths or arguments.
- The command is `--decrypt /in/0.pdf --pages . 1-z /in/1.pdf 1-z ... -- /out.pdf`. The first file is the primary input, which is what keeps its bookmarks and attachments. `--decrypt` drops the first file's encryption, which qpdf otherwise keeps: a trial with `restricted.pdf` first gave a locked result without it and a clear one with it.
- `src/engines/qpdf.ts`, the wrapper around the WebAssembly build, is in this change, and qpdf joins `EngineTools` here: the worker makes it from the address of its WebAssembly file, a Node test from the file on disk. What qpdf prints goes to the wrapper's capture, never to the console.
- A password goes only inside `--password=<value>`, never as an argument of its own; a trial confirmed qpdf takes a value starting with `@` or holding a newline literally there, while it expands an argument that is exactly `@path`.
- Exit 0, or 3 (done with warnings), is success.
- Progress: one `reading` step per input as it is written, then the percentages qpdf prints while writing.
- `inspect` runs `--show-npages`, with the password if typed. Exit 0 or 3 gives the page count. "invalid password" gives needs-a-password. Anything else gives damaged; the page's PDF check has already turned away files that are not PDFs.

### 2. The page

`[slug].astro` passes the tool's id and widget words to `ToolWidget` (`client:load`) inside `ToolShell`, and renders `src/content/tools/merge-pdf.md` below it.

### 3. Test set

`tests/fixtures/make.mjs` makes, with `@cantoo/pdf-lib` and qpdf, and the files are committed: `text.pdf` (3 pages), `pages-500.pdf`, `scanned.pdf` (images, no text layer), `password.pdf` (password `open-sesame`), `restricted.pdf`, `damaged-xref.pdf` (a cross-reference table pointing to the wrong places), `damaged-cut.pdf` (cut off part way), `not-a-pdf.pdf`, `form.pdf`, `mixed.pdf` (four sizes and rotations), `rich.pdf` (bookmarks, a link, an attachment). qpdf reads neither damaged file, so both are expected to give the damaged state. `make-large.mjs` writes a file over 100 MB to a path outside the repo.

### 4. Tests

- **Unit, in Node:** `inspect` and the merge engine against every fixture, with the expected outcome recorded per file in `tests/fixtures/README.md`; every merged result passes qpdf's `--check`, and its page count and the order of its pages are checked; with `password.pdf` or `restricted.pdf` first, `--is-encrypted` shows the result is not encrypted.
- **End to end, at 360px and 1280px:** pick, reorder with the keyboard, merge, download and check the saved file; at 1280px, reorder with a mouse drag too; one file; not a PDF; password wrong then right; leave a file out; damaged with others, and a damaged file on its own; Cancel; failure when the engine cannot be fetched; Start again; picker with Enter and Space; no sideways scroll in each state; and that nothing but the picker loads before a pick.
- **The no-upload test:** listens at the browser context, so requests from the worker are seen, and also listens for WebSockets. After a pick it allows only an exact list of the site's own files: the worker, the workspace chunk, the engine and the WebAssembly; anything else fails, including a GET to the site with data in its address. It then checks cookies, local and session storage, IndexedDB, the Cache API, the private file system (OPFS), the page title, the page address and the console for a file name or the password. A control test plants a POST, a `sendBeacon`, an image address holding the file name, and a fetch from the worker, and shows the watcher fails on each.
- **Leaving and starting again:** after "Start again", and after leaving the page and coming back with Back, the file input is empty, no download link is left and no file name is on the page.
- **Responsiveness:** a test merges `pages-500.pdf` twice over and asserts no long task over 100 ms on the page while it runs.
- **The file over 100 MB:** run by hand with `make-large.mjs`, and the outcome recorded in the pull request.

### 5. Dependencies

| Package | Why | Licence | Last release | Shipped |
| --- | --- | --- | --- | --- |
| `@neslinesli93/qpdf-wasm` 0.3.1, exact | qpdf 12.2 in WebAssembly, the library `SPEC.md` names for page structure | ISC wrapper; qpdf Apache-2.0 | Nov 2026 | 17 KB script and 443 KB WebAssembly by gzip, after a pick |
| `@cantoo/pdf-lib` 2.11.1 | Makes the test files. The fork `SPEC.md` names | MIT | Sep 2026 | None; tests only |

### 6. Page weight

`scripts/page-weight.mjs` names each file that loads after a pick by its exact base name (the worker, the workspace chunk, the engine, the WebAssembly), never by a broad pattern, so the check stays strict. It reports the tool page's weight before a pick, which must stay under 100 KB by gzip, and after a pick, for information. Over 100 KB before a pick, work stops and the owner is asked.

### 7. Threats

- **Malicious PDF:** parsed only by qpdf, inside WebAssembly, inside a worker with no network use. A crash or running out of memory ends the worker and shows the failed state.
- **Hostile file name:** shown only as text, never a path or an argument; the output name is cleaned.
- **Passwords:** in memory only, sent only to the worker, used only inside `--password=`.
- **A prebuilt binary from one maintainer:** pinned to an exact version and checked by the lockfile's hash. Building qpdf from source is an option recorded for the owner.

## Risks / Trade-offs

- **Later files lose bookmarks and attachments,** by the owner's decision; the page says so.
- **Progress is by file and percentage, not by page;** qpdf reports no pages.
- **A merge holds about three copies of the files at its peak.** The 100 MB warning covers large jobs.
