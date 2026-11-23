# Design: add-multilingual-fixture

## Context

See proposal.md, Why. What shapes the approach:

- `tests/fixtures/make.mjs` makes every committed PDF with `@cantoo/pdf-lib` and qpdf, and needs no network. `make-large.mjs` and `make-many-pages.mjs` are separate scripts for files that are not committed. Every test that reads the set lists `tests/fixtures/*.pdf` itself (`engine-loads-helpers.ts`, `protect-pdf.test.ts`, `unlock-pdf.test.ts`), and five tests also name every fixture so a new one is not forgotten (`pdf-to-images`, `add-page-numbers`, `watermark-pdf`, `sign-pdf`, and the count in `images-to-pdf`).
- No font for Devanagari, Telugu, Arabic or Chinese is installed (`fc-list` shows only Noto Color Emoji) or in the repo. The npm registry is reachable, and `@fontsource` publishes each Noto family as an npm package of `woff2` files under OFL 1.1.
- Playwright 1.63 and its Chromium are installed (devDependency, browsers in `/opt/pw-browsers`); its PDF writer reports itself as `Skia/PDF m153`.
- Owner decision of 11 Nov 2026: PDF.js's helper data is one fixed set with no character maps.

A trial run during planning (scratch files only, not committed) printed four pages, one per script, with the fonts below:

| Check | Result |
| --- | --- |
| Fonts (`pdffonts`) | Every font a `CID TrueType` subset, `Identity-H`, embedded, with a Unicode map. Headings in synthetic bold came out as `Type 3` fonts; with headings at weight 400, none did |
| Size | 42,819 bytes for four pages, tagged |
| Shaping | 47 `/Span <</ActualText …>> BDC` spans for clusters whose glyphs do not map one to one (Devanagari and Telugu conjuncts and vowel signs, Arabic joined forms) |
| Poppler `pdftotext` | Hindi, Telugu and Chinese came back exactly; Arabic came back in the right letters with extra spaces, as poppler does with right-to-left text |
| PDF.js `getTextContent` | Chinese came back exactly. Hindi, Telugu and Arabic came back with `U+0000` where a glyph maps through actual text only, and Arabic in presentation forms: PDF.js does not read actual-text spans |
| Two runs | Different bytes only in the dates |

A hand-made page with Chinese in `STSong-Light` through `UniGB-UCS2-H`, not embedded, gave in PDF.js: "Ensure that the `cMapUrl` API parameter is provided", no text read and none drawn; poppler without its language pack also failed.

## Goals / Non-Goals

**Goals:**

- A multilingual file that every common reader shows correctly, so a tool's output can be judged against it.
- Automated checks that every tool keeps its text and that the drawing tools draw it, recorded per tool in the fixtures README.
- A record of the known character-map gap on a file that shows it.

**Non-Goals:**

