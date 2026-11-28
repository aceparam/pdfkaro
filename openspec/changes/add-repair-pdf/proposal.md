# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF, Resize pages, Compress to a target size and Grayscale PDF are merged and archived. The next browser row is **Repair PDF** (`/repair-pdf`, "Make smaller and fix", Browser, Phase 2, fourth in its group after Grayscale PDF). `SPEC.md` names the tool, says qpdf does "repair" ("Architecture and tech stack"), and says every tool's damaged-file state shows "a link that opens the file in Repair PDF" ("States every tool handles").

Today every tool turns a damaged file away ("report.pdf is damaged and cannot be read.") and offers nothing else. This plan measured what can be recovered in the browser with what the site already ships (design, "Measurements"):

- **Our qpdf (`@neslinesli93/qpdf-wasm` 0.3.1, qpdf 12.2.0) recovers nothing that needs recovery.** On 36 damaged files made from the shared fixtures it could not write 27; it never reaches the recovery desktop qpdf 12.4.2 uses on the same files.
- **PDF.js 6.5.438** opens 26 of them, but its only writer, `extractPages`, drops accessibility tags, named destinations, reading threads, document attachments, the language, output intents and the modification date.
- **pdf-lib (`@cantoo/pdf-lib` 2.11.1, already shipped)** reads a PDF object by object from the start, decrypts with a password, and writes a new file. Read that way, written again by qpdf and swept, every one of the 36 gave a file that passes `qpdf --check`, recovering at least as much as desktop qpdf and more on 8. On every good fixture the result holds the same objects as qpdf's own rewrite.
- **pdf-lib's reader needs guarding,** as it has never been given a visitor's file here: the plan and the stage 1 security review found decode bombs, quadratic scans and recursive walks (design, findings 7 and 9). Each now has a named defence; every hook those defences need is reachable on pdf-lib's exported classes (finding 10).

**The owner decided on 28 Nov 2026** (`CLAUDE.md`, "Owner decisions"):

- **"Plain link now":** every tool's damaged notice says Repair PDF may recover the file and links to it; the visitor chooses the file again there, until a shared handover between tools exists. This departs for now from `SPEC.md`'s "a link that opens the file in Repair PDF".
- **"pdf-lib + pre-pass":** files qpdf cannot read are repaired by our own pre-pass and pdf-lib's reader under caps, then written by qpdf; no new dependency and no new qpdf build.
- **"Drop them":** a repaired file has no password and no restrictions, as for the page tools.

## What Changes

