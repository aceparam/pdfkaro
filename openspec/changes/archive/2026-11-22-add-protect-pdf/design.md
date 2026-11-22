# Design

## Context

- **`add-password-option` (PR #28) is merged.** It gives:
  - the registry's `NewPasswordOption`;
  - in `src/widget/option-values.ts`: `optionPasswords` (empty), `passwordProblem`, `acceptedPassword` and `PasswordRefused`;
  - in `src/widget/options.ts`: the shared sentences and `passwordAdvice`;
  - `NewPasswordField`: two uncontrolled `type="password"` fields with `autocomplete="new-password"`, and under the first the hint, then `passwordStaysSentence` and `newPasswordSavingNote`;
  - the password held in `useToolRun` and forgotten as its proposal lists;
  - the `password-refused` failure;
  - `tests/unit/password-rule.test.ts`, which checks the rule against qpdf and PDF.js, and qpdf's random salts.
- **The closest engine is Compress PDF's last step:** one qpdf write of the whole file with a password. Rotate's `writeTurned` also writes with `--object-streams=generate`.
- **The drawing step's capped write** (`writeUpdate` in `src/engines/stamp.ts`) holds the only capped-write logic and defines `OutputLimit`, which the worker maps to the `output-limit` failure by its name.
- **Checked by experiment.** The setup: Node, this repo's qpdf 12.2.0 WebAssembly build and `pdfjs-dist` 6.5.438, password `Qz7 #%@ pass`, and the call `--progress [--password=old] /in.pdf --object-streams=generate --encrypt --user-password=P --owner-password=P --bits=256 -- /out.pdf`.
  - **Fixtures tried:** `text`, `password` (with `open-sesame`), `restricted`, `rich`, `form`, `tagged`, `pages-500`, and a file made with a title and an XMP stream holding marked words.
  - **Every one passed.** Each gave exit 0, passed `--check` with P, and showed R = 6, AESv3 for streams, strings and files, and every permission allowed. `password.pdf`'s old password was refused on the result.
  - **Nothing secret was in the bytes.** P never appeared in a result. The marked title and XMP words did not either, and PDF.js read the title back once the file was opened with P. PDF.js refused no password, and refused P less its last character.
  - **Progress:** qpdf printed several `write progress: N%` lines (52 for `pages-500.pdf`).
  - **Sizes went down** with object streams generated: `text.pdf` from 6,057 to 4,302 bytes, `pages-500.pdf` from 198,025 to 112,521, `tagged.pdf` from 5,118 to about 3,400. With object streams preserved, `tagged.pdf` came out at 6,448. `pages-500.pdf` took about 0.2 s.
  - **What stays readable.** PDF encryption covers strings and streams only. Names, numbers and dictionaries outside an encrypted object stream are written as they are, and qpdf keeps the catalog outside object streams. So `tagged.pdf`'s `SECRET-DEST-NAME`, a key of the catalog's old-style `/Dests`, stayed readable. The catalog's keys also show whether the file has bookmarks (`/Outlines`), attached files (`/Names /EmbeddedFiles`, with the attachment's name encrypted) or a form. Page dictionaries went into encrypted object streams, so `/MediaBox` and `/Count` were not readable in `text.pdf`, `mixed.pdf` or `rich.pdf`: the page count, and page sizes as the page dictionaries give them, are hidden; but a form XObject's own `/BBox` stays readable, so a file whose pages carry a layer of Add page numbers, Watermark or Sign PDF shows each page's size through it, and form-field appearances show their boxes (privacy reviewer, stage 2). But a stream's own dictionary can never go in an object stream, so it stays readable (the privacy reviewer, round 2, with the repo's qpdf): for pictures, how many there are, their pixel size (`/Width`, `/Height`), bits, colour space and format (such as `/JPXDecode`), as on `images.pdf` and `scanned.pdf`; for attached files, their type (`/Subtype`, such as `text/plain`) and size (`/Params /Size`), as on `rich.pdf`, whose attachment's name and dates are encrypted; and font names named in appearance streams (`/Helvetica` on `tagged.pdf` and `form.pdf`). Font names were absent only from `text.pdf`, `mixed.pdf` and `rich.pdf`, whose fonts sit in page resources inside object streams. The file's own name is outside the file and is always visible. Every encrypting tool behaves this way, because it is the format.
  - **Two qpdf options are unusable here.** `--requires-password` is not usable in this build: it gave exit 2 with "invalid password" on an encrypted file. And qpdf will not write JSON on an instance that has already written. So the result is checked on a fresh instance (decision 4).
  - **`--show-encryption` prints the password.** It prints "User password = P". The JSON form (`--json=2 --json-key=encrypt`) gives R, V, the methods and the capabilities without the password, so the engine reads that.

