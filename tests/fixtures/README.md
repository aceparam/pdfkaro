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
| `tagged.pdf` | Page 2 holds text, an untagged form field, an accessibility tag with alternate and actual text, a named destination, a reading thread, and a filled field, a note and a web link that the tags point to, each marked `SECRET-…`, to see what a file with fewer pages still carries | 2 |

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

### Split PDF (`src/engines/tools/split-pdf.ts`)

Each file was split in Node with the same qpdf the browser uses (`tests/unit/split-pdf.test.ts`). Every part passes `qpdf --check`, has the right pages, and is not encrypted. Bookmarks and attached files follow the owner's decisions of 12 Nov 2026.

| File | Outcome |
| --- | --- |
| `text.pdf` | No cuts: three one-page parts, with progress after each |
| `pages-500.pdf` | No cuts: 500 one-page parts, each passing `qpdf --check`. Cuts after pages 9 and 10: parts of 9, 1 and 490 pages |
| `scanned.pdf` | Split, one page each |
| `password.pdf` | Split when its password is given; the parts have no password. Without the password the job fails |
| `restricted.pdf` | Split; the parts have no restrictions |
| `warning.pdf` | Split; qpdf's warning does not stop the job |
| `damaged-xref.pdf` | Not split: the job fails and hands back nothing. The page never asks, as qpdf cannot read it |
| `damaged-cut.pdf` | Not split: the job fails and hands back nothing |
| `not-a-pdf.pdf` | Not split: the job fails and hands back nothing |
| `form.pdf` | One page, so one part, which keeps both fields |
| `mixed.pdf` | Each part keeps its page's size and rotation |
| `rich.pdf` | Part 1 keeps "Chapter one", the link and `note.txt`. Part 2 keeps "Chapter two", and holds neither the attached file's bytes, nor `/EmbeddedFile`, nor `/AF` |
| `images.pdf` | Split; its JPEG 2000 image is kept as it was |

Files made in the test, for shapes the shared set lacks (`tests/unit/outline-fixtures.ts`):

| File | Outcome |
| --- | --- |
| A nested outline across four pages | Each part keeps only its own bookmarks; a kept child of a dropped parent moves up; no bookmark points nowhere |
| An outline 100 levels deep, past where qpdf's JSON stops | Nothing below qpdf's cut survives into a part, so no bookmark points into another part |
| An outline item that is also the catalog | The whole outline is dropped from every part |
| An attached file reached through a separate `/Names` object and the catalog's `/AF` | In part 1 only; part 2 holds none of its bytes and no `/AF` |

### Extract pages (`src/engines/tools/extract-pdf-pages.ts`)

Each file was extracted in Node with the same qpdf the browser uses (`tests/unit/extract-pdf-pages.test.ts`). Every result passes `qpdf --check`, holds the chosen pages in page order, and is not encrypted. Bookmarks, attached files and hidden text follow the owner's decisions of 13 Nov 2026.

| File | Outcome |
| --- | --- |
| `text.pdf` | Pages 1 and 3: a two-page file, with progress at 0 and 100 |
| `pages-500.pdf` | Seven scattered pages: a seven-page file. A list of 20,000 pages, over 64 KB, reaches qpdf through an argument file |
| `scanned.pdf` | Page 2 taken |
| `password.pdf` | Taken when its password is given; the result has no password. Without the password the job fails |
| `restricted.pdf` | Taken; the result has no restrictions |
| `warning.pdf` | Pages 1 and 3 taken; qpdf's warning does not stop the job |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | Not taken: the job fails and hands back nothing |
| `form.pdf` | Its page keeps the field `name` |
| `mixed.pdf` | Pages 2 and 3 keep their size and rotation |
| `rich.pdf` | Page 2 keeps "Chapter two" and `note.txt`; no bookmark points nowhere |
| `images.pdf` | Taken; its JPEG 2000 image is kept as it was |
| `tagged.pdf` | Page 1 taken: page 2's text and untagged field are gone; its tag text, destination name, thread title, and the tagged field with its value, the tagged note and the tagged link stay, as the page says |

