# Tasks

## 1. Registry entry and shared widget pieces

- [x] 1.1 Add the `pdf-to-images` entry with its two pages, each with `preset` (`format`) and per-page `words` (`actionLabel`, `resultNotes`, `outputExtension`), to `src/tools/registry.ts`, and `pageWords` in `src/tools/queries.ts`; the registry and catalogue tests check catalogue order (the entry at PDF to JPG's place), both pages' words, and that page words override only the allowed keys
- [x] 1.2 `[slug].astro`, `ToolWidget` and `useToolRun`: pass the preset into each job's options, use `pageWords`, name single outputs and zips with `outputExtension`, and type the download by its extension; `ZipNaming.extension` checked against `pdf`, `jpg`, `png` by `isZipNaming` and used by `worker-core`'s `partName`; unit and component tests, other tools still `.pdf`

## 2. Engine

- [x] 2.1 In `src/engines/thumbnail.ts`: `draw(page, { scale, maxPixels, format, quality })` with the 16 million pixel cap, `/Rotate`, `ENABLE_STORAGE` read from the loaded module, white background, the canvas released and `pdfPage.cleanup()` in a `finally`; `render` built on it; the canvas budget in the `CanvasFactory`; `tools.pdfjsGuard` wrapping open, render and draw (the worker's thumbnail wrapper using it); `jpeg` on `CanvasMaker`, with Compress importing the type; a lint rule refusing value imports of `pdfjs-dist` in `src/engines/`
- [x] 2.2 Write `src/engines/tools/pdf-to-images.ts`: format checked, every page drawn in order with progress, the page count against `zipMaxFiles` before drawing, a running total against `zipMaxBytes` and the 1 GB guard (through a helper in `zip-limits.ts` that Split also uses), the document closed in a `finally`; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [x] 3.1 `tests/unit/pdf-to-images.test.ts` on every file in `tests/fixtures/` for both formats: picture count and sizes (A4 1240 by 1754, `mixed.pdf`'s sizes and turns), formats checked by their first bytes, JPG and PNG decoded and compared with the thumbnail drawing, `form.pdf`'s values visible, `password.pdf` with its password, damaged files failing, a made-up 100 by 100 inch page drawn at 4096 by 4096 and a 50 by 100 inch page keeping its shape under the cap, a made-up many-page poster file stopped by the 1 GB guard with `TooManyPictures` sorted as `too-many-pictures` and its sentence (the failure kind, `isFromWorker` and `failures.ts` gaining it), a page of nested soft-mask groups refused by the canvas budget, `cleanup` called after each page, a stand-in dead PDF.js worker failing the job, and a zip-limit refusal; the 500-page PNG outcome and peak recorded; record outcomes in the fixtures README, and that the multilingual file is still missing; `make-large.mjs`'s file by hand
- [x] 3.2 Thumbnail tests: `draw` sizes, the cap, rotation, both encoders, the canvas budget, and thumbnails unchanged

## 4. Worker wiring

- [x] 4.1 `check-worker.mjs` and `page-weight.mjs`: the engine loads late and stays out of the worker file

## 5. Page and page text

- [x] 5.1 Check both pages render with their own heading, sentence, title, description and main button, and the home page lists them under "Convert from PDF"
- [x] 5.2 Write `src/content/tools/pdf-to-jpg.md` and `pdf-to-png.md` as the design lists, 250 to 500 words each, drafts; check against "Banned patterns"

## 6. End-to-end test

- [x] 6.1 `tests/e2e/pdf-to-images.spec.ts` at 360px and 1280px:
  - **Both pages:** headings and buttons; choosing a file; two files dropped; not a PDF.
  - **The zip:** a 3-page file to JPG, checking its file names, count and picture sizes.
  - **A single picture:** a one-page file to PNG gives `name.png`, checked by its first bytes and its download type.
  - **Only the drawn page:** the browser's PNG holds no text chunks and its JPG no APP1 or COM segment, and neither holds a `tagged.pdf` `SECRET-` marker.
  - **Password:** right and wrong.
  - **Failures:** damaged file; Cancel; engine-load failure; the 100 MB notice.
  - **Progress:** "Page n of m".
  - **Speed:** `pages-500.pdf` blocking nothing for more than 100 ms.
  - The other tools' e2e tests still pass.

## 7. No-upload test

- [x] 7.1 The tool's no-upload test on both pages:
  - **Files fetched:** its exact allowlist from the build, with positive checks that the engine, PDF.js and `fflate` (on every run, one-page files included) were fetched and pdf-lib was not.
  - **Files converted:** runs on `rich.pdf` under a telling name, `tagged.pdf`, and `password.pdf` with its password.
  - **Secrets:** the file name, stem and password, `rich.pdf`'s bookmark titles, attachment name and title, `tagged.pdf`'s `SECRET-` markers, and a font name from a fixture, checked against requests, headers, the console and the title.
  - **After the job:** storage and traces; the address with no query and no hash.

## 8. Screenshots

- [ ] 8.1 Screenshots of `/pdf-to-jpg` at 360px and 1280px, light and dark: empty, getting ready, listed, working, result (zip), result (one picture), password, damaged, failed; `/pdf-to-png` empty and result at 360px; check 200% text

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line: no dependency added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add the tool's hand checks to issue #7 (pictures opened on Windows, macOS, Android and iOS; a poster-sized page on iOS Safari; the pictures' bytes from Firefox and Safari; a PDF with Hindi, Arabic and Chinese text)
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings. The pull request:
  - names the agent's choices: one tool, two pages; every page; 150 pixels to the inch; the 16 million pixel cap (Safari's canvas limit, down from 25 million); quality 85; the 1 GB stop with its own sentence; a single picture or a zip; the names;
  - names that a single-picture result has no next steps and is not covered by the owner's zip exemption;
  - repeats the owner questions on character maps (with the corrected facts) and on a resolution or page choice; after merge, the fold and the 1 GB stop go in CLAUDE.md's agent decisions;
  - does not call the tool done.
