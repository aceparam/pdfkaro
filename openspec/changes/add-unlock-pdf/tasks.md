# Tasks

No shared change and no dependency: the tool is built on the input-password flow, `cappedWrite`, the no-new-file outcome and the `unsupported` outcome as they are. Group 0 must be settled before any task that writes words on a page (groups 1 and 7).

## 0. The owner's word on "unlock"

- [x] 0.1 Record the owner's answer to owner question 1 (proposal) in this change before group 1 starts:
  - with the default (nothing on any page says "unlock"), no artifact changes;
  - if the owner lets the name "Unlock PDF" through, first add a MODIFIED `look-and-feel` delta ("Banned patterns") allowing that exact name and nothing else, and change the design's decision 1 words and the `unlock-pdf` spec's page scenarios to match, then run `npm run spec`.

  Record the answers to owner questions 2 to 4 too, or keep their defaults. Groups 2 to 6 do not depend on this and may start first.

  **Answered by the owner on 22 Nov 2026: all four defaults.** (1) The URL stays `/unlock-pdf` and no page says "unlock": the name is "Remove a password". (2) The output is `report-unprotected.pdf`. (3) A file with nothing to remove gives no new file, with a sentence. (4) The text below the tool says to remove restrictions only from a file you are allowed to change. No artifact changes beyond this note.

## 1. Registry entry

- [ ] 1.1 Add the `unlock-pdf` entry to `src/tools/registry.ts` as the design's decision 1 gives it (or as group 0 changed it): after Protect, second under "Protect"; no options; `noSmaller` and `unsupportedAdvice` words; two result notes; no preset. Remove Protect's comment "Unlock PDF is linked once it is published". Verify:
  - `npm test` passes, including catalogue order and the related-links rules;
  - the built home page lists it second under "Protect";
  - Protect's page now links to it;
  - no built page's visible text holds "unlock" (unless group 0 allowed the name).

## 2. Engine

- [ ] 2.1 Write `src/engines/tools/unlock-pdf.ts` as the design's decisions 2 and 4 give it:
  - one file only; the password from `passwordFrom`, used only through `passwordArgsFor` in qpdf's in-memory argument list;
  - the JSON probe on its own fresh qpdf, giving `[]` when the file is not encrypted;
  - one write with `--decrypt` through `cappedWrite` at `2 × file + 16 MB`, the writer local to its function;
  - the check on a fresh qpdf with no password: not encrypted, then `--check`;
  - progress: reading, writing scaled to 50, then 55 and 100;
  - fixed error sentences that never hold qpdf's printed text or the password;
  - `unprotectArgs`, `unprotectLimit`, `unprotectedBytes` and `isEncrypted` exported.
- [ ] 2.2 Add the inspector of the design's decision 3: `inspectPdf`, and for a file it calls damaged, one more fresh qpdf call whose "unsupported encryption" answer gives `unsupported`.

  Verify both with `npm run lint`, `npm run check` and the tests in 3.1. No other engine file changes.

## 3. Engine unit tests

- [ ] 3.1 Write `tests/unit/unlock-pdf.test.ts` as the design's Tests list it: arguments and source; `run` on every file in `tests/fixtures/`; the protected copies of `rich.pdf`, `form.pdf`, `tagged.pdf`, `mixed.pdf` and `pages-500.pdf` made in the test, with everything kept; AES-128, RC4 128-bit and 40-bit and a permissions-only file made in the test; only the typed password in qpdf's calls (a spy), none in the checker's; the inspector, including a certificate filter file made in the test; a still-encrypted result refused; progress order; the cap; no error holding a password. Verify they pass.
- [ ] 3.2 Run the tool against every file in `tests/fixtures/` and record each outcome in `tests/fixtures/README.md` under a new "Remove a password (Unlock PDF)" table (file given back, nothing to remove, damaged, not a PDF), with a note that the multilingual file is still missing. Measure time, output size and peak memory on `pages-500.pdf` and on `make-large.mjs`'s 100 MB file and the 120,000-page file of `make-many-pages.mjs`, each protected first with qpdf, in Node and Chromium; record how long the check takes. Verify the numbers are in the README and no genuine file comes near the cap.

## 4. Worker wiring

- [ ] 4.1 Confirm `tool.worker.ts` gives the engine `qpdf` and loads it late with no change, that an `unsupported` inspect outcome and `[]` from a tool with `noSmaller` words reach the page as they do for Image to PDF and Compress PDF, and that `OutputLimit` maps to `output-limit`. Verify with `npm run build`, `npm run check:worker` and `npm run weigh`: the engine is its own file, loads late and stays out of the worker file, and the page stays under 100 KB.

## 5. Page and page text