## Goals / Non-Goals

**Goals:**
- A file that opens with the visitor's password only, in every reader `SPEC.md` names, with nothing else in it changed.
- The password in qpdf's argument list only: never in a file, an error, a message or the result's bytes.
- No dependency. The shared changes limited to the two the coordinator named, plus the hook seam the privacy reviewer's test needs, none changing a published page.

**Non-Goals:**
- Restrictions, a separate permissions password, other encryption, a shortest length, characters beyond printable ASCII.
- Unlock PDF, the CSP and the Privacy page.
- Merge PDF's write-progress pattern.

## Decisions

### 1. The registry entry

```ts
{ id: 'protect-pdf', group: 'protect', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  // Unlock PDF is linked once it is published.
  related: ['unlock-pdf', 'compress-pdf', 'sign-pdf', 'watermark-pdf', 'merge-pdf', 'split-pdf'],
  pages: [{ slug: 'protect-pdf', name: 'Protect with a password', summary: 'Add a password that is needed to open a PDF.',
            title: 'Protect a PDF with a password in your browser - PDFkaro',
            description: 'Add a password to a PDF so it cannot be opened without it. The file and the password are not uploaded.',
            heading: 'Protect a PDF with a password',
            sentence: 'Add a password that is needed to open a PDF. Your file stays on your device. This site does not upload your file or the password.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Protect and download', writingLabel: 'Writing the protected file',
            doneHeading: 'Your protected file is ready', failedHeading: 'The password was not added.',
            tooFewFiles: 'Choose a PDF file to protect.', outputSuffix: 'protected',
            minFiles: 1, multiple: false, resultPages: 'input', items: 'files', itemControls: false, outputs: 'one',
            memoryAdvice: 'Try on a computer.',
            options: [{ kind: 'new-password', key: 'newPassword', label: 'New password', againLabel: 'Type the new password again',
                        hint: 'If you forget this password, no one can open the file or get it back. A short password is easy to guess. Up to 127 characters. Use English letters without accents, numbers, spaces and marks such as @, # and -.',
                        emptySentence: 'Type a password first.', againSentence: 'Type the password again to check it.' }],
            resultNotes: ['The file now opens only with the password you typed. Keep it somewhere safe: if it is forgotten, no one can open the file.',
                          'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
                          'If the file you chose had a password or restrictions, the new password replaces them, and the file has no restrictions.'] } }
```

- **Placement.** The entry goes after Sign PDF, so the catalogue-order test and the home page put it first under "Protect". Its name is the catalogue's own, as "Registry entries match the catalogue" asks.
- **The rule line** is `optionPasswords['protect-pdf'] = { newPassword: { maxLength: 127, characters: 'printable-ascii' } }`. The registry test from `add-password-option` checks that the line exists, that the limit is 1 to 127, that the hint ends with `passwordAdvice['printable-ascii']`, and that the hint's "127 characters" matches. The one unit test that expects `optionPasswords` to be empty is changed to expect this line.
- **No `refusedSentence`.** The shared "The password could not be used. Go back to your file and type it again." fits.
- **The page sentence and meta description** say only what the site does: the file stays on the device, and the site uploads neither. Neither claims the password stays on the device, because the browser may offer to save it (UX U4, privacy M1, stage 1).
- **The hint has four sentences,** in this order:
  1. the cannot-be-recovered sentence, carried forward from PR #28;
  2. "A short password is easy to guess." (UX U3, stage 1; owner question 2), shortened from the page text's "A short password can be guessed by anyone who has the file." so the hint wraps to six lines at 360px and the second field's label starts within 200px (coordinator, while building);
  3. the limit;
  4. the rule.

  The short-password sentence is not repeated in the result notes, and it stays in the page text.
- **Related links.** Five show now: Compress, Sign, Watermark, Merge and Split. Unlock follows once it is published. Watermark's and Sign PDF's links to Protect start to show.

### 2. Shared change: the `NewPasswordField` layout (UX U1, stage 1)

**The count.** The design at commit 7c9c435 counted six sentences under the first field; there were seven: the hint's three plus the note's four. With U3's sentence the hint alone is four.

**The new layout:**

