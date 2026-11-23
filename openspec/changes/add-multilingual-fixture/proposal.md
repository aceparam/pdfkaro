# Proposal: add-multilingual-fixture

## Why

`SPEC.md` "Definition of done", The test set, lists "Text in Hindi, Telugu, Arabic and Chinese", and every tool must run against every file in the set. The file does not exist: `tests/fixtures/README.md` says "The multilingual file is still missing" under nearly every tool, and `CLAUDE.md` says Protect with a password and Remove a password cannot be called done until it exists and they have been run on it. Every Phase 1 tool is built, so this file is now one of the last things the agent can do towards the Phase 1 gate. It was left out because the build machine had no fonts for these scripts; the fonts can be fetched from the npm registry, which the environment reaches, at the moment the file is made.

## What Changes

- **A new test file, `tests/fixtures/multilingual.pdf`**: five A4 pages, one each in Hindi (Devanagari), Telugu, Arabic (right to left, joined letters, Arabic-Indic digits, one Latin word inside an Arabic line) and Chinese (Simplified), and a fifth page with all four scripts and English together. Real sentences, words chosen to need shaping (conjuncts, vowel signs placed before their consonant, Arabic ligatures). The fonts (Noto, SIL Open Font Licence 1.1) are embedded as subsets, so the text draws and can be selected in any reader.
- **How it is made**: Chromium, already installed for Playwright, prints an HTML page to PDF; Chromium shapes the text with HarfBuzz and embeds each font as a TrueType subset with Unicode mappings. A new committed script, `tests/fixtures/make-multilingual.mjs`, fetches four exact `@fontsource` font packages from the npm registry into a temporary folder, checks each against a pinned checksum, prints the page and fixes the file's dates. The fonts are never committed and never shipped; only the PDF and the script are committed. The sentences live in one committed file, `tests/fixtures/multilingual-text.json`, read by the script and by the tests. No `package.json` change.
- **A second, small test file, `tests/fixtures/chinese-unembedded.pdf`**, made by `make.mjs` with pdf-lib: one page of Chinese text in the font Acrobat names `STSong-Light`, not embedded, through the named character map `UniGB-UCS2-H`, as older Asian-language PDFs are. It records the known gap from the owner's decision of 11 Nov 2026 (no character maps are shipped): PDF.js draws no text for it. Kept separate so the main file stays a file that every reader shows correctly (owner question 1).
- **Every tool is run on both files.** The engine-loads tests pick them up by themselves. A new unit test, `tests/unit/multilingual.test.ts`, checks that each tool that gives back a PDF keeps the text of every page it keeps (as PDF.js reads it, before and after), that a protected result reads the same with its password, that Remove a password after Protect gives the text back, and that PDF to JPG, PDF to PNG and thumbnails draw every page's text from the main file. Tests that list every fixture by name are updated.
- **`tests/fixtures/README.md`**: both files in the table, how they are made, and each engine's outcome in place of every "The multilingual file is still missing" line, written from what the tests and runs showed, including what does not work.
- **One end-to-end addition**: on `/pdf-to-jpg` only, `tests/e2e/uniform-requests.spec.ts` picks and runs both files, to show that a file whose font asks PDF.js for a character map that is not shipped makes no extra request. About 10 seconds of CI time.
- **`LICENSES.md`**: one line under "Used to build and test only" for the four Noto fonts and the `@fontsource` packages they come in.
- **A draft comment for issue #7**, in design.md, listing the hand checks that use the new files.
- No change to any page, engine, worker, component, registry entry or shipped file. No new dependency in `package.json`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `quality-gates`: adds what the multilingual test file must hold and how it is made, that every tool keeps its text and the drawing tools draw it, and the second file whose Chinese font is not embedded, with its known gap recorded and no extra request. The existing requirement "The shared test set" already names the file and does not change.

## SPEC.md sections

- "Definition of done", The test set ("Text in Hindi, Telugu, Arabic and Chinese"; "Every tool runs against all of them") and Each tool ("Produces a correct result for every file in the test set, or a clear message saying why it cannot"; "Leaves alone what it was not asked to change: … text stay intact").
- "Build phases", Phase 1 gate: "Every tool passes the Definition of done". This is test work towards the gate, not a tool, so it has no catalogue position.
- "Architecture and tech stack": rendering by PDF.js; "Before installing any library, confirm that the package is still maintained and note its licence in `LICENSES.md`".

## Where files are processed, and requests

Nothing changes on the site. No page, engine or worker changes, and the site makes no new request. The generating script makes requests to the npm registry (`registry.npmjs.org`) on the developer's machine, only when the file is made again; the environment already reaches it, and no host is added. Chromium loads the page from a local file with every other request refused.

## Out of scope

- Fonts for drawing text in other scripts (Watermark, Sign PDF), which is issue #20.
- Shipping PDF.js character maps (open owner question "Character maps for PDF to JPG and PNG"). The second file records the gap; it does not close it.
- Changing any tool's words, including the PDF to JPG and PNG sentence about Chinese, Japanese and Korean text.
- Japanese, Korean, Traditional Chinese, Bengali, Tamil or any script `SPEC.md` does not list.
- A text-reading tool (PDF to text is phase 2). The design records that PDF.js does not read Chromium's actual-text spans, which that tool will meet.
- The hand checks themselves (readers, browsers, screen reader), which stay in issue #7.

## Open decisions and owner questions touched

Each has a default this change builds.

1. **A second file whose Chinese font is not embedded.** `SPEC.md` asks for one multilingual file. Default: add the small second file as well, because many real Chinese PDFs are like it, and it is the case the owner's 11 Nov decision leaves undrawn. Drop it if the owner prefers the set to hold only what `SPEC.md` lists.
2. **Who checks the sentences.** The sentences are short and plain, written by the agent. Default: a reader of each script checks them by hand (issue #7); until then, the file counts for the automated checks only. Should anyone in particular be asked?
3. **Simplified or Traditional Chinese.** `SPEC.md` says "Chinese". Default: Simplified only.
4. **Existing open question "Character maps for PDF to JPG and PNG"** (`CLAUDE.md`). Not changed. The new files give it a concrete case: the main file's Chinese draws (embedded font, no named map); the second file's does not.
5. **"Licence" (Open decisions).** Not touched: the fonts are test data, never shipped, and no `LICENSE` file is added. Embedding OFL font subsets in a document is allowed by the licence.
6. **"Opens without warnings in Adobe Reader"** (Definition of done). Adobe Reader may offer to download its Asian font pack for the second file itself, before any tool touches it. Default: the hand check records that as the input's own prompt, not a tool's warning.