- [ ] 5.1 Check the built page renders with its heading, sentence, title and description, and that once a file with restrictions only is read the main button is ready with focus on it and the status line names the file. Verify with the built page and a component test with this entry.
- [ ] 5.2 Write `src/content/tools/unlock-pdf.md`, 250 to 500 words, marked as a draft, covering the design's section 6: uploading, a forgotten password (not guessed or recovered), restrictions needing no password, which password to type, nothing to remove, what changes and stays with signatures, a certificate file, and the sentence of owner question 4 unless the owner said otherwise. No "unlock" (unless allowed by group 0), no "100%", no capitals for emphasis, no question that restates the title. Check it against "Banned patterns". Verify the built page holds the heading, sentence, steps and questions with scripts off, and the word count is within range.

## 6. End-to-end test

- [ ] 6.1 Write `tests/e2e/unlock-pdf.spec.ts`, importing `test` from `tests/e2e/fixtures.ts` so any policy violation fails it, at 360px and 1280px:
  - **Choosing a file:** one row, no summary line, no Remove; "Getting ready" seen, with the engine's route held until it is checked; focus on the main button and the status line; two files dropped; not a PDF.
  - **`restricted.pdf`:** no password asked; the button works with the keyboard; the download is `restricted-unprotected.pdf`, which passes `qpdf --check`, is not encrypted, and opens in PDF.js with no password.
  - **`password.pdf`:** the field, the note and focus in it; a wrong password said and the field kept; `open-sesame` opens it with focus moving to the main button; the result `password-unprotected.pdf` with no password, not holding `open-sesame`; `owner-secret` opens it too.
  - **`text.pdf`:** "This file has no password or restrictions." and its advice, focus on the sentence, no Download, "Start again".
  - **Progress, Cancel and failures:** "Reading the file" and "Writing the unprotected file" with the bar never going back; Cancel leaves the file open with no new password prompt; failures from a fake engine (memory, output-limit) and an engine that cannot be fetched, each under "The protection was not removed."; "Go back to your file" with focus on the main button.
  - **The password's life:** no `value` attribute and the page's HTML not holding the password after typing and after a wrong one; "Start again" then the same file asks again; `pagehide` (`new PageTransitionEvent('pagehide', { persisted: true })`, as `merge-pdf.spec.ts` does) leaves no file and no password in the HTML; Back shows no file.
  - **Other states:** damaged files; a certificate-filtered file (made in the test) shows the unsupported notice with its advice; the 100 MB notice; the 20,000-page notice on the generated 120,000-page file.

  Verify it passes, with every other e2e test unchanged.

## 7. No-upload test

- [ ] 7.1 Write the tool's no-upload test, as Protect's: an exact allowlist read from the build (the engine, `plain`, `inspect`, qpdf, the worker and workspace, PDF.js for the thumbnail; no `option-values`, `stamp`, pdf-lib, `fflate` or other engine); the engine fetched and a download made; `qz7report.pdf`, a copy of a file protected with "Qz7 pw#%@ Kv4", its stem, the password and its parts `Qz7`, `pw#%@`, `Kv4`, plain and URL-encoded, in no request, header, title, storage or address; the page's and each worker's console text and arguments, with `page.on('worker')` attached before the page opens; no page error; the download's bytes not holding the password; further runs on protected copies of `rich.pdf`, `tagged.pdf` and `form.pdf` with their markers as secrets. Verify all pass.

## 8. Screenshots

- [ ] 8.1 Take screenshots of `/unlock-pdf` at 360px and 1280px, light, of: empty; listed (restricted file) with the button ready; password field; wrong password; working; result; nothing to remove; certificate file; failed. At 360px, dark: password field and result; at 360px, 200% text: password field, with nothing overflowing sideways. Put them in `.github/pr-screenshots/unlock-pdf/`. Verify by looking at each, and against "Banned patterns".

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: confirm no change is needed, as no dependency is added.
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, `check:csp`, end-to-end tests, `npm audit` and `npm run spec`. Verify each passes.
- [ ] 9.3 Add Unlock's hand checks to issue #7: the result opened with no password, and printed and copied from, in Chrome, Firefox, Adobe Reader and macOS Preview; browsers and phones; a screen reader on the password field; the owner's review of the page text; the multilingual test file, which must exist and be run before Unlock is called done.
- [ ] 9.4 When the pull request opens, add the proposal's new owner questions (those still open after group 0) to "Questions waiting for the owner" in `CLAUDE.md`, and name in the pull request: the registry name departing from the catalogue (or the owner's answer); `noSmaller` reused as named; certificate files still called damaged by other tools; the Privacy page facts of the design's section 5; that Unlock cannot be called done until the multilingual test file exists.
- [ ] 9.5 Run the review panel (see the review-panel skill), stage 2, and resolve its findings. The pull request names the agent's choices listed in the proposal and does not call the tool done.

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`.
- Add Unlock to "Where the project stands" in `CLAUDE.md`, carrying forward the Privacy page facts of the design's section 5 and that Unlock is not done until the multilingual test file exists and it has been run on it. With Unlock, every Phase 1 tool is built; the Phase 1 gate still needs every tool to pass "Definition of done" and the owner's About page.
