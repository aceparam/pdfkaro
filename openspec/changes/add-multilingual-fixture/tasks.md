# Tasks: add-multilingual-fixture

This change adds no tool, so the usual order is followed in spirit: the test data first (in place of a registry entry and an engine), then the unit tests that run every engine on it, then the record, the one end-to-end addition and the panel. No page changes, so there are no screenshots; no dependency is added to `package.json`, but the fonts used to make the file get a `LICENSES.md` line.

## 1. The words and the script

- [ ] 1.1 Write `tests/fixtures/multilingual-text.json` with the five pages of design.md decision 2 (language tag, direction, font family, heading, lines), exactly as written there. Verify: the JSON parses, has five pages, and each line is in Unicode NFC (checked with a one-off `node -e`, not committed).
- [ ] 1.2 Write `tests/fixtures/make-multilingual.mjs` (design.md decisions 2, 3 and 4): fetch the four pinned `@fontsource` packages with `npm pack` into a new temporary folder, check each SHA-512, extract each into its own empty folder, build the HTML from the JSON with `@font-face` rules pointing at `file:` addresses, print with Playwright's Chromium with every non-`file:` request refused, tidy with pdf-lib (title, creator, fixed dates, no object streams), refuse to write unless `qpdf --check` passes, the page count is five and every page font is an embedded Type 0 subset with a Unicode map, then delete the temporary folder. A header comment says how to run it and that it needs the npm registry. Verify: `node tests/fixtures/make-multilingual.mjs` writes `tests/fixtures/multilingual.pdf`; a tampered integrity value makes it stop before printing (checked, not committed); two runs give the same bytes.
- [ ] 1.3 Add section 16 to `tests/fixtures/make.mjs` for `chinese-unembedded.pdf` (design.md decision 5). Run `make.mjs` into a scratch folder and copy back only `chinese-unembedded.pdf`, so the encrypted fixtures do not change. Verify: `qpdf --check` passes on it; `git status` shows no other fixture changed.
- [ ] 1.4 Open both files by hand with the tools on the build machine (poppler's `pdffonts` and `pdftotext`, and PDF.js in Node) and compare with the trial in design.md Context. Verify: the results are written into the fixtures README in 4.1; if `multilingual.pdf` differs from the trial (a Type 3 font, a missing script), fix the script before going on.

## 2. Checks on the files and on every engine

- [ ] 2.1 Write the file checks of design.md decision 6 in `tests/unit/multilingual.test.ts`: five pages; every font embedded with `FontFile2` and `ToUnicode`; the Chinese lines of page 4 read exactly by PDF.js; actual-text spans on pages 1, 2 and 3; for `chinese-unembedded.pdf`, a font with no font file and the encoding `UniGB-UCS2-H`. Verify: `npm test` passes; removing the font file of one font in a copy made in the test makes the embedded check fail.
- [ ] 2.2 Add the "text kept" tests of decision 6 for Merge, Split, Extract pages, Delete pages, Reorder pages, Rotate PDF, Compress PDF, Add page numbers, Watermark, Sign PDF, Protect with a password, and Protect then Remove a password, plus Remove a password alone giving no new file. For the page tools, also compare each kept page's decoded content stream byte for byte; if a tool turns out to rewrite it, record that and keep only the PDF.js comparison for that tool. Verify: `npm test` passes; a test entry that drops one page's text (a hand-made output) fails the comparison.
- [ ] 2.3 Add the "drawn" tests of decision 6: PDF to JPG, PDF to PNG and thumbnails on both files, with the dark-pixel bound measured once and written with a wide margin. Verify: `npm test` passes; a blank page made in the test fails the bound for `multilingual.pdf`.
- [ ] 2.4 Add the "second file kept" check of decision 6 for the page tools, Protect and the tools that draw on pages. Verify: `npm test` passes.
- [ ] 2.5 Update the tests that name every fixture so they name both new files, with measured outcomes: `pdf-to-images.test.ts` (picture sizes of each page), `add-page-numbers.test.ts`, `watermark-pdf.test.ts` and `sign-pdf.test.ts` (their lists of other files), and check `images-to-pdf.test.ts`, `protect-pdf.test.ts` and `unlock-pdf.test.ts` still pass with the larger set. Verify: `npm test` passes, with no test skipped or weakened.
- [ ] 2.6 Run every tool against every file in `tests/fixtures/`: the four engine-loads tests (`npx vitest run tests/unit/engine-loads`) with `ENGINE_LOADS_REPORT` set, so each engine's reading and job on both new files is recorded. Verify: they pass and the report holds a row for each engine on each new file.
- [ ] 2.7 If any tool loses text or fails on either file, stop and report it before changing any tool (design.md decision 8). Verify: either no such case, or the case is reported and the change is updated first.

## 3. One end-to-end addition

- [ ] 3.1 Add `multilingual.pdf` and `chinese-unembedded.pdf` to `/pdf-to-jpg`'s inputs in `tests/e2e/uniform-requests.spec.ts`, each picked and run (design.md decision 7). Verify: `npm run build` then `npx playwright test tests/e2e/uniform-requests.spec.ts --trace off` passes, and the spec's time grows by about 10 seconds or less (both timings in the pull request).

## 4. The record and the licences

- [ ] 4.1 In `tests/fixtures/README.md`: add both files to "The files" table; replace the "Missing: a file with text in Hindi, Telugu, Arabic and Chinese" paragraph with how `multilingual.pdf` is made (script, fonts and versions, Chromium and Playwright versions, the poppler and PDF.js readings from 1.4, including that PDF.js does not read actual-text spans) and how `chinese-unembedded.pdf` is made; add both files to each engine's table; replace every "The multilingual file is still missing" sentence with what the runs in 2.2 to 2.6 showed, including what does not work (the character-map gap). Verify: `grep -n "multilingual file is still missing" tests/fixtures/README.md` finds nothing, and every engine section names both files.
- [ ] 4.2 Add one line to `LICENSES.md` under "Used to build and test only" for Noto Sans Devanagari, Noto Sans Telugu, Noto Naskh Arabic and Noto Sans SC (OFL-1.1), fetched from the four `@fontsource` packages at the pinned versions by `make-multilingual.mjs`, not in `package.json`, never shipped, with subsets embedded only in `tests/fixtures/multilingual.pdf`. Verify: the line is there; no `LICENSE` file is added.
- [ ] 4.3 Put the issue #7 comment of design.md decision 9 in the pull request description for the owner or the program manager to post. Verify: it is in the description.

## 5. Whole checks and review

- [ ] 5.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run check:seo`, `npm run e2e -- --trace off` and `npm run spec`. Verify: all pass; paste the real output in the pull request. No screenshots: no page changes.
- [ ] 5.2 Run the `review-panel` skill, stage 2, and resolve every must-fix finding, updating design.md where a decision changes. Put the verdicts and the owner questions from proposal.md in the pull request description. Verify: every reviewer approves.

## Workflow follow-up

- Before building: run the `review-panel` skill, stage 1, on this proposal and settle every finding in these artifacts.
- After the pull request is merged: archive the change and add its entry to "Where the project stands" in `CLAUDE.md`, saying which issue #7 hand checks still need the new files.
