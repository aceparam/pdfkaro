# Tasks: add-uniform-requests

## 1. Registry and dependencies

- [ ] 1.1 Confirm that no registry entry changes and no dependency is added. Verify at the end that `git diff main --stat` shows no change to `src/tools/registry.ts`, `package.json`, `package-lock.json` or `LICENSES.md`.

## 2. Engine declarations

- [ ] 2.1 Add `LibraryName` (`'qpdf' | 'fflate' | 'pdflib' | 'pdfjs' | 'pictureThumbnail'`) and a required `loads: { read; draw; job }` to `EngineModule` in `src/engines/types.ts`, with a comment saying the sets are chosen by tool, never by a file. Verify `npm run check` reports only the engines still to be declared.
- [ ] 2.2 Declare `loads` in each of the 14 files in `src/engines/tools/` as in design.md, decision 2. Verify `npm run check` passes and no engine's output changes (`npm test` passes as before).
- [ ] 2.3 Write `tests/unit/engine-loads.test.ts` (design.md, decision 8). For every engine it runs `inspect`, `inspectPicture` where there is one, and `run` against every file in `tests/fixtures/`, with `pictures/` for Image to PDF and Sign PDF's picture. It uses a valid option table and a recording `tools` filled from disk. It fails when:
  - a step asks for a library outside its declared set;
  - `loads` is missing;
  - `draw` does not match `thumbnails`.

  Allow `canvas`, `decodePicture` and `pdfjsGuard` everywhere. Verify `npm test` passes, and that it fails when `compress-pdf`'s `job` drops `fflate` (try this locally, do not commit it).
- [ ] 2.4 Record, from 2.3, each engine's outcome for each fixture, in the pull request's description: which libraries it asked for, and whether it gave a file, no file or a failure. Verify that every fixture appears for every engine.

## 3. Worker wiring

- [ ] 3.1 In `src/workers/pdfjs-loader.ts`, start PDF.js's nested worker in the same step as the PDF.js import, and hand over the port once the import resolves. Keep the failure handling unchanged. Verify the existing `pdfjs-loader` unit tests pass, plus a new one in which the worker is started before the import resolves.
- [ ] 3.2 Put the spare qpdf in a plain function, in a new file under `src/workers/` named in the change, tested in Node. Loading `'qpdf'` makes one instance and keeps it. The next `tools.qpdf()` takes it, unused, and clears it. Later calls make new instances. Verify with a unit test with a made-up factory: first call gets the spare, second gets a new instance, and a spare is never handed out twice.
- [ ] 3.3 In `src/workers/tool.worker.ts`, give the worker core its libraries by name:
  - `qpdf`: the spare from 3.2.
  - `fflate`.
  - `pdflib`.
  - `pdfjs`: `pdfjsLoader.load()`, `pdfjsData` and `import('../engines/thumbnail')`.
  - `pictureThumbnail`: `import('../engines/picture-thumbnail')`.

  Verify `npm run lint`, `npm run check`, and, after `npm run build`, `npm run check:worker` and `npm run check:csp`.
- [ ] 3.4 In `src/workers/messages.ts`, add the `prepare` (`toolId` only, no file) and `prepared` messages, with their checks in `isToWorker` and `isFromWorker`. Verify unit tests: a `prepare` carrying a file or password key is refused, and a well-formed one is accepted.
- [ ] 3.5 In `src/workers/worker-core.ts`, add `ready(phase)` as in design.md, decision 3:
  - Load the engine first.
  - Start the `read` (or `job`) libraries in the fixed order in one synchronous step, and wait for them.
  - In the read phase, start the `draw` libraries after that and catch their failures, without waiting.
  - Only then copy any file.

  Also:
  - Answer `prepare` with `prepared` once `read` has loaded and `draw` has settled.
  - Hand engines, for each phase, `tools` that refuse undeclared libraries (all but `canvas`, `decodePicture` and `pdfjsGuard`), so the step fails as `engine-load`.

  Verify the new `worker-core.test.ts` tests of design.md, decision 8, and that every existing `worker-core` and `thumbnail-plumbing` test passes:
  - the order log is the same for ready, damaged and needs-password engines;
  - `job` libraries are loaded before `run`, also when `run` throws at once or gives no file;
  - a `draw` failure does not fail the read;
  - `prepare` answers `prepared`;
  - an undeclared library fails as `engine-load`.
- [ ] 3.6 In `src/workers/client.ts`, add `ToolClient.prepare()`, which posts `prepare` and resolves on `prepared` or on the worker's end. Verify `client.test.ts`: it posts no file, it resolves on `prepared`, and it settles when the worker is ended.

## 4. Page wiring

