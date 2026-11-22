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

The text is plain HTML inside `src/pages/privacy.astro`, as the other site pages are: one `h1`, `h2` sections, two `h3` headings under "Passwords", paragraphs and short lists. No island, no script, no new CSS. The 404 and placeholder pages work this way; a Markdown collection for one page would add machinery for nothing.

The draft line is the first paragraph under the heading: `<p><strong>This is a draft.</strong> It was written from what the site's code does. The person who runs this site has not yet checked it.</p>`. A plain bold sentence, not `OwnerPlaceholder`: that box means "nothing here yet", and this page has content. The wording "the person who runs this site" follows the About placeholder and names no one.

The sentence "This is a draft." is written once, as `draftSentence` in `src/site.ts` (which has no imports, so Node scripts can import it). The page, `scripts/check-seo.mjs`, the unit test and the end-to-end test all import it.

Links: the site test wants every link at least 44px tall, so an inline link in a paragraph would fail. The page needs none: it names tools in words, and says nothing that needs an outside source. No link is added.

### 2. The page text (draft for the owner)

Meta description: "What happens to your files, passwords and anything you type or draw when you use a tool on this site." Title stays "Privacy - PDFkaro".

> # Privacy
>
> **This is a draft.** It was written from what the site's code does. The person who runs this site has not yet checked it.
>
> ## In short
>
> - Every tool on this site does its work inside your browser, on your device. Your files are not uploaded, and neither is any password, text, drawing or picture you give a tool.
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
> The new file can keep things from the old one, such as its title, its accessibility tags, what was typed in form fields on pages you left out, or files attached to it. Each tool's page says what it keeps.
>
> ## How long the page holds your file
>
> The page holds your file in your browser, on your device, while you work on it. It lets go of the file when you remove or replace it, when you press "Start again", and when you close the tab or open another page in the same tab. Switching to another tab keeps it.
>
> While the file is on the page, the worker keeps its own copy open, with the file's password if it has one, to draw the pictures of its pages. It closes that copy when you remove or replace the file, and when the worker is closed.
>
> The new file is held in the same way until you start another job, press "Start again" or leave the page.
>
> The worker is closed after every job, so it keeps nothing from one job to the next. It is also closed when you press Cancel, when you press "Start again" and when you leave the page.
>
> ## Passwords
>
> ### The password of a protected file
>
> A tool asks for this password when you choose a PDF that needs one. The password goes to the worker, inside your browser, to open the file.
>
> The page keeps the password while the file is on the page, so you do not have to type it again after Cancel or a failed job. A wrong try is kept until you type another.
>
> The page forgets the password when the job has made the new file, or found nothing to change. It also forgets it when you replace or remove the file, when you press "Start again", and when you leave the page.
>
> Remove a password takes off the password you type. It also takes off print and edit restrictions, which needs no password. The new copy has no password, so anyone who has it can open it.
>
> ### A new password, in Protect with a password
>
> You type the new password twice. Only what you type in the first box goes to the worker, with the job. The second box stays on the page, to check that both match.
>
> The page keeps the new password through Cancel and a failed job, and when you choose another file in its place. It forgets the new password when the job has made the protected file. It also forgets it when you press "Start again", when you remove the file, and when you leave the page.
>
> This site does not have your password, so it cannot get it back for you. A password does not hide everything in a file. The Protect with a password page lists what can still be seen without it.
>
> Your browser may offer to save a password you type, or to suggest one. A saved password is kept by your browser and may be copied to your browser account. That is your browser's offer, and you can turn it down.
>
> ## Text, drawings and pictures
>
> Watermark asks for the text to draw. Sign PDF asks for your name, a drawing of your signature or a picture of it. What you give goes to the worker with the job, as your file does, and is drawn into the new file. In Sign PDF, only the way you chose goes with the job.
>
> A drawing goes as a list of points. The page does not turn it into a picture. A picture you choose is read by the worker, like your file.
>
> The page keeps what you gave while you work, so you can try again after Cancel or a failed job. That includes what you gave under another way in Sign PDF. The page lets go of all of it when you press "Start again", when you remove the file, and when you leave the page.
>
> ## Scripts and the home page
>
> Every script on the site comes from the site itself. What you type in the box on the home page to find a tool stays on the page.
>
> ## What your browser may do
>
> This site cannot change these.
>
> - Your browser keeps a list of your downloads, with each file's name.
> - It may keep copies of this site's pages and programs in its cache, as it does for any site. Your files are not among them.
> - Browser extensions you have added can read what is on a page.
>
> ## What the page may load and send
>
> Each page gives your browser a rule, called a Content Security Policy. Under it, your browser blocks the page from loading scripts and other files from any other address, and from sending requests to any other address.
>
> In Chrome and Firefox, the site's tests check that the same rule also holds in the workers that read your file. It has not yet been checked in Safari.
>
> The rule does not stop following a link, opening another page, a direct connection of the kind used for video calls (WebRTC), or looking up another site's address in advance (DNS prefetch). It does not limit requests to this site's own address, which on GitHub Pages is shared by every site of the same GitHub account. The site's tests check that no request carries your file, its name or a password.
>
> ## Who serves the site
>
> This site is served by GitHub Pages, a service run by GitHub. Each time your browser asks for a page or one of the site's programs, GitHub receives your IP address, the address asked for and the details your browser sends with the request, and may record them. Your files are not sent to GitHub.

