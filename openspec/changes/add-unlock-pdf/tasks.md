# Tasks

No dependency. Three small shared changes ride along, each named in the pull request: input passwords forgotten after a result (`run-job.ts`, `useToolRun`), `readPdf` in `inspect.ts` with no change in `inspectPdf`'s behaviour, and only the latest read of a file shown (`useToolRun`, task 4.3).

## 0. The owner's word on "unlock"

- [x] 0.1 Record the owner's answers on the word "unlock", the output name, a file with nothing to remove and the permission sentence before group 1 starts.

  **Answered by the owner on 22 Nov 2026: all four defaults.** (1) The URL stays `/unlock-pdf` and no page says "unlock": the name is "Remove a password". (2) The output is `report-unprotected.pdf`. (3) A file with nothing to remove gives no new file, with a sentence. (4) The text below the tool says to remove restrictions only from a file you are allowed to change.

  At stage 1 the answer was recorded in the specs: a MODIFIED `look-and-feel` delta ("Banned patterns") and an ADDED `tool-registry` requirement ("Unlock PDF is named "Remove a password""), with the proposal, design and `unlock-pdf` spec worded as decided.

## 1. Registry entry

- [x] 1.1 Add the `unlock-pdf` entry to `src/tools/registry.ts` as the design's decision 1 gives it: after Protect, second under "Protect"; no options; `noSmaller` and `unsupportedAdvice` words; two result notes; no preset. Remove Protect's comment "Unlock PDF is linked once it is published". In `tests/unit/registry.test.ts`, widen the checks at lines 293–299 (`unsupportedAdvice` only for `images-to-pdf`) and 358–363 (`noSmaller` only for `compress-pdf`) to admit `unlock-pdf`, and add an Unlock entry test like Compress PDF's (lines 305–356): the words, placement right after `protect-pdf`, the five related links. Verify:
  - `npm test` passes, including catalogue order and the related-links rules;
  - the built home page lists "Remove a password" second under "Protect";
  - Protect's page now links to it;
  - no built page's visible text or title holds "unlock".
- [x] 1.2 Change `tests/e2e/protect-pdf.spec.ts:618`, which asserts Protect's served HTML holds no "unlock", to check Protect's visible text instead (or the HTML with the `/unlock-pdf` address taken out), since Protect's related link now holds that address. Verify Protect's e2e test passes with Unlock published.
- [x] 1.3 In `design/README.md`, change the "Unlock PDF" bullet under "Content" (about line 71) to say the owner settled it on 22 Nov 2026: the address keeps `/unlock-pdf`, no page says "unlock", and the tool is named "Remove a password". Verify the README names no other change.

## 2. Engine

