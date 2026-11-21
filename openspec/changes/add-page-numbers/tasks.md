# Tasks

## 1. Registry entry

- [ ] 1.1 Add `ToolOption` and `options?: ToolOption[]` to the widget words, and the `add-page-numbers` entry to `src/tools/registry.ts` as the design gives it (first under "Edit and sign"); the registry test checks catalogue order and, for every option, unique keys, a choice's start among its values, a whole number's start within safe whole-number limits; verify with `npm test` and that the home page lists "Add page numbers" first under "Edit and sign"

## 2. Engine

- [ ] 2.1 Write `src/engines/stamp.ts`: `pageBox` (pure, exported: turn, paper box, shown box, user unit and qpdf's box by PDF.js's rules, the fix of turn, trim box and user unit, the layer size and drawing area, the 10^8-point limit), `readPageBoxes` (pages from `--json-key=pages` through a file capped at 64 MB, dictionaries from `readDictionaries`, `/Parent` walked with a depth limit and a visited set, the fixes as one `updateJson`) and `stampLayers` (one call through `callWithArgumentFile` with `--progress`, the fix, one `--overlay … --to=… --` per layer file and `--object-streams=generate`, then `qpdf --check`); a header comment that Watermark and Sign PDF reuse it; verify with `tests/unit/stamp.test.ts`: `pageBox` for each rule, and real runs on pages made with pdf-lib (turns 0, 90, 180, 270, inherited 90, -90, 450, 45; offset, reversed and missing paper boxes; crop and trim boxes smaller, of no area and off the page; user units of 2, 0 and -2; a content stream with an unbalanced `q`, a scaling `cm` and a fill colour) that stamp a mark at the bottom centre, draw the result with PDF.js and find the mark within 2% of the bottom centre as shown
- [ ] 2.2 Write `src/engines/tools/add-page-numbers.ts`: `numberOptions` (exported; the six places, `first` a safe whole number from 1 to 999,999, own keys only, refused before any work), `numberPlace` (exported; size, margin, the six places, shrinking on small pages), and `run` (reading progress, `plainCopy`, `readPageBoxes`, layers of at most 2,000 pages from `tools.pdflib()` with Helvetica, each number between an `/Artifact` pagination `BDC` and `EMC`, page progress, `stampLayers` with writing progress held under 100 until written); pdf-lib imported for types only; `inspect` is `inspectPdf`; verify with `npm run check` and the unit tests in 3.1

## 3. Engine unit tests

- [ ] 3.1 `tests/unit/add-page-numbers.test.ts`: `numberOptions` (refuses `1e309`/`Infinity`, `-5`, `0`, `2.5`, `10 ** 15`, `NaN`, `'1'`, a missing key, an unknown place, an inherited key) and `numberPlace` (A4, Letter, A6, A0, a 20 by 20 point page, 1 to 7 digits, every place); `run` on every file in `tests/fixtures/`: `qpdf --check`, the page count, each page's text through PDF.js ending with its number, the number's place for each of the six positions on `mixed.pdf`'s four pages as PDF.js shows them, `rich.pdf`'s bookmarks, link and `note.txt`, `form.pdf`'s fields and values, `tagged.pdf`'s tags, destination and thread, `password.pdf` (with its password) and `restricted.pdf` coming back with no password and no restrictions, `warning.pdf` numbered, damaged files failing, bad options refused before qpdf runs; a page made in the test whose text is tied to a tag by marked content, whose structure tree PDF.js still resolves to that text after numbering, with the number marked as an artifact and in no tag; verify the tests pass, then record each fixture's outcome in `tests/fixtures/README.md`, with the multilingual file still missing and `make-large.mjs`'s 100 MB file run by hand

## 4. Worker wiring

