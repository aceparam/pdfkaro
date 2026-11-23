# Proposal: add-uniform-requests

**Requested by the owner on 22 Nov 2026 ("we need transparency").**

## Why

The owner asked for this on 22 Nov 2026 ("we need transparency"). The site's host, GitHub Pages, records every request a browser makes for the site's own files. Today, which of those files a tool page fetches, and when, depends in places on what is in the visitor's file. So the host's logs can learn something about a file that never left the device.

The privacy reviewer found two cases in `add-privacy-draft`'s stage 2 review (CLAUDE.md entry 23, "Found, not changed"):

- Compress PDF fetches `fflate` only when the file has lossless pictures.
- Image to PDF fetches it at the pick only for a PNG.

The read-only audit in design.md (section "Audit") found more:

- A damaged file, or one that needs a password, draws no thumbnail. So PDF.js, its worker and its helper data (about 1.3 MB) are not fetched for it, on every PDF tool page.
- A file of the wrong kind fetches nothing at all.
- On Add page numbers, Watermark and Sign PDF, pdf-lib is fetched only once the job has got past reading the file and its size checks. So a job that fails early fetches less than one that succeeds.
- On Image to PDF, a picture that cannot be read draws no thumbnail, so the thumbnail code is not fetched for it.
- Sign PDF reads a signature picture only when its first bytes look right.
- The stage 1 review found that reading workers are ended while PDF.js's files are still arriving, in ways that depend on the file. Examples are the 10-second thumbnail limit counted from the send, a further file or password try, a Sign PDF picture, and a reading failure. The next worker asks again, so the host sees repeats for some files only.

This change extends the owner's decision of 11 Nov 2026 ("PDF.js's helper data is one fixed set … so no request depends on what a PDF needs") from PDF.js's data to every file a tool page fetches. It also gives the Privacy page draft a true sentence about what the host can and cannot see.

## What Changes

- **One fixed set at the pick.** On every tool page, the files fetched after a pick are the same whatever was picked, while the browser's copies are fresh and apart from the named exceptions: a PDF that reads, a damaged one, one with a password, one of the wrong kind, a JPG or a PNG, one file or several. The set is made of three parts:
  - The engine and the libraries its reading uses are loaded before any file is read.
  - The thumbnail code (PDF.js and its worker, data and drawing step, or the picture thumbnail step) is started at the same point, before the file is read. It is not waited for.
  - A pick that takes no file (every file of the wrong kind) still loads the set. The owner chose this on 22 Nov 2026. Meanwhile the file's line shows "Getting ready" with its Remove button, held to 60 seconds. The page then says the file cannot be used, as it does today.
- **No reading worker is ended for a file-driven reason while its set loads.** Today the 10-second thumbnail limit, a further file, a password try, a Sign PDF picture, and a reading failure can each end the worker while PDF.js's files are still arriving. The next worker then asks for them again, which shows the host a repeat that depends on the file. After this change:
  - the limit starts only once the set has settled;
  - a waiting thumbnail is dropped by message;
  - a replaced Sign picture's worker and a reading failure wait for the set, held to 60 seconds.

  Only the visitor's Cancel, "Start again", Remove, leaving and the main button end a worker early.
- **One fixed set at the main button.** Every job starts in a fresh worker. That worker loads everything the tool's job can use, the zip step included, before the engine sees a file, whatever the file, the options, or how the job ends: a new file, "no new file", or a failure. It loads `fflate` for every Compress PDF job, and pdf-lib for every Add page numbers, Watermark and Sign PDF job.
- **Each tool says what it loads.** Each engine module declares what it reads with and what its job uses. The thumbnail code follows from how the tool's thumbnails are drawn. One table maps every library the worker offers to its name. The worker loads the sets in one fixed order, and refuses any library an engine did not declare for the step. A unit test runs every engine against every fixture with a recording `tools` and fails if an engine asks for anything it did not declare.
- **The first qpdf is made at the fixed point.** The pick's and the job's qpdf instance is made while the set loads, so qpdf's WebAssembly is requested at that point and not after the file is read. The instance is handed, unused, to the first qpdf call, so qpdf is still fresh for every call.
- **A test of what the host sees.** A new end-to-end spec serves the built site from a small local server that sends GitHub Pages' cache headers (`Cache-Control: max-age=600` and an `ETag`) and logs every request it receives. For each of the 17 tool pages, it picks several different inputs, each in a fresh browser, and runs a job where one can run. It fails unless the server's log of requests after the pick, and after the main button, is the same for every input. A slow mode holds back PDF.js's files past the thumbnail limit. In that mode it compares a readable file with a damaged one, and one file with three. The spec reuses the no-upload watcher. Each tool's exact list of files is built in one shared file, from the libraries the engine declares and its static imports.
- **Privacy page draft.** One sentence is added under "What happens to your file", and one under "Who serves the site", in draft words marked for the owner. They say:
  - which programs are fetched does not depend on what the file holds, damaged, protected and wrong-kind files included;
  - what the host can tell: which tool page was opened and when a file was chosen, and it may be able to tell when a job was started;
  - that a program can be asked for more than once, and in a few cases how often can depend on the file, such as a page that is slow to show.

  They claim no order and no identical requests.

  Each sentence is tied to the new test in design.md's claim table.

### Out of scope

- Hiding that a tool page was opened, that a file was picked or that a job ran. The host sees these from the requests themselves. The Privacy page says so.
- The named exceptions in design.md, Risks. In these cases a program is asked for again, and how often can depend on the file:
  - no usable cache;
  - copies older than about 10 minutes;
  - a page slow to draw;
  - the main button pressed while PDF.js's files are still arriving;
  - a worker crash;
  - jobs longer than the cache lifetime.

  Owner question 2 asks to accept them for now.
