# Design

## Context

- **What is already built and reused, unchanged:**
  - the input-password flow every PDF tool has: `inspectPdf` (`src/engines/inspect.ts`) answers `needs-password` when qpdf says "invalid password" with none given and `wrong-password` with one given; `PasswordField` asks, in no form, with no name, `autocomplete="off"`, uncontrolled; `useToolRun` keeps the password in a `Map` while the file is listed and sends it with the job as `options.passwords`, read by `passwordFrom` (`src/engines/plain.ts`);
  - `freshQpdf` (`plain.ts`), `cappedWrite`, `finished`, `saidInvalidPassword` and `OutputLimit` (`src/engines/qpdf.ts`), `passwordArgsFor` (`src/engines/qpdf-json.ts`), as Protect uses them;
  - the no-new-file outcome Compress PDF built: an engine that gives `[]`, with `noSmaller: { heading, advice }` in the registry, shows a result with no name, size or Download (`finishedAs` and `isNoNewFile` in `src/widget/state.ts`, `ToolWorkspace`);
  - the `unsupported` inspect outcome Image to PDF built, shown as "`name` is saved in a way this tool cannot read." with the tool's `unsupportedAdvice` (`unreadableNotice` in `src/widget/failures.ts`);
  - the one-file row with no summary line, focus on the main button once chosen (`tool-page`: "A one-file tool lists its file as a row");
  - the Content Security Policy and its e2e watch (`tests/e2e/fixtures.ts`), which this page gets by being built.
