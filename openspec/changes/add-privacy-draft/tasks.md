# Tasks: add-privacy-draft

This change adds no tool, so the usual order is followed in spirit: settings and the build check first (in place of a registry entry and an engine), then the page and its words, then the end-to-end checks, the screenshots and the panel. There is no engine, worker wiring, fixture run or new dependency: nothing here reads a PDF, so the fixtures in `tests/fixtures/` are not run, and `LICENSES.md` does not change.

## 1. Draft flag and build check

- [ ] 1.1 In `src/site.ts`, keep `/privacy` at `written: false` and reword the comment on `FooterLink.written`: false while the page shows an owner placeholder or an agent's draft waiting for the owner's review (design.md decision 3). Verify: `tests/unit/site.test.ts` "none is written yet" still passes unchanged.
- [ ] 1.2 In `scripts/check-seo.mjs`, export `draftSentence = 'This is a draft.'`. Rule 8: an unwritten footer page must show a placeholder sentence or `draftSentence`; a written footer page must show neither. Each message names the page and the flag to change in `src/site.ts`; update the header comment for rule 8. Extend `tests/unit/check-seo.test.ts` with the four cases in decision 3. Verify: `npm test` passes, and each new case fails if the rule is reverted (checked, not committed).

## 2. The page and its words

- [ ] 2.1 Replace `src/pages/privacy.astro` with the draft in design.md decision 2: the draft line as the first paragraph, then the sections in order, as plain HTML with no island, no inline style or script, and no link. Set the meta description from decision 2. Keep the top comment short: an agent's draft from the code, waiting for the owner; checked against the code before each release; the claim table is in this change's design.md. Verify: `npm run build`, then `npm run check:csp`, `npm run check:seo` and `npm run weigh` pass.
- [ ] 2.2 Before writing each sentence, re-read the code named in decision 4 and confirm the claim still holds on `main`. If one does not, change the sentence (never the code) and note it in the pull request. Verify: the pull request lists each row of the table as confirmed.
- [ ] 2.3 Write `tests/unit/privacy-page.test.ts` with the five guards in decision 5 (server, words, Safari, names, draft), importing `bannedWords` from `tests/e2e/pages.ts` and `draftSentence` from `scripts/check-seo.mjs`. Include a test entry with a server tool that proves the server guard trips with its message. Verify: `npm test` passes; adding "never" or "100%" to the page, deleting the Safari sentence or renaming a named tool makes it fail (checked, not committed).
- [ ] 2.4 Check the page against "Banned patterns" and "How the words should read" in `SPEC.md` by reading it, and mark every sentence as a draft for the owner in the pull request. Verify: the pull request has the checklist.

## 3. End-to-end checks

- [ ] 3.1 In `tests/e2e/site.spec.ts`, add to "every page keeps to the look and the rules" the cookie and storage check in decision 6, using `traces` from `tests/e2e/no-upload.ts`. Verify: `npm run e2e -- --trace off` passes at 360px and 1280px.
- [ ] 3.2 Replace "the privacy page makes no claim" with "the privacy page is a marked draft" (decision 6). Verify: it passes, and fails if the draft line is removed (checked, not committed).
- [ ] 3.3 No-upload: the page has no tool and no script; confirm `/privacy` stays in `staticPages` and "loads no script" passes. Verify: that test passes.

## 4. Whole checks and screenshots

- [ ] 4.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run check:seo`, `npm run e2e -- --trace off` and `npm run spec`. Verify: all pass; paste the real output in the pull request.
- [ ] 4.2 Take screenshots of `/privacy` at 360px and 1280px wide, in light and dark mode, into `openspec/changes/add-privacy-draft/screenshots/`. Verify: four files, nothing scrolls sideways, and the page passes the look-and-feel screenshot test in `SPEC.md`.

## 5. Review

- [ ] 5.1 Run the `review-panel` skill, stage 2, with the privacy reviewer reading every sentence against decision 4. Fix every must-fix finding, update design.md where a sentence changes, and put the verdicts and the owner questions from proposal.md in the pull request description. Verify: every reviewer approves.

## Workflow follow-up

- After merge, archive with `/opsx:archive`; add an entry to "Where the project stands" in `CLAUDE.md` saying the Privacy page is an agent's draft waiting for the owner, still `noindex`.
- When the owner approves the page, a small change removes the draft line, sets `written: true` for `/privacy`, and lets the sitemap list it.
- When the issue #7 Safari hand check is done, a change edits the Safari sentence and its guard together.
