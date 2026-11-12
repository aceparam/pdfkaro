# Design

## Context

- **Built and ready to use** (`add-page-items-and-zip`, on this branch, approved at stage 2):
  - `items: 'pages'`: page items, the file line, the skip link, and one PDF.js document kept open across thumbnails;
  - `outputs: 'several'`: several outputs zipped in the worker with `fflate`, loaded at the start of every run;
  - `chooseFiles`: a one-file tool keeps the first file of a drop or paste;
  - `partName`, `outputName` and the stem checks.
- **Merge PDF** shows the pattern for a qpdf engine (`src/engines/tools/merge-pdf.ts`), its unit tests, and its end-to-end and no-upload tests (`tests/e2e/merge-pdf.spec.ts`).
- **The run message** already carries `options`, a plain record the engine checks for itself. `useToolRun.start()` sends `{}` today.
- **What qpdf 12.2 (the WebAssembly build) does with a part**, measured on `rich.pdf` while writing this change:
  - `in.pdf --pages . 2 -- out.pdf` keeps the whole outline. A bookmark to a page not in the part stays, pointing nowhere (`destpageposfrom1: null` in `--json=2 --json-key=outlines`). Attachments and form fields are kept.
  - `--split-pages` drops every bookmark and attachment.
  - `--remove-attachment=<key>` removes an attachment.
  - `--update-from-json` works when each changed object is given whole, and it is applied before pages are selected (decision 2).
  - One qpdf instance breaks after about 276 calls (decision 2).
- **The owner decided on 12 Nov 2026,** while this change was written and reviewed:
  - each part keeps only the bookmarks that point to its own pages;
  - attached files go with the first part only;
  - parts have no password and no restrictions, as for Merge PDF;
  - a zip result shows no next steps for now.

## Goals / Non-Goals

**Goals:**
- Split PDF end to end, meeting "Definition of done".
- Cut points marked with toggles that work with a keyboard, a screen reader and a thumb.
- A file with any number of pages never freezes the page.

**Non-Goals:**
- Typed ranges, split by size, split by bookmarks.
- Moving, rotating, deleting or selecting pages.
- Next steps in the result.

## Decisions

### 1. Registry entry

```ts
{ id: 'split-pdf', group: 'organise', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['merge-pdf', 'extract-pdf-pages', 'delete-pdf-pages', 'rearrange-pdf-pages', 'rotate-pdf'],
  pages: [{ slug: 'split-pdf', name: 'Split PDF', summary: 'Cut one PDF into several.',
           heading: 'Split a PDF file', sentence: 'Cut one PDF into several. Files stay on your device.', ... }],
  widget: { pickerLabel: 'Choose a PDF file', multiple: false, minFiles: 1,
            items: 'pages', itemControls: false, itemToggle: { kind: 'cut-after', label: 'Cut after' },
            outputs: 'several', partSuffix: 'part', outputSuffix: 'split', resultPages: 'input',
            actionLabel: 'Split and download', writingLabel: 'Putting the files into one zip',
            memoryAdvice: 'Mark cuts so the file is split into fewer parts, then try again.', ... } }
```

- **`itemToggle: { kind, label }`** is a new optional field. `kind` decides what the toggles mean, so a later tool with a different per-page toggle (Extract pages, Delete pages) adds its own kind instead of inheriting Split's. Only one kind is added now, `'cut-after'`, which decides:
  - the engine option, `cuts`;
  - that the last page has no toggle;
  - the summary line, from `cutSummary`.

  Only `items: 'pages'` tools may set it; the registry test checks this.
- **`resultPages: 'sum' | 'input' | 'none'`** replaces the boolean `resultPagesAreSum`. It says where a single output's page count comes from. Merge PDF becomes `'sum'`, and Split PDF is `'input'`: its one part, from a one-page file, is the whole file. Delete pages and Extract pages will choose their own value. The count is never keyed on `items: 'pages'`.
- **`memoryAdvice`** is a new optional word: the thing to try after running out of memory. Tools without it keep the shared sentence, "Your browser ran out of memory. Try fewer or smaller files." Split's advice points the right way, since no cuts gives the most files.
- **`related`** links only to published tools, as now. Until the others exist, that is Merge PDF alone.
- **The registry test** gains Split PDF in the catalogue order check. It already refuses `items: 'pages'` with `itemControls: true`.

### 2. The engine: `src/engines/tools/split-pdf.ts`