- **Checked by experiment** (Node, this repo's qpdf 12.2.0 WebAssembly build, through `createQpdf`, in a scratch test that was then deleted):
  - `--decrypt` with no password on `restricted.pdf` (AES-256, empty user password, printing and changes refused) exits 0; the result is not encrypted and passes `--check`. A file made with only a password for permissions (`--user-password=`) behaves the same.
  - `password.pdf` decrypts with `--password=open-sesame` and with `--password=owner-secret`, exit 0; with a wrong or no password, exit 2 and "invalid password".
  - Files made with AES-128, RC4 128-bit and RC4 40-bit (made with `--allow-weak-crypto` placed before `--encrypt`) decrypt with their password, exit 0, without `--allow-weak-crypto`; that option is needed only to write weak encryption.
  - `--is-encrypted` is **not usable**: on `password.pdf` with no password it exits 2, as for a file that is not encrypted. `--requires-password` is not usable either (exit 2, as Protect found).
  - The JSON answer `--json=2 --json-key=encrypt` reads `encrypted` true or false: true on `restricted.pdf` with no password; false on `text.pdf`, even with a password given; on `password.pdf` it needs the password (exit 2, "invalid password" without). Its `parameters` show R, V, bits and methods; `key` is null; it holds no password.
  - Sizes after `--decrypt` (object streams kept as they were): `restricted.pdf` 7,181 → 6,183 bytes, `password.pdf` 7,178 → 6,183, `pages-500.pdf` (not encrypted) 198,025 → 194,080, `rich.pdf` 2,064 → 2,132, `text.pdf` 6,057 → 6,117.
  - A file whose `/Encrypt` names `/Filter /Adobe.PubSec` (a certificate) fails `--show-npages` with exit 2 and "unsupported encryption filter". `inspectPdf` calls it damaged today.

## Goals / Non-Goals

**Goals:**
- A file that opens with no password and no restrictions in every reader `SPEC.md` names, with nothing else in it changed.
- The password used once, only in qpdf's in-memory argument list in the named form, never in a file, an error, a message or the result.
- No shared change and no dependency: everything this tool needs exists.

**Non-Goals:**
- Guessing or trying passwords, certificate encryption, a signature's own restrictions (`--remove-restrictions`), next steps after the result, the Privacy page draft.

## Decisions

### 0. The word "unlock" waits for the owner

`look-and-feel` ("Banned patterns", scenario "Unlock PDF is built") asks this change to ask the owner before page text is written. The plainer reading is planned as the default and changes nothing in `SPEC.md`:

- **Kept from the catalogue:** the URL `/unlock-pdf` (a published URL never changes, and the search phrase lives in it), the id `unlock-pdf`, the group, runs-in and phase. Protect's `related` already names `unlock-pdf`.
- **Not said on any page:** the registry `name` is "Remove a password". The tool-registry requirement "Registry entries match the catalogue" asks for the catalogue's name, but its scenario and the registry test check slug, group, runs-in and phase only; the name departs from the catalogue because the catalogue's name is a banned word. The pull request names the departure.
- **Nothing in the code needs "unlock" visible:** `tests/e2e/site.spec.ts` searches each page's visible text, so an `href` holding `/unlock-pdf` passes; the title, description and every word avoid it.
- **If the owner lets the name through,** the build changes before any page word: a MODIFIED `look-and-feel` delta saying the name "Unlock PDF" is allowed and nothing else; `bannedWords` in `tests/e2e/pages.ts` allows that exact name; the registry name becomes "Unlock PDF", the title "Unlock a PDF in your browser - PDFkaro" or as the owner says. Group 1 of the tasks waits for the answer either way.

### 1. The registry entry (default words, a draft for the owner)

```ts
{ id: 'unlock-pdf', group: 'protect', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['protect-pdf', 'compress-pdf', 'merge-pdf', 'split-pdf', 'extract-pdf-pages'],
  pages: [{ slug: 'unlock-pdf', name: 'Remove a password',
            summary: 'Remove a password you know, and print and edit restrictions, from a PDF.',
            title: 'Remove a password from a PDF in your browser - PDFkaro',
            description: 'Remove a password you know, and print and edit restrictions, from a PDF. The file and the password are not uploaded.',
            heading: 'Remove a password from a PDF',
            sentence: 'Remove a password you know, and print and edit restrictions, from a PDF. Your file stays on your device. This site does not upload your file or the password.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Remove protection and download', writingLabel: 'Writing the unprotected file',
            doneHeading: 'Your unprotected file is ready', failedHeading: 'The protection was not removed.',
            tooFewFiles: 'Choose a PDF file.', outputSuffix: 'unprotected',
            minFiles: 1, multiple: false, resultPages: 'input', items: 'files', itemControls: false, outputs: 'one',
            memoryAdvice: 'Try on a computer.',
            unsupportedAdvice: 'It is protected with a certificate or in another way, not with a password, and this tool can remove only a password.',
            noSmaller: { heading: 'This file has no password or restrictions.', advice: 'There was nothing to remove, so no new file was made.' },
            resultNotes: ['The file now opens without a password, and it can be printed, copied and changed. Anyone who has this copy can open it.',
                          'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.'] } }
```

- **Placement:** after Protect, so the catalogue-order test and the home page put it second under "Protect".
- **No options**, so nothing holds the main button; no line in `option-values.ts`; the engine does not import it.
- **The title** is 54 characters, the description 116.
- **`noSmaller` reused as it is.** Its name is Compress-worded but its shape (`heading`, `advice`) and meaning in `state.ts` ("the file could not be improved") fit. Renaming it would be a shared change; it is left, and named in the pull request.
- **Related links:** five, all published. Protect's link to this page starts to show (`relatedItems` shows only published pages); Protect's comment "Unlock PDF is linked once it is published" is removed.

### 2. The engine: `src/engines/tools/unlock-pdf.ts`

```
run([file], options, onProgress, tools):
  if files.length !== 1: throw 'This tool takes one file.'
  password = passwordFrom(options)                       // the input file's own, if one was typed
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  if not await isEncrypted(tools, file, password): return []          // "nothing to remove"
  out = await unprotectedBytes(tools, file, password, (p) => onProgress({ stage: 'writing', percent: p * 0.5 }))
  await verify(tools, out, (p) => onProgress({ stage: 'writing', percent: p }))   // 55, 100
  return [out]

isEncrypted(tools, file, password):                      // its own fresh qpdf: JSON is refused after a write
  answer = fresh.call([...passwordArgsFor(password), '--json=2', '--json-key=encrypt', '/in.pdf'])
  not finished: throw saidInvalidPassword ? 'A password did not open the file.' : 'qpdf could not read the file.'
  parse; encrypt.encrypted must be a boolean, else throw 'qpdf could not read the file.'

unprotectedBytes(tools, file, password, onWriting):      // the writer lives only here
  writer = freshQpdf(tools, file)
  written = cappedWrite(writer, unprotectLimit(file.length), (q) => q.call(unprotectArgs(password)), onWriting)
  not finished: throw saidInvalidPassword ? 'A password did not open the file.' : 'qpdf could not write the unprotected file.'
  return writer.read('/out.pdf')                        // cappedWrite removed /in.pdf first

unprotectArgs(password) = ['--progress', ...passwordArgsFor(password), '/in.pdf', '--decrypt', '--', '/out.pdf']
unprotectLimit(size) = 2 * size + 16 MB

verify(tools, out, onStep):                             // a fresh qpdf holding only the result, no password given
  JSON encrypt: finished, and encrypted === false        → 55
  --check: finished                                      → 100
  anything else: throw 'The unprotected file did not pass its check.'
```

- **Why the JSON probe, not `--is-encrypted`:** the experiment showed `--is-encrypted` exits 2 for a file that needs a password and gets none, the same as for a file with no encryption. The JSON answer is exact and holds no password.
- **Why a probe before writing, not after:** a file with nothing to remove gives `[]` without writing a byte. The probe costs one parse; qpdf will not write JSON on an instance that has written, so it has its own fresh instance, let go before the writer is made.
- **Why `--decrypt` alone:** it writes the file with no encryption and so no restrictions. Object streams are kept as they were (qpdf's default `preserve`), which changes the file least; Protect's `generate` was for hiding page dictionaries, which does not apply. No `--remove-restrictions` (it concerns signed files, `/Perms` and `/DocMDP`, not passwords; non-goal), no `--qdf`, no linearization, no `--allow-weak-crypto` (only needed to write weak encryption).
- **The password's path:** only `passwordArgsFor` (`--password=P`, the named form, so a password such as `--help` or `@in.pdf` is never read as an option or an argument file), only in the in-memory argument list, never `callWithArgumentFile` or `callWithPassword`. The probe and the writer each get it; the checker does not, and must open the result without one. No error, progress message or console line holds qpdf's printed text or the password; errors are fixed sentences. `--show-encryption` (prints the password) is never used, and a unit test reads the source to make sure.
- **Wrong password at job time** cannot happen in normal use (inspect has opened the file with it), but if it does the fixed sentence goes out as the existing engine failure.
- **`unprotectArgs`, `unprotectLimit`, `unprotectedBytes` and `isEncrypted` are exported** for the unit tests.

### 3. The inspector: tell a certificate from damage

```
inspect(file, password, tools):
  outcome = await inspectPdf(file, password, tools)
  if outcome.kind !== 'damaged': return outcome
  probe = (await freshQpdf(tools, file)).call(['--show-npages', '/in.pdf'])
  return /unsupported encryption/i.test(probe.printed) ? { kind: 'unsupported' } : outcome
```

- One more parse, only for a file already found damaged.
- No password is passed to the second call: an unsupported filter is found before any password is tried.
- The `unsupported` outcome and its notice exist (Image to PDF). `isUnreadable` treats it as damaged for "Choose another file". No shared change.
- Other tools still call such a file damaged. Found, not changed; named in the pull request.

### 4. Size, memory, progress and cancel

- **The cap,** `2 × file + 16 MB`, through `cappedWrite`, the same as Protect's. Decrypting removes the 16-to-32 bytes AES adds to each string and stream, so genuine files shrink or stay near their size (the experiment). A hostile file cannot grow by decryption alone beyond what qpdf's rewrite adds; the cap stops it with the existing `output-limit` sentence.
- **Memory:** the probe's instance goes before the writer is made; `cappedWrite` removes `/in.pdf` before the output is read; the writer goes out of scope before the checker is made. Task 3.2 measures the peak on the 100 MB file.
- **Progress:** "Reading the file" (`reading`, `file`, 0 of 1) during the probe and qpdf's parse; "Writing the unprotected file" with qpdf's percentage scaled to 50; 55 after the JSON check; 100 after `--check`, which reads every stream and takes about as long as the write (as Protect measured).
- **Cancel** ends the worker, as for every tool. The file stays listed and open; its password stays held.
- **No fixed limit;** the 100 MB and 20,000-page notices show, as for every one-file tool.

### 5. The typed password's life, and the Privacy page facts

Unchanged code: `useToolRun`'s `passwords` map. Recorded here for the Phase 1 site-work change that drafts the Privacy page, and in Unlock's `CLAUDE.md` entry after merge:

- The password typed to open a file is used only in this page and its worker. It goes to the worker by a message inside the browser, with the job and to draw the thumbnail, and is never sent anywhere else. The worker is ended after every job.
- It is kept while that file is listed, through Cancel, a failure and "Go back to your file", so it need not be typed again. It is forgotten when the file is replaced or left out, on "Start again", and when the page is left (including into the browser's Back-button memory). A finished job does not forget it on its own; the result screen holds the file until "Start again" or the page is left, as every tool does.
- The field has `autocomplete="off"`; a browser may still offer to save it. That is the owner's question from PR #28 on the file-password field's words.
- The result has no password at all: anyone who has the downloaded copy can open it. The result note says so.
- Restrictions are removed without the permissions password, because the format lets any program open such a file; the restrictions were a request to readers, not a lock. The page text says so plainly, without the banned word.

### 6. The page text

`src/content/tools/unlock-pdf.md`, 250 to 500 words, marked as a draft, written only after owner question 1.

**Steps:** choose the file; type its password if it asks for one; press "Remove protection and download"; then Download.

**Questions,** each answered plainly:
- **Is my file uploaded?** No. The file and the password are not uploaded. The page lets go of them on "Start again", or when the tab is closed or another page is opened in it. No "100%" claim.
- **I have forgotten the password.** This tool cannot help: it removes only a password you type, and it does not guess or recover one.
- **My file opens but will not let me print or copy.** Choose it; no password is asked for, and the restrictions are removed. Remove them only from a file you are allowed to change (owner question 4).
- **Which password do I type?** The one that opens the file. If the file also has a separate password for permissions, that works too.
- **It says my file has no password or restrictions.** Then it has none to remove, and no new file is made.
- **What changes and what stays?** Pages, text, links, form fields with what was typed in them, notes, bookmarks, attached files, details and tags are kept. Earlier saved versions are not, and a digital signature stops being valid.
- **It says my file is saved in a way this tool cannot read.** It is protected with a certificate or in another way that is not a password.

No question restates the title, nothing is in capitals for emphasis, and the text is checked against "Banned patterns".

## Dependencies

None added. qpdf 12.2.0 (`@neslinesli93/qpdf-wasm` 0.3.1) and PDF.js are already shipped. `LICENSES.md` is unchanged: no library is added, and the qpdf line's reason ("opens protected files") already covers this use.

## Page weight and late loading

- **Before a pick:** the same island; the entry's words add a few hundred bytes of props. `npm run weigh` must stay under 100 KB.
- **After a pick:** the worker, the workspace chunk, qpdf and its WebAssembly, `inspect`, `plain`, PDF.js with its data for the thumbnail, and the new engine. No `option-values`, `stamp`, pdf-lib or `fflate`. `scripts/page-weight.mjs` and `check-worker.mjs` find the engine from the file list; no script change is expected.
- WebAssembly is fetched when the file is picked, as now.

## Threats

- **The password leaking.** In the page: the existing field (no name, no form, no `value` attribute). In the worker: only `--password=` in qpdf's in-memory list; fixed error sentences; qpdf's printed text never passed on; no `--show-encryption`. The no-upload test watches requests, storage, the title, the address, both consoles and page errors, and checks the download's bytes; a unit test checks the result's bytes and every error the engine throws.
- **Trying passwords.** The engine uses only `options.passwords[0]`, once in each of two calls. Nothing loops over passwords; the inspector tries none on a certificate file. A unit test spies on `tools.qpdf` and checks the arguments of every call.
- **Hostile PDFs.** qpdf parses them in the worker, ended after every job. The only JSON parsed is qpdf's small `encrypt` answer; a shape other than a boolean `encrypted` is an error. Damaged files fail at `inspect`.
- **A result that balloons.** The output cap.
- **A result still encrypted** (a later qpdf that ignores `--decrypt`, or a file qpdf opens oddly). The check before giving it back refuses it.
- **Hostile file names.** Unchanged: `stem` cleans the output name, and names never reach the engine.
- **Misuse.** The tool removes restrictions any reader could ignore and passwords the visitor already knows; it adds no way in. The page asks visitors to remove restrictions only from files they may change (owner question 4).

## Tests

- **`tests/unit/unlock-pdf.test.ts`** (Node, this repo's qpdf and PDF.js):
  - **Arguments.** `unprotectArgs` uses `--password=` in the named form, `--decrypt`, and none of `--show-encryption`, `--allow-weak-crypto`, `--remove-restrictions`; the engine's source holds no `--show-encryption` and no `callWithArgumentFile` or `callWithPassword`.
  - **`run` on every file in `tests/fixtures/`,** each outcome recorded: `password.pdf` with `open-sesame` and with `owner-secret`; `restricted.pdf` and `compress-password.pdf` (with `open-sesame`) give one file that is not encrypted, passes `--check`, opens in PDF.js with no password with its pages and text as before, reports every permission, and does not hold the password; files with no encryption (`text.pdf`, `pages-500.pdf`, `rich.pdf`, `form.pdf`, `tagged.pdf`, `mixed.pdf`, `images.pdf`, `scanned.pdf`, `warning.pdf`, the `compress-*` files) give `[]`; the damaged files and `not-a-pdf.pdf` fail.
  - **Made in the test:** `rich.pdf`, `form.pdf`, `tagged.pdf`, `mixed.pdf` and `pages-500.pdf` protected with a marked password (AES-256) and then written: bookmarks, link, `note.txt`, fields and values, note, tags, destination, thread, sizes and turns kept; 500 pages with their text. `text.pdf` encrypted with AES-128, RC4 128-bit and RC4 40-bit (`--allow-weak-crypto` before `--encrypt`, in the test only), and with only a password for permissions: each comes back not encrypted.
  - **Only the typed password.** A spy on `tools.qpdf` records every call: the password appears only as `--password=P`, in the probe and the write; the checker's calls hold no password; a wrong password gives the fixed sentence and no other password is tried.
  - **The inspector:** `password.pdf` with none, the right and a wrong password gives `needs-password`, `ready` and `wrong-password`; a file made in the test with `/Filter /Adobe.PubSec` gives `unsupported`; `damaged-xref.pdf` and `damaged-cut.pdf` stay `damaged`.
  - **The check:** a result that is still encrypted (a fake writer that copies the input) is refused with the check's sentence.
  - **Progress:** reading first, then writing percentages that never go back, the write at most 50, then 55 and 100 last. A file with nothing to remove reports reading only.
  - **The cap.** `unprotectLimit` directly, and `unprotectedBytes` under a limit smaller than the result throws `OutputLimit`.
  - **No error holds a password.** Every error the engine can throw holds neither marked password.
- **`tests/e2e/unlock-pdf.spec.ts`:** as the tasks list, with the no-upload test.

## Definition of done

- Every fixture gives a correct result or a clear message (task 3.1). The 100 MB file, protected first, is run by hand and measured.
- **The multilingual test file** must exist and Unlock must be run on it before Unlock is called done.
- `qpdf --check` runs in the unit tests. By hand (issue #7), Chrome, Firefox, Adobe Reader and macOS Preview open the result with no password and allow printing and copying.
- Links, bookmarks, form fields, text, attachments and tags are kept (unit tests).
- Nothing blocks the page for over 100 ms, and progress and Cancel work (e2e).
- Browsers and phones are checked by hand (issue #7). Keyboard and screen reader use are tested in e2e; contrast is unchanged.
- The no-upload test, the engine unit tests and one e2e file pass.
- The page text is drafted and marked, and the owner's review is in issue #7. The tool is not called done in the pull request.

## Risks / Trade-offs

- **[The owner keeps the name "Unlock PDF"]** The site test and `look-and-feel` change, and the registry name follows. → Group 1 waits for the answer; the engine, its tests and the inspector do not depend on it.
- **[The name departs from the catalogue]** "Remove a password" is not the catalogue's name. → Named in the pull request; the registry test checks the slug, not the name; the owner's answer settles it.
- **[`noSmaller` reused]** Its name speaks of Compress. → Its shape and meaning fit; renaming is a shared change for later.
- **[The password is held after the result]** It stays in memory until "Start again" or the page is left, as for every tool. → Said on the page; changing it would be a shared change, and Protect's entry already records this rule.
- **[A probe before writing]** One extra parse. → Small next to the write and the check; it lets a file with nothing to remove end without writing.
- **[Certificate files elsewhere]** Other tools still call them damaged. → Found, not changed; named in the pull request.
- **[Signatures]** A digital signature stops being valid. → Said in the result and the page text; the owner's "Signed files" question.
- **[No file for nothing to remove]** A visitor who wants a copy anyway gets none. → Owner question 3.

## Migration Plan

None; a new tool.