- [ ] 4.1 In `src/hooks/useToolRun.ts`, have `addFiles` call `prepare()` before it looks at the files. When no file is taken, it waits for `prepare()`, held to 60 seconds, before it returns, so the workspace shows "Getting ready" until then and the refusal sentence and `onEmpty` follow as today. Check that `ToolWorkspace` shows "Getting ready" in that wait, and change only that if it does not. Verify with `npm run check`, and in the e2e of 6.3, by the wrong-kind inputs and a check that "Getting ready" is visible before the sentence with the pick set held back.
- [ ] 4.2 In `useToolRun.start`, end the reading worker (`client.end()`) before `runJob`, so every job runs in a fresh worker. Update the comment. Verify `thumbnails.spec.ts` ("with PDF.js held back, Merge and download merges at once", and the main button while a thumbnail is drawn) and every tool spec still pass.
- [ ] 4.3 Update the `why` text of `fflate`, `pdf`, `pdf.worker.min`, `pdfjs-data`, `thumbnail` and `picture-thumbnail` in `scripts/page-weight.mjs` to say when each is now fetched. Verify `npm run build && npm run weigh` passes, and record the before-pick totals and the "after a pick, at most" total before and after the change in the pull request.
- [ ] 4.4 Measure in Chromium, and record in the pull request:
  - the extra time to start a job in a fresh worker, on Merge with `text.pdf` and with the 100 MB file from `make-large.mjs`;
  - the memory of PDF.js's idle nested worker after a pick of `damaged-xref.pdf`.

  Verify the numbers are in the pull request. If the job start adds more than 200 ms on a desktop, stop and report it.

## 5. Privacy page text

- [ ] 5.1 Add the two draft sentences of design.md, decision 9, to `src/pages/privacy.astro`: one under "What happens to your file" and one at the end of "Who serves the site". Keep the "may ask again" sentence unless the owner has answered Open question 3 otherwise. Verify:
  - `tests/unit/privacy-page.test.ts` passes (absolute words, banned words, no worker outside the policy section, server guard);
  - `npm run build && npm run check:seo` passes (the draft line on an unwritten page);
  - the page is checked against "Banned patterns" in `SPEC.md`.
- [ ] 5.2 Once the code is built, read the three claim rows in design.md, decision 9, against it, and correct any row that no longer matches. Verify each row names code that exists and a test that passes.

## 6. End-to-end

- [ ] 6.1 Write `tests/e2e/host-log.ts` (design.md, decision 8). It is a `node:http` server for `dist/` on `127.0.0.1` and a free port:
  - clean URLs, the 404 page, GitHub Pages' content types;
  - `Cache-Control: max-age=600`, `ETag` and `Last-Modified`, and 304 on `If-None-Match`;
  - `..` refused;
  - each request recorded as `method path status`, with `mark()` to split phases.

  Verify with a test in the spec: a page loaded twice in one context records its scripts once, and a request with a matching `If-None-Match` gets 304.
- [ ] 6.2 Move each tool's exact list of files that may load after a pick from the 14 tool specs into `tests/e2e/tool-files.ts`, keyed by tool id, and import it in those specs. Verify every tool spec's no-upload test passes unchanged in what it checks.
- [ ] 6.3 Write `tests/e2e/uniform-requests.spec.ts`, tagged `@desktop`, with one test per page in `widgetPages` and the input table of design.md, decision 8. Each input runs in a new context with `watchPolicy`. The test compares, across inputs:
  - the multiset of `(method, path)` after the pick;
  - nothing new after a password is typed;
  - the multiset after the main button.

  A page with no row fails. For each page, look in `tests/fixtures/README.md` and the tool's spec for an input whose job fails in the browser, and add it as a job input if there is one; name the pages without one in the pull request. Verify the spec passes, and that it fails, naming `/compress-pdf`, when `compress-pdf`'s `needsLossless` gate on `fflate` is put back locally (do not commit it).
- [ ] 6.4 Update existing end-to-end checks that now contradict the rule. Fold `pdf-to-images.spec.ts` "a one-page file fetches fflate too, and the same files as a longer one" into the new spec, and fix any check that `fflate` or PDF.js is absent after a pick or a job in a case that now fetches it. Keep checks that a file is absent before a pick or before the main button. Verify `npm run build && npm run e2e -- --trace off` passes.
- [ ] 6.5 Record the new spec's run time in CI and locally in the pull request. Verify the time is recorded. If it passes about 5 minutes, stop and report it rather than cutting inputs.

## 7. No-upload test

- [ ] 7.1 In `uniform-requests.spec.ts`, check every recorded request with `violations` from `tests/e2e/no-upload.ts`, against the tool's list in `tool-files.ts`. Use the input file names, their stems, the passwords, the typed name and text, and the picture names as secrets. Verify the spec passes, and that the existing no-upload self-test in `no-upload.spec.ts` still passes.

## 8. Screenshots

- [ ] 8.1 Take screenshots at 360px and 1280px wide of `/privacy` with the new sentences, and of `/merge-pdf` showing "Getting ready" during a wrong-kind pick with the pick set held back. Verify the four images are attached to the pull request, and that nothing else on any tool page looks different.

## 9. Checks and review

- [ ] 9.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run check:seo`, `npm run e2e -- --trace off` and `npm run spec`. Verify each passes, and paste the real output in the pull request.
- [ ] 9.2 Draft the release checks for issue #7, and verify the draft is in the pull request description:
  - the host's record for `text.pdf` against `damaged-xref.pdf` on one PDF page in Firefox and in Safari;
  - the live host's `Cache-Control` against the 10 minutes the Privacy sentence relies on.
- [ ] 9.3 Run the review panel, stage 2 (`.claude/skills/review-panel/SKILL.md`), and resolve every must-fix finding. Verify the panel's verdicts are in the pull request description, using `.github/pull_request_template.md`.

## Workflow follow-up

- After the pull request is merged, archive with `/opsx:archive`.
- Add a CLAUDE.md "Where the project stands" entry, and add this change's three owner questions under "Questions waiting for the owner".
- Remove "Found, not changed: Compress PDF and Image to PDF fetch `fflate` only for some files" from entry 23.
- Withdraw the suggested task for the `fflate` finding if it is still open.