- A service worker or offline cache (phase 2), padding requests, or fetching every tool's files on every page.
- Any new dependency. Any change to what a tool does to a file, to its words, or to the 100 KB budget before a pick.
- The "Questions waiting for the owner" on the Privacy draft that this change does not touch.

## SPEC.md sections

- "Privacy, limits and security": "The promise is simple and must be literally true", and "Browser tools". This change carries the promise past request bodies to the pattern of requests. It goes beyond the letter of `SPEC.md` at the owner's request of 22 Nov 2026, as an extension of the owner decision of 11 Nov 2026 in CLAUDE.md.
- "Architecture and tech stack", "Rules for the code" 3 and 4: engines still run in a worker and still load only after a pick. A pick that takes no file now also counts as a pick.
- "Tool page anatomy", "States every tool handles": "Engine loading" ("Getting ready") now also covers a wrong-kind pick while the set loads. No other state changes.
- "Whole site": "The Privacy page says in plain words what happens to a file … checked against the code before each release."
- "Build phases": not a tool, so it has no catalogue position. It is Phase 1 site work before launch, in its own pull request, like `add-content-security-policy`.

## Where files are processed, and requests

Files are processed where they are today, in the browser. No new kind of request is added; every request is still a `GET` for one of the site's own built files. Some requests now happen in cases where they did not before:

- PDF.js's set is fetched after a pick of a damaged file, a protected file or a file of the wrong kind.
- `fflate` is fetched for every Compress PDF job, and at the pick on Image to PDF and Sign PDF.
- The pick set is fetched for a wrong-kind pick.
- The job's fresh worker asks again for files the read worker already loaded. The browser answers these from its own cache while its copy is fresh.

## Open decisions and owner questions touched

- **PDF.js's helper data is one fixed set (11 Nov 2026):** extended, not changed. The fixed set is now fetched at the pick for every PDF tool, not only when a thumbnail is drawn.
- **Pages for previews only, or for launch too?** Touched. The cache lifetime the test models (10 minutes) is GitHub Pages'. Another host's headers would change only what design.md says about requests made again later, not which files are fetched.
- **The Privacy page draft** (issue #7): two draft sentences are added for the owner's review.
- **Answered by the owner on 22 Nov 2026:** PDF.js's set (about 1.3 MB) is fetched after every pick on a PDF page, including damaged, protected and wrong-kind files; and for a pick of the wrong kind the set is loaded first and only then is the file said to be unusable (the wait held to 60 s).
- New questions, with the default this change builds (design.md, Open questions):
  1. Keep the Privacy sentences "Your browser may ask for a program more than once, and in a few cases how often it asks can depend on your file. If a page of your file is slow to show, asking again can tell GitHub that."? Default: yes, marked for review.
  2. Accept the named rare exceptions (design.md, Risks) for now, with the Privacy page not claiming them closed? Default: yes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `privacy`: adds that which site files a tool page requests does not depend on the visitor's file, the test that checks this at the host, and the Privacy page sentences about it.
- `tool-engines`: adds that each tool loads one fixed set at the pick and one at the main button, declared by its engine and loaded by the worker before any file is read, with every job in a fresh worker.

## Impact

- `src/engines/types.ts` (a `loads` declaration on `EngineModule`) and every file in `src/engines/tools/` (its declaration). No engine's output changes.
- New files: `src/workers/libraries.ts` (the canonical order, the `toolLibrary` table; `LibraryName` itself is in `src/engines/types.ts`), and `src/workers/spare-qpdf.ts`.
- `src/workers/worker-core.ts`: loads a tool's set for each phase before touching a file; phase-gated `tools`; the zip step taken from `fflate`; `prepare`, `prepared` and `drop-thumbnail`; reading failures posted after the set settles.
- `src/workers/messages.ts`.
- `src/workers/tool.worker.ts`: libraries by name, checked against `toolLibrary`; the spare qpdf; no `loadZip`.
- `src/workers/pdfjs-loader.ts`: PDF.js's worker starts alongside the PDF.js import, guarded at once.
- `src/workers/client.ts`: `prepare`, the settled flag, the thumbnail limit after settle, `endWhenSettled`.
- `src/hooks/useToolRun.ts` and `src/components/ToolWorkspace/ToolWorkspace.tsx`:
  - prepare the worker on every pick;
  - show the wrong-kind "Getting ready" line, with Remove and focus;
  - drop thumbnails by message before settle;
  - end the read worker at the main button so the job runs in a fresh one.
- `src/pages/privacy.astro`: two draft sentences.
- Tests:
  - `tests/unit/worker-core.test.ts`, `client.test.ts` and the `pdfjs-loader` tests;
  - a new `tests/unit/engine-loads.test.ts`;
  - a new `tests/e2e/uniform-requests.spec.ts` with `tests/e2e/host-log.ts` (with a slow mode);
  - a new `tests/e2e/tool-files.ts`, which builds each tool's exact list of files and replaces the lists in the 14 tool specs;
  - updates where a tool spec says a file is not fetched.
- `scripts/check-worker.mjs`: the draw-set chunks import nothing new.
- `scripts/page-weight.mjs`: the "why" text of `fflate`, `pdf`, `pdf.worker.min`, `pdfjs-data`, `thumbnail` and `picture-thumbnail`. The 100 KB budget before a pick is unchanged, and no new built file is added.
- No dependency is added and `LICENSES.md` does not change.
