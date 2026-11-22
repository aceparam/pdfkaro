# Design: add-content-security-policy

## Context

See proposal.md for why. What the build and the code do today, read from `npm run build` at `5dec1cd` (23 pages):

- **Inline blocks.** Pages with no island (404, About, Changes, Contact, Known problems, Privacy) carry no inline `<script>`, no `<style>` and no `style` attribute. Every page with an island (the home page and 16 tool pages) carries one inline `<style>` (`astro-island,astro-slot,astro-static-slot{display:contents}`, 59 bytes) and two inline `<script>`s from Astro: the island element (4,896 bytes, the same on every page) and one directive loader, `client:load` on tool pages and `client:idle` on the home page. That is four distinct hashes across the site:
  - style `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=` (17 pages)
  - island element `sha256-UIrFqcaitjA3OKa9mHKajg3N+0Y7tW9+y0o3QmMFeZQ=` (17 pages)
  - `client:load` loader `sha256-1BvDVWLr3QCC20uHhUDi27eDFVJpk1uMQJGIWKUks2I=` (16 pages)
  - `client:idle` loader `sha256-xIb/Pa7FUshAu4ihwjchYcQpyCI8eS8kt40GpOAYCz8=` (home page)
  These are recorded as evidence only; the build computes them, and they change whenever Astro changes its loader.
- **No `style` attribute, inline handler, `<form>`, `<base>` or `javascript:` address** in any built page. `inlineStylesheets: 'never'` (`astro.config.mjs`) already keeps stylesheets in files. The one `style={…}` in components (`ProgressBar`, a width) is not in the server HTML: React sets it at run time through the CSSOM (`element.style`), which a policy does not govern.
- **Where scripts come from.** Every `<script>`/module and every dynamic `import()` is a same-origin file under `/_astro/` (or `/<base>/_astro/` under a sub-path). No shipped file calls `eval`, `new Function` or `Function(` (grep over `dist/_astro/*.js|*.mjs`; PDF.js 6 no longer has `isEvalSupported` or font compiling; the only "new Function" in `pdf.worker.min.mjs` is `new FunctionBasedShading`). React's `createElement('style')` path (for `<style precedence>`) and PDF.js's `FontLoader` style element are unused (no such resources; `disableFontFace: true`, and PDF.js runs only in workers).
- **WebAssembly.** qpdf (`qpdf.js` uses `WebAssembly.instantiateStreaming`, fetching `/_astro/qpdf-*.wasm`), and PDF.js's picture decoders (bundled as script data in `pdfjs-data`, compiled in the PDF.js worker). Both run only in workers.
- **Requests the site makes.** Same-origin scripts and stylesheets; one `fetch` of `qpdf-*.wasm` (connect-src); `blob:` images for thumbnails (`useToolRun` makes them with `URL.createObjectURL`); a `blob:` address for the download link (a download, not governed by the policy). PDF.js's `wasmUrl` is `data:,/` on purpose so that its JavaScript fallback fails without the network; with WebAssembly allowed it is never asked for, and if it were, `connect-src 'self'` blocks it, which is the intent.
- **Workers.** `ToolWorkspace.tsx` starts `new Worker(new URL('../../workers/tool.worker.ts', import.meta.url), { type: 'module' })`; the tool worker starts PDF.js's worker as `new Worker(pdfjsWorkerUrl, { type: 'module' })`, where `pdfjsWorkerUrl` and `qpdfWasm` are Vite `?url` imports, written in the built worker as root-relative strings (`/_astro/pdf.worker.min-*.mjs`, `/_astro/qpdf-*.wasm`).
- **No policy reaches those workers today, and a meta tag would not change that.** By the HTML standard a worker's policy comes from its creator only when its address is a local scheme (`blob:`, `data:`); otherwise from its own response headers. Checked in Chromium (Playwright, a page with a meta policy of `default-src 'none'; script-src 'self'; worker-src 'self' blob:`): a worker from `/w.js` ran `eval('1+1')` and compiled WebAssembly; the same file imported from a `blob:` worker had both blocked. Firefox and WebKit are not installed here; the HTML standard says the same, and the hand checks below cover them.
- **Astro's own `security.csp` (Astro 6+, here 7.4.8)** was tried in a scratch build: it writes a meta tag, but puts every directive-loader hash (seven) on every page, including pages with no script, places the tag after the title and description, and warns about Shiki. See decision 2.

## Goals / Non-Goals

**Goals:**

