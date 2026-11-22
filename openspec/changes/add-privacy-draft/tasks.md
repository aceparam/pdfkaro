# Tasks: add-privacy-draft

This change adds no tool, so the usual order is followed in spirit: settings and the build check first (in place of a registry entry and an engine), then the page and its words, then the end-to-end checks, the screenshots and the panel. There is no engine, worker wiring, fixture run or new dependency: nothing here reads a PDF, so the fixtures in `tests/fixtures/` are not run, and `LICENSES.md` does not change.

## 1. Draft flag and build check

- [x] 1.1 In `src/site.ts`, keep `/privacy` at `written: false`, reword the comment on `FooterLink.written` (false while the page shows an owner placeholder or an agent's draft waiting for the owner's review), and export `draftSentence = 'This is a draft.'` (design.md decisions 1 and 3). Verify: `tests/unit/site.test.ts` "none is written yet" still passes unchanged, and a new assertion checks `draftSentence`.
- [x] 1.2 In `scripts/check-seo.mjs`, import `draftSentence` from `src/site.ts`. Rule 8: an unwritten footer page must show a placeholder sentence or `draftSentence`; a written footer page must show neither. Messages and the header comment say "placeholder or draft", name the page and the flag to change in `src/site.ts`. In `tests/e2e/pages.ts`, rename `placeholderPages` to `unwrittenPages` with the comment in decision 3, and update `site.spec.ts`. Extend `tests/unit/check-seo.test.ts` with the four cases in decision 3. Verify: `npm test` and `npm run check` pass, and each new case fails if the rule is reverted (checked, not committed).

## 2. The page and its words

- [x] 2.1 Replace `src/pages/privacy.astro` with the draft in design.md decision 2: the draft line (using `draftSentence`) as the first paragraph, then the sections in order, with the two `h3` headings under "Passwords", as plain HTML with no island, no inline style or script, and no link. Set the meta description from decision 2. Keep the top comment short: an agent's draft from the code, waiting for the owner; checked against the code before each release; the claim table is in this change's design.md. Verify: `npm run build`, then `npm run check:csp`, `npm run check:seo` and `npm run weigh` pass.
- [x] 2.2 Before writing each sentence, re-read the code named in decision 4 and confirm the claim still holds on `main`. If one does not, change the sentence (never the code) and note it in the pull request. Verify: the pull request lists each row of the table as confirmed.
- [x] 2.3 Write `tests/unit/privacy-page.test.ts` with the guards in decision 5 (server, words, policy, names; no draft guard), reading the page without frontmatter and comments, importing `bannedWords` from `tests/e2e/pages.ts`. Move the server-tool filter of `taglineProblem` in `tests/unit/site.test.ts` into a small shared test helper that both use. Include test entries proving: the server guard trips with a server tool; it trips when both browser-only sentences are gone; the names guard trips when a tool gains a `text` option. Verify: `npm test` passes; adding "never" or "100%" to the page, putting "worker" in the policy section's first paragraph, deleting the Safari or "does not stop" sentence, or renaming a named tool makes it fail (checked, not committed).
- [x] 2.4 Check the page against "Banned patterns" and "How the words should read" in `SPEC.md` by reading it, and mark every sentence as a draft for the owner in the pull request. Verify: the pull request has the checklist.

## 3. End-to-end checks

- [x] 3.1 Export `expectNothingStored(page, context)` from `tests/e2e/no-upload.ts`, built on `traces`. In `tests/e2e/site.spec.ts`, call it in "every page keeps to the look and the rules", and require every request to be a `GET` with no body and no query string, to the site's own origin and a path that exists in `dist/` (decision 6). Verify: `npm run e2e -- --trace off` passes at 360px and 1280px.
- [x] 3.2 Replace "the privacy page makes no claim" with "the privacy page is a marked draft" (decision 6). Verify: it passes, and fails if the draft line is removed (checked, not committed).
- [x] 3.3 No-upload: the page has no tool and no script; confirm `/privacy` stays in `staticPages` and "loads no script" passes. Verify: that test passes.
- [x] 3.4 In `tests/e2e/merge-pdf.spec.ts`, add the test in decision 6 in its own context with `bypassCSP: true`: after a job, `fetch` of the Download `href` and one thumbnail's `blob:` address succeeds, then after "Start again" each fails. Verify: it passes; it fails if `clear` stops revoking the addresses, and the positive control fails if `bypassCSP` is removed (both checked, not committed); every other test still runs under the policy watch.

## 4. Whole checks and screenshots

- [x] 4.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run check:seo`, `npm run e2e -- --trace off` and `npm run spec`. Verify: all pass; paste the real output in the pull request.
- [x] 4.2 Take screenshots of `/privacy` at 360px and 1280px wide, in light and dark mode, into `.github/pr-screenshots/privacy/`. Verify: four files, nothing scrolls sideways, and the page passes the look-and-feel screenshot test in `SPEC.md`.

## 5. Review

- [ ] 5.1 Run the `review-panel` skill, stage 2, with the privacy reviewer reading every sentence against decision 4. Fix every must-fix finding, update design.md where a sentence changes, and put the verdicts and the owner questions from proposal.md in the pull request description. Verify: every reviewer approves.

## 6. Stage 2 review fixes

- [x] 6.1 Privacy (must fix): replace "Each tool's page says what it keeps." with the facts on the Privacy page: a new PDF can carry the title, author and other details, tags and attachments; in Merge PDF the details and attachments are the first file's; PDF to JPG and PNG pictures hold only the drawn page, with typed form values as shown and no title, author or date; Image to PDF copies no picture details. Add a Merge PDF unit test that the first file's title is kept. Add a page text review item to the issue #7 comment for the missing lines on the Merge PDF, Reorder pages and PDF to PNG pages, which this change does not edit. Verify: each fact confirmed in the code; the new test passes.
- [x] 6.2 Privacy (must fix): name PDF.js's worker. The tool's worker starts a second worker to read a PDF and draw its pages; both get the file and its password; both are closed together. Say "the tool's worker" where only it is meant. Verify: the policy guard still passes.
- [x] 6.3 Privacy: "the workers keep nothing open between one picture and the next" in place of "opens the file only to draw each picture".
- [x] 6.4 Privacy: the policy sentence says the rule holds "in workers started the same way as those that read your file", as `csp.spec.ts` proves; the paragraph still starts "In Chrome and Firefox".
- [x] 6.5 UX: "The Remove a password tool takes off the password you type."
- [x] 6.6 Code: `builtFileOf` in `site.spec.ts` takes off the base path and percent-decodes the path.
- [x] 6.7 Architect: drop the `site.test.ts` assertion that `draftSentence` equals its own words; export `notFoundPage` from `tests/e2e/pages.ts` and use it in `site.spec.ts`.
- [x] 6.8 Run lint, check, test, build, weigh, check:seo, check:csp, spec, and `site.spec.ts` with the privacy-related e2e tests. Verify: all pass.

## Workflow follow-up

- Add "owner review of the Privacy draft" to issue #7 when the pull request is opened, so the owner's review is tracked with the other Phase 1 hand checks.
- After merge, archive with `/opsx:archive`; add an entry to "Where the project stands" in `CLAUDE.md` saying the Privacy page is an agent's draft waiting for the owner, still `noindex`.
- When the owner approves the page, a small change removes the draft line, sets `written: true` for `/privacy`, and lets the sitemap list it.
- When the issue #7 Safari hand check is done, a change edits the Safari sentence and its guard together.
