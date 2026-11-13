# Design

## Context

- **Built:** Split PDF (archived `2026-11-13-add-split-pdf`). It added:
  - a per-page toggle in `PageGrid`;
  - `itemToggle: { kind: 'cut-after', label }`;
  - `cuts.ts` for its words;
  - pages drawn in steps and shown in batches of 500;
  - an engine that keeps per-part bookmarks through a qpdf JSON update on a plain, decrypted copy without object streams.
- **Split PDF's review asked:**
  - for one module that says what each toggle kind means, made when a second kind arrives;
  - for `keptOutline` to move into `src/engines/outline.ts` when a second engine needs it.

  Extract pages is that second caller for both.
- **Owner decisions of 13 Nov 2026:**
  - page tools drop passwords and restrictions;
  - one-file results with fewer pages keep the bookmarks that still apply, and the attached files;
  - Extract starts with no pages chosen;
  - new files keep accessibility tags, named destinations and reading threads whole, and the page says so;
  - page tools warn above 20,000 pages.
- **Measured at stage 1:** qpdf copies its command-line arguments onto its small stack.
  - A page list of about 60 KB works; about 64 KB and above crashes, with "memory access out of bounds".
  - An argument file (`qpdf @/args`) worked with a 378 KB list.

## Goals / Non-Goals

**Goals:**
- Extract pages end to end, meeting "Definition of done".
- The toggle, outline and plain-copy code shared, with no change to Split PDF's behaviour.
- The 20,000-page notice for every page tool.

**Non-Goals:**
- Typed ranges; reordering; one file per page.
- Next steps in the result. No result on the site has them yet. This is a known gap against "Tool page anatomy" part 6, which comes in its own change.

## Decisions

### 1. Registry entry

