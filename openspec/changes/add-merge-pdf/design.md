# Design

## Context

The skeleton is merged: registry, static `ToolShell`, lint, tests, page weight check, sub-path check and a preview on GitHub Pages. The Merge PDF page shows a heading and a sentence. `design/` has a screen for each state. A trial in Node showed that qpdf 12.2 compiled to WebAssembly merges files, counts pages, reports a wrong password and a damaged file, and reports write progress.

## Goals / Non-Goals

**Goals:**

- Merge PDF works end to end in the browser, on a phone-sized screen, with keyboard and screen reader.
- The shared parts are built once, in a shape the other 53 tools can use without change.
- Nothing about a file leaves the device, and a test proves it.

**Non-Goals:**

- Thumbnails, handover to another tool, a Repair PDF link, the multilingual fixture. See the proposal.
- Offline support, Content Security Policy, group pages.

## Decisions

### 1. Engines

```
src/engines/
  types.ts            Progress, EngineTools, the Engine type
  qpdf.ts             wraps the WebAssembly build: run(args), write, read, remove
  inspect.ts          one file -> pages | needs a password | damaged
  tools/merge-pdf.ts  the Merge PDF engine
```

An engine has the form `SPEC.md` gives, plus the two things it cannot do itself:

```ts
type Engine<Options> = (
  files: Uint8Array[],
  options: Options,
  onProgress: (progress: Progress) => void,
  tools: EngineTools,           // { qpdf(): Promise<Qpdf> }
) => Promise<Uint8Array[]>;
```

`tools.qpdf()` hands the engine a ready qpdf. In the browser the worker makes it by fetching the WebAssembly file; in a Node test the test makes it by reading the file from disk. So engines never fetch and never touch the DOM, and run under Vitest as they are.

