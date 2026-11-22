# Design

## Context

- **`add-password-option` (PR #28) is merged.** It gives the registry's `NewPasswordOption`, `optionPasswords` (empty), `passwordProblem`, `acceptedPassword` and `PasswordRefused` in `src/widget/option-values.ts`, the shared sentences and `passwordAdvice` in `src/widget/options.ts`, `NewPasswordField` (two uncontrolled `type="password"` fields, `autocomplete="new-password"`, the hint then `passwordStaysSentence` and `newPasswordSavingNote` under the first), the password held in `useToolRun` and forgotten as its proposal lists, the `password-refused` failure, and `tests/unit/password-rule.test.ts` (the rule against qpdf and PDF.js, and qpdf's random salts). Protect uses all of it unchanged.
- **The closest engine is Compress PDF's last step**: one qpdf write of the whole file with a password. Rotate's `writeTurned` also writes with `--object-streams=generate`. The drawing step's `OutputLimit` (in `src/engines/stamp.ts`) is what the worker maps to the `output-limit` failure.
- **Checked by experiment** (Node, this repo's qpdf 12.2.0 WebAssembly build and `pdfjs-dist` 6.5.438, password `Qz7 #%@ pass`), with `--progress [--password=old] /in.pdf --object-streams=generate --encrypt --user-password=P --owner-password=P --bits=256 -- /out.pdf`:
  - every fixture tried (`text`, `password` with `open-sesame`, `restricted`, `rich`, `form`, `tagged`, `pages-500`, and a file made with a title and an XMP stream holding marked words) gave exit 0, passed `--check` with P, and showed R = 6, AESv3 for streams, strings and files, and every permission allowed; `password.pdf`'s old password was refused on the result;
  - P never appeared in the result's bytes; the marked title and XMP words did not either, and PDF.js read the title back once opened with P; PDF.js refused no password and P less its last character;
  - qpdf printed several `write progress: N%` lines (52 for `pages-500.pdf`), which Merge PDF already reads;
  - sizes went down with object streams generated (`text.pdf` 6,057 to 4,302 bytes, `pages-500.pdf` 198,025 to 112,521, `tagged.pdf` 5,118 to about 3,400; with object streams preserved, `tagged.pdf` came out 6,448); `pages-500.pdf` took about 0.2 s;
  - **one marked word stayed readable**: `tagged.pdf`'s `SECRET-DEST-NAME`, a key of the catalog's old-style `/Dests` dictionary. PDF encryption covers strings and streams only; names, numbers and the catalog's own dictionary (qpdf leaves it outside object streams) are written as they are. This is the format, not qpdf: every encrypting tool leaves names readable. The page text says so in plain words;
  - `--requires-password` is not usable in this build (exit 2 with "invalid password" on an encrypted file), and qpdf will not write JSON on an instance that has already written, so the result is checked on a fresh instance (decision 4);
  - `--show-encryption` prints "User password = P"; the JSON form (`--json=2 --json-key=encrypt`) gives R, V, the methods and the capabilities and does not hold the password, so the engine reads that.

## Goals / Non-Goals

**Goals:**
- A file that opens with the visitor's password only, in every reader `SPEC.md` names, with nothing else in it changed.
- The password in qpdf's argument list only, never in a file, an error, a message or the result's bytes.
- No shared code changes and no new dependency.

**Non-Goals:**
- Restrictions, a separate permissions password, other encryption, a shortest length, characters beyond printable ASCII, Unlock PDF, the CSP, the Privacy page.

## Decisions

### 1. The registry entry

```ts
{ id: 'protect-pdf', group: 'protect', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  // Unlock PDF is linked once it is published.
  related: ['unlock-pdf', 'compress-pdf', 'sign-pdf', 'watermark-pdf', 'merge-pdf', 'split-pdf'],
  pages: [{ slug: 'protect-pdf', name: 'Protect with a password', summary: 'Add a password that is needed to open a PDF.',
            title: 'Protect a PDF with a password in your browser - PDFkaro',
            description: 'Add a password to a PDF so it cannot be opened without it. The file and the password stay on your device and are not uploaded.',
            heading: 'Protect a PDF with a password',
            sentence: 'Add a password that is needed to open a PDF. Your file and the password stay on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Protect and download', writingLabel: 'Writing the protected file',
            doneHeading: 'Your protected file is ready', failedHeading: 'The password was not added.',
            tooFewFiles: 'Choose a PDF file to protect.', outputSuffix: 'protected',
            minFiles: 1, multiple: false, resultPages: 'input', items: 'files', itemControls: false, outputs: 'one',
            memoryAdvice: 'Try on a computer.',
            options: [{ kind: 'new-password', key: 'newPassword', label: 'New password', againLabel: 'Type the new password again',
                        hint: 'If you forget this password, the file cannot be opened, and no one can get it back. Up to 127 characters. Use English letters without accents, numbers, spaces and marks such as @, # and -.',
                        emptySentence: 'Type a password first.', againSentence: 'Type the password again to check it.' }],
            resultNotes: ['The file now opens only with the password you typed. Keep it somewhere safe: if it is forgotten, no one can open the file. A short password can be guessed by anyone who has the file.',
                          'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
                          'If the file you chose had a password or restrictions, the new password replaces them, and the file has no restrictions.'] } }
```

- Placed after Sign PDF, so the catalogue-order test and the home page put it first under "Protect". Its name is the catalogue's own, as "Registry entries match the catalogue" asks.
- `optionPasswords['protect-pdf'] = { newPassword: { maxLength: 127, characters: 'printable-ascii' } }`. The registry test from `add-password-option` checks the line exists, the limit is 1 to 127, the hint ends with `passwordAdvice['printable-ascii']` and its "127 characters" matches. The one unit test that expects `optionPasswords` to be empty is changed to expect this line.
- No `refusedSentence`: the shared "The password could not be used. Go back to your file and type it again." fits.
- **The hint** holds the cannot-be-recovered sentence first (carried forward from PR #28), then the limit and the rule. "A short password can be guessed by anyone who has the file." goes in the first result note and the page text, not the hint: under the first field the hint and the shared note already make six sentences at 360px (the UX reviewer's concern in PR #28). The owner is asked.
- Five related links show now (Compress, Sign, Watermark, Merge, Split); Unlock follows once published. Watermark's and Sign PDF's links to Protect start to show.

### 2. The engine: `src/engines/tools/protect-pdf.ts`

```
run([file], options, onProgress, tools):
  if files.length !== 1: throw 'Protect takes one file.'
  password = acceptedPassword('protect-pdf', 'newPassword', options.newPassword)   // undefined: throw new PasswordRefused() before any work
  old = passwordFrom(options)
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  writer = freshQpdf(tools, file)
  limit = protectLimit(file.length)                // 2 × file + 16 MB, exported for the test
  capped = writer.capFile('/out.pdf', limit)
  writer.onLine = qpdf's "write progress: N%" → onProgress({ stage: 'writing', percent: min(N, 100) * 0.9 })
  written = writer.call(['--progress', ...passwordArgsFor(old), '/in.pdf', '--object-streams=generate',
                         '--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--', '/out.pdf'])
  writer.onLine = null
  if writer.refused('/out.pdf') or (capped and /no space left/i in written.printed) or size > limit: throw new OutputLimit()
  if not finished(written.code): throw saidInvalidPassword(printed) ? 'A password did not open the file.' : `qpdf could not write the protected file (exit N).`
  out = writer.read('/out.pdf')          // the writer, with the input in its memory, is let go here
  verify(tools, out, password)           // decision 4
  onProgress({ stage: 'writing', percent: 100 })
  return [out]
inspect = inspectPdf
```

- **One call, in memory.** The input password and the new password go in qpdf's in-memory argument list, never in an argument file (`callWithArgumentFile` writes `/args` into qpdf's memory; with no page list there is nothing long to write). The named form (`--user-password=`) is used, never the positional form, so a password like `--help` or `@in.pdf` is never read as an option or an argument file (`password-rule.test.ts` covers both). The rule refuses line breaks, so no line-break handling is needed for the new password; the input password goes through `passwordArgsFor` as in Compress PDF.
- **No error, progress message or console line holds qpdf's printed text** or either password. Errors are fixed sentences.
- **`OutputLimit` is imported from `../stamp`**, which the worker already maps to `output-limit`, so no shared code changes. Both engines then share the chunk that holds the option values and the drawing step; the alternative, moving `OutputLimit` to `qpdf.ts`, is a shared edit for no change in behaviour, left for a later tidy-up if the architect prefers it.

### 3. The qpdf options, and the ones never used

- **256-bit AES (`--bits=256`)**, revision 6, the only strong method in the format. Older methods (RC4, 128-bit AES) need `--allow-weak-crypto` or are weak; never offered.
- **The same password for opening and for permissions.** qpdf refuses an empty owner password with a 256-bit key unless `--allow-insecure` is given. A separate random owner password would stop the visitor from removing the password later in Adobe Acrobat, which asks for the permissions password; a second typed password is more than `SPEC.md` asks.
- **Every permission allowed** (qpdf's default for `--encrypt`): Protect sets a password to open, not restrictions. Old restrictions are therefore dropped (owner question 1).
- **Never `--cleartext-metadata`** (the title and XMP stay encrypted), **`--allow-insecure`** or **`--allow-weak-crypto`**. A unit test reads the engine's source and the argument list it builds, and fails if any of the three appears.
- **`--object-streams=generate`**, as `writeTurned` and Compress PDF write: smaller files, and strings packed in object streams are encrypted with their stream rather than one by one, which bounds the growth of a hostile file of many tiny strings. AES-256 needs PDF 1.7 extension level 8, which qpdf sets, so object streams (PDF 1.5) narrow no reader.
- **No `--decrypt`**, no `--qdf`, no linearization.

### 4. Checking the result before giving it back

On a fresh qpdf holding only `out` (a fresh one because qpdf will not write JSON on an instance that has written, and so the writer's memory can be let go first):
1. `--password=P --json=2 --json-key=encrypt /in.pdf`: `encrypted` true, `userpasswordmatched` true, `parameters` R 6, V 5, bits 256, `stringmethod`, `streammethod` and `filemethod` all `AESv3`, every `capabilities` entry true. The JSON holds no password; it is parsed and dropped.
2. `--password=P --check /in.pdf` finishes.
3. `--check /in.pdf` with no password fails, and qpdf says the password is invalid (`saidInvalidPassword`).
Any other answer throws "The protected file did not pass its check." This guards against a later qpdf package that silently writes weaker or no encryption; it costs one more parse of the file (`--check` reads every stream), measured in task 3.2.

### 5. Size and memory

- **The cap**, `2 × file + 16 MB`, uses `capFile` and `refused` as the drawing step does. Encryption adds at most 32 bytes (a 16-byte start value and up to 16 bytes of padding) to each stream and each string outside an object stream; with object streams generated, a genuine file grows by far less than its own size, and the experiment's files all shrank. A hostile file built of millions of empty strings in the catalog would grow many times; the cap stops it with the existing sentence.
- **Memory:** the writer holds the input and the output; it is let go once the output's bytes are read; the checker holds one copy of the output. Peak about three times the file, as Compress PDF. The 100 MB file and the 120,000-page file are measured in task 3.2.
- **No fixed limit**, the 100 MB notice and the 20,000-page notice, as for every one-file tool.

### 6. Progress and cancel

"Reading the file" (`reading`, `file`, 0 of 1) while qpdf parses; then "Writing the protected file" with qpdf's own percentage scaled to 90; 100 once the check passes. Cancel ends the worker, as for every tool; the fields keep the password (`add-password-option`).

### 7. The Privacy page facts, carried to the Phase 1 site-work change

`src/pages/privacy.astro` is still a placeholder ("Until then it makes no claim"). Drafting it is its own Phase 1 site-work change, with the CSP, sitemap and structured data; a section for one tool on an otherwise empty page would read as if the other tools had nothing to say. The facts, checked against the code, for that change to use:
- the password is used only in this page and its worker, and is never sent anywhere;
- the page forgets it when the job finishes, on "Start again", when the file is left out and when the page is left; the worker is ended after every job;
- the browser may offer to save it or suggest one; a saved password is kept by the browser and may be copied to the visitor's browser account; that is the browser's offer, which the visitor accepts or not;
- it cannot be recovered: the site never has it, so it cannot reset it;
- a protected file's names (such as font names and old-style link names) and the number and size of its parts are not hidden by the format.

The pull request lists these facts for the program manager, beside the CSP point below.

### 8. The page text

`src/content/tools/protect-pdf.md`, 250 to 500 words, marked as a draft. Steps: choose the file; type a password twice; press "Protect and download"; then Download. Questions, each answered plainly:
- Is my file uploaded? No; the file and the password stay in the browser, kept only while the tab is open, let go on "Start again" or when the tab is closed or left; nothing claimed about downloads, keyboard apps or extensions; no "100%".
- What if I forget the password? The file cannot be opened; no one can get it back, and this site never has it. Keep a copy of the file without a password if you may need it.
- How long should it be? "A short password can be guessed by anyone who has the file." Use several words or a long mix; which characters work, and why only these for now (some readers treat other letters differently).
- My browser offered to save the password. The browser's offer; a saved password is kept by the browser and may be copied to its account; decline if the device is shared.
- What is kept? Pages, text, links, form fields with what was typed, notes, bookmarks, attached files, details and tags.
- What does not stay the same? Earlier saved versions; a digital signature stops being valid.
- My file already has a password. You type it first; the new password replaces it, and restrictions are removed.
- What does a password hide? Pages, text, pictures, bookmarks, attached files and the file's title and details. Not everything: the number of pages, font names and some names used inside the file can still be seen. A password stops someone opening the file; it does not stop someone who has the password from copying it on.

No question restates the title; no capitals for emphasis; the word "unlock" is not used (banned list); checked against "Banned patterns".

### 9. The Content Security Policy

Not in this change. The proposal states it as an open scheduling point for the program manager. Nothing here depends on it or makes it harder: the engine uses no `eval`, qpdf's WebAssembly is fetched from the site as now.

## Dependencies

None added. qpdf 12.2.0 (`@neslinesli93/qpdf-wasm` 0.3.1, ISC wrapper, Apache-2.0 qpdf) and PDF.js (thumbnail only) are already shipped. `LICENSES.md` is unchanged; the qpdf line's reason already names encryption.

## Page weight and late loading

- **Before a pick:** the same island; the entry's words add a few hundred bytes of props. `npm run weigh` must stay under 100 KB.
- **After a pick:** what Compress PDF fetches (the worker, the workspace chunk, qpdf and its WebAssembly, `inspect`, `plain`, PDF.js and its data for the thumbnail), plus the engine and the shared `stamp` chunk (option values and `OutputLimit`). No pdf-lib, no `fflate`, no other WebAssembly. `check-worker.mjs` finds the engine from the file list and checks it loads late by a sentence from its source; `page-weight.mjs` needs a `loadedLater` line only if the build makes a new chunk.

## Threats

- **The password leaking.** Covered by `add-password-option` on the page side. In the worker: only in qpdf's in-memory argument list, in the named form; never in an argument file, an error, a progress message or the console; qpdf's printed output is never passed on; `--show-encryption`, which prints it, is not used; the worker is ended after the job. The no-upload test records page errors and the worker's console, and checks the result's bytes do not hold the password.
- **A weak or missing encryption.** The result is checked (decision 4) before it is given back; the unit tests check R 6 and AESv3 on every fixture; `password-rule.test.ts` already fails if qpdf's salts stop being random.
- **Hostile PDFs.** qpdf parses them in the worker, ended after every job; no JSON beyond qpdf's small `encrypt` answer is parsed; damaged files fail as damaged at `inspect`.
- **A result that balloons.** The output cap (decision 5).
- **Option abuse.** `'__proto__'`, a number, `null`, a missing key, an empty or long password, a space at an end, a line break, non-ASCII: each refused by `acceptedPassword` before the file is read, with `PasswordRefused`, whose message holds nothing of the password.
- **Hostile file names.** Unchanged: `stem` cleans the output name; names never reach the engine.
- **What the format leaves readable.** Names and numbers are not encrypted (Context); said on the page; a unit test records `SECRET-DEST-NAME` as the one marked word that stays readable and checks every marked string and stream is not.
- **Content Security Policy.** Not yet sent by the site; the proposal raises the scheduling point.

## Tests

- **`tests/unit/protect-pdf.test.ts`** (Node, this repo's qpdf and PDF.js):
  - the password refused when missing, empty, 128 characters, "café", " a", "a ", with a line break, a number, `null` or under `'__proto__'`, with `PasswordRefused` before qpdf is asked for (a spy on `tools.qpdf`), and an error that does not hold it;
  - the argument list: the named options, `--bits=256`, `--object-streams=generate`, and never `--cleartext-metadata`, `--allow-insecure`, `--allow-weak-crypto` or `--show-encryption`, checked in the engine's source too;
  - `run` on every file in `tests/fixtures/` with the password `Qz7 pw#%@ Kv4`: `qpdf --check` with it; `--json-key=encrypt` R 6, AESv3, every capability; refused with no password, with it less its last character and with it plus a character, in qpdf and PDF.js; the page count and each page's text through PDF.js as before; the password not in the bytes; `rich.pdf`'s bookmarks, link and `note.txt`, `form.pdf`'s fields and values, `tagged.pdf`'s tags, destination and thread, `mixed.pdf`'s sizes and turns, read with the password; `password.pdf` (with `open-sesame`) and `restricted.pdf` with the new password only and every permission; `warning.pdf` protected; the damaged files failing as damaged; `not-a-pdf.pdf` failing;
  - a file made in the test with a title and an XMP stream holding marked words: neither in the result's bytes; both read back with the password;
  - `tagged.pdf`: every `SECRET-` marker held in a string or stream absent from the bytes; `SECRET-DEST-NAME`, a name, present, as the format leaves names readable (recorded, not hidden);
  - a file made in the test with RC4 128-bit encryption (made with `--allow-weak-crypto` in the test only): the result AESv3 only, the old password refused;
  - the same file protected twice: different `/U`, `/O`, `/UE`, `/OE`;
  - progress: reading first, writing percentages that never go back, 100 last;
  - the output cap: the engine exports `protectLimit(size)` (`2 × size + 16 MB`) and its write step, `writeProtected(qpdf, args, limit, onWriting)`; the limit is checked directly, and the write step, given a fake qpdf whose capped file refuses a write (and one that finishes with exit 0 and a file past the limit), throws `OutputLimit`, so the worker gives `output-limit`; a real file made in the test of many empty strings in its catalog is written under a small limit and refused the same way.
- **E2e and no-upload:** as the tasks list.

## Definition of done

- Every fixture gives a correct result or a clear message (task 3.1); the 100 MB file run by hand and measured.
- `qpdf --check` in the unit tests; Chrome, Firefox, Adobe Reader and macOS Preview open the result with the password and refuse without it, by hand (issue #7).
- Links, bookmarks, form fields, text, attachments and tags kept (unit tests).
- Nothing blocks the page over 100 ms; progress and Cancel (e2e).
- Browsers and phones by hand (issue #7), including the browser's offer to save the password on each; keyboard and screen reader (e2e); contrast unchanged.
- No-upload test; engine unit tests; one e2e file.
- Page text drafted and marked; the owner's review in issue #7. The tool is not called done in the pull request.

## Risks / Trade-offs

- **[A forgotten password]** The visitor loses their file for good. → Said in the hint next to the field, in the result and in the page text; typed twice; the questions suggest keeping a copy without a password.
- **[Only printable ASCII]** A password in Hindi or with accents cannot be set. → Refused with a sentence; the owner's question from PR #28.
- **[The browser saves the password]** It may sync to the visitor's browser account. → The note under the field and the page text say so; the owner's question from PR #28.
- **[Names stay readable]** Font names and old-style link names in the file can be read without the password. → The format's limit, said on the page.
- **[Old restrictions dropped]** A file that had restrictions loses them. → The result note says so; owner question 1.
- **[Signatures]** A digital signature stops being valid. → Said in the result and page text.
- **[An extra check]** Decision 4 parses the file once more. → Measured; dropped only with the reviewers' agreement if it doubles the time on the largest file.
- **[A shared chunk name changes]** Importing the option values and `OutputLimit` from a third engine could change how the bundler splits chunks. → Other tools' exact allowlists updated to the new names with their checks unchanged, and said in the pull request.
- **[Published before the CSP]** → The program manager's call (proposal).

## Migration Plan

None; a new tool.
