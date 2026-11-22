# Tasks: add-content-security-policy

This change adds no tool, so the usual tool order (registry entry, engine, worker, page text) does not apply: there is no registry entry, engine or page text. The groups below keep the same spirit: the build step first, then the workers, then the browser tests, the no-upload test, screenshots and the panel.

## 1. The policy tag in the built HTML

- [ ] 1.1 Write `scripts/csp.mjs` with `inlineBlocks`, `hashOf`, `policyFor` and `withPolicy` as in design.md decisions 1 and 2, and `tests/unit/csp.test.ts` covering each case listed in decision 4 (including `hashOf` of `astro-island,astro-slot,astro-static-slot{display:contents}` giving `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=`). Verify: `npm test` passes.
- [ ] 1.2 Add the `cspMeta()` integration to `astro.config.mjs` (`astro:build:done`, every `.html` in the output directory), and update the comment there about the Phase 1 policy. Verify: `npm run build`, then every file in `dist/*.html` has one tag straight after `<meta charset="utf-8">`; the 404, About and Privacy pages list no hash; tool pages list three (style, island element, `client:load` loader) and the home page three (with the `client:idle` loader).
- [ ] 1.3 Write `scripts/check-csp.mjs` (own block finding and hashing, not `scripts/csp.mjs`), add `"check:csp"` to `package.json`, add unit tests that feed it made-up pages with each problem in decision 4 (missing tag, tag after a stylesheet, unhashed inline script, extra hash, `style=` attribute, `onclick=`, `javascript:` link, `'unsafe-inline'`, a script from another origin). Verify: `npm test` passes and `npm run check:csp` passes on the real build.
- [ ] 1.4 Make `scripts/check-base.mjs` run the CSP check on its sub-path build, keeping its `noindex` check. Verify: `npm run check:base` passes, and fails when a page's tag is removed by hand in its output (then put back).
- [ ] 1.5 Add a "Content Security Policy" step (`npm run check:csp`) to `.github/workflows/ci.yml` after "Links work under a sub-path", and add `npm run check:csp` to the Commands list in CLAUDE.md. Verify: the workflow file lints as YAML and the step order is build, weigh, check:worker, check:base, check:csp.

## 2. Workers run under the policy

- [ ] 2.1 Write `src/workers/start-worker.ts` (`startWorker(file, base)` returning `{ worker, end }`, design.md decision 3) and `tests/unit/start-worker.test.ts`: the `blob:` text is exactly `import "<full same-origin address>";`, addresses resolve correctly at the root and under `/pdfkaro`, `end()` terminates and revokes. Verify: `npm test` passes.
- [ ] 2.2 Start the tool worker in `ToolWorkspace.tsx` with `startWorker` and the `?worker&url` address, and have the worker client call `end()` where it now terminates the worker. Verify: `npm run build && npm run check:worker` passes (exactly one `tool.worker-*.js`, every engine still its own late file; adjust the pattern or `chunkFileNames` if the name changed), and `npm run lint && npm run check` pass.
- [ ] 2.3 In `tool.worker.ts`, start the PDF.js worker with `startWorker(pdfjsWorkerUrl, import.meta.url)` and pass `qpdfWasm` as `new URL(qpdfWasm, import.meta.url).href`; update the comment about the plain address. Verify: the existing unit tests for `pdfjs-loader` and `worker-core` pass, and `npm run e2e -- --trace off` passes for `merge-pdf.spec.ts`, `thumbnails.spec.ts`, `pdf-to-images.spec.ts` and `compress-pdf.spec.ts` (qpdf, PDF.js drawing, picture decoders).
- [ ] 2.4 Confirm `'wasm-unsafe-eval'` is needed and enough: with it removed from the policy for one local build, a merge fails with a WebAssembly policy error in the worker; with it back, the merge passes. Record the result in the pull request. Verify: the two runs' outcomes are written in the pull request.