- **Merge.** Files are written into qpdf's in-memory file system as `/in/0.pdf`, `/in/1.pdf` and so on. The visitor's file names are never used as paths. The command is `qpdf /in/0.pdf --pages . 1-z /in/1.pdf 1-z ... -- /out.pdf`, with `--password=` for a file that has one. The first file is the primary input, which is what keeps its bookmarks and attachments. Exit code 0 or 3 (done, with warnings) is success.
- **Inspect.** `qpdf --show-npages`, with the password if one was typed. Exit 0 or 3 gives the page count. "invalid password" in the error gives needs-a-password. Anything else gives damaged.
- **Progress.** Two real units: "Reading file 2 of 3" while inputs are written, then the percentage qpdf reports while it writes the result. qpdf does not report pages written, so the screen does not claim "Page 14 of 120".
- **Memory.** Each input is held once by the page (as the browser's own `File`) and copied once into the worker's qpdf; the output is copied once out. A later change can mount files without the copy; noted, not built.

### 2. Worker plumbing

```
src/workers/
  messages.ts      the typed messages, both ways
  tool.worker.ts   the one worker entry, for every tool
  client.ts        the page's side: promises, progress, cancel
```

- **Messages to the worker:** `inspect` (one file's bytes, an optional password) and `run` (a tool id, files, options). **From the worker:** `inspected`, `progress`, `done`, `failed`. Every message carries the id of its request. `failed` carries a kind (`engine-load`, `engine`) and never a stack trace. The worker checks the shape of what it receives and ignores anything else.
- **Bytes are transferred, not copied,** in both directions.
- **One worker entry for all tools.** It finds a tool's engine with `import.meta.glob('../engines/tools/*.ts')`, keyed by tool id, so a new tool adds one engine file and no line here.
- **Late loading.** The page creates the worker only when the first file is picked. The worker imports the engine and fetches the WebAssembly file from the site's own origin on first use.
- **Cancel.** A WebAssembly call cannot be interrupted, so cancel ends the worker. The next action starts a new one; the engine files come from the browser cache.
- **A hostile file** that makes qpdf crash or run out of memory ends the worker. The page shows the failed state.

### 3. Widget logic, apart from views

```
src/widget/
  state.ts     the steps of a tool run, as one plain function (a reducer)
  format.ts    sizes in plain units, counts, the output name
src/hooks/
  useToolRun.ts    joins the reducer to the worker client
  useFileDrop.ts   files dropped or pasted anywhere on the page
```

The state holds what the screen shows: each file's id, name, size, page count and status (`reading`, `ready`, `needs-password`, `wrong-password`, `damaged`), the step (`empty`, `listing`, `working`, `done`, `failed`), progress, the result's name, size and pages, and a failure sentence. It holds no bytes and no passwords. Those live in a map inside the hook, in memory only, and are dropped on "Start again".

`outputName('report.pdf', 'merged')` gives `report-merged.pdf`. It removes path separators and control characters and caps the length.

All of `src/widget/` is plain TypeScript, tested in Node.

### 4. Components

| Component | In the first chunk | Notes |
| --- | --- | --- |
| `ToolWidget` | Yes | The island. Shows the picker; after a pick, loads `ToolWorkspace` |
| `FilePicker` | Yes | A real file input with a label styled as the button, so it works with the keyboard and before the script loads. Files picked before the script loads are taken when it does |
| `ToolWorkspace` | No, loaded after a pick | Everything after a pick: the list, problems, progress, the result. Owns the worker client |
| `PageGrid` | No | The items of the working area with Move up, Move down and Remove, and drag. An item takes an optional thumbnail, which no caller passes yet |
| `Result` | No | Name, size, a Download link styled as the main button, next steps, Start again |
| `ProgressBar`, `Notice`, `PasswordField` | No | Small parts, each reusable |

All take what they show through props. None imports the registry; `[slug].astro` passes the tool's id and words.

Download is a real link to an in-memory object URL with the `download` attribute, so it works with the keyboard and nothing is saved until it is pressed. The URL is released on "Start again" and when the page is left.

Screen reader: one polite status region for "Getting ready", progress (at most once a second) and "ready"; problems are alerts; focus moves to the result when it appears, and to the password field after a wrong password.

### 5. The page

`[slug].astro` renders `ToolShell` with `ToolWidget` inside it (`client:load`, so the picker wakes at once) and the tool's Markdown from `src/content/tools/<slug>.md` below. The registry's Merge PDF entry gains `widget: { pickerLabel, addLabel, actionLabel, outputSuffix, minFiles }`.

### 6. Tests

- **Unit, in Node:** the merge engine and `inspect` against every file in `tests/fixtures/`, with the expected result or the expected message for each, and every result checked with qpdf's own check; the reducer; names and sizes.
- **End to end, at 360px and 1280px:** pick two files, reorder with the keyboard, merge, download, and check the saved file's pages and order; the password path (wrong, then right); the damaged path; "Start again"; nothing but the picker's script requested before a pick.
- **The no-upload test:** one end-to-end test that watches every request from the page and the worker from pick to download, and storage after.
- **Fixtures:** `tests/fixtures/make.mjs` makes them with `@cantoo/pdf-lib` and qpdf: text, 500 pages, a scan with no text layer, password, restrictions, a broken cross-reference table that qpdf can rebuild, a cut-off file that it cannot, a form, mixed sizes and rotation, and bookmarks with a link and an attachment. `make-large.mjs` makes a file over 100 MB, which is not committed.
- **Budget and sub-path:** `npm run weigh` names the files that load only after a pick; `npm run check:base` is unchanged.

### 7. Dependencies

| Package | Why | Licence | Last release | Size shipped |
| --- | --- | --- | --- | --- |
| `@neslinesli93/qpdf-wasm` 0.3.1 | qpdf 12.2 compiled to WebAssembly, the library `SPEC.md` names for page structure | ISC for the wrapper; qpdf itself is Apache-2.0 | Nov 2026 | 17 KB script and 443 KB WebAssembly by gzip, after a pick only |
| `@cantoo/pdf-lib` 2.11.1 | Makes the test files and reads results in tests. The fork `SPEC.md` names | MIT | Sep 2026 | None; tests only |

Existing code cannot do the job: joining PDFs needs a PDF library, and none is in the repo.

### 8. Page weight and late loading

Before a pick the tool page loads its HTML, the stylesheets, React, `ToolWidget` and `FilePicker`. The target is under 80 KB by gzip, against the 100 KB budget; the build measures it and the pull request reports it. The worker, the workspace, the engine and the WebAssembly load after a pick, and an end-to-end test asserts none of them is requested before.

### 9. Threats considered

- **Malicious PDF.** Parsed only by qpdf, inside WebAssembly, inside a worker, with no network use and no access to the page. A crash ends the worker and shows the failed state.
- **Oversized file or a compression bomb.** No fixed limit; a warning over 100 MB; running out of memory ends the worker and shows the failed state with something to try. Cancel always works because it ends the worker.
- **Hostile file name.** Shown only as text through React, never as HTML, never used as a path. The output name is cleaned.
- **Passwords.** Held in memory in the hook, sent only to the worker, passed to qpdf as an argument inside WebAssembly, never stored, logged or put in an address.
- **The WebAssembly build is someone else's.** `@neslinesli93/qpdf-wasm` ships a prebuilt binary from one maintainer. It is pinned to an exact version and checked by the lockfile's hash. Building qpdf ourselves is possible later and is recorded as an option for the owner.
- **Server risks.** None; no server is involved.

## Risks / Trade-offs

- **One change for the tool and its shared parts,** against the rule in `SPEC.md`. Reasons are in the proposal.
- **No thumbnails yet.** The working area is plainer than the design. It is honest about that, and the component takes a thumbnail when one exists.
- **Later files lose bookmarks and attachments.** qpdf joins pages. The page says so.
- **Progress is by file and by percentage, not by page.** That is what qpdf reports.
- **Memory.** A merge holds about three copies of the files at its peak. Fine for ordinary files; the warning covers the rest.
- **A prebuilt WebAssembly binary** is trusted. See threats.
