# Proposal

## Why

Protect with a password (`/protect-pdf`) is the next Phase 1 tool in catalogue order: the first row of "Protect", after Sign PDF closed "Edit and sign". People use it before they email or upload a file that holds something private: a payslip, a bank statement, a scan of an identity card. The shared part it needs, a new password typed twice (`add-password-option`, PR #28), is merged; this change is the tool on top of it, as its proposal planned under "What `add-protect-pdf` will then add".

## What Changes

- **A new page, `/protect-pdf`,** from a new registry entry, first under "Protect": heading "Protect a PDF with a password", sentence "Add a password that is needed to open a PDF. Your file and the password stay on your device." The visitor picks one PDF; it is listed as one row (thumbnail of the first page, name, pages, size), as the other one-file tools list theirs.
- **The new password is the job's input,** with `add-password-option`'s two hidden fields under the key `newPassword`: "New password" and "Type the new password again", both empty, focus on the first once the file is read. Its line in `optionPasswords` is 127 characters at most, printable ASCII. The hint next to the field says the password cannot be recovered: "If you forget this password, the file cannot be opened, and no one can get it back. Up to 127 characters." then the rule's own words. The main button, "Protect and download", waits until both fields hold the same password the rule takes, with the shared sentences.
- **What the button does,** in the tool worker with qpdf: one call that opens the file (with its old password, if it has one, through the existing password flow) and writes it again encrypted with 256-bit AES (`--encrypt --user-password=P --owner-password=P --bits=256 --`), the same password for opening and for permissions, every permission allowed, and object streams generated. It never passes `--cleartext-metadata`, `--allow-insecure` or `--allow-weak-crypto`. Before giving the file back, the engine checks with a fresh qpdf that the result passes `qpdf --check` with the password, says AES-256 (R 6) with every permission allowed, and refuses to open without it.
- **An input that already has a password or restrictions** is opened with its own password and written with the new password only: the old password no longer opens the result, and old restrictions are gone. The page says so.
- **What the new file keeps:** every page and everything on it, with text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. The document's title and its XMP details are encrypted too, so they cannot be read without the password. The file is written afresh, so earlier saved versions stored inside it are not kept and a digital signature stops being valid; the page says so.
- **Output** `report-protected.pdf`. **Progress** "Reading the file", then "Writing the protected file" with qpdf's own percentage, with Cancel. The output is capped at `2 × file + 16 MB` (encryption adds at most 32 bytes to each string and stream of a genuine file); past it, the existing `output-limit` failure.
- **The password's life,** unchanged from `add-password-option`: held in `useToolRun` only, kept through Cancel, a failure and "Choose another file", forgotten when the job finishes, on "Start again", when the last file goes and on `pagehide`; only the first field's copy goes to the worker, which is ended after the job. qpdf gets it only inside `--user-password=`, `--owner-password=` and `--password=`, in its in-memory argument list, never in an argument file, an error or a progress message.
- **Page text,** a draft for the owner: that the password cannot be recovered; "A short password can be guessed by anyone who has the file."; that the browser may offer to save or suggest the password and a saved one may be copied to the browser account; that a digital signature stops being valid; that an earlier password and restrictions are replaced; what a password does and does not hide; and the privacy facts the page controls.
- **Tests:** engine unit tests on every fixture (the result opens with the new password only, in qpdf and PDF.js, R 6 and AESv3, `qpdf --check`, the title and XMP not readable as plain text, bookmarks, links, forms, attachments and tags kept, the password nowhere in the bytes), an end-to-end test at 360px and 1280px, the no-upload test with a marked password holding a space, `#`, `%` and `@`, recording page errors and the worker's console, and screenshots.

### Scope

- **One tool,** on top of `add-password-option`. It reuses `FilePicker`, `PageGrid` (one file row), `Result`, the widget, `NewPasswordField` and qpdf. No shared code changes; no dependency is added.
- **Out of scope:**
  - restrictions set alongside the password (no printing, no copying): `SPEC.md` names only the password for Protect;
  - a separate permissions password, a choice of encryption, 128-bit AES or RC4;
  - showing the password, a strength meter, a generated password, a shortest length (owner questions from PR #28);
  - characters outside printable ASCII (owner question from PR #28);
  - Unlock PDF, the next tool;
  - the site's Content Security Policy and the Privacy page draft (Phase 1 site work; see below);
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Protect with a password, `/protect-pdf`, Browser, Phase 1, first under "Protect".
- "Architecture and tech stack": "Page structure: … encrypt … qpdf compiled to WebAssembly"; "Rules for the code" 1 to 4.
- "Tool page anatomy" parts 1 to 7, and "States every tool handles" (Password needed covers the input file's own password).
- "Details that apply everywhere": output names; nothing downloads on its own.
- "SEO": "Every tool page".
- "Privacy, limits and security", "Browser tools": "Passwords typed into Protect and Unlock stay in the browser"; no request carries passwords.
- "What we are building", rule 4, "Honest about limits": what a password cannot do is said on the page.
- "Definition of done": "Each tool".

Phase 1. Catalogue position: the 16th of the 17 launch tools, first under "Protect"; Unlock PDF follows.

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name, the input password or the new password. After a pick the page fetches only the site's own files, as Compress PDF does: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data for the first page's thumbnail, and the new engine, with the shared chunk that holds the option values and the output limit (`stamp-*.js` in today's build). No dependency and no request to another origin are added.

## Open decisions and owner questions touched

- **Passwords and restrictions of the input:** the owner's decision of 13 Nov 2026 ("Page tools drop passwords and restrictions") names other tools, not Protect. Here the old password is replaced by the new one, which is what the tool is for, and old restrictions are dropped, since the new file allows everything and `SPEC.md` names no restrictions for Protect. The agent's reading; the page says so; a question for the owner below.
- **Waiting main buttons** (waiting for the owner): Protect is already named in it. Its button waits until both fields match; no starting password is possible.
- **Signed files** (waiting for the owner): the page says a digital signature stops being valid.
- **Password characters, shortest password, the browser's password manager and the note, typed twice** (waiting for the owner, PR #28): Protect is their first page and uses the defaults as built: printable ASCII, one character at least, `autocomplete="new-password"`, the long note, two hidden fields. The owner's review of Protect's page text is the natural time to answer them.
- **"Defaults are set so the main button works without touching any option"** (`SPEC.md` "Tool page anatomy", 4): the password is read as the job's input, not an option (the agent's reading, as in `add-password-option`).
- **Compress PDF keeps passwords** (waiting for the owner): untouched; a protected file can still be compressed and keeps its new password.
- **Repair PDF link:** no link until Repair PDF is published, as for every tool.
- **20,000 pages:** the notice is shown, as every one-file tool shows it.
- **Licence:** no dependency or `LICENSE` file is added.
- **The multilingual test file** is still missing; Protect leaves text as it is, so it changes nothing there.
- **Content Security Policy, a scheduling point for the program manager.** The security reviewer of `add-password-option` preferred the site's Content Security Policy (Phase 1 site work, not yet built) to land before Protect is published, since Protect is the first page that takes a password the visitor makes up. The preview is already public. This change does not include CSP work; whether Protect's pull request waits for the CSP change, or merges first with the CSP following before launch, is the program manager's call, recorded in the pull request.
- **The Privacy page facts are carried to the Phase 1 site-work change.** `src/pages/privacy.astro` is still a placeholder that makes no claim. Adding Protect's facts alone would make a page that speaks of one tool and is silent on the others, so the facts (design, section 7) are recorded here and in the pull request, for the change that drafts the whole page.

The agent's own choices, named in the pull request: the same password for opening and permissions; every permission allowed; object streams generated; old restrictions dropped; the cannot-be-recovered sentence in the hint and the short-password sentence in the page text and result notes, not the hint; the output cap; `-protected`.

New questions for the owner, each with the default used until answered:
1. **Old restrictions.** Default: dropped, and the page says so. Keep them under the new password instead?
2. **Where "A short password can be guessed by anyone who has the file." goes.** Default: the questions below the tool and a result note, so the hint under the field stays at two sentences before the shared note. Put it in the hint as well?

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `protect-pdf`: what the Protect with a password tool at `/protect-pdf` does: choosing one file, typing the new password twice, writing the file encrypted with it, what the new file keeps and what it hides, every state of "States every tool handles", that nothing is uploaded and the password is held no longer than needed, and the words on the page.

### Modified Capabilities

None. The shared password behaviour (`tool-page`, `tool-registry`, `privacy`) was specified by `add-password-option` and is used as it is.

## Impact

- **New code:** `src/engines/tools/protect-pdf.ts`; `src/content/tools/protect-pdf.md`; `tests/unit/protect-pdf.test.ts`; `tests/e2e/protect-pdf.spec.ts` with the tool's no-upload test.
- **Changed code:** the registry entry, first under "Protect"; its line in `optionPasswords` in `src/widget/option-values.ts`; the one unit test that expects `optionPasswords` to be empty (`tests/unit/options.test.ts`); `tests/fixtures/README.md`, with each fixture's outcome; `CLAUDE.md` when the pull request opens (Protect under "Where the project stands" once merged; the two new owner questions).
- **Other tools:** no change in behaviour. Watermark's and Sign PDF's related links to Protect start to show. If importing the option values from a third engine changes how the bundler splits the shared chunk, other tools' exact no-upload allowlists are updated to the new file names with their checks unchanged, and the pull request says so.
- **Page weight:** the island before a pick gains only the entry's words; `npm run weigh` must pass. No WebAssembly is fetched sooner.
