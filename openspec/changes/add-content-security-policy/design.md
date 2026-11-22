# Design: add-content-security-policy

## Context

See proposal.md for why. These facts come from reading the output of `npm run build` at `5dec1cd` (23 pages), and from probes run in Chromium (Playwright 1.63) in the scratchpad.

- **Inline blocks.**
  - Pages with no island (404, About, Changes, Contact, Known problems, Privacy) carry no inline `<script>`, no `<style>` and no `style` attribute.
  - Every page with an island (the home page and 16 tool pages) carries one inline `<style>`: `astro-island,astro-slot,astro-static-slot{display:contents}`, 59 bytes.
  - The same pages carry two inline `<script>`s from Astro, neither with a `type`. One is the island element, 4,896 bytes and the same on every page. The other is one directive loader: `client:load` on tool pages and `client:idle` on the home page.
  - That is four distinct hashes across the site:
    - style `sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=` (17 pages)
    - island element `sha256-UIrFqcaitjA3OKa9mHKajg3N+0Y7tW9+y0o3QmMFeZQ=` (17 pages)
    - `client:load` loader `sha256-1BvDVWLr3QCC20uHhUDi27eDFVJpk1uMQJGIWKUks2I=` (16 pages)
    - `client:idle` loader `sha256-xIb/Pa7FUshAu4ihwjchYcQpyCI8eS8kt40GpOAYCz8=` (home page)
  - These are recorded as evidence only. The build computes them, and they change whenever Astro changes its loader.
- **Nothing else inline.** No built page has a `style` attribute, inline handler, `<form>`, `<base>` or `javascript:` address. `inlineStylesheets: 'never'` in `astro.config.mjs` already keeps stylesheets in files. The one `style={…}` in components is `ProgressBar`'s width. It is not in the server HTML; React sets it at run time through the CSSOM (`element.style`), which a policy does not govern.
- **Where scripts come from.**
  - Every `<script>`, module and dynamic `import()` is a same-origin file under `/_astro/`, or `/<base>/_astro/` under a sub-path.
  - No shipped file calls `eval`, `new Function` or `Function(`. This was checked with grep over `dist/_astro/*.js` and `*.mjs`. PDF.js 6 no longer has `isEvalSupported` or font compiling. The only "new Function" in `pdf.worker.min.mjs` is `new FunctionBasedShading`.
  - Two style-element paths exist and are unused. React's `createElement('style')` is for `<style precedence>` resources, which the site has none of. PDF.js's `FontLoader` style element is off because of `disableFontFace: true`, and PDF.js runs only in workers.
- **WebAssembly.** qpdf's `qpdf.js` uses `WebAssembly.instantiateStreaming` and fetches `/_astro/qpdf-*.wasm`. PDF.js's picture decoders are bundled as script data in `pdfjs-data` and compiled in the PDF.js worker. Both run only in workers.
- **Requests the site makes.**
  - Same-origin scripts and stylesheets.
  - One `fetch` of `qpdf-*.wasm`, governed by `connect-src`.
  - `blob:` images for thumbnails, which `useToolRun` makes with `URL.createObjectURL`.
  - A `blob:` address for the download link. That is a download, not governed by the policy.
- **PDF.js's `data:,/` fallback.** PDF.js's `wasmUrl` is set to `data:,/`. PDF.js asks our factory for the WebAssembly decoder bytes (`useWorkerFetch: false`). Only if compiling them fails does it load its JavaScript fallback, with a dynamic `import()` of `data:,/openjpeg_nowasm_fallback.js` (or the JBIG2 one). That is governed by `script-src`, which does not allow `data:`, so the policy blocks it. With `'wasm-unsafe-eval'` allowed it is never asked for. If it were, the blocked import would be a violation, which the end-to-end watch reports, and the decoder would fail as designed.
- **Workers today.** `ToolWorkspace.tsx` starts `new Worker(new URL('../../workers/tool.worker.ts', import.meta.url), { type: 'module' })`. The tool worker starts PDF.js's worker as `new Worker(pdfjsWorkerUrl, { type: 'module' })`. `pdfjsWorkerUrl` and `qpdfWasm` are Vite `?url` imports, written in the built worker as root-relative strings (`/_astro/pdf.worker.min-*.mjs`, `/_astro/qpdf-*.wasm`).
  - The built `new Worker(` calls are in `ToolWorkspace-*.js`, `tool.worker-*.js` and PDF.js's display file `pdf-*.js`.
  - `pdf-*.js` has two. One is PDF.js's own worker, which is not started because we set `GlobalWorkerOptions.workerPort`. The other is its renderer worker, which starts only if `GlobalWorkerOptions.rendererSrc` is set. We never set it, and with it unset PDF.js throws before calling `new Worker`.
