# Design

## Context

See `proposal.md` for why. **The owner decided on 28 Nov 2026** (`CLAUDE.md`, "Owner decisions"): a plain link from every tool's damaged notice for now ("Plain link now"); files qpdf cannot read are repaired by our own pre-pass and pdf-lib's reader, then written by qpdf, with no new dependency and no new qpdf build ("pdf-lib + pre-pass"); a repaired file has no password and no restrictions ("Drop them").

What shapes the approach:

- Every PDF tool reads a file with `inspectPdf` (`src/engines/inspect.ts`): `qpdf --show-npages`, and anything but a password failure is `damaged`. The damaged notice (`unreadableNotice` in `src/widget/failures.ts`, drawn in `ToolWorkspace.tsx`) offers only "Choose another file" / "Leave this file out". Nothing can carry a file between pages yet ("Handover between tools" is unbuilt, and forbids storage, `window.name` and the address).
- qpdf is `@neslinesli93/qpdf-wasm` 0.3.1 (qpdf 12.2.0), one fresh instance per step (`freshQpdf`), with `cappedWrite`, `--check` after every write, and JSON updates that do not reach objects inside object streams (so updates run on a copy written with `--object-streams=disable`, as `plainCopy` does). `createQpdf` collects standard output byte by byte into a string, so nothing large may ever be asked for on standard output.
- The one-file output limit (`2 × size + 16 MiB`) and a capped decrypting rewrite are copied today in `unlock-pdf.ts`, `protect-pdf.ts` and `compress-to-target.ts`; Unlock alone tells certificate encryption from damage. Both move first (section "Before this change").
- pdf-lib (`@cantoo/pdf-lib` 2.11.1) ships as its own chunk, `pdflib-*.js` (about 243 KB by gzip, `fflate` with it), loaded through `tools.pdflib`. Until now it has only built new documents; it has never parsed a visitor's file. `tool-engines` ("The library for each job") names qpdf for tools that repair, so this change modifies that requirement.
- PDF.js 6.5.438 runs in its own worker for thumbnails and drawing, with fixed helper data.
- The content reader (`src/engines/content.ts`) decodes the filters that reach it with caps; `src/engines/zlib.ts` holds capped inflate steps (`pushPieces`, `inflateLimited`).

## Measurements

All in Node 22.23 against the packages in `package-lock.json`, in a scratch worktree with its own `npm ci`, on 28 Nov 2026. Desktop qpdf, for comparison only, is libqpdf 12.4.2 as bundled in pikepdf 10.18.3 (installed in a scratch virtual environment, never in the project). Scripts and files were kept in the scratch folder and deleted with it; the tests in tasks 3.1 and 3.3 rebuild the same files.

### The damaged files

36 damaged files were made from `text.pdf` (classic cross-reference table), `rich.pdf` (cross-reference stream and object streams; two bookmarks, a link, an attachment), a classic-table copy of `rich.pdf` written by qpdf, and `pages-500.pdf`, plus `damaged-cut.pdf` as it is. "Full" means every page, every page's text as PDF.js reads it, and the bookmarks, link and attachment where the source has them. Page counts in "partial" compare text page by page, so a lost page early in a file makes later pages count as different (the zeroed file has 489 pages found, the cut 500-page file 302). "Fails check" is `qpdf --check` on the output, before Repair's sweep.

| Damage | Our qpdf (WASM 12.2.0): write | Desktop qpdf 12.4.2 | PDF.js: open | PDF.js `extractPages` output | pdf-lib reader, then our qpdf writes |
| --- | --- | --- | --- | --- | --- |
| every xref entry 7 bytes off (= `damaged-xref.pdf`) | fails | full | full | full | full |
| every xref entry 7 bytes off, rich content | fails | full | full | full | full |
| `startxref` into the middle of an object | fails | full | full | full | full |
| the same, cross-reference stream file | fails | full | full | full | full |
| `startxref` past the end of the file | fails | full | full | full | full |
| xref table removed, trailer and `startxref` kept | fails | full | full | full | full |
| xref, trailer, `startxref` and `%%EOF` all removed | fails | 2/3 pages, fails check | fails | fails | full |
| trailer dictionary removed | fails | full, fails check | fails | fails | full |
| no `%%EOF` | full | full | full | full | full |
| no `%%EOF`, cross-reference stream file | full | full | full | full | full |
| no `startxref` and no `%%EOF`, cross-reference stream file | fails | no bookmarks or link, fails check | full | full | full |
| cut off in the middle of the xref table | fails | full, fails check | fails | fails | full |
| cut off at 90% (classic table) | fails | full, fails check | fails | fails | full |
| cut off at 90% (cross-reference stream) | fails | no bookmarks or link, fails check | fails | fails | full |
| `pages-500.pdf` cut off at 60% | fails | 302 pages, fails check | fails | fails | 302 pages, fails check |
| `damaged-cut.pdf` (40% of 500 pages) | fails | 198 pages, fails check | fails | fails | 198 pages, fails check |
| 250 bytes of junk before `%PDF` | full | full | full | full | full |
| the same, cross-reference stream file | full | full | full | full | full |
| junk after `%%EOF` | full | full | full | full | full |
| 102 bytes inserted after the header | fails | full | full | full | full |
| the same, cross-reference stream file | fails | full | full | full | full |
| no `%PDF` header line | fails | full | full | full | full (with `%PDF-1.7` added in front) |
| a stream `/Length` 40 bytes too long | fails | full | full | full | full |
| a stream `/Length` 20 bytes too short | fails | full | full | full | full |
| a stream with no `/Length` | fails | full | full | full | full |
| bytes changed in a compressed drawing stream | 2/3 pages, fails check | 2/3, fails check | 2/3 | 2/3, fails check | 2/3, fails check |
| bytes changed in a compressed object stream | fails | no bookmarks or link | fails | fails | no bookmarks or link |
| bytes changed in the compressed cross-reference stream | fails | no bookmarks or link | no bookmarks or link | fails | full |
| a page dictionary's closing `>>` blanked | 2 pages | 2 pages | 1 page | fails | 2 pages |
| one `endobj` blanked | full | full | full | full | full |
| trailer has no `/Root` | fails | fails | fails | fails | full |
| page tree points to a missing object | 2/3 pages | 2/3 | 2/3 | 2/3 | 2/3 |
| every LF made CR LF (text-mode transfer), classic | fails | 3 pages, no text, fails check | 3 pages, no text | 3 pages, no text, fails check | 3 pages, no text, fails check |
| the same, cross-reference stream file | fails | 1/2 pages, fails check | fails | fails | 1/2 pages, fails check |
| 4 KB zeroed in the middle of `pages-500.pdf` | fails | 489 pages | 500 pages (488 with text) | fails | 489 pages, qpdf fails to write |
| an incremental update whose `/Prev` is 13 bytes off | fails | full | full | full | full |

