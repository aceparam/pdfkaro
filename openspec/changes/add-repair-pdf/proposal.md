# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF, Resize pages, Compress to a target size and Grayscale PDF are merged and archived. The next browser row is **Repair PDF** (`/repair-pdf`, "Make smaller and fix", Browser, Phase 2, fourth in its group after Grayscale PDF). `SPEC.md` names the tool, says qpdf does "repair" ("Architecture and tech stack"), and says every tool's damaged-file state shows "a link that opens the file in Repair PDF" ("States every tool handles").

Today every tool turns a damaged file away ("report.pdf is damaged and cannot be read.") and offers nothing else, because Repair PDF does not exist (`add-tool-widget`; "Repair PDF link" in "Questions waiting for the owner"). That question also says the WebAssembly qpdf build "does not rebuild a broken cross-reference table that desktop qpdf rebuilds". This plan measured exactly what can and cannot be recovered in the browser with what the site already ships (design, "Measurements"). In short:

- **Our qpdf (`@neslinesli93/qpdf-wasm` 0.3.1, qpdf 12.2.0) recovers nothing that needs recovery.** On 36 damaged files made from the shared fixtures it could not write 27: every broken cross-reference table, a wrong `startxref`, a missing trailer, a cut-off file, inserted bytes, a wrong stream `/Length`, a broken object or cross-reference stream. It stops at the first problem and never prints "file is damaged" or "Attempting to reconstruct cross-reference table", which desktop qpdf 12.4.2 prints on the same files and then recovers. Its recovery code is never reached in this build. It still reads small faults (`warning.pdf`, a missing `endobj`, a page-tree loop) and junk before `%PDF` or after `%%EOF`.
- **PDF.js 6.5.438** opens 26 of them with its own reconstruction, but fails on a cut-off file, a missing trailer or `/Root`, and a damaged object stream. Its only way to write a file, `extractPages`, drops what this site promises to keep: accessibility tags, named destinations, reading threads, files attached to the document, the language, output intents and the modification date (measured on every fixture).
- **pdf-lib (`@cantoo/pdf-lib` 2.11.1, already shipped)** reads a PDF object by object from the start, ignoring the cross-reference table, decrypts with a password, and writes a new file. Read that way, written again by qpdf and swept (below), every one of the 36 gave a file that passes `qpdf --check`, recovering at least as much as desktop qpdf on every file and more on 8 (a missing trailer or tail, a missing `/Root`, a file cut off in its cross-reference table or at 90%, a missing `startxref` and a broken cross-reference stream). Each sweep step was measured on the files that needed it; the build measures the whole pipeline on all 36 (task 3.3). On every good fixture the result is the same size and holds the same objects as qpdf's own rewrite: nothing is dropped.

So Repair PDF can be built with **no new dependency**: our own linear pre-pass, then pdf-lib's reader, then qpdf to write and check, then a sweep that makes what is left pass `qpdf --check`. The measurements also found that pdf-lib's reader, which has never been given a visitor's file on this site, needs guarding: a 1.9 MB crafted file makes it use 4.15 GB, and 0.4 MB of unclosed objects takes it 20 s (quadratic). The design bounds both before pdf-lib sees the file.

## What Changes