- **A meta tag does not reach those workers.** By the HTML standard, a worker inherits its creator's policy only when its address is a local scheme (`blob:`, `data:`). Otherwise the policy comes from the worker's own response headers. Probes in Chromium, with a page meta policy that denies `eval` and other origins:
  1. A worker from `/w.js` ran `eval('1+1')` and compiled WebAssembly.
  2. The same file imported from a `blob:` worker had `eval` blocked, WebAssembly blocked (without `'wasm-unsafe-eval'`), and a fetch to another origin blocked. The other origin's server received nothing.
  3. A `blob:` worker started inside that one, importing a file the same way, was blocked the same way.
  4. With `worker-src blob:` (no `'self'`), no worker started at all. The `import` inside the `blob:` script is fetched as a worker script, so `worker-src` applies to it. The architect's stage 1 measurement found the same.
  5. Playwright reported both the outer and the nested `blob:` worker through `page.on('worker')`. A `securitypolicyviolation` listener on each worker's scope saw its own violations (`script-src eval`, `connect-src <address>`). A listener on the document did not see them.
  6. Without a listener, a violation leaves no message in the console of the page or of the worker. Init scripts do not reach workers, and Playwright's `evaluate` is not limited by the `eval` rule (architect, stage 1).

  Firefox and WebKit are not installed in this container. Per the coordinator's instruction they are not installed locally; they run in CI (decision 4).
- **Astro's own `security.csp`** (Astro 6 and later; here 7.4.8) was tried in a scratch build. It writes a meta tag, but puts every directive-loader hash (seven) on every page, including pages with no script. It also places the tag after the title and description, and warns about Shiki. See decision 2.

## Goals / Non-Goals

**Goals:**

- One exact policy on every page, allowing only what the code uses, with hashes that cannot drift.
- The policy reaches every worker, so the code that reads files also runs with `connect-src 'self'` and no `eval`.
- A build check, lint rules and an end-to-end watch that fail on any gap, in Chromium, Firefox and WebKit.
- Nothing visible changes. Page weight and late loading stay as they are.

**Non-Goals:**

- Headers, `frame-ancestors`, reporting and Trusted Types (proposal, Out of scope).
- Running `astro dev` under the policy. The integration runs on `astro build` only, because the dev server injects its own inline scripts. End-to-end tests run against the build.
- Stopping requests to the site's own origin, navigation, windows or WebRTC. A policy cannot, so the no-upload test keeps guarding them (decision 1).

## Decisions

### 1. The policy

```
default-src 'none';
script-src 'self' 'wasm-unsafe-eval' <hashes of this page's runnable inline scripts>;
style-src 'self' <hashes of this page's inline styles>;
img-src 'self' blob:;
connect-src 'self';
worker-src 'self' blob:;
base-uri 'none';
form-action 'none'
```

In the tag it is written on one line, with directives separated by `; `.

- **`default-src 'none'`**, not `'self'`. Anything not named is denied, so a new kind of load (font, frame, media, manifest, object) fails loudly in the end-to-end watch instead of passing quietly. It covers `font-src` (no web fonts, per `SPEC.md` "Look and feel"), `object-src`, `frame-src`, `media-src` and `manifest-src`.
- **`script-src 'self' 'wasm-unsafe-eval'` plus hashes.**
  - `'self'` matches the origin, so it holds under the preview's sub-path too.
  - `'wasm-unsafe-eval'` is "what WebAssembly needs" and nothing more. It allows compiling WebAssembly, not `eval`.
  - It is on every page, though only tool pages start a worker. One policy shape everywhere is easier to read and test. On a page with no worker it allows nothing that page does.
  - No `'strict-dynamic'`. It would make `'self'` ignored and let any script our scripts add load from anywhere.
  - No `'unsafe-inline'` and no `'unsafe-eval'`.
