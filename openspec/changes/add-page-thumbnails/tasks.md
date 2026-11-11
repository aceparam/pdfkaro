# Tasks

No registry entry changes: thumbnails are a shared part, and Merge PDF needs no new words. The steps follow the usual order, from the engine side to the page.

## 1. Dependency and PDF.js's own files

- [ ] 1.1 Add `pdfjs-dist` at an exact version (6.5.438 or the newest release at build time), after checking it is still maintained and has no open advisory
- [ ] 1.2 Add the build integration in `astro.config.mjs` that copies the standard fonts, character maps, the three decoders with their fallbacks, and each licence file into `pdfjs/<version>/`, and serves them in development. Leave out `quickjs-eval.*` and `iccs/`
- [ ] 1.3 Add `LICENSES.md` lines for `pdfjs-dist`, the fonts (pointing out that Liberation Sans is GPL v2 with a font exception), the character maps, the decoders, and `@napi-rs/canvas` as installed but never shipped

## 2. Thumbnail function

- [ ] 2.1 Add `src/engines/thumbnail.ts`: `renderPage` with the OffscreenCanvas `CanvasFactory`, the no-op `FilterFactory`, the safe `getDocument` options, and closing the document every time
- [ ] 2.2 Unit test that both factory classes have every method of PDF.js's own classes

## 3. Worker wiring

- [ ] 3.1 Add PDF.js to `tools` in `src/workers/tool.worker.ts`: load `pdf.min.mjs` with `import()`, start `pdf.worker.min.mjs` (address from `?url`) as a nested module worker, and set the file addresses through `withBase`
- [ ] 3.2 Add the `thumbnail` request and reply to `src/workers/messages.ts` with their checks, handle it in `worker-core.ts`, and add `ToolClient.thumbnail()`
- [ ] 3.3 Unit test the message checks (page and width limits, a non-Blob file), the handler with a made-up `renderPage`, and the client
- [ ] 3.4 Extend `scripts/check-worker.mjs` so it fails if PDF.js's code is in the tool worker file, or if `@napi-rs` appears in any built file other than PDF.js's own script

## 4. Page side

- [ ] 4.1 Add the thumbnail queue as a plain function in `src/widget/` (one at a time, only ready files in view, dropped on start, removed with its file), with unit tests
- [ ] 4.2 Use it in `useToolRun`: keep object URLs in a ref, ask for page 1 of each ready file in view, drop the queue when a job starts, and revoke on remove, "Start again", `pagehide` and unmount
- [ ] 4.3 `PageGrid`: always draw the paper box, watch items with an `IntersectionObserver` and report each once through `onVisible`, keep the box `aria-hidden` and unfocusable; update its component render test
- [ ] 4.4 Pass `onVisible` and thumbnail addresses through `ToolWorkspace`

## 5. Checks of the built site

- [ ] 5.1 Name `pdf` and `pdf.worker` in `loadedLater` in `scripts/page-weight.mjs` and count `pdfjs/` files as late; measure and record the tool page before a pick and what loads after
- [ ] 5.2 Run every file in `tests/fixtures/` through the thumbnail in the browser and record the outcome in `tests/fixtures/README.md`

## 6. End-to-end tests

- [ ] 6.1 Thumbnails for every readable fixture; a blank box for the damaged file; the password file's thumbnail only after the right password; at 360px and 1280px
- [ ] 6.2 With 30 files listed, only items near the screen have thumbnails until scrolled, and no long task over 100 ms
- [ ] 6.3 Thumbnails are not focusable and are hidden from the accessibility tree
- [ ] 6.4 When PDF.js cannot be fetched, blank boxes stay and the merge still works
- [ ] 6.5 "Start again" and `pagehide` leave no `blob:` image; nothing of PDF.js loads before a pick

## 7. No-upload test

- [ ] 7.1 Allow the PDF.js scripts and files under `pdfjs/<version>/` by exact name, accept `blob:` addresses of the site's own origin only, and add a control plant of an address under `pdfjs/` carrying a file name

## 8. Screenshots and housekeeping

- [ ] 8.1 Take screenshots of the files, password and done states at 360px and 1280px, light and dark, with real thumbnails, and check each against "Banned patterns"
- [ ] 8.2 Update `design/README.md` where it calls thumbnails stand-ins, and "Where the project stands" in `CLAUDE.md`; say whether the Phase 0 gate can now be judged, without claiming it
- [ ] 8.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 8.4 Run the review panel (see the review-panel skill) and resolve its findings
