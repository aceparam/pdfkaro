# Proposal

## Why

Protect with a password (`/protect-pdf`) is the next Phase 1 tool in catalogue order: the first row of "Protect", after Sign PDF closed "Edit and sign". People use it before they email or upload a file that holds something private, such as a payslip, a bank statement or a scan of an identity card. The shared part it needs, a new password typed twice (`add-password-option`, PR #28), is merged. This change is the tool on top of it, as that proposal planned under "What `add-protect-pdf` will then add".

## What Changes

- **A new page, `/protect-pdf`,** from a new registry entry, first under "Protect".
  - Heading: "Protect a PDF with a password".
  - Sentence: "Add a password that is needed to open a PDF. Your file stays on your device. This site does not upload your file or the password."
  - Meta description: "Add a password to a PDF so it cannot be opened without it. The file and the password are not uploaded."
  - Neither the sentence nor the description claims the password stays on the device, since the browser may offer to save it (UX and privacy reviewers, stage 1).
  - The visitor picks one PDF. It is listed as one row (thumbnail of the first page, name, pages, size), as the other one-file tools list theirs.
- **The new password is the job's input.** It uses `add-password-option`'s two hidden fields under the key `newPassword`: "New password" and "Type the new password again". Both start empty, and focus goes to the first once the file is read.
  - Its line in `optionPasswords` is 127 characters at most, printable ASCII.
  - The hint under the first field reads: "If you forget this password, the file cannot be opened, and no one can get it back. A short password can be guessed by anyone who has the file. Up to 127 characters." It ends with the rule's own words.
  - The main button, "Protect and download", waits until both fields hold the same password the rule takes, with the shared sentences.
- **What the button does,** in the tool worker with qpdf: one call that opens the file and writes it again encrypted with 256-bit AES.
  - The file is opened with its old password, if it has one, through the existing password flow.
  - The call is `--encrypt --user-password=P --owner-password=P --bits=256 --`: the same password for opening and for permissions, every permission allowed, and object streams generated.
  - It never passes `--cleartext-metadata`, `--allow-insecure` or `--allow-weak-crypto`.
  - Before giving the file back, the engine checks the result with a fresh qpdf. The result must pass `qpdf --check` with the password, report AES-256 (R 6) with every permission allowed, and refuse to open without it.
- **An input that already has a password or restrictions** is opened with its own password and written with the new password only. The old password no longer opens the result, and old restrictions are gone. The page says so.
- **What the new file keeps:** every page and everything on it, with text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags.
  - The document's title and its XMP details are encrypted too, so they cannot be read without the password.
  - The file is written afresh, so earlier saved versions stored inside it are not kept, and a digital signature stops being valid. The page says so.
- **What a password does not hide.** Some things stay readable without the password, because the PDF format leaves them so:
  - the file's name;
  - whether the file holds bookmarks, attached files or a form;
  - roughly how large its parts are;
  - names used inside it, such as old-style link names.

  The page says so.
- **Output** is named `report-protected.pdf`.
- **Progress** shows "Reading the file", then "Writing the protected file" with qpdf's own percentage up to 90, then 93, 96 and 100 as each check of the result passes. Cancel works throughout.
- **The output is capped** at `2 × file + 16 MB`. Encryption adds at most 32 bytes to each string and stream of a genuine file. Past the cap, the page shows the existing `output-limit` failure.
- **The password's life,** unchanged from `add-password-option`:
  - It is held in `useToolRun` only.
  - It is kept through Cancel, a failure and "Choose another file".
  - It is forgotten when the job finishes, on "Start again", when the last file goes and on `pagehide`.
  - Only the first field's copy goes to the worker, by message, and the worker is ended after the job.
  - qpdf gets it only inside `--user-password=`, `--owner-password=` and `--password=`, in its in-memory argument list. It never goes into an argument file, an error or a progress message.
- **Two shared changes ride along in this change** (coordinator's decision, stage 1). The pull request names them as shared changes. Neither changes a published page.
  1. **`NewPasswordField` layout.** Only the tool's hint sits under the first field. The shared note (`passwordStaysSentence` and `newPasswordSavingNote`) becomes its own paragraph under the second field, and is still in the first field's description for screen readers. The first field gets `enterkeyhint="next"`, and Enter in it moves focus to the second field once the first holds a password the rule takes. With the old layout, Protect's hint and the note put seven grey sentences between the two fields at 360px (UX reviewer, stage 1). No published page has a new password yet.
  2. **A capped qpdf write in a neutral file.** `OutputLimit` and a small helper, `cappedWrite`, move into `src/engines/qpdf.ts`. The helper covers the cap, qpdf's write progress, the refused write, the no-space check, the size check after writing, and removing `/in.pdf` once the write has passed. The drawing step's `writeUpdate` uses it, and `stamp.ts` re-exports `OutputLimit`. This is a refactor with no change in behaviour; the worker matches the error by its name, as now.
- **The hook's job step becomes testable** (privacy reviewer, stage 1). The body of `useToolRun`'s `start` becomes a plain function. A Node test with a fake client can then check that a finished job leaves no new password held, and a failed one keeps it. The design gives the shape, and the pull request names it with the two shared changes above.
- **Page text,** a draft for the owner, covering:
  - that the password cannot be recovered;
  - "A short password can be guessed by anyone who has the file.";
  - that the browser may offer to save or suggest the password, and a saved one may be copied to the browser account;
  - that a digital signature stops being valid;
  - that an earlier password and restrictions are replaced;
  - what a password does and does not hide;
  - the privacy facts the page controls.
- **Tests:**
  - **Engine unit tests on every fixture:** the result opens with the new password only, in qpdf and PDF.js; it reports R 6 and AESv3 and passes `qpdf --check`; the title and XMP are not readable as plain text; bookmarks, links, forms, attachments and tags are kept; neither the new nor the old password is in the bytes.
  - **A hook-level test** of the job step, as above.
  - **An end-to-end test at 360px and 1280px.** It covers the layout, Enter, holds, Cancel and failures. It also checks that no `value` attribute appears and the page's HTML does not hold the password after typing, after Cancel, after "Go back to your file" and straight after a `pagehide` event.
  - **The no-upload test** uses a marked password holding a space, `#`, `%` and `@`. It records page errors and the text and arguments of the page's and the worker's console messages, and checks the downloaded file's bytes.
  - **Screenshots.**

### Scope

- **One tool,** on top of `add-password-option`, with the two shared changes and the hook seam above. It reuses `FilePicker`, `PageGrid` (one file row), `Result`, the widget, `NewPasswordField` and qpdf. No dependency is added.
- **Out of scope:**
  - restrictions set alongside the password (no printing, no copying), since `SPEC.md` names only the password for Protect;
  - a separate permissions password, a choice of encryption, 128-bit AES or RC4;
  - showing the password, a strength meter, a generated password, a shortest length (owner questions from PR #28);
  - characters outside printable ASCII (owner question from PR #28);
  - Unlock PDF, the next tool after the Content Security Policy change;
  - the site's Content Security Policy and the Privacy page draft (Phase 1 site work, below);
  - Merge PDF's own copy of the write-progress pattern, left as it is;
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Protect with a password, `/protect-pdf`, Browser, Phase 1, first under "Protect".
- "Architecture and tech stack": "Page structure: … encrypt … qpdf compiled to WebAssembly"; "Rules for the code" 1 to 4.
- "Tool page anatomy" parts 1 to 7, and "States every tool handles". The Password needed state covers the input file's own password.
- "Details that apply everywhere": output names; nothing downloads on its own.
- "SEO": "Every tool page".
- "Privacy, limits and security", "Browser tools": "Passwords typed into Protect and Unlock stay in the browser"; no request carries passwords.
- "What we are building", rule 4, "Honest about limits": what a password cannot do is said on the page.
- "Definition of done": "Each tool".

Phase 1. Catalogue position: the 16th of the 17 launch tools, first under "Protect". The Content Security Policy change comes next, then Unlock PDF.

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name, the input password or the new password.

After a pick, the page fetches only the site's own files, as Compress PDF does:
- the worker and the workspace chunk;
- qpdf and its WebAssembly;
- the shared `inspect` and `plain` files;
- PDF.js and its data, for the first page's thumbnail;
- the new engine;
- the shared option values, which the bundler is expected to put in a file of their own, `option-values-*.js`, once a third engine imports them.

No dependency and no request to another origin are added.

## Open decisions and owner questions touched

- **Passwords and restrictions of the input.** The owner's decision of 13 Nov 2026 ("Page tools drop passwords and restrictions") names other tools, not Protect. Here the old password is replaced by the new one, which is what the tool is for. Old restrictions are dropped, since the new file allows everything and `SPEC.md` names no restrictions for Protect. This is the agent's reading; the page says so, and it is question 1 below.
- **Waiting main buttons** (waiting for the owner). Protect is already named in it. Its button waits until both fields match; no starting password is possible.
- **Signed files** (waiting for the owner). The page says a digital signature stops being valid.
- **Password characters, shortest password, the browser's password manager and the note, typed twice** (waiting for the owner, PR #28). Protect is their first page and uses the defaults as built: printable ASCII, one character at least, `autocomplete="new-password"`, the long note (now under the second field) and two hidden fields. The owner's review of Protect's page text is the natural time to answer them.
- **"Defaults are set so the main button works without touching any option"** (`SPEC.md` "Tool page anatomy", 4). The password is read as the job's input, not an option. This is the agent's reading, as in `add-password-option`.
- **Shared pieces in tool pull requests** (waiting for the owner). Two shared changes and a hook seam ride along, by the coordinator's decision, each named in the pull request.
- **Compress PDF keeps passwords** (waiting for the owner). Untouched. A protected file can still be compressed and keeps its new password.
- **Repair PDF link.** No link until Repair PDF is published, as for every tool.
- **20,000 pages.** The notice is shown, as every one-file tool shows it.
- **Licence.** No dependency or `LICENSE` file is added.
- **The multilingual test file** is still missing. Protect leaves text as it is, but the test set requires the file, so **Protect cannot be called done until the multilingual file exists and Protect has been run on it.** The pull request says so.
- **Content Security Policy: settled by the program manager (stage 1).**
  - Protect does not wait for it.
  - The CSP change comes straight after Protect, before Unlock PDF, and it blocks launch and the Phase 1 gate.
  - On GitHub Pages it is a `<meta>` tag. GitHub Pages cannot send headers, so `frame-ancestors`, which a `<meta>` policy ignores, is not part of it.
  - This change does no CSP work, and nothing in it makes the CSP harder.
- **The Privacy page facts are carried to the Phase 1 site-work change.** `src/pages/privacy.astro` is still a placeholder that makes no claim. Adding Protect's facts alone would make a page that speaks of one tool and is silent on the others. So the facts (design, section 7) are recorded in the pull request, and kept durably in Protect's entry in `CLAUDE.md` after merge, for the change that drafts the whole page.

The agent's own choices, named in the pull request:
- the same password for opening and permissions;
- every permission allowed;
- object streams generated;
- old restrictions dropped;
- the check before giving the file back, with its progress steps;
- the output cap;
- the hint's and the result's words;
- `-protected`.

New questions for the owner, each with the default used until answered:
1. **Old restrictions.** Default: dropped, and the page says so. Keep them under the new password instead?
2. **Where "A short password can be guessed by anyone who has the file." goes.** Default: in the hint, as its second sentence, and in the questions below the tool, but not in the result notes. Also put it in the result, or keep it out of the hint?

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `protect-pdf`: what the Protect with a password tool at `/protect-pdf` does:
  - choosing one file and typing the new password twice;
  - writing the file encrypted with that password;
  - what the new file keeps, what it hides and what it does not hide;
  - every state of "States every tool handles";
  - that nothing is uploaded and the password is held no longer than needed;
  - the words on the page.

### Modified Capabilities

- `tool-page`: "A new password a tool needs". The shared note moves under the second field, still read with the first. Enter in the first field moves to the second once the first is accepted, and its keyboard key is labelled "Next". The second field's label starts close under the first field at 360px.

## Impact

- **New code:** `src/engines/tools/protect-pdf.ts`; `src/content/tools/protect-pdf.md`; `tests/unit/protect-pdf.test.ts`; the hook-level test of the job step; `tests/e2e/protect-pdf.spec.ts` with the tool's no-upload test.
- **Changed code:**
  - the registry entry, first under "Protect", and its line in `optionPasswords` in `src/widget/option-values.ts`;
  - the one unit test that expects `optionPasswords` to be empty (`tests/unit/options.test.ts`);
  - `src/components/NewPasswordField/` and its component tests, and `ToolWorkspace` for Enter in the first field;
  - `src/engines/qpdf.ts` (`OutputLimit`, `cappedWrite`), `src/engines/stamp.ts` (uses them, re-exports `OutputLimit`) and their unit tests;
  - `src/hooks/useToolRun.ts` and a new plain job step beside it;
  - `scripts/page-weight.mjs`: an `option-values` line in `loadedLater`, and the `stamp` line's description updated;
  - the exact no-upload allowlists in `tests/e2e/add-page-numbers.spec.ts`, `watermark-pdf.spec.ts` and `sign-pdf.spec.ts`, which gain `option-values-*.js` with their checks otherwise unchanged;
  - `tests/fixtures/README.md`, with each fixture's outcome;
  - `CLAUDE.md`: the two new owner questions when the pull request opens, and Protect's entry after merge.
- **Other tools:** no change in behaviour. Watermark's and Sign PDF's related links to Protect start to show.
- **The branch** also carries the `add-password-option` archive commit (64271b5), which the pull request names.
- **Page weight:** the island before a pick gains only the entry's words, and `npm run weigh` must pass. No WebAssembly is fetched sooner.
