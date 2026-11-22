# Tasks

Built on `add-password-option` (PR #28), merged first.

## 1. Registry entry

- [ ] 1.1 Add the `protect-pdf` entry to `src/tools/registry.ts` as the design's decision 1 gives it (after Sign PDF, first under "Protect", one `new-password` option keyed `newPassword` with its words and no `refusedSentence`, no preset), its line `'protect-pdf': { newPassword: { maxLength: 127, characters: 'printable-ascii' } }` in `optionPasswords` in `src/widget/option-values.ts`, and change the one assertion in `tests/unit/options.test.ts` that expects `optionPasswords` to be empty; verify with `npm test` (catalogue order, the new-password checks from `add-password-option`, the hint ending with `passwordAdvice` and naming 127) and that the built home page lists "Protect with a password" first under "Protect" and Watermark's and Sign PDF's pages now link to it

## 2. Engine

- [ ] 2.1 Write `src/engines/tools/protect-pdf.ts` as the design's decisions 2 to 6 give it: one file only; `acceptedPassword` before any work, throwing `PasswordRefused`; `protectLimit` and `writeProtected` exported; one qpdf call with `--progress`, `passwordArgsFor(old)`, `--object-streams=generate`, `--encrypt --user-password=P --owner-password=P --bits=256 --`, in the in-memory argument list only; the cap with `capFile` and `refused`, throwing `OutputLimit` imported from `../stamp`; the check on a fresh qpdf (JSON `encrypt` R 6, V 5, AESv3 three times, every capability; `--check` with the password; refused without it); progress reading, writing scaled to 90, then 100; fixed error sentences that never hold qpdf's printed text or a password; `inspect` is `inspectPdf`; no change to shared engine files; verify with `npm run lint`, `npm run check` and the tests in 3.1

## 3. Engine unit tests

- [ ] 3.1 `tests/unit/protect-pdf.test.ts` as the design's Tests list it: refusals before qpdf is asked for; the argument list and the engine's source with none of `--cleartext-metadata`, `--allow-insecure`, `--allow-weak-crypto`, `--show-encryption`; `run` on every file in `tests/fixtures/` (check, R 6 and AESv3, every capability, opens with the password only in qpdf and PDF.js, pages and text as before, the password not in the bytes, bookmarks, link, attachment, fields and values, tags, destination, thread, sizes and turns kept, `password.pdf` and `restricted.pdf` with the new password only, `warning.pdf`, the damaged files and `not-a-pdf.pdf` failing); the title and XMP file made in the test; `tagged.pdf`'s markers with `SECRET-DEST-NAME` recorded as the one readable name; an RC4 file made in the test; two runs giving different keys; progress order; the output cap with a fake qpdf and with a real file under a small limit; verify the tests pass, then record each fixture's outcome in `tests/fixtures/README.md` under a new "Protect with a password" table, with the readable-name finding and the multilingual file still missing
- [ ] 3.2 Measure time, output size and peak memory on `pages-500.pdf`, the 120,000-page file of `make-many-pages.mjs` and `make-large.mjs`'s file, in Node and in Chromium, with and without the check of decision 4; verify the numbers are in the fixtures README and that no genuine file comes near the cap; if the check more than doubles the time on the largest file, raise it in the pull request

## 4. Worker wiring

- [ ] 4.1 Confirm `tool.worker.ts` already gives `qpdf` and the worker maps `PasswordRefused` and `OutputLimit` with no change; confirm `check-worker.mjs` finds the engine, that it loads late and stays out of the worker file (by a sentence from its source), and that `page-weight.mjs` needs a `loadedLater` line only for a new chunk; verify with `npm run build`, `npm run check:worker` and `npm run weigh`

## 5. Page and page text

- [ ] 5.1 Check the page renders with its heading, sentence, title and description, and that once the file is read the two empty fields show with the hint (cannot-be-recovered sentence first) and the shared note, focus in the first, and the main button waits with "Type a password first."; verify with the built page and a component test with this entry
- [ ] 5.2 Write `src/content/tools/protect-pdf.md`, 250 to 500 words, marked as a draft, covering the design's section 8, with "A short password can be guessed by anyone who has the file." word for word, the browser's offer to save or suggest the password and that a saved one may be copied to the browser account, signatures, an earlier password and restrictions replaced, and what a password does not hide; privacy words saying only what the page controls; no "unlock", no "100%", no capitals for emphasis, no question that restates the title; check it against "Banned patterns"; verify the built page holds the heading, sentence, steps and questions with scripts off

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/protect-pdf.spec.ts` at 360px and 1280px:
  - choosing a file: one row, no summary line, no Remove, "Getting ready" seen with the engine's route held until checked, the status line, focus in "New password" once read; two files dropped; not a PDF;
  - the fields: labels, `type="password"`, `autocomplete="new-password"`, no `name`, no `maxlength`, in no form; the hint beginning "If you forget this password" and the shared note in the first field's description; Tab order first field, second field, "Choose another file", main button;
  - holding: empty ("Type a password first."), typed once and part-typed again ("Type the password again to check it.", no field marked), different (second field marked, its sentence, said once), "café" and a 128-character paste (first field marked, the shared sentence, kept whole), a space at the end shown only on leaving the field; a press while waiting starts no job; Enter while waiting says why on every press;
  - protecting `text.pdf` with "Kv4 #%@ wq9" by Enter in the second field: the download is `text-protected.pdf`, passes `qpdf --check` with the password, opens in PDF.js with it and not without, and does not hold the password;
  - progress "Reading the file" and "Writing the protected file"; Cancel keeping both fields and the main button ready; a failure from a fake engine (memory, output-limit, password-refused saying "The password could not be used. Go back to your file and type it again."); engine-load failure; "Go back to your file" keeping both fields with focus on the main button;
  - forgetting: after the result both fields are empty for the next file; "Start again" empties them; "Choose another file" keeps them; a second file that needs its own password, then "Choose another file" at its field, empties them; leaving the page and coming back with Back holds no file and no password;
  - in the real browser, after typing in both fields, neither input has a `value` attribute and `document.documentElement.outerHTML` does not hold the password;
  - password right and wrong for `password.pdf`, focus moving to "New password" once it opens; damaged files;
  - the 100 MB notice; the 20,000-page notice on the generated 120,000-page file, typing in the fields blocking nothing for more than 100 ms;
  - verify it passes, with the other tools' e2e tests unchanged

## 7. No-upload test

- [ ] 7.1 The tool's no-upload test: its exact allowlist from the build (the engine, `plain`, `inspect`, the shared chunk with the option values, no pdf-lib, no other tool's engine), positive checks that the engine was fetched and a download happened; `qz7report.pdf` (a copy of `password.pdf`), its stem, `open-sesame`, the new password `Qz7 pw#%@ Kv4` and its parts (`Qz7`, `pw#%@`, `Kv4`), plain and URL-encoded, as secrets for requests, headers, the page's console, the worker's console (`page.on('worker')`, then each worker's `console` events), the title, storage and the address; page errors recorded (`page.on('pageerror')`) and none allowed; the downloaded file's bytes do not hold the password; runs on `rich.pdf`, `tagged.pdf` and `form.pdf` with their markers as secrets; if the shared chunk's name changed, the other tools' allowlists updated with their checks unchanged; verify all pass

## 8. Screenshots

- [ ] 8.1 Screenshots of `/protect-pdf` at 360px and 1280px, light and dark: empty, getting ready, listed with empty fields and the waiting button, typed once, different, refused characters, both matching, working, result, input password, damaged, failed, the 20,000-page notice; the listed states with an error and the result at 200% text size, with nothing overflowing sideways; verify by looking at each and adding them to the change folder

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: no change, as no dependency is added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `npm run spec`; verify each passes
- [ ] 9.3 Add Protect's hand checks to issue #7: the result opened with the password and refused without it in Chrome, Firefox, Adobe Reader and macOS Preview; browsers and phones, including each browser's offer to save or suggest the password and whether the on-screen keyboard opens when focus moves to the field; a screen reader on the two fields; the owner's review of the page text
- [ ] 9.4 When the pull request opens, add to "Questions waiting for the owner" in `CLAUDE.md` the two questions from the proposal (old restrictions; where the short-password sentence goes), and in the pull request list for the program manager: the Content Security Policy as an open scheduling point (before Protect is published, or before launch), and the Privacy page facts of the design's section 7 for the Phase 1 site-work change
- [ ] 9.5 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (the same password for opening and permissions; every permission allowed; object streams generated; old restrictions dropped; the check before giving the file back; the output cap; the hint's and the result's words; `-protected`), the readable-names finding, the PR #28 owner questions now on a live page, the missing multilingual test file, and next steps as a site-wide gap; it does not call the tool done

## Workflow follow-up

- After merge, archive the change with `/opsx:archive` and add Protect to "Where the project stands" in `CLAUDE.md`.