```ts
type Options = { passwords?: (string | undefined)[]; cuts?: number[] };
export function parts(pages: number, cuts: number[]): { first: number; last: number }[];
export function keptOutline(outline: OutlineItem[], first: number, last: number): OutlineItem[];
export const run: Engine<Options>;
export const inspect = inspectPdf;
```

**`parts`** is a pure function:
- it turns cuts into page runs;
- with no cuts it gives one part per page;
- it refuses cuts that are not whole numbers between 1 and `pages - 1`, are repeated, or are out of order.

The engine checks `options` itself, because the worker passes it on unchecked.

**Two facts about this qpdf build shape `run`** (measured in Node by the stage 1 architect review):
- **One qpdf instance breaks after about 240 to 276 writing calls** ("table index is out of bounds", "memory access out of bounds"). So every part gets a fresh instance from `tools.qpdf()`. The input is written into each one. No files need deleting, because the instance is let go. Measured: 500 one-page parts of `pages-500.pdf`, split and checked, took 28.1 s, with peak memory about 124 MB.
  - **Each instance fetches `qpdf.wasm` from its address, as before; it is not compiled once per worker.** Changed while building: compiling it once needs a `fetch` in `tool.worker.ts`, which lint forbids there for privacy. The browser serves the file from its cache, so each later fetch carries nothing and leaves the site's own origin for nothing; the no-upload test compares sets of addresses, so repeats change nothing it checks. The cost is a compile per part, inside the 28 s measured for 500 parts.
  - A failed instance allocation reads "could not allocate memory" in V8; `failureKind` counts it as memory.
- **qpdf's JSON update does not reach objects kept in an object stream** (found while building, on `rich.pdf`). So the input is first copied once, decrypted and with `--object-streams=disable`, and every later step works on that plain copy with no password. qpdf renumbers objects in the copy, which is fine, since everything is read from it.
- **qpdf will not write JSON on an instance that has already written anything else to standard output.** So JSON is always read on an instance of its own.
- **`--update-from-json` is applied before pages are selected.** So the outline is read once from the input, and each part is written in one call: `/in.pdf --update-from-json=/u.json --pages . first-last -- /out.pdf`. The format that worked gives each changed object as its whole dictionary, in the input's own object numbers:

  ```
  {"qpdf":[{"jsonversion":2,"pushedinheritedpageresources":false,"calledgetallpages":false,"maxobjectid":N},
           {"obj:12 0 R":{"value":{...whole dictionary...}}}]}
  ```

**`run`:**
1. **Read once, from the input,** on one qpdf instance:
   - the page count;
   - the outline, with `--json=2 --json-key=outlines`;
   - the outline objects' dictionaries and the catalog's, with `--json=2 --json-key=qpdf` and `--json-object` for each;
   - the attachment names, with `--json=2 --json-key=attachments`.
2. **For each part `k`, on a fresh instance:**
   - Work out the update in a pure function: `keptOutline(outline, first, last)`, then the whole dictionaries that change.
     - `keptOutline` keeps an item whose page is in the part, drops one whose page is not, and moves a kept child of a dropped item up to its place.
     - The update rewrites `/First`, `/Last`, `/Next`, `/Prev`, `/Parent` and `/Count` on the outline objects. It removes `/Outlines` from the catalog when nothing is kept.
     - For parts after the first, it also removes `/EmbeddedFiles` from `/Names`, and removes the catalog's `/AF`, which points at the same file entries (`rich.pdf`'s catalog has both). When `/Names` is an object of its own rather than written inside the catalog, the update rewrites that object. This drops the attached files without passing any attachment name to qpdf as an argument.
   - A part that needs no change skips the update.
   - Write it: `--password=… --decrypt /in.pdf [--update-from-json=/u.json] --pages . first-last -- /out.pdf`.
     - Using the input as the primary file keeps form fields, links and document metadata.
     - `--decrypt` drops encryption and restrictions, by the owner's decision.
     - The password goes only inside `--password=`, as in `inspect` and Merge PDF. A visitor's file name is never a path or an argument.
   - Run `qpdf --check` on the part. A part that fails is a failed job, never a broken file handed back.
   - Read the part and report `{ stage: 'working', unit: 'file', done: k, total }`.
3. Return the parts. The worker zips them when there are several, as built in `add-page-items-and-zip`.

