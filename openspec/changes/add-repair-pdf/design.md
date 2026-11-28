# Design

## Context

See `proposal.md` for why. What shapes the approach:

- Every PDF tool reads a file with `inspectPdf` (`src/engines/inspect.ts`): `qpdf --show-npages`, and anything but a password failure is `damaged`. The damaged notice (`unreadableNotice` in `src/widget/failures.ts`, drawn in `ToolWorkspace.tsx`) offers only "Choose another file" / "Leave this file out". `tool-page`'s "Damaged file state" already says a published Repair PDF is linked "with the file carried over"; nothing can carry a file between pages yet ("Handover between tools" is unbuilt, and forbids storage, `window.name` and the address).
- qpdf is `@neslinesli93/qpdf-wasm` 0.3.1 (qpdf 12.2.0), one fresh instance per step (`freshQpdf`), with `cappedWrite`, `--check` after every write, and JSON updates that do not reach objects inside object streams (so updates run on a copy written with `--object-streams=disable`, as `plainCopy` does).
- pdf-lib (`@cantoo/pdf-lib` 2.11.1) ships as its own chunk, `pdflib-*.js` (about 243 KB by gzip, `fflate` with it), loaded through `tools.pdflib`. Until now it has only built new documents (Image to PDF, the drawing step in `stamp.ts`); it has never parsed a visitor's file.
- PDF.js 6.5.438 runs in its own worker for thumbnails and drawing, with fixed helper data.
- The content reader (`src/engines/content.ts`) decodes and edits drawing instructions with caps; `src/engines/zlib.ts` holds capped inflate steps.

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

## Goals / Non-Goals

**Goals:**

