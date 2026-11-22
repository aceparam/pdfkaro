# Design: add-privacy-draft

## Context

- `src/pages/privacy.astro` is a placeholder: a heading and `OwnerPlaceholder` saying "This page has not been written yet." `tests/e2e/site.spec.ts` checks that it says exactly that ("the privacy page makes no claim").
- `src/site.ts` gives each footer page `written: boolean`, all `false`. `Base.astro` writes `noindex` on a footer page that is not written; `src/tools/seo.ts` `sitemapPaths` leaves it out of the sitemap; `scripts/check-seo.mjs` (rule 8) wants every unwritten footer page to show a placeholder sentence (`placeholderSentences`), and `noindex` on exactly those pages at the root.
- Every published tool has `runsIn: 'browser'`. `tests/unit/site.test.ts` already guards the tagline the same way this change guards the Privacy page.
- The facts were recorded, checked against the code, in archived design docs: `add-protect-pdf` section 9, `add-unlock-pdf` section 6, `add-content-security-policy` section 6 and its WebKit risk, `add-password-option`'s proposal, and `CLAUDE.md` entries 18 to 21. Each is re-checked against today's code in decision 4.
- The owner decided on 13 Nov 2026 that the agent drafts this page, marked as a draft. See proposal.md for why now.

## Goals / Non-Goals

**Goals:**
- A plain draft that the owner can read in a few minutes and approve or correct.
- Every sentence true of the code today, with the code and the proof named (decision 4).
- Guards that fail when the code moves away from a sentence that a test can watch.

**Non-Goals:**
- Any change to how a tool handles files, passwords or options. If a sentence would need the code to change to be true, the sentence is changed instead.
- A shared component for site pages, Markdown content for site pages, or a "last checked" date (the release check in `privacy` "The Privacy page matches the code" stays a process, not a build step).
- A "Privacy" section on tool pages; their own words stay as they are.

## Decisions

### 1. Where the words live, and how the draft is marked

The text is plain HTML inside `src/pages/privacy.astro`, as the other site pages are: one `h1`, `h2` sections, paragraphs and short lists. No island, no script, no new CSS. The 404 and placeholder pages work this way; a Markdown collection for one page would add machinery for nothing.

The draft line is the first paragraph under the heading: `<p><strong>This is a draft.</strong> It was written from what the site's code does. The person who runs this site has not yet checked it.</p>`. A plain bold sentence, not `OwnerPlaceholder`: that box means "nothing here yet", and this page has content. The wording "the person who runs this site" follows the About placeholder and names no one.

Links: the site test wants every link at least 44px tall, so an inline link in a paragraph would fail. The page needs none: it names tools in words, and says nothing that needs an outside source (decision 2, last section). No link is added.

### 2. The page text (draft for the owner)

Meta description: "What happens to your files, passwords and anything you type or draw when you use a tool on this site." Title stays "Privacy - PDFkaro".

