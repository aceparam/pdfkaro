# Proposal

## Why

Unlock PDF (`/unlock-pdf`) is the next Phase 1 tool in catalogue order: the second row of "Protect", after Protect with a password (PR #29) and the Content Security Policy that was to come before it (PR #30). People use it when a bank statement, a payslip or a form arrives with a password they know, and a portal or a printer will not take the file as it is, or when a file they may change will not let them print or copy from it. It is the 17th and last of the launch tools.

## What Changes

- **A new page at `/unlock-pdf`,** from a new registry entry, second under "Protect". The URL is the catalogue's and stays as `SPEC.md` gives it ("A published URL never changes").
- **The word "unlock" waits for the owner.** `SPEC.md` bans it from every page ("Banned patterns"), and the catalogue names the tool "Unlock PDF". `openspec/specs/look-and-feel/spec.md` asks a change that builds Unlock PDF to ask the owner how the word is treated before page text is written, and `tests/e2e/site.spec.ts` fails any page whose text holds "unlock". This change asks (owner question 1) and plans the plainer reading as its default:
  - the URL and the registry id stay `unlock-pdf`, so the search phrase is in the address;
  - every word on the page avoids "unlock": registry name "Remove a password", heading "Remove a password from a PDF", title "Remove a password from a PDF in your browser - PDFkaro";
  - no task that writes page words starts until the owner has answered. If the owner keeps the name "Unlock PDF" on the page, the banned-word list, the site test and `look-and-feel` change with that answer, in this change.
- **The visitor picks one PDF.** It is listed as one row (thumbnail of the first page, name, pages, size), as every one-file tool lists it. There are no options. The main button, "Remove protection and download", works as soon as the file is read.
- **Three kinds of file:**
  1. **A file that needs a password to open.** The existing "Password needed" field asks for it; a wrong one is said to be wrong and the field stays. Either of the file's passwords works (the one to open it or the one for permissions), as qpdf takes both.
  2. **A file that opens without a password but has print, copy or edit restrictions.** No password is asked for: the format lets any program open such a file, and qpdf writes it without the restrictions. `SPEC.md` asks for exactly this ("removes print and edit restrictions").
  3. **A file with neither.** The job ends with no new file and says so: "This file has no password or restrictions." with "There was nothing to remove, so no new file was made." This reuses the existing no-new-file outcome Compress PDF built (`noSmaller` words), with no shared change.
- **A file protected another way,** such as with a certificate, which qpdf cannot open, is said to be "saved in a way this tool cannot read", with advice that this tool removes only a password. Today every tool calls such a file damaged; Unlock's own inspector tells the two apart, using the existing `unsupported` outcome.
- **What the button does,** in the tool worker with qpdf, in the visitor's browser:
  - one fresh qpdf reads whether the file is encrypted (its JSON `encrypt` answer, with the password if one was typed);
  - one capped qpdf write, `--decrypt`, with the password only in the named form `--password=` in qpdf's in-memory argument list;
  - a fresh qpdf checks the result before it is given back: not encrypted, and `--check` passes.
  - Nothing guesses or tries passwords. A password is used only if the visitor typed it, once.
- **What the new file keeps:** every page and everything on it, with text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. The file is written afresh, so a digital signature stops being valid. The page says so.
- **Output** is named `report-unprotected.pdf` (owner question 2). "-unlocked" is not used, for the banned word.
- **Progress** shows "Reading the file", then "Writing the unprotected file" with qpdf's own percentage up to 50, then 55 and 100 as each check of the result passes. Cancel works throughout.
- **The output is capped** at `2 × file + 16 MB`, through the existing `cappedWrite`, as Protect's is. Decrypting removes bytes; a genuine file never comes near it.
- **The typed password's life** is the input password's as built: used only in the page and its worker, kept while that file is listed, forgotten when the file is replaced or left out, on "Start again" and when the page is left (`pagehide`). It never goes in an error, a progress message, the console or the result.
- **Related links:** Protect's link to this page starts to show, as its registry comment planned. This page links to Protect with a password, Compress PDF, Merge PDF, Split PDF and Extract pages.
- **Page text,** a draft for the owner, written only once owner question 1 is answered.
- **Tests:** engine unit tests on every fixture and on files made in the test (AES-128, RC4 128-bit and 40-bit, an owner password only, a certificate filter); one end-to-end test at 360px and 1280px with the no-upload test, under the existing Content Security Policy watch; page weight.

### Scope

- **One tool.** It reuses `FilePicker`, `PageGrid` (one file row), `Result`, the widget, `PasswordField`, qpdf, `cappedWrite` and the no-new-file outcome. No shared component and no dependency are added.
- **Out of scope:**
  - guessing, trying or recovering a password (`SPEC.md` "Scope notes");
  - files protected with a certificate (they are named, not opened);
  - removing a signature's own restrictions (qpdf's `--remove-restrictions`, which concerns signed files, not passwords);
  - next steps after the result, a known gap across the site;
  - the Privacy page draft (Phase 1 site work); this change records its facts;
  - giving back a file that had nothing to remove.

