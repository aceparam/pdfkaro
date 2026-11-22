# Tasks: add-uniform-requests

## 1. Registry and dependencies

- [ ] 1.1 Confirm that no registry entry changes and no dependency is added. Verify at the end that `git diff main --stat` shows no change to `src/tools/registry.ts`, `package.json`, `package-lock.json` or `LICENSES.md`.

## 2. Engine declarations

- [ ] 2.1 Define `LibraryName` in `src/engines/types.ts`. Add `src/workers/libraries.ts` (design.md, decision 3), importing it, with the canonical order and the `toolLibrary` table (`satisfies Record<keyof typeof tools, LibraryName | 'always'>`; `'pdfjs'` covers `pdfjs`, `pdfjsData` and the `thumbnail` import). Add a required `loads: { read; job }` to `EngineModule` in `src/engines/types.ts`, with a comment saying the sets are chosen by tool, never by a file, and that the draw set follows from `thumbnails`. Verify `npm run check` reports only the engines still to be declared.
- [ ] 2.2 Declare `loads` in each of the 14 files in `src/engines/tools/` as in design.md, decision 2. Verify `npm run check` passes and `npm test` passes as before (no engine's output changes).
- [ ] 2.3 Write `tests/unit/engine-loads.test.ts` (design.md, decision 11). For every engine it runs `inspect`, `inspectPicture` where there is one, and `run` against every file in `tests/fixtures/`, with `pictures/` for Image to PDF and Sign PDF's picture. It uses a valid option table and a recording `tools` filled from disk. It fails when:
  - a step asks for a library outside its declared set;
  - `loads` is missing;
  - a registry tool with `outputs: 'several'` lacks `fflate` in `job`.

  Allow `'always'` keys everywhere. Verify `npm test` passes, and that it fails when `compress-pdf`'s `job` drops `fflate` (try this locally, do not commit it).
- [ ] 2.4 Record, from 2.3, each engine's outcome for each fixture, in the pull request's description: which libraries it asked for, and whether it gave a file, no file or a failure. Verify that every fixture appears for every engine.

## 3. Worker wiring

- [ ] 3.1 In `src/workers/pdfjs-loader.ts` (design.md, decision 10):
  - start PDF.js's nested worker in the same step as the PDF.js import;
  - attach its `onerror` (`preventDefault`, failed) as soon as `startWorker()` returns;
  - terminate it if the import rejects;
  - hand over the port once the import resolves.

  Verify the existing `pdfjs-loader` unit tests pass, plus new ones for each of: the worker starts before the import resolves; an early nested error leaves PDF.js failed; a rejected import terminates the nested worker.
- [ ] 3.2 Write `src/workers/spare-qpdf.ts` (design.md, decision 6), a plain function tested in Node. Loading `'qpdf'` makes one instance and keeps it. The next `tools.qpdf()` takes it, unused, and clears it. Later calls make new instances. Verify with a unit test with a made-up factory: first call gets the spare, second gets a new instance, and a spare is never handed out twice.
- [ ] 3.3 Load `fflate` as one library giving `Inflate`, `Deflate` and `zipSync` (design.md, decision 5), imported from the package in `tool.worker.ts` (a re-exporting `src/workers/fflate.ts` made a built file of its own, so it is not used). Remove `loadZip` from `WorkerDeps` and take `zipSync` from the loaded `fflate` library. Verify the existing zip tests in `worker-core.test.ts` pass with the new dependency.
- [ ] 3.4 In `src/workers/tool.worker.ts`, give the worker core its libraries by name:
  - `qpdf`: the spare from 3.2.
  - `fflate`: the package, from 3.3.
  - `pdflib`.
  - `pdfjs`: `pdfjsLoader.load()`, `pdfjsData` and `import('../engines/thumbnail')`.
  - `pictureThumbnail`: `import('../engines/picture-thumbnail')`.

  Check `tools` with `satisfies` against `toolLibrary`. Verify `npm run lint`, `npm run check`, and, after `npm run build`, `npm run check:worker` and `npm run check:csp`.
- [ ] 3.5 In `src/workers/messages.ts`, add `prepare`, `prepared` and `drop-thumbnail` (no file, no password), with their checks in `isToWorker` and `isFromWorker`. Verify unit tests: a `prepare` or `drop-thumbnail` carrying a file or password key is refused, and well-formed ones are accepted.
- [ ] 3.6 In `src/workers/worker-core.ts`, add `ready(phase)` as in design.md, decisions 3 to 5 and 7:
  - Load the engine first.
  - Start the read (or job) libraries in the canonical order in one synchronous step, and wait for them.
  - In the read phase, start the draw set from `thumbnails` after that and catch its failures, without waiting.
  - Only then copy any file.
  - Post `prepared` once, when the draw set has settled.
  - Post a read's or picture read's `failed` only after `prepared`, held to 60 seconds.
  - Answer `drop-thumbnail` by giving a waiting thumbnail no picture, and record the dropped id: after the libraries load and before `openDocument`, a dropped request returns without opening anything.
  - Hand engines, for each phase, `tools` that refuse undeclared keys, so the step fails as `engine-load`.

  Verify the new `worker-core.test.ts` tests of design.md, decision 11 (among them: a thumbnail dropped while its library is loading never calls `openDocument`), and that every existing `worker-core` and `thumbnail-plumbing` test passes.
- [ ] 3.7 In `src/workers/client.ts` (design.md, decision 7), add:
  - `prepare()`;
  - a per-worker settled flag set by `prepared`;
  - the thumbnail limit started only once settled, and a thumbnail asked for before then waiting at most 60 seconds for the set;
  - `dropThumbnail()`;
  - `endWhenSettled()`, which waits for `prepared` or 60 seconds; `end()` still ends at once, a waiting worker included.

  Verify `client.test.ts`: `prepare` posts no file and resolves on `prepared`; the thumbnail limit does not end a worker whose set has not settled, and does once it has; `endWhenSettled` waits; `end()` ends at once.
- [ ] 3.8 Add the `check:worker` rule of design.md, decision 11: the draw-set chunks (`pdf`, `pdfjs-data`, `thumbnail`, `picture-thumbnail`) statically import nothing the worker and the engine do not already load. Verify `npm run build && npm run check:worker` passes, and fails if `thumbnail.ts` is made to import a new module (try this locally, do not commit it).

## 4. Page wiring

- [ ] 4.1 In `src/hooks/useToolRun.ts`, have `addFiles` call `prepare()` before it looks at the files. Make `stopThumbnail` use `dropThumbnail()` before the set has settled and end the worker only after, as today. Make `endReplacedRead` use `endWhenSettled()` and start the new read after it. Verify `npm run check`, and the client tests of 3.7.
- [ ] 4.2 Build the wrong-kind wait (design.md, decision 9), in `useToolRun` and `ToolWorkspace`:
  - the file's line with "Getting ready" and its Remove button, or the summary line with "Getting ready" for several files;
  - focus on that line (`summaryRef`, `tabIndex={-1}`);
  - the wait ends on `prepared`, at once on a failed set load, or after 60 seconds;
  - then the picker returns with the refusal sentence read out in the status line, and focus on the picker;
  - Remove ends the wait and the worker.

  Verify by the e2e check of 6.4 and by keyboard by hand (Tab reaches Remove; focus moves as described).
- [ ] 4.3 In `useToolRun.start`, end the reading worker (`client.end()`) before `runJob`, so every job runs in a fresh worker. Update the comment. Verify `thumbnails.spec.ts` ("with PDF.js held back, Merge and download merges at once", and the main button while a thumbnail is drawn) and every tool spec still pass.
- [ ] 4.4 Update the `why` text of `fflate`, `pdf`, `pdf.worker.min`, `pdfjs-data`, `thumbnail` and `picture-thumbnail` in `scripts/page-weight.mjs` to say when each is now fetched. Verify `npm run build && npm run weigh` passes, and record the before-pick totals and the "after a pick, at most" total before and after the change in the pull request.
- [ ] 4.5 Measure in Chromium, at normal speed and at 4× CPU slowdown, on Merge PDF, PDF to JPG and Sign PDF (R13):
  - the extra time to start a job in a fresh worker, with `text.pdf` and with the 100 MB file from `make-large.mjs`;
  - peak memory right after the main button on the 100 MB file;
  - the memory of PDF.js's idle nested worker after a pick of `damaged-xref.pdf`;
  - the spare qpdf's memory in a worker that never calls qpdf.

  Verify the numbers are in the pull request. If the job start adds more than 200 ms on a desktop for any of the three, stop and report it.

## 5. Privacy page text

- [ ] 5.1 Add the draft sentences of design.md, decision 12, to `src/pages/privacy.astro`, one paragraph under "What happens to your file" and one at the end of "Who serves the site". Mark them for the owner. Keep the "more than once" sentences unless the owner has answered Open question 1 otherwise. Verify:
  - `tests/unit/privacy-page.test.ts` passes (absolute words, banned words, no worker outside the policy section, server guard);
  - `npm run build && npm run check:seo` passes (the draft line on an unwritten page);
  - the page is checked against "Banned patterns" in `SPEC.md`.
- [ ] 5.2 Once the code is built, read the three claim rows in design.md, decision 12, against it, and check every Privacy sentence against the named exceptions in Risks: no sentence may claim an order, identical requests, or a case in Risks closed. Correct any row or word that does not match. Verify each row names code that exists and a test that passes.

## 6. End-to-end

- [ ] 6.1 Write `tests/e2e/host-log.ts` as in design.md, decision 11:
  - `127.0.0.1` and a free port; `GET` and `HEAD` only;
  - decode the path once, refuse NUL, and refuse any real path outside `dist/`;
  - clean URLs, the 404 page, GitHub Pages' content types;
  - `Cache-Control: max-age=600`, `ETag` and `Last-Modified`, and 304 on `If-None-Match`;
  - no CORS headers;
  - `mark()` to split phases;
  - a slow mode holding P's files for 12 seconds.

  Verify with a self-test using the same fixtures from `tests/e2e/fixtures.ts`:
  - a page loaded twice in one context records its scripts once;
  - a matching `If-None-Match` gets 304;
  - `/%2e%2e/package.json` and a NUL are refused;
  - `POST` is refused;
  - slow mode delays a P file by about 12 seconds.
- [ ] 6.2 Write `tests/e2e/tool-files.ts`. It builds each tool's exact list of files from a `LibraryName` → built-file pattern table, the shared files, and the static imports the engine's built chunk names in `dist/`. Replace the 14 hand-written lists in the tool specs with it. Verify every tool spec's no-upload test passes, with each built list equal to the hand-written one it replaces, or the difference explained in the pull request.
- [ ] 6.3 Write `tests/e2e/uniform-requests.spec.ts`, tagged `@desktop`, with one test per page in `widgetPages` and the input table of design.md, decision 11.
  - Each input runs in a new context with `watchPolicy`, and no `route` or `routeFromHAR`.
  - Job inputs double as pick inputs; duplicates are dropped.
  - A phase ends when every request expected from `tool-files.ts` has arrived and none is open, then `quietMs`. The job phase's expected set is the job libraries not already fetched at the pick; the rest come from the cache.
  - Compare the pick multiset, nothing new after a password, and the job multiset, with "expected X, got Y" messages.
  - A page with no row fails.

  For each page, look in `tests/fixtures/README.md` and the tool's spec for an input whose job fails in the browser, and add it if there is one; name the pages without one in the pull request. Verify the spec passes, and that it fails, naming `/compress-pdf`, when `compress-pdf`'s `needsLossless` gate on `fflate` is put back locally (do not commit it).
- [ ] 6.4 Add the slow-mode cases (R2) to the spec: `text.pdf` against `damaged-xref.pdf` on `/merge-pdf`, and one file against three on `/merge-pdf`, each failing if a request differs or repeats. Add, in its own context in slow mode and outside the comparisons, the wrong-kind "Getting ready" check: the line, its Remove button, focus on it, then the sentence and focus on the picker. Verify both pass, and that the slow-mode case fails when the thumbnail limit is put back to count from the send (try locally, do not commit).
- [ ] 6.5 Update existing end-to-end checks that now contradict the rule. Fold `pdf-to-images.spec.ts` "a one-page file fetches fflate too, and the same files as a longer one" into the new spec, and fix any check that `fflate` or PDF.js is absent after a pick or a job in a case that now fetches it. Keep checks that a file is absent before a pick or before the main button. Verify `npm run build && npm run e2e -- --trace off` passes.
- [ ] 6.6 Record the new spec's run time in CI and locally in the pull request. Verify the time is recorded. If it passes about 5 minutes, stop and report it rather than cutting inputs.

## 7. No-upload test

- [ ] 7.1 In `uniform-requests.spec.ts`, check every recorded request with `violations` from `tests/e2e/no-upload.ts`, against the tool's list from `tool-files.ts`. Use the input file names, their stems, the passwords, the typed name and text, and the picture names as secrets. Verify the spec passes, and that the existing no-upload self-test in `no-upload.spec.ts` still passes.

## 8. Screenshots

- [ ] 8.1 Take screenshots at 360px and 1280px wide of:
  - `/privacy` with the new sentences;
  - `/merge-pdf` during a wrong-kind pick in slow mode, showing "notes.docx, Getting ready" with its Remove button;
  - the picker with the refusal sentence after the wait.

  Verify the six images are attached to the pull request, and that nothing else on any tool page looks different.

## 9. Checks and review

- [ ] 9.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run check:seo`, `npm run e2e -- --trace off` and `npm run spec`. Verify each passes, and paste the real output in the pull request.
- [ ] 9.2 Draft the hand and release checks for issue #7, and verify the draft is in the pull request description:
  - the host's record for `text.pdf` against `damaged-xref.pdf` on one PDF page in Firefox and in Safari;
  - the live host's `Cache-Control` against the 10 minutes the Privacy sentences rely on;
  - a phone on a slow connection: a wrong-kind pick shows "Getting ready" with Remove, then the sentence, read out by the screen reader (R16).
- [ ] 9.3 Run the review panel, stage 2 (`.claude/skills/review-panel/SKILL.md`), and resolve every must-fix finding. Verify the panel's verdicts are in the pull request description, using `.github/pull_request_template.md`.

## Workflow follow-up

- After the pull request is merged, archive with `/opsx:archive`.
- Add a CLAUDE.md "Where the project stands" entry. Record its named exceptions (design.md, Risks) under "Left for later".
- Add this change's two owner questions (design.md, Open questions 1 and 2) under "Questions waiting for the owner".
- List the new Privacy sentences:
  - in issue #7, under the Privacy draft review;
  - in CLAUDE.md's "The Privacy page draft" owner item.
- Remove "Found, not changed: Compress PDF and Image to PDF fetch `fflate` only for some files" from entry 23.
- Withdraw the suggested task for the `fflate` finding if it is still open.