Findings:

1. **Our qpdf never recovers.** It exits 2 at the first problem (`expected n n obj`, `can't find startxref`, `expected endstream`, `unable to find /Root dictionary`, an inflate error) and never prints desktop qpdf's "file is damaged" or "Attempting to reconstruct cross-reference table". It still reads faults that need no recovery (warnings, exit 3), junk before `%PDF` or after `%%EOF`, and a missing `%%EOF`. 27 of the 36 cannot be written at all. Its recovery paths sit behind C++ `catch` blocks that this build never reaches; why is not known (the package's JavaScript holds no exception glue; it may be built without catching). No command-line flag turns recovery on.
2. **PDF.js opens 26**, failing on every cut-off file, a missing trailer or `/Root`, a damaged object stream and CR LF in a cross-reference stream file. It reads the zeroed file best (500 pages, 488 with their text) but cannot write it.
3. **PDF.js's `extractPages([{ document: null }])`** writes a whole new file, but on every good fixture it drops catalog entries (`/StructTreeRoot`, `/MarkInfo`, `/Lang`, `/Dests`, `/Threads`, `/AF`, `/OutputIntents`, `/ViewerPreferences`, `/PieceInfo`, `/Extensions`), drops `/ModDate`, adds `/Version`, and keeps an input's `/Encrypt`. Accessibility tags, named destinations, reading threads and document-level attachments are lost: it fails "Leaves alone what it was not asked to change".
4. **pdf-lib's reader** (`PDFDocument.load` with `throwOnInvalidObject: false`, `updateMetadata: false`) parses every `n g obj` from the start (`PDFParser.parseDocument`), the last copy of an object winning, expands object streams, finds the catalog when the trailer lacks one (`maybeRecoverRoot`), finds `endstream` when `/Length` is wrong, and decrypts RC4, AES-128 and AES-256 with a password. With `save({ useObjectStreams: false })` and qpdf's `--object-streams=generate` after it:
   - on every good fixture (24, `compress-password.pdf` aside), the result is **byte-size identical to qpdf's own rewrite and holds the same catalog keys, document details, page contents (decoded, hashed), annotations, rotation, boxes, fields, outline and attachments** (compared with pikepdf);
   - on the damaged files it matched or beat desktop qpdf on every one, beating it on 8;
   - on a damaged copy of `password.pdf` (AES-256), and AES-128 and RC4 copies of `text.pdf`: no password gives `EncryptedPDFError`; `password: ''` gives "NEEDS PASSWORD" for a file with an opening password and succeeds for `restricted.pdf`; a wrong password gives "Password incorrect"; the right one gives a decrypted file whose text reads correctly. `ignoreEncryption: true` writes encrypted strings with no way to read them, so it is never used;
   - it keeps objects it cannot parse as raw bytes (`PDFInvalidObject`) and writes them back; that is why qpdf could not write the zeroed and CR LF results. Removing them from pdf-lib's context before saving lets qpdf write both.
5. **The sweep makes every partial result pass `qpdf --check`** (each step tried on the files that needed it): on a plain copy (no object streams), pages whose `/Contents` points to nothing get those entries removed (the two cut files, the zeroed file: check 2 → 0); streams that qpdf cannot decode (found with `--show-object=N --filtered-stream-data`, exit 2) are replaced by what still inflates, here nothing (the corrupted drawing stream, both CR LF files: check 2 → 0 or 3). `qpdf --check` itself stops at the first undecodable stream without naming it, so streams are tried one by one.
6. **Cost on large files** (pdf-lib route, from a wrong `startxref`, the whole pipeline but the sweep): `make-large.mjs` (110 MB, one page, a 105 MB attachment): parse 56 ms, save 198 ms, qpdf write 0.6 s, check 0.3 s, Node peak 1.27 GB; `--scans` (106 MB): check 46.7 s (the shared `--check` cost already named for Grayscale), peak 0.64 GB; the 120,000-page file: parse 3.1 s, save 0.4 s, write 4.1 s, check 3.9 s, peak 0.69 GB.
7. **pdf-lib on crafted files:**
   - an object stream that unpacks to 900 MB (an 875 KB file): 4.8 s and 2.03 GB; to 2 GB (1.9 MB file): 9.7 s and 4.15 GB. pdf-lib's own decoders grow their buffer with no limit (`DecodeStream.ensureBuffer`);
   - with a cap installed on `DecodeStream.prototype.ensureBuffer` (reached through an instance from the exported `decodePDFRawStream`), the 900 MB case stops at 64 MiB in 0.24 s; pdf-lib catches the error itself and goes on without that stream's objects;
   - 20,000 objects that never close (0.4 MB): 20.6 s, quadratic (each one is scanned to the end of the file for `endobj`); 5,000 unclosed streams (0.2 MB): 12.0 s, quadratic;
   - a prototype pre-pass that closes each object before the next `n g obj` header and each stream before it: 20,000 unclosed objects then parse in 0.53 s; 200,000 in 5.1 s; 5,000 and 200,000 unclosed streams in 5 ms and 0.18 s. The prototype itself was not linear (13 s at 200,000) because of a repeated search; the real one must be (decision 3);
   - 200,000 nested arrays: refused cleanly in 14 ms; 2 million tiny objects (51 MB): 31.7 s, 1.05 GB; one array of 20 million numbers (40 MB): 7.4 s, 1.27 GB.