> # Privacy
>
> **This is a draft.** It was written from what the site's code does. The person who runs this site has not yet checked it.
>
> ## In short
>
> - Every tool on this site does its work inside your browser. Your files are not uploaded, and neither is any password, text, drawing or picture you give a tool.
> - There are no accounts. The site sets no cookies and writes nothing to your browser's storage.
> - There are no adverts, and no analytics or tracking scripts.
>
> ## What happens to your file
>
> You choose a file with the button, by dropping it on the page or by pasting it. Your browser reads it from your device. No tool on this site runs on a server today.
>
> The work is done by a part of the page that runs in the background, called a worker. The page hands your file to the worker inside your browser, and the worker makes the new file there. The pictures of your pages are drawn by the worker too. You save the new file with the Download button. Nothing is saved on its own.
>
> After you choose a file, the page fetches the programs that read and write PDFs. They come from this site. These requests carry nothing from your file: not its contents, not its name and not a password.
>
> Your file's name is shown on the page and used to name the new file.
>
> ## How long the page holds your file
>
> The page holds your file in your browser's memory while you work on it. It lets go of it when you remove or replace it, when you press "Start again", and when you close the tab or open another page in it. Switching to another tab keeps it.
>
> The new file is held in the same way until you start another job, press "Start again" or leave the page.
>
> The worker is closed after every job, when you press Cancel, when you press "Start again" and when you leave the page.
>
> ## Passwords
>
> **The password that opens a protected file.** A tool asks for it when you choose a PDF that needs one. It goes to the worker, inside your browser, to open the file. The page keeps it while the file is listed, so you need not type it again after Cancel or a failed job. It forgets it when a job gives a new file or ends with no new file, when you replace or remove the file, when you press "Start again", and when you leave the page. A wrong try is kept until you type another, and forgotten in the same cases.
>
> **A new password, in Protect with a password.** You type it twice. Only what you type in the first box goes to the worker, with the job. The second box stays on the page, to check that both match. The page keeps the password through Cancel, a failed job and "Choose another file". It forgets it when the job gives the protected file, when you press "Start again", when you remove the file, and when you leave the page. This site does not have your password, so it cannot get it back for you. A password does not hide everything in a file: the page of Protect with a password says what can still be seen without it.
>
> Your browser may offer to save a password you type, or to suggest one. A saved password is kept by your browser and may be copied to your browser account. That is your browser's offer, and you can turn it down.
>
> ## Text, drawings and pictures
>
> Watermark asks for the text to draw. Sign PDF asks for your name, a drawing of your signature or a picture of it. These go to the worker with the job, as your file does, and are drawn into the new file. A drawing goes as a list of points; the page does not turn it into a picture. A picture you choose is read by the worker, like your file.
>
> The page keeps them while you work, so you can try again after Cancel or a failed job. It lets go of them when you press "Start again", when you remove the file, and when you leave the page.
>
> ## What the site does not do
>
> - It has no accounts.
> - It sets no cookies.
> - It writes nothing to your browser's storage.
> - It shows no adverts.
> - It runs no analytics or tracking scripts. Every script on the site comes from the site itself.
> - It does not send what you type in the box on the home page to find a tool.
>
> ## What your browser may do
>
> This site cannot change these.
>
> - Your browser keeps a list of your downloads, with each file's name.
> - It may keep copies of this site's pages and programs in its cache, as it does for any site. Your files are not among them.
> - Browser extensions you have added can read what is on a page.
>
> ## The rule that limits requests
>
> Each page gives your browser a rule, called a Content Security Policy, that limits what the page may load and send. Under it, your browser blocks the page from loading scripts and other files from any other site, and blocks the page and its workers from sending requests to any other site.
>
> The site's automated tests check that this works, inside the workers that read your file too, in the browser engines of Chrome and Firefox. It has not yet been checked in Safari.
>
> The rule does not stop the page from following a link or opening another page. It does not limit requests to this site's own address, which on GitHub Pages is shared with the other sites of the same GitHub account. The site's tests check that no request carries your file, its name or a password.
>
> ## Who serves the site
>
> This site is served by GitHub Pages, a service run by GitHub. Each time your browser asks for a page or one of the site's programs, GitHub receives your device's IP address and the address asked for, and may record them. Your files are not sent to GitHub.

About 830 words. No "100%", "never", "secure", "guaranteed", "safe" or "private"; no banned word; no exclamation mark; nothing in capitals for emphasis; no person, company (other than the host, named as a fact), contact or motive. "Remove a password" is not named: its file password is covered by the first password paragraph, and naming it adds nothing. The hosting sentence says only "may record", so it does not depend on GitHub's own documents.

### 3. Draft and search engines

`/privacy` stays `written: false` (owner question 2). So `Base.astro` and `sitemapPaths` need no change: the page carries `noindex` at the root and stays out of the sitemap, exactly as the placeholders do.

`scripts/check-seo.mjs` rule 8 changes:
- a new export, `draftSentence = 'This is a draft.'`;
- a footer page marked not written must show a placeholder sentence or `draftSentence` (today: a placeholder sentence only);
- a footer page marked written must show neither, so approving the page cannot leave the draft line behind;
- messages name the page and say which flag to change in `src/site.ts`.

`tests/unit/check-seo.test.ts` gains: an unwritten page showing only the draft line passes; an unwritten page showing neither fails (existing test); a written page showing the draft line fails; a written page showing a placeholder sentence fails. The comment on `FooterLink.written` in `src/site.ts` says it is false while the page shows a placeholder or an agent's draft. `add-search-basics` decision 6 planned to mark the page written when drafted; this change departs from it for the reason in proposal.md, question 2.

### 4. Claim → code → test