- One exact policy on every page, allowing only what the code uses, with hashes that cannot drift.
- The policy reaches every worker, so file-handling code also runs with `connect-src 'self'` and no `eval`.
- A build check and an end-to-end watch that fail on any gap.
- Nothing visible changes; page weight and late loading stay as they are.

**Non-Goals:**

- Headers, `frame-ancestors`, reporting, Trusted Types (proposal, Out of scope).
- Making `astro dev` run under the policy. The integration runs on `astro build` only; the dev server injects its own inline scripts. End-to-end tests run against the build.

## Decisions

### 1. The policy

```
default-src 'none';
script-src 'self' 'wasm-unsafe-eval' <hashes of this page's inline scripts>;
style-src 'self' <hashes of this page's inline styles>;
img-src 'self' blob:;
connect-src 'self';
worker-src blob:;
base-uri 'none';
form-action 'none'
```

(Written on one line in the tag, directives separated by `; `.)

- **`default-src 'none'`** over `'self'`: anything not named is denied, so a new kind of load (font, frame, media, manifest, object) fails loudly in the end-to-end watch instead of passing quietly. It covers `font-src` (no web fonts, `SPEC.md` "Look and feel"), `object-src`, `frame-src`, `media-src` and `manifest-src`.
- **`script-src 'self' 'wasm-unsafe-eval'` + hashes.** `'self'` matches the origin, so it holds under the preview's sub-path too. `'wasm-unsafe-eval'` is "what WebAssembly needs" and nothing more: it allows compiling WebAssembly, not `eval`. It is on every page, though only tool pages start a worker: one policy shape everywhere is easier to read and test, and on a page with no worker it allows nothing that page does. No `'strict-dynamic'`: it would make `'self'` ignored and let any script our scripts add load from anywhere. No `'unsafe-inline'` and no `'unsafe-eval'`.
- **Hashes are per page**, exactly the page's own inline blocks: a page with no island lists none, the home page lists the `client:idle` loader and tool pages the `client:load` loader. SHA-256, base64, over the exact text between the tags, as the browser hashes it.
- **`style-src 'self'` + hashes.** Stylesheets are files; the one inline style is hashed. Style attributes stay blocked (a hash does not allow them without `'unsafe-hashes'`, which is not used); none are in the HTML, and React's run-time width goes through the CSSOM.
- **`img-src 'self' blob:`.** Thumbnails are `blob:` images. `'self'` is kept so a browser's own request for `/favicon.ico` is not reported as a violation; no `data:`.
- **`connect-src 'self'`.** The qpdf `.wasm` fetch. With the policy in the workers (decision 3), this is the browser-enforced form of the no-upload promise. Analytics or the conversion server, when they come, are added by their own change.
- **`worker-src blob:` without `'self'`.** Every worker starts from a `blob:` address (decision 3). Leaving `'self'` out means no code can start a worker straight from a same-origin address, which would run with no policy. A `blob:` address can only be made by script already running on the page, which the rest of the policy limits.
- **`base-uri 'none'`, `form-action 'none'`.** The site uses no `<base>` and no form (checked). They are not covered by `default-src`.
- **No `upgrade-insecure-requests`.** Every address is relative to the HTTPS page, so there is nothing to upgrade, and over `http://localhost` in tests it would only add risk.
- **Not possible in a meta tag:** `frame-ancestors`, `report-uri`/`report-to`, `sandbox` (browsers ignore them there and warn). See Risks.

### 2. Written into the built HTML by a small integration of our own

