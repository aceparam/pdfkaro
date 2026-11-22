# Proposal

## Why

Unlock PDF (`/unlock-pdf`) is the next Phase 1 tool in catalogue order: the second row of "Protect", after Protect with a password (PR #29) and the Content Security Policy that was to come before it (PR #30). People use it when a bank statement, a payslip or a form arrives with a password they know, and a portal or a printer will not take the file as it is, or when a file they may change will not let them print or copy from it. It is the 17th and last of the launch tools.

## What Changes

- **A new page at `/unlock-pdf`,** from a new registry entry, second under "Protect". The URL is the catalogue's and stays as `SPEC.md` gives it ("A published URL never changes").
- **The word "unlock", by the owner's decision of 22 Nov 2026.** `SPEC.md` bans it from every page ("Banned patterns") and the catalogue names the tool "Unlock PDF". The owner chose:
  - the address `/unlock-pdf` and the registry id `unlock-pdf` keep the word, so the search phrase is in the address;
  - no page says it: the tool is named "Remove a password", its heading is "Remove a password from a PDF", its title "Remove a password from a PDF in your browser - PDFkaro";
  - the word stays banned everywhere else. `look-and-feel` ("Banned patterns") and `tool-registry` record this in this change.
- **Sentence, summary and description** lead with restrictions, which need no password: "Remove print and edit restrictions from a PDF, and its password if you know it."
- **The visitor picks one PDF.** It is listed as one row (thumbnail of the first page, name, pages, size), as every one-file tool lists it. There are no options. The main button, "Remove protection and download", works as soon as the file is read.
- **Three kinds of file:**
  1. **A file that needs a password to open.** The existing "Password needed" field asks for it; a wrong one is said to be wrong and the field stays. Either of the file's passwords works (the one to open it or the one for permissions), as qpdf takes both.
  2. **A file that opens without a password but has print, copy or edit restrictions.** No password is asked for: the format lets any program open such a file, and qpdf writes it without the restrictions. `SPEC.md` asks for exactly this ("removes print and edit restrictions").
  3. **A file with neither.** The job ends with no new file and says so: "This file has no password or restrictions." with "There was nothing to remove, so no new file was made. You can use your file as it is." This reuses the no-new-file outcome Compress PDF built (`noSmaller` words). The owner chose no file with a sentence (22 Nov 2026).
- **A file protected another way,** such as with a certificate, which qpdf cannot open, gets the existing `unsupported` notice ("`name` is saved in a way this tool cannot read.") with the advice "It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection." Today every tool calls such a file damaged.
- **What the button does,** in the tool worker with qpdf, in the visitor's browser:
  - one fresh qpdf reads whether the file is encrypted (its JSON `encrypt` answer, with the password if one was typed), keeping only that yes or no;
  - one capped qpdf write, `--decrypt`, with the password only in the named form `--password=` in qpdf's in-memory argument list;
  - a fresh qpdf checks the result before it is given back: not encrypted (the same reading), and `--check` passes.
  - Nothing guesses or tries passwords. A password is used only if the visitor typed it.
- **What the new file keeps:** every page and everything on it, with text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. The file is written afresh, so a digital signature stops being valid. The page says so.
- **Output** is named `report-unprotected.pdf` (owner, 22 Nov 2026).
- **Progress** shows "Reading the file", then "Writing the unprotected file" with qpdf's own percentage up to 50, then 55 and 100 as each check of the result passes. Cancel works throughout.
- **The output is capped** at `2 × file + 16 MB`, through the existing `cappedWrite`, as Protect's is. Decrypting removes bytes; a genuine file never comes near it.
- **The typed password's life:** used only in the page and its workers; kept while that file is listed, through Cancel and a failure; forgotten when a job ends with a file or with no new file (new, see below), when the file is replaced or left out, on "Start again" and when the page is left (`pagehide`). It never goes in an error, a progress message, the console or the result.
- **Related links:** Protect's link to this page starts to show, as its registry comment planned. This page links to Protect with a password, Compress PDF, Merge PDF, Split PDF and Extract pages.
- **Page text,** a draft for the owner, including the owner's sentence that restrictions should be removed only from a file the visitor is allowed to change.
- **Tests:** engine unit tests on every fixture and on files made in the test (AES-128, RC4 128-bit and 40-bit, a permissions password only, a certificate filter); one end-to-end test at 360px and 1280px with the no-upload test, under the existing Content Security Policy watch; page weight.

### Shared changes riding along

Two small shared changes, each named in the pull request:

1. **Input passwords are forgotten when a job ends with a file or with no new file** (privacy reviewer, stage 1). `runJob` (`src/hooks/run-job.ts`) already forgets new passwords at that point; it will also forget the input files' own passwords through a second callback that empties `useToolRun`'s `passwords` map. Nothing on a result screen can use them: no result offers to go back to the files, and "Start again" already forgets them. A failure, a run that throws and Cancel keep them, for "Go back to your file". Every tool that opens a protected file is affected only in this.
2. **`readPdf` in `src/engines/inspect.ts`** (architect, stage 1): the qpdf call `inspectPdf` makes, exported as a function that gives the outcome and qpdf's printed text, so Unlock can tell a certificate from damage without parsing the file twice. `inspectPdf` returns its outcome as now; no behaviour changes. The printed text never leaves the worker.

### Scope

- **One tool,** with the two shared changes above. It reuses `FilePicker`, `PageGrid` (one file row), `Result`, the widget, `PasswordField`, qpdf, `cappedWrite`, the no-new-file outcome and the `unsupported` outcome. No shared component and no dependency are added.
- **Out of scope:**
  - guessing, trying or recovering a password (`SPEC.md` "Scope notes");
  - files protected with a certificate (they are named, not opened);
  - removing a signature's own restrictions (qpdf's `--remove-restrictions`, which concerns certified files, not passwords);
  - saying "nothing to remove" before the main button, which needs a new inspect outcome;
  - the home page filter matching addresses, so "unlock" finds nothing there (named in the pull request);
  - next steps after the result, a known gap across the site;
  - the Privacy page draft (Phase 1 site work); this change records its facts;
  - giving back a file that had nothing to remove.