8. **The `/DP` bug is not `plainCopy`'s alone.** Any qpdf write with its default stream compression gives an unfiltered stream that carries `/DP` a `/Filter /FlateDecode` and keeps `/DP` (`--object-streams=generate` and `=disable` alike; not with `--compress-streams=n`). Every writing tool does it.

### Added after the stage 1 review (28 Nov 2026)

9. **The stage 1 security review measured more of pdf-lib's reader** (its figures, quoted here, re-measured in task 3.3):
   - four scans stay quadratic after a pre-pass that only closes objects and streams: an unclosed literal string (`parseString`), an unclosed hex string, runs of junk (`skipJibberish`, which tries `matchIndirectObjectHeader` and `parseRawInt` at each byte, also inside objects), and extra `stream` words (`findEndOfStreamFallback`, used whenever `/Length` is missing, wrong or indirect);
   - a cross-reference stream whose `/Type` is indirect slips past a byte-level pre-pass; with `/W [0 0 0]` and `/Size 50000000` pdf-lib takes 21.9 s and 3.3 GB;
   - 2,000 object-stream entries all at offset 0 of a 20,000-number array: 12.8 s and 2.1 GB, under any decode cap;
   - `getPageCount`, `getPages` and `getForm` walk the page tree recursively with no visited set: 1.7 KB of `/Kids` gives 16.7 million pages, and a loop overflows the stack;
   - asking qpdf for filtered stream data on standard output buffers it byte by byte in `createQpdf`; a 2 GB Flate bomb exhausts the tab;
   - `save()` decodes `/Metadata` (`readCatalogPDFAConformance`), and `readCatalogMetadataXml` swallows a decode error: a 1 GB metadata bomb in a 1 MB file peaks at 1.13 GB;
   - a filter chain of six Flate stages turns 82 KB into 513 MB, so a per-stream byte cap must count every stage;
   - a byte cap is not a memory cap: 16 MiB of `0 ` in an object stream peaks at 624 MB, 60 MiB at 2.0 GB.
10. **Every hook the defences need is reachable on pdf-lib 2.11.1's exported classes** (checked in a scratch worktree with its own `npm ci`): `PDFParser.prototype.skipJibberish`, `findEndOfStreamFallback`, `parseIndirectObject`, `tryToParseInvalidIndirectObject`; `PDFObjectParser.prototype.parseString`, `parseHexString`, `findEndOfStreamFallback`; `PDFXRefStreamParser.forStream`; `PDFObjectStreamParser.prototype.parseOffsetsAndObjectNumbers` and `forStream`; `DecodeStream.prototype.ensureBuffer` through an instance from `decodePDFRawStream`. Whether each defence makes its case linear is measured in tasks 3.1 and 3.3; if one cannot be, the build stops and the question goes back to the owner (task 2.4).
11. **Round 2 of the stage 1 security review** (its figures, quoted, re-measured in task 3.3): pdf-lib reads past the pre-pass, because `tryToParseInvalidIndirectObject` jumps to the next raw `endobj` even inside what the pre-pass took for a string (`1 0 obj ] (\nendobj\n<attack>)`), so an unclosed hex string (469 KB: over 150 s) and a space run (200 KB: 50 s) reach it untouched; `parseHexString`, `parseString` and that `endobj` search are not covered by per-function wraps, and a wrap cannot cap work inside one call; increasing object-stream offsets still allow overlapping parses (`((((…))))` with offsets 0, 1, 2…: 14.5 KB, 6.8 s; 540 KB decoded, over 150 s). Counting `ByteStream.prototype.next` calls per pdf-lib call (its prototype reached through `lib.PDFParser.forBytesWithOptions(new Uint8Array(1)).bytes`) and throwing past 8 × (input + decoded object-stream bytes) stopped the hex attack in 0.27 s and the space run in 0.01 s, while a genuine 9 MB file of 200,000 objects used 1.9 times its size in the same time. The review also found that a flat cap of 64 qpdf instances stops genuine large files, and that each raw batch copies the whole file into its instance.
12. **Round 3 (architecture):** `PDFObjectParser.parseDictOrStream` jumps with `moveTo(start + Length)` and copies with `bytes.slice(start, end)`, and `PDFParser`'s invalid-object fallback copies the same way, with no `next()` calls, so a read counter alone misses them: an object stream of N entries each `<< /Length L >> stream` reaching one shared `endstream` near its end passes the offsets check and grows memory by about N × D (out of memory instead of `output-limit`); at top level the same gives copy traffic that grows with the square of the file.

## Goals / Non-Goals

**Goals:**