```tsx
<div className={styles.group}>
  <div className="field field-short">
    <label htmlFor={id}>{option.label}</label>
    {firstError ? <p id={`${id}-error`} className={styles.error}>{firstError}</p> : null}
    <input … id={id} type="password" autoComplete="new-password" enterKeyHint="next"
           aria-describedby={[firstError && `${id}-error`, `${id}-hint`, `${id}-note`].filter(Boolean).join(' ')} />
    <p id={`${id}-hint`} className={styles.note}>{option.hint}</p>
  </div>
  <div className={`field field-short ${styles.again}`}>
    <label htmlFor={`${id}-again`}>{option.againLabel}</label>
    {againError ? <p id={`${id}-again-error`} className={styles.error}>{againError}</p> : null}
    <input … id={`${id}-again`} type="password" autoComplete="new-password" enterKeyHint="go" … />
  </div>
  <p id={`${id}-note`} className={styles.note}>{passwordStaysSentence} {newPasswordSavingNote}</p>
</div>
```

- **Only the hint sits between the two fields.** At 360px the second field's label must start within about 200px of the first field's bottom, which the e2e test measures. If Protect's hint makes it longer, the hint's words are cut down before the number is changed.
- **The note is its own paragraph under the second field,** in the same words. It is still listed in the first field's `aria-describedby`, after the hint, so a screen reader reads the label, the hint and the note on reaching the first field, as before. The second field's description is unchanged: its error only.
- **Enter in the first field.**
  - It moves focus to the second field once the first field's password has no problem under the rule. `enterkeyhint="next"` labels the phone key to match.
  - If the first field has a problem, Enter takes the first field out of `typing` (as now, so a space at the end is shown) and does what Enter does now while the button waits: the status region says the sentence, on every press.
  - The Enter that confirms a word in an input method does neither (`pressesButton`).
  - Enter in the second field is unchanged: it does what the main button does, and its key stays "Go".
  - This is one new branch in `ToolWorkspace`'s Enter handling (`enterAction` in `src/widget/options.ts` gains a `next-field` answer for a new password's first field), unit tested there.
- **What stays the same:** no `value` attribute (both fields stay uncontrolled), no name, no form, no `maxlength`, and the same sentences.
- **The `tool-page` requirement "A new password a tool needs"** is changed by a MODIFIED delta to match. Its "The note under the first field" scenario keeps its name, because the archive keeps every scenario, but now says where the note is.

### 3. The engine: `src/engines/tools/protect-pdf.ts`

```
run([file], options, onProgress, tools):
  if files.length !== 1: throw 'Protect takes one file.'
  password = acceptedPassword('protect-pdf', 'newPassword', options.newPassword)   // undefined: throw new PasswordRefused() before any work
  old = passwordFrom(options)
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  out = await protectedBytes(tools, file, old, password, (percent) => onProgress({ stage: 'writing', percent: percent * 0.5 }))
  await verify(tools, out, password, (percent) => onProgress({ stage: 'writing', percent }))   // 55, 95, 100
  return [out]

protectedBytes(tools, file, old, password, onWriting):      // the writer lives only inside this function
  writer = await freshQpdf(tools, file)
  written = cappedWrite(writer, protectLimit(file.length), (qpdf) => qpdf.call(protectArgs(old, password)), onWriting)
  if not finished(written.code): throw saidInvalidPassword(written.printed) ? 'A password did not open the file.' : 'qpdf could not write the protected file.'
  return writer.read('/out.pdf')     // cappedWrite has removed /in.pdf first; the writer goes out of scope on return

protectArgs(old, password) = ['--progress', ...passwordArgsFor(old), '/in.pdf', '--object-streams=generate',
                              '--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--', '/out.pdf']
protectLimit(size) = 2 * size + 16 MB
inspect = inspectPdf
```

- **One call, in memory.** The input password and the new password go in qpdf's in-memory argument list. They never go in an argument file: `callWithArgumentFile` would write `/args` into qpdf's memory, and with no page list there is nothing long to write.
- **The named form** (`--user-password=`) is used, never the positional form. So a password like `--help` or `@in.pdf` is never read as an option or an argument file; `password-rule.test.ts` covers both. The rule refuses line breaks. The input password goes through `passwordArgsFor`, as in Compress PDF.
- **No error, progress message or console line holds qpdf's printed text** or either password. Errors are fixed sentences. An uncaught error in the worker is still one of these fixed sentences, and a unit test checks every error the engine throws against both marked passwords.
- **Memory (architect A2, stage 1).** `cappedWrite` removes `/in.pdf` once the write has passed, before the output is read. The writer is local to `protectedBytes`, so it is out of scope before `verify` makes its own fresh qpdf. Task 3.2 measures the peak on the 100 MB file.
- **`protectedBytes`, `protectArgs` and `protectLimit` are exported** for the unit tests.

