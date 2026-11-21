# Tasks

Built on `add-text-option`, merged first.

## 1. Registry entry

- [x] 1.1 Add the `watermark-pdf` entry to `src/tools/registry.ts` as the design gives it (after Add page numbers, second under "Edit and sign", one `text` option with its words and `refusedSentence` and no limit or rule, no preset) and its line in `optionTexts` in `src/widget/option-values.ts`; verify with `npm test` (the registry test's catalogue order and the text checks from `add-text-option`) and that the built home page lists "Watermark" second under "Edit and sign" and Add page numbers' page now links to it

## 2. Engine

- [x] 2.1 Write `src/engines/tools/watermark-pdf.ts`: the text checked with `acceptedText` before any work, throwing `TextRefused` (whose message does not hold it); `watermarkPlace` (exported, pure) and `drawWatermark` (the text between an `/Artifact << /Type /Pagination /Subtype /Watermark >>` BDC and EMC, Helvetica Bold, `rgb(0.5, 0.5, 0.5)`, opacity 0.4, 45 degrees, numbers rounded to a thousandth); `run` through `plainCopy` and `stampPages` with reading, page and writing progress as Add page numbers reports them; pdf-lib imported for types only; `inspect` is `inspectPdf`; no change to `stamp.ts`, `qpdf.ts` or the failure kinds; verify with `npm run check` and the tests in 3.1

## 3. Engine unit tests

- [x] 3.1 `tests/unit/watermark-pdf.test.ts` as the design's Tests list it: `watermarkPlace` on every page size and text listed; the text refused in each listed way with `TextRefused` before qpdf is asked for, with no text in the error; `a) Tj (b \ % <x> [/y]` drawn with `qpdf --check` passing, PDF.js reading it back exactly and the layer stream holding it only inside one `<…>` hex string; `run` on every file in `tests/fixtures/` (`qpdf --check`, page count, each page's own text kept and the watermark's words last, the changed-pixel box centred within 3% and inside the margin on each page of `mixed.pdf` as shown, the angle as shown 45 degrees, the grey 204 on white, the artifact BDC and `/ca 0.4` in the form, accented text read back as typed, `scanned.pdf` over its pictures, `rich.pdf`, `form.pdf` and `tagged.pdf` kept with every tagged MCID in its page's own content and its streams unchanged, `password.pdf` and `restricted.pdf` with no password and no restrictions, `warning.pdf`, the damaged files failing); a page whose content leaves `/ca 0.1`, a scaling `cm` and a red fill set; thousands of pages sharing one tiny content stream, fast, the stream still shared, growth a few hundred bytes a page at most; verify the tests pass, then record each fixture's outcome in `tests/fixtures/README.md`, with the multilingual file still missing (Watermark leaves existing text alone)
- [x] 3.2 Measure the time, output size and peak memory on `pages-500.pdf`, the 120,000-page file of `make-many-pages.mjs` and `make-large.mjs`'s file, in Node and in Chromium, with a 50-character text; verify the numbers are recorded in the fixtures README beside Add page numbers' and that the 120,000-page output stays inside the size budget with room to spare; any figure more than 20% worse than Add page numbers' is explained there or raised in the pull request

## 4. Worker wiring