- [x] 2.1 Write `src/engines/tools/unlock-pdf.ts` as the design's decisions 2 and 4 give it:
  - one file only; the password from `passwordFrom`, used only through `passwordArgsFor` in qpdf's in-memory argument list;
  - `isEncrypted` on its own fresh qpdf, reading only `encrypt.encrypted` and keeping neither the parsed object nor qpdf's output; the job gives `[]` when the file is not encrypted;
  - one write with `--decrypt` through `cappedWrite` at `2 × file + 16 MB`, the writer local to its function;
  - `verify` with no password: the same reading must say not encrypted, then `--check`, on one fresh qpdf (shared after task 3.2's measurement);
  - progress: reading, writing scaled to 50, then 55 and 100;
  - fixed error sentences that never hold qpdf's printed text or the password;
  - `unprotectArgs`, `unprotectLimit`, `unprotectedBytes` and `isEncrypted` exported.
- [x] 2.2 Shared, no change in behaviour: export `readPdf(file, password, tools)` from `src/engines/inspect.ts`, giving `{ outcome, printed }`, with `inspectPdf` returning its outcome as now. Add Unlock's inspector of the design's decision 3: one `readPdf` call; a damaged outcome whose printed text says "unsupported encryption" gives `unsupported`. The printed text never leaves the worker.

  Verify both with `npm run lint`, `npm run check` and the tests in 3.1; every existing `inspectPdf` test passes unchanged. No other engine file changes.

## 3. Engine unit tests

- [x] 3.1 Write `tests/unit/unlock-pdf.test.ts` as the design's Tests list it: arguments and source; `run` on every file in `tests/fixtures/`; the protected copies of `rich.pdf`, `form.pdf`, `tagged.pdf`, `mixed.pdf` and `pages-500.pdf` made in the test, with everything kept; AES-128, RC4 128-bit and 40-bit and a permissions-only file made in the test; an RC4 and an AES-128 file opened with its permissions password, whose recovered opening password is in no return value, progress report or thrown error; only the typed password in qpdf's calls (a spy), none in the checker's; the inspector with one qpdf call, including a certificate filter file made in the test; `readPdf` against `inspectPdf` on every fixture; a still-encrypted result refused; progress order; the cap; no error holding a password. Verify they pass.
- [x] 3.2 Run the tool against every file in `tests/fixtures/` and record each outcome in `tests/fixtures/README.md` under a new "Remove a password (Unlock PDF)" table (file given back, nothing to remove, damaged, not a PDF), with a note that the multilingual file is still missing. Measure time, output size and peak memory on `pages-500.pdf` and on `make-large.mjs`'s 100 MB file and the 120,000-page file of `make-many-pages.mjs`, each protected first with qpdf, in Node and Chromium; record how long the check takes. Optionally measure the probe sharing the writer's qpdf instance; keep fresh instances unless it measurably helps. Verify the numbers are in the README and no genuine file comes near the cap.

## 4. Worker wiring and the input passwords

- [x] 4.1 Confirm `tool.worker.ts` gives the engine `qpdf` and loads it late with no change, that an `unsupported` inspect outcome and `[]` from a tool with `noSmaller` words reach the page as they do for Image to PDF and Compress PDF, that the worker's inspect answer carries the outcome only (not `readPdf`'s printed text), and that `OutputLimit` maps to `output-limit`. Verify with `npm run build`, `npm run check:worker` and `npm run weigh`: the engine is its own file, loads late and stays out of the worker file, and the page stays under 100 KB.
- [x] 4.2 Shared: add `forgetInputPasswords()` to `Job` in `src/hooks/run-job.ts`, called beside `forgetNewPasswords()` when a job ends with a file or with no new file, and pass from `useToolRun` a callback that empties its `passwords` map (design decision 5). Confirm no result screen reads the map (no way back to the files from a result, no thumbnails there). Add to `tests/unit/run-job.test.ts`: forgotten after a file and after no new file, before anything else clears them; kept after an engine failure, a throw and a cancel. Verify every other tool's unit and e2e tests pass unchanged.