**Why one qpdf call per part, and not `--split-pages`:** `--split-pages` reads the file once, but it drops bookmarks and attachments, which the owner's decisions keep. One call per part reads the file each time, so 500 parts of a large file is slow. It shows progress per file, Cancel works, and the page never blocks, because all of this runs in the worker. See Risks.

**Limits of the zip we make.** `fflate`'s `zipSync`, the owner's choice of zip library, writes no ZIP64, so a zip it makes cannot hold more than 65,535 entries or 4 GB. ZIP64 would lift both, but needs a different writer, our own code or another library; the owner turned down our own code once, so lifting the limit is the owner's call. This is the agent's decision, recorded with the others in `CLAUDE.md` and named in the pull request. Both numbers, and the sentences built from them, are in one plain module, `src/widget/zip-limits.ts`, which the engine, the worker and the page all read, so PDF to JPG and PDF to PNG reuse them. The engine checks early, so it never builds gigabytes of parts first; the worker checks the exact size (`fitsInOneZip`, names counted in UTF-8 bytes) again just before `zipSync`, so no tool can hand back a broken zip. The advice in the sentence is the tool's own registry word, `zipLimitAdvice`. The engine signals both by throwing an error named `TooBigForZip` with its reason, which `failureKind` recognises by name, giving one of two failure kinds, `too-many-files` or `zip-too-large`, one for each sentence; the engine imports no worker code:
- before any part is written, a job of more than 65,535 parts fails at once, and the page says "This would make more than 65,535 files, more than one zip can hold. Mark cuts so the file is split into fewer parts.";
- while parts are written, if their total passes 4 GB less the room for the zip's own headers, the job stops, and the page says "This would make a zip over 4 GB, more than one zip can hold. Mark cuts so the file is split into fewer parts." Fewer parts copy shared images and fonts fewer times, so this is the one thing to try.

**Outline objects that are something else.** The update writes whole dictionaries in the input's object numbers, so a crafted outline whose links point at the catalog, a page, the `/Outlines` root or the `/Names` object would get that object rewritten. If any outline item's object is one of these, the part keeps no outline at all. The update file is always built with `JSON.stringify` from parsed objects, never by joining strings.

**Outlines deeper than qpdf reports.** The engine reads the outline to 48 levels and keeps the item at level 48 with no children, so a deep outline keeps its first 48 levels in the part they point into. qpdf's JSON stops at about 50 levels without saying so. An item that qpdf reports at the deepest level, whose own dictionary still has `/First`, has children the engine cannot see. The update clears that item's `/First`, `/Last` and `/Count`, so nothing below it survives to point into another part. The engine's own depth limit is 48, below qpdf's cut.

**Attachments are checked, not assumed.** After writing each part after the first, the engine lists its attachments (`--json=2 --json-key=attachments`) and checks that the catalog has no `/AF`. If either remains, the job fails, never handing back a part that still carries an attached file. File-attachment annotations on a page are part of that page, so they go with whichever part holds the page; the page text says so. This is the agent's reading of the owner's decision, accepted by the program manager at stage 1, recorded under "Decisions the agent made for the owner" in `CLAUDE.md` and named in the pull request, so the owner can overturn it.

**Unknown outline shapes.** A bookmark whose destination qpdf cannot resolve to a page counts as pointing nowhere, and is dropped. That covers named destinations qpdf cannot follow, and actions other than go-to.

**`keptOutline` will have more callers.** Extract pages and Delete pages need the same rule. It stays in `split-pdf.ts` for now. The second caller's change moves it into `src/engines/outline.ts`, beside `inspect.ts`, rather than copying it.

