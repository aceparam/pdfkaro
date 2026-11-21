# The shared test set

Every tool is run against every file here. `make.mjs` makes them, with `@cantoo/pdf-lib` and qpdf, and the files are committed so that tests do not depend on the script. To make them again, run this from the repo root:

```bash
node tests/fixtures/make.mjs
```

The encrypted files (`password.pdf`, `restricted.pdf`, `compress-password.pdf`) come out different on each run, because encryption uses random salt. The others come out the same.

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

### For Compress PDF

`make.mjs` makes these too, in section 15. Pictures go in by hand, as image streams with exactly the dictionary each case needs.

| File | What it is | Pages |
| --- | --- | --- |
| `compress-scans.pdf` | Three A4 scans at 300 pixels to the inch (2480 by 3508): an RGB JPG carrying the EXIF of `pictures/details.jpg` (camera maker and model, a GPS place, each `SECRET-…`), the grey JPG `pictures/grey-scan.jpg` (`/DeviceGray`), and an RGB picture stored without loss with a PNG predictor (`/Predictor 15`) | 3 |
| `compress-lossless.pdf` | A screenshot of 2560 by 1440 stored without loss (`/FlateDecode`, no predictor) on an A4 page | 1 |
| `compress-small-jpg.pdf` | A JPG that is already small (600 by 400, quality 50), and 40 lines of text in a content stream that was never compressed | 1 |
| `compress-kinds.pdf` | Pages of 72 by 72 points, so 150 pixels is the most a picture needs. Pictures left alone: a CMYK JPG (`pictures/cmyk.jpg`), a CCITT Group 4 scan (the strip of `pictures/scan-g4.tif`), an image mask, a picture with a colour-key mask, a grey picture with a grey ICC profile, and a picture whose soft mask has `/Matte`. One made smaller: a 400 by 400 picture with an RGB ICC profile (`p3.icc`), a soft mask and `/Interpolate` | 7 |
| `compress-text.pdf` | Text only, in content streams that were never compressed | 3 |
| `compress-packed.pdf` | `text.pdf` written by qpdf with the options Compress PDF writes with, so it cannot be made 1% smaller | 3 |
| `compress-bomb-attachment.pdf` | A page of text with an attached file `zeros.bin` whose compressed data (1 MB) inflates to 1 GB | 1 |
| `compress-flate-bomb.pdf` | A picture whose dictionary says 400 by 400 RGB stored without loss, and whose data inflates to 100 MB | 1 |
| `compress-jpeg-mismatch.pdf` | Two JPGs whose own header disagrees with their dictionary: 100 by 100 RGB over a whole JPG of 400 by 300, and 200 by 100 RGB over `cmyk.jpg` (four colours). A JPG frame of 20,000 by 20,000 under a 100 by 100 dictionary is made in the unit test instead, as qpdf's own check refuses it | 2 |
| `compress-json-bomb.pdf` | 5,000 objects, each a string of 14,000 characters, packed by qpdf into a file of 140 KB whose JSON of dictionaries is about 70 MB; and a 400 by 400 picture it would make smaller if it read that JSON | 1 |
| `compress-password.pdf` | A 1200 by 1200 photo (JPG) on a page of 288 by 288 points, in a file that needs the password `open-sesame`, printing at low quality only. Its encryption comes out different on each run | 1 |

## The pictures, in `pictures/`

For Image to PDF. `make.mjs` makes them too: each JPG and PNG is drawn with `@napi-rs/canvas`, and the parts that carry details (EXIF, XMP, IPTC, comments, thumbnails, colour profiles, PNG text chunks) are written by hand, each with a marker text starting `SECRET-` that the tests look for in the PDF. `make.mjs` writes everything to the folder given as its argument, so to make the pictures alone without changing the encrypted PDFs, run it into a scratch folder and copy `pictures/` back.

Two pictures were made once with Pillow 12 (Python) and are committed; `make.mjs` reads `progressive.jpg` but never writes either:

