# Tasks: add-content-security-policy

This change adds no tool, so the usual tool order does not apply: there is no registry entry, engine or page text. The groups below keep the same spirit. The build step comes first, then the workers, then the browser tests, then the no-upload test, screenshots and the panel.

## 1. The policy tag in the built HTML

- [ ] 1.1 Write `scripts/csp.mjs` with `inlineBlocks`, `hashOf`, `policyFor` and `withPolicy`, as in design.md decisions 1 and 2. Only runnable scripts are hashed: no `type`, a JavaScript type, `module`, `importmap` or `speculationrules`. Write `tests/unit/csp.test.ts` covering each case in decision 4, including:
  - `hashOf` of `astro-island,astro-slot,astro-static-slot{display:contents}` gives `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=`;
  - a JSON-LD block is not hashed.

  Verify: `npm test` passes.
- [ ] 1.2 Add the `cspMeta()` integration to `astro.config.mjs` (`astro:build:done`, every `.html` in the output directory), and update the comment there about the Phase 1 policy. Verify by running `npm run build` and checking that:
  - every file in `dist/*.html` has one tag straight after `<meta charset="utf-8">`;
  - the 404, About and Privacy pages list no hash;
  - tool pages list three (style, island element, `client:load` loader);
  - the home page lists three (with the `client:idle` loader).
- [ ] 1.3 Write `scripts/check-csp.mjs`, using its own block finding and hashing rather than `scripts/csp.mjs`, and add `"check:csp"` to `package.json`. Add unit tests that feed it made-up pages with each problem in decision 4:
  - a missing tag;
  - a tag after a stylesheet;
  - an unhashed inline script;
  - an extra hash;
  - a `style=` attribute;
  - `onclick=`;
  - a `javascript:` link;
  - `'unsafe-inline'`;
  - `worker-src` other than `'self' blob:`;
  - a script from another origin.

  Also add a page with an unhashed JSON-LD block, which passes. Verify: `npm test` passes and `npm run check:csp` passes on the real build.
- [ ] 1.4 Make `scripts/check-base.mjs` run the CSP check on its sub-path build, keeping its `noindex` check. Verify: `npm run check:base` passes. Then remove a page's tag by hand in its output and confirm it fails; put the tag back.
- [ ] 1.5 Add a "Content Security Policy" step (`npm run check:csp`) to `.github/workflows/ci.yml` after "Links work under a sub-path". Add `npm run check:csp` to the Commands list in CLAUDE.md. Verify: the workflow parses as YAML, and the step order is build, weigh, check:worker, check:base, check:csp.

## 2. Workers run under the policy

- [ ] 2.1 Write `src/workers/start-worker.ts`. It exports `workerFromBlob(file, base)`, which returns a worker whose `terminate()` also revokes the `blob:` address (design.md decision 3). Write `tests/unit/start-worker.test.ts`, stubbing `Worker`, `Blob` and `URL.createObjectURL` in Node, to check that:
  - the blob text is exactly `import "<full same-origin address>";`;
  - addresses resolve at the root and under `/pdfkaro`;
  - `terminate()` ends the worker and revokes the address;
  - nothing in `src/` assigns `GlobalWorkerOptions.workerSrc` or `rendererSrc`.

  Verify: `npm test` passes.
- [ ] 2.2 Add `src/hooks/tool-worker.ts` with `createToolWorker()`, which uses the `?worker&url` address and `workerFromBlob(…, location.href)`. Have `ToolWorkspace.tsx` import it and pass it to `useToolRun` in place of its own `createWorker`. Leave `ToolClient` and `WorkerLike` unchanged. Verify:
  - `npm run lint && npm run check` pass, with the components' "no workers" rule unchanged;
  - `npm run build && npm run check:worker` passes: exactly one `tool.worker-*.js`, and every engine still its own late file. Adjust the pattern or `chunkFileNames` if the file name changed.