```ts
{ id: 'extract-pdf-pages', group: 'organise', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['split-pdf', 'delete-pdf-pages', 'merge-pdf', 'rearrange-pdf-pages', 'rotate-pdf'],
  pages: [{ slug: 'extract-pdf-pages', name: 'Extract pages', summary: 'Copy chosen pages into a new PDF.',
           title: 'Extract pages from a PDF in your browser - PDFkaro',
           description: 'Copy the pages you choose from a PDF into a new file. The file stays on your device and is not uploaded.',
           heading: 'Extract pages from a PDF', sentence: 'Copy the pages you choose into a new PDF. Files stay on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file', multiple: false, minFiles: 1,
            items: 'pages', itemControls: false, itemToggle: { kind: 'take', label: 'Take' },
            outputs: 'one', outputSuffix: 'extracted', resultPages: 'none',
            actionLabel: 'Extract and download', writingLabel: 'Writing the new file',
            doneHeading: 'Your new file is ready', failedHeading: 'The extract did not finish.',
            resultNotes: ['The new file keeps the bookmarks that point to its pages, and the files attached to the document.',
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- **`ToggleKind`** (`'cut-after' | 'take'`) is a type in `registry.ts`. `toggles.ts` imports it, so its rules record covers every kind, and the registry stays data and types only.
- **The result's page count comes from the toggle kind.** `ToggleRules.resultPages?(pages, marks)` gives the count; for `take` it is the number of chosen pages. `useToolRun` uses it when present, otherwise `resultPages`. No `'chosen'` value is added to the registry.
- **`related`** links only to published tools, as now.

### 2. `src/widget/toggles.ts`

```ts
type ToggleRules = {
  skip(pages: number): number[];                          // pages with no toggle
  option(marks: number[]): Record<string, unknown>;       // what the engine is sent
  summary(pages: number, marks: number[]): string;        // the line above the pages
  announce(pages: number, marks: number[], page: number, marked: boolean): string;
  blocked(marks: number[]): string | null;                // tied to the main button when it cannot run, or null
  resultPages?(pages: number, marks: number[]): number;   // the one result's page count
  drawsCut: boolean;                                      // whether a pressed toggle draws Split's cut line
};
export const toggleRules: Record<ToggleKind, ToggleRules>;
export function toggledMarks(marks: number[], page: number): number[]; // shared by the reducer and the announcement
```

- **`cut-after`** wraps `cuts.ts`, with its words unchanged:
  - skip: the last page;
  - option: `{ cuts }`;
  - blocked: always null;
  - drawsCut: true.
- **`take`**:
  - skip: none;
  - option: `{ pages: marks }`;
  - drawsCut: false;
  - summary:
    - "No pages chosen. Press "Take" under each page you want."
    - "Pages 1, 3 and 7 chosen." (up to five pages named)
    - "12 pages chosen." (past five)
  - announce, which never repeats the list:
    - "Page 3 chosen, 4 in all."
    - "Page 3 no longer chosen, 3 in all."
    - "Page 3 no longer chosen. No pages chosen."
  - blocked: "Choose at least one page to take out." when no page is chosen, otherwise null;
  - resultPages: the number chosen.
- **Shared words.** Numbers have thousands separators everywhere. The `number` and `list` helpers move from `cuts.ts` into `format.ts`. `showMoreLabel` and `shownAnnouncement` are page-list words, not Split's, so they move there too.
- **`ToolWorkspace`, `useToolRun` and `PageGrid`** ask `toggleRules[kind]` and name no kind.
  - `PageGrid` takes a `drawsCut` flag on its `toggle` prop, and adds the `cut` class only when it is set.
  - A pressed `take` toggle shows by its 2px border and bold text alone.
- **The main button.**
  - `canRun(state, minFiles, blocked === null)` stays pure in `state.ts`.
  - The workspace ties `tooFew ? words.tooFewFiles : rules.blocked(marks)` with `aria-describedby`.
  - The blocked sentence shows only once the pages are shown and none is chosen: not while the file is getting ready, nor in the password or damaged states, where the main button is hidden.

### 3. `src/engines/outline.ts` and `src/engines/plain.ts`

**`outline.ts`** takes from `split-pdf.ts`:
- `OutlineItem`, `outlineDepthLimit`, `readOutline`;
- `Structure`, `outlineIsSafe`, `readStructure` (batches of 200);
- `updateJson`, `objects`, `json` and `carriesAttachment`.

It generalises the update:

```ts
keptOutline(outline, keep: (page: number) => boolean)
pageRange(first, last): (page) => boolean
outlineUpdate(structure, keep, { dropAttachments: boolean }): Map<string, Dict>
```

**`plain.ts`** holds the steps every page engine shares:

```ts
plainCopy(tools, file, password): Promise<{ plain: Uint8Array; pages: number }>
freshQpdf(tools, bytes): Promise<Qpdf>
passwordFrom(options): string | undefined
```

- `plainCopy` decrypts into a copy without object streams and counts its pages, each on its own instance.
- It returns only bytes, so the opener's WebAssembly memory (the input plus the copy) is let go before the job goes on.

**What Split's tests check:** the same cases and the same expected values. Only imports and call signatures change; stage 2 checks the expectations line by line.

### 4. The engine: `src/engines/tools/extract-pdf-pages.ts`

```ts
type Options = { passwords?: unknown; pages?: unknown };
export function chosenPages(pages: number, chosen: unknown): number[]; // sorted, unique, whole, in range, at least one
export function pageList(pages: number[]): string;                     // "1-3,7", runs joined as ranges
export const run: Engine<Options>; export const inspect = inspectPdf;
```

`run`:
1. `plainCopy`.
2. Check the choice with `chosenPages`.
3. `readStructure`.
4. Build the update with `keep = chosen.has`.
5. On a fresh instance, write the arguments one per line to `/args` and call `qpdf @/args`.
   - The arguments are `/in.pdf`, `--update-from-json=/u.json` when needed, `--pages`, `.`, the page list, `--` and `/out.pdf`.
   - The page list is built only from checked numbers. An argument file keeps any length off qpdf's stack.
6. Run `qpdf --check`.

**Progress, in what can honestly be told:**
- the line reads "Starting" until the first report;
- once the plain copy is made, the engine posts `{ stage: 'writing', percent: 0 }`, so the line reads "Writing the new file" and the bar moves to a fifth;
- after the check it posts `percent: 100`.
- Nothing claims a page count it has not reached.

Return `[output]`. Bookmark titles never go into an error.

### 5. The 20,000-page notice (all page tools)

- A shared `isManyPages(state)` sits beside `isLarge`, true when a page tool's file has more than 20,000 pages.
- The workspace then shows a notice: "This file has more than 20,000 pages. The job may take a long time." The job is not blocked.
- It is the owner's decision of 13 Nov 2026, and is added to `tool-page` as a requirement.

### 6. What the new file keeps, and the page text

**The new file keeps whole**, by the owner's decision of 13 Nov 2026:
- the document's title, author and other details;
- its accessibility tags;
- named destinations;
- reading threads.

These can carry text from pages that were not taken. qpdf drops the pages themselves, with their text, form fields and annotations.

**A test pins this.** A tagged fixture, `tagged.pdf`, made by `make.mjs`, has a page-2 tag with `/Alt` text. The unit test records that this text survives when only page 1 is taken, while page 2's content does not. A later engine change cannot then make the page untrue without a test failing.

**Page text:** `src/content/tools/extract-pdf-pages.md`, a draft for the owner. Its questions:
- Is my file uploaded? (Extract makes no zip.)
- How do I choose pages?
- What do I get?
- How is the new file named?
- What happens to bookmarks and attached files?
- What else comes over from the pages I left out: the details, the accessibility tags, link names and reading threads?
- Is my original file changed? (No.)
- Can I use a file with a password?
- Is there a limit on size? (The 100 MB and 20,000-page notices.)
- What if the file is damaged?

The text runs 250 to 500 words.

### 7. Tests

**Unit tests:**
- `chosenPages`;
- `pageList`;
- `toggleRules` for both kinds: words, skips, options, blocked, resultPages and drawsCut;
- `toggledMarks`;
- `isManyPages`;
- `outline.ts`, through the moved Split tests and a set of kept pages;
- `plainCopy`;
- `run` on every fixture:
  - `rich.pdf` page 2: keeps "Chapter two" and `note.txt`;
  - `password.pdf` with its password;
  - damaged files fail;
  - a 3,000-bookmark file;
  - a page list over 64 KB, from repeated pages of `pages-500.pdf`;
  - `tagged.pdf`.

**The generated files:**
- The file over 100 MB from `make-large.mjs` is run by hand, and its outcome recorded in the fixtures README.
- The Hindi, Telugu, Arabic and Chinese file is still missing (`CLAUDE.md`), so that line of "Definition of done" stays not checked.

**End-to-end, at 360px and 1280px:**
- choosing pages by mouse and keyboard;
- the unavailable button and its tied sentence, only once the pages are shown;
- extracting, and checking the pages of the result;
- the password, damaged, not-a-PDF and two-file drop states;
- Cancel keeps the choices;
- engine-load failure;
- the skip link;
- no cut line on a chosen page;
- Split's cut line still drawn.

**No-upload test:**
- the exact allowlist, with `extract-pdf-pages-<hash>.js` and `outline-<hash>.js`, and no `fflate`;
- positive checks that the Extract engine was fetched, and that `fflate`, `split-pdf` and `merge-pdf` were not;
- `qz7report.pdf`, its stem and the password as secrets;
- `rich.pdf` page 2 taken, with "Chapter one", "Chapter two" and `note.txt` as secrets for requests and the console;
- storage and traces.

**Screenshots and contrast:**
- the states at 360px and 1280px, light and dark;
- a pressed and an unpressed toggle side by side, which must be told apart at a glance in all four;
- the pressed border at least 3 to 1. If they cannot be told apart, the toggle becomes a native checkbox labelled "Take", decided before stage 2.

### 8. Page weight and loading

- **Before a pick:** as for Split, about 77.5 KB gzip.
- **After a pick:** the Extract engine. The build is expected to split the shared `outline.ts` and `plain.ts` into files of their own, such as `outline-<hash>.js`.
  - `page-weight.mjs` names each new chunk in `loadedLater`, with a reason.
  - `check-worker.mjs` asserts they are not inside the worker file.
  - Split's no-upload allowlist gains them. That is the one allowed change to Split's tests beyond the outline call signatures.
- No dependency is added.

### 9. Threats

- **A malicious PDF:**
  - qpdf runs in the worker;
  - outline JSON is walked with the depth limit, the visited set and the outline-item shape rules;
  - reads come in batches;
  - the result must pass `qpdf --check`.
- **Hostile options:** `pages` must be sorted, unique whole numbers in range, with at least one. The page list holds only digits, commas and hyphens, and goes through an argument file, so no length can overflow qpdf's stack.
- **A huge page count:**
  - pages are shown in batches of 500;
  - the 20,000-page notice;
  - very large files select slowly, as recorded for Split.
- **A hostile file name:** handled by the shared cleaning. qpdf sees only made-up paths.
- **Text from pages not taken:** it stays in the document's tags and details, by the owner's decision, and the page says so.

## Risks / Trade-offs

- **The shared moves touch Split PDF.** Its unit, end-to-end and no-upload tests must pass, with the same cases and expectations.
- **A main button that cannot run untouched** is a first for the site, by the owner's decision of 13 Nov 2026. The tied sentence says what to do.
- **Choosing many pages means many taps** on a phone, for example 200 of 500. Typed ranges are out of scope. The pull request names this as a known limit.
