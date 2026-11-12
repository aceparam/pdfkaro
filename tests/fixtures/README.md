# The shared test set

Every tool is run against every file here. `make.mjs` makes them, with `@cantoo/pdf-lib` and qpdf, and the files are committed so that tests do not depend on the script. To make them again, run this from the repo root:

```bash
node tests/fixtures/make.mjs
```

The encrypted files come out different on each run, because encryption uses random salt. The others come out the same.

## The files

| File | What it is | Pages |
| --- | --- | --- |
| `text.pdf` | An ordinary text document | 3 |
| `pages-500.pdf` | A 500-page document | 500 |
| `scanned.pdf` | A scanned document: each page is one image, with no text layer | 2 |
| `password.pdf` | Needs a password to open. The password is `open-sesame` | 3 |
| `restricted.pdf` | Print and edit restrictions, but no password to open it | 3 |
| `warning.pdf` | A small fault: the page tree names its page count twice. qpdf reads it and warns | 3 |
| `damaged-xref.pdf` | A cross-reference table that points to the wrong places | |
| `damaged-cut.pdf` | Cut off part way | |
| `not-a-pdf.pdf` | A text file with a `.pdf` name | |
| `form.pdf` | A fillable form: a text field `name` and a check box `agree` | 1 |
| `mixed.pdf` | Mixed page sizes and rotation: A4, Letter on its side, A5 turned a quarter, A4 upside down | 4 |
| `rich.pdf` | Two bookmarks, a link and an attached file `note.txt` | 2 |
| `images.pdf` | A JPEG 2000 image and text and shapes in CMYK colour, for PDF.js's decoders. The JPEG 2000 bytes were made once with Pillow and are kept in `make.mjs` | 1 |

**Missing:** a file with a JBIG2 image, as no JBIG2 encoder runs on the build machine. PDF.js's JBIG2 decoder is in the same fixed helper data as the JPEG 2000 one, which `images.pdf` tests.

**Missing:** a file with text in Hindi, Telugu, Arabic and Chinese, which `SPEC.md` lists. Making it needs fonts for those scripts, and none are on the build machine or in the repo. It is to be added with the first tool that reads or changes text.

**Not committed:** the file over 100 MB. `make-large.mjs` writes one outside the repo when it is needed:

```bash
node tests/fixtures/make-large.mjs
```

## What each engine does with each file

### Reading a file before the job (`src/engines/inspect.ts`)

| File | Outcome |
| --- | --- |
| `text.pdf` | Ready, 3 pages |
| `pages-500.pdf` | Ready, 500 pages |
| `scanned.pdf` | Ready, 2 pages |
| `password.pdf` | Needs a password. A wrong one gives "wrong password". `open-sesame` gives ready, 3 pages |
| `restricted.pdf` | Ready, 3 pages; no password asked for |
| `warning.pdf` | Ready, 3 pages. qpdf finishes with a warning (exit 3), which is not damage |
| `damaged-xref.pdf` | Damaged: qpdf cannot read it |
| `damaged-cut.pdf` | Damaged: qpdf cannot read it |
| `not-a-pdf.pdf` | Damaged. On the page it is turned away before this, because it does not start like a PDF |
| `form.pdf` | Ready, 1 page |
| `mixed.pdf` | Ready, 4 pages |
| `rich.pdf` | Ready, 2 pages |

### Merge PDF (`src/engines/tools/merge-pdf.ts`)

Each readable file was merged both before and after `text.pdf`. Each result passes `qpdf --check`, has the right number of pages, and is not encrypted.

| File | Outcome |
| --- | --- |
| `text.pdf` | Merged; its text is kept |
| `pages-500.pdf` | Merged, 503 pages |
| `scanned.pdf` | Merged |
| `password.pdf` | Merged when its password is given; the result has no password. Without the password the merge fails |
| `restricted.pdf` | Merged; the result has no restrictions, even when this file is first |
| `warning.pdf` | Merged; qpdf's warning does not stop the job |
| `damaged-xref.pdf` | Not merged: the job fails and hands back nothing |
| `damaged-cut.pdf` | Not merged: the job fails and hands back nothing |
| `not-a-pdf.pdf` | Not merged: the job fails and hands back nothing |
| `form.pdf` | Merged; both fields are kept, whether the form is first or later |
| `mixed.pdf` | Merged; each page keeps its size and rotation, in order |
| `rich.pdf` | First: its bookmarks, link and attachment are kept. Later: its pages and link are kept, but its bookmarks and attachment are not, by the owner's decision of 11 Nov 2026 |

### Page thumbnails (`src/engines/thumbnail.ts`)

Each was drawn in Node through the real PDF.js and `@napi-rs/canvas`, inside a 104 by 136 box (`tests/unit/thumbnail.test.ts`).

| File | Outcome |
| --- | --- |
| `text.pdf` | Drawn. Its font, Helvetica, is not embedded, so PDF.js takes `LiberationSans-Regular.ttf` from the fixed helper data |
| `pages-500.pdf` | Drawn |
| `scanned.pdf` | Drawn; the image is drawn through our canvas maker |
| `password.pdf` | Drawn with `open-sesame`; refused without it or with a wrong one |
| `restricted.pdf` | Drawn, with no password |
| `warning.pdf` | Drawn |
| `damaged-xref.pdf` | Drawn: PDF.js repairs it, though qpdf cannot read it. The page never asks, as it asks only for files qpdf has read |
| `damaged-cut.pdf` | Refused |
| `not-a-pdf.pdf` | Refused |
| `form.pdf` | Drawn |
| `mixed.pdf` | Page 1 drawn upright; page 2, on its side, drawn wide |
| `rich.pdf` | Drawn |
| `images.pdf` | Drawn. PDF.js takes `openjpeg.wasm` from the fixed helper data for the JPEG 2000 image |