- [ ] 2.3 In `tool.worker.ts`, import `workerFromBlob`, and pass `() => workerFromBlob(pdfjsWorkerUrl, import.meta.url)` to `createPdfjsLoader`. Pass `qpdfWasm` as `new URL(qpdfWasm, import.meta.url).href`, and make any other relative address inside the workers absolute. Update the comment about the plain address. Verify:
  - the existing unit tests for `pdfjs-loader` and `worker-core` pass;
  - `npm run e2e -- --trace off` passes for `merge-pdf.spec.ts` (including its worker-request checks at lines 291-295), `thumbnails.spec.ts`, `pdf-to-images.spec.ts` and `compress-pdf.spec.ts`. These cover qpdf through Emscripten's `locateFile` in a `blob:` worker, PDF.js drawing and the picture decoders.
- [ ] 2.4 Add the lint rule that bans `new Worker` and `new SharedWorker` in `src/` outside `src/workers/start-worker.ts`. Extend `scripts/check-worker.mjs` to check every `new Worker(` and `new SharedWorker(` in the built files (design.md decision 3, PDF.js's `pdf-*.js` being the one named exception). Verify:
  - `npm run lint` passes, and fails on a throwaway `new Worker('x')` in a component (not committed);
  - `npm run check:worker` passes on the build, and fails when a built file is edited by hand to add `new Worker("/_astro/x.js")` (then rebuild).
- [ ] 2.5 Confirm `'wasm-unsafe-eval'` is needed and is enough. With it removed from the policy for one local build, a merge fails with a WebAssembly policy error in the worker. With it back, the merge passes. Record the result in the pull request. Verify: the outcomes of both runs are written in the pull request.

## 3. Violation watch in every end-to-end test

- [ ] 3.1 Write `tests/e2e/fixtures.ts` (design.md decision 4):
  - Playwright's `test` extended with an automatic fixture;
  - a document `securitypolicyviolation` listener added by an init script;
  - for each worker from `page.on('worker')`, a listener added with `worker.evaluate` on the worker's own scope, which logs a fixed marker that is read from that worker's console. Console messages alone carry nothing, and init scripts do not reach workers.
  - the test failing afterwards with the directive and blocked address;
  - an opt-out option for tests that block on purpose;
  - an exported `watch(context)`.

  Verify: a throwaway local test that adds an inline script, and one that makes a probe worker call `eval`, both fail under the fixture (not committed).
- [ ] 3.2 Change every spec in `tests/e2e/` to import `test` and `expect` from `./fixtures`. Call `watch(context)` in the three tests that open their own context: `pdf-to-images.spec.ts:523`, `sign-pdf.spec.ts:1014` and `split-pdf.spec.ts:372`. Add the ESLint `no-restricted-imports` rule for `tests/e2e/**/*.spec.ts` that bans importing `test` from `@playwright/test`. Verify:
  - `npm run lint` passes;
  - the full `npm run e2e -- --trace off` passes at 360px and 1280px with no violation recorded, which runs every tool's jobs over the fixtures each spec uses;
  - `tests/e2e/no-upload.ts` is byte-for-byte unchanged (`git diff main -- tests/e2e/no-upload.ts` is empty).
- [ ] 3.3 Write `tests/e2e/csp.spec.ts` (design.md decision 4). It covers:
  - the tag on every page in `allPages`, placed first after the charset tag;
  - an added inline script blocked and recorded;
  - a script and a `fetch` from another origin blocked;
  - the probe, served by `page.route` and added with `page.addScriptTag({ url })`. It starts a worker the `workerFromBlob` way. In that worker `eval` throws, a tiny WebAssembly module compiles, and a `fetch` to `http://127.0.0.1:<port>/csp-probe` is refused. The same holds in a worker nested in it. The fixture records `script-src` and `connect-src` violations on both workers' scopes, and the server never receives `/csp-probe`;
  - a Merge PDF job in which both real workers are seen as `blob:` workers and no violation is recorded.

  Verify: `npm run e2e -- csp.spec.ts --trace off` passes in the phone and desktop projects.
- [ ] 3.4 Add `firefox` and `webkit` projects to `playwright.config.ts` that run only `csp.spec.ts` at desktop size. Add to `csp.spec.ts` one ordinary job per engine kind under the watch: Merge PDF (qpdf), PDF to JPG (PDF.js drawing and decoders), Sign PDF (pdf-lib) and Split PDF (zip). Change the CI install step to `npx playwright install --with-deps chromium firefox webkit`. Only Chromium is installed in this container, and others must not be installed locally, so these projects run in CI only. Verify: the CI run on the pull request passes the `firefox` and `webkit` projects; link the run in the pull request.
- [ ] 3.5 Run every tool's page against every file in `tests/fixtures/` under the policy, and record any violation or new failure in the pull request. This uses the existing thumbnails and per-tool tests, plus a local run that picks each fixture on its tools' pages and draws its thumbnails. Verify: the record lists each fixture with "no violation", or the problem found and fixed.

## 4. No-upload, weight, sub-path and screenshots

- [ ] 4.1 Run `no-upload.spec.ts` and each tool's no-upload test with `tests/e2e/no-upload.ts` unchanged. Verify: they pass, and the watcher needed no widening for the workers' `blob:` start.
- [ ] 4.2 Run `npm run weigh` and record each page's size before and after in the pull request. Verify: every page stays under 100 KB and grows by no more than 0.5 KB by gzip, and the after-a-pick total grows by no more than 1 KB.
- [ ] 4.3 Confirm no dependency was added, so `LICENSES.md` needs no new line. Verify: `git diff main -- package.json package-lock.json` shows only the new `check:csp` script. Update the CI download note in `LICENSES.md` (line 48) to name Chromium, Firefox and WebKit, and say in the pull request why the two extra browsers are needed.
- [ ] 4.4 Take screenshots of the home page, Merge PDF (after a pick, with thumbnails) and the Privacy page at 360px and 1280px, to show nothing changed on screen. Verify: the six screenshots are in the pull request, beside the same screenshots from `main`, for the ux-designer at stage 2.
- [ ] 4.5 Before merge, build with `SITE_BASE=/pdfkaro`, serve the output under `/pdfkaro/`, and run one Merge PDF job and one PDF to JPG job in Chromium with the violation watch on (a local Playwright run with that base URL, not committed). Verify: both jobs finish with no violation, and the result is recorded in the pull request.
- [ ] 4.6 Add the hand checks to issue #7. On the preview under `/pdfkaro/`, run one job each of Merge PDF, PDF to JPG, Sign PDF and Split PDF, with no policy message in the console, in Safari and Edge on desktop and in Android Chrome and iOS Safari. On each phone, also prove blocking: with remote devtools attached to the tool worker, a `fetch` to another origin is refused. Verify: the issue lists them.

## 5. Review

- [ ] 5.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run e2e -- --trace off` and `npm run spec`. Verify: all pass and none are skipped (the `firefox` and `webkit` projects in CI).
- [ ] 5.2 Run the review panel, stage 2 (the `review-panel` skill), including the ux-designer. Settle every must-fix finding. Put the verdicts in the pull request description, with:
  - the evidence from 2.5, 3.4, 3.5, 4.2 and 4.5;
  - the decision 6 facts for the Privacy page;
  - a note that `frame-ancestors` waits for a host that sends headers.

  Verify: every panel agent approves.

## Workflow follow-up

- Stage 1 findings are settled in these artifacts. The security reviewer must confirm the changed worker wording before 1.1: `worker-src 'self' blob:`, with the "only from `blob:`" guarantee moved to lint and the built-file check.
- The ux-designer was not run at stage 1, because there is no visible change. It is required at stage 2 (task 5.2).
- After the pull request is merged:
  - Run `/opsx:archive` so the `privacy` delta joins `openspec/specs/`, and add this change to "Where the project stands" in CLAUDE.md.
  - Add one clause to the CLAUDE.md question "Pages for previews only, or for launch too?": GitHub Pages cannot send the policy as a header, `frame-ancestors` or reporting, and `'self'` there is the whole `aceparam.github.io` origin.
  - Any Firefox or Safari fallback for starting workers goes to security review and to the owner as a decision.