`scripts/csp.mjs` holds plain functions, Node only, no DOM: `inlineBlocks(html)` (each inline `<script>` and `<style>` body, in order), `hashOf(text)` (`'sha256-…'`), `policyFor(html)` (the string above with that page's hashes) and `withPolicy(html)` (inserts `<meta http-equiv="Content-Security-Policy" content="…">` straight after `<meta charset="utf-8">`; throws if there is no charset tag, if a policy tag is already there, or if a script, stylesheet or link comes before the charset tag). `astro.config.mjs` adds a tiny integration, `cspMeta()`, whose `astro:build:done` hook runs `withPolicy` over every `.html` file in the output directory, so the hashes are taken from the files exactly as served. It runs in every build, the sub-path build of `check:base` included.

Alternatives:
- **Astro's `security.csp`.** Maintained by Astro, but adds seven loader hashes to every page (four of them for directives the site never uses, and all of them on pages with no script), puts the tag after the title, and prints a Shiki warning on every build. Its output is not as strict as `SPEC.md` asks, and we would still need our own check. Rejected for now; it can replace `withPolicy` later if it learns per-page hashes, with the same check and tests.
- **Writing the tag in `Base.astro`.** Astro adds its loader scripts after the layout renders, so the layout cannot know their hashes; hard-coding them would drift on the next Astro update.
- **Hashes in a config list.** Drifts; rejected for the same reason.

### 3. Workers start from a `blob:` address that imports the real file

`src/workers/start-worker.ts`, one plain function:

```ts
startWorker(file: string, base: string): { worker: Worker; end(): void }
```

It resolves `file` against `base` to a full `https://…` address, makes a `Blob` holding exactly `import "<address>";` (the address through `JSON.stringify`), starts `new Worker(blobUrl, { type: 'module' })`, and returns an `end()` that terminates the worker and revokes the `blob:` address. The worker file runs at its plain address, so the "one copy of each module per address" rule in `tool.worker.ts` still holds, and its own `import()`s resolve against its real address (`import.meta.url`).

- **The tool worker.** `ToolWorkspace.tsx` imports the worker's address with Vite's `import toolWorker from '../../workers/tool.worker.ts?worker&url'` and starts it with `startWorker(toolWorker, location.href)`. The worker client already ends the worker after every job; it calls `end()`. `check:worker` must still find exactly one `tool.worker-*.js`; if `?worker&url` names the file differently, its pattern or `chunkFileNames` is adjusted in the same task.
- **The PDF.js worker.** `tool.worker.ts` starts it with `startWorker(pdfjsWorkerUrl, import.meta.url)`; it ends when the tool worker ends.
- **Absolute addresses inside the tool worker.** In a worker started from `blob:`, a root-relative address such as `/_astro/qpdf-*.wasm` cannot be resolved against the worker's own address (a `blob:` address has no path). So `qpdfWasm` and `pdfjsWorkerUrl` are passed as `new URL(…, import.meta.url).href`. Module `import()`s already use `./` paths against `import.meta.url` and are unaffected. Emscripten's `locateFile` already returns our address.
- **The `blob:` start holds no file data.** A unit test checks the text is exactly one `import` of a same-origin `/_astro/` address and that `end()` revokes it. The existing no-upload watcher already accepts same-origin `blob:` GET requests and refuses any other, so it needs no widening; the picture-option source check (`createObjectURL` banned in `PictureField` and the picking code) is unaffected, as the start lives in `src/workers/`.

Alternatives:
- **Leave workers without a policy until a header host.** Simplest, but then the code that reads files, qpdf and PDF.js, the part a hostile PDF attacks, runs with no `connect-src`, so the policy would protect the part of the site that holds no file. Rejected.
- **`worker-src 'self' blob:`.** Keeps a way to start a worker with no policy; rejected (decision 1).
- **Inline the worker as a `blob:` of its whole code.** Breaks late loading and the per-engine files `check:worker` checks; rejected.

### 4. Checks

- **`scripts/check-csp.mjs` (`npm run check:csp`, optional directory argument, default `dist`).** For every `.html` file: exactly one policy tag; it comes straight after the charset tag and before any `<script>`, `<link>` or `<style>`; its directives are exactly the set in decision 1 (no `'unsafe-inline'`, `'unsafe-eval'`, `'strict-dynamic'`, `data:`, `*` or other origin); every inline `<script>`/`<style>` body's hash is listed, and no hash is listed that is not on the page; no `style=` attribute, no `on…=` attribute, no `javascript:` address; no `<script src>` or `<link href>` outside the site. It finds blocks and computes hashes with its own small code, not `scripts/csp.mjs`, so a mistake in one is caught by the other. CI runs it after the build; `check:base` runs it on its sub-path build.
- **Unit tests (`tests/unit/csp.test.ts`).** `hashOf` against the known value of Astro's style block (`sha256-vv9IoKo7…`, the same value a browser computes); `inlineBlocks` on scripts with attributes, `type="module"` with `src` (not inline), empty blocks and two blocks with the same body; `policyFor` on a page with no block and with each kind; `withPolicy` placement, refusal of a second tag and of a script before the charset tag; `check-csp` refusing each problem on a small made-up page. `tests/unit/start-worker.test.ts` for the `blob:` text, address resolution with and without a sub-path, and revoking.
- **End-to-end watch (`tests/e2e/fixtures.ts`).** Extends Playwright's `test` with an automatic fixture: an init script records every `securitypolicyviolation` event on the document; `page.on('console')`, plus `worker.on('console')` for each worker where Playwright gives one, record messages naming a Content Security Policy; after each test, any record fails it with the blocked address and directive. Every spec imports `test` and `expect` from `./fixtures` instead of `@playwright/test`; a unit test fails if any spec in `tests/e2e/` imports `test` from `@playwright/test`. A test that blocks something on purpose (only `csp.spec.ts`) opts out with a fixture option, and asserts the violation instead.
- **`tests/e2e/csp.spec.ts`.** For every page in `allPages`: one policy tag, first after the charset tag. Positive controls, so the policy is shown to bite: an added inline script (`page.addScriptTag({ content })`) does not run and raises a violation; a script from another origin is blocked; `fetch` to another origin from the page is blocked; starting `new Worker('/_astro/tool.worker-*.js')` from the page is refused; after a file is picked on Merge PDF, in the tool worker, `eval('1')` throws and a `fetch` to `http://127.0.0.1:<port>/` (another origin, same test server) is blocked, with no such request seen by the server; qpdf still runs (the merge finishes). If Playwright reaches the nested PDF.js worker, the same two checks run there; if not, that is recorded and the hand checks cover it.
- **Existing tests stay as they are.** Playwright's own `page.evaluate`, init scripts and routes are not limited by the page's policy, so existing tests need no change beyond the import. `site.spec.ts` "loads no script" still holds (the tag is not a script).

### 5. Page weight and loading

The tag is about 330 bytes on a page with no island and about 480 on a tool page, roughly 0.2–0.3 KB by gzip. Largest page today 79.0 KB of 100 KB. `startWorker` adds a few hundred bytes to the widget chunk, which loads after a pick as now. No new request, no new dependency, WebAssembly fetched when it is now.

## Threats considered

- **Malicious PDF.** A parser bug in PDF.js or qpdf that leads to script running in a worker can no longer `eval`, load script from elsewhere or send data to another origin: `connect-src 'self'` and `script-src` now apply in both workers (decision 3). It could still post messages to the page, as today.
- **Injected markup on a page** (a future bug that writes untrusted HTML): inline scripts, handlers and `javascript:` addresses do not run; `<base>` and forms are refused; nothing loads from another origin.
- **Oversized file, hostile file name:** unchanged; names are never put in HTML, and the policy adds a second wall against a name reaching a request.
- **Supply chain:** a compromised dependency is same-origin code and is not stopped from running, but it cannot send data to another origin from the page or a worker, or load more code from one.
- **Clickjacking:** not covered; see Risks.

## Risks / Trade-offs

- **[No `frame-ancestors` on GitHub Pages]** Another site can put a PDFkaro page in a frame and draw over it to trick clicks. Harm is small: files never leave the visitor's device, the framing site cannot read the frame, and the site has no account or setting to change. → Recorded on the change and, through the Privacy and hosting questions, for launch: a host that sends headers adds `frame-ancestors 'none'` (and the same policy as a header). No frame-busting script is added: it can be defeated by the framing page and adds script to every page for little gain.
- **[Firefox and Safari start module workers from `blob:` differently]** Supported in current Firefox and Safari, but CI runs Chromium only. → Hand checks in issue #7: one job of each engine kind (qpdf, PDF.js drawing, pdf-lib, zip) in Firefox and Safari, desktop and phone, on the preview. If one fails there, the fallback is decision 3's rejected first alternative for that browser, which the owner would be told of.
- **[A worker started from `blob:` breaks a test route or a request check]** `context.route` and the no-upload watcher see worker requests today. → Every existing end-to-end test must pass unchanged; the watcher already accepts same-origin `blob:` requests.
- **[Astro changes its loader]** New hashes; nothing to update by hand, since they come from the built files. If Astro adds a `style` attribute or handler, `check:csp` fails the build, which is wanted.
- **[`'wasm-unsafe-eval'` on pages with no worker]** Allows WebAssembly compiling where none is used. Accepted for one policy shape; `SPEC.md` allows it.
- **[A browser without `'wasm-unsafe-eval'`]** Very old Safari (before 16) would block WebAssembly. `SPEC.md` asks for current browsers.
- **[Dev server]** No policy in `astro dev`; a violation shows only in the build. The end-to-end tests and `check:csp` run on the build, so CI catches it.

## Migration Plan

The tag and the worker start ship together in one pull request; the preview shows them after merge. Rollback is reverting the pull request. The first preview deploy is checked by hand under `/pdfkaro/` (one job, no console violations), since `check:base` reads files and does not run a browser.
