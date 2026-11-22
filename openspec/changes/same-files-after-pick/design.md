# Design

## Context

Every engine gets its libraries through `tools` (`src/workers/tool.worker.ts`). Each entry is fetched the first time an engine asks for it. Some entries are inline code with no file behind them (`canvas`, `decodePicture`); others fetch a built file: `qpdf` (`qpdf-*.js` and `.wasm`), `pdfjs` and `pdfjsData`, `pdflib` (`pdflib-*.js`, which imports fflate), and `fflate` (`fflate-*.js`). A request for a built file is what the host can see. So an engine that asks for a fetching entry only for some files tells the host something about the file.

Read across `src/engines/` on this branch:

| Tool | Fetching entries asked for | Depends on the file? |
| --- | --- | --- |
| Merge, Split, Extract, Delete, Reorder, Rotate, Protect, Unlock | `qpdf`; zip step for Split by the page's `zip` flag, not the file | No |
| Add page numbers, Watermark, Sign PDF | `qpdf`, `pdflib` at the start of `stampPages`; Sign asks for `fflate` for a JPG and a PNG alike | No |
| PDF to JPG and PNG | `pdfjs`, `pdfjsData`, zip step by the page's flag | No |
| Thumbnails (`thumbnail.ts`, `picture-thumbnail.ts`) | fixed per kind of tool | No |
| **Compress PDF** | `qpdf`; `fflate` only when `needsLossless` | **Yes** |
| **Image to PDF** | job: `pdflib`, `fflate` always. `inspect`: `fflate` only for a PNG | **Yes, at pick** |

On every tool, a job that never runs (a damaged file, or a protected file whose password is never typed) leaves the engine's job-time files unfetched. That is the visitor not pressing the button, which the host also sees from the page alone; it is out of scope here.

## Decisions

### 1. Compress PDF asks for fflate first, for every job

In `run`, right after the one-file check and before the first progress report, `const fflate = await need<Fflate>(tools, 'fflate');`. The later `needsLossless ? await need(...) : undefined` goes; `shrinkLossless` gets the `fflate` already held. `decodePicture` and `canvas` stay behind `needsJpeg`: they are inline in the worker and fetch nothing.

Why at the start of `run` rather than in `inspect`: the job is where Compress needs it, and every job fetches qpdf anyway, so the set of files a job fetches becomes fixed. Fetching in `inspect` would also fetch it for files never compressed, for no privacy gain (the job's own qpdf `.wasm` fetch already differs between "pressed" and "not pressed").

A comment states the reason: the same files are fetched whatever the file holds.

### 2. Image to PDF asks for fflate before reading the picture

In `inspect`, fflate is asked for first, before `readPicture`, so a JPG, a PNG and a file of neither kind fetch the same files. The check then uses it as now: `read.picture.type === 'png' && !pngDataFits(file, fflate)`. This matches `sign-pdf.ts`'s `inspectPicture` and `pictureOutcome` ("fflate is asked for whatever the picture's type"). `run` already asks for it every time.

### 3. Tests

- **Unit** (`tests/unit/compress-pdf.test.ts`, `tests/unit/images-to-pdf.test.ts`): a `tools` with a counting `fflate`. Compress: `compress-text.pdf` (no pictures), `compress-small-jpg.pdf` (JPG only), `compress-lossless.pdf` and `compress-json-bomb.pdf` (a JSON too large, which skips the picture step) each ask for fflate once per job, and before the first qpdf call, so a later edit cannot move the fetch below a branch (security, stage 1). Image to PDF: `inspect` on a JPG, a PNG and `not-a-pdf.pdf`'s bytes each ask once. This mirrors Sign PDF's "asks for fflate for a JPG as for a PNG".
- **End-to-end** (in each tool's spec, under "nothing is uploaded"), in the shape of Split's "one part and several parts fetch the same files": each run in a fresh browser context (an empty cache) with `watchPolicy`, watching from before the pick to the download or the no-new-file result, then `violations(...)` against the existing exact list, then the set of paths without `blob:` addresses.
  - Compress: `compress-text.pdf`, `compress-small-jpg.pdf`, `compress-scans.pdf` (a JPG and a lossless picture) and `compress-packed.pdf`, which ends in "This file could not be made smaller.", so both endings are recorded. Each set includes fflate's exact path; all four sets are equal.
  - Image to PDF on `/image-to-pdf`: a JPG alone and a PNG alone, first recorded from pick until the thumbnail shows (the pick-time set, where the leak was), then through convert and download. Both sets include fflate's exact path at pick time; the pick-time sets are equal and the whole-run sets are equal.
  - The existing tests that say fflate is fetched for the scans stay.
- `tests/e2e/no-upload.spec.ts` needs no change: the watcher is not changed.

## Effect on page weight and late loading

Nothing changes before a pick: `npm run weigh` gives the same numbers. After a pick, Compress jobs on files without lossless pictures and Image to PDF picks of JPGs now fetch `fflate-*.js`, 6,282 bytes by gzip. WebAssembly is fetched at the same moment as before. fflate stays its own late chunk (`check:worker` unchanged).

## Threats considered

- **The request pattern as a side channel** is the threat fixed here, for these two tools.
- **A malicious PDF or picture:** no parsing changes. fflate is used exactly where it was; holding it earlier changes no limit (`inflateLimited`, `pngDataFits`).
- **Oversized file, hostile file name:** unchanged; a name never reaches a request (the no-upload tests).
- **Supply chain:** no dependency added; fflate is already shipped and listed in `LICENSES.md`.

## Risks

- A future engine branch could again ask for a fetching entry only for some files. The two new e2e tests catch it for these tools; a site-wide check is out of scope (proposal).
- A cached fflate file (fetched by another tool earlier in the visit) hides the request either way; the tests use fresh contexts so they see the cold-cache pattern.