Files made in the test: a nested outline keeps the bookmarks of chosen pages, moved up past dropped parents, and a file of 3,000 bookmarks keeps the 1,500 of the chosen page. The file over 100 MB from `make-large.mjs` (one page, 110 MB) was run by hand in Node on 13 Nov 2026: its page was taken and the result written. It is not run in CI.

### Delete pages (`src/engines/tools/delete-pdf-pages.ts`)

Each file was run in Node with the same qpdf the browser uses (`tests/unit/delete-pdf-pages.test.ts`). Every result passes `qpdf --check`, holds the pages left in page order, and is not encrypted. Bookmarks, attached files and hidden text follow the owner's decisions of 13 Nov 2026. Delete writes through the same `keepPages` step as Extract pages.

| File | Outcome |
| --- | --- |
| `text.pdf` | Page 2 deleted: pages 1 and 3 left, in order, with progress at 0 and 100. All three marked: refused |
| `pages-500.pdf` | Every other page deleted: the 250 even pages left, in order |
| `scanned.pdf` | Page 1 deleted |
| `password.pdf` | Deleted when its password is given; the result has no password. Without the password the job fails |
| `restricted.pdf` | Deleted; the result has no restrictions |
| `warning.pdf` | Page 2 deleted; qpdf's warning does not stop the job |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | Not deleted: the job fails and hands back nothing |
| `form.pdf`, `images.pdf` | One page each, so deleting it would leave none: refused, and the page holds the main button back |
| `mixed.pdf` | Pages 1 and 4 deleted: pages 2 and 3 keep their size and rotation |
| `rich.pdf` | Page 1 deleted: "Chapter two" and `note.txt` kept, the link went with page 1, no bookmark points nowhere. Page 2 deleted: page 1 keeps its link |
| `tagged.pdf` | Page 2 deleted: its text and untagged field are gone; its tag text, destination name, thread title, and the tagged field with its value, the tagged note and the tagged link stay, as the page says |

Files made in the test: a nested outline keeps the bookmarks of the pages left, moved up past dropped parents; a 500-page file with 3,000 bookmarks keeps the 2,970 of the 495 pages left; and a two-page file of 3,000 bookmarks keeps the 1,500 of the page left.

The file over 100 MB from `make-large.mjs` has one page, so Delete refuses it and it was not run, as it refuses any one-page file; Extract's hand run covers reading that file. The 120,000-page file from `make-many-pages.mjs` with every other page marked, a page list of about 400 KB, did not finish within 10 minutes in Node when the security reviewer ran it at stage 1: the list reaches qpdf, but qpdf selects pages slowly from a file that large. The page warns above 20,000 pages, and Cancel ends the job. The multilingual file is still missing.

### Reorder pages (`src/engines/tools/rearrange-pdf-pages.ts`)

Each file was run in Node with the same qpdf the browser uses (`tests/unit/rearrange-pdf-pages.test.ts`). Every result passes `qpdf --check`, holds every page in the order sent, and is not encrypted. Reorder writes through `writePages` with no outline update, so the file's bookmarks and other document-level parts are left as they were.

| File | Outcome |
| --- | --- |
| `text.pdf` | Order 3, 1, 2: the pages in that order, with progress at 0 and 100. Order unchanged: the pages in place |
| `pages-500.pdf` | Reversed: 500 pages, last to first, through the argument file with no runs joined |
| `scanned.pdf`, `warning.pdf` | Reordered; qpdf's warning does not stop the job |
| `password.pdf` | Reordered when its password is given; the result has no password. Without the password the job fails |
| `restricted.pdf` | Reordered; the result has no restrictions |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | Not reordered: the job fails and hands back nothing |
| `form.pdf`, `images.pdf` | One page each: written in its only order, keeping the field and the JPEG 2000 image |
| `mixed.pdf` | Reversed: each page keeps its size and rotation in its new place |
| `rich.pdf` | Swapped: "Chapter one" points to its page, now second, and "Chapter two" to the first; the outline keeps its order; `note.txt` and the link are kept |
| `tagged.pdf` | Swapped: everything is kept, page 2's text now first |