```python
from PIL import Image, ImageDraw
im = Image.new('CMYK', (200, 100), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rectangle([0, 0, 99, 49], fill=(255, 0, 0, 0))
d.rectangle([100, 0, 199, 49], fill=(0, 255, 0, 0))
d.rectangle([0, 50, 99, 99], fill=(0, 0, 255, 0))
d.rectangle([100, 50, 199, 99], fill=(0, 0, 0, 200))
im.save('cmyk.jpg', 'JPEG', quality=95)
g = Image.new('RGB', (320, 240))
g.putdata([(x * 255 // 319, y * 255 // 239, 128) for y in range(240) for x in range(320)])
g.save('progressive.jpg', 'JPEG', quality=90, progressive=True)
```

Two more were made once with Pillow 12.3 for Compress PDF, and are committed; `make.mjs` reads both and never writes either:

```python
from PIL import Image, ImageDraw
w, h = 2480, 3508
g = Image.new('L', (w, h), 236)
d = ImageDraw.Draw(g)
for row in range(40):
    y = 300 + row * 75
    for word in range(12):
        x = 250 + word * 165
        d.rectangle([x, y, x + 120 - (row * 7 + word * 13) % 50, y + 28], fill=60 + (row * 3 + word) % 40)
d.rectangle([250, 120, 1600, 200], fill=30)
g.save('grey-scan.jpg', 'JPEG', quality=85)
b = Image.new('1', (800, 600), 1)
db = ImageDraw.Draw(b)
for row in range(12):
    db.rectangle([60, 40 + row * 45, 700 - (row * 37) % 200, 60 + row * 45], fill=0)
b.save('scan-g4.tif', 'TIFF', compression='group4')
```

