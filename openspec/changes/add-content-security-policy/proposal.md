# Proposal: add-content-security-policy

## Why

`SPEC.md` "Privacy, limits and security", "Whole site", asks for "a strict Content Security Policy: scripts from the site's own origin only, plus what WebAssembly needs". The site has none yet: `add-site-skeleton` deferred it (its design, section 11), and every page and both workers currently run with no policy at all. Protect with a password is now published and takes a password; Unlock PDF is next. The program manager placed this change straight after Protect and before Unlock PDF, and it blocks launch and the Phase 1 gate (22 Nov 2026, CLAUDE.md entry 19).

A policy also turns the privacy promise into something the browser enforces: with `connect-src 'self'`, a page or a worker that tried to send a file to another origin would be stopped by the browser, not only caught by our no-upload test.

## What Changes

- Every built page carries one `<meta http-equiv="Content-Security-Policy">` tag, written into the built HTML at build time, straight after `<meta charset>` and before any stylesheet or script. GitHub Pages, where the site is previewed, cannot send headers, so the policy is a meta tag.
- The policy (design.md, decision 1):
  `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' <hashes>; style-src 'self' <hashes>; img-src 'self' blob:; connect-src 'self'; worker-src blob:; base-uri 'none'; form-action 'none'`
  where `<hashes>` are the SHA-256 hashes of exactly the inline `<script>` and `<style>` blocks that page carries (on a tool page today: Astro's island loader and its one-line `astro-island` style; on a page with no island: none).
- The hashes are computed from the built files after Astro writes them, so they cannot drift from what is served. A build check, `npm run check:csp`, run in CI after the build and inside `check:base` under a sub-path, fails if any page lacks the tag, has it in the wrong place, or carries an inline script, inline style, `style` attribute, inline event handler or `javascript:` address that the policy does not allow.
- **The policy reaches both workers.** Found while planning: a meta-tag policy is not inherited by a worker started from an ordinary same-origin address, which gets its policy only from its own response headers (none on GitHub Pages). Checked in Chromium: such a worker could call `eval` and compile WebAssembly under a page policy that forbade both, while a worker started from a `blob:` address could not. So the tool worker, and the PDF.js worker it starts, are started from a tiny `blob:` script that imports the real worker file by its full address. They then run under the page's policy, including `connect-src 'self'`. `worker-src blob:` (without `'self'`) makes this the only way a worker can start, so no worker can escape the policy.
- `'wasm-unsafe-eval'` is the one allowance beyond the site's own scripts: qpdf, and PDF.js's picture decoders, are WebAssembly. No `'unsafe-eval'` and no `'unsafe-inline'` anywhere: no shipped code uses `eval` or `new Function` (checked in the build).
- End-to-end tests watch every page and every job for policy violations: a shared test fixture records the `securitypolicyviolation` event and policy messages in the console from the page and its workers, and fails any test that sees one. Every existing end-to-end test, so every page and every tool's jobs, runs under it. A new `csp.spec.ts` proves the policy bites (an added inline script, an `eval` in a worker, a request to another origin from a worker are all blocked).

What a meta tag cannot do, recorded and not worked around: `frame-ancestors` (so another site can put a page in a frame; see design.md, Risks), `report-uri`/`report-to` and `sandbox`. A host that sends headers at launch can add `frame-ancestors 'none'` and send the same policy as a header; where the site launches is already the owner's open question ("Pages for previews only, or for launch too?").

### Out of scope

- The sitemap, structured data, social tags and the Privacy page (Phase 1 site work, separate changes). The Privacy page may later mention the policy; this change writes no page text.
- Any change on screen. No page looks or behaves differently; no words change.
- Trusted Types (`require-trusted-types-for`): Astro's island loader writes `innerHTML`, so it cannot be turned on without more work; noted for later.
- A policy sent as a header, `frame-ancestors`, and reporting: they need a host that sends headers.
- Analytics and the conversion server: neither exists yet. When either arrives, its origin is added to `connect-src` by that change.

## SPEC.md sections

- "Privacy, limits and security", "Whole site": the strict policy.
- "Privacy, limits and security", "Browser tools": the no-upload promise, now also enforced by the browser.
- "Architecture and tech stack", "Hosting" and "Analytics": static host, no third-party scripts.
- "Look and feel": "No web fonts are downloaded" (so `font-src` is `'none'`).
- "Build phases": not a tool, so no catalogue position. Placed by the program manager after Protect with a password (the 19th Phase 1 change) and before Unlock PDF; it blocks launch and the Phase 1 gate.

## Where files are processed, and requests

Nothing about where files are processed changes: browser tools stay in the browser. No network request is added. One new `blob:` address is made each time a worker starts (and one for the PDF.js worker inside it); it holds only an `import` line with the worker file's address, never file data, and is revoked when that worker is ended.

## Open decisions and owner questions touched

- **Hosting at launch** ("Pages for previews only, or for launch too?" in CLAUDE.md): touched, not decided. On GitHub Pages the policy stays a meta tag without `frame-ancestors`. No new question; the design notes what a header host would add.
- **Analytics** (assumed: cookieless page counts): none is built, so the policy allows no analytics origin. A later analytics change must widen `connect-src` or `script-src`, which that change names.
- **Which pushes publish to the preview**: unchanged. The preview's `noindex` tag is kept and still checked by `check:base`.
- No new owner question is needed: the policy follows `SPEC.md`'s words and allows only what the code uses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `privacy`: the "Content Security Policy" requirement is refined (meta tag, exact allowances, what a meta tag cannot do), and two requirements are added: the policy reaches every worker, and the policy is checked on every build and in every end-to-end test.

## Impact

- New: `scripts/csp.mjs` (plain functions: find inline blocks, hash them, build the policy, insert the tag), an Astro integration in `astro.config.mjs` that runs it on `astro:build:done`, `scripts/check-csp.mjs` and `npm run check:csp`, `src/workers/start-worker.ts` (the `blob:` start), `tests/e2e/fixtures.ts` (the watching fixture), `tests/e2e/csp.spec.ts`, unit tests for the hashing, the tag and the worker start.
- Changed: `ToolWorkspace.tsx` (how the tool worker starts; it gets the worker's address through Vite's `?worker&url`), `src/workers/tool.worker.ts` (the PDF.js worker starts the same way; the qpdf and PDF.js worker addresses are made absolute against the module's own address), `scripts/check-base.mjs` (runs the CSP check on its sub-path build), `.github/workflows/ci.yml` (one step), every end-to-end spec's `test` import, and CLAUDE.md's commands list.
- No new dependency. Page weight: about 0.3 KB more per page by gzip (the tag); the widget chunk grows by a few hundred bytes. All pages stay far under 100 KB (largest today 79.0 KB).
- When WebAssembly is fetched: unchanged (after a file is picked).