Each claim on the page, the code that makes it true today, and what proves it. "Release check" means no automated test can watch it; it is read again against the code before each release (`privacy` "The Privacy page matches the code").

| Claim | Code | Proof |
| --- | --- | --- |
| Every tool works in the browser; no tool runs on a server today | Every `runsIn: 'browser'` in `src/tools/registry.ts`; jobs go by `postMessage` in `src/workers/client.ts` | New guard in `tests/unit/privacy-page.test.ts` (decision 5); `tests/unit/client.test.ts` "posts the file itself" |
| Files, passwords, text, drawings and pictures are not uploaded; requests carry nothing from the file, its name or a password | `useToolRun` holds files, passwords and pictures in refs and sends them only to the worker | Each tool's no-upload test (`violations` in `tests/e2e/no-upload.ts`: no body, no other origin, no secret in an address or header), in the 13 tool specs and `merge-pdf.spec.ts`; secrets include file names, typed text, picture names and passwords |
| The programs come from this site, after a file is chosen | Late loading in `tool.worker.ts`; `connect-src 'self'` | `npm run check:worker`; `site.spec.ts` "every page" (all requests same-origin); no-upload allow-lists of built files |
| The worker makes the new file and draws the page pictures; you save it with Download; nothing saves on its own | `worker-core.ts`, `thumbnail.ts`; `Result` has `<a download>` | Every tool's e2e test presses Download; `tool-page` spec |
| The file's name is shown and used to name the new file | `outputName` in `useToolRun`; names never sent | `format.test.ts` output names; no-upload secrets |
| The page holds the file until remove/replace, "Start again" or leaving; switching tabs keeps it | `removeFile`, `clear`, `pagehide` → `clear` in `useToolRun.ts` | Release check (the repo has no DOM test library); `state.test.ts` for the reducer side |
| The new file is held until another job, "Start again" or leaving | `releaseResult` in `start` and `clear` | Release check |
| The worker is closed after every job, on Cancel, "Start again" and leaving | `ToolClient.run` ends it in `finally`; `cancel` and `clear` call `end()` | `client.test.ts` "ends the worker when the job is done", "cancels by ending the worker"; `worker-core.test.ts` |
| An input file's password: kept while listed and through Cancel and failure; forgotten after a file or no new file, replace/remove, "Start again", leaving; a wrong try kept until replaced | `runJob` `forgetInputPasswords`; `removeFile`; `clear`; `useToolRun` tickets | `run-job.test.ts`; `unlock-pdf.spec.ts` (wrong try answered last); release check for remove and leaving |
| A new password: only the first box goes; kept through Cancel, failure, "Choose another file"; forgotten after the protected file, "Start again", removing the file, leaving | `jobOptions` sends `first` only; `forgetNewPasswords` in `runJob`, `removeFile`, `clear` | `run-job.test.ts`; `options.test.ts`; `protect-pdf.spec.ts` emptied-field and no-upload checks |
| The site does not have the password and cannot get it back | No request carries it | `protect-pdf.spec.ts` no-upload; `password-rule.test.ts` |
| The browser may offer to save or suggest a password, and sync it | `autocomplete="new-password"` in `NewPasswordField`; `autocomplete="off"` in `PasswordField`, which browsers may still offer to save | Browser behaviour; release check |
| Text, drawings and pictures go to the worker with the job and are drawn into the file; a drawing goes as points and is not turned into a picture; a picture is read by the worker | Options in `jobOptions`; `DrawingPad` keeps points; pictures in a ref, `inspect-picture` in the worker | `privacy` spec "Drawings stay in the browser" (pad source test in `components.test.tsx`), `watermark-pdf.spec.ts`, `sign-pdf.spec.ts` no-upload |
| They are kept through Cancel and failure, and let go on "Start again", removing the file, leaving | Reducer `choices` reset on `reset` and on removing the last file; `pictures` cleared in `clear` and `removeFile` | `state.test.ts` "forgets a choice when the last file is removed"; `options.test.ts`; release check for leaving |
| No accounts | No sign-in code anywhere | Release check |
| No cookies; nothing written to browser storage | No storage API in `src/` or the built files | New check on every page in `site.spec.ts` (decision 6); `traces` after every tool's job; `home.spec.ts` |
| No adverts, analytics or tracking scripts; every script comes from the site | `script-src 'self'` plus hashes | `npm run check:csp`; `site.spec.ts` same-origin requests; `csp.spec.ts` |
| What is typed in the home page box is not sent | `ToolDirectory` filters in the page | `home.spec.ts` "keeps what is typed on the page" |
| Downloads list, cache, extensions | Browser behaviour | Release check |
| The policy blocks other-site loads and requests, in the page and its workers, tested in Chrome's and Firefox's engines | `scripts/csp.mjs`, `workerFromBlob` | `csp.spec.ts` in Chromium and in the `firefox` project |
| Not yet checked in Safari | WebKit dropped from CI (owner, 22 Nov 2026) | Issue #7 hand check; the words guard keeps the sentence (decision 5) |
| The policy does not stop links or opening pages, nor requests to the site's own address, shared on GitHub Pages | Meta policy, no `navigate-to`; `'self'` is the `github.io` origin | `privacy` spec "What the policy does not stop"; no-upload tests guard same-origin requests |
| Served by GitHub Pages, which receives the IP address and the address asked for, and may record them | `.github/workflows/pages.yml` | Release check; owner question 3 |