- **Hashes are per page**, covering exactly the page's own runnable inline blocks. A page with no island lists none. The home page lists the `client:idle` loader, and tool pages the `client:load` loader.
  - The hash is SHA-256, base64, over the exact text between the tags, as the browser hashes it. CR LF and a lone CR are read as LF first, as the HTML parser does; `check-csp` does the same with its own code.
  - A `<script>` is hashed when the browser would run it, or when `script-src` governs it anyway. That means:
    - no `type`, or an empty one;
    - a JavaScript MIME type;
    - `module`;
    - `importmap` and `speculationrules`, which `script-src` also governs inline.
  - A data block such as `type="application/ld+json"` (the later SEO change's structured data) is not hashed and needs no allowance.
- **`style-src 'self'` plus hashes.** Stylesheets are files, and the one inline style is hashed. Style attributes stay blocked: a hash does not allow them without `'unsafe-hashes'`, which is not used. None are in the HTML, and React's run-time width goes through the CSSOM.
- **`img-src 'self' blob:`.** Thumbnails are `blob:` images. `'self'` is kept so that a browser's own request for `/favicon.ico` is not reported as a violation. No `data:`.
- **`connect-src 'self'`** allows the qpdf `.wasm` fetch. With the policy in the workers (decision 3), the browser blocks `fetch`, XHR, `sendBeacon`, WebSocket and EventSource to other origins from the page and its workers.
  - It does **not** stop a request to the site's own origin, with or without a body. A same-origin `POST` of a whole file would pass the policy. On the preview, the site's own origin is all of `https://aceparam.github.io`, which also holds every other Pages site of that account.
  - The policy also does not govern page navigation, `window.open`, link clicks, a meta refresh, WebRTC or DNS prefetching. Workers cannot navigate or open windows.
  - So the no-upload test (`tests/e2e/no-upload.ts`, unchanged) stays the guard for the page and the workers. The policy is a second wall for other origins, not a replacement.
  - Analytics or the conversion server, when they come, are added by their own change.
- **`worker-src 'self' blob:`.** `blob:` is needed because every worker starts from a `blob:` address (decision 3). `'self'` is needed because the `import` inside that `blob:` script is fetched as a worker script (Context, probe 4).
  - `'self'` also lets same-origin code start a worker straight from a same-origin address, and such a worker would run with no policy. The policy cannot forbid that, so the code does instead (decision 3: a lint rule and a built-file check).
  - A `blob:` address can only be made by script already running on the page, which the rest of the policy limits.
  - `worker-src` is never widened beyond this.
- **`base-uri 'none'`, `form-action 'none'`.** The site uses no `<base>` and no form (checked). `default-src` does not cover them.
- **No `upgrade-insecure-requests`.** Every address is relative to the HTTPS page, so there is nothing to upgrade. Over `http://localhost` in tests it would only add risk.
- **Not possible in a meta tag:** `frame-ancestors`, `report-uri`/`report-to` and `sandbox`. Browsers ignore them there and warn. See Risks.

### 2. Written into the built HTML by a small integration of our own

`scripts/csp.mjs` holds plain functions, Node only, with no DOM:

- `inlineBlocks(html)` returns each runnable inline `<script>` body (decision 1's types) and each `<style>` body, in order.
- `hashOf(text)` returns `'sha256-…'`.
- `policyFor(html)` returns the decision 1 string with that page's hashes.
- `withPolicy(html)` inserts `<meta http-equiv="Content-Security-Policy" content="…">` straight after `<meta charset="utf-8">`. It throws if there is no charset tag, if a policy tag is already there, or if a script, stylesheet or link comes before the charset tag.

`astro.config.mjs` adds a tiny integration, `cspMeta()`. Its `astro:build:done` hook runs `withPolicy` over every `.html` file in the output directory, so the hashes are taken from the files exactly as served. It runs in every build, including the sub-path build of `check:base`.

Alternatives:
- **Astro's `security.csp`.** It is maintained by Astro, but it adds seven loader hashes to every page. Four of them are for directives the site never uses, and all of them land on pages with no script. It puts the tag after the title and prints a Shiki warning on every build. Its output is not as strict as `SPEC.md` asks, and we would still need our own check. Rejected for now. It can replace `withPolicy` later if it learns per-page hashes, keeping the same check and tests.
- **Writing the tag in `Base.astro`.** Astro adds its loader scripts after the layout renders, so the layout cannot know their hashes. Hard-coding them would drift on the next Astro update.
- **Hashes in a config list.** This would drift too, so it is rejected for the same reason.

### 3. Workers start from a `blob:` address that imports the real file

`src/workers/start-worker.ts` exports one plain function:

```ts
workerFromBlob(file: string, base: string): Worker
```

- It resolves `file` against `base` to a full address, and throws if that address is not of `base`'s origin (added while building: a guard, not a change in behaviour).
- It makes a `Blob` holding exactly `import "<address>";`, with the address passed through `JSON.stringify`.
- It starts `new Worker(blobUrl, { type: 'module' })` and returns that worker with `terminate()` wrapped, so that ending the worker also revokes the `blob:` address. The return type still satisfies `WorkerLike`, so `ToolClient` and `WorkerLike` do not change.
- It is the only place in `src/` that writes `new Worker`.
- The worker file runs at its plain address. So the "one copy of each module per address" rule in `tool.worker.ts` still holds, and the file's own `import()`s resolve against its real address (`import.meta.url`).
- The `blob:` script holds nothing but the import. No forwarding listener is needed, because Playwright reaches the nested worker (Context, probe 5).

How each worker uses it:

- **The tool worker.** Components may not import workers (lint, unchanged), so `src/hooks/tool-worker.ts` holds `createToolWorker()`. It takes the worker's address with Vite's `import toolWorker from '../workers/tool.worker.ts?worker&url'` and returns `workerFromBlob(toolWorker, location.href)`. `ToolWorkspace.tsx` imports `createToolWorker` from the hook and passes it to `useToolRun` as it passes `createWorker` now. The worker client already ends the worker after every job, and its `terminate()` now also revokes. `check:worker` must still find exactly one `tool.worker-*.js`. If `?worker&url` names the file differently, its pattern or `chunkFileNames` is adjusted in the same task.
- **The PDF.js worker.** `tool.worker.ts` imports `workerFromBlob`, a name distinct from `createPdfjsLoader`'s `startWorker` parameter. It passes `() => workerFromBlob(pdfjsWorkerUrl, import.meta.url)` to `createPdfjsLoader`. That worker needs no separate end, because it ends when the tool worker is ended. Its `blob:` address lives no longer than the tool worker's realm.
- **Absolute addresses inside the tool worker.** In a worker started from `blob:`, a root-relative address such as `/_astro/qpdf-*.wasm` cannot be resolved against the worker's own address, because a `blob:` address has no path. So `qpdfWasm` and `pdfjsWorkerUrl` are passed as `new URL(…, import.meta.url).href`.
  - Module `import()`s already use `./` paths against `import.meta.url`, so they are unaffected.
  - Emscripten's `locateFile` override in `createQpdf` must keep returning our absolute address. A test job in a `blob:`-started worker proves it.
  - Any other relative address used inside a worker is made absolute the same way.
- **Keeping every worker on this path (the policy allows `'self'`).**
  - **Lint.** An `eslint.config.js` rule (`no-restricted-syntax` on `NewExpression[callee.name=/^(Shared)?Worker$/]`, and on `callee.property.name`, `callee.property.value` and `callee.property.quasis.0.value.raw` with the same pattern, so `new self.Worker(…)`, `new globalThis.SharedWorker(…)`, `new window['Worker'](…)` and ``new globalThis[`Worker`](…)`` are caught too) fails anywhere in `src/` except `src/workers/start-worker.ts`. ESLint lets a later block replace an earlier block's setting for the same rule, so the blocks for `src/engines/**` and for components and hooks repeat these selectors in their own `no-restricted-syntax`. This does not loosen any rule that exists today.
  - **Built files.** `scripts/check-worker.mjs` finds every `new Worker(` and `new SharedWorker(` in `dist/_astro/*.js` and `*.mjs`, including `new x.Worker(` and computed ``new x[`Worker`](`` forms. It requires exactly one helper start in the page's `ToolWorkspace-*.js` chunk and one in `tool.worker-*.js`. Each `new Worker(` must be in the start helper's built code, which the check recognises by the helper's fixed blob text (`import ` with `JSON.stringify`, and `text/javascript`) within the same function, just before the call. `new SharedWorker(` must not appear at all.
  - **The one named exception** is PDF.js's display file (`pdf-*.js`). We set `GlobalWorkerOptions.workerPort` and never set `workerSrc` or `rendererSrc`, so PDF.js never reaches its `new Worker`. A unit test reads `src/` and fails if `workerSrc` or `rendererSrc` is ever assigned.
- **The `blob:` script holds no file data.** A unit test stubs `Worker`, `Blob` and `URL.createObjectURL` in Node, and checks four things. The text is exactly one `import` of a same-origin address. Addresses resolve at the root and under `/pdfkaro`. `terminate()` ends the worker and revokes the address. Nothing else is in the blob.
  - The existing no-upload watcher already accepts same-origin `blob:` GET requests and refuses any other, so it needs no change.
  - The picture-option source check (`createObjectURL` banned in `PictureField` and the picking code) is unaffected, because the start lives in `src/workers/` and `src/hooks/tool-worker.ts`, not in the picking code.

Alternatives:
- **Leave workers without a policy until a header host.** This is the simplest, but then qpdf and PDF.js, the code that reads files and that a hostile PDF attacks, run with no `connect-src`. The policy would protect only the part of the site that holds no file. Rejected.
- **`worker-src blob:` without `'self'`.** No worker would start at all (Context, probe 4). Rejected.
- **Inline the worker as a `blob:` of its whole code.** This breaks late loading and the per-engine files that `check:worker` checks. Rejected.

### 4. Checks

- **`scripts/check-csp.mjs`** (`npm run check:csp`, optional directory argument, default `dist`). For every `.html` file it checks that:
  - there is exactly one policy tag;
  - it comes straight after the charset tag and before any `<script>`, `<link>` or `<style>`;
  - its directives are exactly the set in decision 1, with no `'unsafe-inline'`, `'unsafe-eval'`, `'strict-dynamic'`, `data:`, `*` or other origin;
  - every runnable inline `<script>` (decision 1's types) and every `<style>` has its hash listed, and no hash is listed that is not on the page;
  - there is no `style=` attribute, no `on…=` attribute and no `javascript:` address;
  - no `<script src>` or `<link href>` points outside the site.

  It finds blocks and computes hashes with its own small code, not `scripts/csp.mjs`, so a mistake in one is caught by the other. CI runs it after the build, and `check:base` runs it on its sub-path build.
- **Unit tests (`tests/unit/csp.test.ts`).**
  - `hashOf` against the known value of Astro's style block (`sha256-vv9IoKo7…`, the same value a browser computes).
  - `inlineBlocks` on scripts with no type, `text/javascript`, `module`, `importmap` and `application/ld+json` (the last not returned); on `type="module"` with `src` (not inline); on empty blocks; and on two blocks with the same body.
  - `policyFor` on a page with no block and with each kind.
  - `withPolicy`: placement, refusal of a second tag, and refusal of a script before the charset tag.
  - `check-csp` refusing each problem on a small made-up page, and accepting an unhashed JSON-LD block.
- **Unit tests (`tests/unit/start-worker.test.ts`):** decision 3's cases, plus the `workerSrc`/`rendererSrc` source check.
- **ESLint for the fixture.** A `no-restricted-imports` rule for `tests/e2e/**/*.spec.ts` bans importing `test` from `@playwright/test`, with the message "Import test and expect from ./fixtures".
- **End-to-end watch (`tests/e2e/fixtures.ts`).** It extends Playwright's `test` with an automatic fixture (`policyViolations`) and exports `await watchPolicy(context)` for tests that open their own browser context. It is not called `watch`, because the no-upload watcher's `watch` is already imported in those specs; it is async, because the init script must be in place before the test opens a page. The tests that open their own context: `pdf-to-images.spec.ts:523`, `sign-pdf.spec.ts:1014` and `split-pdf.spec.ts:372`. (`home.spec.ts:17`'s context has JavaScript off, so it needs no watch.) For each page and context the watch does three things:
  - An init script adds a `securitypolicyviolation` listener on the document that records the directive and blocked address.
  - `page.on('worker', w => w.evaluate(() => self.addEventListener('securitypolicyviolation', e => console.log(<fixed marker> + directive + blocked address))))` is set, and that worker's `console` is read for the marker. Probe 5 shows Playwright reports nested `blob:` workers too. The `evaluate` rejection is ignored when the worker has already closed, since the tool client ends workers after every job. Playwright also passes a worker's console lines to the page's `console` event; those are skipped there (`message.worker()` is set) and read from the worker alone, so nothing is counted twice. The listener also sets `self.policyWatched`, so the test's own probe worker can wait until it is watched before it tries anything.
  - After the test, each live page and worker first writes a line of its own and the check waits for it (at most two seconds; closed ones are skipped), so a violation line that arrives a moment late is still counted. Then any record fails the test with the directive and blocked address.

  A violation in a worker before its listener is added, such as a blocked worker start or import, makes the worker fail to load. That shows as a worker error, which fails the job and so the test.

  A test that blocks something on purpose (only in `csp.spec.ts`) opts out with the fixture option `blocksOnPurpose`, and asserts the records in `policyViolations` instead.
- **`tests/e2e/csp.spec.ts`.**
  - For every page in `allPages`: one policy tag, first after the charset tag.
  - On the page:
    - an added inline script (`page.addScriptTag({ content })`) does not run and is recorded;
    - a script from another origin is blocked;
    - `fetch` to another origin is blocked.
  - **Worker checks through a probe.** Playwright's `evaluate` is not limited by the `eval` rule, so it cannot prove `eval` is blocked. `page.route` serves two same-origin probe files used only by the test, `/_test/probe.js` and `/_test/probe-worker.js`, and `page.addScriptTag({ url: '/_test/probe.js' })` adds the first.
    - The probe starts `probe-worker.js` exactly the way `workerFromBlob` does, with the same blob text, which the unit test pins.
    - In that worker, `eval('1')` throws, and a `fetch` to `http://127.0.0.1:<port>/csp-probe` (another origin, served by the same test server) is refused, while a tiny WebAssembly module still compiles.
    - The worker then starts a nested worker the same way, which repeats the checks.
    - The test asserts that each worker reported its results. It also asserts that the fixture recorded `script-src` and `connect-src` violations on both workers' scopes, and that the server never received `/csp-probe`.
  - In a real job: on Merge PDF, a file is picked and merged with the watch on. Both the tool worker and the PDF.js worker are seen through `page.on('worker')` as `blob:` workers (at least one whose `blob:` address the page made, and at least one it did not, which is PDF.js's, started inside the tool worker), and no violation is recorded. This shows the real workers start the `blob:` way and run under the policy. The probe shows what that policy blocks.
  - A page's own `new Worker('/_astro/tool.worker-*.js')` is not tested as refused, because `'self'` allows it. Lint and the built-file check stop it in our code instead.
- **Other browser engines.** `playwright.config.ts` gains `firefox` and `webkit` projects that run only `csp.spec.ts`, at desktop size. That covers the worker probe checks, nested worker included, and one ordinary job per engine kind under the watch:
  - Merge PDF, for qpdf;
  - PDF to JPG, for PDF.js drawing and the picture decoders;
  - Sign PDF, for pdf-lib;
  - Split PDF, for the zip.

  CI installs `chromium firefox webkit`. The two projects are added only when `process.env.CI` is set or that browser's executable exists, so `npm run e2e` passes on a machine with Chromium alone. Only Chromium is installed in this container, and others must not be installed locally, so here these projects run in CI only.
- **Existing tests stay as they are, except four helpers.** Playwright's own init scripts and routes are not limited by the page's policy, and `evaluate` is not limited by the `eval` rule. But a `fetch` made inside `page.evaluate` is: `connect-src 'self'` refuses a fetch of a `blob:` address. And a worker started the `blob:` way reports a `blob:` address, and its start script is a `text/javascript` blob the page makes. Found while building, four test helpers change, each keeping its assertion:
  - `pdf-to-images.spec.ts`, `convertAndDownload`: the download's type was read by fetching the result's `blob:` address. It is now noted from the `Blob` as the page makes the address (`URL.createObjectURL` wrapped just before the main button is pressed).
  - `thumbnails.spec.ts`, `stillOpen`: whether a thumbnail's address can still be opened was a `fetch`. It is now opened as a picture, which `img-src blob:` allows; a revoked address fails to load either way. Under the policy the old helper would have answered "not open" for every address, so the revoke tests would have passed without proving anything.
  - `thumbnails.spec.ts`, "a picture that arrives after its file was removed…": tool workers were counted by `worker.url()` containing `tool.worker`. They are now the workers whose `blob:` address the page itself made (`text/javascript` blobs, recorded by the test's existing `createObjectURL` wrap); PDF.js's worker's blob is made inside the tool worker. The test also now checks that at least one tool worker was counted before the removal.
  - `sign-pdf.spec.ts`, `expectNoPictureBlob` (two no-upload tests): every `Blob` the page made had to be the result or a PNG thumbnail. The tool worker's start script is now a third kind: it is accepted only when its text is exactly `import "http://localhost:4321/_astro/tool.worker-<hash>.js";`. And every `blob:` request seen had to be an address the page made; PDF.js's worker's start address is made inside the tool worker, so a `blob:` address the browser loaded as a script (a worker's start script, by Playwright's `resourceType()`) is accepted too. In the same spec, `freshRun` now waits for the row's thumbnail before the job: with PDF.js's worker started through one more step, the job sometimes ended the worker before PDF.js's worker file was fetched, so the three ways' fetched-file lists differed (2 runs in 6 before the wait, 0 in 8 after).
  - `connect-src` is not widened to `blob:` for these: the site's own code never fetches a `blob:` address.
  - `site.spec.ts` "loads no script" still holds, because the tag is not a script.
  - The worker-request checks in `merge-pdf.spec.ts:291-295` (`.wasm`, `pdf.worker.min-*.mjs`, `pdfjs-data-*.js` seen) stay as they are and must still pass.

### 5. Page weight and loading

- Measured in the build (task 4.2): the tag is 232 bytes on a page with no island and 394 bytes on a tool page or the home page (the architect measured 231 and 393). By gzip, a page's HTML grows by 106–109 bytes with no island and 249–275 bytes with one. In `npm run weigh`, every page grows by 0.1–0.3 KB; the largest page, Sign PDF, goes from 79.0 KB to 79.3 KB of 100 KB.
- `createToolWorker` and `workerFromBlob` add a few hundred bytes to the island and worker chunks, which load as now. The after-a-pick total goes from 2010.5 KB to 2010.9 KB by gzip.
- No new request, no new dependency, and WebAssembly is fetched when it is now.

### 6. For the Privacy page

These are recorded for the later Privacy page change, not written here:

- The site sets a Content Security Policy on every page, and in the workers that read files. The browser blocks scripts, styles, images, fonts, frames and objects from other origins. From the page and its workers it blocks `fetch`, XHR, `sendBeacon`, WebSocket and EventSource requests to other origins.
- It does not govern page navigation, opening a window, link clicks, a meta refresh, WebRTC or DNS prefetching. It allows scripts, styles, images, `fetch`, XHR, beacons and worker loads from the site's own origin, with or without a body, so it does not stop data going to that origin. On GitHub Pages that origin is the whole `aceparam.github.io`. The site's own tests check that no file data leaves the page.
- On GitHub Pages the policy is a meta tag. That cannot stop another site from showing a PDFkaro page in a frame (`frame-ancestors`), and it cannot report violations.

## Threats considered

- **Malicious PDF.** A parser bug in PDF.js or qpdf that leads to script running in a worker can no longer `eval`, load script from elsewhere, or send data to another origin by its own requests, because `connect-src` and `script-src` now apply in both workers (decision 3). But code that already runs in a worker can start a same-origin script as a worker outside the policy (`worker-src` allows `'self'`), for example PDF.js's own worker pointed at its own server, so the policy is a second wall, not a sandbox. It could still post messages to the page, as today, or send to the site's own origin (decision 1). The no-upload test guards the site's own code paths, not an exploit.
- **Injected markup on a page**, from a future bug that writes untrusted HTML. Inline scripts, handlers and `javascript:` addresses do not run, `<base>` and forms are refused, and nothing loads from another origin. A meta refresh or a link would still navigate.
- **Oversized file, hostile file name:** unchanged. Names are never put in HTML, and the policy adds a second wall against a name reaching a request to another origin.
- **Supply chain.** A compromised dependency is same-origin code and is not stopped from running. It cannot send data to another origin by request from the page or a worker, or load more code from one. It could still navigate the page, or start a worker straight from a same-origin address; lint and the built-file check catch accidental use of the second in our own code; a hostile dependency could still do it (for example by building the constructor name at run time).
- **Clickjacking:** not covered. See Risks.

## Risks / Trade-offs

- **[No `frame-ancestors` on GitHub Pages]** Another site can put a PDFkaro page in a frame and draw over it to trick clicks. The harm is small: files never leave the visitor's device, the framing site cannot read the frame, and the site has no account or setting to change. → Recorded here, and for the launch hosting question: a host that sends headers adds `frame-ancestors 'none'`, plus the same policy as a header. No frame-busting script is added; the framing page can defeat it, and it would add script to every page for little gain.
- **[`'self'` on the preview is the whole `aceparam.github.io` origin]** A same-origin request can reach every Pages site of that account. → Recorded with the hosting question. Not narrowed by path now. The no-upload test guards requests to the site's own origin.
- **[Firefox or Safari start module workers from `blob:` differently]** → They are covered in CI by the `firefox` and `webkit` projects, and by hand on iOS Safari and Android Chrome (issue #7), including a check that proves blocking. If one fails, the shared policy's `worker-src` is never widened for it. Any per-browser fallback goes back to security review and to the owner as a decision.
- **[WebKit: Playwright does not report a worker started inside a worker]** Found in CI run 44998603164 (head 14713a5). Firefox passed. Three `csp.spec.ts` tests failed in WebKit: the probe got one result of two, and the Merge and PDF to JPG jobs saw one worker each, not two. What the run shows:
  - The nested worker starts and works in WebKit. In the Merge test the step that waits for both thumbnails passed, and the PDF to JPG job reached "Your download is ready". Both are drawn by PDF.js in its nested worker. PDF.js has no fallback on this path: we hand it `GlobalWorkerOptions.workerPort`, it uses that port (`#initializeFromPort`) and never sets up a fake worker. A failed nested start trips our loader's `onerror`, which leaves thumbnails blank and fails the job.
  - Playwright's WebKit sends no `worker` event for it. Only the tool worker is counted.
  - The probe's nested worker waits for `self.policyWatched`. Only the fixture sets that, through a reported worker, so in WebKit the probe waits forever. That is why one result is missing.
  - Not yet shown: that the nested worker runs under the page's policy in WebKit. The outer `blob:` worker does: its eval is blocked and its fetch refused. By the standard, the nested `blob:` worker inherits the outer worker's policy, but no WebKit run has observed it. In WebKit, the end-to-end watch also cannot see violations in PDF.js's worker.
  - → Proposed, not built: the probe workers record violations with a listener on their own scope and report them with their results. The nested probe waits for the watch at most three seconds. Only in WebKit do the tests expect no fixture record for the nested worker, and one reported worker instead of two. This is held for review: the change was refused as loosening tests, and it needs the coordinator's or owner's word. `worker-src` is not widened. If a CI run with that probe shows the nested worker in WebKit not under the policy, it goes to security review and the owner.
- **[A worker started from `blob:` breaks a test route or a request check]** `context.route` and the no-upload watcher see worker requests today. → Every existing end-to-end test must pass unchanged except the four helpers in decision 4 and the `freshRun` thumbnail wait in `sign-pdf.spec.ts`, and the watcher already accepts same-origin `blob:` requests.
- **[Astro changes its loader]** The hashes change, but nothing needs updating by hand, since they come from the built files. If Astro adds a `style` attribute or handler, `check:csp` fails the build, which is wanted.
- **[`'wasm-unsafe-eval'` on pages with no worker]** It allows compiling WebAssembly where none is used. Accepted for one policy shape; `SPEC.md` allows it.
- **[A browser without `'wasm-unsafe-eval'`]** Very old Safari (before 16) would block WebAssembly. `SPEC.md` asks for current browsers.
- **[Dev server]** There is no policy in `astro dev`, so a violation shows only in the build. The end-to-end tests and `check:csp` run on the build, so CI catches it.

## Migration Plan

The tag and the worker start ship together in one pull request, and the preview shows them after merge. Rollback is reverting the pull request.

`check:base` reads files and does not run a browser. So before merge, Merge PDF and PDF to JPG jobs are run in Chromium, with the watch on, against a build served under `/pdfkaro/` (task 4.5). After merge, the first preview deploy is checked by hand.