### 4. Checking the result before giving it back

The check runs on a fresh qpdf holding only `out`. It is fresh because qpdf will not write JSON on an instance that has written, and because the writer's memory can be let go first.

1. Run `--password=P --json=2 --json-key=encrypt /in.pdf`. The answer must say `encrypted` true, `userpasswordmatched` true, R 6, V 5 and bits 256 in `parameters`, `AESv3` for `stringmethod`, `streammethod` and `filemethod`, and every `capabilities` entry true. The JSON holds no password; it is parsed and dropped. Progress goes to 55.
2. Run `--password=P --check /in.pdf`; it must finish. Progress goes to 95.
3. Run `--check /in.pdf` with no password; it must fail, with qpdf saying the password is invalid (`saidInvalidPassword`). Progress goes to 100.

Any other answer throws "The protected file did not pass its check."

- **Why:** this guards against a later qpdf package that silently writes weaker encryption or none.
- **Cost:** step 2 reads every stream, so the check costs about one more parse of the file. The progress steps keep the bar moving during it (UX U2, stage 1). Task 3.2 records how long the check takes on the 100 MB file.

### 5. Shared change: `OutputLimit` and `cappedWrite` in `src/engines/qpdf.ts` (architect A1, stage 1)

```ts
/** Moved unchanged from stamp.ts. The worker knows it by its name and gives `output-limit`. */
export class OutputLimit extends Error {
  override name = 'OutputLimit';
  /** `'shared'` when what the chosen pages share would pass the budget (Sign PDF checks `error.reason === 'shared'`). */
  readonly reason: 'shared' | undefined;
  constructor(reason?: 'shared') {
    super('The new file would pass its size limit.');
    this.reason = reason;
  }
}

/** qpdf's "write progress: N%" line, as a percentage, or undefined. */
export function writePercent(line: string): number | undefined;

/**
 * Runs `call` (one qpdf write to /out.pdf) with /out.pdf capped at `limit`, reporting qpdf's write progress
 * (never backwards, never repeated). Throws `OutputLimit` when the capped file refused a write, when qpdf
 * said no space was left, or when the finished file is past the limit. When the call finished, removes
 * /in.pdf before returning, so the caller can read /out.pdf without holding the input twice. Gives the
 * call's result; the caller decides what an unfinished exit means.
 */
export function cappedWrite(qpdf: Qpdf, limit: number, call: (qpdf: Qpdf) => ReturnType<Qpdf['call']>, onWriting?: (percent: number) => void): ReturnType<Qpdf['call']>;
```

- **Why `qpdf.ts`:** it is the qpdf wrapper, already a file of its own that every engine loads, so no new chunk appears. A new `write.ts` would give the bundler another shared file to split.
- **`stamp.ts`** imports both and re-exports `OutputLimit` (`export { OutputLimit } from './qpdf'`), so its current importers and tests are unchanged.
- **`writeUpdate`** becomes `cappedWrite(qpdf, limit, (q) => callWithArgumentFile(q, [...]), onWriting)`. It then throws its own exit-code error, removes `/update.json`, runs `--check` and reads, as now. No change in behaviour. Today's `writeUpdate` removes `/in.pdf` after a finished write too, so the order is the same.
- **`merge-pdf.ts` is not changed.** It keeps its own copy of the pattern, to keep the shared change to what the coordinator named. A later tidy-up can make it use `writePercent`.
- **Unit tests:** `cappedWrite` with a fake qpdf for a refused write, a no-space print, exit 0 with a file past the limit, an unfinished exit (`/in.pdf` kept), and a passing write (`/in.pdf` removed, progress in order without repeats). The existing `stamp.test.ts` cases pass unchanged.

### 6. Hook seam: the job step as a plain function (privacy V4, stage 1)

There is no DOM in the unit tests (`environment: 'node'`, no jsdom or happy-dom), so the hook itself cannot be rendered. Adding a DOM library for one test was considered. It was not chosen, because it is a dependency.

