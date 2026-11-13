# Design

## Context

- **Built:** Split PDF (archived `2026-11-13-add-split-pdf`). It added:
  - a per-page toggle in `PageGrid`;
  - `itemToggle: { kind: 'cut-after', label }` in the registry;
  - `cuts.ts` for its words;
  - pages drawn in steps and shown in batches of 500;
  - an engine that keeps per-part bookmarks through a qpdf JSON update on a plain, decrypted copy without object streams.
- **Split PDF's review asked:**
  - for one module that says what each toggle kind means, made when a second kind arrives;
  - for `keptOutline` to move into `src/engines/outline.ts` when a second engine needs it.

  Extract pages is that second caller for both.
- **Owner decisions of 13 Nov 2026:** page tools drop passwords and restrictions. One-file results with fewer pages keep the bookmarks that still apply, and keep attached files.

## Goals / Non-Goals

**Goals:**
- Extract pages end to end, meeting "Definition of done".
- The toggle and outline code shared, with no change to Split PDF's behaviour.

**Non-Goals:**
- Typed ranges; reordering; one file per page.

## Decisions

### 1. Registry entry

```ts
{ id: 'extract-pdf-pages', group: 'organise', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['split-pdf', 'delete-pdf-pages', 'merge-pdf', 'rearrange-pdf-pages', 'rotate-pdf'],
  pages: [{ slug: 'extract-pdf-pages', name: 'Extract pages', summary: 'Take chosen pages out into a new PDF.',
           heading: 'Extract pages from a PDF', sentence: 'Take the pages you choose into a new PDF. Files stay on your device.', ... }],
  widget: { pickerLabel: 'Choose a PDF file', multiple: false, minFiles: 1, items: 'pages', itemControls: false,
            itemToggle: { kind: 'take', label: 'Take' }, outputs: 'one', outputSuffix: 'extracted',
            resultPages: 'chosen', actionLabel: 'Extract and download', ... } }
```

- **`resultPages` gains `'chosen'`:** the result's page count is the number of pages chosen, which the page already knows from the toggle state. Neither `'sum'` nor `'input'` is right for Extract, and no worker change is needed.
- **`related`** links only to published tools, as now.

### 2. `src/widget/toggles.ts`

```ts
type ToggleRules = {
  skip(pages: number): number[];                     // pages with no toggle
  option(marks: number[]): Record<string, unknown>;  // what the engine is sent
  summary(pages: number, marks: number[]): string;   // the line above the pages
  announce(pages: number, marks: number[], page: number, marked: boolean): string;
  ready(marks: number[]): boolean;                   // whether the main button can run
  blocked?: string;                                  // tied to the main button when not ready
};
export const toggleRules: Record<ToggleKind, ToggleRules>;
```

- **`cut-after`** wraps `cuts.ts`, unchanged:
  - skip: the last page;
  - option: `{ cuts }`;
  - ready: always.
- **`take`**:
  - skip: none;
  - option: `{ pages: marks }`;
  - summary: "No pages chosen yet. Choose the pages to take out." / "Pages 1, 3 and 7 chosen. You will get one file of 3 pages." Up to five pages are named, then a count. Numbers have thousands separators;
  - announce: "Page 3 chosen. You will get one file of 1 page." / "Page 3 no longer chosen. …";
  - ready: at least one page;
  - blocked: "Choose at least one page to take out."
- **`ToolWorkspace` and `useToolRun`** ask `toggleRules[words.itemToggle.kind]` and name no kind themselves.
- **`canRun`** in `state.ts` gains the toggle's `ready`. The main button's unavailable state and its tied message reuse the existing `tooFew` path.
- **The toggle step** that `reducer` uses and that the announcement needs becomes one exported pure function, `toggledMarks(marks, page)`.

### 3. `src/engines/outline.ts`

`src/engines/outline.ts` takes from `split-pdf.ts`:
- `OutlineItem`, `outlineDepthLimit`, `readOutline`;
- `Structure`, `outlineIsSafe`, `readStructure` (batches of 200);
- `updateJson`, `objects`, `json` and `carriesAttachment`.

It generalises the update to:

```ts
keptOutline(outline, keep: (page: number) => boolean)
outlineUpdate(structure, keep, { dropAttachments: boolean }): Map<string, Dict>
```

- Split PDF calls these with `page >= first && page <= last`, and `dropAttachments: !isFirst`. Its existing unit tests must pass unchanged, apart from imports.
- Extract calls them with `chosen.has(page)` and `dropAttachments: false`.

### 4. The engine: `src/engines/tools/extract-pdf-pages.ts`

```ts
type Options = { passwords?: unknown; pages?: unknown };
export function chosenPages(pages: number, chosen: unknown): number[]; // sorted, unique, whole, in range, at least one
export const run: Engine<Options>; export const inspect = inspectPdf;
```

`run`:
1. Make the plain copy, as Split does, with `--decrypt` and `--object-streams=disable`.
2. Count the pages and check the choice.
3. `readStructure`.
4. Build the update with `keep = chosen.has`.
5. On a fresh instance, write `/in.pdf [--update-from-json] --pages . 1,3,7 -- /out.pdf`. The page list is built from checked numbers only, and runs of pages are joined as ranges (`1-3,7`) to keep the argument short.
6. Run `qpdf --check`.
7. Report progress: `{ stage: 'working', unit: 'page', done, total }` before writing, then `writing` 100.

Return `[output]`. Bookmark titles never go into an error.

### 5. Page text, tests

**Page text:** `src/content/tools/extract-pdf-pages.md`, a draft for the owner. It covers:
- how to choose pages;
- what you get;
- naming;
- bookmarks and attachments;
- passwords;
- size;
- damaged files.

**Unit tests:**
- `chosenPages`;
- `toggleRules` for both kinds;
- `outline.ts`, through the moved Split tests and a set of kept pages;
- `run` on every fixture, including `rich.pdf` pages 2, `password.pdf`, damaged files and 3,000 bookmarks.

**End-to-end, at 360px and 1280px:**
- choose pages by mouse and keyboard;
- the unavailable main button and its tied sentence;
- extract and check pages;
- the password, damaged, not-a-PDF and two-file drop states;
- Cancel keeps the choices;
- engine-load failure;
- the skip link.

**No-upload test:** the exact allowlist with `extract-pdf-pages-<hash>.js` and no `fflate`, the `qz7report.pdf` name, stem and password as secrets, and storage and traces.

**Screenshots and contrast:** as for Split.

### 6. Page weight and loading

- **Before a pick:** as for Split, about 77.5 KB gzip.
- **After a pick:** the Extract engine, plus qpdf, PDF.js and the shared `inspect` file, which already exist.
- **`page-weight.mjs`** names `extract-pdf-pages`; `check-worker.mjs` finds it.
- No dependency is added.

### 7. Threats

- **A malicious PDF:** as for Split. qpdf runs in the worker; outline JSON is walked with the depth limit, the visited set and the outline-item shape rules; reads come in batches; the result must pass `qpdf --check`.
- **Hostile options:** `pages` must be sorted, unique whole numbers in range, with at least one. The page list argument is built only from them.
- **A huge page count:** pages are shown in batches of 500. Very large files select slowly, as recorded for Split.
- **A hostile file name:** handled by the shared cleaning. qpdf sees only made-up paths.

## Risks / Trade-offs

- **The shared moves touch Split PDF.** Its unit, end-to-end and no-upload tests must pass unchanged. The moves are code only.
- **A main button that cannot run untouched** is a first for the site. It follows Merge PDF's too-few-files pattern, and the tied sentence says what to do.
