# Tasks

Built on `add-tool-options`, merged first.

## 1. Registry entry

- [ ] 1.1 Add the `add-page-numbers` entry to `src/tools/registry.ts` as the design gives it (first under "Edit and sign", one `choice` option, no preset) and its line in `src/widget/option-values.ts`; verify with `npm test` (the registry test's catalogue order and option checks from `add-tool-options`) and that the built home page lists "Add page numbers" first under "Edit and sign"

## 2. Engine

- [ ] 2.1 Write `src/engines/stamp.ts` with `stampPages` and its exported parts: `readPages` (pages through a file capped at 64 MB, dictionaries from `readDictionaries`, `/Parent` walked with a depth limit and a visited set, the full JSON let go once each page's dictionary, resources and numbers are kept), `pageBox` (PDF.js's rules for turn, paper box, shown box and user unit; the 1-point and 10^8-point limits), `layerMatrix`, `fromPdfLib` (each kind of pdf-lib object to qpdf JSON, new ids, identical objects written once), the per-page update (the layer as a form XObject, a direct copy of `/Resources` with `/XObject` gaining a free `/PDFkaro` name, `/Contents` as `[q, …own streams…, Q, draw]` with shared `q`, `Q` and draw streams), and `writeUpdate` (appended in runs, `/out.pdf` capped, one call with `--progress` and `--object-streams=generate`, `/in.pdf` and the JSON removed before `qpdf --check`); add `Qpdf.append`; layers drawn in pdf-lib documents of at most 2,000 pages; a header comment that Watermark and Sign PDF reuse it; verify with `tests/unit/stamp.test.ts` as the design lists, including the mark found within 2% of the bottom centre for every case, no stored turn, box or user unit changed, the MCID check on `tagged.pdf` and a page made in the test, the shared-stream file finishing fast and small, and the output cap stopping a write
- [ ] 2.2 Write `src/engines/tools/add-page-numbers.ts`: the place checked with `acceptedValue` before any work, `numberPlace` (exported) and `drawNumber` (the number between an `/Artifact` pagination `BDC` and `EMC`, black Helvetica), and `run` through `plainCopy` and `stampPages` with reading, page and writing progress; pdf-lib imported for types only; `inspect` is `inspectPdf`; add the `output-limit` failure kind, its sentence in `failures.ts` and its mapping in `worker-core.ts`; verify with `npm run check`, the tests in 3.1, and unit tests for the mapping and the sentence

## 3. Engine unit tests

- [ ] 3.1 `tests/unit/add-page-numbers.test.ts`: `numberPlace` (A4, Letter, A6, A0, a 20 by 20 point page, 1 to 7 digits, every place); the place refused when unlisted, a label, a number, `'__proto__'` or missing; `run` on every file in `tests/fixtures/`: `qpdf --check`, the page count, each page's text through PDF.js ending with its number, the number's place for each of the six places on `mixed.pdf`'s four pages as PDF.js shows them, `rich.pdf`'s bookmarks, link and `note.txt`, `form.pdf`'s fields and values, `tagged.pdf`'s tags, destination and thread with every tagged MCID still in its page's content, `password.pdf` (with its password) and `restricted.pdf` coming back with no password and no restrictions, `warning.pdf` numbered, damaged files failing; verify the tests pass, then record each fixture's outcome in `tests/fixtures/README.md`, with the multilingual file still missing
- [ ] 3.2 Measure, with the memory order of the design's section 6, the time, output size and peak memory on `pages-500.pdf`, the 120,000-page file of `make-many-pages.mjs` and `make-large.mjs`'s 100 MB file, in Node and in Chromium; verify the numbers are recorded in the fixtures README and are no worse than the design's table

## 4. Worker wiring

- [ ] 4.1 Confirm `tool.worker.ts` already gives `qpdf` and `pdflib` and needs no change; `check-worker.mjs` checks the engine and `stamp` are loaded late, stay out of the worker file and hold no pdf-lib code (by a sentence from pdf-lib's source); `page-weight.mjs` gets a `loadedLater` line only for a new chunk; verify with `npm run build`, `npm run check:worker` and `npm run weigh`

## 5. Page and page text

- [ ] 5.1 Check the page renders with its heading, sentence, title and description, and that "Where the numbers go" shows once the file is read with focus on "Bottom centre", as `add-tool-options` draws it; verify with the built page and a component test with this entry
- [ ] 5.2 Write `src/content/tools/add-page-numbers-to-pdf.md`, 250 to 500 words, marked as a draft, covering what the design lists (steps; places and size; numbered from 1, a cover too, and how to leave one out with Split PDF or Extract pages and Merge PDF; what is kept; earlier saved versions, signatures, and that the file no longer meets PDF/A; passwords and restrictions removed; a number hidden under a field or note; nothing uploaded and the page forgets the file); no question restates the title; check it against "Banned patterns"; verify the built page holds the heading, sentence, steps and questions with scripts off

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/add-page-numbers.spec.ts` at 360px and 1280px: choosing a file (one row, no summary line, "Getting ready", the status line, focus on "Bottom centre"), two files dropped, not a PDF; the option by keyboard alone (arrow keys, one Tab stop, Tab to the main button) and its accessible names; numbering `mixed.pdf` at "Top right" and checking the download (`qpdf --check`, each page's text ending with its number, the number's place as PDF.js shows it); progress "Reading the file" and "Page n of m"; password right and wrong; damaged; Cancel keeping the place; "Start again" resetting it; engine-load failure; the 100 MB notice; the 20,000-page notice on the generated 120,000-page file with changing the place blocking nothing for more than 100 ms; verify it passes, with the other tools' e2e tests unchanged

## 7. No-upload test

- [ ] 7.1 The tool's no-upload test: its exact allowlist from the build (the engine, `stamp`, `qpdf-json`, pdf-lib's file and `fflate`, no other tool's engine), positive checks that the engine and pdf-lib were fetched and a download happened; `qz7report.pdf`, its stem, the password, `top-left` and `Top left` as secrets; runs on `rich.pdf`, `tagged.pdf` and `form.pdf` with their bookmark titles, attachment name, document titles, `SECRET-` markers and field values as secrets for requests, headers, the console and the page title; storage and traces; the address with no query and no hash; verify it passes

## 8. Screenshots

- [ ] 8.1 Screenshots of `/add-page-numbers-to-pdf` at 360px and 1280px, light and dark: empty, getting ready, listed with the option, working, result, password, damaged, failed, the 20,000-page notice; check the option group at 200% text size and that nothing overflows sideways; verify by looking at each and adding them to the change folder

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: no new line, as no dependency is added; the `@cantoo/pdf-lib` line's reason also names Add page numbers
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `npm run spec`; verify each passes
- [ ] 9.3 Add Add page numbers' hand checks to issue #7: the four PDF readers, browsers and phones, a tagged file from a word processor numbered and read with a screen reader, and the owner's review of the page text
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (one option with six places and "Bottom centre" first, numbers from 1 as digits only, the size and margin rule, black Helvetica not put inside the file, the number marked as a page number, every page numbered, the placement method, the output-size backstop, `-numbered`), the drawing step and failure kind riding along, more `Q` than `q` as a known limit, the missing multilingual test file, and next steps as a site-wide gap; it does not call the tool done

## Workflow follow-up

- After merge, archive the change with `/opsx:archive` and add Add page numbers to "Where the project stands" in `CLAUDE.md`.