- Recover, in the browser, at least what desktop qpdf recovers from the common kinds of damage, with no new dependency (owner, 28 Nov 2026).
- Never give a file that fails `qpdf --check`; say plainly what cannot be recovered.
- Keep everything an undamaged file holds (the fidelity of qpdf's own rewrite).
- Bound time and memory for every hostile case found so far, with a named defence and a test each, before and while pdf-lib reads the file.
- Link other tools' damaged notice to Repair PDF without storing anything (owner, 28 Nov 2026, "Plain link now").

**Non-Goals:**

- Carrying the file from another tool (the shared handover, its own change).
- A new or rebuilt qpdf (owner, 28 Nov 2026).
- Recovering lost content, guessing passwords, certificate encryption, files turned away by the type check.
- Fixing the `/DP` bug (decision 9).

## Before this change: the one-file rewrite step (its own small pull request)

As `pages.ts` (PR #39) and `shrink.ts` (PR #41) were moved before the tools that needed them, with no change in behaviour and so no OpenSpec change, one pull request goes first:

- `oneFileLimit(size)` (`2 × size + 16 MiB`) and `rewrite(tools, bytes, passwordArgs, extraArgs, onWriting)` (a fresh qpdf, `cappedWrite` at that limit, `/in.pdf` let go) in `src/engines/qpdf.ts`; Protect with a password, Remove a password and Compress to a target size moved onto them;
- `certificateEncrypted(printed)` in `src/engines/inspect.ts` (qpdf's "unsupported encryption" words, as `unlock-pdf.ts` matches them today) and an `inspectPdfNamingCertificates` inspector (or an option to `inspectPdf`) returning `unsupported` for it; Remove a password moved onto it.
- Proof: every output of the three tools byte-identical on every fixture (the trailer `/ID` aside where qpdf writes a fresh one), their tests changing only in import lines; the review panel's stage 2 as for any change. Repair imports these; until that pull request is merged nothing here calls them shared.

## Decisions

### 1. The approach: our pre-pass, pdf-lib's reader under guards, qpdf to write and check

Decided by the owner on 28 Nov 2026 after these measurements. `tool-engines` "The library for each job" says a tool that repairs uses qpdf; this change modifies it (delta in this change): repair reads a file qpdf cannot open with `@cantoo/pdf-lib` after our pre-pass, and qpdf writes and checks the result. qpdf stays the writer and the judge.

Alternatives weighed, for the record: qpdf alone (recovers nothing that needs recovery, finding 1); a qpdf build whose recovery works (declined by the owner: a new binary dependency and build pipeline); PDF.js's `extractPages` (lossy, finding 3; fails on cut-off files, finding 2); PDF.js reading with another writer (no raw objects in its API); our own full reader (needs our own decryption and stream-dictionary rewriting; pdf-lib has both). If the guards of decision 4 cannot make every known hostile case linear, the build stops and the choice goes back to the owner (task 2.4).

### 2. The engine (`src/engines/tools/repair-pdf.ts`)

`loads = { read: ['qpdf', 'pdflib'], job: ['qpdf', 'pdflib', 'fflate'] }`. One file. Imports `qpdf` (`oneFileLimit`, `rewrite`, `cappedWrite`), `qpdf-json` (`readDictionaries`, `readRawStreams`, `rawBatches`, `streamUpdateJson`), `pages` (`writePageUpdate`, `sizeLimit`), `plain` (`passwordFrom`, `freshQpdf`), `inspect` (`readPdf`, `certificateEncrypted`), `zlib` (`inflateReadable`) and `content` (`decodeContent`, for non-Flate filters in the sweep; decision 7a); never another engine, `stamp`, `shrink` or `picture`. The built chunks its sets fetch are named in the allowlists: `pages-*`, `plain-*`, `inspect-*`, `zlib-*`, `content-*` as built (task 4.1).

**`inspect(file, password, tools)`:**

1. `readPdf` (qpdf). `ready` with pages, `needs-password` or `wrong-password` as every tool; `certificateEncrypted` → `unsupported`.
2. Otherwise the repair read: `rebuild` (decision 3), which also reports whether any trailer names `/Encrypt`; then pdf-lib's `load` under the guards (decision 4). With no password and an `/Encrypt` seen, the first parse is `password: ''` (skipping the parse that can only end in `EncryptedPDFError`; L3); "NEEDS PASSWORD" → `needs-password`; with a password, "Password incorrect" → `wrong-password`; "unknown encryption method" or "unsupported encryption algorithm" → `unsupported`; otherwise pages counted by our own walk (decision 5): at least one → `ready` with that count; none → `damaged`. These message strings are pinned by the password tests, so a pdf-lib upgrade that changes them fails.
3. Only the count leaves `inspect`; pdf-lib's document and the rebuilt bytes are let go before it returns. A large damaged file is therefore parsed twice, once here and once in the job; both are timed in task 3.3.

**`run(files, options, onProgress, tools)`:** "Reading the file" (`{ stage: 'reading', unit: 'file', done: 0, total: 1 }`), then writing (decision 7):

1. **qpdf route.** A fresh qpdf runs `--check` (with `--password=` when given). Exit 0 with nothing printed after the check's own lines, a file starting with `%PDF-` at byte 0 and `%%EOF` in its last 1,024 bytes: `[]` (nothing to repair; found only after the main button, named in the pull request and the hand checks). Exit 0 or 3 otherwise, or exit 2 while `--show-npages` succeeds: the plain copy is `rewrite(…, ['--decrypt', '--object-streams=disable'])`.
2. **pdf-lib route** (qpdf cannot open it): `rebuild`, `load` under the guards with the password, every `PDFInvalidObject` removed from `context`, `save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: Infinity })` under the same guards, the guards' record checked after `load` and again after `save` (a refusal → `OutputLimit`), the document and rebuilt bytes let go, then `rewrite(…, ['--object-streams=disable'])` of pdf-lib's bytes as the plain copy.
3. **Sweep** (decision 6) on the plain copy, always written as an update even when nothing changes.
4. **Final write**: `rewrite(…, ['--object-streams=generate'])`, then a fresh qpdf's `--check`; not finished → `RepairFailed` (the `too-damaged` failure kind, decision 8).
5. The output's page count (qpdf `--show-npages`) equals the count `inspect` gave on every one of the 36 kinds (asserted in the tests).

No password goes anywhere but `--password=` and pdf-lib's `password` option. qpdf's and pdf-lib's printed text stays in the worker.

### 3. The linear pre-pass (`src/engines/rebuild.ts`)

Its own source file only so its tests stand alone; only Repair imports it, so the build inlines it into `repair-pdf-*.js` and no chunk of its own exists (named in `check-worker.mjs`'s `lateSources` with its own sentences; not added to the forbidden lists). One forward pass with a bounded look-ahead, time linear in the input:

- **Objects:** finds `<int> <int> obj` at token boundaries outside strings, comments and stream bodies; closes an object with no `endobj` before the next header or the end.
- **Strings:** inside an object, follows literal strings with pdf-lib's own rules (nested parentheses, backslash escapes) and hex strings; one still open at the object's end is closed there (H1).
- **Runs:** outside strings and stream bodies, a run of whitespace or comments over 4 KiB becomes one space, and a run of digits over 32 (no valid PDF number is that long) is cut to 32 (H1, `skipJibberish` and `parseRawInt`).
- **Streams:** for a dictionary followed by `stream`, the body runs to the first `endstream` before the next object header (found by the same forward scan). A direct `/Length` that ends exactly at that `endstream` is trusted and left (L4); otherwise a direct, correct `/Length` is written into the dictionary before its `>>`, so pdf-lib never needs `findEndOfStreamFallback` (H1). A stream with no `endstream` is closed before the next header.
- **Between objects:** only `trailer` dictionaries (kept whole) and whitespace survive; old `xref` tables, `startxref` values and other junk are dropped, as pdf-lib needs none of them.
- **Header:** `%PDF-1.7` added in front when no `%PDF-` is in the first 1,024 bytes (only reached by a test; the page's type check turns such files away, owner question 9).
- **Knowledge passed on:** whether any trailer names `/Encrypt` (L3).
- **Unchanged files:** when nothing above changes a byte, it returns the input itself, not a copy (read-time memory).
- Everything copied is counted against the size budget. It decodes nothing.

### 4. Guards around every pdf-lib call

pdf-lib's reader is guarded at run time, on its exported classes, pinned to 2.11.1 by tests that fail if a hook moves (`ByteStream.prototype.next` among them), and by one Chromium test against the built worker proving the hooks are reached in the bundled `pdflib-*.js` (task 6.1). `LICENSES.md`'s pdf-lib line says any upgrade must re-run the hostile tests:

- **Installed once per worker, per-call tokens (A1, M3).** `guardPdflib(lib)` (in `repair-pdf.ts`) wraps the hooks below once, idempotently. Each repair call to pdf-lib (`load`, `save`) runs through `withGuards(budget, fn)`, which sets a module-level current token holding that call's budgets and record, and calls are serialised through a module-level promise chain, so two overlapping reads (a wrong password, then the right one, typed quickly) never share or reset each other's token. `withGuards` clears the token in `finally` and continues the chain whether the call succeeded or threw. `parseSpeed: Infinity` on `load` and `objectsPerTick: Infinity` on `save` also keep each call from yielding to timers (L1; measured in Chromium in task 3.3).
- **One work budget for the whole parser (H1, H3; stage 1 rounds 2 and 3).** Every byte pdf-lib's parser reads or copies goes through `ByteStream.prototype.next` or `ByteStream.prototype.slice`. `ByteStream` is not exported; its prototype is reached through `Object.getPrototypeOf(lib.PDFParser.forBytesWithOptions(new Uint8Array(1)).bytes)`. The wraps count, per repair call, each `next()` call and the `end − start` of each `slice()` (which `PDFObjectParser.parseDictOrStream` uses after jumping with `moveTo(start + Length)`, and the invalid-object fallback in `PDFParser` uses too, with no `next()` calls between); once the read count or the copied bytes pass `k × (input bytes + decoded object-stream bytes)` (two counters, the same limit), every later `next()` or `slice()` throws, so the stop escapes pdf-lib's own `catch` blocks (`tryToParseInvalidIndirectObject`, `skipJibberish`, the object-stream parser), and it is recorded and mapped to the shared `output-limit` words, as the decode guard is. This bounds the cases a per-function wrap cannot: pdf-lib reading past the pre-pass (`tryToParseInvalidIndirectObject` jumps to the next raw `endobj`, even inside what the pre-pass took for a string, as in `1 0 obj ] (\nendobj\n<attack>)`), the unwrapped `parseHexString`, `parseString` and `endobj` search, work inside one call, and overlapping object-stream parses (offsets 0, 1, 2… over `((((…))))`). Security's measurement with k = 8: an unclosed hex-string attack (469 KB, over 150 s unguarded) stopped in 0.27 s, a space run (200 KB, 50 s) in 0.01 s; a genuine 9 MB file of 200,000 objects used 1.9 times its size, in the same time. `k` is set in task 3.3 from the highest ratio measured across the 36 damaged kinds and every fixture, with a margin (expected 8). The pre-pass rules stay for recovery quality, not as the work bound.
- **Decoders (M1, H6).** `DecodeStream.prototype.ensureBuffer` (reached through an instance from `decodePDFRawStream`) adds the size it allocates (the power-of-two size it grows to) to the token's running total; a growth past 64 MiB for one stream, or past the call's decode budget, throws and is recorded. Every stage of a filter chain grows its own buffer, so a six-stage chain is counted six times. The guard is on for `save()` too, so `readCatalogPDFAConformance` decoding `/Metadata` is bounded, and the record (not pdf-lib's swallowed error) is checked after each call.
- **The decoded budget (M2).** Object-stream contents become many small JavaScript objects (16 MiB of `0 ` peaks at 624 MB). The call's decode budget is set from a Chromium measurement of the densest object-stream content (task 3.3) so it stays under the ceiling; the expected figure is 12 to 16 MiB in all per call. The 120,000-page and 110 MB damaged files are measured through the pdf-lib route against it; if a genuine large file does not fit, owner question 10 takes it.
- **Cross-reference streams (H2).** `PDFXRefStreamParser.forStream` is replaced, for every repair call, by a stub that merges only `/Root`, `/Info`, `/Encrypt` and `/ID` of the stream's dictionary into the trailer and never decodes or reads its entries, whatever `/Type` looked like in the bytes.
- **Object-stream offsets (H3).** `PDFObjectStreamParser.prototype.parseOffsetsAndObjectNumbers` is wrapped: `/N` at most a quarter of the decoded length, offsets strictly increasing and inside the decoded data; otherwise that object stream is refused (its objects lost, recorded, not a job failure). Increasing offsets do not stop overlapping parses (each object may run past the next offset); the work budget bounds those. An object-stream entry that parses as a stream is refused, as the format forbids streams inside object streams (round 3: N entries each `<< /Length L >> stream` reaching one shared `endstream` would otherwise copy about N × D bytes).
- **Scans.** No separate wraps on `skipJibberish` or `findEndOfStreamFallback`: a wrapper cannot cap work inside one call, and the work budget counts every byte they read. They are dropped from the plan.
- **Console (L2).** Every console method is replaced by a no-op for the duration of each call and restored after.
- **Never the recursive walks (H4).** No repair code calls `getPageCount`, `getPages`, `getForm` or any API that walks the page tree; decision 5 counts pages.
- The wrappers do nothing outside a repair token, so no other step in the worker sees them; each job runs in a fresh worker anyway.

Alternative considered and rejected: unpacking object streams ourselves before pdf-lib (cannot see encrypted files' plain data; doubles the code reading object streams).

### 5. Counting pages (H4)

An iterative walk over pdf-lib's context from the catalog's `/Pages`, with a visited set of references and a node cap equal to the number of objects in the context: each `/Kids` entry is followed once; a node already visited is skipped; a leaf with `/Type /Page` (or no `/Kids`) counts. Linear in the objects; loops and shared subtrees count once. qpdf's `--show-npages` on the output confirms the count in the job.

### 6. Passwords and what is kept

The plain copy is decrypted on both routes, so the new file has no password and no restrictions (owner, 28 Nov 2026). pdf-lib keeps the newest copy of each object found, so earlier saved versions go and a signature stops being valid. **If the newest save was lost in the damage, the repaired file can hold parts of an earlier saved version** (an older copy of an object is then the newest found): a result note and the page text say so, and it is one of the Privacy facts. Objects nothing reaches are dropped by qpdf's write. Free entries of the old table are not read, so an object deleted in a later save comes back only if something still points to it.

### 7. The sweep

On the plain copy (JSON updates do not reach object streams). **Nothing decoded is ever asked for on qpdf's standard output (H5).**

1. **Listing:** `readDictionaries` (capped JSON of every object's dictionary, no stream data).
2. **Missing drawing:** every page dictionary whose `/Contents` is, or holds, something that is not a stream gets those entries removed (none left: a blank page of its size).
3. **Damaged streams:** each stream's raw data is fetched with `readRawStreams` in `rawBatches` asking for 2,000 ids a batch, as Grayscale does, with the ids per batch chosen from the stream count within what one argument file holds, and the bytes per batch budgeted and judged by our own capped decoders: a lone `/FlateDecode` with no `/DecodeParms` through `inflateReadable` (64 MiB, the budget); the chains `content.ts`'s `decodeContent` takes through it; filters neither takes (predictors, DCT, JPX, JBIG2, CCITT, Crypt) are not judged and left to qpdf's check. A stream that decodes to the cap is not called damaged and is left. A damaged Flate stream keeps what came out before the error; any other damaged stream gets empty data; `/Filter`, `/DecodeParms` and `/Length` are dropped from its dictionary and qpdf compresses it again.
4. **A page's drawing past 64 MiB decoded** stops the job with the shared `page-too-large` kind and the page's number, as Grayscale does, because qpdf's check would read it whole into memory; Repair's sentence uses its own verb ("repair") through `pageTooLargeSentence(page, action)` with an action word in the registry (Grayscale's words unchanged).
5. **Instances (M4; stage 1 round 2).** The instance limit can never be what stops a job: within the copy limit, the copy limit is always reached first, so it is the real bound and the instance limit is kept only as a backstop named as such. Each raw batch copies the whole plain copy into a fresh instance, so the real cost is instances × file size. A flat cap would stop genuine large files (the 120,000-page file has at least 120,000 drawing streams: about 60 batches at 2,000 ids, about 600 at 200). The cap grows with the file instead: at most `8 + ceil(streams / ids per batch)` instances, and the bytes written into qpdf instances over the job at most `c × input + 512 MiB`, with `c` set in task 3.3 so the 120,000-page and 20,000-page files pass (expected about 100; the 120,000-page file needs about 66 × 16.6 MB). A crafted file of many tiny streams, whose batches would make that sum grow with the square of its size, stops with the shared `output-limit` words. Both bounds are named in the pull request.
6. The update is always written (`streamUpdateJson`, `writePageUpdate`'s capped write), even when empty, so the instance count does not say whether the sweep changed anything.

Pages lost entirely are not named (owner question 5); the result shows the pages found.

**7a. Importing `content.ts`, and the new built file it makes.** Two importers make the bundler split `content.ts` out of `grayscale-pdf-*.js` into its own `content-*.js`, so Grayscale PDF's job fetches one more file (the same code, moved). Chosen over the alternative, emptying damaged streams in other filters by qpdf's verdict, because qpdf can only give that verdict by printing decoded data on standard output (H5) or through its check, which names no stream; `decodeContent` is the project's own capped decoder for exactly the chains (RunLength, LZW, ASCII85, ASCIIHex) qpdf's check decodes. The split is named in the proposal and task 4.1, added to `scripts/page-weight.mjs`, reflected in Grayscale's required chunks, no-upload allowlist and uniform-requests expectations, recorded as Grayscale's job-start fetch before and after, and listed in the Privacy facts.

### 8. Progress, memory, instances and time

- **Progress:** "Reading the file" until the plain copy exists; the writes fill 0 to 50 (plain copy 0–25, sweep 25–35, final write 35–50); the final `--check` shows 55 when it starts and 95 when it ends; 100 when the file is ready, as Protect does.
- **Memory:** the input, pdf-lib's document and its saved bytes are let go before the next step; peaks measured in Chromium in task 3.3 for the read step and the job. If the 110 MB damaged file's job peak (1.27 GB in Node before these fixes) stays over the ceiling the other tools are held to, it becomes owner question 10 with the default "accept for now", as Grayscale's question 9 did.
- **qpdf instances:** qpdf route: check, plain copy, listing, `ceil(streams / 2,000)` raw batches, update, final write, check, within the growing cap of decision 7. pdf-lib route: one fewer check, the same after. What the count can tell the host, under the no-cache exception: whether qpdf could read the file (the route), and roughly how many streams it holds (the batches); not whether the sweep changed anything (always written). Whether repair was needed shows anyway: a file with nothing to repair stops after one instance.
- **Time:** linear in the input on every known case (decision 4); millions of objects take tens of seconds (finding 7; owner question 8). Cancel ends the worker.

### 9. The `/DP` bug stays its own change

Finding 8 shows it comes from qpdf's ordinary compression, so every writing tool has it; the fix belongs in one shared place with its own tests across every tool. Repair inherits it until then; a Repair unit test records the current behaviour so the shared change updates it.

### 10. The registry entry (words are drafts for the owner)

`id: 'repair-pdf'`, group `smaller`, after `grayscale-pdf`, browser, phase 2, `accepts: ['application/pdf']`, related `compress-pdf`, `merge-pdf`, `split-pdf`, `pdf-to-jpg`, `unlock-pdf`.

- name "Repair PDF"; summary "Recover what can still be read from a damaged PDF."; title "Repair a damaged PDF in your browser - PDFkaro" (46 characters); description "Recover what can still be read from a damaged PDF. The file stays on your device and is not uploaded. You get it in a new file." (127); heading "Repair a damaged PDF"; sentence "Recover what can still be read from a damaged PDF. Your file stays on your device."
- widget: picker "Choose a PDF file", add "Choose another file", action "Repair and download", writing "Writing the repaired file", done "Your repaired file is ready", failed "The file was not repaired.", `tooFewFiles` "Choose a PDF file to repair.", `outputSuffix: 'repaired'`, one file, `resultPages: 'input'`, `items: 'files'`, `outputs: 'one'`, memory advice "Try on a computer.", page-too-large action "repair";
- **one wording for "another copy"** in both places: "If you have another copy of the file, try that one.";
- `damagedAdvice`: "No pages could be found in it. If you have another copy of the file, try that one.";
- `unsupportedAdvice`: Remove a password's existing sentence, "It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection." (`registry.ts`, Unlock's entry);
- `noSmaller`: "This file has no damage this tool can find." / "No new file was made. You can use your file as it is. If it does not open in one program, try opening it in another.";
- result notes: "The new file holds every page and part that could be read. Anything lost in the damage, such as missing pages, text or pictures, cannot be brought back, and if the file's last save was lost, parts of an earlier version may show. Check the new file before you rely on it." and "Links, form fields, bookmarks, attached files and the document's details that could be read are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them."
- The "Make smaller and fix" hub description and sentence gain repairing a damaged file.
- **A file found too damaged only by the job** (none of the 36 measured did) fails with `RepairFailed`, mapped by name in `worker-core.ts` to a new shared failure kind `too-damaged`, sentence "This file is too damaged to repair. If you have another copy of the file, try that one." (`tooDamagedSentence`). Its failed state offers **"Choose another file"** (removes the file and moves focus to the picker), not "Go back to your file", since going back can only fail again: a small rider in `ToolWorkspace.tsx` choosing the action by failure kind. Rides along, named in the pull request, as `page-too-large` did with Grayscale.

### 11. The damaged-notice link (group 8, owner, 28 Nov 2026, "Plain link now"; same pull request as the registry entry)

- **Address from the registry:** `repairLink(tools)` in `src/tools/queries.ts` finds Repair PDF's page among the published pages (`allPages(tools)`, as `toListItem` builds its links, with `withBase`), and gives `undefined` when it is not published, the tool does not accept PDFs, or the tool is Repair; `[slug].astro` passes it to the widget as `repairHref`. Components import nothing new from `src/tools/`.
- **Order and look:** in the damaged notice, after the advice and **after** the "Leave this file out" / "Choose another file" button in DOM and Tab order (Merge must not lose its other files by a stray press), on its own line: the sentence "Repair PDF may be able to recover it. On that page, choose the file again." and the link "Go to Repair PDF", a plain underlined link at least 44px tall by padding, clearly apart from the button. Same tab, no `target`, nothing added to the address, nothing stored, no leave-page prompt (following it leaves the page and its listed files, as any link does).
- **Announcement:** `unreadableNotice` adds the Repair sentence to the status announcement when a link is shown.
- **Referrer:** following it is a plain `GET` of the Repair page; the browser's default referrer policy sends the tool page's address to the host. Owner question 11.
- Why not carry the file now: same-tab navigation ends the page's memory; the only carriers are storage, `window.name`, the address and session history, which "Handover between tools" forbids. A new tab given the bytes by `postMessage` is the shared handover (`add-tool-handover`), its own change.

### 12. Page text (`src/content/tools/repair-pdf.md`)

A draft, 250 to 500 words: how to use it (choose the file, give its password if asked, repair, check the new file); questions: "What kinds of damage can it fix?", "Why are some pages missing or blank?", "Why does some of the file look older?" (a lost last save), "Why does the new file have no password?", "My file still does not open in one program", "Is my file uploaded?". No promise that every file can be repaired.

### 13. The Privacy page draft

Visible draft sentences on `src/pages/privacy.astro`, as `add-compress-to-target` added its own, with a guard in `tests/unit/privacy-page.test.ts`: every PDF tool's damaged notice links to Repair PDF; following it asks GitHub for that page, which tells GitHub that a damaged file was picked and on which tool page (owner question 11); nothing of the file, its name or its password goes with it; the file must be chosen again there; on Repair PDF the program that reads damaged files is fetched after a pick whatever the file; how many times the browser asks for qpdf can tell GitHub whether the file could be read normally and roughly how many parts it has; a repaired file can hold parts of an earlier saved version when the last save was lost. The owner approves or rewords them; the page stays a draft.

## Effect on page weight and on when WebAssembly is fetched

- Before a pick: no change on any page. `/repair-pdf` ships the same island as every tool (expected about 79 KB, measured in task 4.1). The damaged-notice link and the too-damaged action add a few hundred bytes to the shared widget chunk, loaded after a pick.
- After a pick on `/repair-pdf`: qpdf and its WebAssembly, PDF.js's set, pdf-lib's chunk and `fflate` (new for a read set, about 243 KB by gzip). The most fetched after a pick rises from 2,041.3 KB to an expected 2.3 MB, measured in task 4.1.
- WebAssembly is still fetched only after a pick.

## Threats considered

Each hostile case has a named defence, a scenario under "Bounded work on hostile files", a unit test on a 1 to 4 MB file in fixed time, and a Chromium measurement in task 3.3.

| Threat | Defence |
| --- | --- |
| Unclosed objects and streams (finding 7) | Pre-pass closes them (decision 3) |
| Unclosed literal and hex strings (H1), pdf-lib reading past the pre-pass (round 2, a and b) | One work budget on `ByteStream.prototype.next` (k × input plus decoded object-stream bytes), throwing on every later read; pre-pass closing them for recovery quality |
| Junk and digit runs (H1) | Work budget; pre-pass collapses runs |
| Extra `stream` words, wrong or indirect `/Length` (H1) | Pre-pass writes a direct correct `/Length`; work budget |
| Cross-reference stream entries, indirect `/Type` (H2) | `PDFXRefStreamParser.forStream` stubbed for every repair call |
| Object-stream offset amplification and overlapping parses (H3, round 2 c) | `parseOffsetsAndObjectNumbers` wrapped: increasing, in range, `/N` ≤ length / 4; the work budget bounds overlap |
| Recursive page walks (H4) | Never called; our iterative visited-set walk |
| Decoded data on qpdf's standard output (H5) | Raw data through `readRawStreams`, judged by our capped decoders |
| `/Metadata` bomb in `save()` (H6) | Guards on for `save()`; record checked after it |
| Filter chains (M1) | Every decoder stage's allocation counted |
| Dense object streams (M2) | Decode budget set from Chromium measurement |
| Overlapping reads sharing a guard (M3, A1) | Wrappers once per worker, per-call tokens cleared in `finally`, serialised calls continuing after a throw |
| Copies without reads: `ByteStream.prototype.slice` after `moveTo(start + Length)`, in object streams and at top level (round 3) | `slice()` wrapped, `end − start` counted against the copy budget (k × input plus decoded object-stream bytes), throwing past it; streams inside object streams refused |
| Unbounded qpdf instances and copies (M4, round 2) | 2,000 ids a batch; instances at most `8 + ceil(streams / ids)`, bytes copied into instances at most `c × input + 512 MiB`, then `output-limit`; the 120,000- and 20,000-page files must pass |
| Timer clamping (L1) | `parseSpeed` and `objectsPerTick` Infinity |
| Library console output (L2) | Every console method silenced per call |
| Repeated parses (L3) | `/Encrypt` known from the pre-pass; repeats counted in the time bounds |
| A good `/Length` distrusted (L4) | Trusted when `endstream` follows it |
| Deep nesting | pdf-lib refuses 200,000 nested arrays in 14 ms |
| A drawing stream past 64 MiB | `page-too-large`, as Grayscale |
| Oversized file | No fixed limit; the shared 100 MB notice; memory measured, owner question 10 if over |
| Hostile file name | Never passed to an engine, library, URL or console; output name by the shared rule |
| Passwords | Only `--password=` and pdf-lib's option; never in errors, sentences or logs |
| The link | Registry address, nothing of the file in it, nothing stored; request named (owner question 11) |
| Server tools (SSRF, macros) | Not applicable |

## Tests

- `tests/unit/rebuild.test.ts`: each damaged kind; strings, comments and stream bodies holding `obj`, `endobj`, `stream` and parentheses; escapes and nesting; names with `#`; trailers kept, tables dropped; `/Length` trusted or rewritten; runs collapsed; the input returned itself when unchanged; linear time on 1 to 4 MB files of unclosed objects, streams, literal and hex strings, junk and digit runs, and extra `stream` words.
- `tests/unit/repair-pdf.test.ts` (with `repair-helpers.ts` building the 36 kinds in memory): every outcome at least the recorded one, `qpdf --check` passing, and the output page count equal to `inspect`'s; fidelity on every good fixture forced through the pdf-lib route; damaged AES-256, AES-128 and RC4 files with no, wrong and right passwords, pinning pdf-lib's message strings; unknown encryption → `unsupported`; restrictions only; certificate encryption; `text.pdf` giving `[]`; junk before the header giving a file; every hostile case of the threats table in fixed time and bounded memory, including the H2 `/W [0 0 0]` file, the H3 offsets file, a 1.7 KB `/Kids` bomb and a `/Kids` loop, 2 GB Flate bombs in a drawing stream and a picture on both routes, a 1 GB `/Metadata` bomb, a six-stage chain, 16 MiB of `0 ` in an object stream, two overlapping inspects (wrong then right password) on a bomb file, the first throwing, each refused by its own token and the second still guarded; the round 2 files (a: `1 0 obj ] (\nendobj\n<attack>)` with an unclosed hex string; b: unclosed literal and hex strings and space runs reaching pdf-lib; c: overlapping object-stream offsets over `((((…))))`), each failing fast with `output-limit`; the round 3 files (an object stream of N entries each `<< /Length L >> stream` reaching one shared `endstream`, and its top-level variant), each stopping fast with `output-limit`; the work and copy ratios of every damaged kind and fixture recorded; the instance and copy caps with the 120,000- and 20,000-page files passing; `PDFInvalidObject` dropped; the sweep's cases; the instance cap; nothing on standard output decoded; `globalThis.fetch` and every console method replaced and asserted never called; no error holding text, a name or the password; progress order; the `/DP` behaviour recorded.
- `engine-loads` shard: `repair-pdf` against every fixture.
- `tests/e2e/repair-pdf.spec.ts` and the group 8 tests as the tasks list them; the no-upload test on every route; in Chromium against the built worker, the 2 GB object-stream bomb, the cross-reference-stream file and the round 3 object-stream copy file refused, proving the hooks reach the bundled `pdflib-*.js`.

## Risks / Trade-offs

- [Run-time wraps of pdf-lib 2.11.1's parser (the work budget, decoders, the cross-reference stub, offsets, console) make this close to maintaining a fork] → each is pinned by a test that fails if the hook moves or stops being reached, one Chromium test proves them in the built worker, pdf-lib stays pinned; any upgrade re-runs the hostile tests. If stage 2 finds a case no wrap can bound, the choice goes back to the owner.
- [pdf-lib's reader may accept garbage as objects] → qpdf writes and checks everything after it.
- [The newest copy of an object wins; if the last save was lost, older content shows] → said in a result note, the page text and the Privacy facts.
- [Memory on 100 MB damaged files] → let go early; parsed twice (read and job) and timed; owner question 10 if over the ceiling.
- [Following the link tells the host a damaged file was picked, and where] → owner question 11; Privacy draft says so.
- [The link does not carry the file] → the words say so; the handover change replaces it.
- [Nothing to repair is known only after the main button] → named in the pull request and the hand checks; not moved.

## Migration Plan

One small pull request first (section "Before this change"). Then this change: a new page and a link in an existing notice, in one pull request. Rollback is reverting it; no stored state.

## Open Questions

None that change the specs, the approach or the tasks. The owner questions left are in the proposal.
