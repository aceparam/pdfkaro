# Design

## Context

The skeleton gave a static `ToolShell`, the registry and the checks. A trial built a module worker under Astro that loaded qpdf's WebAssembly from the site's own `_astro/` folder, under the `/pdfkaro` sub-path too, and merged two files in Chromium with nothing requested before the pick. Reviews of the first proposal asked for the shared parts to stand alone and for focus, drag, progress and wording to be fixed before code.

## Goals / Non-Goals

**Goals:** shared parts built once, in a shape the other 53 tools use without change; keyboard and screen reader use designed in, not added after.

**Non-Goals:** any engine; mounting the widget on a page; thumbnails; handover.

## Decisions

### 1. Engines: the contract

```ts
// src/engines/types.ts
type Progress = { stage: 'reading'; done: number; total: number } | { stage: 'writing'; percent: number };
type EngineTools = { qpdf(): Promise<Qpdf> };     // more libraries join here as tools need them
type Engine<Options> = (files: Uint8Array[], options: Options,
  onProgress: (p: Progress) => void, tools: EngineTools) => Promise<Uint8Array[]>;
```

Engines never fetch and never touch the DOM: the worker builds `tools` (qpdf from the address of its WebAssembly file), and a Node test builds it from the file on disk. `src/engines/qpdf.ts` wraps the WebAssembly build: write a file, run, read, remove, and capture what qpdf prints.

### 2. Worker plumbing

- `src/workers/messages.ts`: to the worker, `inspect` (one file, an optional password) and `run` (tool id, files, options); from it, `inspected`, `progress`, `done`, `failed`. Each carries a request id. `failed` carries a kind: `engine-load`, `engine`, `memory`, never a stack trace. The worker ignores any message that does not match.
- `src/workers/tool.worker.ts`: the one worker for every tool. It finds a tool's engine with `import.meta.glob('../engines/tools/*.ts')`, keyed by tool id, so a new tool adds a file and no line here.
- `src/workers/client.ts`: the page's side. Starts the worker on first use, turns messages into promises, passes progress on, and transfers bytes rather than copying them.
- **Cancel ends the worker.** A WebAssembly call cannot be interrupted. The next action starts a fresh worker; its files come from the browser cache.
- The page's side checks the first bytes of each file for `%PDF-` before anything loads, so a file that is not a PDF is refused at once and never reaches an engine.

### 3. Widget logic

`src/widget/state.ts` is one reducer. It holds what the screen shows: each file's id, name, size, page count and status (`reading`, `ready`, `needs-password`, `wrong-password`, `damaged`), the step (`empty`, `listing`, `working`, `done`, `failed`), progress, the result, a failure kind. It holds no bytes and no passwords; those stay in a map inside `useToolRun`, in memory, dropped on "Start again" and when the page is left.

`src/widget/format.ts`: "1 page", "64 pages", "6.1 MB", "Merge the other file", "Merge the other 2 files", and `outputName(input, suffix)`, which strips path parts and control characters and caps the length.

Progress shows "Reading file 2 of 3", then "Writing the merged file, 40%". The bar is one fraction that never goes back: reading fills the first fifth, writing the rest.

### 4. Components

| Component | Loads | Notes |
| --- | --- | --- |
| `ToolWidget` | With the page | The island. Renders `FilePicker`; after a pick, loads `ToolWorkspace` with `React.lazy` |
| `FilePicker` | With the page | A real file input inside a label styled as the main button. The label shows the focus outline when the input has focus. Files chosen before the script loads are read when it does |
| `ToolWorkspace` | After a pick | Owns the worker client and the reducer; lays out the steps below |
| `PageGrid` | After a pick | Items with Move up, Move down, Remove, each naming its item; a button that cannot be used is `aria-disabled` and stays focusable. Mouse drag uses the browser's own drag and drop; touch reordering uses the buttons, and rows never capture touch scrolling. No lift, no animation |
| `Result` | After a pick | Heading, name, size and pages, a Download link styled as the main button, Start again |
| `ProgressBar`, `Notice`, `PasswordField` | After a pick | Small parts used by the workspace |

Components take what they show through props; the words for each tool come from the registry through `[slug].astro`.

**Problems are shown one at a time, in list order.** While a file needs a password, the main button is hidden and "Open the file" is the one filled button. While one file is listed, the main button is `aria-disabled` and "Add at least one more file to merge." is tied to it with `aria-describedby`.

**The 100 MB warning** is a status message, not an alert.

**Download** is a link to an object URL with the `download` attribute. The URL is released on "Start again" and when the page is left.

### 5. Focus and announcements

| When | Focus goes to | Heard |
| --- | --- | --- |
| The first file is picked | The summary line above the list | "Getting ready" via the status region |
| The main button is pressed | Cancel | Progress via the status region, at most once a second |
| Cancel is pressed | The main button | Nothing more |
| A file is moved | The same button on the moved file | "appendix.pdf moved to place 2 of 3." via the status region |
| A file is removed | The next file's Remove, else the previous, else the picker | Nothing more |
| A file needs a password | The password field | Its label and note |
| The password is wrong | The password field, whose description now holds the error | The error, once, through the description |
| The password is right | The main button | Nothing more |
| "Leave this file out" | The summary line | Nothing more |
| A damaged file is left out | The summary line | Nothing more |
| The job finishes | The result's heading | The heading, once |
| The job fails | The failure's heading | The heading, once |
| "Go back to your files" | The main button | Nothing more |
| "Start again" | The picker | Nothing more |

### 6. Words

Not a PDF: "notes.txt is not a PDF, so it was not added." Damaged: "appendix.pdf is damaged and cannot be read." Failed: "The merge did not finish." with one of "Your browser ran out of memory. Try fewer or smaller files." / "The tool could not be loaded. Check your connection and try again." / "Something went wrong while merging. Try again, or try the files in a different order." A failure sentence never names a page.

## Risks / Trade-offs

- **The widget is not on any page until `add-merge-pdf`.** Its end-to-end tests land there. This change is tested in Node only.
- **`React.lazy` inside an Astro island** splits the workspace into its own chunk. The trial showed module workers build; the lazy chunk is checked by the page weight script in the next change.
- **Cancel ends the worker,** so the next job pays for starting a worker again; the engine comes from the cache.