- [x] 4.1 Confirm `tool.worker.ts` already gives `qpdf` and `pdflib` and needs no change; `check-worker.mjs` checks the engine is loaded late, stays out of the worker file and holds no pdf-lib code (by a sentence from pdf-lib's source); `page-weight.mjs` gets a `loadedLater` line only for a new chunk; verify with `npm run build`, `npm run check:worker` and `npm run weigh`

## 5. Page and page text

- [x] 5.1 Check the page renders with its heading, sentence, title and description, and that once the file is read the empty "Watermark text" field shows with its hint and focus, and the main button waits with "Type the watermark text first.", as `add-text-option` draws them; verify with the built page and a component test with this entry
- [x] 5.2 Write `src/content/tools/watermark-pdf.md`, 250 to 500 words, marked as a draft, covering what the design's section 4 lists, with the privacy words saying only what the page controls (not uploaded; kept only while the tab is open; let go on "Start again" or closing the tab; no claim about downloads, keyboard apps or extensions; no "100%"); no question restates the title; no capitals for emphasis, even in examples; check it against "Banned patterns"; verify the built page holds the heading, sentence, steps and questions with scripts off

## 6. End-to-end test

- [x] 6.1 `tests/e2e/watermark-pdf.spec.ts` at 360px and 1280px:
  - choosing a file: one row, no summary line, "Getting ready" seen with the engine's route held until it has been checked (so a quick load cannot skip it), the status line, focus on the field once the file is read; two files dropped; not a PDF;
  - the main button waiting: `aria-disabled`, "Type the watermark text first." read with it, a press fetching no pdf-lib file and starting no job; the field's label, hint, `autocomplete="off"` and `spellcheck="false"`;
  - the text: typing "Kv4wm Qx8mrk" makes the button work (checked before pressing); Enter starts the job; "मसौदा" marks the field invalid, shows "Some characters cannot be used." and the second sentence between the label and the field ("Łódź" names Ł and ź), ties it to the button and says it once in the status region, and a press does nothing; a 63-character paste is kept whole with its sentence; Tab from the field to "Choose another file" and then the main button;
  - watermarking `mixed.pdf` with "Kv4wm Qx8mrk": the download passes `qpdf --check`, each page's text ends with the watermark's words, and the changed-pixel box is centred on each page as PDF.js shows it;
  - progress "Reading the file" and "Page n of m"; Cancel keeping the text; "Start again" emptying it; "Choose another file" keeping it; no Remove on the row, as for every one-file tool (Compress PDF's test checks the same), so a file is replaced, not removed;
  - password right and wrong, with focus landing on the field once the right password opens the file; damaged; engine-load failure; memory, output-limit and refused-text failures from a fake engine (the last saying "The watermark text could not be used. Check it and try again."); "Go back to your file" keeping the text;
  - the 100 MB notice; the 20,000-page notice on the generated 120,000-page file, with typing in the field blocking nothing for more than 100 ms;
  - verify it passes, with the other tools' e2e tests unchanged

## 7. No-upload test

- [x] 7.1 The tool's no-upload test: its exact allowlist from the build (the engine, `stamp`, `plain` with the qpdf JSON helpers inside it, pdf-lib's file and `fflate`, no other tool's engine), positive checks that the engine and pdf-lib were fetched and a download happened; `qz7report.pdf`, its stem, the password, the full text `Kv4wm Qx8mrk` and each word, `Kv4wm` and `Qx8mrk`, as secrets for requests, headers, the console, the title, storage and traces; runs on `rich.pdf`, `tagged.pdf` and `form.pdf` with their bookmark titles, attachment name, document titles, `SECRET-` markers and field values as secrets; the address with no query and no hash; Add page numbers' allowlist gains `stamp-*.js`, now a file of its own, with its other checks unchanged; verify both pass

## 8. Screenshots

- [ ] 8.1 Screenshots of `/watermark-pdf` at 360px and 1280px, light and dark: empty, getting ready, listed with the empty field and the waiting button, listed with text typed, a refused character, too long, working, result, password, damaged, failed, the 20,000-page notice; the listed states with a refused character and the result at 200% text size, with nothing overflowing sideways; verify by looking at each and adding them to the change folder

## 9. Checks and review

- [x] 9.1 `LICENSES.md`: no new line, as no dependency or font is added; the `@cantoo/pdf-lib` line's reason also names Watermark
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `npm run spec`; verify each passes
- [ ] 9.3 Add Watermark's hand checks to issue #7: the four PDF readers and printing to PDF from one of them, browsers and phones (including whether the on-screen keyboard opens when focus moves to the field, and that the row stays in view), a tagged file read with a screen reader, and the owner's review of the page text
- [ ] 9.4 When the pull request opens, update "Questions waiting for the owner" in `CLAUDE.md`: the font question is settled for now (owner, 21 Nov 2026: taken up later in issue #20; recorded under owner decisions), so only link issue #20 from the pull request; and widen "Rotate's waiting main button" to "Rotate's and Watermark's main buttons wait until something is done (a page turned, text typed), while Reorder's works untouched. Keep them as they are, or make them match?"
- [ ] 9.5 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (no option but the text; 50 characters on one line; 45 degrees across the centre; the size rule; Helvetica Bold, mid-grey, 40% opacity; above the content; marked as a watermark artifact; every page; `-watermarked`), the text read as the job's input, the font question deferred to issue #20, the drawing step's known limits, the missing multilingual test file, and next steps as a site-wide gap; it does not call the tool done

## Workflow follow-up

- After merge, archive the change with `/opsx:archive` and add Watermark to "Where the project stands" in `CLAUDE.md`.