### 5. The guards in `tests/unit/privacy-page.test.ts`

The test reads `src/pages/privacy.astro` as text and strips tags.

- **Server guard.** While the page contains "No tool on this site runs on a server today.", every published tool must have `runsIn: 'browser'`. Otherwise it throws: "The Privacy page says no tool runs on a server, but <ids> do. Stop this change: update the Privacy page to say what happens to files sent to the server, and ask the owner to review it." A test entry with a server tool proves it trips, as the tagline guard does.
- **Words guard.** No match for `/100\s*%|\bnever\b|\bsecure(ly)?\b|\bguarantee|\bsafe(ly)?\b|\bprivate\b|\bcompletely\b|\btotally\b|\babsolutely\b|\balways\b|military|bank-grade|\banonymous/i`; no word from `bannedWords` in `tests/e2e/pages.ts` (imported, so the list is written once); no `!`; no `@`.
- **Safari guard.** The sentence "It has not yet been checked in Safari." is present. The comment says it may go only when the issue #7 hand check is done, in a change that also edits this guard.
- **Names guard.** Each of "Watermark", "Sign PDF" and "Protect with a password" in the page is the name of a published registry page, so a rename fails the test.
- **Draft guard.** While `footerPage('/privacy').written` is false, the page contains `draftSentence` from `scripts/check-seo.mjs`.

### 6. Cookies and storage on every page

The "every page keeps to the look and the rules" test in `tests/e2e/site.spec.ts` adds, after the network settles: `context.cookies()` is empty, and `localStorage`, `sessionStorage`, `indexedDB.databases()`, `caches.keys()` and the origin private file system are empty. This reuses `traces` from `tests/e2e/no-upload.ts`. "The privacy page makes no claim" becomes "the privacy page is a marked draft": one `h1` "Privacy", the first paragraph of `main` starts with "This is a draft.", and `meta[name="robots"]` is present (the existing loop already checks it for unwritten pages).

### 7. Page weight, loading and threats

- A static page with no island: a few KB of HTML by gzip, no script, no new request. `npm run weigh` and `check:csp` (no inline block) are unaffected. WebAssembly loading does not change.
- Threats: no file, file name or password is handled by this change. The only risk is a false sentence, which decisions 4 and 5 and the release check address. A hostile file name cannot reach this page.

## Risks / Trade-offs

- [A sentence goes stale when code changes elsewhere, for example a tool starts keeping a password longer] → The guards catch the server case, storage, cookies, scripts and the Safari line; the rest is the release check that the `privacy` spec already requires. The table in decision 4 is the checklist for it.
- [The hosting section is true only while the site is on GitHub Pages] → Owner question 3. If the owner launches elsewhere, the section is rewritten before launch.
- [A draft on a public preview may be read as the site's promise] → The draft line says plainly it has not been checked, and the page is `noindex`.
- [Noindex keeps "the sitemap lists every page" not passed] → As for the placeholders; one flag undoes it once the owner approves.
- [Plain words lose precision, such as "lets go of" for memory the browser frees later] → Chosen on purpose: the page claims what the code does (drops its references, revokes addresses, ends the worker), not when the browser reuses the memory.

## Migration Plan

None. Rolling back restores the placeholder and the old check-seo rule.
