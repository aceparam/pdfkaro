# Tasks

Built on `add-password-option` (PR #28), merged first. Two shared changes and one hook seam ride along by the coordinator's decision (stage 1): the `NewPasswordField` layout (group 2), `OutputLimit` and `cappedWrite` in `qpdf.ts` (group 3) and the job step as a plain function (group 6). Each is named in the pull request as a shared change that alters no published page.

## 1. Registry entry

- [x] 1.1 Add the `protect-pdf` entry to `src/tools/registry.ts` as the design's decision 1 gives it:
  - after Sign PDF, first under "Protect";
  - the page sentence and meta description that make no claim about the password staying on the device;
  - one `new-password` option keyed `newPassword`, with the four-sentence hint and no `refusedSentence`;
  - three result notes, with no short-password sentence among them;
  - no preset.

  Add its line `'protect-pdf': { newPassword: { maxLength: 127, characters: 'printable-ascii' } }` to `optionPasswords` in `src/widget/option-values.ts`. Change the one assertion in `tests/unit/options.test.ts` that expects `optionPasswords` to be empty. Verify:
  - `npm test` passes: catalogue order, the new-password checks from `add-password-option`, and the hint ending with `passwordAdvice` and naming 127;
  - the built home page lists "Protect with a password" first under "Protect";
  - Watermark's and Sign PDF's pages now link to it.

## 2. Shared: the new password's layout and Enter

- [x] 2.1 Change `src/components/NewPasswordField/NewPasswordField.tsx` and its CSS Module as the design's decision 2 gives it:
  - only the tool's hint under the first field;
  - the shared note as its own paragraph after the second field, with an id;
  - the first field's `aria-describedby` naming its error (when there is one), the hint and the note;
  - `enterkeyhint="next"` on the first field, `"go"` on the second;
  - still uncontrolled, with no `value` attribute.

  Add the `next-field` answer to `enterAction` in `src/widget/options.ts`: for a new password's first field holding a password with no problem. Otherwise it gives today's answers, and a quiet trailing space is shown. Make `ToolWorkspace` move focus to the second field on it. Verify with unit tests for `enterAction`, and with component tests for the markup and order, including that Enter in the first field calls the handler with its field and a composing Enter does not.

## 3. Shared: the capped write

- [x] 3.1 Move `OutputLimit` into `src/engines/qpdf.ts`, and add `writePercent` and `cappedWrite` there as the design's decision 5 gives them. `src/engines/stamp.ts` re-exports `OutputLimit`, and `writeUpdate` uses `cappedWrite` with no change in behaviour. Leave `merge-pdf.ts` as it is. Verify:
  - the `cappedWrite` unit tests pass with a fake qpdf, covering a refused write, a no-space print, exit 0 past the limit, an unfinished exit keeping `/in.pdf`, and a passing write removing `/in.pdf` with progress in order and not repeated;
  - every existing `stamp.test.ts`, Add page numbers, Watermark and Sign PDF test passes unchanged;
  - the worker still gives `output-limit` for an `OutputLimit` thrown from either file.

## 4. Engine

- [x] 4.1 Write `src/engines/tools/protect-pdf.ts` as the design's decisions 3, 4, 7 and 8 give it:
  - one file only;
  - `acceptedPassword` before any work, throwing `PasswordRefused`;
  - `protectArgs`, `protectLimit` and `protectedBytes` exported;
  - one qpdf call in the in-memory argument list only, through `cappedWrite`, so `/in.pdf` is removed before the output is read, and the writer is local to `protectedBytes`;
  - the check on a fresh qpdf: JSON `encrypt` with R 6, V 5, AESv3 three times and every capability; `--check` with the password; refused without it;
  - progress: reading, then writing scaled to 50, then 55, 95 and 100 after each check step (stage 2: the check with the password takes about as long as the write);
  - fixed error sentences that never hold qpdf's printed text or a password;
  - `inspect` is `inspectPdf`.

  No other engine file changes beyond group 3. Verify with `npm run lint`, `npm run check` and the tests in 5.1.

## 5. Engine unit tests

- [x] 5.1 Write `tests/unit/protect-pdf.test.ts` as the design's Tests list it:
  - refusals before qpdf is asked for;
  - `protectArgs` and the engine's source holding none of `--cleartext-metadata`, `--allow-insecure`, `--allow-weak-crypto` or `--show-encryption`;
  - `run` on every file in `tests/fixtures/`:
    - the result passes the check and reports R 6, AESv3 and every capability;
    - it opens with the password only, in qpdf and PDF.js;
    - pages and text are as before, and the password is not in the bytes;
    - kept: bookmarks, link, attachment, fields and values, tags, destination, thread, sizes and turns;
    - `password.pdf` and `restricted.pdf` come back with the new password only, and `open-sesame` is not in `password.pdf`'s result;
    - `warning.pdf` is protected;
    - the damaged files and `not-a-pdf.pdf` fail;
  - the title and XMP file made in the test;
  - `tagged.pdf`'s markers, with `SECRET-DEST-NAME` recorded as readable, and recorded the same way `/Width` on `images.pdf`'s result, the attached file's `/Subtype` on `rich.pdf`'s and `/Helvetica` on `form.pdf`'s; no `/MediaBox` readable in any result, and `note.txt` not readable in `rich.pdf`'s;
  - an RC4 file made in the test;
  - two runs giving different keys;
  - the order of progress;
  - the cap, with a real file under a small limit;
  - no error holding either marked password.

  Verify the tests pass. Then record each fixture's outcome in `tests/fixtures/README.md` under a new "Protect with a password" table, with what stays readable and a note that the multilingual file is still missing.
- [x] 5.2 Measure time, output size and peak memory on `pages-500.pdf`, the 120,000-page file of `make-many-pages.mjs` and `make-large.mjs`'s 100 MB file, in Node and in Chromium. Record separately how long the check of decision 4 takes on each. Verify:
  - the numbers are in the fixtures README;
  - no genuine file comes near the cap;
  - the peak on the 100 MB file shows the input let go before the output is read.

  If the check more than doubles the time on the largest file, raise it in the pull request.

## 6. Worker wiring and the job step

- [x] 6.1 Confirm `tool.worker.ts` already gives `qpdf`, and that the worker maps `PasswordRefused` and `OutputLimit` with no change. Move the body of `useToolRun`'s `start` into `runJob` in `src/hooks/run-job.ts`, as the design's decision 6 gives it: it returns the outcome with no finish callback, and `start` does the dispatches and the object URL, with no change in behaviour. Write `tests/unit/run-job.test.ts` with a fake client. Verify:
  - the new password holder is `{}` after a run that gives a file and after one that gives no new file, before anything else clears it;
  - it still holds the password after an engine failure, a run that throws and a cancel.
- [x] 6.2 Accept the new shared file:
  - add an `option-values` line to `loadedLater` in `scripts/page-weight.mjs`, and change the `stamp` line's description so it no longer claims the option values;
  - update the exact allowlists in `tests/e2e/add-page-numbers.spec.ts`, `watermark-pdf.spec.ts` and `sign-pdf.spec.ts` to include `option-values-*.js`, and any other allowlist the build changes, with their other checks unchanged;
  - confirm `check-worker.mjs` finds the engine, and that the engine loads late and stays out of the worker file, by a sentence from its source; adjust the script's shared-step sentences if `cappedWrite`'s move changes which file holds them.

  Verify with `npm run build`, `npm run check:worker` and `npm run weigh`, and that the three tools' no-upload tests pass.

## 7. Page and page text

- [x] 7.1 Check the page renders with its heading, sentence, title and description. Once the file is read, check that:
  - the two empty fields show, the four-sentence hint under the first and the note under the second;
  - focus is in the first field;
  - the main button waits with "Type a password first.".

  Verify with the built page and a component test with this entry.
- [x] 7.2 Write `src/content/tools/protect-pdf.md`, 250 to 500 words, marked as a draft, covering the design's section 10:
  - "A short password can be guessed by anyone who has the file." word for word;
  - the browser's offer to save or suggest the password, and that a saved one may be copied to the browser account;
  - one question on what changes and what stays;
  - signatures;
  - an earlier password and restrictions being replaced;
  - what a password hides and does not hide: the file's name, whether it has bookmarks, attached files or a form, rough size, each picture's pixel size and format, each attached file's type and size, font names, the size of some drawn parts, such as form-field boxes, and, in a file that already has page numbers, a watermark or a signature added on this site, each page's size, and some other names stay visible, as a plain bulleted list; pages, text, what pictures show and the names and contents of attached files do not; it never says pictures or attached files are hidden as a whole (wording a draft for the owner).

  The privacy words say only what the page controls. No "unlock", no "100%", no capitals for emphasis, and no question that restates the title. Check it against "Banned patterns". Verify that the built page holds the heading, sentence, steps and questions with scripts off, and that the word count is within range.

## 8. End-to-end test

- [x] 8.1 Write `tests/e2e/protect-pdf.spec.ts`, at 360px and 1280px:
  - **Choosing a file:**
    - one row, no summary line, no Remove;
    - "Getting ready" seen, with the engine's route held until it is checked;
    - the status line;
    - focus in "New password" once the file is read;
    - two files dropped; not a PDF.
  - **The fields:**
    - labels, `type="password"`, `autocomplete="new-password"`, no `name`, no `maxlength`, in no form;
    - `enterkeyhint` "next" then "go";
    - the hint, beginning "If you forget this password", as the only text between the fields;
    - the note after the second field and in the first field's description;
    - at 360px, the second field's label starts within 200px of the first field's bottom;
    - Tab goes first field, second field, "Choose another file", main button.
  - **Enter:**
    - Enter in the first field with an accepted password moves focus to the second and starts no job;
    - Enter in the first field when it is empty or holds "café" says why and stays;
    - Enter in the second field starts the job when both match.
  - **Holding:**
    - empty: "Type a password first.";
    - typed once, and part-typed again: "Type the password again to check it.", with no field marked;
    - different: the second field marked, its sentence said once;
    - "café", and a pasted 128 characters kept whole: the first field marked, with the shared sentence;
    - a space at the end shown only on leaving the field;
    - a press while waiting starts no job.
  - **Protecting `text.pdf` with "Kv4 #%@ wq9":**
    - the download is `text-protected.pdf`;
    - it passes `qpdf --check` with the password;
    - it opens in PDF.js with the password and not without;
    - it does not hold the password.
  - **Progress, Cancel and failures:**
    - progress "Reading the file" and "Writing the protected file", the bar never going back;
    - Cancel keeps both fields and leaves the main button ready;
    - failures from a fake engine: memory, output-limit, and password-refused saying "The password could not be used. Go back to your file and type it again.";
    - an engine that cannot be fetched;
    - "Go back to your file" keeps both fields, with focus on the main button.
  - **No password in the markup.** In the real browser, after typing in both fields, after Cancel and after "Go back to your file", neither input has a `value` attribute and `document.documentElement.outerHTML` does not hold the password.
  - **Forgetting:**
    - after the result, both fields are empty for the next file;
    - "Start again" empties them;
    - "Choose another file" keeps them;
    - choosing a second file that needs its own password, then pressing "Choose another file" at its password field, empties them;
    - after typing in both fields, as `merge-pdf.spec.ts` does in its "leaving the page" test, dispatch `new PageTransitionEvent('pagehide', { persisted: true })`; in the same `evaluate`, no password input remains or each `.value` is empty, and the page's HTML does not hold the password;
    - a separate test: leaving and coming back with Back shows no file.
  - **Other states:**
    - for `password.pdf`, the right and a wrong password, with focus moving to "New password" once it opens;
    - damaged files;
    - the 100 MB notice;
    - the 20,000-page notice on the generated 120,000-page file, with typing in the fields blocking nothing for more than 100 ms.

  Verify it passes, with the other tools' e2e tests passing, changed only by task 6.2.

## 9. No-upload test

- [x] 9.1 Write the tool's no-upload test:
  - **The allowlist** is exact, read from the build: the engine, `plain`, `inspect`, `option-values`, qpdf, the worker and workspace, and PDF.js for the thumbnail. No `stamp`, no pdf-lib, no `fflate`, no other tool's engine.
  - **Positive checks:** the engine was fetched, and a download happened.
  - **Secrets:** `qz7report.pdf` (a copy of `password.pdf`), its stem, `open-sesame`, and the new password `Qz7 pw#%@ Kv4` with its parts `Qz7`, `pw#%@` and `Kv4`, plain and URL-encoded. They must not appear in requests, headers, the title, storage or the address.
  - **The consoles:** `page.on('worker')` is attached before `open(page)`, and each worker's `console` events are listened to. For the page's and each worker's messages, both `text()` and the serialised `args()` are checked. Uncaught worker errors are covered by the engine's fixed-sentence unit test.
  - **Page errors** are recorded with `page.on('pageerror')`, and none are allowed.
  - **The download:** its bytes do not hold the new password or `open-sesame`.
  - **Further runs** on `rich.pdf`, `tagged.pdf` and `form.pdf`, with their markers as secrets.

  Verify all pass.

## 10. Screenshots

- [x] 10.1 Take screenshots of `/protect-pdf` at 360px and 1280px, light and dark, of these states:
  - empty and getting ready;
  - listed with empty fields and the waiting button;
  - typed once, different, refused characters, both matching;
  - working, result;
  - input password, damaged, failed;
  - the 20,000-page notice.

  Also take a 360 × 640 screenshot with focus in the first field, showing both fields and the hint above the fold. Take the listed states with an error, and the result, at 200% text size, with nothing overflowing sideways. Verify by looking at each.

  Every state above, in each width and scheme, was taken and checked at commit 50251ca, before the hint changed; nothing scrolled sideways. To keep the folder small (coordinator, stage 2), the pull request carries these 19, taken again after the hint change and the stage 2 page text, in `.github/pr-screenshots/protect-pdf/`:
  - at 360px and 1280px, light: empty, listed, typed once, different, result and failed;
  - at 360px, light: refused characters and both matching;
  - at 360 × 640, light and dark: focus in the first field, with the first label near the top, both fields, the hint and the note above the fold;
  - at 360px, dark: result and different;
  - at 360px, light, 200% text: different.

## 11. Checks and review

- [x] 11.1 `LICENSES.md`: no change, as no dependency is added.
- [x] 11.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `npm run spec`. Verify each passes.
- [x] 11.3 Add Protect's hand checks to issue #7:
  - the result opened with the password and refused without it, in Chrome, Firefox, Adobe Reader and macOS Preview;
  - browsers and phones, including each browser's offer to save or suggest the password, the "Next" and "Go" keys, and whether the on-screen keyboard opens when focus moves to the field;
  - a screen reader on the two fields, checking the note is read with the first;
  - the owner's review of the page text;
  - the multilingual test file, which must exist and be run before Protect is called done.
- [x] 11.4 When the pull request opens:
  - add the two questions from the proposal to "Questions waiting for the owner" in `CLAUDE.md`;
  - add Protect, with its three shared changes, as another instance under "Shared pieces in tool pull requests" in `CLAUDE.md`;
  - in the pull request, name the shared changes (the `NewPasswordField` layout and Enter, `OutputLimit` and `cappedWrite` in `qpdf.ts`, `runJob`) and the new `option-values-*.js` file with the three allowlists it changes;
  - name the program manager's CSP decision: the CSP change comes straight after Protect, before Unlock PDF, as a `<meta>` tag with no `frame-ancestors` on GitHub Pages, and it blocks launch and the Phase 1 gate;
  - list the Privacy page facts of the design's section 9 for the Phase 1 site-work change;
  - say that the branch also carries the `add-password-option` archive commit (64271b5);
  - say that Protect cannot be called done until the multilingual test file exists.
- [x] 11.5 Run the review panel (see the review-panel skill) and resolve its findings. The pull request names:
  - the agent's choices: the same password for opening and permissions; every permission allowed; object streams generated; old restrictions dropped; the check before giving the file back, with its progress steps; the output cap; the hint's and the result's words; `-protected`;
  - the finding on what stays readable;
  - the PR #28 owner questions, now on a live page;
  - the missing multilingual test file;
  - next steps, as a site-wide gap.

  It does not call the tool done.

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`.
- Add Protect to "Where the project stands" in `CLAUDE.md`. Its entry carries forward:
  - that the Content Security Policy change comes next, before Unlock PDF, as a `<meta>` tag with no `frame-ancestors`, blocking launch and the Phase 1 gate;
  - the Privacy page facts of the design's section 9, for the Phase 1 site-work change;
  - that Protect is not done until the multilingual test file exists and Protect has been run on it.