### `SPEC.md` sections

- "Tool catalogue": Unlock PDF, `/unlock-pdf`, Browser, Phase 1, second under "Protect".
- "Scope notes for specific tools": "Unlock removes a password the visitor types in, and removes print and edit restrictions. It does not guess or crack an unknown password."
- "Architecture and tech stack": "Page structure: … decrypt … qpdf compiled to WebAssembly"; "Rules for the code" 1 to 4.
- "Tool page anatomy" parts 1 to 7, and "States every tool handles".
- "Details that apply everywhere": output names; nothing downloads on its own.
- "Look and feel": "Banned patterns" (the word "unlock", settled by the owner on 22 Nov 2026).
- "SEO": "Every tool page".
- "Privacy, limits and security", "Browser tools": "Passwords typed into Protect and Unlock stay in the browser"; no request carries passwords.
- "Definition of done": "Each tool".

Phase 1. Catalogue position: the 17th of the 17 launch tools, second under "Protect". The Content Security Policy that Protect's entry said must come first is merged (PR #30).

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or the password.

After a pick, the page fetches only the site's own files: the worker and the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data for the first page's thumbnail, and the new engine. No request to another origin and no dependency are added.

## Open decisions and owner questions touched

**The owner answered this change's four questions on 22 Nov 2026, choosing every default** (`CLAUDE.md`, "Unlock PDF's words"): no page says "unlock" and the name is "Remove a password"; the output is `-unprotected`; a file with nothing to remove gives no file with a sentence; the page text carries the permission sentence. None is open.

- **Signed files** (waiting for the owner). Unlock writes the file afresh, so a digital signature stops being valid. The result and the page text say so. A certified file may still be limited by its certification in some readers; that is a hand check.
- **Waiting main buttons** (waiting for the owner). Unlock has no option, so its button works once the file is read, as Reorder's and Compress's do.
- **The browser's password manager and the note** (waiting for the owner, PR #28). Unlock uses the file-password field as it is, with "It is not sent anywhere." and `autocomplete="off"`.
- **Shared pieces in tool pull requests** (waiting for the owner). Two ride along here, named above.
- **Repair PDF link.** No link until Repair PDF is published, as for every tool.
- **20,000 pages and 100 MB.** The notices are shown, as every one-file tool shows them.
- **Licence.** No dependency or `LICENSE` file is added.
- **The multilingual test file** is still missing. Unlock leaves text as it is, but **Unlock cannot be called done until the file exists and Unlock has been run on it.**
- **Pages for previews only, or for launch too?** Unchanged; the CSP limits on GitHub Pages apply to this page as to every page.

The agent's own choices, named in the pull request: no password asked for a file with restrictions only; the certificate case named rather than called damaged; the check before giving the file back; object streams kept as they are; the output cap; the button, result and notice words; the two shared changes.

No new owner question. No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `unlock-pdf`: what the tool at `/unlock-pdf` does: choosing one file, giving its password if it has one, writing it with no password and no restrictions, the file with nothing to remove, the file protected another way, what the new file keeps, every state of "States every tool handles", that nothing is uploaded and the password is held no longer than needed, and the words on the page.

### Modified Capabilities

- `look-and-feel`: "Banned patterns" records the owner's answer of 22 Nov 2026: the word stays banned on every page; only the address `/unlock-pdf` and the id keep it.
- `tool-registry`: a new requirement that `unlock-pdf` keeps the catalogue's URL, group, runs-in and phase and takes the name "Remove a password".

## Impact

- **New code:** `src/engines/tools/unlock-pdf.ts`; `src/content/tools/unlock-pdf.md`; `tests/unit/unlock-pdf.test.ts`; `tests/e2e/unlock-pdf.spec.ts` with the tool's no-upload test.
- **Changed code:**
  - the registry entry in `src/tools/registry.ts`, after Protect; Protect's comment "Unlock PDF is linked once it is published" goes;
  - `tests/unit/registry.test.ts`: the "only Image to PDF has `unsupportedAdvice`" and "only Compress PDF has `noSmaller`" checks admit `unlock-pdf`, and an Unlock entry test is added;
  - `tests/e2e/protect-pdf.spec.ts`: its "no unlock in the HTML" check reads the visible text, since Protect's related link now holds `/unlock-pdf`;
  - `src/hooks/run-job.ts`, `src/hooks/useToolRun.ts` and `tests/unit/run-job.test.ts` (input passwords forgotten after a result);
  - `src/engines/inspect.ts` (`readPdf`), with its tests;
  - `tests/fixtures/README.md`, with each fixture's outcome;
  - `design/README.md`: "Unlock PDF" no longer waits for the owner;
  - `CLAUDE.md`: Unlock's entry after merge.
- **Other tools:** a protected input's password is forgotten once a result is shown, which no result screen uses. Protect's page gains its related link to this one.
- **Page weight:** the island before a pick gains only the entry's words; `npm run weigh` must pass. No WebAssembly is fetched sooner.
