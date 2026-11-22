# Proposal: add-privacy-draft

## Why

`/privacy` is still a placeholder that makes no claim. Every Phase 1 tool is built, and Phase 1 ships "Privacy page" (SPEC.md "Build phases"). The owner decided on 13 Nov 2026 that the agent drafts it from what the code does, marked as a draft for the owner's review. The facts it needs were recorded, checked against the code, in the design docs of `add-password-option`, `add-protect-pdf`, `add-content-security-policy` and `add-unlock-pdf`, and in `CLAUDE.md` entries 18 to 21. Writing them down now, while they are fresh, lets the owner review one page before launch.

## What Changes

- `src/pages/privacy.astro` stops being a placeholder. It becomes a draft in plain words (full text in design.md, decision 2), with one line at the top saying it is a draft written from the code and not yet checked by the person who runs the site. It covers:
  - what happens to a file in every published tool (all run in the browser today; no tool runs on a server, and no Phase 2 behaviour is described);
  - the worker, its own open copy of a listed file, and what the page holds and when it lets go;
  - an input file's own password, what Remove a password does to it and to restrictions, and the new password typed in Protect with a password;
  - that a new file can keep things from the old one, as each tool's page says;
  - text, drawings and pictures given to Watermark and Sign PDF;
  - what the site does not do (accounts, cookies, browser storage, adverts, analytics, scripts from elsewhere);
  - what the browser itself may do (save a password, list downloads, cache the site's files, extensions);
  - the Content Security Policy for the page, the workers only where the tests check them (Chrome and Firefox), and what it does not stop (links, other pages, WebRTC, DNS prefetch, the shared own address), with no claim about Safari's workers until the issue #7 hand check;
  - who serves the site today (GitHub Pages, which receives each visitor's IP address).
- The draft stays `written: false` in `src/site.ts`: `noindex` at the root and out of the sitemap, as the placeholders are, until the owner approves it (owner question 2). The draft sentence is written once in `src/site.ts`. `scripts/check-seo.mjs` learns it as the sentence an unwritten page may show instead of a placeholder sentence, and refuses a page marked written that still shows either.
- Tests that keep the page honest (design.md, decision 4, has the claim → code → test table):
  - a unit server guard, sharing the tagline guard's filter: while the page holds a browser-only sentence, every published tool must run in the browser (else it says to update the Privacy page and ask the owner), and while every tool does, at least one such sentence must stay, so the guard cannot switch off silently;
  - a unit test of the page's words (no "100%", "never", "secure" or other absolute claim, no banned word, no `!`, no address) and of the policy section (no worker in the unconditional sentence, the Safari sentence, the "does not stop" sentence);
  - a names guard: the tools named for text, drawings, pictures and passwords are exactly those whose registry options take them;
  - the site end-to-end test checks on every page that no cookie is set, nothing is stored, and every request is a plain `GET` for a built file; "the privacy page makes no claim" becomes a check of the draft line and its `noindex`; Merge PDF's test checks that the result and thumbnail addresses stop working after "Start again".
- No new dependency, no new component, no script on the page, no network request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `privacy`: adds what the Privacy draft must cover, how it is marked and kept from search engines until approved, that every sentence is literally true and guarded by tests, and that no page stores anything in the browser (with the Cache API allowed only for the site's own files once the phase 2 offline service worker ships).
- `look-and-feel`: "Pages only the owner writes": a page marked as an agent's draft also carries `noindex`, so "no page without a placeholder carries `noindex`" becomes "without a placeholder or a draft line".
- `tool-registry`: "Pages are generated from the registry": the sitemap also leaves out a site page that is a draft waiting for the owner's review.

## SPEC.md sections

- "Privacy, limits and security", Whole site: "The Privacy page says in plain words what happens to a file for each kind of tool, and it is checked against the code before each release." Also "The promise is simple and must be literally true", Browser tools, and the Content Security Policy line.
- "Build phases", Phase 1: "Privacy page". Site work, not a tool, so it has no catalogue position. It follows `add-search-basics`.
- "How the words should read", "Banned patterns", "Look and feel", "Pages only the owner can write" (this page is not one of them, and the draft invents no person, contact or motive).
- "Open decisions": Analytics, Money, Server host.

## Where files are processed, and requests

Nothing is processed. The page is static HTML with no island and no script, and adds no network request.

## Out of scope

- The About, Changes and Known problems pages (owner-only; never written by an agent), and the Contact page.
- Analytics of any kind, a donation link, server tools, the service worker and offline use.
- Changing any tool's own words, including the open owner question on the password notes (PR #28).
- A header-based policy, `frame-ancestors`, or a move away from GitHub Pages.

## Open decisions and owner questions touched

Each has a default this change builds.

1. **The draft's words.** All of them wait for the owner's review. Default: published on the preview as a marked draft.
2. **Draft and search engines.** Default: the draft carries `noindex` and stays out of the sitemap until the owner approves it, then a one-line change marks it written. This differs from `add-search-basics` design decision 6, which planned to mark `/privacy` written when drafted; a draft not yet checked by the owner is not offered to search engines (plainer and safer). Until then, "the sitemap lists every page" in "Definition of done, The site" stays not passed, as for the placeholders.
3. **Hosting (open: "Pages for previews only, or for launch too?").** The page says the site is served by GitHub Pages, which is true today for the only copy that exists. Default: keep it; if the owner launches elsewhere, the section is rewritten before launch. Should the page name GitHub at all?
4. **Analytics (Open decisions: assumed cookieless page counts).** None is built, so the page says there is none. Default: keep none; adding page counts later means changing this page first.
5. **Money (assumed a donation link only).** None is built; the page says there are no adverts and says nothing about donations.
6. **Contact.** There is no contact address yet, so the page gives none and does not say how to ask a question. Default: none until the owner adds one.
7. **The password-manager sentence.** The page says a browser may save or suggest a password and may copy a saved one to the browser account: the long note draft from PR #28, which the owner has not yet chosen. Default: keep the fuller words here, whichever note the tool pages end with.
8. **Error reports (optional).** Add "No error reports are sent anywhere." (true today: the site has no error reporting)? Default: no, the page stays shorter.
