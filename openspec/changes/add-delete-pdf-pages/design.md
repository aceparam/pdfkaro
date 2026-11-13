# Design

## Context

Extract pages (PR #9) built everything a one-file page tool needs:
- the plain decrypted copy (`src/engines/plain.ts`);
- the outline and attachment update (`src/engines/outline.ts`);
- toggle kinds (`src/widget/toggles.ts`);
- the 20,000-page notice.

Delete pages is Extract with the marks turned round: the visitor marks the pages to lose, and the engine keeps the rest. The work is a new toggle kind, a thin engine, and moving Extract's write steps where both can call them.

## Goals and non-goals

**Goals**
- Delete pages end to end, meeting the same requirements as Extract pages, with the owner's decisions of 13 Nov 2026.
- One shared write path for both tools, so a fix to one is a fix to both.

**Non-goals**
- Typed page ranges, next steps after the result, a cap on bookmarks read. Each needs its own change.

## Decisions

### The registry entry

```ts
{ id: 'delete-pdf-pages', group: 'organise', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['extract-pdf-pages', 'split-pdf', 'rearrange-pdf-pages', 'rotate-pdf', 'merge-pdf'],
  pages: [{ slug: 'delete-pdf-pages', name: 'Delete pages', summary: 'Remove chosen pages from a PDF.',
            title: 'Delete pages from a PDF in your browser - PDFkaro',
            description: 'Remove the pages you choose from a PDF. The file stays on your device and is not uploaded.',
            heading: 'Delete pages from a PDF',
            sentence: 'Remove the pages you choose from a PDF. Files stay on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file', multiple: false, minFiles: 1,
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            tooFewFiles: 'Choose a PDF file to delete pages from.',
            items: 'pages', itemControls: false, itemToggle: { kind: 'drop', label: 'Delete' },
            outputs: 'one', outputSuffix: 'pages-deleted', resultPages: 'none',
            actionLabel: 'Delete and download', writingLabel: 'Writing the new file',
            doneHeading: 'Your new file is ready', failedHeading: 'The new file was not made.',
            resultNotes: ['The new file keeps the bookmarks that point to its pages, and the files attached to the document.',
                          "It also keeps the document's details, accessibility tags, link names and reading threads whole, which can describe or name the pages you deleted.",
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- **The output name** is `report-pages-deleted.pdf`. `report-deleted.pdf` would read as if the file itself were deleted.
- **`resultPages: 'none'`**, as for Extract: the count comes from the toggle kind.

### The toggle kind `drop`

`ToggleKind` becomes `'cut-after' | 'take' | 'drop'`. In `toggles.ts`:

- **skip:** none. Every page has a "Delete" button, named "Delete page N".
- **option:** `{ pages: marks }`, the pages to delete.
- **summary(pages, marks):**
  - none: "No pages marked. Press “Delete” under each page you want to delete."
  - one: "Page 3 will be deleted. 11 pages will be left."
  - up to five: "Pages 1, 3 and 7 will be deleted. 9 pages will be left."
  - more: "12 pages will be deleted. 88 pages will be left."
  - "1 page will be left." when one is left, and "No pages will be left." when none is.
- **announce:** "Page 3 marked to delete, 4 in all." / "Page 3 no longer marked, 3 in all." / "Page 3 no longer marked. No pages marked." When the mark leaves no page unmarked, it says so, because the main button has just become unavailable: "Page 3 marked to delete. Every page is marked, so no pages will be left."
- **blocked(pages, marks):**
  - no marks: "Mark at least one page to delete.";
  - every page marked: "A PDF needs at least one page. Leave one or more pages unmarked.";
  - otherwise null.
- **resultPages:** `pages - marks.length`.
- **drawsCut:** false.

`blocked` gains the page count as its first argument, in the same order as `summary`, `announce` and `resultPages`; `take` and `cut-after` ignore it. `ToolWorkspace` passes the file's page count, which it already holds; it still asks only once pages are shown.

A marked page looks like a pressed "Take" button (2px edge, bold), with no other mark on the thumbnail. A dimmed or crossed-out thumbnail was considered and left out as the busier option; the summary line says what will be deleted.

### The engine

`src/engines/tools/delete-pdf-pages.ts`:

```ts
export function pagesLeft(pages: number, marked: unknown): number[]   // checks with chosenPages, refuses all pages, gives the rest in order
export const run: Engine<Options> = async (files, options, onProgress, tools) => {
  const { plain, pages } = await plainCopy(tools, file, passwordFrom(options));
  const keep = pagesLeft(pages, options.pages);
  onProgress({ stage: 'writing', percent: 0 });
  const output = await keepPages(tools, plain, keep);
  onProgress({ stage: 'writing', percent: 100 });
  return [output];
};
export const inspect = inspectPdf;
```

- **`chosenPages`** moves from the Extract engine into `plain.ts` with `pageList` and `callWithArgumentFile`, so both engines check the page list the same way: sorted, unique, whole, in range, at least one.
- **`pagesLeft`** refuses a list that marks every page with "Every page was marked; a PDF needs at least one page." The page never sends one, because the main button is unavailable, but the engine does not trust the page.
- **`keepPages(tools, plain, keep)`** in `plain.ts` holds the steps Extract wrote inline:
  1. `readStructure` on fresh instances;
  2. `outlineUpdate(structure, page => kept.has(page), { dropAttachments: false })`, with `kept = new Set(keep)` built once, because Delete can keep 119,999 pages and the check runs once per bookmark;
  3. one write through the argument file, with the update if any and `pageList(keep)`;
  4. `qpdf --check`.

  The tests of the moved functions (`chosenPages`, `pageList`, the 64 KB argument-file case) move from `extract-pdf-pages.test.ts` to a new `tests/unit/plain.test.ts`, with the same cases and expectations. `chosenPages`'s first refusal becomes "No pages were given.", which fits both tools; engine errors are never shown to visitors.
- The comment at the top of `plain.ts` says it holds the shared first and last steps of a one-file page engine. `check-worker.mjs` scans the sentences of `plain.ts` and `outline.ts` as well as `src/engines/tools/*.ts`, so the shared steps are checked by their own words, not two fixed strings. If the bundler renames the shared chunk, `page-weight.mjs` gets the exact new name; its pattern is not widened.

  Extract's `run` becomes `plainCopy`, `chosenPages`, progress 0, `keepPages`, progress 100. Its tests keep their cases and expectations; only imports change.
- `plain.ts` then imports `outline.ts`. The bundler already puts both in one chunk (`plain-*.js`, PR #9), which Merge does not load. `check-worker.mjs` keeps checking that the shared steps are not in the worker file.

### Long page lists

A file of 120,000 pages with one page marked keeps 119,999 pages. `pageList` writes runs as ranges, so that list is "1-41,43-120000", short. The worst case is every other page marked: 60,000 single pages, about 400 KB, which the argument file carries without overflowing qpdf's stack. qpdf is slow on it, though: at stage 1 the security reviewer ran that case on the 120,000-page file in Node and qpdf had not finished after more than 10 minutes. It runs in the worker, so the page stays responsive and Cancel ends it, and the 20,000-page notice already warns that the job may take a long time. This change does not claim the case is quick; it records it in the fixtures README.

`pagesLeft` walks the sorted marks alongside the page numbers once, so it costs one pass over the pages, never pages times marks.

### Tests

- **Unit:**
  - `drop`'s words, skips, option, blocked (none, some, all) and resultPages;
  - `pagesLeft`;
  - `run` on every file in `tests/fixtures/`, with:
    - page order and absent pages checked through the uncompressed result, as for Extract;
    - `rich.pdf` page 1 deleted keeping "Chapter two", `note.txt` and no dead bookmark;
    - `tagged.pdf` page 2 deleted keeping its tag text but not its content;
    - `mixed.pdf` shapes;
    - a nested outline;
    - a refusal of every page.
- **E2e:**
  - marking by mouse and keyboard;
  - the unavailable button with each sentence;
  - deleting and checking the pages left;
  - password, damaged, not a PDF, two files dropped;
  - Cancel keeps the marks;
  - engine-load failure;
  - skip link;
  - the 20,000-page notice;
  - no-upload with an exact allowlist (no `fflate`, Split, Merge or Extract file), and the `rich.pdf` and `tagged.pdf` strings.
- **The 100 ms rule:** the 120,000-page e2e test also watches for long tasks on Delete's own page while marking, which Extract left to Split's tests.

## Risks and trade-offs

- **Moving Extract's write steps** could change Extract. Mitigation: Extract's unit and e2e tests stay as they are and must pass.
- **"Delete" as a toggle label** could be read as a button that deletes at once. Mitigation: the summary says "will be deleted", nothing happens until the main button, and the result is a new file; the original is not changed. The UX reviewer checks the words.
- **The agent's start with nothing marked and the refusal of every page** are named in the pull request as the agent's reading.
