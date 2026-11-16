# Tasks

## 1. Registry entry and shared widget pieces

- [ ] 1.1 Add the `pdf-to-images` entry with its two pages, each with `preset` (`format`, `extension`) and per-page `words`, to `src/tools/registry.ts`; the registry test checks catalogue order, both pages' words, and that page words override only the allowed keys
- [ ] 1.2 `[slug].astro`, `ToolWidget` and `useToolRun`: pass the preset into each job's options, merge page words, and name single outputs and zips with the preset's extension; `ZipNaming.extension` checked by `isZipNaming` and used by `worker-core`'s `partName`; unit and component tests, other tools still `.pdf`

## 2. Engine

- [ ] 2.1 Rename `src/engines/thumbnail.ts` to `pdf-pages.ts` (imports, tests, `check-worker.mjs`, `page-weight.mjs`); add `draw(page, { scale, maxPixels, format, quality })` with the pixel cap, `/Rotate`, `ENABLE_STORAGE` annotations, white background and the canvas released in a `finally`
- [ ] 2.2 Write `src/engines/tools/pdf-to-images.ts`: format checked, every page drawn in order with progress, zip limits checked early, the document closed in a `finally`; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [ ] 3.1 `tests/unit/pdf-to-images.test.ts` on every file in `tests/fixtures/` for both formats: picture count and sizes (A4 1240 by 1754, `mixed.pdf`'s sizes and turns), formats checked by their first bytes, JPG and PNG decoded and compared with the thumbnail drawing, `form.pdf`'s values visible, `password.pdf` with its password, damaged files failing, a made-up 100 by 100 inch page drawn at 5000 by 5000, and a zip-limit refusal from a stand-in page count; record outcomes in the fixtures README, and that the multilingual file is still missing; `make-large.mjs`'s file by hand
- [ ] 3.2 `tests/unit/pdf-pages.test.ts`: `draw` sizes, the cap, rotation, both encoders, and the thumbnail unchanged

## 4. Worker wiring

- [ ] 4.1 `check-worker.mjs` and `page-weight.mjs`: the engine loads late, `pdf-pages` stays out of the worker file

## 5. Page and page text

- [ ] 5.1 Check both pages render with their own heading, sentence, title, description and main button, and the home page lists them under "Convert from PDF"
- [ ] 5.2 Write `src/content/tools/pdf-to-jpg.md` and `pdf-to-png.md` as the design lists, 250 to 500 words each, drafts; check against "Banned patterns"

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/pdf-to-images.spec.ts` at 360px and 1280px:
  - **Both pages:** headings and buttons; choosing a file; two files dropped; not a PDF.
  - **The zip:** a 3-page file to JPG, checking its file names, count and picture sizes.
  - **A single picture:** a one-page file to PNG gives `name.png`, checked by its first bytes.
  - **Password:** right and wrong.
  - **Failures:** damaged file; Cancel; engine-load failure; the 100 MB notice.
  - **Progress:** "Page n of m".
  - **Speed:** `pages-500.pdf` blocking nothing for more than 100 ms.
  - The other tools' e2e tests still pass.

## 7. No-upload test

- [ ] 7.1 The tool's no-upload test on both pages:
  - **Files fetched:** its exact allowlist from the build, with positive checks that the engine, PDF.js and `fflate` were fetched and pdf-lib was not.
  - **Files converted:** runs on `rich.pdf` under a telling name, `tagged.pdf`, and `password.pdf` with its password.
  - **Secrets:** the file name, stem and password, `rich.pdf`'s bookmark titles, attachment name and title, and `tagged.pdf`'s `SECRET-` markers, checked against requests, headers, the console and the title.
  - **After the job:** storage and traces; the address with no query and no hash.

## 8. Screenshots

- [ ] 8.1 Screenshots of `/pdf-to-jpg` at 360px and 1280px, light and dark: empty, getting ready, listed, working, result (zip), result (one picture), password, damaged, failed; `/pdf-to-png` empty and result at 360px; check 200% text

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line: no dependency added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add the tool's hand checks to issue #7 (pictures opened on Windows, macOS, Android and iOS; a PDF with Hindi, Arabic and Chinese text)
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings. The pull request:
  - names the agent's choices: one tool, two pages; every page; 150 pixels to the inch; the 25 million pixel cap; quality 85; a single picture or a zip; the names;
  - asks the owner about character maps for these tools, and about a resolution or page choice;
  - does not call the tool done.