Files made in the test: a nested outline keeps every bookmark, each pointing to its page in its new place; a heading that points to no page is kept with its child; an outline 100 levels deep keeps every level; and an outline item that points back at the catalog is not dropped. Orders that leave out, repeat or add a page are refused.

The file over 100 MB from `make-large.mjs` has one page, so its only order is the one it has; Extract's hand run covers reading it. The multilingual file is still missing.

### Rotate PDF (`src/engines/tools/rotate-pdf.ts`)

Each file was run in Node with the same qpdf the browser uses (`tests/unit/rotate-pdf.test.ts`). Every result passes `qpdf --check`, keeps every page, and is not encrypted. Turns are read back through the page tree and normalised as PDF.js draws them. Only each page's `/Rotate` changes.

| File | Outcome |
| --- | --- |
| `text.pdf` | Page 2 a quarter right and page 3 half round, its text unchanged, with progress at 0 and 100. Every page left: 270 each |
| `pages-500.pdf` | Every other page a quarter right; the result is no bigger than the input |
| `scanned.pdf`, `warning.pdf`, `images.pdf` | Turned; qpdf's warning does not stop the job |
| `password.pdf` | Turned when its password is given; the result has no password. Without the password the job fails |
| `restricted.pdf` | With nothing turned: the pages as they were, with no restrictions (the page holds the main button back in this case) |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | Not turned: the job fails and hands back nothing |
| `form.pdf` | Turned; its field kept |
| `mixed.pdf` | A turn adds to the one each page already has: every page right gives 90, 90, 180, 270; page 4 half round brings it upright |
| `rich.pdf` | Page 1 turned: bookmarks, link and `note.txt` kept |
| `tagged.pdf` | Every page half round: everything kept |

Files made in the test, for turns already in a file (the security reviewer, stage 1): pages whose `/Rotate` is 45, -90, 450 and 135 read as 0, 270, 90 and 0, as PDF.js draws them, and turned right give 90, 0, 180 and 90; a turn inherited from the page tree is added to. Each result matches the turned thumbnail. Orders that are not valid are refused.

The file over 100 MB from `make-large.mjs` has one page; turning it was not run by hand, as Extract's hand run covers reading it and the job writes only that page's turn. The multilingual file is still missing.

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

### One open document across pages (`openDocument` in `src/engines/thumbnail.ts`)

Each file was opened once, then its first, second and last pages were drawn from that one open document inside a 104 by 136 box, in Node through the real PDF.js. After `close`, called twice, every file refused to draw again.

| File | Outcome |
| --- | --- |
| `text.pdf` | Opened, 3 pages; all drawn |
| `pages-500.pdf` | Opened, 500 pages; pages 1, 2 and 500 drawn from the one document |
| `scanned.pdf` | Opened, 2 pages; both drawn |
| `password.pdf` | Refused without a password or with a wrong one (PDF.js's password error); opened with `open-sesame`, 3 pages drawn |
| `restricted.pdf` | Opened with no password, 3 pages drawn |
| `warning.pdf` | Opened, 3 pages drawn |
| `damaged-xref.pdf` | Opened and drawn, as for one-off thumbnails: PDF.js repairs it. The page never asks, as qpdf cannot read it |
| `damaged-cut.pdf` | Refused (invalid PDF structure) |
| `not-a-pdf.pdf` | Refused (invalid PDF structure) |
| `form.pdf` | Opened, 1 page drawn |
| `mixed.pdf` | Opened, 4 pages; page 1 drawn upright, page 2 on its side drawn wide (104 by 80), page 4 drawn |
| `rich.pdf` | Opened, 2 pages drawn |
| `images.pdf` | Opened, 1 page drawn, with the JPEG 2000 image |
