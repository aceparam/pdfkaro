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
  - `--update-from-json` exits 0. A first try with a hand-written partial object did not change the title, so its exact input format is still to be pinned down (task 2.2).
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
  pages: [{ slug: 'split-pdf', name: 'Split PDF', summary: 'Cut one PDF into several.', ... }],
  widget: { pickerLabel: 'Choose a PDF file', multiple: false, minFiles: 1,
            items: 'pages', itemControls: false, itemToggle: 'Cut after',
            outputs: 'several', partSuffix: 'part', outputSuffix: 'split',
            actionLabel: 'Split and download', ... } }
```

- **`related`** links only to published tools, as now. Until the others exist, that is Merge PDF alone.
- **`itemToggle`** is a new optional word: the visible label of a per-item toggle. Only `items: 'pages'` tools may set it; the registry test checks this.
- **The registry test** gains Split PDF in the catalogue order check. It already refuses `items: 'pages'` with `itemControls: true`.

### 2. The engine: `src/engines/tools/split-pdf.ts`

```ts
type Options = { passwords?: (string | undefined)[]; cuts?: number[] };
export function parts(pages: number, cuts: number[]): { first: number; last: number }[];
export const run: Engine<Options>;
export const inspect = inspectPdf;
```

**`parts`** is a pure function:
- it turns cuts into page runs;
- with no cuts it gives one part per page;
- it refuses cuts that are not whole numbers between 1 and `pages - 1`, are repeated, or are out of order.

The engine checks `options` itself, because the worker passes it on unchecked.

**`run`, for each part `k`, in order:**
1. `qpdf --password=… --decrypt /in/0.pdf --pages . first-last -- [--remove-attachment=… for k > 1] /out.pdf`.
   - Using the input as the primary file keeps form fields, links, attachments and document metadata.
   - `--decrypt` drops encryption and restrictions, as Merge PDF does.
   - The password goes only inside `--password=`, as in `inspect` and Merge PDF. A visitor's file name is never a path or an argument.
2. **Bookmarks.** Read the part's outline with `--json=2 --json-key=outlines`. If any bookmark points to no page in the part:
   - work out the outline to keep in a pure function, `keptOutline(tree)`:
     - keep an item whose page is in the part;
     - drop an item whose page is not;
     - move a kept child of a dropped item up to its place;
   - write it back with `--update-from-json`, which rewrites `/First`, `/Last`, `/Next`, `/Prev`, `/Parent` and `/Count` on the outline objects, and `/Outlines` in the catalog when nothing is kept.
   - A part whose bookmarks all point into it skips this step.
3. Run `qpdf --check` on the part. A part that fails is a failed job, never a broken file handed back.
4. Read the part, report `{ stage: 'working', unit: 'file', done: k, total }`, and delete the part's files from qpdf's memory.

Then it returns the parts. The worker zips them when there are several, as built in `add-page-items-and-zip`.

**Why one qpdf call per part, and not `--split-pages`:** `--split-pages` reads the file once, but it drops bookmarks and attachments, which the owner's decisions keep. One call per part reads the file each time, so 500 parts of a large file is slow. It shows progress per file, Cancel works, and the page never blocks, because all of this runs in the worker. See Risks.

**Unknown outline shapes.** A bookmark whose destination qpdf cannot resolve to a page counts as pointing nowhere, and is dropped. That covers named destinations qpdf cannot follow, and actions other than go-to.

### 3. The cut toggles

- **`PageGrid`** gains an optional per-item toggle:

  ```ts
  toggle?: { label: string; name(title: string): string; pressed: ReadonlySet<string>; onToggle(id: string): void; skip?: ReadonlySet<string> }
  ```

  - It is a real `<button type="button" aria-pressed>`, 44px tall, under the page's caption.
  - Its visible text is the registry word ("Cut after"). Its accessible name is "Cut after page 3".
  - `skip` holds the last page, which has no button.
  - A pressed toggle uses the main button's look. The cell also draws a 2px `--text` line on its trailing edge, so a cut shows without colour alone.
  - Toggling keeps focus on the button. `PageItem` stays memoised: its `pressed` flag is a plain boolean prop.
- **`useToolRun`** keeps the cuts as a set of page numbers in the reducer (`state.marks`):
  - cleared when the file is removed, replaced or started again;
  - kept through Cancel and failure;
  - sent as `options: { cuts: [...].sort() }` when `words.itemToggle` is set.
- **The line above the pages,** in `src/widget/format.ts`, is a pure function `cutSummary(pages, cuts)`:
  - "No cuts marked. You will get one file per page, 12 files."
  - "Cut after page 7. You will get 2 files."
  - "Cuts after pages 3 and 7. You will get 3 files."
  - "Cuts after pages 3, 7 and 9. You will get 4 files."
  - "This file has one page. You will get it back as one file."

  It is shown in `ToolWorkspace` under the file line. After each toggle the status region says "Cut after page 3. You will get 2 files." or "Cut after page 3 cleared. You will get 1 file."
- **These words are not Split's own text in shared code.** `cutSummary` is named for what it says, and it is used only when the registry gives a toggle word. If a later tool needs other words, its change adds them to the registry.

### 4. Batches of 500 pages

- **`gridItems`** is unchanged. `ToolWorkspace` passes `items.slice(0, shown)` to `PageGrid`, with `shown` starting at 500.
- **After the last shown page,** a "Show the next 500 pages" button raises `shown` by 500. Focus stays on the button, which moves to after the new pages. The status region says "Showing 1,000 of 120,000 pages".
- **No item array is built** for pages past `shown`: `gridItems` gains an optional `limit` argument, so a 120,000-page file builds 500 entries, not 120,000.
- **Thumbnails** are still drawn only as items come into view.
- **The skip link** stays above the grid.
- **What it does to Merge PDF:** nothing. Its list is of files.

### 5. The result

- **Several parts:** `report-split.zip` with "N files", as built.
- **One part:** only a one-page input gives one part, since any file of two or more pages gives at least two. It comes back as `form-split.pdf` with "1 page". `words.resultPagesAreSum` stays false. For a tool that lists pages, `useToolRun` gives a single output the input's page count, which is right because the one part is the whole file. No extra read is needed.

### 6. The page text

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

### 7. Tests

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
- "Show the next 500 pages", with a generated file of a very large page count.

**The no-upload test.** It moves the watcher from `merge-pdf.spec.ts` into `tests/e2e/no-upload.ts`, shared by both tools. Split's test adds the four checks from `add-page-items-and-zip` design decision 10:
1. **The allowlist** names `fflate-<hash>.js` and `split-pdf-<hash>.js` exactly. The shared file exports `watch` and `violations` and takes each tool's allowlist as an argument: Merge PDF's list stays exactly as it is, so it never allows fflate or the Split engine.
2. **One part and several parts.** Each run is recorded on a fresh page, from the press of "Split and download" to the result. Each run's own set must hold the exact `fflate-<hash>.js` path, and the two sets of pathnames, leaving out `blob:` addresses, must be equal.
3. **Secrets.** The file is picked under a distinctive name, `qz7report.pdf`, a copy of `password.pdf` given with `setInputFiles({ name, mimeType, buffer })`. The full name, its stem `qz7report` and the password are all strings no request may carry. Matching the stem also catches every output name, `qz7report-split.zip` and `qz7report-part-1.pdf`.
4. **Plants.** A request to the real `/_astro/fflate-<hash>.js` path with `?x=1` must be reported as data in the address, and only that. A POST with a body to the same path must be reported for its method and body. The general plants (a POST, a `sendBeacon`, an image address holding the name, a fetch from the worker) run once against the shared code; the fflate plants run on `/split-pdf`.
5. **Bookmark titles.** The test runs `rich.pdf` and checks that "Chapter one" is in no request and not in the console.

**The very-large-page-count file:**
- `tests/fixtures/make-many-pages.mjs` writes 120,000 pages that share one content stream, about 10 MB, to the system's temporary folder, refusing a path inside the repo, as `make-large.mjs` does.
- It is not committed.

### 8. Page weight, and what loads when

- **Before a pick:** the same as Merge PDF, 76.8 KB gzip plus the page's own HTML. `PageGrid`'s toggle and the batch button are in the workspace chunk, which loads after a pick.
- **After a pick:** the worker; qpdf and its WebAssembly, fetched when the file is read, as for Merge PDF; PDF.js and its data, for thumbnails; the Split engine, a small file.
- **On every run:** fflate, 4.4 KB.
- **`page-weight.mjs` and `check-worker.mjs`** name `split-pdf-<hash>.js`. `check-worker.mjs` already checks every engine is its own late file.

### 9. Dependencies

None added. qpdf, PDF.js and fflate are already shipped.

### 10. Threats

- **A malicious PDF:**
  - qpdf and PDF.js run in workers, as for Merge PDF;
  - a part that fails `qpdf --check` fails the job;
  - outline JSON from qpdf is parsed with `JSON.parse` and walked with a depth limit of 64 and a visited set, so a cyclic or very deep outline cannot hang the worker. Past the limit, the whole outline of that part is dropped and the job carries on.
- **A huge page count:** batches of 500 on the page, in place of the page-count cap `add-page-items-and-zip` asked for, since a cap would be a fixed limit `SPEC.md` rules out. In the worker, `parts` makes one entry per part. With no cuts on a 120,000-page file, that is 120,000 qpdf calls and a zip of 120,000 entries. It runs with progress and Cancel and never blocks the page, and a phone may run out of memory, which the failure message covers.
- **An oversized file:** the 100 MB warning; no limit.
- **A hostile file name:** names go only through the shared cleaning and the worker's stem check. Zip entries are the stem plus numbers. qpdf sees only made-up paths.
- **Document text in traces:** this is the first engine to read document text, the outline titles. Outline JSON and titles never go into a log, an error message or a failure sentence; a JSON or qpdf error on that step is caught and turned into the plain failure kind, with no text kept.
- **Hostile options:** `cuts` comes from the page, which could be tampered with. The engine refuses anything but sorted, unique whole numbers in range.

## Risks / Trade-offs

- **One qpdf call per part is slow for many parts of a large file.** 500 parts of a 100 MB file reads 50 GB in all. The 100 MB warning, progress and Cancel cover it. If the owner wants it faster, `--split-pages` could be used for files with no bookmarks and no attachments. That is a later change, measured first.
- **`--update-from-json` is not yet proven** for rewriting outline links in this build. Task 2.2 proves it first. If it cannot be made to work, building stops and the owner is asked. The choices would be: keep every bookmark in every part, or add a library that edits outlines.
- **Named destinations and go-to actions** that qpdf cannot resolve are dropped, never kept pointing nowhere. A part may then have fewer bookmarks than a person expects. The fixtures README records what each fixture gives.