- A check that text reads correctly as language (that needs a human reader; issue #7).
- Making PDF.js read actual-text spans, or shipping character maps.
- Regenerating the file in CI. It is committed, as every other fixture is.

## Decisions

### 1. Chromium prints the file, not pdf-lib

Chromium shapes text with HarfBuzz, which handles Devanagari and Telugu reordering and mark placement and Arabic joining and right-to-left order, writes TrueType subsets with Unicode maps, and adds actual-text spans for clusters. The trial shows it works with what is installed.

Alternatives considered:

- **pdf-lib with fontkit.** Needs a new devDependency (`@cantoo/fontkit`). pdf-lib lays text out by glyph advances and ignores the font's mark positions, and how it orders right-to-left glyphs is not something we can show is right without a reader. A file that looks wrong in real readers would make every tool's check meaningless. Dropped.
- **Hand-placing shaped glyphs** (shape with a library, then write glyph ids). Needs a shaping library as a new dependency and much more code for test data. Dropped.
- **LibreOffice, Typst or another tool.** Not installed; each would be a new tool to trust. Dropped.

### 2. The page and the words

`tests/fixtures/multilingual-text.json` holds, per page, its language tag, direction, font family, heading and lines. The script builds the HTML from it, and the tests read it for the Chinese sentences and for the page count. Plain sentences about the file itself, no names of people, no invented facts:

| Page | Lines |
| --- | --- |
| 1, Hindi (`hi`, Noto Sans Devanagari) | हिन्दी / यह एक परीक्षण दस्तावेज़ है। इसमें हिन्दी में लिखा पाठ है। / क्षत्रिय, श्रद्धा, द्वार, प्रश्न, कृपया, ज़रूरी / ०१२३४५६७८९ |
| 2, Telugu (`te`, Noto Sans Telugu) | తెలుగు / ఇది ఒక పరీక్ష పత్రం. ఇందులో తెలుగులో వ్రాసిన పాఠ్యం ఉంది. / శ్రీ, క్ష, స్త్రీ, ద్రాక్ష, కృష్ణ / ౦౧౨౩౪౫౬౭౮౯ |
| 3, Arabic (`ar`, `dir="rtl"`, Noto Naskh Arabic) | العربية / هذه وثيقة اختبار. فيها نص مكتوب باللغة العربية. / لا، الله، مستشفى / ملف PDF من ٥ صفحات |
| 4, Chinese (`zh-Hans`, Noto Sans SC) | 中文 / 这是一份测试文件。其中有用简体中文写的文字。 / 标点符号：，。、；？ |
| 5, all four (`en`, with each line in its own language) | Four languages / Hindi: हिन्दी पाठ / Telugu: తెలుగు పాఠ్యం / Arabic: نص عربي / Chinese: 中文文字 |

Headings are weight 400 and nothing is italic, so no synthetic bold or italic turns a font into Type 3 shapes. CSS: `@page { size: A4; margin: 20mm }`, 16 pt text, one section per page with `break-after: page`. The page has a `<title>` (the same as the file's title), and every text from the JSON is escaped into the HTML with the same `escapeHtml` rule as `scripts/social-image.mjs`. Printed with `page.pdf({ format: 'A4', tagged: true, outline: false, printBackground: false, displayHeaderFooter: false })`: tagged, because real files from browsers and office programs are, and the screen-reader hand check needs it; no header or footer, so Chromium writes no address, title or date into the pages.

### 3. Fonts are fetched when the file is made, never committed

`make-multilingual.mjs` fetches these packages as follows (security review, stage 1):

- A temporary folder is made with `fs.mkdtemp` under the system's temporary folder, and removed in a `finally` block whatever happens.
- Each package is fetched with `execFile('npm', ['pack', '<name>@<version>', '--ignore-scripts', '--registry', 'https://registry.npmjs.org', '--pack-destination', <tmp>, '--cache', <tmp>/cache])`, with an argument array (no shell) and the temporary folder as working folder, so no package script runs, no other registry or `.npmrc` setting is used, and the 74 MB tarball does not stay in `~/.npm`.
- The script computes the SHA-512 of each tarball's bytes itself with `node:crypto` and compares it with the value written in the script, before `tar` runs. npm's own report is not trusted for this. A mismatch stops the script.
- Each tarball is extracted into its own new empty folder with `tar -xzf <file> -C <folder> --no-same-owner --no-same-permissions`.
- The script reads only the `woff2` files it names in a fixed list in its own code: the 400-weight file for Devanagari, Telugu and Arabic, and the 102 numbered pieces of Noto Sans SC (`noto-sans-sc-<n>-400-normal.woff2`). Each is opened only if `lstat` shows a regular file whose resolved path lies inside that package's folder. The packages' CSS is not read: the script writes its own `@font-face` rules, one per file, with no `unicode-range`, so Chromium picks the piece that holds each character by trying the pieces of the family in order. Nothing from the packages is imported or run.

| Package | Version (released) | Licence | Unpacked size | Integrity |
| --- | --- | --- | --- | --- |
| `@fontsource/noto-sans-devanagari` | 5.3.0 (Jul 2026) | OFL-1.1 | 1.5 MB | `sha512-7khYmipS/5KAUUmrO1DKir8yL8XI00d0+ZE9BqbS8XF1jzObv6CpPOk3UeYxF+Pvi8bx9bBvprBCOcbx/eQWTQ==` |
| `@fontsource/noto-sans-telugu` | 5.3.0 (Jul 2026) | OFL-1.1 | 1.3 MB | `sha512-D5AD91Ok2wURk6Vf4sOe2KA3nf0M7qePboNVuvJbguOqLAplh3cGkEIX1qi9u1Jjcz9QWblQ5BbTXI/c+QjB9Q==` |
| `@fontsource/noto-naskh-arabic` | 5.3.0 (Jul 2026) | OFL-1.1 | 0.9 MB | `sha512-S/GDgQ6mh/PKo4mz5+eXNYbEarvpI7yh6eCdOz8tTVbeM7+OUiacIEscaYEibr/+egDtGbO2ZB00sjy1bJC1kQ==` |
| `@fontsource/noto-sans-sc` | 5.3.1 (Oct 2026) | OFL-1.1 | 74.6 MB (102 pieces by Unicode range) | `sha512-YxZ/VWAWo9FWzH08Q6fGTzIW6vYNP2TMhUFCnfhlimbhdXnWrxJLrzX3KWt2FKnV0s8XiM5vjpGHQiyFRlTj0w==` |

Why not commit the fonts: Noto Sans SC alone is 74 MB, the OFL asks for its licence text beside any copy of the fonts, and nothing reads them after the file is made. The PDF holds only the subsets Chromium embeds, which the OFL allows in documents without putting the document under the OFL. These are not dependencies in `package.json`: nothing installs them, and the compressed page size of the site is unchanged. `LICENSES.md` gets one line under "Used to build and test only" naming the four fonts, their licence, the packages, and that only the font subsets inside the one committed test PDF are kept. The pull request says in a sentence why they are needed (`SPEC.md` "Build phases", 4): to make the test file `SPEC.md` asks for with real text in each script; their release dates (Jul and Oct 2026) show the packages are maintained; only subsets inside `multilingual.pdf` are kept.

Chromium is started by Playwright with its sandbox on where the system allows it (`chromiumSandbox: true`, falling back with a printed line when the machine cannot run it), in a context with `javaScriptEnabled: false` and `offline: true`. The page is written into the temporary folder and opened from there. A route allows only `file:` addresses inside the temporary folder and aborts every other request. The page also carries a policy `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src file:; style-src 'unsafe-inline'">`, so even a mistake in the route could not load anything but fonts.

### 4. The file is tidied with pdf-lib, then checked by qpdf

The script loads Chromium's bytes into pdf-lib with `updateMetadata: false`, so pdf-lib writes nothing of its own; it then sets the title ("Text in Hindi, Telugu, Arabic and Chinese"), the creator ("PDFkaro test set"), keeps Chromium's producer line, and sets both the creation and the modification date explicitly to the fixed date `make.mjs` uses. It sets the trailer `/ID` to a fixed pair (the SHA-256 of the JSON's bytes, cut to 16 bytes, twice), or, if pdf-lib cannot set it, checks that the file has none. It saves without object streams, as `text.pdf` is.

Then qpdf (the same WebAssembly build) runs `--check`, and writes an uncompressed copy (`--qdf --object-streams=disable --stream-data=uncompress`) for the script to search. The script refuses to write the file if:

- `qpdf --check` fails, the page count is not five, or any page font is not an embedded Type 0 subset with a Unicode map;
- the final bytes or the uncompressed copy hold `file:`, any part of the temporary folder's path, or the home folder's path;
- the document information holds any key other than `/Title`, `/Creator`, `/Producer`, `/CreationDate` and `/ModDate`.

Two runs with the same Chromium must give the same bytes; the task checks this. The fixtures README records the Chromium and Playwright versions used, because a later Chromium may give different bytes. Expected size: about 50 to 70 KB.

Alternative: qpdf's JSON update to set the dates. Dropped; pdf-lib already sets them in `make.mjs`, and the result is checked either way.

### 5. The second file is made by `make.mjs`

`chinese-unembedded.pdf`, section 16 of `make.mjs`, with pdf-lib's low-level objects as in the trial: a Type 0 font `STSong-Light-UniGB-UCS2-H`, encoding `UniGB-UCS2-H`, descendant `CIDFontType0` `STSong-Light` with `Adobe`/`GB1`/4 and a font descriptor with no font file; one A4 page whose content shows the first two Chinese lines of page 4 as UCS-2 codes. It needs no font and no network. `make.mjs` keeps its other files' bytes, except the encrypted ones, which change on every run as now (the README already says to copy back only what is needed).

### 6. What the tests check

No tool is run twice on the same file for the same check (architecture review, stage 1). Loops that already run every fixture pick up both files once their name lists are updated:

- `protect-pdf.test.ts` (the loop over every readable fixture) already protects each file, checks the encryption, and compares what each page shows with the password;
- `unlock-pdf.test.ts` (the loop over every unencrypted fixture) already checks that Remove a password alone gives no new file;
- `add-page-numbers.test.ts`, `watermark-pdf.test.ts` and `sign-pdf.test.ts` already compare each page's text for every other file in their lists, once task 2.7 adds the two names. Only `sign-pdf.test.ts` (`expectSignedLast`) also compares each page's own content streams there; task 2.3a adds that comparison to `expectNumbered` and `expectWatermarked`.

A new `tests/unit/multilingual.test.ts`, in Node with the same qpdf and PDF.js the other engine tests use, holds only what those loops do not:

- **The file itself**: five pages; every font in every page's resources is Type 0 with a `FontFile2` and a `ToUnicode` (read with qpdf's JSON); PDF.js reads each Chinese line of page 4 exactly (after removing white space); pages 1, 2 and 3 each hold at least one actual-text span (read from qpdf's decoded content streams).
- **Text kept, for the tools no loop covers**: Merge (with `text.pdf` after it: pages 1 to 5 match); Split (part *n* matches page *n*); Extract pages 2 and 4; Delete page 1 (pages 2 to 5 left); Reorder reversed; Rotate one turn; Compress (a file: every page matches; no new file: recorded); Protect then Remove a password with the same password (read with none). The text of a page is what `texts()` in `tests/unit/stamp-helpers.ts` gives, reused as it is (moved to a neutral helper file, `tests/unit/pdf-helpers.ts`, if importing it from a stamp helper reads oddly), compared before and after with `U+0000` kept, because PDF.js's reading of these scripts is incomplete and comparing it with itself is what shows a tool kept the text.
- **Content streams, for every tool that gives back a PDF**: each kept page's own decoded content streams must be byte for byte the input page's. For the page tools, Compress (when it gives a file) and Protect then Remove a password, compared here as above. For Sign PDF the existing loop (`expectSignedLast`) already compares each page's own decoded streams for every listed file. For Add page numbers and Watermark the loops (`expectNumbered`, `expectWatermarked`) compare only text today; the comparison of `contents[1..-2]` with the input's streams, now done only in their `tagged.pdf` tests, is added inside those two helpers, so every fixture in their loops gains it and the check is not repeated here. The existing Protect loop compares what each page shows but not its streams, so the comparison is added inside that loop, on the output it already makes, read with the password through `--decrypt --qdf --object-streams=disable --stream-data=uncompress` as `plainDump` does: Protect still runs once per fixture, and every readable fixture gains the check, not only the new ones. This covers the actual-text spans PDF.js does not read.
- **Drawn**: PDF to JPG and PDF to PNG give five pictures; thumbnails are drawn with `draw` from `src/engines/thumbnail.ts`. Each picture and thumbnail of `multilingual.pdf` must hold at least the number of dark pixels measured for its page, written in the test with a wide margin. On page 5, each script's line must also show ink in its own horizontal band, found from where PDF.js places that line's text items. Each picture of `chinese-unembedded.pdf` is drawn without failing; its dark-pixel count is recorded and checked as none, a record of today's gap (owner decision, 11 Nov 2026) that changes when the owner answers the character-map question.
- **Character maps asked for in memory only** (privacy review, stage 1): the test passes a `tools.pdfjs` whose `getDocument` wraps the `BinaryDataFactory` it is given and records every `fetch` call's `kind` and `filename`. Drawing `chinese-unembedded.pdf` must ask for the kind `cMapUrl` with the name `UniGB-UCS2-H`, once per document opened, and the factory refuses it as it does today; drawing `multilingual.pdf` must ask for no `cMapUrl`. If PDF.js makes no `cMapUrl` call, stop: fix `chinese-unembedded.pdf` until it does. If PDF.js truly never asks, update the proposal, decision 7 and the spec delta so they no longer claim the case covers a character-map request, and bring the change back for review before building on it.
- **Second file kept**: for the page tools, Protect (with its password) and the tools that draw on pages, the result's page content still holds the original text-showing operator bytes and the font reference `STSong-Light-UniGB-UCS2-H`.

The engine-loads tests run every engine on both files with no change. The tests that name every fixture gain the two names, with each outcome measured (for example PDF to JPG's picture size of Chromium's 595.92 by 842.88 point pages).

### 7. One end-to-end addition

`uniform-requests.spec.ts` adds two inputs to `/pdf-to-jpg`'s list, each picked and run: `multilingual.pdf` and `chinese-unembedded.pdf`. The second makes PDF.js ask for a character map, the one place in the PDF.js path where a file's contents could lead to a fetch. Today the spec accepts either the done heading or the failed heading at the end of a job; these two inputs gain a field on `Input` (`expect: 'done'`) that requires the done heading, so a failed job cannot pass as "the same requests".

"No other request" rests on two mechanisms, both already in place:

- **Requests to the site's own origin**: the stand-in host (`host-log.ts`) records every request it receives, and the test fails unless the record after the pick and after the main button matches `text.pdf`'s.
- **Requests to any other origin**: the page's Content Security Policy blocks them, and `tests/e2e/fixtures.ts` fails the test on any `securitypolicyviolation` in the page or its workers.

Only this page: thumbnails on every other PDF page run the same PDF.js code with the same fixed data. About 10 seconds more on a spec that takes about 5 minutes.

### 8. Expected outcomes, to be replaced by measured ones

| Tool | Expected on `multilingual.pdf` | Expected on `chinese-unembedded.pdf` |
| --- | --- | --- |
| Reading (`inspect.ts`) | Ready, 5 pages | Ready, 1 page |
| Merge, Split, Extract, Delete, Reorder, Rotate | Text kept on every kept page; tags kept whole as decided | Text and font reference kept |
| Compress PDF | No pictures: likely "could not be made smaller"; text kept if a file is given | Likely no new file |
| PDF to JPG and PNG, thumbnails | Every page's text drawn, Chinese included | A blank page: no text drawn (character-map gap) |
| Add page numbers, Watermark, Sign PDF | Own text added, existing text kept | Same |
| Protect with a password | Encrypted, text kept with the password | Same |
| Remove a password | No new file (nothing to remove); after Protect, text back | Same |
| Image to PDF | Wrong kind (a PDF), as every PDF | Same |

Whatever the runs show goes into the README, including anything worse than expected; if a tool loses text, the change stops and says so before any tool is changed, because fixing a tool is outside this change.

### 9. Draft comment for issue #7

> **Multilingual test files** (`add-multilingual-fixture`). `tests/fixtures/multilingual.pdf` (Hindi, Telugu, Arabic, Chinese and a mixed page, fonts embedded) and `tests/fixtures/chinese-unembedded.pdf` (Chinese in a font that is not embedded) are now in the test set, and every tool is run on them in the unit tests. Still to do by hand:
>
> - [ ] Open `multilingual.pdf` itself in Chrome, Firefox, Adobe Reader and macOS Preview: each page shows its script correctly (joined Arabic, right to left; Hindi and Telugu vowel signs in place), and copying a line gives the same text.
> - [ ] A reader of each script checks its page's sentences (owner question 2 of the change).
> - [ ] Open each tool's result from `multilingual.pdf` in the same four readers: Merge (with `text.pdf`), Split, Extract, Delete, Reorder, Rotate, Compress (if it gives a file), Add page numbers, Watermark, Sign PDF, Protect (with its password) and Remove a password (after Protect). The text looks the same as in the input, and nothing warns.
> - [ ] Look at the PDF to JPG and PDF to PNG pictures and the thumbnails of `multilingual.pdf`: every script is drawn.
> - [ ] Screen reader (VoiceOver or NVDA) on Merge's and Protect's results from `multilingual.pdf` in Adobe Reader: the pages are read in their languages, as in the input.
> - [ ] `chinese-unembedded.pdf` in Adobe Reader: note whether it asks for the Asian font pack; that is the input's own prompt, not a tool's warning. In Chrome and Firefox, note whether the Chinese shows.
> - [ ] Protect with a password and Remove a password: with the steps above done, their "multilingual file" item is met.

## Threats considered

- **Font packages changed on the registry**: pinned versions, the public registry named explicitly, and SHA-512 computed by the script over the tarball before it is unpacked; the script stops on a mismatch. The packages' code is never run (`--ignore-scripts`, no shell, nothing imported), and their CSS is not read: only named `woff2` files that are regular files inside the package's own folder (decision 3).
- **The printed page fetching something**: JavaScript off, the context offline, a route that allows only files in the temporary folder, a policy meta tag, and Chromium's sandbox where available (decision 3).
- **The build machine leaking into the file**: no header or footer, and the script refuses a file holding `file:`, the temporary or home folder's path, or extra document information keys (decision 4).
- **A malicious PDF**: both files are our own, checked with `qpdf --check`. The unembedded file is a common real-world shape, not a hostile one.
- **Oversized file, hostile file name**: not applicable; nothing on the site changes.
- **Page budget and WebAssembly timing**: unchanged. No shipped file changes.

## Risks / Trade-offs

- [The sentences contain a mistake no one here can see] → plain, short sentences; a reader of each script checks them by hand (issue #7). A mistake in the words does not weaken the checks, which compare each tool's output with the input.
- [PDF.js reads Hindi, Telugu and Arabic incompletely, so a "text kept" check could pass while actual-text spans were dropped] → every tool that gives back a PDF also has its pages' own decoded content streams compared byte for byte with the input's (decision 6), and the file check counts actual-text spans.
- [A later Chromium makes different bytes] → the file is committed; the README names the versions; regeneration is only needed if the words change.
- [Noto Sans SC is a 74 MB download] → only when the file is made again, on the developer's machine; not in CI.
- [Tests that name every fixture need updating] → listed in the tasks; their purpose is exactly this.
- [CI time] → two small files across the engine tests (seconds) and two inputs on one end-to-end page (about 10 s).

## Migration Plan

Nothing to migrate. Removing the change means deleting the two files, the script, the JSON, the test and the README and `LICENSES.md` lines.