### `SPEC.md` sections

- "Tool catalogue": Unlock PDF, `/unlock-pdf`, Browser, Phase 1, second under "Protect".
- "Scope notes for specific tools": "Unlock removes a password the visitor types in, and removes print and edit restrictions. It does not guess or crack an unknown password."
- "Architecture and tech stack": "Page structure: … decrypt … qpdf compiled to WebAssembly"; "Rules for the code" 1 to 4.
- "Tool page anatomy" parts 1 to 7, and "States every tool handles".
- "Details that apply everywhere": output names; nothing downloads on its own.
- "Look and feel": "Banned patterns" (the word "unlock"; owner question 1).
- "SEO": "Every tool page".
- "Privacy, limits and security", "Browser tools": "Passwords typed into Protect and Unlock stay in the browser"; no request carries passwords.
- "Definition of done": "Each tool".

Phase 1. Catalogue position: the 17th of the 17 launch tools, second under "Protect". The Content Security Policy that Protect's entry said must come first is merged (PR #30).

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or the password.

After a pick, the page fetches only the site's own files: the worker and the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data for the first page's thumbnail, and the new engine. No request to another origin and no dependency are added.

## Open decisions and owner questions touched

- **The word "unlock"** (`look-and-feel`: "Unlock PDF is built"; `design/README.md`). Asked now, as owner question 1. Default planned: the URL keeps the word; nothing on any page says it.
- **Signed files** (waiting for the owner). Unlock writes the file afresh, so a digital signature stops being valid. The result and the page text say so.
- **Waiting main buttons** (waiting for the owner). Unlock has no option, so its button works once the file is read, as Reorder's and Compress's do.
- **The browser's password manager and the note** (waiting for the owner, PR #28). Unlock uses the file-password field as it is, with "It is not sent anywhere." and `autocomplete="off"`. Its review is the owner's question already.
- **Repair PDF link.** No link until Repair PDF is published, as for every tool.
- **20,000 pages and 100 MB.** The notices are shown, as every one-file tool shows them.
- **Licence.** No dependency or `LICENSE` file is added.
- **The multilingual test file** is still missing. Unlock leaves text as it is, but **Unlock cannot be called done until the file exists and Unlock has been run on it.**
- **Pages for previews only, or for launch too?** Unchanged; the CSP limits on GitHub Pages apply to this page as to every page.

The agent's own choices, named in the pull request: no password asked for a file with restrictions only; no new file when there is nothing to remove; the certificate case named rather than called damaged; the check before giving the file back; object streams kept as they are; the output cap; `-unprotected`; the button, heading and result words.

New questions for the owner, each with the default used until answered:

1. **The word "unlock".** Default: `/unlock-pdf` stays; the page, the home page list and related links say "Remove a password" and "Remove a password from a PDF", never "unlock". Or show the name "Unlock PDF", as the catalogue gives it, and let the word through for this name only? **Page words wait for this answer.**
2. **The output name.** Default: `report-unprotected.pdf`. Or `report-no-password.pdf`, or `report-decrypted.pdf`?
3. **A file with nothing to remove.** Default: no new file, and the page says there was nothing to remove. Or give the file back as it was?
4. **A word on permission.** Default: the page text says the tool removes restrictions only from a file the visitor may change, in one plain sentence in the questions. Or say nothing?

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `unlock-pdf`: what the tool at `/unlock-pdf` does: choosing one file, giving its password if it has one, writing it with no password and no restrictions, the file with nothing to remove, the file protected another way, what the new file keeps, every state of "States every tool handles", that nothing is uploaded and the password is held no longer than needed, and the words on the page.

### Modified Capabilities

None. If owner question 1 lets the name "Unlock PDF" onto the page, this change gains a MODIFIED delta of `look-and-feel` ("Banned patterns") recording that answer before any page word is written.

## Impact

- **New code:** `src/engines/tools/unlock-pdf.ts`; `src/content/tools/unlock-pdf.md`; `tests/unit/unlock-pdf.test.ts`; `tests/e2e/unlock-pdf.spec.ts` with the tool's no-upload test.
- **Changed code:**
  - the registry entry in `src/tools/registry.ts`, after Protect; Protect's comment "Unlock PDF is linked once it is published" goes;
  - `tests/fixtures/README.md`, with each fixture's outcome;
  - `CLAUDE.md`: the new owner questions when the pull request opens, and Unlock's entry after merge.
- **Other tools:** no change in behaviour. Protect's page gains its related link to this one.
- **Page weight:** the island before a pick gains only the entry's words; `npm run weigh` must pass. No WebAssembly is fetched sooner.