- Recover, in the browser, at least what desktop qpdf recovers from the common kinds of damage, with no new dependency.
- Never give a file that fails `qpdf --check`; say plainly what cannot be recovered.
- Keep everything an undamaged file holds (the fidelity of qpdf's own rewrite).
- Bound time and memory before pdf-lib sees a hostile file.
- Link other tools' damaged state to Repair PDF without breaking the no-storage rule.

**Non-Goals:**

- Carrying the file from another tool (the shared handover, its own change).
- A new or rebuilt qpdf (owner question 2).
- Recovering lost content, guessing passwords, certificate encryption, files turned away by the type check.
- Fixing the `/DP` bug (decision 9).

## Decisions

### 1. The approach: our pre-pass, pdf-lib's reader, qpdf to write and check

Chosen because it is the only measured route that recovers everything desktop qpdf does (and more) with what the site already ships, and keeps every object a sound file holds.

Alternatives considered:

- **qpdf alone:** recovers nothing that needs recovery in this build (finding 1).
- **A qpdf WebAssembly build whose recovery works:** likely the best single engine (qpdf's own reconstruction, no second parser), and could also give the patched build the uniform-requests no-cache exception needs. But it means building and shipping our own binary or finding another maintained one: a dependency and supply-chain decision for the owner (question 2), and a build pipeline the repo does not have. Not blocking: if the owner wants it, it replaces steps 2 and 3 of decision 2 later.
- **PDF.js reading, `extractPages` writing:** lossy (finding 3) and fails on cut-off files (finding 2).
- **PDF.js reading, pdf-lib or qpdf writing:** PDF.js exposes no raw objects through its API; reaching its worker-side `XRef` would tie us to its internals and still fails on cut-off files.
- **Our own full reconstruction parser** (a new cross-reference table over the original bytes for qpdf): qpdf would still die on a wrong `/Length` (finding 1), so we would also rewrite stream dictionaries, and we would need our own decryption for damaged encrypted files. pdf-lib already does both.

### 2. The engine (`src/engines/tools/repair-pdf.ts`)

`loads = { read: ['qpdf', 'pdflib'], job: ['qpdf', 'pdflib', 'fflate'] }`. One file. Imports `rebuild`, `qpdf`, `qpdf-json`, `plain` (for `passwordFrom`, `freshQpdf`), `inspect`, `zlib`, never another engine, `stamp`, `shrink`, `picture` or `content`.

**`inspect(file, password, tools)`:**

1. `readPdf` (qpdf). `ready` with pages, `needs-password` or `wrong-password` as every tool. A certificate-encrypted file (`/Adobe.PubSec`, told from qpdf's printed text as Remove a password does) is `unsupported`.
2. Otherwise the repair read: `rebuild` (decision 3), then pdf-lib's `load` with the decode guard (decision 4): `EncryptedPDFError` → load again with `password: ''`; "NEEDS PASSWORD" → `needs-password`; with a password given, "Password incorrect" → `wrong-password`; at least one page → `ready` with pdf-lib's page count; else `damaged`.

**`run(files, options, onProgress, tools)`**, progress "Reading the file" (`{ stage: 'reading', unit: 'file', done: 0, total: 1 }`), then writing:

1. **qpdf route.** A fresh qpdf runs `--check` (with `--password=` when given). Exit 0 with nothing printed after the check's own lines, a file starting with `%PDF-` at byte 0 and `%%EOF` in its last 1,024 bytes: `[]` (nothing to repair). Exit 0 or 3 otherwise, or exit 2 from a stream that cannot be decoded while the file itself opens (`--show-npages` succeeds): the plain copy is qpdf's `--decrypt --object-streams=disable` write (`cappedWrite`), then the sweep.
2. **pdf-lib route** (qpdf cannot open it): `rebuild`, then `load` (with the password; guard on), then every `PDFInvalidObject` removed from `context`, then `save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false })`, the document and the rebuilt bytes let go, then qpdf's `--object-streams=disable` write of pdf-lib's bytes (`cappedWrite`) as the plain copy, then the sweep.
3. **Sweep** (decision 6) on the plain copy, as one JSON update when anything changes.
4. **Final write**: `--object-streams=generate` (`cappedWrite`, limit `2 × input + 16 MB`, the shared one-file rule), then a fresh qpdf's `--check`; not finished → the job fails as too damaged (`RepairFailed`, the `too-damaged` failure kind, decision 8).

No password goes anywhere but `--password=` and pdf-lib's `password` option. qpdf's and pdf-lib's printed text stays in the worker.

### 3. The linear pre-pass (`src/engines/rebuild.ts`)

A shared engine file only so its tests stand alone; only Repair imports it. It takes the bytes and gives new bytes for pdf-lib, in one forward pass with a bounded look-ahead, so its time is linear in the file's size:

- finds object headers `<int> <int> obj` (whitespace and comments as PDF allows) at token boundaries outside strings, stream bodies and comments;
- for a dictionary followed by `stream`, takes the body up to the first `endstream` before the next object header (found by the same forward scan, never by searching from each stream to the end); with none, closes the stream before that header;
- closes an object with no `endobj` before the next header or the end;
- turns each cross-reference stream (`/Type /XRef`, names compared decoded) into a `trailer` dictionary holding only its `/Root`, `/Info`, `/Encrypt` and `/ID`, so pdf-lib never unpacks or reads its entries (a reconstruction needs none);
- adds `%PDF-1.7` in front when no `%PDF-` is in the first 1,024 bytes (only reached by a test, as the page's type check turns such files away; owner question 9);
- copies everything else byte for byte, counting the output against the size budget.

It does not decode anything. Tested with every damaged kind above and crafted sizes where a quadratic scan cannot finish (200,000 unclosed objects and streams within a fixed time).

### 4. Capping pdf-lib's own unpacking

pdf-lib unpacks object streams (and would unpack cross-reference streams, which decision 3 removes) with decoders that grow without limit. For one job, `capDecoding(lib, limit, budget)` (in `repair-pdf.ts`) finds `DecodeStream.prototype` through an instance made by the exported `decodePDFRawStream`, wraps `ensureBuffer` so a request past 64 MiB, or past what is left of the job's budget (the shared `sizeLimit` rule), throws, and records that it did. It is restored in `finally`, so no other step sees it; each job runs in a fresh worker anyway. After `load`, a recorded refusal stops the job with `OutputLimit` (the shared `output-limit` words) rather than giving a file silently missing a stream's objects.

This works for encrypted files too, where our own capped decoders (`content.ts`) could not see the plain data before pdf-lib decrypts it. A unit test pinned to pdf-lib 2.11.1 checks that the guard is reached (a 65 MiB object stream is refused, a 63 MiB one is not), so an upgrade that moves `ensureBuffer` fails the tests. Alternative considered: unpacking object streams ourselves in the pre-pass and handing pdf-lib uncompressed copies; rejected because it cannot work for encrypted files and doubles the code that reads object streams. `software-architect` and `security-reviewer` should look hardest here.

### 5. Passwords and what is kept

The plain copy is decrypted on both routes, so the new file has no password and no restrictions (owner question 3). pdf-lib's `load` keeps the newest copy of each object, so earlier saved versions go, and a signature stops being valid (the result note says so). Objects nothing reaches are dropped by qpdf's write, as on every tool. Free entries in the old table are not read, so an object deleted in a later save comes back only if something still points to it.

### 6. The sweep

On the plain copy (JSON updates do not reach object streams):

1. One fresh qpdf lists every object with `--json=2 --json-key=qpdf --json-stream-data=none` (the `pages` key fails on such files, so only `qpdf` is asked for). Its size is counted against the budget before it is parsed, as `readValues` does.
2. **Missing drawing:** every page dictionary whose `/Contents` is, or holds, something that is not a stream gets those entries removed (no `/Contents` left means a blank page of its size).
3. **Damaged streams:** each stream is tried with `--show-object=N --filtered-stream-data` in batches on fresh instances (one instance breaks after a few hundred calls; batch size measured in task 2.3, as `rawBatches` was). For each that fails: a lone `/FlateDecode` with no `/DecodeParms` keeps what `fflate`'s `Inflate` gives before the error, through a capped step in `zlib.ts` (`inflateReadable`, 64 MiB, the budget); any other filter or chain gets empty data. Either way `/Filter`, `/DecodeParms` and `/Length` are dropped from its dictionary and qpdf compresses it again. JPG and JPEG 2000 data is never decoded by qpdf's check and is left.
4. The update is written with `streamUpdateJson` and `writePageUpdate`'s capped write.

Pages lost entirely are not reported by page number (owner question 5); the result shows the pages found.

### 7. Progress, memory, instances and time

- "Reading the file" until the plain copy exists; writing percentages from `cappedWrite` for the plain copy (0–40), the sweep (40–60) and the final write (60–100).
- Memory: the input, pdf-lib's document and its saved bytes are let go before the next step; measured in task 3.3 against the Chromium ceiling. The 110 MB file's 1.27 GB Node peak (finding 6) is over the 1.19 GB the other tools are held to; letting go earlier is expected to bring it under, and if not the change is updated before the pull request.
- qpdf instances: route A: check, plain write, JSON list, `ceil(streams / batch)`, update write, final write, check. Route B adds pdf-lib's parse and one more write. The count depends on the file (named in the proposal).
- Time: linear in the input; the shared `--check` dominates on scans (finding 6). A crafted file of millions of objects takes tens of seconds (finding 7; owner question 8). Cancel ends the worker.

### 8. The registry entry (words are drafts for the owner)

`id: 'repair-pdf'`, group `smaller`, after `grayscale-pdf`, browser, phase 2, `accepts: ['application/pdf']`, related `compress-pdf`, `merge-pdf`, `split-pdf`, `pdf-to-jpg`, `unlock-pdf`.

- name "Repair PDF"; summary "Recover what can still be read from a damaged PDF."; title "Repair a damaged PDF in your browser - PDFkaro" (46 characters); description "Recover the pages and parts of a damaged PDF that can still be read, in a new file that opens. The file stays on your device and is not uploaded." (145); heading "Repair a damaged PDF"; sentence "Recover what can still be read from a damaged PDF. Your file stays on your device."
- widget: picker "Choose a PDF file", add "Choose another file", action "Repair and download", writing "Writing the repaired file", done "Your repaired file is ready", failed "The file was not repaired.", `tooFewFiles` "Choose a PDF file to repair.", `outputSuffix: 'repaired'`, one file, `resultPages: 'input'`, `items: 'files'`, `outputs: 'one'`, memory advice "Try on a computer.";
- `damagedAdvice`: "No pages could be found in it. If you have another copy of the file, try that one.";
- `unsupportedAdvice`: "It is locked to certain people's certificates, not a password. Ask the person who sent it for a copy without that.";
- `noSmaller`: "This file has no damage this tool can find." / "No new file was made. You can use your file as it is. If it still does not open in one program, try another.";
- result notes: "The new file holds every page and part that could be read. Anything lost in the damage, such as missing pages, text or pictures, cannot be brought back, so check the new file before you rely on it." and "Links, form fields, bookmarks, attached files and the document's details that could be read are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them."
- The "Make smaller and fix" hub description and sentence gain repairing a damaged file.
- **A file found too damaged only by the job** (the final `--check` still fails after the sweep; none of the 36 measured files did) fails with a new error class `RepairFailed` in `repair-pdf.ts`, mapped by name in `worker-core.ts` to a new shared failure kind, `too-damaged`, whose sentence (`tooDamagedSentence` in `failures.ts`) is "This file is too damaged to repair. If you have another copy of it, try that one." It rides along with this tool, as `page-too-large` did with Grayscale, and is named in the pull request. The shared `engine` sentence ("Something went wrong. Try again.") was rejected: trying again gives the same result.

### 9. The `/DP` bug stays its own change

Finding 8 shows it comes from qpdf's ordinary compression, so every writing tool has it and the fix (rename `/DP` to `/DecodeParms`, or leave such streams uncompressed, before any write) belongs in one shared place with its own tests across every tool. Putting it in Repair would fix it for Repair only and hide a shared change in a tool pull request. Repair inherits the bug like every tool until that change lands; a Repair unit test records the current behaviour so the shared change updates it.

### 10. The damaged-notice link (tasks group 8, owner question 1)

With default A: `[slug].astro` passes `repairHref` (from `repairLink(tool)` in `src/tools/queries.ts`: `withBase('/repair-pdf')` when Repair is published and the tool accepts PDFs and is not Repair; else `undefined`). `unreadableNotice` gains an optional sentence; `ToolWorkspace` draws "Repair PDF may be able to recover it. On that page, choose the file again." and a plain link "Go to Repair PDF" between the advice and the button. Same tab, no `target`, nothing appended to the address, nothing stored. Components still import nothing from `src/tools/` but types and `filter` (the address comes as a prop).

Why not carry the file now, and why not a new tab: same-tab navigation ends the page's memory; the only carriers are storage, `window.name`, the address and session history, which "Handover between tools" forbids (session history can be written to disk for session restore). A new tab opened with `window.open` and given the bytes by `postMessage` (exact origin both ways, `event.source` checked) keeps the file in memory only; it is the shared handover that next steps need too, with its own security and privacy review, in its own change (`add-tool-handover`).

### 11. Page text (`src/content/tools/repair-pdf.md`)

A draft, 250 to 500 words: how to use it (choose the file, give its password if asked, repair, check the new file); questions: "What kinds of damage can it fix?" (a broken or missing table, a cut-off file, wrong lengths, junk around the file, damaged parts inside), "Why are some pages missing or blank?", "Why does the new file have no password?", "My file opens here but not in one program", "Is my file uploaded?". No promise that every file can be repaired.

### 12. The Privacy page draft

Facts listed for the owner's wording, not written as approved text: pdf-lib is fetched after a pick on this page; a file other tools cannot read is read by pdf-lib in the tool worker; following the Repair link from another tool asks the host for the Repair page, which can tell it a damaged file was picked; nothing of the file goes with the link.

## Effect on page weight and on when WebAssembly is fetched

- Before a pick: no change on any page. `/repair-pdf` ships the same island as every tool (expected about 79 KB, measured in task 4.1). The damaged-notice link adds a few hundred bytes to the shared widget chunk, loaded after a pick.
- After a pick on `/repair-pdf`: qpdf and its WebAssembly (as every PDF tool), PDF.js's set (as every PDF tool), pdf-lib's chunk and `fflate` (new for a read set, about 243 KB by gzip). The most fetched after a pick rises from 2,041.3 KB to an expected 2.3 MB, measured in task 4.1.
- WebAssembly is still fetched only after a pick.

## Threats considered

| Threat | Handling |
| --- | --- |
| A malicious PDF given to pdf-lib's parser, first time on this site | Linear pre-pass (decision 3) removes the measured quadratic paths; decode guard (decision 4); `PDFInvalidObject` dropped; every write capped; fresh worker per job; Cancel; tests at sizes a quadratic path cannot finish |
| Object-stream or cross-reference-stream bombs | Cross-reference streams never unpacked; object streams capped at 64 MiB each and the job budget, then `output-limit` |
| Deep nesting | pdf-lib refuses 200,000 nested arrays in 14 ms; deeper nesting in qpdf is as for every tool |
| Many objects or huge arrays | Linear but slow (finding 7); progress and Cancel; owner question 8 |
| Damaged stream data | Flate prefix capped through `zlib.ts`; others emptied; JSON listing size counted before parsing |
| A file that passes qpdf but crashes a reader | Out of scope; qpdf's check is the bar, as for every tool |
| Oversized file | No fixed limit; the shared 100 MB notice; memory measured |
| Hostile file name | Never passed to an engine, a library, a URL or the console, as for every tool; output name built by the shared rule |
| Passwords | Only `--password=` and pdf-lib's option; never in errors, sentences or logs; forgotten as every tool's |
| Library warnings naming file content | pdf-lib's `console.warn` (positions and object numbers only, with `warnOnInvalidObjects` off) is silenced for the call, so nothing reaches the console |
| The link | A plain same-origin address from the registry, nothing of the file in it, nothing stored |
| Server tools (SSRF, macros) | Not applicable: no server |

## Tests

- `tests/unit/rebuild.test.ts`: each damaged kind closed as expected; strings, comments and stream bodies holding `obj` and `endobj`; names with `#` escapes; cross-reference streams turned into trailers; a missing header; linear time on 200,000 unclosed objects and streams and 2 million `obj` tokens in stream data; output counted against the budget.
- `tests/unit/repair-pdf.test.ts` (with `repair-helpers.ts` building the 36 kinds from the fixtures in memory): every outcome of the measurement table at least as good, `qpdf --check` passing; the fidelity check on every good fixture forced through the pdf-lib route; damaged protected files (AES-256, AES-128, RC4) with no, wrong and right passwords; restrictions only; a certificate-encrypted file; nothing to repair on `text.pdf`; junk before the header giving a file; the guard at 63 and 65 MiB and the 2 GB bomb; `PDFInvalidObject` dropped; the sweep's three cases; `globalThis.fetch` replaced and never called; no error holding text, names or the password; progress order; the `/DP` behaviour recorded.
- `engine-loads` shard: `repair-pdf` against every fixture, asking for `qpdf` and `pdflib` when reading and `qpdf`, `pdflib`, `fflate` in the job.
- `tests/e2e/repair-pdf.spec.ts`: the page; `damaged-xref.pdf` and `damaged-cut.pdf` read and repaired (download checked with qpdf and PDF.js); `text.pdf` with no new file; the password flow on a damaged protected file; a too-damaged file; not a PDF; Cancel; failures from a stand-in engine; the large-file notice; keyboard only; 360px and 1280px.
- No-upload and uniform-requests tests as the spec lists.
- Group 8: `failures.ts`, `queries.ts` and component tests for the link; the other tools' e2e damaged scenarios updated; a test that following the link stores nothing.

## Risks / Trade-offs

- [pdf-lib internals: the guard depends on `DecodeStream.prototype.ensureBuffer`] → pinned version, a unit test that fails if it moves, restored after each job.
- [pdf-lib's reader may accept garbage as objects] → qpdf writes and checks everything after it; the result must pass `qpdf --check`.
- [Two parsers that disagree: pdf-lib keeps the last copy of an object; a reader using the original table might show an older one] → the newest copy is what a repaired file should hold; the result note asks the visitor to check the file.
- [An object deleted in a later save may come back if still referenced] → rare; recorded in the README.
- [Memory on 100 MB damaged files over the ceiling] → let go of each step's data early; measured; the change is updated if still over.
- [Following the link tells the host a damaged file was picked] → named; the owner words the Privacy sentence.
- [Default A shows a link that does not carry the file] → the words say so; the handover change replaces it.

## Migration Plan

None: a new page and a link in an existing notice. Rollback is reverting the pull request; no stored state.

## Open Questions

None that change the specs, the approach or the tasks. The owner questions are in the proposal; question 1 gates tasks group 8 only.