- **A new page, `/repair-pdf`,** from a new registry entry under "Make smaller and fix", after Grayscale PDF. The visitor picks one PDF; its row shows the name, the pages found and the size, as every one-file tool does, with the first page's thumbnail when PDF.js can draw it. No options. The main button, "Repair and download", works at once.
- **A file every other tool calls damaged is read here.** When qpdf cannot read the file, the page reads it the repair way before the job (pdf-lib, after our pre-pass), so it can show how many pages were found, ask for a password when the file is encrypted, or say that nothing usable was found.
- **How a file is repaired** (design, decisions 2 to 6), in order:
  1. qpdf reads it as it is. A file qpdf reads with warnings, or with junk before `%PDF` or after `%%EOF`, or with no `%%EOF`, is written again by qpdf (the most faithful route).
  2. A file qpdf cannot read goes through our **linear pre-pass** (closes objects and streams left open, adds a missing `%PDF` mark where pdf-lib needs it, measures each object stream's unpacked size under a cap), then **pdf-lib's reader** (decrypting with the visitor's password when the file has one). Objects pdf-lib could not make sense of are left out (pdf-lib would otherwise write their broken bytes back), and qpdf writes the rest again.
  3. A **sweep** on the plain copy: parts of pages that point to nothing are removed, and a damaged compressed stream keeps what can still be unpacked of it, so the result passes `qpdf --check`.
  4. qpdf writes the final file with object streams and checks it.
- **What the new file keeps:** every page and object that could be found, with their text, links, form fields, bookmarks, attachments, tags and details; what was lost in the damage cannot be brought back, and the page says so. The newest saved version is kept; earlier versions stored inside the file are not, and a digital signature stops being valid. The new file has no password and no restrictions (owner question 3).
- **A file with nothing to repair** (qpdf reads it with no warning, it starts with `%PDF-` and ends with `%%EOF`, and `qpdf --check` passes): no new file, "This file has no damage this tool can find." with "No new file was made. You can use your file as it is." (owner question 4).
- **A file too damaged to repair:** when no page can be found, the shared damaged notice on this page, with this tool's own advice and no link to itself; when the result would still fail `qpdf --check` after the sweep (none of the 36 measured files did), the job gives no file and says "This file is too damaged to repair. If you have another copy of it, try that one."
- **The damaged-file state on every other PDF tool** gains a link to Repair PDF now that it is published: **owner question 1, which blocks the tasks for that link only** (tasks group 8). `SPEC.md` asks for a link that "opens the file in Repair PDF". The site has no way yet to hand a file to another page: it cannot survive a same-tab page change without browser storage, which the existing "Handover between tools" requirement forbids, and the in-memory way (a new tab, given the file by message) is the shared handover that next steps after every result also need, so it belongs in its own change first (`SPEC.md` "Build phases" 3). The recommended default is a plain link now, with words saying the file must be chosen again there.
- **Progress:** "Reading the file", then writing; Cancel works throughout. Every step is bounded (design, decision 7).
- **The "Make smaller and fix" hub words** gain repair, as a tool joining a group with a hub must (`add-search-basics`).
- **The Privacy page draft** gains the facts for the owner's wording: pdf-lib is now fetched after a pick on this page; following the Repair link from another tool asks GitHub for the Repair page, which can tell it a damaged file was picked.
- **New test files** made in the tests from the shared fixtures (the 36 damaged kinds measured here), and the two existing damaged fixtures repaired.

### Scope

- **One tool,** with no new shared component and no new option kind.
- **Out of scope:**
  - carrying the file into Repair PDF from another tool's damaged state: the shared handover, its own change (`add-tool-handover`), which also gives next steps after every result (owner question 1);
  - a qpdf build whose own recovery works (owner question 2);
  - files whose first 1,024 bytes hold no `%PDF-`: still turned away as not a PDF on every page, Repair included (owner question 9);
  - rebuilding lost content: missing pages, lost text, cut-off pictures, missing fonts; guessing a password; repairing certificate-encrypted files;
  - naming which pages were lost (owner question 5);
  - the `plainCopy` `/DP` bug (entry 31, "Left for later"): measured to come from qpdf's ordinary compression of any unfiltered stream with `/DP`, so it affects every writing tool, Repair included, and stays its own change (design, decision 9);
  - next steps after the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Repair PDF, `/repair-pdf`, Browser, Phase 2, fourth under "Make smaller and fix".
- "What we are building": rule 4, honest about limits (what was lost cannot be recovered).
- "Architecture and tech stack": qpdf for page structure, "repair" among its jobs; pdf-lib; "Rules for the code" 1 to 5 (5 only as the reason the link cannot carry the file yet).
- "Tool page anatomy": parts 1 to 7; every state in "States every tool handles", including "Damaged file" for every tool.
- "Details that apply everywhere": output names.
- "SEO": "Every tool page"; "Site-wide" (the group's hub page).
- "Privacy, limits and security": "Browser tools"; "Whole site" (the Privacy page matches the code).
- "Build phases": Phase 2, with the owner's decision of 23 Nov 2026; rule 3 (the handover in its own pull request).
- "Definition of done": "The test set" ("A damaged file with a broken cross-reference table"); "Each tool", and "Output passes `qpdf --check`".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. The tool declares `loads: { read: ['qpdf', 'pdflib'], job: ['qpdf', 'pdflib', 'fflate'] }`. After a pick the page fetches the read set (qpdf and its WebAssembly, pdf-lib's file and `fflate`, which pdf-lib imports) and the draw set for the first page's thumbnail (PDF.js, its worker and its fixed helper data), whatever the file holds; the job's fresh worker loads the job set. pdf-lib in the read set is new for a page (about 243 KB by gzip, fetched only after a pick): it is needed because a file qpdf cannot read can be counted, or found to need a password, only by the repair reader. The set is chosen by tool, never by the file (`add-uniform-requests`). No dependency is added; `LICENSES.md` gains a sentence on pdf-lib's new use.

**Request differences named,** for the uniform-requests owner question (2):

- the number of qpdf instances a job makes depends on the file (qpdf's route or pdf-lib's; one more per sweep batch), so under the named no-cache exception (entry 24) the number of WebAssembly requests does too;
- following the Repair PDF link from another tool's damaged-file state asks the host for `/repair-pdf` and, after a pick there, its read set. It happens only when the visitor follows the link, but the link is shown only for a damaged file, so the host can tell that a damaged file was picked. The Privacy draft gets the facts; the owner decides the wording.

## Open decisions and owner questions

**Blocking:**

1. **The link from every tool's damaged-file state. BLOCKS tasks group 8 (the link) only; the tool itself can be built and reviewed without it.** `SPEC.md` asks for a link that "opens the file in Repair PDF". Carrying the file needs the shared handover (a new tab given the file by message, never storage), which `SPEC.md` "Build phases" 3 puts in its own pull request first. Choose:
   - **A (recommended):** a plain link now. The damaged notice says "Repair PDF may be able to recover it. On that page, choose the file again." with a link "Go to Repair PDF". `tool-page`'s requirement changes so the file is carried once the handover exists (the delta in this change).
   - **B:** no link until the handover change is merged; Repair PDF is reached from the home page and its hub meanwhile.
   - **C:** build the handover change first, then this tool with the carrying link.

   A departs from "opens the file" for a while, so it needs the owner's yes. If B or C is chosen, the `tool-page`, `crop-pdf` and `resize-pdf` deltas and tasks group 8 are rewritten before group 8 starts.

**Going ahead on defaults** (listed in the pull request and added to "Questions waiting for the owner" in `CLAUDE.md`):

2. **How to repair:** our pre-pass, pdf-lib's reader (already shipped, MIT) and qpdf, as measured. The alternative is a qpdf WebAssembly build whose recovery works (built by us or found elsewhere): it would be a new or changed binary dependency and build pipeline, the owner's call, and might also close the uniform-requests no-cache exception, which needs a patched qpdf build too. Default: the pdf-lib route; no new dependency. Not blocking.
3. **Passwords:** the repaired file has no password and no restrictions, as the page tools' (owner decision of 13 Nov 2026, extended), because the pdf-lib route cannot keep the original encryption settings and one rule for every route is plainer. Alternative: keep them as Compress PDF does (re-encrypting with the visitor's password). Default: drop, and the page says so.
4. **Nothing to repair:** no new file, with a sentence, as Remove a password does. Alternative: always write the file again. Default: no new file.
5. **Partial recovery:** a file with some pages or parts lost is still given, with the result naming the pages found and saying that what was lost cannot be brought back. A file with no page found, or one still failing `qpdf --check` after the sweep, gives no file and the damaged notice. Naming which pages were lost (the file's own count may be wrong) is left for later. Default: as described.
6. **Damaged compressed data:** a damaged Flate stream keeps the part that still unpacks (what PDF.js shows of it); a damaged stream in any other filter (LZW, RunLength, ASCII85, ASCIIHex, or a chain) has its data emptied, so the page draws without it and the file passes `qpdf --check`. Pictures in JPG or JPEG 2000 are not checked by qpdf and are left as they are. Default: as described.
7. **Names:** "Repair PDF" (name), "Repair a damaged PDF" (heading), "Repair and download", `report-repaired.pdf`. The agent's choice, for the owner's text review.
8. **Time on crafted files:** each step is linear and capped, but a file with millions of objects can take tens of seconds (2 million objects: 32 s for pdf-lib alone in Node). Progress shows and Cancel works. Default: accept, as for the other tools' crafted-file timings.
9. **Files with no `%PDF-` in their first 1,024 bytes** stay turned away as not a PDF on every page, Repair included. Looking further on Repair's page only would be a shared change to the type check. Default: keep.

**Touched, not changed:**

- **"Repair PDF link"** (owner question): answered by this tool for the "once Repair PDF is published" part; its second half (the WebAssembly qpdf build) is answered by question 2. The "Repair PDF link" entry in `CLAUDE.md` is replaced by question 1.
- **Uniform requests** (open owner question, `add-uniform-requests`, question 2): the two differences above are named under it.
- **Signed files** (open owner question): Repair, like every writing tool, makes a signature invalid and says so.
- **Shared pieces in tool pull requests** (open owner question): riding along, named in the pull request: the damaged-notice link (group 8, if question 1 is A), a new failure kind `too-damaged` for a file found too damaged only by the job (as `page-too-large` rode with Grayscale), a capped `inflateReadable` step in `src/engines/zlib.ts` (what still inflates of damaged data), and the hub words. The handover is its own change.
- **20,000 pages:** the shared notice is shown, by the owner's decision of 13 Nov 2026.
- **Licence, server host, money, analytics, AI tools:** not touched. No server, no new dependency.

No open decision in `SPEC.md` needs more than its assumed default.

## Capabilities

### New Capabilities

- `repair-pdf`: what the Repair PDF tool at `/repair-pdf` does: choosing one file, reading a file other tools cannot read, the password for an encrypted damaged file, how it is repaired and what the new file keeps, a file with nothing to repair, a file too damaged to repair, every state of "States every tool handles", bounded work on hostile files, nothing uploaded, the same requests for every file, and the words on the page and on the Privacy draft.

### Modified Capabilities

- `tool-page`: "Damaged file state". Now that Repair PDF is published, a PDF tool's damaged notice links to it; until files can be handed over between tools, the notice says the file must be chosen again there (owner question 1, default A).
- `crop-pdf`: "A damaged file". Its scenario says "shows no link to Repair PDF"; it now shows the link.
- `resize-pdf`: "A damaged file". The same.

The conditional "Repair PDF is not published" scenarios in `merge-pdf` and `split-pdf`, and Grayscale PDF's "no Repair PDF link until Repair PDF is published", stay true as written and are not changed.

## Impact

- **New code:**
  - `src/engines/tools/repair-pdf.ts` (the route choice, the reader step, the sweep, the write);
  - `src/engines/rebuild.ts` (the linear pre-pass and the object-stream size check), a shared engine file only because its tests are large; imported by Repair alone;
  - `src/content/tools/repair-pdf.md`;
  - `tests/unit/repair-pdf.test.ts`, `tests/unit/rebuild.test.ts`, with `tests/unit/repair-helpers.ts` building the damaged kinds from the shared fixtures;
  - `tests/e2e/repair-pdf.spec.ts`.
- **Changed code:**
  - `src/tools/registry.ts`: the entry after `grayscale-pdf`, the "Make smaller and fix" hub words; `tests/unit/registry.test.ts`;
  - the failure kind `too-damaged`: `FailureKind` in `src/widget/state.ts`, `failureKinds` in `src/workers/messages.ts`, the mapping by name in `src/workers/worker-core.ts`, `tooDamagedSentence` in `src/widget/failures.ts`, with their tests;
  - `src/engines/zlib.ts`: `inflateReadable`, a capped inflate that keeps what comes out before an error, with its tests;
  - group 8, if question 1 is A: the damaged notice in `src/components/ToolWorkspace/ToolWorkspace.tsx` and its words in `src/widget/failures.ts`, a `repairHref` from the registry through `src/pages/[slug].astro` (`src/tools/queries.ts`), their tests, and the e2e damaged scenarios of the other tools;
  - `src/pages/privacy.astro` and `tests/unit/privacy-page.test.ts`: the draft facts;
  - `tests/fixtures/README.md`: Repair's outcome on every file, and the damaged fixtures' rows for every tool if their words change;
  - `tests/e2e/uniform-requests.spec.ts`, `tests/e2e/tool-files.ts`, `tests/e2e/performance.spec.ts`, other tools' no-upload forbidden lists;
  - `scripts/check-worker.mjs` (`rebuild.ts` in `lateSources`; the rule that only an engine whose read set lists pdf-lib may import it at read time) and `scripts/page-weight.mjs` if the build names a new chunk;
  - `LICENSES.md`: pdf-lib's line gains "reads damaged files in Repair PDF".
- **Every other tool:** no change in behaviour except the damaged notice's link (group 8).
