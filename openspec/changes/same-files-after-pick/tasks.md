# Tasks

No registry entry, page, page text or dependency changes: this is a privacy fix to two published tools. Groups follow the project order where they apply.

## 1. Engines

- [ ] 1.1 In `src/engines/tools/compress-pdf.ts`, ask for `fflate` at the start of `run`, before the file is read, and pass it to `shrinkLossless`; remove the `needsLossless` condition on the fetch (design 1). Verify `npm run lint` and `npm run check` pass.
- [ ] 1.2 In `src/engines/tools/images-to-pdf.ts`, ask for `fflate` in `inspect` before `readPicture`, whatever the picture's type (design 2). Verify `npm run lint` and `npm run check` pass.

## 2. Engine unit tests

- [ ] 2.1 In `tests/unit/compress-pdf.test.ts`, add a test with a counting `fflate`: `compress-text.pdf`, `compress-small-jpg.pdf`, `compress-lossless.pdf` and `compress-json-bomb.pdf` (a JSON too large, so the picture step is skipped) each ask for it exactly once per job, before the first qpdf call (security, stage 1). Verify it fails before 1.1 and passes after.
- [ ] 2.2 In `tests/unit/images-to-pdf.test.ts`, add a test: `inspect` on a JPG, a PNG, an unsupported JPG, damaged pictures that pass the first-bytes check, and files of neither kind each ask for `fflate` exactly once. Verify it fails before 1.2 and passes after.
- [ ] 2.3 Run `npm test`; every existing test passes unchanged. Run both engines on every file in `tests/fixtures/` (the existing fixture tests) and confirm no outcome changed.

## 3. End-to-end tests

- [ ] 3.1 In `tests/e2e/compress-pdf.spec.ts`, add the fresh-context test of design 3 on `compress-text.pdf`, `compress-small-jpg.pdf`, `compress-scans.pdf` and `compress-packed.pdf` (which ends with no new file, so both endings are recorded): no violations, fflate's exact path in each set, all sets equal.
- [ ] 3.2 In `tests/e2e/images-to-pdf.spec.ts`, add the fresh-context test of design 3 on `/image-to-pdf` with a JPG alone and a PNG alone: no violations, fflate's exact path at pick time in both, pick-time sets equal, whole-run sets equal.
- [ ] 3.3 Confirm 3.1 and 3.2 fail on `main`'s engines (record the failure) and pass after group 1. Run `npm run build`, `npm run e2e -- --trace off` for both specs at 360px and 1280px, and the full e2e suite.

## 4. Checks and weight

- [ ] 4.1 Run `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp` and `npm run spec`; record that page weights are unchanged and the fflate chunk's gzip size.
- [ ] 4.2 No screenshots: no page changes how it looks. Say so in the pull request.

## 5. Record and review

- [ ] 5.1 Add the owner question on files not read as ready (proposal) under "Questions waiting for the owner" in `CLAUDE.md`. Add an entry for this change under "Where the project stands" in `CLAUDE.md`, with "Left for later": a site-wide test that every tool's requests after a pick are the same for every file (other tools were checked by reading only).
- [ ] 5.2 Run the review panel, stage 2 (see the review-panel skill), and resolve its findings.
