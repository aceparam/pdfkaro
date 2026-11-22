# Proposal: add-content-security-policy

## Why

`SPEC.md` "Privacy, limits and security", "Whole site", asks for "a strict Content Security Policy: scripts from the site's own origin only, plus what WebAssembly needs". The site has none yet: `add-site-skeleton` deferred it (its design, section 11), so every page and both workers run with no policy at all. Protect with a password is now published and takes a password, and Unlock PDF is next. The program manager placed this change straight after Protect and before Unlock PDF. It blocks launch and the Phase 1 gate (22 Nov 2026, CLAUDE.md entry 19).

A policy also adds a wall the browser enforces behind the privacy promise. With `connect-src 'self'`, the browser stops requests to other origins from the page and its workers (fetch, XHR, `sendBeacon`, WebSocket, EventSource), and loads of scripts, styles, images, fonts, frames and objects from other origins. It does not stop everything. Page navigation, opening a window, link clicks, a meta refresh, WebRTC and DNS prefetching are outside a policy's reach, and so are requests to the site's own origin. So the no-upload test stays the guard for the page (design.md, decision 1).

## What Changes

- Every built page carries one `<meta http-equiv="Content-Security-Policy">` tag, written into the built HTML at build time, straight after `<meta charset>` and before any stylesheet or script. GitHub Pages, where the site is previewed, cannot send headers, so the policy is a meta tag.
- The policy (design.md, decision 1):
  `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' <hashes>; style-src 'self' <hashes>; img-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'`
  `<hashes>` are the SHA-256 hashes of exactly the inline `<script>` and `<style>` blocks the browser would run or apply on that page. On a tool page today that is Astro's island loader and its one-line `astro-island` style. A page with no island has none. A data block such as JSON-LD is not hashed.
- The hashes are taken from the built files after Astro writes them, so they cannot drift from what is served. A build check, `npm run check:csp`, runs in CI after the build and inside `check:base` under a sub-path. It fails if a page lacks the tag, has it in the wrong place, or carries an inline script or style the policy does not allow, a `style` attribute, an inline event handler or a `javascript:` address.
- **The policy reaches both workers.** Found while planning: a meta-tag policy is not inherited by a worker started from an ordinary same-origin address. Such a worker gets its policy only from its own response headers, and GitHub Pages sends none. This was checked in Chromium. Under a page policy that forbade both, a worker from `/w.js` could call `eval` and compile WebAssembly. A worker started from a `blob:` address could do neither, nor fetch from another origin. The same held for a worker it started in turn.
  - So the tool worker, and the PDF.js worker it starts, are started from a tiny `blob:` script that imports the real worker file by its full address. Both then run under the page's policy.
  - `worker-src` must still allow `'self'`, because the import from inside the `blob:` script is fetched as a worker script.
  - A rule in the code, not in the policy, keeps every worker on this path. A lint rule allows `new Worker` and `new SharedWorker` only in the one start helper. A check of the built files finds `new Worker(` only in that helper's code, plus PDF.js's display file, which never starts one here.
- `'wasm-unsafe-eval'` is the one allowance beyond the site's own scripts, because qpdf and PDF.js's picture decoders are WebAssembly. There is no `'unsafe-eval'` and no `'unsafe-inline'` anywhere. No shipped code uses `eval` or `new Function` (checked in the build).
- End-to-end tests watch every page and every job for violations. A shared test fixture listens for the `securitypolicyviolation` event on the page, and on the scope of each worker, the PDF.js worker included. Any test that sees a violation fails. Every existing end-to-end test runs under it, so every page and every tool's jobs are covered.
- A new `csp.spec.ts` proves the policy actually blocks things, including inside a worker started the same way and a worker nested in it. Its worker checks and one ordinary job of each engine kind also run in Firefox and WebKit in CI.

A meta tag cannot carry `frame-ancestors`, `report-uri`/`report-to` or `sandbox`. This is recorded, not worked around (design.md, Risks). A host that sends headers at launch can add `frame-ancestors 'none'` and send the same policy as a header. Where the site launches is already the owner's open question ("Pages for previews only, or for launch too?").

### Out of scope

- The sitemap, structured data, social tags and the Privacy page. These are Phase 1 site work in separate changes. design.md lists the facts the Privacy page will need. This change writes no page text.
- Any change on screen. No page looks or behaves differently, and no words change.
- Trusted Types (`require-trusted-types-for`). Astro's island loader writes `innerHTML`, so it cannot be turned on without more work. Noted for later.
- A policy sent as a header, `frame-ancestors`, and reporting. They need a host that sends headers.
- Analytics and the conversion server. Neither exists yet. When either arrives, that change adds its origin to `connect-src`.

