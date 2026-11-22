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

This change extends the owner's decision of 11 Nov 2026 ("PDF.js's helper data is one fixed set … so no request depends on what a PDF needs") from PDF.js's data to every file a tool page fetches. It also gives the Privacy page draft a true sentence about what the host can and cannot see.

## What Changes

- **One fixed set at the pick.** On every tool page, the files fetched after a pick are the same whatever was picked: a PDF that reads, a damaged one, one with a password, one of the wrong kind, a JPG or a PNG, one file or several. The set is made of three parts:
  - The engine and the libraries its reading uses are loaded before any file is read.
  - The thumbnail code (PDF.js and its worker, data and drawing step, or the picture thumbnail step) is started at the same point, before the file is read. It is not waited for.
  - A pick that takes no file (every file of the wrong kind) still loads the set. The page then says the file cannot be used, as it does today.
- **One fixed set at the main button.** Every job starts in a fresh worker. That worker loads everything the tool's job can use before the engine sees a file, whatever the file, the options, or how the job ends: a new file, "no new file", or a failure. It loads `fflate` for every Compress PDF job, and pdf-lib for every Add page numbers, Watermark and Sign PDF job.
- **Each tool says what it loads.** Each engine module declares its sets: what it reads with, what draws its thumbnails, and what its job uses. The worker loads them in one fixed order. A unit test runs every engine against every fixture with a recording `tools` and fails if an engine asks for anything it did not declare.
- **The first qpdf is made at the fixed point.** The pick's and the job's qpdf instance is made while the set loads, so qpdf's WebAssembly is requested at that point and not after the file is read. The instance is handed, unused, to the first qpdf call, so qpdf is still fresh for every call.
- **A test of what the host sees.** A new end-to-end spec serves the built site from a small local server that sends GitHub Pages' cache headers (`Cache-Control: max-age=600` and an `ETag`) and logs every request it receives. For each of the 17 tool pages, it picks several different inputs, each in a fresh browser, and runs a job where one can run. It fails unless the server's log of requests after the pick, and after the main button, is the same for every input. The spec reuses the no-upload watcher and each tool's exact list of files, which move into one shared file.
- **Privacy page draft.** One sentence is added under "What happens to your file", and one under "Who serves the site", in draft words marked for the owner. They say:
  - which programs are fetched, and in what order, does not depend on what the file holds;
  - what the host can still see: that a tool page was opened and, from when the programs are fetched, that a file was chosen and when a job was started;
  - that the browser may ask for the same programs again later.

  Each sentence is tied to the new test in design.md's claim table.

### Out of scope

- Hiding that a tool page was opened, that a file was picked or that a job ran. The host sees these from the requests themselves. The Privacy page says so.
- Hiding when the browser asks again for files it already holds: after its copy goes stale (10 minutes on GitHub Pages), or when its cache is off or full. design.md, Risks, lists what that can show and why it is not closed here.
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
- New question, with the default this change builds (design.md, Open questions):
  1. Say on the Privacy page that the browser may ask for the programs again later, "for example after a job or when a page of your file takes long to draw"? Default: yes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `privacy`: adds that which site files a tool page requests does not depend on the visitor's file, the test that checks this at the host, and the Privacy page sentences about it.
- `tool-engines`: adds that each tool loads one fixed set at the pick and one at the main button, declared by its engine and loaded by the worker before any file is read, with every job in a fresh worker.

## Impact

- `src/engines/types.ts` (a `loads` declaration on `EngineModule`) and every file in `src/engines/tools/` (its declaration). No engine's output changes.
- `src/workers/worker-core.ts` (loads a tool's set for each phase before touching a file; a `prepare` message), `src/workers/messages.ts`, `src/workers/tool.worker.ts` (libraries by name; a spare unused qpdf), `src/workers/pdfjs-loader.ts` (PDF.js's worker is started alongside the PDF.js import, not after it), `src/workers/client.ts` (`prepare`).
- `src/hooks/useToolRun.ts`: prepares the worker on every pick; waits for the set before reporting a pick that took no file; ends the read worker at the main button so the job runs in a fresh one.
- `src/pages/privacy.astro`: two draft sentences.
- Tests: `tests/unit/worker-core.test.ts`, `tests/unit/client.test.ts`, a new `tests/unit/engine-loads.test.ts`, a new `tests/e2e/uniform-requests.spec.ts` with `tests/e2e/host-log.ts`, a new `tests/e2e/tool-files.ts` holding each tool's exact list of files (moved from the tool specs), and updates where a tool spec says a file is not fetched.
- `scripts/page-weight.mjs`: the "why" text of `fflate`, `pdf`, `pdf.worker.min`, `pdfjs-data`, `thumbnail` and `picture-thumbnail`. The 100 KB budget before a pick is unchanged, and no new built file is added.
- No dependency is added and `LICENSES.md` does not change.