## 3. Violation watch in every end-to-end test

- [ ] 3.1 Write `tests/e2e/fixtures.ts`: Playwright's `test` extended with an automatic fixture that records `securitypolicyviolation` events (init script) and policy console messages from the page and from each worker Playwright reports, and fails the test after it with the blocked address and directive; an opt-out option for tests that block on purpose. Record in the file whether Playwright's worker console events reach blob-started workers and the nested PDF.js worker. Verify: a throwaway local test that adds an inline script fails under the fixture (not committed).
- [ ] 3.2 Change every spec in `tests/e2e/` to import `test` and `expect` from `./fixtures`, and add a unit test that fails if any spec imports `test` from `@playwright/test`. Verify: `npm test` passes and the full `npm run e2e -- --trace off` passes at 360px and 1280px with no violation recorded, which also runs every tool's jobs over the fixtures each spec uses.
- [ ] 3.3 Write `tests/e2e/csp.spec.ts` (design.md decision 4): the tag on every page in `allPages`, placed first after the charset tag; an added inline script blocked; a script and a `fetch` from another origin blocked; a page's `new Worker('/_astro/tool.worker-*.js')` refused; after picking a file on Merge PDF, `eval` throws in the tool worker and a `fetch` to `http://127.0.0.1:<port>/` is blocked with no request reaching the server, and the merge still finishes; the same in the PDF.js worker if Playwright reaches it, otherwise recorded. Verify: `npm run e2e -- csp.spec.ts --trace off` passes in both projects.
- [ ] 3.4 Run every tool's page against every file in `tests/fixtures/` under the policy (the existing thumbnails and per-tool tests, plus a local run that picks each fixture on its tools' pages and draws its thumbnails) and record any violation or new failure in the pull request. Verify: the record lists each fixture with "no violation", or the problem found and fixed.

## 4. No-upload, weight and screenshots

- [ ] 4.1 Run `no-upload.spec.ts` and each tool's no-upload test unchanged; confirm the watcher needed no widening for the worker's `blob:` start. Verify: `npm run e2e -- no-upload --trace off` and the per-tool no-upload tests pass with no change to `tests/e2e/no-upload.ts`.
- [ ] 4.2 Run `npm run weigh` and record each page's size before and after in the pull request. Verify: every page stays under 100 KB and grows by no more than 0.5 KB by gzip; the after-a-pick total grows by no more than 1 KB.
- [ ] 4.3 Confirm no dependency was added, so `LICENSES.md` needs no new line. Verify: `git diff main -- package.json package-lock.json` shows only the new `check:csp` script.
- [ ] 4.4 Take screenshots of the home page, Merge PDF (after a pick, with thumbnails) and the Privacy page at 360px and 1280px, to show nothing changed on screen. Verify: the six screenshots are in the pull request and match `main`.
- [ ] 4.5 Add the hand checks to issue #7: on the preview under `/pdfkaro/`, one job each of Merge PDF (qpdf), PDF to JPG (PDF.js drawing), Sign PDF (pdf-lib) and Split PDF (zip) with no policy message in the console, in Firefox, Safari and Edge on desktop and in Android Chrome and iOS Safari. Verify: the issue lists them.

## 5. Review

- [ ] 5.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run e2e -- --trace off` and `npm run spec`. Verify: all pass, none skipped.
- [ ] 5.2 Run the review panel, stage 2 (the `review-panel` skill), settle every must-fix finding, and put the verdicts in the pull request description with the evidence from 2.4, 3.4 and 4.2 and a note that `frame-ancestors` waits for a host that sends headers. Verify: every panel agent approves.

## Workflow follow-up

- Before 1.1: run the review panel, stage 1, on this proposal and settle its findings in these artifacts.
- After the pull request is merged: run `/opsx:archive` so the `privacy` delta joins `openspec/specs/`, and add this change to "Where the project stands" in CLAUDE.md.
