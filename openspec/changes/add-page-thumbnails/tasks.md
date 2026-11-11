# Tasks

No registry entry changes: thumbnails are a shared part, and Merge PDF needs no new words. The tasks run from the engine side to the page, then the checks.

## 1. Dependencies and the fixed helper data

- [ ] 1.1 Add `pdfjs-dist` at an exact version (6.5.438, or the newest release when building), after checking it is maintained and has no open advisory; pin `@napi-rs/canvas` exactly as a test-only dependency
- [ ] 1.2 Add `src/workers/pdfjs-data.ts`: the standard fonts and the three decoders as data inside one script, with their licence files, by file name. Check in the first build that `?inline` handles `.pfb`, `.ttf` and `.wasm`; if not, write the module with a small build script instead
- [ ] 1.3 Add `LICENSES.md` lines for `pdfjs-dist`, the Foxit and Liberation fonts (Liberation is GPL v2 with a font exception, shipped by the owner's decision), the decoders, and `@napi-rs/canvas` as test only
- [ ] 1.4 Record the owner's two decisions of 11 Nov 2026 under "Owner decisions" in `CLAUDE.md`: one fixed set of helper data with no character maps, and shipping the Liberation fonts

## 2. Thumbnail function

- [ ] 2.1 Add `src/engines/thumbnail.ts`: `renderPage` with our `CanvasFactory` over `tools.canvas`, the no-op `FilterFactory`, a `BinaryDataFactory` over the fixed data that refuses character maps, the safe `getDocument` options (including `maxImageSize` and `verbosity: 0`), fitting inside the box, and closing the document every time
- [ ] 2.2 Unit test it in Node through `@napi-rs/canvas` against every file in `tests/fixtures/`: the picture fits the box and is not blank, `mixed.pdf` page 2 is wide, the damaged files reject, and `password.pdf` needs its password; record the outcomes in `tests/fixtures/README.md`

## 3. Worker wiring

- [ ] 3.1 Add `pdfjs`, `canvas` and `pdfjsData` to `tools` in `src/workers/tool.worker.ts`: load `pdf.min.mjs` with `import()`, start `pdf.worker.min.mjs` (address from `?url`) once per tool worker as a nested module worker whose errors are kept inside it, and make canvases with `OffscreenCanvas`
- [ ] 3.2 Add the `thumbnail` request and reply to `src/workers/messages.ts`, with checks on page and box; handle it in `worker-core.ts` so that any drawing error becomes `image: null`; add `ToolClient.thumbnail()` with a 10-second limit that ends the worker, and that never calls `failAll`
- [ ] 3.3 Unit test the message checks, the handler with a made-up `renderPage` that throws, the client's time limit, and that a thumbnail failure leaves a pending `inspect` alone
- [ ] 3.4 Extend `scripts/check-worker.mjs`: fail if PDF.js's code is in the tool worker file, if `@napi-rs` appears in a built file other than PDF.js's own script, or if the built PDF.js has `eval(` or `new Function(`

## 4. Page side

- [ ] 4.1 Add the thumbnail queue as a plain function in `src/widget/thumbnails.ts` (one at a time, only ready files in view, held while a file is read, only while listing, dropped on start, an entry dropped with its file), with unit tests
- [ ] 4.2 Use it in `useToolRun`: make object URLs only for files still listed, keep them in a ref, end the client when the main button is pressed while a thumbnail is in flight, ask again for wanted items when the list comes back, and revoke on remove, "Start again", `pagehide` and unmount
- [ ] 4.3 `PageGrid`: a fixed 52 by 68 slot with a blank paper box, the picture at its own shape with the white fill and line on it, `aria-hidden` slot, `alt=""` and `draggable={false}` on the picture, and an `IntersectionObserver` that reports each item once through `onVisible`; update its component render test
- [ ] 4.4 Pass `onVisible` and thumbnail addresses through `ToolWorkspace`

## 5. Checks of the built site

- [ ] 5.1 Name the new late-loading files in `loadedLater` in `scripts/page-weight.mjs` by their emitted base names; measure and record the tool page before a pick and what loads after

## 6. End-to-end tests

- [ ] 6.1 Thumbnails for every readable fixture; a blank box for the damaged file; the password file's thumbnail only after the right password; a wide picture for a landscape first page; at 360px and 1280px
- [ ] 6.2 With 30 files listed, only items near the screen have thumbnails until scrolled, and no long task over 100 ms
- [ ] 6.3 Thumbnails are not focusable, are hidden from the accessibility tree and are not draggable; dragging an item by its thumbnail moves the item
- [ ] 6.4 With PDF.js held back by the test, pressing the main button merges at once; with PDF.js failing to load, blank boxes stay and the merge works
- [ ] 6.5 After remove, "Start again" and `pagehide`, no `blob:` image is on the page and fetching each saved thumbnail address fails; nothing of PDF.js loads before a pick

## 7. No-upload test

- [ ] 7.1 Wait for every thumbnail before merging; allow PDF.js's two files and the data chunk by exact name read from the build; check that `pdf.worker` and the data chunk were seen; accept `blob:` addresses of the site's own origin only; add a control plant that fetches from a worker inside a worker

## 8. Screenshots and housekeeping

- [ ] 8.1 Take screenshots of the files, loading, password, damaged and done states at 360px and 1280px, light and dark, with real thumbnails, and check each against "Banned patterns"
- [ ] 8.2 Update `design/README.md` where it calls thumbnails stand-ins, and "Where the project stands" in `CLAUDE.md`; say what remains for the Phase 0 gate, without claiming it
- [ ] 8.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 8.4 Run the review panel (see the review-panel skill) and resolve its findings