## SPEC.md sections

- "Privacy, limits and security", "Whole site": the strict policy.
- "Privacy, limits and security", "Browser tools": the no-upload promise, now backed by the browser for requests to other origins.
- "Architecture and tech stack", "Hosting" and "Analytics": a static host and no third-party scripts.
- "Look and feel": "No web fonts are downloaded", so no font source is allowed.
- "Build phases": this is not a tool, so it has no catalogue position. The program manager placed it after Protect with a password (the 19th Phase 1 change) and before Unlock PDF. It blocks launch and the Phase 1 gate.

## Where files are processed, and requests

Where files are processed does not change: browser tools stay in the browser. No network request is added. One `blob:` address is made each time the tool worker starts, and one for the PDF.js worker inside it. It holds only an `import` line with the worker file's address, never file data. The tool worker's address is revoked when that worker is ended, and the nested one ends with it.

## Open decisions and owner questions touched

- **Hosting at launch** ("Pages for previews only, or for launch too?" in CLAUDE.md): touched, not decided.
  - On GitHub Pages the policy stays a meta tag without `frame-ancestors` or reporting.
  - On the preview, `'self'` means the whole `aceparam.github.io` origin, which covers every Pages site of that account. It is not narrowed to a path now, because path matching in a policy is dropped after a redirect and would not change what the no-upload test guards.
  - No new question. After merge, one clause is added to that question in CLAUDE.md (see tasks, follow-up).
- **Analytics** (assumed: cookieless page counts): none is built, so the policy allows no analytics origin. A later analytics change must widen `connect-src` or `script-src`, and that change names it.
- **Which pushes publish to the preview**: unchanged. The preview's `noindex` tag is kept and still checked by `check:base`.
- If a browser ever needs a different way to start workers, that goes back to security review and to the owner as a decision. The shared `worker-src` is never widened for it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `privacy`: the "Content Security Policy" requirement is refined. It now states the meta tag, the exact allowances, what the policy does not stop, and what a meta tag cannot carry. Two requirements are added: the policy reaches every worker, and the policy is checked on every build and in every end-to-end test.

## Impact

- **New files:**
  - `scripts/csp.mjs`: plain functions that find runnable inline blocks, hash them, build the policy and insert the tag.
  - An Astro integration in `astro.config.mjs` that runs it on `astro:build:done`.
  - `scripts/check-csp.mjs` and `npm run check:csp`.
  - `src/workers/start-worker.ts`, which starts a worker from a `blob:` address.
  - `src/hooks/tool-worker.ts` (`createToolWorker`).
  - `tests/e2e/fixtures.ts` (the watch, plus `watchPolicy(context)` for tests that open their own context).
  - `tests/e2e/csp.spec.ts`.
  - Unit tests for the hashing, the tag, the check and the worker start.
- **Changed files:**
  - `ToolWorkspace.tsx`, which takes `createToolWorker` from the hook.
  - `src/workers/tool.worker.ts`. The PDF.js worker starts the same way, and the qpdf and PDF.js worker addresses are made absolute against the module's own address.
  - `scripts/check-worker.mjs`, which checks where `new Worker(` appears.
  - `scripts/check-base.mjs`, which runs the CSP check on its sub-path build.
  - `eslint.config.js`. The new rules ban `new Worker` outside the start helper, and in e2e specs ban importing `test` from `@playwright/test`.
  - `playwright.config.ts`, which gains `firefox` and `webkit` projects for the policy checks.
  - `.github/workflows/ci.yml`, with one step plus the extra browsers.
  - Every end-to-end spec's `test` import.
  - Four test helpers that fetched a `blob:` address, read a worker's own address or listed every `Blob` the page made, which the policy and the `blob:` start change (design.md decision 4, "Existing tests stay as they are, except four helpers"). Each keeps its assertion.
  - CLAUDE.md's commands list.
  - `tests/e2e/no-upload.ts` stays byte-for-byte unchanged.
- **Dependencies:** none new. Firefox and WebKit are Playwright's own browsers, installed in CI only.
- **Page weight:** about 0.3 KB more per page by gzip for the tag, and a few hundred bytes more in the chunks loaded after a pick. The largest page today is 79.0 KB of the 100 KB budget.
- **When WebAssembly is fetched:** unchanged, after a file is picked.
- **Review note:** the ux-designer was not run at stage 1 because nothing visible changes. It is required at stage 2, comparing task 4.4's screenshots against `main`.