**Memory and time, measured** (task 3.2, desktop Chromium, headless, on the built site; peak is the browser's largest process):

| Run | Time | Peak | Outcome |
| --- | --- | --- | --- |
| `pages-500.pdf`, no cuts | 34 s | about 470 MB | 500 files, 653 KB zip |
| `pages-500.pdf`, two cuts | 0.9 s | about 180 MB | 3 files |
| The 105 MB file from `make-large.mjs` (one page) | 1.9 s | about 190 MB | One PDF, 105 MB |
| 500 pages sharing one 10 MB image, no cuts (about 5 GB of parts) | 51 s | about 4.9 GB | Stopped with "This would make a zip over 4 GB, more than one zip can hold. Mark cuts so the file is split into fewer parts." The tab did not crash |
| 120,000 pages, no cuts | 3.4 s | about 340 MB | Stopped at once with the 65,535-file sentence |
| 120,000 pages, cuts after pages 100 and 400 | over 25 min, stopped by hand | about 760 MB | Still working; the page stayed responsive. See Risks |

The 5,000-page file sharing a 1 MB image was started, but about 1.4 s per part makes it about two hours, so the 500-page file sharing a 10 MB image stood in for it: the same 5 GB of parts in a tenth of the parts. No run crashed the tab, so building did not stop. A phone has far less memory; the hand check on a phone is in issue #7.

At the peak the worker holds the input (its own copy, the plain copy, and one inside the current qpdf instance), every part, and then the zip, about the size of all the parts together. The parts can add up to much more than the input, because shared resources such as fonts and images are copied into each one: no cuts on `pages-500.pdf` gave 559 KB of parts from a 198 KB input. Handing parts one at a time to a streaming zip would lower the peak, but changes the shared engine and worker contract, which needs its own change first.

### 3. The cut toggles

- **`PageGrid`** gains an optional per-item toggle:

  ```ts
  toggle?: { label: string; name(title: string): string; pressed: ReadonlySet<string>; onToggle(id: string): void; skip?: ReadonlySet<string> }
  ```

  - It is a real `<button type="button" aria-pressed>`, at least 44px tall, under the page's caption, as wide as its cell, with its text allowed to wrap, so it never overflows a cell at any width or text size.
  - Its visible text is the registry label ("Cut after"). Its accessible name is "Cut after page 3".
  - `skip` holds the last page, which has no button.
  - A pressed toggle shows by shape, not fill: a 2px `--text` border and bold text. The cell also draws a 2px `--text` line on its trailing edge. Only the main button is filled, so it still stands out with many cuts marked.
  - **A pressed toggle keeps its size.** An unpressed toggle has 1px more padding than a pressed one, so the 2px border and bold text neither move the cell's contents nor re-wrap the label.
  - Toggling keeps focus on the button.
  - **`PageItem` stays memoised.** Each item gets only plain props: its `pressed` and `toggleable` flags. `onToggle` and `name` are reached through the existing stable `actions` and `latest` refs, never passed into each item.
- **`useToolRun`** keeps the cuts as a set of page numbers in the reducer (`state.marks`):
  - cleared when the file is removed, replaced or started again;
  - kept through Cancel and failure;
  - for `kind: 'cut-after'`, sent as `options: { cuts: [...marks].sort((a, b) => a - b) }`, sorted as numbers. Sorted as text, `[10, 9]` would stay out of order and the engine would refuse it. A unit test covers cuts 9 and 10.
- **The line above the pages** comes from `cutSummary(pages, cuts)`, in its own file, `src/widget/cuts.ts`. These are Split's own words, and `format.ts` says a tool's own words do not belong there. It is used only for `kind: 'cut-after'`.
  - "No cuts marked. You will get one file per page, 12 files."
  - "Cut after page 7. You will get 2 files."
  - "Cuts after pages 3 and 7. You will get 3 files."
  - "Cuts after pages 3, 7 and 9. You will get 4 files."
  - up to five cut points are listed; past five it gives a count: "12 cuts marked. You will get 13 files."
  - "This file has one page. You will get it back as one file."
  - numbers have a thousands separator: "You will get one file per page, 1,200 files."

  It is shown in `ToolWorkspace` under the file line. After a cut is marked, the status region says the new summary, which names it: "Cuts after pages 3 and 7. You will get 3 files." Past five cuts the summary gives only a count, so the cut is named first: "Cut after page 40. 6 cuts marked. You will get 7 files." After a cut is cleared, it says so first, then the summary: clearing the only cut on a 12-page file gives "Cut after page 3 cleared. No cuts marked. You will get one file per page, 12 files."

### 4. Batches of 500 pages

- **`shown` lives in the reducer,** starting at 500. It goes back to 500 when the file is removed, replaced or started again.
- **`gridItems` gains a `limit` argument,** and every caller passes `shown`: `ToolWorkspace`, and the thumbnail queue's `pump` in `useToolRun`. So a 120,000-page file builds at most `shown` entries, on every render and after every thumbnail. A unit test checks that `pump` builds no more than `shown`.
- **After the last shown page,** a button in real units, "Show pages 501 to 1,000" (and, for a last short batch, "Show pages 1,001 to 1,200"), raises `shown` by up to 500.
- **Focus after the press** moves to the first new page's toggle, "Cut after page 501", which sits where the button was, so it stays in view. For a grid with no per-page control, it moves to the first new cell, focusable with `tabindex="-1"`. The status region says "Showing 1,000 of 120,000 pages".
- **Cells are put on the page in steps:** about a screenful (30) first, then 100 a frame up to `shown`. Measured with the CPU slowed four times, 500 cells at once blocked the page for 145 ms in the frame the workspace first appears; in steps, the longest task is 69 to 91 ms.
- **Thumbnails** are still drawn only as items come into view.
- **The skip link** stays above the grid.
- **What it does to Merge PDF:** nothing. Its list is of files.

### 5. Working

- **Before the first progress report** the line reads "Starting" for a tool with `outputs: 'several'`, not "Starting on 1 file", which would count the input while the next line counts parts.
- **Then** "File 3 of 12" as each part is written.
- **After the last part,** while the worker zips them, the line shows the tool's `writingLabel`, "Putting the files into one zip". The worker posts `{ stage: 'writing', percent: 100 }` before zipping, and only when there are several parts. So the line never sits at "File 12 of 12", and a one-page file never says it is making a zip.

### 6. The result

- **Several parts:** `report-split.zip` with "N files", as built.
- **One part:** only a one-page input gives one part, since any file of two or more pages gives at least two. It comes back as `form-split.pdf` with "1 page", from `resultPages: 'input'`. No extra read is needed.

### 7. The page text

`src/content/tools/split-pdf.md`, marked as a draft for the owner:
- how-to steps;
- questions:
  - Are my files uploaded?
  - How do I choose where to cut?
  - What do I get if I mark no cuts?
  - How are the files named?
  - What happens to bookmarks and attached files?
  - Can I split a PDF that has a password?
  - What if the file is damaged?

The text runs 250 to 500 words.

### 8. Tests

**Engine unit tests (`tests/unit/split-pdf.test.ts`):**
- `parts`: no cuts; cuts; edge cuts; refusals.
- `keptOutline`: flat, nested, a dropped parent with kept children, nothing kept.
- `run` on every fixture:
  - page counts per part;
  - `qpdf --check` passes;
  - links and form fields are kept;
  - `rich.pdf`'s bookmarks and attachment go per the owner's decisions;
  - `password.pdf` with its password gives parts with no encryption;
  - damaged files fail;
  - progress is reported per file.

**End-to-end test (`tests/e2e/split-pdf.spec.ts`), at 360px and 1280px:**
- pick, see the pages, mark and clear cuts with the mouse and with the keyboard, split, download and unzip;
- no cuts on `text.pdf` gives three one-page files;
- `form.pdf` gives one PDF;
- the password, damaged, not-a-PDF, two-file drop, replace by paste, Cancel and failure states;
- the skip link;
- the button to show more pages ("Show pages 501 to 1,000"), with a generated file of a very large page count.

**The no-upload test.** It moves the watcher from `merge-pdf.spec.ts` into `tests/e2e/no-upload.ts`, shared by both tools. Split's test adds the four checks from `add-page-items-and-zip` design decision 10:
1. **The allowlist** names `fflate-<hash>.js` and `split-pdf-<hash>.js` exactly. The shared file exports `watch` and `violations` and takes each tool's allowlist as an argument: Merge PDF's list stays as it was, so it never allows fflate or the Split engine; it gains only `inspect-<hash>.js`, because once two engines import `inspect.ts` the build gives it a file of its own.
2. **One part and several parts.** Each run is recorded on a fresh page, from the press of "Split and download" to the result. Each run's own set must hold the exact `fflate-<hash>.js` path, and the two sets of pathnames, leaving out `blob:` addresses, must be equal.
3. **Secrets.** The file is picked under a distinctive name, `qz7report.pdf`, a copy of `password.pdf` given with `setInputFiles({ name, mimeType, buffer })`. The full name, its stem `qz7report` and the password are all strings no request may carry. Matching the stem also catches every output name, `qz7report-split.zip` and `qz7report-part-1.pdf`.
4. **Plants.** A request to the real `/_astro/fflate-<hash>.js` path with `?x=1` must be reported as data in the address, and only that. A POST with a body to the same path must be reported for its method and body. The general plants (a POST, a `sendBeacon`, an image address holding the name, a fetch from the worker) run once against the shared code; the fflate plants run on `/split-pdf`.
5. **Bookmark titles.** The test runs `rich.pdf` and checks that "Chapter one" is in no request and not in the console.

**The very-large-page-count file:**
- `tests/fixtures/make-many-pages.mjs` writes 120,000 pages that share one content stream, about 10 MB, to the system's temporary folder, refusing a path inside the repo, as `make-large.mjs` does.
- It is not committed.

### 9. Page weight, and what loads when

- **Before a pick:** the same as Merge PDF, 76.8 KB gzip plus the page's own HTML. `PageGrid`'s toggle and the batch button are in the workspace chunk, which loads after a pick.
- **After a pick:** the worker; qpdf and its WebAssembly, fetched when the file is read, as for Merge PDF; PDF.js and its data, for thumbnails; the Split engine, a small file.
- **On every run:** fflate, 4.4 KB.
- **`page-weight.mjs` and `check-worker.mjs`** name `split-pdf-<hash>.js`. `check-worker.mjs` already checks every engine is its own late file.

### 10. Dependencies

None added. qpdf, PDF.js and fflate are already shipped.

### 11. Threats

- **A malicious PDF:**
  - qpdf and PDF.js run in workers, as for Merge PDF;
  - a part that fails `qpdf --check` fails the job;
  - outline JSON from qpdf is parsed with `JSON.parse` (which does not recurse in V8) and walked with a depth limit of 48, below qpdf's own cut at about 50 levels, and a visited set, so a cyclic or very deep outline cannot hang the worker. Items below the cut are cleared explicitly (decision 2).
- **A huge page count:** batches of 500 on the page, in place of the page-count cap `add-page-items-and-zip` asked for, since a cap would be a fixed limit `SPEC.md` rules out. In the worker, `parts` makes one entry per part. More than 65,535 parts, or more than 4 GB, cannot fit in one zip, so such a job fails at once, or as soon as the total passes, with a message that says to mark cuts (decision 2). Below that it runs with progress and Cancel and never blocks the page. Whether a phone gives the memory message or loses the tab is not assured: a tab the system kills for memory shows nothing. Task 3.2 measures it by hand, and building stops if it crashes the tab.
- **Shared resources multiplied:** a small file whose many pages share one large image gives parts many times its size. Task 3.2 measures this case and building stops if it crashes the tab.
- **Attached files leaking into later parts:** removed through `/Names` and `/AF`, then checked; a part after the first that still carries one fails the job.
- **An oversized file:** the 100 MB warning; no limit.
- **A hostile file name:** names go only through the shared cleaning and the worker's stem check. Zip entries are the stem plus numbers. qpdf sees only made-up paths.
- **Document text in traces:** this is the first engine to read document text, the outline titles. Outline JSON and titles never go into a log, an error message or a failure sentence; a JSON or qpdf error on that step is caught and turned into the plain failure kind, with no text kept.
- **Hostile options:** `cuts` comes from the page, which could be tampered with. The engine refuses anything but sorted, unique whole numbers in range.

## Risks / Trade-offs

- **Memory for many parts of a large file** is measured in decision 2. No run crashed the tab on a desktop; a phone may close it, with no message.
- **Files of very many pages split slowly.** qpdf's page selection, with the input as the primary file, takes time that grows with the square of the input's page count: picking 400 pages took 1 s from a 5,000-page file, 18 s from a 20,000-page file, and an estimated 10 minutes from a 120,000-page file. qpdf's `--empty` form takes 3 s, but drops the document-level parts the owner's decisions keep (bookmarks, attachments). So above roughly 20,000 pages each part is slow, though the page stays responsive and Cancel works. A faster route for such files would be its own change.
- **One qpdf call per part is slow for many parts of a large file.** 500 parts of a 100 MB file reads 50 GB in all. The 100 MB warning, progress and Cancel cover it. If the owner wants it faster, `--split-pages` could be used for files with no bookmarks and no attachments. That is a later change, measured first.
- **`--update-from-json` is proven on `rich.pdf`'s flat outline only.** Task 2.2 proves it on a nested outline and on a part whose catalog loses `/Outlines` entirely. If it cannot be made to work, building stops and the owner is asked. The choices would be: keep every bookmark in every part, or add a library that edits outlines.
- **Named destinations and go-to actions** that qpdf cannot resolve are dropped, never kept pointing nowhere. A part may then have fewer bookmarks than a person expects. The fixtures README records what each fixture gives.