About 1,000 words. No "100%", "never", "secure", "guaranteed", "safe" or "private"; no banned word; no exclamation mark; nothing in capitals for emphasis; no person, company (other than the host, named as a fact), contact or motive. The hosting sentence says only "may record", so it does not depend on GitHub's own documents.

Notes on wording, from the stage 1 review:
- "found nothing to change" covers a job that ends with no new file (Compress PDF's "could not be made smaller", Remove a password's "nothing to remove"). The page never says the password is forgotten "when the job ends": a failed or cancelled job keeps it.
- The first sentence of "What the page may load and send" speaks only of the page. Workers are named only in the sentence about Chrome and Firefox, because the policy in the file-reading workers has not been checked in Safari (`add-content-security-policy`, WebKit risk; issue #7).
- "Any other address", not "any other site": on GitHub Pages the site's own address is shared with the account's other Pages sites, which the policy allows.
- The earlier "What the site does not do" list repeated "In short"; only what was new is kept, under "Scripts and the home page".

### 3. Draft and search engines

`/privacy` stays `written: false` (owner question 2). So `Base.astro` and `sitemapPaths` need no change: the page carries `noindex` at the root and stays out of the sitemap, exactly as the placeholders do.

`scripts/check-seo.mjs` rule 8 changes:
- it imports `draftSentence` from `src/site.ts`;
- a footer page marked not written must show a placeholder sentence or `draftSentence` (today: a placeholder sentence only);
- a footer page marked written must show neither, so approving the page cannot leave the draft line behind;
- its messages and header comment say "placeholder or draft", name the page and say which flag to change in `src/site.ts`.

`tests/e2e/pages.ts` renames `placeholderPages` to `unwrittenPages`, with a comment saying "pages that still show an owner placeholder or an agent's draft", and `site.spec.ts`'s comment on `noindex` says the same.

`tests/unit/check-seo.test.ts` gains: an unwritten page showing only the draft line passes; an unwritten page showing neither fails (existing test); a written page showing the draft line fails; a written page showing a placeholder sentence fails. The comment on `FooterLink.written` in `src/site.ts` says it is false while the page shows a placeholder or an agent's draft. `add-search-basics` decision 6 planned to mark the page written when drafted; this change departs from it for the reason in proposal.md, question 2.

### 4. Claim → code → test

Each claim on the page, the code that makes it true today, and what proves it. "Release check" means no automated test watches it; it is read again against the code before each release (`privacy` "The Privacy page matches the code"). This table is the checklist for that.

| Claim | Code | Proof |
| --- | --- | --- |
| Every tool works in the browser; no tool runs on a server today | Every `runsIn: 'browser'` in `src/tools/registry.ts`; jobs go by `postMessage` in `src/workers/client.ts` | Server guard in `tests/unit/privacy-page.test.ts` (decision 5); `tests/unit/client.test.ts` "posts the file itself" |
| Files, passwords, text, drawings and pictures are not uploaded; requests carry nothing from the file, its name or a password | `useToolRun` holds files, passwords and pictures in refs and sends them only to the worker | Each tool's no-upload test (`violations` in `tests/e2e/no-upload.ts`: no body, no other origin, no secret in an address or header), in the 13 tool specs and `merge-pdf.spec.ts`; secrets include file names, typed text, picture names and passwords |
| The programs come from this site, after a file is chosen | Late loading in `tool.worker.ts`; `connect-src 'self'` | `npm run check:worker`; `site.spec.ts` "every page" (all requests same-origin); no-upload allow-lists of built files |
| The worker makes the new file and draws the page pictures; you save it with Download; nothing saves on its own | `worker-core.ts`, `thumbnail.ts`; `Result` has `<a download>` | Every tool's e2e test presses Download; `tool-page` spec |
| The file's name is shown and used to name the new file | `outputName` in `useToolRun`; names never sent | `format.test.ts` output names; no-upload secrets |
| The new file can keep title, tags, field values of left-out pages, attachments; each tool's page says what | Tools' engines (`keepPages`, Merge's first-file attachments) | Each tool's page text and engine tests (Extract, Delete, Merge); release check that the page text still says so |
| The page holds the file until remove/replace, "Start again" or leaving; switching tabs keeps it | `removeFile`, `clear`, `pagehide` → `clear` in `useToolRun.ts` | Release check (the repo has no DOM test library); `state.test.ts` for the reducer side; the new e2e step below for the result |
| The worker keeps its own open copy, with the password, while the file is on the page; closes it on remove, replace or when the worker is closed | `keptFile` and `closeDocument` in `useToolRun.ts` and `client.ts`; PDF.js document in `thumbnail.ts` | `thumbnail-plumbing.test.ts` (document kept and closed); release check for remove and replace in the page |
| The new file is held until another job, "Start again" or leaving | `releaseResult` in `start` and `clear` revokes the `blob:` address | New e2e step in `merge-pdf.spec.ts`: keep the Download `href` and a thumbnail's `blob:` address, press "Start again", then `fetch` of each in the page fails. Leaving: release check |
| The worker is closed after every job and on Cancel | `ToolClient.run` ends it in `finally`; `cancel` calls `end()` | `client.test.ts` "ends the worker when the job is done", "cancels by ending the worker"; `worker-core.test.ts` |
| The worker is closed on "Start again" and on leaving | `clear` calls `end()`; `pagehide` → `clear` | Release check |
| An input file's password: kept while on the page and through Cancel and failure; forgotten after a new file or nothing to change, replace/remove, "Start again", leaving; a wrong try kept until replaced | `runJob` `forgetInputPasswords`; `removeFile`; `clear`; `useToolRun` tickets | `run-job.test.ts`; `unlock-pdf.spec.ts` (wrong try answered last); release check for remove, replace and leaving |
| Remove a password: restrictions removed with no password; the new copy has no password and opens for anyone | `src/engines/tools/unlock-pdf.ts` (`--decrypt`, `encryptedIn` check) | `unlock-pdf.test.ts` (restrictions-only file, result not encrypted); `unlock-pdf.spec.ts` |
| A new password: only the first box goes; kept through Cancel, failure and another file chosen in its place; forgotten after the protected file, "Start again", removing the file, leaving | `jobOptions` sends `first` only; `forgetNewPasswords` in `runJob`, `removeFile`, `clear` | `run-job.test.ts`; `options.test.ts`; `protect-pdf.spec.ts` emptied-field and no-upload checks; release check for leaving |
| The site does not have the password and cannot get it back | No request carries it | `protect-pdf.spec.ts` no-upload; `password-rule.test.ts` |
| The browser may offer to save or suggest a password, and sync it | `autocomplete="new-password"` in `NewPasswordField`; `autocomplete="off"` in `PasswordField`, which browsers may still offer to save | Browser behaviour; release check |
| Text, drawings and pictures go to the worker with the job and are drawn into the file; in Sign PDF only the chosen way goes | Options in `jobOptions`; hidden options send no key (`optionsToSend`, `picturesToSend`) | `options.test.ts` (hidden option sends no key); `watermark-pdf.spec.ts`, `sign-pdf.spec.ts` no-upload |
| A drawing goes as points and is not turned into a picture; a picture is read by the worker | `DrawingPad` keeps points; pictures in a ref, `inspect-picture` in the worker | `components.test.tsx` pad source test; `sign-pdf.spec.ts` |
| What was given is kept through Cancel and failure, including other ways in Sign PDF; let go on "Start again", removing the file, leaving | Reducer `choices` reset on `reset` and on removing the last file; hidden options keep their values; `pictures` cleared in `clear` and `removeFile` | `state.test.ts` "forgets a choice when the last file is removed"; `options.test.ts`; release check for leaving |
| Tools named per input kind | `options` kinds in the registry | Names guard in `privacy-page.test.ts` (decision 5) |
| No accounts | No sign-in code anywhere | Release check |
| No cookies; nothing written to browser storage | No storage API in `src/` or the built files | New check on every page in `site.spec.ts` (decision 6); `traces` after every tool's job; `home.spec.ts`. On the live host (GitHub could set a cookie by header): release check |
| No adverts, analytics or tracking scripts; every script comes from the site | `script-src 'self'` plus hashes | `npm run check:csp`; `site.spec.ts`: every request same-origin, and, new, every request a `GET` with no body and no query string for a built file; `csp.spec.ts` |
| What is typed in the home page box stays on the page | `ToolDirectory` filters in the page | `home.spec.ts` "keeps what is typed on the page" |
| Downloads list, cache, extensions | Browser behaviour | Release check |
| The page is blocked from loading from, and sending to, other addresses | `scripts/csp.mjs` meta policy | `npm run check:csp`; `csp.spec.ts` page probes |
| In Chrome and Firefox the same rule holds in the file-reading workers | `workerFromBlob` starts both workers from `blob:` | `csp.spec.ts` in Chromium and the `firefox` project: a probe worker started the same `blob:` way, and one nested in it, have `eval` and other-origin `fetch` blocked; real jobs (Merge, PDF to JPG, Sign, Split) show `blob:` worker starts and no violation |
| Not yet checked in Safari | WebKit dropped from CI (owner, 22 Nov 2026) | Issue #7 hand check; the Safari guard keeps the sentence (decision 5) |
| The policy does not stop links, opening pages, WebRTC or DNS prefetch, nor requests to the site's own address, shared by every Pages site of the account | Meta policy; `'self'` is the `github.io` origin | `privacy` spec "What the policy does not stop"; no-upload tests guard same-origin requests; the guard keeps the sentence |
| Served by GitHub Pages, which receives the IP address, the address asked for and request details, and may record them | `.github/workflows/pages.yml` | Release check; owner question 3 |

### 5. The guards in `tests/unit/privacy-page.test.ts`

The test reads `src/pages/privacy.astro` as text, strips the frontmatter (between the first two `---` lines) and `<!-- -->` comments, then strips tags, so a comment cannot satisfy or break a guard.

- **Server guard.** One list, `browserOnlyClaims`: "Every tool on this site does its work inside your browser, on your device.", "No tool on this site runs on a server today." and the phrase "not uploaded". Two rules:
  - while every published tool has `runsIn: 'browser'`, at least one of the two sentences is on the page, so the guard cannot switch off silently by rewording;
  - while any listed claim is on the page, every published tool must have `runsIn: 'browser'`; otherwise it throws "The Privacy page says every tool runs in the browser, but <ids> do not. Stop this change: update the Privacy page to say what happens to files sent to the server, and ask the owner to review it."
  The server-tool filter is shared with `taglineProblem` in `tests/unit/site.test.ts` (moved to a small helper both import). A test entry with a server tool proves it trips.
- **Words guard.** No match for `/100\s*%|\bnever\b|\bsecure(ly)?\b|\bguarantee|\bsafe(ly)?\b|\bprivate\b|\bcompletely\b|\btotally\b|\babsolutely\b|\balways\b|military|bank-grade|\banonymous/i`; no word from `bannedWords` in `tests/e2e/pages.ts` (imported, so the list is written once); no `!`; no `@`.
- **Policy guard.**
  - The sentence "It has not yet been checked in Safari." is present, exactly. The comment says it may go only when the issue #7 hand check is done, in a change that also edits this guard.
  - The section's first paragraph (the unconditional claim) does not contain "worker"; workers are named only in the paragraph that starts "In Chrome and Firefox".
  - The "does not stop" sentence is present and names a link, another page, WebRTC, DNS prefetch and the site's own address.
- **Names guard.** From the registry, the page names of published tools whose options include a `text`, `drawing` or `picture` option must be exactly the tool names the "Text, drawings and pictures" section mentions, both ways; today Watermark and Sign PDF. The page names of tools with a `new-password` option, plus Remove a password (the one tool whose job is the input file's password; listed by id `unlock-pdf` in the test, with a comment), must be exactly the tool names the "Passwords" section mentions; today Protect with a password and Remove a password. A tool that gains such an option, or a rename, fails the test with a message to update the page.
- **Draft guard.** While `footerPage('/privacy').written` is false, the page contains `draftSentence` from `src/site.ts`.

### 6. Checks in the site end-to-end test

- `tests/e2e/no-upload.ts` exports `expectNothingStored(page, context)`, built on `traces`: no cookie, and `localStorage`, `sessionStorage`, `indexedDB.databases()`, `caches.keys()` and the origin private file system all empty. Tools' own tests may move to it later; this change does not touch them.
- "Every page keeps to the look and the rules" in `site.spec.ts` calls it after the network settles, and also requires every request to be a `GET` with no body and no query string, for the site's own address.
- "The privacy page makes no claim" becomes "the privacy page is a marked draft": one `h1` "Privacy", the first paragraph of `main` starts with `draftSentence`, and `meta[name="robots"]` is present.
- `merge-pdf.spec.ts` gains the step in the claim table: after a job, keep the Download `href` and one thumbnail's `blob:` address, press "Start again", and check that `fetch` of each in the page now fails.

### 7. Page weight, loading and threats

- A static page with no island: a few KB of HTML by gzip, no script, no new request. `npm run weigh` and `check:csp` (no inline block) are unaffected. WebAssembly loading does not change.
- Threats: no file, file name or password is handled by this change. The only risk is a false sentence, which decisions 4 and 5 and the release check address. A hostile file name cannot reach this page.

## Risks / Trade-offs

- [A sentence goes stale when code changes elsewhere, for example a tool starts keeping a password longer] → The guards catch the server case, storage, cookies, scripts, the input kinds, the Safari line and the "does not stop" line; the rest is the release check that the `privacy` spec already requires. The table in decision 4 is the checklist for it.
- [Offline use in phase 2 adds a service worker cache] → The `privacy` requirement allows no Cache API entry only until the offline service worker ships. The change that adds it must rewrite the page's storage sentences ("writes nothing to your browser's storage", the cache line) and change the `caches.keys()` check in `expectNothingStored` and the tools' tests to allow only the site's own pages and engines.
- [The hosting section is true only while the site is on GitHub Pages] → Owner question 3. If the owner launches elsewhere, the section is rewritten before launch, together with the shared-address sentence.
- [A draft on a public preview may be read as the site's promise] → The draft line says plainly it has not been checked, and the page is `noindex`.
- [Noindex keeps "the sitemap lists every page" not passed] → As for the placeholders; one flag undoes it once the owner approves.
- [Plain words lose precision, such as "lets go of" for memory the browser frees later] → Chosen on purpose: the page claims what the code does (drops its references, revokes addresses, ends the worker), not when the browser reuses the memory.

## Migration Plan

None. Rolling back restores the placeholder and the old check-seo rule.