Instead, the body of `useToolRun`'s `start`, from sending the job to reading its outcome, moves into a plain async function, `runJob`, in `src/hooks/run-job.ts`:
- It takes the client, the inputs, the input passwords, the options, the zip and pictures to send, and two callbacks: `onProgress` and `forgetNewPasswords`. There is no finish callback.
- It returns the outcome: a file (its bytes and parts), no new file, a failure kind or a cancel. It calls `forgetNewPasswords` itself when the job finishes with a file or with no new file, so the test sees the rule.
- `start` calls it, then does the dispatches and makes the object URL from the outcome, as now, passing the hook's own `forgetNewPasswords`.
- `run-job.ts` is the one plain function in `src/hooks/`, which otherwise holds hooks; the repo's lint rules still apply to it (no component or engine imports), and the pull request names it.

**The test,** `tests/unit/run-job.test.ts`, uses a fake client and a `newPasswords` holder that `forgetNewPasswords` empties:
- after a run that gives a file, the holder is `{}` before anything else clears it;
- after a run that gives no new file (a test entry with `noSmaller`), it is also `{}`;
- after an engine failure, a run that throws, and a cancel, it still holds the password.

The moved code keeps its comments. `useToolRun` behaves exactly as before; the e2e tests are the check.

### 7. The qpdf options, and the ones never used

- **256-bit AES (`--bits=256`), revision 6.** It is the only strong method in the format. Older methods (RC4, 128-bit AES) need `--allow-weak-crypto` or are weak, and are never offered.
- **The same password for opening and for permissions.**
  - qpdf refuses an empty owner password with a 256-bit key unless `--allow-insecure` is given.
  - A separate random owner password would stop the visitor removing the password later in Adobe Acrobat, which asks for the permissions password.
  - A second typed password would be more than `SPEC.md` asks.