- [x] 4.3 Shared, found at stage 2 (UX reviewer's report of a main button that did not appear after a wrong then a right password): the password field stays while a try is read, so a second try can be sent before the first is answered, and the worker reads both at once, so the answers can come back in either order; `useToolRun`'s `inspect` dispatched every answer, so a wrong try answered last replaced "ready" with "wrong-password". Give each read of a file a ticket in `useToolRun` and dispatch only the latest read's answer. Verify with an e2e test in `tests/e2e/unlock-pdf.spec.ts` whose stand-in engine answers the wrong try last (it fails before the fix), and every other tool's tests unchanged.

## 5. Page and page text

- [x] 5.1 Check the built page renders with its heading, sentence, title and description, and that once a file with restrictions only is read the main button is ready with focus on it and the status line names the file. Verify with the built page and a component test with this entry.
- [x] 5.2 Write `src/content/tools/unlock-pdf.md`, 250 to 500 words, marked as a draft, covering the design's section 7: uploading (the password let go once the new file is ready), a forgotten password (not guessed or recovered), restrictions needing no password with the owner's sentence on permission, which password to type, nothing to remove ("You can use your file as it is."), what changes and stays with signatures, and a file protected another way with its next step. No "unlock", no "100%", no capitals for emphasis, no question that restates the title. Check it against "Banned patterns". Verify the built page holds the heading, sentence, steps and questions with scripts off, and the word count is within range.

## 6. End-to-end test

- [x] 6.1 Write `tests/e2e/unlock-pdf.spec.ts`, importing `test` from `tests/e2e/fixtures.ts` so any policy violation fails it, at 360px and 1280px:
  - **Choosing a file:** one row, no summary line, no Remove; "Getting ready" seen, with the engine's route held until it is checked; focus on the main button and the status line; two files dropped; not a PDF.
  - **`restricted.pdf`:** no password asked; the button works with the keyboard; the download is `restricted-unprotected.pdf`, which passes `qpdf --check`, is not encrypted, and opens in PDF.js with no password.
  - **`password.pdf`:** the field, the note and focus in it; a wrong password said and the field kept; `open-sesame` opens it with focus moving to the main button; the result `password-unprotected.pdf` with no password, not holding `open-sesame`; `owner-secret` opens it too.
  - **`text.pdf`:** "This file has no password or restrictions." and "There was nothing to remove, so no new file was made. You can use your file as it is.", focus on the heading, no Download, "Start again".
  - **Progress, Cancel and failures:** "Reading the file" and "Writing the unprotected file" with the bar never going back; Cancel leaves the file open with no password prompt; failures from a fake engine (memory, output-limit) and an engine that cannot be fetched, each under "The protection was not removed."; "Go back to your file" with focus on the main button and the job running again without the password typed again.
  - **The password's life:** no `value` attribute and the page's HTML not holding the password after typing and after a wrong one; after a result, "Start again" then the same file asks again; `pagehide` (`new PageTransitionEvent('pagehide', { persisted: true })`, as `merge-pdf.spec.ts` does) leaves no file and no password in the HTML; Back shows no file.
  - **Other states:** damaged files; a certificate-filtered file (made in the test) shows "… is saved in a way this tool cannot read." with "It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection."; the 100 MB notice; the 20,000-page notice on the generated 120,000-page file.

  Verify it passes, with every other e2e test unchanged except task 1.2's check.

## 7. No-upload test

- [x] 7.1 Write the tool's no-upload test, as Protect's:
  - an exact allowlist read from the build (the engine, `plain`, `inspect`, qpdf, the worker and workspace, PDF.js for the thumbnail; no `option-values`, `stamp`, pdf-lib, `fflate` or other engine); the engine fetched and a download made;
  - secrets: `qz7report.pdf`, a copy of a file protected with "Qz7 pw#%@ Kv4", its stem, the password and its parts `Qz7`, `pw#%@`, `Kv4`, plain and URL-encoded, and the decrypted text of its first page;
  - none in any request, header, title, storage or address; the page's and each worker's console text and arguments, with `page.on('worker')` attached before the page opens (it may not report PDF.js's nested worker in every browser; named in the pull request); no page error; the download's bytes not holding the password;
  - a run on `restricted.pdf` with no password typed, with its page text as a secret;
  - further runs on protected copies of `rich.pdf`, `tagged.pdf` and `form.pdf` with their markers as secrets.

  Verify all pass.

## 8. Screenshots

- [x] 8.1 Take screenshots of `/unlock-pdf` at 360px and 1280px, light, of: empty; listed (restricted file) with the button ready; password field; wrong password; working; result; nothing to remove; certificate file; failed. At 360px, dark: password field and result; at 360px, 200% text: password field, with nothing overflowing sideways. Put them in `.github/pr-screenshots/unlock/`. Verify by looking at each, and against "Banned patterns".

## 9. Checks and review

- [x] 9.1 `LICENSES.md`: confirm no change is needed, as no dependency is added.
- [x] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, `check:csp`, end-to-end tests, `npm audit` and `npm run spec`. Verify each passes.
- [x] 9.3 Add Unlock's hand checks to issue #7 (the comment text is in `issue-7-hand-checks.md` in this change, for the program manager to post): the result opened with no password, and printed and copied from, in Chrome, Firefox, Adobe Reader and macOS Preview; a certified file (`/Perms` with `/DocMDP`) written and opened in Adobe Reader, to see whether its certification still limits it; browsers and phones; a screen reader on the password field; the owner's review of the page text; the multilingual test file, which must exist and be run before Unlock is called done.
- [x] 9.4 When the pull request opens, name in it: the three shared changes (input passwords forgotten after a result, `readPdf`, only the latest read of a file shown, with its reproducing test); no hook-level test of the `forgetInputPasswords` wiring; `noSmaller` reused as named; certificate files still called damaged by other tools; "nothing to remove" found only after the main button; the home filter not finding "unlock" or "decrypt"; that the certificate match on qpdf's words picks wording only; the console watch's gap for PDF.js's nested worker; the Privacy page facts of the design's section 6; that Unlock cannot be called done until the multilingual test file exists. No owner question is added to `CLAUDE.md`: the four are answered there under "Unlock PDF's words". Also name, beside the owner's "Redoing a signature" question, that a "Go back to your file" added to a result later would have to ask for the input password again, since it is now forgotten after a result.
- [x] 9.5 Run the review panel (see the review-panel skill), stage 2, and resolve its findings. The pull request names the agent's choices listed in the proposal and does not call the tool done.

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`.
- Add Unlock to "Where the project stands" in `CLAUDE.md`, saying that the input-password rule changed for every tool (forgotten when a job gives a file or no new file; entry 19's "kept while that file is listed" no longer holds after a result), and carrying forward the Privacy page facts of the design's section 6 and that Unlock is not done until the multilingual test file exists and it has been run on it. With Unlock, every Phase 1 tool is built; the Phase 1 gate still needs every tool to pass "Definition of done" and the owner's About page.