| File | What it is |
| --- | --- |
| `grey-scan.jpg` | A grey A4 scan at 300 pixels to the inch, 2480 by 3508, one colour component (Pillow) |
| `scan-g4.tif` | A 1-bit scan of 800 by 600 in CCITT Group 4, one strip (Pillow) |
| `tall.jpg`, `wide.jpg` | Photo-like scenes, 1500 by 2000 and 2000 by 1500, each with the sRGB profile `@napi-rs/canvas` adds |
| `screenshot.png` | A wide screenshot-like picture, 1280 by 720 |
| `turn-1.jpg` to `turn-8.jpg` | Every EXIF camera turn. Once turned, each shows the same 160 by 100 picture: red top-left, green top-right, blue bottom-left, yellow bottom-right |
| `turn-6.png` | The same, turned a quarter by a PNG `eXIf` chunk |
| `details.jpg` | Marker texts in EXIF (camera maker and model, and a GPS directory with a latitude and a place), XMP, extended XMP, IPTC, a comment, APP0 with a JFIF thumbnail and a JFXX thumbnail, APP11, APP15 and an MPF segment; after its end, a second JPG with GPS in its EXIF, then plain trailing bytes |
| `details-progressive.jpg` | `progressive.jpg` with an APP9 segment between its first and second scans |
| `cmyk.jpg` | CMYK with an Adobe segment (Pillow): cyan, magenta, yellow and grey blocks |
| `progressive.jpg` | A progressive JPG (Pillow) |
| `p3.icc` | A Display P3 profile made by hand (version 4), with marker texts in its description, copyright and device name tags, a creation date (2019-12-25 10:20:30) and maker, model, creator and profile ID fields. littleCMS (Pillow's ImageCms) reads it |
| `p3.jpg` | Vivid red and green, with `p3.icc` split over two APP2 chunks |
| `bad-profile.jpg`, `bad-profile.png` | `p3.icc` whose own size disagrees with its bytes |
| `profile.png` | `p3.icc` in an `iCCP` chunk |
| `bomb-profile.png` | An `iCCP` chunk that inflates to 5 MB |
| `grey-profile.png` | A greyscale PNG with a grey `iCCP` profile |
| `alpha.png` | 8-bit RGBA with see-through and half see-through parts |
| `palette.png`, `grey16.png`, `animated.png` | A palette PNG, 16-bit grey, and an animated PNG whose default picture is red and second frame blue |
| `details.png` | Marker texts in `tEXt`, `iTXt`, `zTXt` and `eXIf` (camera and GPS) |
| `small.png` | 300 by 200 |
| `huge.png` | Claims 16,000 by 16,000 pixels of grey, all zero; 243 KB |
| `huge.jpg` | A JPG header that claims 16,000 by 16,000 pixels, with no real picture data |
| `text-bomb.png` | A 1 by 1 PNG of 20 KB whose `zTXt` chunk inflates to 20 MB |
| `data-bomb.png` | A 1 by 1 PNG of 20 KB whose image data (IDAT) inflates to 20 MB |
| `arithmetic.jpg` | An arithmetic-coded JPG header (SOF9) |
| `broken.jpg`, `broken.png`, `zero-size.png` | A JPG cut off half way, a PNG with a chunk longer than the file, and a PNG whose width is 0 |

**Not committed:** a picture set over 100 MB. The end-to-end test writes one (`tall.jpg` with 1,900 comment segments, about 124 MB) to the system's temporary folder.

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

Files made in the test, for turns already in a file (the security reviewer, stage 1): pages whose `/Rotate` is 45, -90, 450 and 135 read as 0, 270, 90 and 0, as PDF.js draws them, and turned right give 90, 0, 180 and 90; a turn inherited from the page tree is added to. Each result matches the turned thumbnail. Turns that are not valid are refused.

The file over 100 MB from `make-large.mjs` (one page, 110,124,572 bytes) was turned a quarter by hand in Node on 14 Nov 2026: 110,124,059 bytes out, in about 2.2 seconds. The multilingual file is still missing.

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

### Image to PDF (`src/engines/tools/images-to-pdf.ts`)

Each picture was converted in Node with the same pdf-lib the browser gets (`tests/unit/images-to-pdf.test.ts`). Every result passes `qpdf --check`, has one A4 page per picture, no `/Info`, no `/Metadata` and no XMP, and no marker text, GPS value or profile date anywhere once its object streams are undone and its streams decoded.

| File | Outcome |
| --- | --- |
| `tall.jpg`, `wide.jpg` | One page, A4 upright and on its side; the picture touches two edges. The JPG's own data, from its start to its end, is the image (`/DCTDecode`); its sRGB profile's colour data is kept as `/ICCBased` |
| `screenshot.png`, `small.png` | Pixels kept exactly. `small.png` is drawn 225 by 150 points, not enlarged |
| `turn-1.jpg` to `turn-8.jpg`, `turn-6.png` | A4 on its side; drawn by PDF.js, each corner has the colour a browser shows there |
| `details.jpg`, `details-progressive.jpg`, `details.png` | Converted; none of the marker texts, GPS values, thumbnails, the second picture or the trailing bytes is in the PDF |
| `cmyk.jpg` | `/DeviceCMYK` with `/Decode [1 0 1 0 1 0 1 0]`; drawn by PDF.js with the same colours as the plain decoder, allowing for PDF.js's ink curve. Without its Adobe segment, the decode array is left out |
| `progressive.jpg` | Converted, as its own data |
| `p3.jpg`, `profile.png` | `/ICCBased` with `/N 3` and `/Alternate /DeviceRGB`, holding only the profile's colour tags, a plain description and an empty copyright; no profile text, date or device field |
| `bad-profile.jpg`, `bad-profile.png`, `bomb-profile.png` | Converted, as `/DeviceRGB`, with no profile |
| `grey-profile.png` | Stored as RGB with no profile; passes `qpdf --check` |
| `alpha.png` | RGB and a `/DeviceGray` soft mask, both exact; see-through parts show the white page |
| `palette.png` | Stored as RGB, exact |
| `grey16.png` | Stored as 8-bit RGB: the high byte of each value |
| `animated.png` | Its default (red) picture only |
| `huge.png` | Read as ready, one page, with its 256 million pixels for the notice; its image data is counted (it fits its header) but never decoded by the tests or for a thumbnail |
| `huge.jpg` | Read as ready, one page, with no notice; never decoded for a thumbnail. Not converted in the tests, as it holds no real picture data |
| `text-bomb.png` | Ready; converted, and pdf-lib is given the picture with no `zTXt` chunk |
| `data-bomb.png` | Damaged before the job: its image data passes what its header allows after the first few kilobytes, and counting stops there. The job fails without pdf-lib being given it |
| `arithmetic.jpg` | Unsupported before the job; the job fails if it is run |
| `broken.jpg`, `broken.png`, `zero-size.png` | Damaged before the job; the job fails if it is run |
| Every PDF in the test set | Damaged if read; on the page each is turned away by its first bytes before that ("… is not a JPG or PNG picture") |

The multilingual file does not apply: pictures carry no text the tool reads.

### Picture thumbnails (`src/engines/picture-thumbnail.ts`)

Drawn in Node with `@napi-rs/canvas` in place of the worker's `createImageBitmap` (`tests/unit/picture-thumbnail.test.ts`); the camera turn in a real browser is checked by the end-to-end test.

| File | Outcome |
| --- | --- |
| `tall.jpg`, `wide.jpg`, `alpha.png`, `palette.png`, `cmyk.jpg`, `p3.jpg`, `screenshot.png` | Drawn inside the box, decoded once |
| `turn-6.jpg` | Sized from its shown size: 104 by 65 |
| `huge.png`, `huge.jpg` | Not drawn, and never decoded |
| `broken.jpg`, `broken.png`, `zero-size.png`, `arithmetic.jpg` | Not drawn, and never decoded |

### Compress PDF (`src/engines/tools/compress-pdf.ts`)

Each file was compressed in Node with the same qpdf the browser uses (`tests/unit/compress-pdf.test.ts`), with `@napi-rs/canvas` decoding and encoding JPGs in place of the browser. Every result passes `qpdf --check` (with the password for `password.pdf`), has the same pages, and is at most 99% of the input; otherwise the engine gives no file and the page says the file could not be made smaller. Sizes in bytes, from a run on 16 Nov 2026; JPG sizes depend on the encoder, so the browser's differ a little.

| File | Before | After | Outcome |
| --- | --- | --- | --- |
| `text.pdf` | 6,057 | 3,441 | Written again in object streams; text kept |
| `pages-500.pdf` | 198,025 | 101,461 | 500 pages kept |
| `scanned.pdf` | 6,191 | 4,442 | Its two pictures (300 by 424) are not too large for A4, so they are left alone |
| `password.pdf` | 7,178 | 4,192 | With its password: the result asks for the same password, with the same encryption and restrictions. Without it, the job fails |
| `restricted.pdf` | 7,181 | 4,195 | Opens with no password and keeps its restrictions |
| `warning.pdf` | 6,057 | 3,441 | qpdf's warning does not stop the job |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | | | Not compressed: the job fails and hands back nothing |
| `form.pdf` | 3,189 | 2,651 | Both fields kept, and the value `Sample text` |
| `mixed.pdf` | 2,257 | 1,590 | Sizes and turns kept |
| `rich.pdf` | 2,064 | 1,676 | Bookmarks, link, `note.txt` and the title kept |
| `images.pdf` | 1,642 | 1,543 | The JPEG 2000 picture byte for byte as it was |
| `tagged.pdf` | 5,118 | 2,523 | Everything kept: text, tags, destination, thread, the tagged field and its value, note and link |
| `compress-scans.pdf` | 634,679 | 237,481 | Each scan scaled to 1240 by 1754 (150 to the inch across A4's 841.89 points): both JPGs saved again at quality 75 as RGB JPGs (the grey one too, and its pixels still draw grey), the lossless one stored with `/FlateDecode` and no predictor. No EXIF or marker is left. Drawn by PDF.js, each page differs from before by a mean of under 4 in 255. Progress: "Reading the file", "Picture 1 of 3" to "Picture 3 of 3", then writing from 75% |
| `compress-lossless.pdf` | 16,884 | 8,770 | The screenshot scaled to 1754 by 987 and stored without loss again; drawn by PDF.js it looks as before |
| `compress-small-jpg.pdf` | 12,852 | 8,774 | Its text compressed. Whether its JPG is saved again depends on the encoder (the 10% rule); in Chromium the end-to-end test finds it byte for byte as it was |
| `compress-kinds.pdf` | 41,034 | 28,494 | The CMYK JPG and the CCITT scan byte for byte; the image mask, the colour-key picture, the grey ICC picture and the `/Matte` pair decoded byte for byte, with the same dictionaries (qpdf compresses their data again, without loss). The RGB ICC picture scaled to 150 by 150, keeping its profile, `/Interpolate` and soft mask, which stays 400 by 400 |
| `compress-text.pdf` | 21,019 | 2,391 | Its content streams compressed; text kept |
| `compress-packed.pdf` | 3,441 | none | Could not be made smaller |
| `compress-bomb-attachment.pdf` | 1,045,278 | none | The pictures step reads no attachment; qpdf compresses its 1 GB again a piece at a time, in about 6 seconds, and the result is not smaller |
| `compress-flate-bomb.pdf` | 103,018 | none | Inflating the picture stops just past the 480,000 bytes it should hold; it is left alone |
| `compress-jpeg-mismatch.pdf` | 15,014 | 14,774 | Neither JPG is decoded; both byte for byte. The 20,000 by 20,000 frame made in the test is never decoded either, and that job fails at `qpdf --check`, which the file itself fails |
| `compress-json-bomb.pdf` | 140,759 | none | qpdf's JSON of dictionaries is refused at 64 MB while it is written, so qpdf stops there, nothing is parsed and the pictures step is skipped (its picture stays 400 by 400); the file is still written again, in about 17 seconds in Node, and is not smaller |
| `compress-password.pdf` | 36,730 | 12,707 | With its password: the photo scaled to 600 by 600 (150 to the inch across 4 inches), and the result asks for the same password with the same encryption and restrictions. Without it, the job fails |

The file over 100 MB from `make-large.mjs` (one page and 105 MB of random bytes attached, 110,124,572 bytes) was compressed by hand in Node on 16 Nov 2026: it could not be made smaller, in about 4 seconds. It is not run in CI. The multilingual file is still missing.

### PDF to JPG and PDF to PNG (`src/engines/tools/pdf-to-images.ts`)

Each file was converted in Node through the real PDF.js and the same fixed helper data the browser gets, with `@napi-rs/canvas` drawing and encoding in place of the worker's `OffscreenCanvas` (`tests/unit/pdf-to-images.test.ts`). Every picture is checked by its first bytes and decoded; each page is drawn at 150 pixels to the inch of its own size (an A4 page is 1240 by 1754), turned by its `/Rotate`, on white, with progress "Page n of m" for each page. Sizes in bytes are the pictures added up, from a run on 16 Nov 2026; the browser's encoders give other sizes.

| File | Pictures | PNG | JPG | Outcome |
| --- | --- | --- | --- | --- |
| `text.pdf`, `warning.pdf` | 3, A4 | 1,252,608 | 793,787 | Drawn; each matches its thumbnail scaled down. qpdf's warning on `warning.pdf` does not stop the job |
| `pages-500.pdf` | 500, A4 | 10,026,225 | 9,099,672 | Drawn in about 38 seconds (PNG) and 13 seconds (JPG) in Node. In Chromium on 16 Nov 2026 the zips were 27.5 MB (PNG, in about 7.5 seconds) and 8.7 MB (JPG, about 10 seconds); with the pictures and the zip's copy held together, the PNG job's peak is about twice that, about 55 MB, far below the 1 GB stop. The page blocks for no more than 100 ms at a time (`performance.spec.ts`) |
| `scanned.pdf` | 2, A4 | 78,035 | 427,218 | Drawn |
| `password.pdf` | 3, A4 | 1,252,608 | 793,787 | Drawn with `open-sesame`; without it, or with a wrong one, the job fails |
| `restricted.pdf` | 3, A4 | 1,252,608 | 793,787 | Drawn with no password |
| `damaged-xref.pdf` | | | | Damaged before the job, as qpdf cannot read it, so the page never runs it. PDF.js alone would repair it and draw three pages |
| `damaged-cut.pdf`, `not-a-pdf.pdf` | | | | Damaged before the job; the job fails if it is run (PDF.js: invalid PDF structure) |
| `form.pdf` | 1, A4 | 22,018 | 21,487 | The field `name` is drawn with `Sample text` |
| `mixed.pdf` | 4 | 66,142 | 61,295 | 1240 by 1754; 1650 by 1275 (Letter on its side); 1240 by 875 (A5 turned a quarter, its label down the right-hand side); 1240 by 1754 (upside down) |
| `rich.pdf` | 2, A4 | 40,245 | 37,042 | Drawn; the link cannot be clicked in a picture |
| `images.pdf` | 1, A4 | 25,041 | 38,566 | Drawn, with the JPEG 2000 picture and the CMYK colours |
| `tagged.pdf` | 2, 625 by 625 | 24,823 | 24,416 | Drawn. In the browser, its PNGs hold only picture chunks and colour notes (IHDR, IDAT, IEND, sRGB, gAMA, iCCP, cHRM, pHYs), its JPGs only the segments that draw the picture with APP0 and APP2, and neither holds a `SECRET-` marker (end-to-end test, an allowlist) |
| `compress-scans.pdf` | 3, A4 | 257,581 | 330,769 | Drawn |
| `compress-lossless.pdf`, `compress-small-jpg.pdf`, `compress-text.pdf`, `compress-packed.pdf` | 1, 1, 3, 3, A4 | | | Drawn |
| `compress-kinds.pdf` | 7, 150 by 150 | 16,120 | 29,607 | Drawn, every kind of picture it holds |
| `compress-bomb-attachment.pdf` | 1, A4 | 22,911 | 20,589 | Drawn; the 1 GB attachment is never read |
| `compress-flate-bomb.pdf` | 1, 150 by 150 | 493 | 908 | Drawn in about half a second; PDF.js decodes the picture within its own 16 million pixel cap |
| `compress-jpeg-mismatch.pdf` | 2, 75 by 75 | 4,385 | 4,127 | Drawn |
| `compress-json-bomb.pdf` | 1, 150 by 150 | 2,253 | 8,998 | Drawn in under 0.1 seconds |
| `compress-password.pdf` | 1, 600 by 600 | 35,946 | 16,263 | Drawn with `open-sesame` |

Files made in the test:

| File | Outcome |
| --- | --- |
| A page of 100 by 100 inches | 4096 by 4096, not 15000 by 15000 |
| A page of 50 by 100 inches | 2896 by 5793, under 16,777,216 pixels |
| 1,000 poster pages sharing one drawing (a small file) | Stopped by the cap on what one job makes (made small in the test; 1 GB on the page) after the fourth page, with `TooManyPictures`, sorted as `too-many-pictures` and its own sentence |
| A page whose drawing sits in four nested knockout groups | Refused by the canvas budget (four times the picture's pixels) at 150 by 150; the job fails with the engine sentence. One group draws |
| 30 pages, each painting one full-page image mask twice, which PDF.js caches and drops without destroying | All 30 drawn under a cap of 150 by 150: every canvas counted for a drawing is forgotten once it settles. Before this fix the budget refused the file part way at this cap; the stage 2 review found the same at the real cap, around page 30 |
| A stand-in PDF.js that claims 70,000 pages | Refused before any page is drawn: more files than one zip holds |
| A stand-in PDF.js worker that stops while a page is drawn | The job fails at once with "PDF.js stopped.", not left on "Page 1 of 3" |

The file over 100 MB from `make-large.mjs` (one page, 110,124,572 bytes) was converted by hand in Node on 16 Nov 2026: one picture, 26,341 bytes as PNG and 23,552 as JPG, in under half a second each. It is not run in CI.

The multilingual file is still missing, so Chinese, Japanese and Korean text cannot be checked against the test set. PDF.js draws none of the text in a font whose named character map it cannot load, whether or not the font is embedded, and the fixed helper data holds no character maps; the page text says such text may be missing.

### Add page numbers (`src/engines/tools/add-page-numbers.ts`, with `src/engines/stamp.ts`)

Each file was numbered in Node with the same qpdf and pdf-lib the browser gets (`tests/unit/add-page-numbers.test.ts`), and each result read back by qpdf and by PDF.js's legacy build. Every result passes `qpdf --check`, has the same pages, is not encrypted, and each page's text through PDF.js is its text as before followed by its number. Each page's own content streams are kept unchanged between a shared `q` and `Q`, and its stored turn, boxes and user unit are as they were. Sizes in bytes, from a run on 21 Nov 2026, at "Bottom centre".

| File | Before | After | Outcome |
| --- | --- | --- | --- |
| `text.pdf`, `warning.pdf` | 6,057 | 4,821 | Numbered 1 to 3, each centred across the bottom; progress "Reading the file", "Page 1 of 3" to "Page 3 of 3", then writing from 75% to 95%, and 100 once checked. qpdf's warning does not stop the job |
| `pages-500.pdf` | 198,025 | 267,447 | Page 500 shows 500; about 140 bytes a page |
| `scanned.pdf` | 6,191 | 6,944 | Numbered: the number is the only text on each page |
| `password.pdf` | 7,178 | 4,858 | With `open-sesame`: numbered, with no password and no restrictions. Without it, or with a wrong one, the job fails |
| `restricted.pdf` | 7,181 | 4,858 | Numbered, with no restrictions |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | | | Not numbered: the job fails and hands back nothing |
| `form.pdf` | 3,189 | 3,262 | Both fields kept, with the value `Sample text` |
| `mixed.pdf` | 2,257 | 3,431 | At each of the six places, every page's number sits within 2% of where `numberPlace` puts it on the page as PDF.js shows it, upright: A4, Letter on its side, A5 turned a quarter and A4 upside down |
| `rich.pdf` | 2,064 | 2,628 | Bookmarks "Chapter one" and "Chapter two" pointing to their pages, the link and `note.txt` kept |
| `images.pdf` | 1,642 | 2,168 | Numbered; the JPEG 2000 picture kept |
| `tagged.pdf` | 5,118 | 3,456 | Tags, destination, thread, the tagged field and its value, note and link kept; every page's own streams unchanged; PDF.js still resolves its tags, and the number is in an `/Artifact`, in no tag |
| `compress-scans.pdf`, `compress-lossless.pdf`, `compress-kinds.pdf`, `compress-small-jpg.pdf`, `compress-text.pdf`, `compress-packed.pdf`, `compress-flate-bomb.pdf`, `compress-jpeg-mismatch.pdf` | | | Numbered; pictures are not read. `compress-text.pdf` (21,019 to 3,694) and `compress-small-jpg.pdf` (12,852 to 9,404) come out smaller, as qpdf compresses their uncompressed streams |
| `compress-bomb-attachment.pdf` | 1,045,278 | 1,045,480 | Numbered in about 0.3 seconds; the 1 GB attachment is copied as stored and never inflated |
| `compress-password.pdf` | 36,730 | 36,569 | With `open-sesame`: numbered, with no password |
| `compress-json-bomb.pdf` | 140,759 | | Not numbered: its JSON of dictionaries is refused at 64 MB while qpdf writes it, so the pages cannot be read, and the job fails with the engine's sentence after about 15 seconds in Node |

Files made in the test (`tests/unit/stamp.test.ts`):

| File | Outcome |
| --- | --- |
| 20 pages with odd turns and boxes: turns of 0, 90, 180, 270, -90, 450 and 45; a paper box offset, reversed and missing; a crop box smaller, of no area and off the paper; a trim box smaller than the crop box; user units of 2, 0 and -2; a quarter and a three-quarter turn with an offset crop box and a user unit of 2; content that leaves a `q` open after a scaling `cm` and a green fill | A red mark drawn at the bottom centre of each layer is found by PDF.js within 2% of the bottom centre of the page as shown; no stored turn, box or user unit changed |
| A turn inherited from the page tree | The mark at the bottom centre of the page turned a quarter |
| A page whose `/XObject` already names `/PDFkaro` and `/PDFkaro1` | The layer goes in as `/PDFkaro2`; the other resources are kept |
| A page with text tied to tags by `/MCID 0` and an `/MCR` for `/MCID 1` | Both ids still in the page's own unchanged streams, `/StructParents` kept, PDF.js finds "Hello tagged" and "Second part" from their tags |
| 6,000 pages that share one tiny content stream (packed by qpdf) | Numbered in about 3.5 seconds, in three pdf-lib documents of at most 2,000 pages, under 300 bytes a page more; every page still draws the one shared stream |
| 2,000 pages that inherit one /Resources of about 56 KB, with its /XObject behind a reference (packed by qpdf, 20,882 bytes) | Stopped with `OutputLimit` (`output-limit`, "The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it.") before any layer is drawn, in about half a second |
| `pages-500.pdf` written with a cap of 20,000 bytes on the new file | Stopped with `OutputLimit`. qpdf finishes with exit 0 and a cut-off file when a write is refused while it writes object streams, so the capped file's own record (`Qpdf.refused`) is asked |

Measured with the memory order of the design's section 6: the reading qpdf let go before the stamping qpdf is made, and the JavaScript plain copy let go once the stamping qpdf holds it. In Node, each file in a process of its own, with qpdf and pdf-lib loaded first on `text.pdf`; peak is the process's highest resident memory, which includes the test runner's own (about 0.14 GB here). The design's experiment was run again in the same conditions for comparison (its own process, without a test runner, about 0.05 GB). In Chromium, the built page through Playwright, from pressing the main button to the result, with the resident memory of every browser process added up and sampled every 0.2 seconds; its baseline was about 0.5 GB.

| File | In | Out | Node: time (read, draw, write and check) | Node: peak | Experiment again: time, peak | Chromium: time | Chromium: peak over baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pages-500.pdf` | 0.20 MB | 0.27 MB | 0.40 s (0.16, 0.11, 0.13) | 0.17 GB | 0.40 s, 0.11 GB | 0.83 s | 0.04 GB |
| 120,000 pages sharing one content stream (`make-many-pages.mjs`) | 16.6 MB | 40.7 MB | 54.2 s (14.1, 16.9, 23.2) | 0.95 GB | 50.3 s, 1.46 GB | 38.6 s | 0.77 GB |
| `make-large.mjs`'s file | 110.1 MB | 110.1 MB | 1.7 s (1.1, 0.0, 0.6) | 1.19 GB (0.97 GB without loading first) | 1.4 s, 0.92 GB | 2.3 s | 1.36 GB |

In Node the draw time includes qpdf reading the 68 MB update before it writes. The 120,000-page file reads more slowly than in the experiment (14.1 s against 8.3 s), as the pages and the dictionaries are read by two capped qpdf runs and the plain copy counts its pages, where the experiment read both in one run; it needs a third less memory. The 110 MB file holds the plain copy in more qpdf runs while it is made (`plainCopy`, shared with the page tools), so its peak depends on when Node lets them go. The multilingual file is still missing.
