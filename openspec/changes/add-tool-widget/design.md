# Design

## Context

The skeleton gave a static `ToolShell`, the registry and the checks. A trial built a module worker under Astro that loaded qpdf's WebAssembly from the site's own `_astro/` folder, under the `/pdfkaro` sub-path too, and merged two files in Chromium with nothing requested before the pick. Reviews asked for the shared parts to stand alone, to stay neutral about any one tool, and for focus, drag, progress, memory and wording to be fixed before code.

## Goals / Non-Goals

**Goals:** shared parts built once, in a shape the other 53 tools use without change; keyboard and screen reader use designed in; files and passwords held as briefly as possible.

**Non-Goals:** any engine or PDF library; mounting the widget on a page; thumbnails; handover.

## Decisions

### 1. Engines: the contract

```ts
// src/engines/types.ts
type Progress =
  | { stage: 'reading' | 'working'; unit: 'file' | 'page'; done: number; total: number }
  | { stage: 'writing'; percent: number };
type EngineTools = Record<string, () => Promise<unknown>>;   // each tool's engine change adds what it needs
type Engine<Options> = (files: Uint8Array[], options: Options,
  onProgress: (p: Progress) => void, tools: EngineTools) => Promise<Uint8Array[]>;
```

Engines never fetch and never touch the DOM. The worker builds `tools`; a Node test builds the same from files on disk. No library is named here: `add-merge-pdf` adds qpdf to `EngineTools` together with its wrapper.

### 2. Worker plumbing

- `src/workers/messages.ts`: to the worker, `inspect` (one file as a `Blob`, an optional password) and `run` (tool id, files as `Blob`s, options); from it, `inspected`, `progress`, `done` (the results, transferred), `failed`. Each carries a request id. `failed` carries a kind, `engine-load`, `engine` or `memory`, never a stack trace. The worker ignores any message that does not match.
- `src/workers/tool.worker.ts`: the one worker for every tool. It finds a tool's engine with `import.meta.glob('../engines/tools/*.ts')`, lazy (not eager), keyed by tool id.
- **Workers are built as ES modules** (`vite.worker.format: 'es'` in `astro.config.mjs`), so each engine stays its own file and a visitor fetches only the engine of the tool in use. A build check fails if an engine's code lands in the worker file.
- **A unit test checks that every registry tool has exactly one engine file and every engine file has a registry tool,** so the file name is not a second place a tool is declared.
- `src/workers/client.ts`: the page's side. The page keeps each file as the browser's own `File`, which costs no copy, and posts the `File`s; the worker reads them, writes them into the engine, and drops its own copies. Only results come back, transferred.
- **The worker is ended after every job, on Cancel, on "Start again" and on `pagehide`,** because WebAssembly memory never shrinks and a finished job's files should not stay in memory. The next action starts a fresh worker; only the engine and WebAssembly files come from the browser cache.
- The worker sends what an engine prints only into the engine's own capture, never to the console.

### 3. Widget logic

`src/widget/state.ts` is one reducer. It holds what the screen shows: each file's id, name, size, page count and status (`reading`, `ready`, `needs-password`, `wrong-password`, `damaged`), the step (`empty`, `listing`, `working`, `done`, `failed`), progress, the result, a failure kind. It holds no bytes and no passwords. `useToolRun` keeps the `File`s and any typed passwords in a map, in memory, and on "Start again" and `pagehide` clears the map, ends the worker, resets the file input and releases the download URL.

`src/widget/format.ts` holds only what every tool shares: "1 page" and "64 pages", "6.1 MB", the progress line ("Reading file 2 of 3", "Page 14 of 120", "Writing the result, 40%"), and `outputName(input, suffix)`, which strips path parts, control characters and bidirectional marks (U+202A to U+202E, U+2066 to U+2069) and caps the length. A tool's own words, such as "Merge the other 2 files", come from the registry.

**The accepted-type check** comes from the registry's `accepts` list. For PDFs it looks for `%PDF-` within the first 1024 bytes, as readers allow, before any engine loads.

The progress bar is one fraction that never goes back.

### 4. Components

| Component | Loads | Notes |
| --- | --- | --- |
| `ToolWidget` | With the page | The island. Renders `FilePicker`; after a pick, loads `ToolWorkspace` with `React.lazy` |
| `FilePicker` | With the page | A real file input inside a label styled as the main button. The label shows the focus outline when the input has focus. Files chosen before the script loads are read when it does |
| `ToolWorkspace` | After a pick | Owns the worker client and the reducer; lays out the steps below |
| `PageGrid` | After a pick | Items with Move up, Move down, Remove, each naming its item; a button that cannot be used is `aria-disabled` and stays focusable. Mouse drag uses the browser's own drag and drop; touch reordering uses the buttons, and rows never capture touch scrolling. No lift, no animation |
| `Result` | After a pick | Heading, name, size and pages, a Download link styled as the main button, Start again |
| `ProgressBar`, `Notice`, `PasswordField` | After a pick | Small parts used by the workspace |

**Problems are shown one at a time, in list order.** While a file needs a password, the main button is hidden and "Open the file" is the one filled button. While fewer files are listed than the tool needs, the main button is `aria-disabled` and the tool's sentence ("Add at least one more file to merge.") is tied to it with `aria-describedby`.

**The 100 MB warning** is a status message, not an alert.

**Download** is a link to an object URL of a `Blob` typed `application/pdf`, with the `download` attribute.

### 5. Focus and announcements

| When | Focus goes to | Heard |
| --- | --- | --- |
| The first file is picked | The summary line above the list | "Getting ready" via the status region |
| A file is not of an accepted type | Stays where it is | "notes.txt is not a PDF, so it was not added." via the status region |
| A file is damaged | Stays where it is | "appendix.pdf is damaged and cannot be read." via the status region; the notice stays on the page |
| A file needs a password | The password field, only if focus is still on the summary line; otherwise it stays | The field's label and note, or "appendix.pdf needs a password." via the status region |
| The password is wrong | The password field, whose description now holds the error | The error, once, through the description |
| The password is right | The main button | Nothing more |
| "Leave this file out" or a damaged file is left out | The summary line | Nothing more |
| A file is moved | The same button on the moved file | "appendix.pdf moved to place 2 of 3." via the status region |
| A file is removed | The next file's Remove, else the previous, else the picker | Nothing more |
| The main button is pressed | Cancel | Progress via the status region, at most once a second |
| Cancel is pressed | The main button | Nothing more |
| The job finishes | The result's heading | The heading, once |
| The job fails | The failure's heading | The heading, once |
| "Go back to your files" | The main button | Nothing more |
| "Start again" | The picker | Nothing more |

### 6. Words

Shared: not an accepted type, "notes.txt is not a PDF, so it was not added."; damaged, "appendix.pdf is damaged and cannot be read."; the failure heading comes from the tool ("The merge did not finish."), followed by one of: "Your browser ran out of memory. Try fewer or smaller files." / "The tool could not be loaded. Check your connection and try again." / "Something went wrong. Try again." A failure sentence never names a page.

## Risks / Trade-offs

- **The widget is not on any page until `add-merge-pdf`.** Its end-to-end tests land there. This change is tested in Node only.
- **Ending the worker after every job** costs a worker start on the next job; the engine comes from the cache.
- **The damaged state links to Repair PDF only once it is published,** which differs from `SPEC.md`; see the proposal.
