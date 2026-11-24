# Proposal

## Why

Grayscale PDF (`/grayscale-pdf`, "Make smaller and fix", Browser, Phase 2, after Compress to a target size) is the next browser tool in catalogue order, built before the Phase 1 gate by the owner's decision of 23 Nov 2026 (`CLAUDE.md`). Its plan, `add-grayscale-pdf`, passed stage 1 with all six reviewers. It changes a few operators in a page's drawing instructions, which Resize pages' review showed is hard to do safely: readers disagree on glued tokens, on where an inline picture ends and on streams split mid-token, and qpdf's `--check` reads a page's whole content into memory (`add-resize-pdf`, design decision 3). That plan's design decision 4 sets the rules for a strict reader that decodes drawing instructions itself, within caps, reads them in two bounded passes and leaves a whole stream as it was at the first doubt. Its proposal ("Order") and tasks (line 3, task 0.2) say this reader is a large, security-critical shared piece that later tools need too (Redact, Edit PDF, Flatten PDF, the stamp tools' stray `Q` left for later in `add-resize-pdf`), so it gets its own change and pull request first, as `add-text-option` came before Watermark (`SPEC.md` "Build phases", rule 3).

This change is that shared piece, with no tool using it yet.

## What Changes

- **`src/engines/content.ts`, the content reader,** a pure module with no library, no page and no network, holding the rules of grayscale design decision 4, refined where measurement forced it (design, "Departures from grayscale decision 4"):
  - **Capped decoding of exactly the filters that reach it after `plainCopy`.** Measured in this change with the repo's qpdf (12.2.0 in `@neslinesli93/qpdf-wasm` 0.3.1): the plain copy turns an unfiltered stream, and every chain of only Flate, LZW, ASCII85 and ASCIIHex qpdf can decode, into plain Flate; it leaves Flate alone (any `/DecodeParms`, abbreviated `/Fl` included), RunLength (`/RL` included), and any chain that holds a filter qpdf does not decode by default, such as `[/ASCII85Decode /RunLengthDecode]`, exactly as it was. So ASCII85, ASCIIHex and LZW still reach the reader, inside RunLength chains. The reader decodes a lone Flate, a lone RunLength, and chains of two to four of Flate, RunLength, LZW, ASCII85 and ASCIIHex that hold a RunLength; each step is decoded in pieces with a 64 MiB cap on that step's output; everything else is left as it is. A stream whose dictionary holds a key PDF.js reads before qpdf's (`/F`, `/FFilter`, `/FDecodeParms`, `/DP`, `/BPC` in `/DecodeParms`), or whose `/DecodeParms` does not match its filter's shape, is left too.
  - **A strict tokenizer and reader in two streaming passes,** keeping only the operand count, the run's start offset and the last four operands' kinds and spans, with no token list and no edit list. The first pass checks the stream and works out the edited length; the second writes the edited copy into a buffer of exactly that length. Any doubt leaves the stream as it was; an edited stream over 3 × 64 MiB counts as doubt.
  - **The inline-picture end rule, matching PDF.js 6.5.438** (`findDefaultInlineStreamEnd` and its ASCII85 and ASCIIHex finders, read and measured in this change), with every rule of decision 4 kept and four added where PDF.js was measured, or drawn by the stage 1 reviewers, to stop elsewhere (its three-state scan missing an end after data ending in `E` or `EI` among them).
  - **Every other doubt case of decision 4:** an operator inside `[ ]` or `<< >>`, `ID` or `EI` outside `BI`, unbalanced `BX`/`EX`, a page's `/Contents` stream other than the last ending inside a comment, and the streams-in-sequence rule.
  - **A generic editor interface:** a caller names the operators it wants and, for each, sees the operator, its last four operands and a fixed-size summary of the whole run (how many were numbers, every kind seen), and gives back text to put before the operands, in place of the operands, in place of the operator and after it (empty pieces remove a command), marks edits that do not count by themselves, or says doubt. Names are read as qpdf's JSON writes them. The reader knows nothing about colour.
  - **The error class `PageTooLarge`,** with a `page` field and a fixed, neutral message, for a page whose drawing instructions decode past 64 MiB.
  - **Stricter tokens than decision 4:** a name byte outside 0x21–0x7E and every unknown operator, inside `BX`/`EX` too, are doubt, as PDF.js reads both differently.
- **`src/engines/zlib.ts`:** `zlibDeflate`, `DeflateClass`, `Fflate` and the zlib header check `isZlib` moved from `shrink.ts`, and `inflateLimited` and `InflateClass` from `picture.ts`, with no change in behaviour; and a new `inflatePrefix(data, Inflate, bytes)` that checks the zlib header, gives back the first `bytes` bytes and stops there as a success (it ignores predictors, so its caller must refuse them). **`src/engines/tools-given.ts`:** `need` moved from `shrink.ts`, a neutral file as it names an engine's tools. Compress PDF, Compress to a target size, Image to PDF and Sign PDF give byte-identical output on every fixture after the move (encrypted outputs compared after decrypting, the trailer `/ID` aside).
- **`scripts/check-worker.mjs`:** `content.ts` and `zlib.ts` join `lateSources`, each with its own fixed sentences, so the worker file is checked not to hold them. Measured in a build: `zlib.ts` does not become its own chunk; the bundler puts it in `picture-*.js`, which every tool that imports it already fetches, so no tool's list of fetched files changes. Lint already keeps components, hooks and pages from importing anything under `src/engines/`.
- **Unit tests for every hostile case:** decode bombs at the cap, glued tokens, each doubt case, `xEI `, a stray `~`, an overflowing inline size, unterminated strings and dictionaries, deep nesting, a 64 MiB stream of `q ` measured for peak memory, and the filter set measured after `plainCopy`. A test-only editor exercises the editor interface. No engine uses the reader yet, which `SPEC.md` "Build phases" rule 3 allows, as for `add-text-option`.
- **A line for "Where the project stands"** in `CLAUDE.md`, written after merge (Workflow follow-up), not in this pull request.

### Scope

- **Shared engine code only.** No tool, page, component, registry entry, page text, option or failure kind. No request, no dependency.
- **Out of scope:**
  - Grayscale PDF itself, its colour rules and edits, its `page-too-large` failure kind with its message field, widget state and words, the optional id limit on `rawBatches`, and the grey-only test file (all riding along with `add-grayscale-pdf`, as its tasks say);
  - qpdf's `--check` reading a page's whole content for every writing tool (named as a follow-up in `add-grayscale-pdf`);
  - decoding filters that do not reach the reader, inline pictures with a Flate or DCT filter, and JPEG 2000 or other picture data;
  - the stamp tools' stray `Q` (a later change may use this reader for it);
  - the plain copy's own `/DP` bug: an unfiltered content stream with `/DP` becomes Flate with `/DP` kept, so PDF.js draws nothing after every page tool (found at stage 1, confirmed; left for its own fix);
  - deduplicating the four private copies of `need`.

### `SPEC.md` sections

- "Architecture and tech stack", "Rules for the code" 2 (engines are pure functions, unit tested in Node), 3 and 4 (the reader runs only inside an engine in the worker, loaded late).
- "Repo layout": `src/engines/`, one file per operation, shared steps beside them.
- "Privacy, limits and security": "Browser tools" (no request; nothing from the file in an error), "Whole site" (no new script source; nothing changes the Content Security Policy).
- "What we are building", rule 4, "Honest about limits": a stream that cannot be read with certainty is left, never guessed.
- "Build phases": rule 3 (a shared piece in its own pull request first); Phase 2, with the owner's decision of 23 Nov 2026.
- "Definition of done", "Each tool": "Leaves alone what it was not asked to change" (every byte outside an edit unchanged), and "Has unit tests for its engine".
- "States every tool handles" and "Tool page anatomy" do not apply: nothing is shown on a page. Keyboard and screen reader use do not apply: there is no interactive part.

## Where files are processed, and new requests

Nowhere yet: no engine calls the reader in this change, so no visitor's file reaches it. When Grayscale PDF uses it, it runs in the tool worker, inside the engine, on bytes the engine already holds. It makes no request, reads no file name, writes nothing to the console and puts no page text, name or value into an error. No request is added; the moved helpers stay in the built file every tool that uses them already fetches.

## Open decisions and owner questions touched

- **Shared pieces in tool pull requests** (waiting for the owner): this change follows `SPEC.md`'s rule and gives the reader its own pull request, ahead of Grayscale PDF.
- **Uniform requests** (`add-uniform-requests`): no tool's set of fetched files changes (measured in a build); the reader is not in any built file until an engine imports it. When Grayscale PDF imports it, `zlib.ts` will gain a third importer and may become its own file, which would add one file to the sets of Compress PDF, Compress to a target size, Image to PDF and Sign PDF; that is recorded for `add-grayscale-pdf` to measure and name (design, decision 9).
- **The 64 MiB stop** (owner question 8 of `add-grayscale-pdf`): this change only provides the error class and the cap; the stop and its words belong to that tool.
- **Licence, server host, money, analytics, AI tools, domain:** not touched. No dependency.
- **The agent's own choices,** named in the pull request: the module split; the decoded filter set and its limits (chains of at most four steps, the predictor parameters taken, the Adler-32 checksum not compared, as PDF.js does); the editor interface; the four inline-picture rules added from measuring and drawing PDF.js; any step past 64 MiB counting as past the cap; the reader taking the budget as a callback rather than throwing `OutputLimit` itself; the run summary, `operands` and `counts` in the editor; refusing `/F`, `/DP` and shape mismatches; `need` in `tools-given.ts`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-engines`: new requirements for decoding drawing instructions within caps (the measured filter set, the filter keys every reader reads alike, the caps and memory), reading them with certainty or leaving them (the tokenizer, the two passes, the inline-picture rule, streams in sequence), editing them through a generic editor with every other byte unchanged, the `PageTooLarge` error, fixed sentences only, the shared zlib steps moved with no change in behaviour, and both modules kept out of the worker file.

## Impact

- **New code:** `src/engines/content.ts`; `src/engines/zlib.ts`; `src/engines/tools-given.ts`; `tests/unit/content.test.ts` (the reader, the editor through a test-only editor, the hostile cases), `tests/unit/content-decode.test.ts` (each filter step, the caps, and the set measured after `plainCopy`), `tests/unit/content-helpers.ts` (PDFs and encoded streams made in the test, the test-only editor), `tests/unit/content-generated.test.ts` (random valid token sequences against what the generator built), `tests/unit/zlib.test.ts` (the moved helpers' tests and `inflatePrefix`).
- **Changed code:** `src/engines/shrink.ts` and `src/engines/picture.ts` (the helpers removed, imported from `zlib.ts`); `src/engines/tools/compress-pdf.ts`, `compress-to-target.ts`, `images-to-pdf.ts`, `sign-pdf.ts` (import lines only); `tests/unit/compress-pdf.test.ts`, `tests/unit/picture.test.ts`, `tests/unit/target-helpers.ts` (import lines; `inflateLimited`'s and `zlibDeflate`'s tests move to `zlib.test.ts`); `scripts/check-worker.mjs` (`lateSources`); `scripts/page-weight.mjs` (the description of `picture` and `shrink`, which now hold the zlib steps and `need`); `tests/fixtures/README.md` (each fixture's counts through the reader).
- **Every tool:** no change in behaviour, output or fetched files. Page weight before a pick unchanged (no island changes).