- **Before this change, its own small pull request** (no change in behaviour, as PR #39 and #41 were): the one-file output limit and a capped decrypting rewrite (`oneFileLimit`, `rewrite` in `src/engines/qpdf.ts`), and certificate detection (`certificateEncrypted` in `src/engines/inspect.ts`), moved out of Protect with a password, Remove a password and Compress to a target size, their outputs byte-identical. Repair imports them.
- **A new page, `/repair-pdf`,** from a new registry entry under "Make smaller and fix", after Grayscale PDF. One PDF; its row shows the name, the pages found and the size, with the first page's thumbnail when PDF.js can draw it. No options. "Repair and download" works at once.
- **A file every other tool calls damaged is read here** the repair way before the job, so the page can show the pages found, ask for a password, or say that nothing usable was found.
- **How a file is repaired** (design, decisions 2 to 7):
  1. qpdf reads it as it is; a file qpdf reads with warnings, junk around it or no `%%EOF` is written again by qpdf.
  2. A file qpdf cannot read goes through our **linear pre-pass**, which decodes nothing: it closes objects, streams and strings left open, collapses long runs of junk, writes a correct direct `/Length` where one is missing or wrong, and keeps only objects and trailers. Then **pdf-lib's reader**, with the visitor's password if any, under **run-time guards on pdf-lib's own code** for every repair `load` and `save`: one work budget on every byte its parser reads (a fixed multiple of the input and decoded object-stream bytes, stopping even inside its own scans), its decoders capped while they run (64 MiB a stream, a per-call budget counting every stage), cross-reference stream entries never read, object-stream offsets checked, its console silenced, and its recursive page walks never called (pages are counted by our own walk). Objects pdf-lib could not make sense of are left out; qpdf writes the rest.
  3. A **sweep** on the plain copy, judging streams with our own capped decoders from their raw data (never qpdf's decoded output): parts of pages that point to nothing are removed, a damaged Flate stream keeps what still unpacks, other damaged streams are emptied.
  4. qpdf writes the final file with object streams and checks it.
- **What the new file keeps:** every page and object found, with their text, links, form fields, bookmarks, attachments, tags and details; what was lost cannot be brought back; if the last save was lost, parts of an earlier version may show; earlier versions stored inside are not kept and a signature stops being valid. No password and no restrictions (owner, 28 Nov 2026).
- **Nothing to repair:** no new file, "This file has no damage this tool can find." with "No new file was made. You can use your file as it is. If it does not open in one program, try opening it in another." Found only after the main button (named, not moved).
- **Too damaged:** when no page can be found, the shared damaged notice with this tool's advice and no link to itself; when the result would still fail `qpdf --check`, the job gives no file, says "This file is too damaged to repair. If you have another copy of the file, try that one." and offers "Choose another file".
- **The damaged notice on every other PDF tool** gains, after its "Leave this file out" / "Choose another file" button and on its own line, "Repair PDF may be able to recover it. On that page, choose the file again." and a plain link "Go to Repair PDF", built from the registry, at least 44px tall; the status announcement includes the sentence. Same tab, nothing of the file in the address, nothing stored (owner, 28 Nov 2026). It ships in the same pull request as the registry entry.
- **Progress:** "Reading the file"; the writes fill the bar to half; the final check moves it from 55 to 95, as Protect does; Cancel works throughout.
- **The "Make smaller and fix" hub words** gain repair (`add-search-basics`).
- **The Privacy page draft** gains visible draft sentences: the link, what following it tells GitHub, that nothing of the file goes with it, what the qpdf request count can tell, and that a repaired file can hold parts of an earlier version.

### Scope

- **One tool,** with the one-file rewrite step moved first in its own pull request. Riding along, named in the pull request: the damaged-notice link, the failure kind `too-damaged` and its "Choose another file" action, `inflateReadable` in `src/engines/zlib.ts`, an action word for `pageTooLargeSentence`, and the hub words.
- **Out of scope:**
  - carrying the file into Repair PDF (the shared handover, `add-tool-handover`, its own change);
  - a new qpdf build (declined by the owner);
  - files with no `%PDF-` in their first 1,024 bytes (owner question 9);
  - rebuilding lost content, guessing a password, certificate encryption;
  - naming which pages were lost (owner question 5);
  - the `/DP` bug (entry 31): qpdf's ordinary compression causes it in every writing tool, so it stays its own change (design, decision 9);
  - next steps after the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Repair PDF, `/repair-pdf`, Browser, Phase 2, fourth under "Make smaller and fix".
- "What we are building": rule 4, honest about limits.
- "Architecture and tech stack": qpdf for page structure, "repair" among its jobs, with the owner's decision of 28 Nov 2026 for files qpdf cannot read; pdf-lib; "Rules for the code" 1 to 5 (5 as the reason the link cannot carry the file yet).
- "Tool page anatomy": parts 1 to 7; every state in "States every tool handles", including "Damaged file" for every tool.
- "Details that apply everywhere": output names.
- "SEO": "Every tool page"; "Site-wide".
- "Privacy, limits and security": "Browser tools"; "Whole site".
- "Build phases": Phase 2, with the owner's decision of 23 Nov 2026; rule 3.
- "Definition of done": "The test set" ("A damaged file with a broken cross-reference table"); "Each tool", and "Output passes `qpdf --check`".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. The tool declares `loads: { read: ['qpdf', 'pdflib'], job: ['qpdf', 'pdflib', 'fflate'] }`. After a pick the page fetches the read set (qpdf and its WebAssembly, pdf-lib's file and `fflate`) and the draw set (PDF.js), whatever the file holds; the job's fresh worker loads the job set with the engine's chunks (`pages`, `plain`, `inspect`, `zlib`, `content`, `qpdf-json`, `qpdf`, as built). pdf-lib in a read set is new (about 243 KB by gzip, after a pick only). No dependency is added.

**Request differences named,** under the uniform-requests owner question (2):

- the qpdf instance count depends on the file: it can tell the host whether qpdf could read the file and roughly how many streams it holds (2,000 a batch); not whether the sweep changed anything (the update is always written); a file with nothing to repair stops after one instance. Instances and the bytes copied into them are capped by bounds that grow with the file;
- **a new built file for Grayscale PDF:** a second importer of `content.ts` makes the bundler split it into its own `content-*.js`, so Grayscale's job fetches one more file holding the same code (design, decision 7a); its before-and-after job-start fetch is recorded and the file listed in the Privacy facts;
- following "Go to Repair PDF" asks the host for `/repair-pdf` (owner question 11).

## Owner decisions and questions

**Decided by the owner on 28 Nov 2026:** questions 1 to 3 of the first draft: a plain link now; pdf-lib with our pre-pass, no new qpdf build; passwords and restrictions dropped. The "Repair PDF link" entry under "Questions waiting for the owner" in `CLAUDE.md` is replaced by these.

**Going ahead on defaults** (listed in the pull request and added to "Questions waiting for the owner"):

4. **Nothing to repair:** no new file, with a sentence, as Remove a password does; found only after the main button. Default: as described.
5. **Partial recovery:** a file with pages or parts lost is still given, showing the pages found; no file when no page is found or the check still fails. Naming lost pages is left for later. Default: as described.
6. **Damaged compressed data:** a damaged Flate stream keeps what still unpacks; any other damaged stream (LZW, RunLength, ASCII85, ASCIIHex, a chain) is emptied; JPG, JPEG 2000 and predictor data is left to qpdf's check. Default: as described.
7. **Names:** "Repair PDF", "Repair a damaged PDF", "Repair and download", `report-repaired.pdf`. The agent's choice, for the owner's text review.
8. **Time on crafted files:** every known case is linear and capped, but millions of objects can take tens of seconds (2 million: 32 s for pdf-lib alone in Node). Default: accept.
9. **Files with no `%PDF-` in their first 1,024 bytes** stay turned away on every page. Default: keep.
10. **Memory on large damaged files** (asked only if the measurement in task 3.3 is over the ceiling the other tools are held to after the fixes): the 110 MB damaged file peaked at 1.27 GB in Node before them. Default: accept for now, as Grayscale's question 9.
11. **What the link tells GitHub:** following "Go to Repair PDF" asks GitHub for `/repair-pdf`, which can tell it that a damaged file was picked and, through the browser's referrer, on which tool page; nothing of the file, its name or its password is sent. Accept, and say so on the Privacy page? Default: yes. (Adding `rel="noreferrer"` to the link would hide the tool page but not that a damaged file was picked.)

**Touched, not changed:**

- **Uniform requests** (`add-uniform-requests`, question 2): the differences above are named under it.
- **Signed files:** Repair, like every writing tool, makes a signature invalid and says so.
- **Shared pieces in tool pull requests:** the one-file rewrite step goes first in its own pull request; the riders are listed under Scope.
- **20,000 pages:** the shared notice is shown.
- **Licence, server host, money, analytics, AI tools:** not touched.

No open decision in `SPEC.md` needs more than its assumed default.

## Capabilities

### New Capabilities

- `repair-pdf`: what the Repair PDF tool at `/repair-pdf` does: choosing one file, reading a file other tools cannot read, passwords, how it is repaired and what the new file keeps, nothing to repair, too damaged to repair, every state, bounded work on hostile files, nothing uploaded, the same requests for every file, and the words on the page and the Privacy draft.

### Modified Capabilities

- `tool-page`: "Damaged file state". The notice on every PDF tool links to Repair PDF after its button, with a sentence that the file must be chosen again until files can be handed over.
- `tool-engines`: "The library for each job". Repair reads a file qpdf cannot open with `@cantoo/pdf-lib` after our pre-pass, and qpdf writes and checks the result (owner, 28 Nov 2026).
- `crop-pdf`: "A damaged file". It now shows the link.
- `resize-pdf`: "A damaged file". The same.

The conditional "Repair PDF is not published" scenarios in `merge-pdf` and `split-pdf`, and Grayscale PDF's "no Repair PDF link until Repair PDF is published", stay true as written.

## Impact

- **Before this change (own pull request):** `src/engines/qpdf.ts` (`oneFileLimit`, `rewrite`), `src/engines/inspect.ts` (`certificateEncrypted`), `src/engines/tools/protect-pdf.ts`, `unlock-pdf.ts`, `compress-to-target.ts` moved onto them, byte-identical.
- **New code:** `src/engines/tools/repair-pdf.ts` (routes, guards, page walk, sweep, write); `src/engines/rebuild.ts` (the pre-pass; inlined into the engine's chunk, its own source file for its tests); `src/content/tools/repair-pdf.md`; `tests/unit/repair-pdf.test.ts`, `tests/unit/rebuild.test.ts`, `tests/unit/repair-helpers.ts`; `tests/e2e/repair-pdf.spec.ts`.
- **Changed code:**
  - `src/tools/registry.ts` (the entry, hub words) and `tests/unit/registry.test.ts`;
  - the failure kind `too-damaged` (`state.ts`, `messages.ts`, `worker-core.ts`, `failures.ts`) and its "Choose another file" action in `ToolWorkspace.tsx`;
  - `pageTooLargeSentence(page, action)` in `failures.ts` with an action word in the registry (Grayscale's words unchanged);
  - `src/engines/zlib.ts`: `inflateReadable`, built on `inflateLimited`'s internals;
  - the link: `repairLink` in `src/tools/queries.ts`, `src/pages/[slug].astro`, `unreadableNotice` in `failures.ts`, the notice in `ToolWorkspace.tsx`, its styles, their tests, every PDF tool's e2e damaged scenario;
  - `src/pages/privacy.astro` and `tests/unit/privacy-page.test.ts`: visible draft sentences;
  - `tests/fixtures/README.md`; `tests/e2e/uniform-requests.spec.ts`, `tool-files.ts`, `performance.spec.ts`, other tools' no-upload forbidden lists (`/repair-/`);
  - `scripts/check-worker.mjs` (`rebuild.ts` in `lateSources`; only an engine whose read set lists pdf-lib may import it at read time) and `scripts/page-weight.mjs` if the build names a new chunk;
  - `LICENSES.md`: pdf-lib's line gains "reads damaged files in Repair PDF, under run-time guards; any upgrade must re-run Repair's hostile tests".
- **Every other tool:** no change in behaviour except the damaged notice's link; Grayscale PDF's job fetches `content-*.js` as its own file (decision 7a), so its required chunks, no-upload allowlist and uniform-requests expectations change.
- `scripts/page-weight.mjs`: `content-*.js` named.