- [ ] 4.1 Confirm `tool.worker.ts` already gives `qpdf` and `pdflib` and needs no change; `check-worker.mjs` checks the engine and `stamp` are loaded late, stay out of the worker file and hold no pdf-lib code (by a sentence from pdf-lib's source); `page-weight.mjs` gets a `loadedLater` line only for a new chunk; verify with `npm run build`, `npm run check:worker` and `npm run weigh`

## 5. Page, options and page text

- [ ] 5.1 `State.choices` (`{}` is every option at its start) with `option-set { key, value }` acting only while listing, cleared by `reset` and kept through replace, remove, Cancel and failure; `src/widget/options.ts` with `shownValue`, `wholeFrom`, `optionProblem` and `optionsToSend`; verify with `tests/unit/options.test.ts` (the inputs listed in the design) and the reducer tests in `tests/unit/state.test.ts`, other tools' state unchanged
- [ ] 5.2 `ToolWorkspace` draws the options below the file's row once it has been read, while listing: a `fieldset` with a visible legend and native radio inputs, each a target at least 2.75rem tall; a `.field` text input with label, hint tied by `aria-describedby`, `inputmode="numeric"`, and, while not valid, `aria-invalid` with the sentence under it and tied to the unavailable main button; `useToolRun` sends `optionsToSend` on top of the preset; no new colours; verify with component tests (fieldset and legend, label and hint, the invalid state on the field and the button, a tool without options unchanged) and the existing component tests passing unchanged
- [ ] 5.3 Write `src/content/tools/add-page-numbers-to-pdf.md`, 250 to 500 words, marked as a draft, covering what the design lists (steps; places and size; the first number; every page numbered, a cover too, and how to leave one out; what is kept; earlier saved versions, signatures and PDF/A; passwords and restrictions removed; a number hidden under a field or note; nothing uploaded and the page forgets the file); check it against "Banned patterns"; verify the built page holds the heading, sentence, steps and questions with scripts off

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/add-page-numbers.spec.ts` at 360px and 1280px: choosing a file (one row, no summary line, "Getting ready", the status line), two files dropped, not a PDF; the options by keyboard alone (one Tab stop for the group, arrow keys, the field) and their accessible names; an empty, `0`, `1e309` and `1000000` first number holding the main button with the sentence tied to it, and putting it right; numbering `mixed.pdf` at "Top right" from 37 and checking the download (`qpdf --check`, each page's text ending with its number, the number's place as PDF.js shows it); progress "Reading the file" and "Page n of m"; password right and wrong; damaged; Cancel keeping the options; "Start again" resetting them; engine-load failure; the 100 MB notice; the 20,000-page notice on the generated 120,000-page file with an option change blocking nothing for more than 100 ms; verify it passes, with the other tools' e2e tests unchanged

## 7. No-upload test

- [ ] 7.1 The tool's no-upload test: its exact allowlist from the build (the engine, `stamp`, `qpdf-json`, pdf-lib's file and `fflate`, no other tool's engine), positive checks that the engine and pdf-lib were fetched and a download happened; `qz7report.pdf`, its stem, the password, `top-left` and `4321` as secrets; runs on `rich.pdf`, `tagged.pdf` and `form.pdf` with their bookmark titles, attachment name, document titles, `SECRET-` markers and field values as secrets for requests, headers, the console and the page title; storage and traces; the address with no query and no hash; verify it passes

## 8. Screenshots

- [ ] 8.1 Screenshots of `/add-page-numbers-to-pdf` at 360px and 1280px, light and dark: empty, getting ready, listed with the options, a first number that is not valid, working, result, password, damaged, failed, the 20,000-page notice; check the options at 200% text size and that nothing overflows sideways; verify by looking at each and adding them to the change folder

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: no new line, as no dependency is added; the `@cantoo/pdf-lib` line's reason also names Add page numbers
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `npm run spec`; verify each passes
- [ ] 9.3 Add Add page numbers' hand checks to issue #7: the four PDF readers, browsers and phones, a tagged file from a word processor numbered and checked in Adobe Reader's accessibility check and with a screen reader, and the owner's review of the page text
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (two options, six places with "Bottom centre" first, 1 to 999,999, digits only, the size and margin rule, black Helvetica not put inside the file, the number marked as a page number, every page numbered, `-numbered`), the shared options and drawing step riding along, the page content moved into a form XObject by qpdf's overlay with its fallback, the missing multilingual test file, and next steps as a site-wide gap; it does not call the tool done

## Workflow follow-up

- After merge, archive the change with `/opsx:archive` and add Add page numbers to "Where the project stands" in `CLAUDE.md`.