- **Every permission allowed** (qpdf's default for `--encrypt`). Protect sets a password to open, not restrictions, so old restrictions are dropped (owner question 1).
- **Never used:** `--cleartext-metadata` (the title and XMP stay encrypted), `--allow-insecure`, `--allow-weak-crypto` or `--show-encryption`. A unit test reads the engine's source and `protectArgs`, and fails if any of the four appears.
- **`--object-streams=generate`,** as `writeTurned` and Compress PDF write.
  - It gives smaller files.
  - It hides page dictionaries (their sizes and count) inside encrypted streams. Stream dictionaries (pictures, attached files, appearance streams, drawn layers with their `/BBox`) cannot go in object streams and stay readable.
  - Strings packed in object streams are encrypted with their stream rather than one by one, which bounds the growth of a hostile file of many tiny strings.
  - AES-256 needs PDF 1.7 extension level 8, which qpdf sets, so object streams (PDF 1.5) shut out no reader.
- **Also not used:** `--decrypt`, `--qdf` and linearization.

### 8. Size, memory, progress and cancel

- **The cap,** `2 × file + 16 MB`, goes through `cappedWrite`. Encryption adds at most 32 bytes (a 16-byte start value and up to 16 bytes of padding) to each stream and each string outside an object stream. With object streams generated, a genuine file grows by far less than its own size, and the experiment's files all shrank. A hostile file built of millions of empty streams, which can never go in an object stream, would grow by up to 32 bytes each; the cap stops such a file with the existing sentence once it passes. (Empty strings in the catalog do not do it: qpdf packs them into an object stream, which is compressed, as found while building.)
- **Memory:** decision 3. The peak is the output plus qpdf's own working memory during the write, then one copy of the output in the checker. Task 3.2 measures it.
- **Progress:** "Reading the file" (`reading`, `file`, 0 of 1) while qpdf parses. Then "Writing the protected file", with qpdf's own percentage scaled to 50, then 55, 95 and 100 as the checks pass. The check with the password reads every stream and takes about as long as the write (measured while building), so the write and the checks each take about half of the bar (architect, stage 2).
- **Cancel** ends the worker, as for every tool. The fields keep the password (`add-password-option`).
- **No fixed limit;** the 100 MB notice and the 20,000-page notice are shown, as for every one-file tool.

### 9. The Privacy page facts, carried to the Phase 1 site-work change

`src/pages/privacy.astro` is still a placeholder ("Until then it makes no claim"). Drafting it is its own Phase 1 site-work change, with the sitemap and structured data. A section for one tool on an otherwise empty page would read as if the other tools had nothing to say.

These are the facts, checked against the code, for that change to use (privacy V7, stage 1). The pull request lists them, and Protect's `CLAUDE.md` entry keeps them after merge.

- **Where the new password goes.** It is used only in this page and its worker. It goes to the worker by a message inside the browser, and is never sent anywhere else. The worker is ended after every job.
- **When the page forgets the new password.**
  - It is kept while the visitor is still working on the file: through Cancel, a failed job and "Choose another file", so they need not type it again.
  - It is forgotten when a job finishes with a file, on "Start again", when the file is left out, and when the page is left (including into the browser's Back-button memory).
- **The input file's own password,** typed to open a protected file, is kept while that file is listed. It is forgotten when the file is replaced or left out, on "Start again", and when the page is left.
- **The browser's offer.** The browser may offer to save the new password, or suggest one. A saved password is kept by the browser and may be copied to the visitor's browser account. That is the browser's offer, which the visitor accepts or not.
- **It cannot be recovered.** The site never has the password, so it cannot reset it.
- **What a protected file does not hide:** the file's name; whether it holds bookmarks, attached files or a form; roughly how large its parts are; for each picture, its pixel size, colour space and format; for each attached file, its type and size; font names; the size of some drawn parts, such as form-field boxes, and, in a file that already has page numbers, a watermark or a signature added on this site, each page's size; and names in the catalog, such as old-style link names. What is hidden: its pages, its text, the picture data itself, bookmarks' titles, the contents, names and dates of attached files, and its title and details. The page must not say pictures or attached files are hidden, only their contents. Wording is a draft for the owner.

### 10. The page text

`src/content/tools/protect-pdf.md`, 250 to 500 words, marked as a draft.

**Steps:** choose the file; type a password twice; press "Protect and download"; then Download.

**Questions,** each answered plainly:
- **Is my file uploaded?**
  - No. The file and the password are not uploaded.
  - The page lets go of the file and the password on "Start again", when the tab is closed or another page is opened in it, and, for the new password, once a job gives a file. Switching to another tab keeps them (privacy reviewer, stage 2; draft wording for the owner).
  - It claims nothing about downloads, keyboard apps or extensions, and makes no "100%" claim.
- **What if I forget the password?**
  - The file cannot be opened, and no one can get it back. This site never has it.
  - Keep a copy of the file without a password if you may need one.
- **How long should it be?**
  - "A short password can be guessed by anyone who has the file." Use several words or a long mix.
  - It says which characters work, and why only these for now: some readers treat other letters differently.
- **My browser offered to save the password.** That is the browser's offer. A saved password is kept by the browser and may be copied to its account. Decline if the device is shared.
- **What changes and what stays?** (one question, UX U5, stage 1)
  - Pages, text, links, form fields with what was typed in them, notes, bookmarks, attached files, details and tags are kept.
  - Earlier saved versions are not, and a digital signature stops being valid.
- **My file already has a password.** You type it first. The new password replaces it, and restrictions are removed.
- **What does a password hide?**
  - It hides the pages, the text, what the pictures show, bookmarks' titles, the contents and names of attached files, and the file's title and details.
  - It does not hide the file's name (which now ends in "-protected"), whether the file holds bookmarks, attached files or a form, roughly how large it is, how many pictures it has with their size in pixels and format, the type and size of each attached file, the names of fonts, the size of some drawn parts such as form-field boxes (and each page's size in a file that already has page numbers, a watermark or a signature added on this site), or some other names used inside it. These go in a plain bulleted list (UX reviewer, stage 2).
  - The page does not say pictures or attached files are hidden, only what they show and contain.
  - It stops someone opening the file. It does not stop someone who has the password from passing the file on.

No question restates the title, and nothing is in capitals for emphasis. The word "unlock" is not used (banned list). The text is checked against "Banned patterns".

### 11. The Content Security Policy

This was settled by the program manager at stage 1:
- Protect does not wait.
- The CSP change comes straight after Protect, before Unlock PDF, and blocks launch and the Phase 1 gate.
- On GitHub Pages it is a `<meta>` tag with no `frame-ancestors`, which a `<meta>` policy cannot carry.

Nothing here depends on the CSP or makes it harder: the engine uses no `eval`, and qpdf's WebAssembly is fetched from the site as now.

## Dependencies

None added.
- qpdf 12.2.0 (`@neslinesli93/qpdf-wasm` 0.3.1, ISC wrapper, Apache-2.0 qpdf) and PDF.js (thumbnail only) are already shipped.
- `LICENSES.md` is unchanged; the qpdf line's reason already names encryption.

## Page weight and late loading

- **Before a pick:** the same island. The entry's words add a few hundred bytes of props, and the note's move adds nothing. `npm run weigh` must stay under 100 KB.
- **After a pick:** what Compress PDF fetches, plus the engine and the shared option values. What Compress PDF fetches is the worker, the workspace chunk, qpdf and its WebAssembly, `inspect`, `plain`, and PDF.js with its data for the thumbnail.
  - **A new shared file.** With a third engine importing `src/widget/option-values.ts`, the bundler is expected to give the option values a file of their own, `option-values-*.js` (architect A3, stage 1). This is accepted:
    - `scripts/page-weight.mjs` gains an `option-values` line in `loadedLater`;
    - the `stamp` line's description no longer says it holds the option values;
    - the exact no-upload allowlists of Add page numbers, Watermark and Sign PDF gain `option-values-*.js`, with their checks otherwise unchanged;
    - any other allowlist the build changes is updated the same way and named in the pull request, for example Image to PDF's if `picture.ts`'s import of the option values is not type-only.
  - Protect fetches no `stamp` file, no pdf-lib, no `fflate` and no other WebAssembly.
- **`check-worker.mjs`** finds the engine from the file list and checks, by a sentence from its source, that it loads late. `cappedWrite`'s sentences move with it into the qpdf file, which the script already allows the worker to load late.

## Threats

- **The password leaking.**
  - Page side: covered by `add-password-option`.
  - In the worker: the password is only in qpdf's in-memory argument list, in the named form. It never goes in an argument file, an error, a progress message or the console. qpdf's printed output is never passed on, and `--show-encryption`, which prints the password, is not used. The worker is ended after the job.
  - The no-upload test records page errors and the text and arguments of the page's and the worker's console messages. It checks the result's bytes do not hold the new password; a unit test also checks they do not hold the old one.
- **A weak or missing encryption.** The result is checked (decision 4) before it is given back. The unit tests check R 6 and AESv3 on every fixture, and `password-rule.test.ts` already fails if qpdf's salts stop being random.
- **Hostile PDFs.** qpdf parses them in the worker, which is ended after every job. No JSON is parsed beyond qpdf's small `encrypt` answer. Damaged files fail as damaged at `inspect`.
- **A result that balloons.** The output cap (decision 8).
- **Option abuse.** Each of these is refused by `acceptedPassword` before the file is read, with `PasswordRefused`, whose message holds nothing of the password: `'__proto__'`, a number, `null`, a missing key, an empty or long password, a space at an end, a line break, non-ASCII.
- **Hostile file names.** Unchanged: `stem` cleans the output name, and names never reach the engine.
- **What the format leaves readable.** See Context. It is said on the page. A unit test records what stays readable (`SECRET-DEST-NAME`, `/Width` on `images.pdf`, the attached file's `/Subtype` on `rich.pdf`, `/Helvetica` on `form.pdf`), and checks that no other marked string or stream, and no `/MediaBox`, can be read.

## Tests

- **`tests/unit/protect-pdf.test.ts`** (Node, this repo's qpdf and PDF.js):
  - **Refusals.** The password is refused when missing, empty, 128 characters, "café", " a", "a ", holding a line break, a number, `null` or under `'__proto__'`. Each is refused with `PasswordRefused` before qpdf is asked for (a spy on `tools.qpdf`), with an error that does not hold it.
  - **Arguments.** `protectArgs` uses the named options, `--bits=256` and `--object-streams=generate`. Neither it nor the engine's source holds `--cleartext-metadata`, `--allow-insecure`, `--allow-weak-crypto` or `--show-encryption`.
  - **`run` on every file in `tests/fixtures/`,** with the password `Qz7 pw#%@ Kv4`:
    - the result passes `qpdf --check` with the password, and `--json-key=encrypt` reports R 6, AESv3 and every capability;
    - qpdf and PDF.js refuse it with no password, with the password less its last character, and with the password plus a character;
    - the page count, and each page's text read through PDF.js, are as before;
    - the password is not in the bytes;
    - read with the password: `rich.pdf`'s bookmarks, link and `note.txt`; `form.pdf`'s fields and values; `tagged.pdf`'s tags, destination and thread; `mixed.pdf`'s sizes and turns;
    - `password.pdf` (opened with `open-sesame`) and `restricted.pdf` come back with the new password only and every permission, and `open-sesame` is not in `password.pdf`'s result bytes (security S1, stage 1);
    - `warning.pdf` is protected;
    - the damaged files fail as damaged, and `not-a-pdf.pdf` fails.
  - **Title and XMP.** A file made in the test with a title and an XMP stream holding marked words: neither word is in the result's bytes, and both are read back with the password.
  - **What stays readable.** In `tagged.pdf`, every `SECRET-` marker held in a string or stream is absent from the bytes. `SECRET-DEST-NAME`, a name, is present, because the format leaves names readable; it is recorded, not hidden. Recorded the same way: `/Width` on `images.pdf`'s result, the attached file's `/Subtype` on `rich.pdf`'s, and `/Helvetica` on `form.pdf`'s, as stream dictionaries stay readable. No result shows `/MediaBox` in plain text, and `rich.pdf`'s attachment name `note.txt` is not readable.
  - **Older encryption.** A file made in the test with RC4 128-bit encryption (made with `--allow-weak-crypto` in the test only) comes back AESv3 only, and the old password is refused.
  - **Fresh keys.** The same file protected twice gives different `/U`, `/O`, `/UE` and `/OE`.
  - **Progress:** reading first, then writing percentages that never go back, the write at most 50, with 55, 95 and 100 last.
  - **The cap.** `protectLimit` is checked directly. A real file made in the test, with 20,000 empty streams, grows when protected but stays inside its real cap, and written through `protectedBytes` under a cap of its own size it is refused with `OutputLimit`.
  - **No error holds a password.** Every error the engine can throw holds neither marked password.
- **`tests/unit/qpdf.test.ts`, or the existing qpdf test file:** `cappedWrite` and `writePercent`, as decision 5 lists.
- **`tests/unit/run-job.test.ts`:** decision 6.
- **`tests/unit/options.test.ts` and the component tests:**
  - `enterAction` gives `next-field` for an accepted first field, and gives the holding sentence otherwise;
  - `NewPasswordField` has the hint under the first field, the note as its own paragraph after the second field, the first field's `aria-describedby` naming error, hint and note, `enterkeyhint` "next" then "go", and still no `value` attribute.
- **E2e and no-upload:** as the tasks list.

## Definition of done

- Every fixture gives a correct result or a clear message (task 3.1). The 100 MB file is run by hand and measured.
- **The multilingual test file** must exist and Protect must be run on it before Protect is called done (program manager P3, stage 1).
- `qpdf --check` runs in the unit tests. By hand (issue #7), Chrome, Firefox, Adobe Reader and macOS Preview open the result with the password and refuse it without.
- Links, bookmarks, form fields, text, attachments and tags are kept (unit tests).
- Nothing blocks the page for over 100 ms, and progress and Cancel work (e2e).
- Browsers and phones are checked by hand (issue #7), including the browser's offer to save the password in each. Keyboard and screen reader use is tested in e2e, and contrast is unchanged.
- The no-upload test, the engine unit tests and one e2e file pass.
- The page text is drafted and marked, and the owner's review is in issue #7. The tool is not called done in the pull request.

## Risks / Trade-offs

- **[A forgotten password]** The visitor loses their file for good. → Said in the hint next to the field, in the result and in the page text. The password is typed twice. The questions suggest keeping a copy without a password.
- **[Only printable ASCII]** A password in Hindi or with accents cannot be set. → Refused with a sentence; it is the owner's question from PR #28.
- **[The browser saves the password]** It may sync to the visitor's browser account. → The note and the page text say so; it is the owner's question from PR #28.
- **[Some things stay readable]** The file name, which parts it holds, rough sizes, each picture's pixel size and format, each attached file's type and size, font names and catalog names can be seen without the password. → The format's limit, said on the page.
- **[Old restrictions dropped]** A file that had restrictions loses them. → The result note says so; owner question 1.
- **[Signatures]** A digital signature stops being valid. → Said in the result and the page text.
- **[An extra check]** Decision 4 parses the file once more. → The progress steps keep the bar moving. Task 3.2 measures it. It is dropped only with the reviewers' agreement, if it more than doubles the time on the largest file.
- **[Shared changes in a tool change]** The field layout, `cappedWrite` and the job step move shared code. → By the coordinator's decision. Each is named in the pull request, has its own tests, and changes no published page; every existing test passes unchanged except the three allowlists.
- **[A new chunk]** `option-values-*.js` changes three tools' allowlists. → Accepted and listed.
- **[Published before the CSP]** → By the program manager's decision. The CSP change follows straight after, before Unlock PDF, and blocks launch and the Phase 1 gate.

## Migration Plan

None; a new tool.
