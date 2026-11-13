# Proposal

## Why

Phase 1 starts with Split PDF, the next tool in catalogue order. Split works on the pages of one file and gives back several files. Neither is possible with the shared parts built so far:
- **`PageGrid` lists files.** Each item is a file, with a thumbnail of its first page.
- **`Result` hands back one file.**

`SPEC.md` asks for both:
- **"Tool page anatomy" part 4:** page thumbnails in the working area.
- **"Details that apply everywhere":** "Several outputs download as one zip".

The rule in "Build phases" says a tool that needs a new shared component adds it in its own pull request first, so these come before Split PDF. Extract pages, Delete pages, Reorder pages and Rotate PDF will use the same parts.

## What Changes

- **A tool can list the pages of one file.**
  - A tool says in its registry entry that it works on pages.
  - Once its one file has been read, the list shows one item per page, "Page 1", "Page 2" and so on, each with a thumbnail of that page.
  - Thumbnails are drawn as items come into view, one at a time, as now.
  - Whether an item has Move up, Move down and Remove buttons is the tool's choice. Split PDF's own control, marking where to cut, comes with Split PDF.
- **One document stays open across pages.** The tool worker keeps the last PDF.js document it opened, keyed by an id the page makes up (never the file name). So drawing page 40 does not read the whole file again. It is closed when another file is asked for, when a job or a read starts, when its file is removed, and when the worker ends.
- **Several results become one zip, made in the worker.**
  - When an engine returns more than one file, the worker zips them with `fflate` before handing them back. The page's own thread never handles the files.
  - The zip is named from the input with the tool's suffix, for example `report-split.zip`.
  - The files inside are numbered from the input, for example `report-part-1.pdf`.
  - `Result` shows the zip's name, size and how many files it holds.

### Scope

- **No tool is built.** Nothing on the site changes until Split PDF uses these parts.
- **Out of scope:**
  - split points, ranges and any other control of a particular tool;
  - reordering pages, which belongs to Reorder pages;
  - a viewer for large pages.

### A gap against "Tool page anatomy" part 6

Part 6 gives every result "a short list of next steps that carry the file into another tool". A zip shows none, because no tool in the catalogue opens a zip. This is a known gap against part 6, not a rule: the spec delta says nothing about next steps for a zip, and the question goes to the owner in this change's pull request.

### `SPEC.md` sections

- "Tool page anatomy", parts 4 and 6. Part 6 gives the result as "file name, new size"; for a zip, the result also shows how many files it holds, which refines it.
- "Details that apply everywhere": several outputs as one zip; output names; thumbnails as they scroll into view; a 500-page file must not freeze the page.
- "Architecture and tech stack": "Rules for the code" 2 to 4.

**Phase and catalogue:** Phase 1, ahead of Split PDF, second in the catalogue. No new tool.

## Where files are processed, and new requests

Everything is in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password.

The one new request is `fflate`'s script, from the site itself. The worker fetches it at the start of every run of a tool that can give several files, before the number of files is known. That way the request tells the site only which tool was used, as the engine's own request already does, and never how many pages or parts a file had. Split PDF's no-upload test will name it.

## Open decisions and owner questions touched

- **Zip library:** `fflate`, chosen by the owner on 12 Nov 2026 over a zip written in our own code. It is MIT, 4.4 KB gzip as built, and its last release was July 2026.
- **Split modes:** the owner chose split points on 12 Nov 2026. That is built with Split PDF, not here.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`:
  - adds lists of pages, with one thumbnail per page;
  - adds that several results come back as one zip made off the page's thread, with how the zip and its files are named and what the result block shows;
  - the existing "Output names" requirement gains the naming of files inside a zip.

## Impact

- **Changed code:**
  - `src/tools/registry.ts`: `ToolWidgetWords` gains `items: 'files' | 'pages'`, item controls, and the suffix for files inside a zip.
  - `src/widget/state.ts` and `src/widget/thumbnails.ts`: items for pages.
  - `src/hooks/useToolRun.ts`: a thumbnail asks for a page of a file.
  - `PageGrid`: controls are optional.
  - `ToolWorkspace`: the result block's detail shows how many files a zip holds; `Result` itself is unchanged.
  - `src/engines/thumbnail.ts`: opening a document, separate from drawing a page.
  - `src/workers/worker-core.ts`: zipping several outputs, and the open document.
  - `messages.ts`: the thumbnail request gains a document key.
- **New code:**
  - `src/widget/format.ts` gains names for files inside a zip.
  - A small zip step loaded late in the worker.
- **Dependency:** `fflate`, pinned exactly, shipped after a pick only when a job gives several files.
- **Merge PDF is unchanged.** It lists files and gives one file.
