# The shared test set

Every tool is run against every file here. `make.mjs` makes them, with `@cantoo/pdf-lib` and qpdf, and the files are committed so that tests do not depend on the script. `multilingual.pdf` is made by `make-multilingual.mjs` instead (see below). To make them again, run this from the repo root:

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
| `multilingual.pdf` | Text in Hindi, Telugu, Arabic and Chinese (Simplified), one page each, and a page with all four and English. Every font an embedded Noto subset with a Unicode map; made by `make-multilingual.mjs` | 5 |
| `chinese-unembedded.pdf` | Chinese text in `STSong-Light`, not embedded, through the named character map `UniGB-UCS2-H`, as older Asian-language PDFs are | 1 |

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

## The multilingual files

`multilingual.pdf` holds the text in Hindi, Telugu, Arabic and Chinese that `SPEC.md` lists. Its words are in `multilingual-text.json`, plain sentences about the file itself, not yet checked by a reader of each script (issue #7). `make-multilingual.mjs` makes it, and needs the npm registry:

```bash
node tests/fixtures/make-multilingual.mjs
```

It fetches `@fontsource/noto-sans-devanagari` 5.3.0, `@fontsource/noto-sans-telugu` 5.3.0, `@fontsource/noto-naskh-arabic` 5.3.0 and `@fontsource/noto-sans-sc` 5.3.1 (all SIL Open Font Licence 1.1) with `npm pack --ignore-scripts` into a new temporary folder, checks each tarball's SHA-512 before unpacking it, reads only the named regular-weight `woff2` files (each script's own piece and its Latin piece; for Chinese the single `chinese-simplified` piece), and deletes the folder at the end. No font is committed or shipped; the PDF holds only the subsets Chromium embeds. Chromium (Playwright 1.63, Chromium 153.0.8010.12, `Skia/PDF m153`) prints an HTML page built from the JSON, with JavaScript off, offline, and only the temporary folder reachable; it shapes the text with HarfBuzz. pdf-lib then sets the title, creator, fixed dates and a fixed `/ID`, keeping Chromium's producer line. The script refuses to write the file unless `qpdf --check` passes, it has five pages, every font is an embedded Type 0 Noto subset with a Unicode map, the document information holds only its five keys, and neither the file nor qpdf's uncompressed copy holds a `file:` address or this machine's temporary or home folder. Two runs give the same bytes (48,414). A later Chromium may give different bytes; make it again only when the words change.

What readers on the build machine make of it (23 Nov 2026):

| Reader | Result |
| --- | --- |
| Poppler `pdffonts` | Seven fonts, every one `CID TrueType`, `Identity-H`, embedded, subset, with a Unicode map; no Type 3 font |
| Font names | The Chinese font is embedded as `NotoSansSCThin-Regular`, but its outlines are regular weight: the file read is the 400-weight `noto-sans-sc-chinese-simplified-400-normal.woff2`, the subset's OS/2 weight class is 400, and drawn by Chromium it inks about 2.4 times as much as the package's 100-weight file. "Thin" is a name left in the static file by the variable font it was made from |
| Poppler `pdftotext` | Hindi, Telugu, Chinese and English read back as written, except a space poppler adds inside three Hindi and Telugu words (`कृ पया`, `వ్రా సిన`, `ద్రా క్ష`); Arabic in the right letters with spaces poppler adds inside words, as it does with right-to-left text |
| PDF.js `getTextContent` (6.5.438) | Chinese read back exactly. Hindi, Telugu and Arabic come back in part: `U+0000` where a glyph maps only through an actual-text span, and Arabic in presentation forms, reversed. PDF.js does not read the `/ActualText` spans Chromium writes for shaped letter groups (114 in the file) |

So the tests compare PDF.js's reading of a page before and after a tool, never with the written words (except the Chinese page), and also compare each page's decoded content streams byte for byte, which covers the actual-text spans.

`chinese-unembedded.pdf` comes from `make.mjs`, section 16: a Type 0 font `STSong-Light-UniGB-UCS2-H` with the encoding `UniGB-UCS2-H` and a `CIDFontType0` descendant (`Adobe`, `GB1`, 4) whose descriptor has no font file, and one A4 page showing the Chinese heading and first line of `multilingual-text.json` as UCS-2 codes. It needs no font and no network. PDF.js asks its data factory once per document for `UniGB-UCS2-H.bcmap`; the owner's fixed helper data (11 Nov 2026) holds no character maps, so the request is refused in memory, PDF.js reads and draws none of its text, and no request leaves the page. Poppler without its language pack reads none either. Adobe Reader may offer to download its Asian font pack for this file itself.

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
| `multilingual.pdf` | Ready, 5 pages |
| `chinese-unembedded.pdf` | Ready, 1 page |

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
| `multilingual.pdf` | Merged, 8 pages with `text.pdf` after it; pages 1 to 5 read the same text through PDF.js and hold the same decoded content streams as before (`tests/unit/multilingual.test.ts`) |
| `chinese-unembedded.pdf` | Merged; its text operators and its font reference (`STSong-Light-UniGB-UCS2-H`) kept |

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
| `multilingual.pdf` | No cuts: five parts; part *n* reads the text and holds the content streams of page *n* |
| `chinese-unembedded.pdf` | One page, so one part; its text operators and font reference kept |

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
| `multilingual.pdf` | Pages 2 and 4 taken: each reads its text and holds its content streams as before |
| `chinese-unembedded.pdf` | Its page taken; text operators and font reference kept |

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
| `multilingual.pdf` | Page 1 deleted: pages 2 to 5 left, each with its text and content streams as before |
| `chinese-unembedded.pdf` | One page, so deleting it would leave none: refused |

Files made in the test: a nested outline keeps the bookmarks of the pages left, moved up past dropped parents; a 500-page file with 3,000 bookmarks keeps the 2,970 of the 495 pages left; and a two-page file of 3,000 bookmarks keeps the 1,500 of the page left.

The file over 100 MB from `make-large.mjs` has one page, so Delete refuses it and it was not run, as it refuses any one-page file; Extract's hand run covers reading that file. The 120,000-page file from `make-many-pages.mjs` with every other page marked, a page list of about 400 KB, did not finish within 10 minutes in Node when the security reviewer ran it at stage 1: the list reaches qpdf, but qpdf selects pages slowly from a file that large. The page warns above 20,000 pages, and Cancel ends the job.

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
| `multilingual.pdf` | Reversed: each page reads its text and holds its content streams in its new place |
| `chinese-unembedded.pdf` | Its one order: text operators and font reference kept |

Files made in the test: a nested outline keeps every bookmark, each pointing to its page in its new place; a heading that points to no page is kept with its child; an outline 100 levels deep keeps every level; and an outline item that points back at the catalog is not dropped. Orders that leave out, repeat or add a page are refused.

The file over 100 MB from `make-large.mjs` has one page, so its only order is the one it has; Extract's hand run covers reading it.

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
| `multilingual.pdf` | Every page a quarter turn: text and content streams kept |
| `chinese-unembedded.pdf` | Turned a quarter: text operators and font reference kept |

Files made in the test, for turns already in a file (the security reviewer, stage 1): pages whose `/Rotate` is 45, -90, 450 and 135 read as 0, 270, 90 and 0, as PDF.js draws them, and turned right give 90, 0, 180 and 90; a turn inherited from the page tree is added to. Each result matches the turned thumbnail. Turns that are not valid are refused.

The file over 100 MB from `make-large.mjs` (one page, 110,124,572 bytes) was turned a quarter by hand in Node on 14 Nov 2026: 110,124,059 bytes out, in about 2.2 seconds.

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
| `multilingual.pdf` | Every page drawn with its text in every script, from the embedded fonts, with no character map asked for (`tests/unit/multilingual.test.ts`: at least 29 to 65 grey pixels a page, about half what was measured) |
| `chinese-unembedded.pdf` | Drawn without failing, as a blank page: no Chinese is drawn, the character-map gap of the owner's 11 Nov 2026 decision. PDF.js asks its data factory for `UniGB-UCS2-H.bcmap`, which is refused in memory |

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
| `multilingual.pdf` | Opened, 5 pages drawn from the one document (`tests/unit/multilingual.test.ts`) |
| `chinese-unembedded.pdf` | Opened, 1 page drawn, blank: no character map |

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

`multilingual.pdf` and `chinese-unembedded.pdf`, as every PDF, are not pictures: read as damaged, and turned away on the page by their first bytes.

### A picture chosen for an option (`pictureOutcome` in `src/engines/picture.ts`)

What a tool's picture option (Sign PDF's uploaded signature, first) is told about each picture before the job, read in the worker without decoding a pixel (`tests/unit/picture.test.ts`). Under a rule that takes JPG and PNG; under a rule of JPG only, every PNG is damaged and every JPG reads the same. Size never refuses: a ready picture over the tool's notice sizes gets a notice on the page and is still used.

| File | Outcome |
| --- | --- |
| `tall.jpg`, `wide.jpg` | Ready, 3,000,000 pixels |
| `grey-scan.jpg` | Ready, 8,699,840 pixels |
| `details.jpg` | Ready, 120,000 pixels |
| `progressive.jpg`, `details-progressive.jpg` | Ready, 76,800 pixels |
| `cmyk.jpg`, `p3.jpg`, `bad-profile.jpg` | Ready, 20,000 pixels |
| `turn-1.jpg` to `turn-8.jpg`, `turn-6.png` | Ready, 16,000 pixels (as stored, before the camera turn) |
| `screenshot.png` | Ready, 921,600 pixels |
| `small.png` | Ready, 60,000 pixels |
| `alpha.png` | Ready, 38,400 pixels |
| `details.png` | Ready, 30,000 pixels |
| `profile.png`, `bad-profile.png` | Ready, 20,000 pixels |
| `palette.png` | Ready, 9,600 pixels |
| `grey16.png` | Ready, 8,192 pixels |
| `grey-profile.png` | Ready, 4,800 pixels |
| `animated.png`, `bomb-profile.png` | Ready, 2,400 pixels |
| `text-bomb.png` | Ready, 1 pixel; its text chunk is never inflated |
| `huge.jpg`, `huge.png` | Ready, 256,000,000 pixels, so over any notice size: a notice, not a refusal. `huge.png`'s image data is counted (it fits its header) |
| `data-bomb.png` | Damaged: its image data passes what its header allows, and counting stops there |
| `arithmetic.jpg` | Saved in a way the tool cannot read (unsupported) |
| `broken.jpg`, `broken.png`, `zero-size.png` | Damaged |
| `scan-g4.tif`, `p3.icc` | Damaged if read; on the page each is turned away by its first bytes before that ("… is not a JPG or PNG picture, so it was not used. No picture is chosen.") |

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
| `multilingual.pdf` | 48,414 | 37,027 | No pictures; written again with objects packed. Every page reads its text and holds its decoded content streams as before |
| `chinese-unembedded.pdf` | 1,693 | 1,147 | Written again with objects packed; text kept |

The file over 100 MB from `make-large.mjs` (one page and 105 MB of random bytes attached, 110,124,572 bytes) was compressed by hand in Node on 16 Nov 2026: it could not be made smaller, in about 4 seconds. It is not run in CI.

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
| `multilingual.pdf` | 5, 1239 by 1754 (Chromium's A4 is 594.96 points wide) | 216,348 | 173,636 | Every page drawn with its text in every script; each picture holds at least half the dark pixels measured, and on the mixed page each script's line shows ink in its own band |
| `chinese-unembedded.pdf` | 1, A4 | 12,322 | 13,628 | Drawn without failing, blank: no Chinese drawn (no character map). The fixed data's refusal is in memory; on `/pdf-to-jpg` the end-to-end test finds the same requests as for `text.pdf` |

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

PDF.js draws none of the text in a font whose named character map it cannot load, whether or not the font is embedded, and the fixed helper data holds no character maps; the page text says such text may be missing. The test set now shows both sides: `multilingual.pdf`'s Chinese, in an embedded font with `Identity-H`, needs no character map and is drawn; `chinese-unembedded.pdf`'s, through `UniGB-UCS2-H`, is not. That stays so until the owner answers the character-map question in `CLAUDE.md`.

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
| `multilingual.pdf` | 48,414 | 39,248 | Numbered; each page reads its text as before followed by its number, and its own content streams are unchanged between the added `q` and `Q` |
| `chinese-unembedded.pdf` | 1,693 | 1,796 | Numbered; its text operators and font reference kept |
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
| 2,000 pages that inherit small resources whose `/XObject` dictionary (800 long names, about 54 KB) sits behind a reference (packed by qpdf) | Stopped with `OutputLimit` before any layer is drawn: the estimate counts the dictionary reached through the reference in full |
| `pageBox` given a box of 10^-5 points and a user unit of 10^7 (a unit test, no file) | The engine failure: its sides fit, but the matrix would scale by less than a millionth |
| `pages-500.pdf` written with a cap of 20,000 bytes on the new file | Stopped with `OutputLimit`. qpdf finishes with exit 0 and a cut-off file when a write is refused while it writes object streams, so the capped file's own record (`Qpdf.refused`) is asked |

Measured with the memory order of the design's section 6: the reading qpdf let go before the stamping qpdf is made, and the JavaScript plain copy let go once the stamping qpdf holds it. In Node, each file in a process of its own, with qpdf and pdf-lib loaded first on `text.pdf`; peak is the process's highest resident memory, which includes the test runner's own (about 0.14 GB here). The design's experiment was run again in the same conditions for comparison (its own process, without a test runner, about 0.05 GB). In Chromium, the built page through Playwright, from pressing the main button to the result, with the resident memory of every browser process added up and sampled every 0.2 seconds; its baseline was about 0.5 GB.

| File | In | Out | Node: time (read, draw, write and check) | Node: peak | Experiment again: time, peak | Chromium: time | Chromium: peak over baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pages-500.pdf` | 0.20 MB | 0.27 MB | 0.40 s (0.16, 0.11, 0.13) | 0.17 GB | 0.40 s, 0.11 GB | 0.83 s | 0.04 GB |
| 120,000 pages sharing one content stream (`make-many-pages.mjs`) | 16.6 MB | 40.7 MB | 54.2 s (14.1, 16.9, 23.2) | 0.95 GB | 50.3 s, 1.46 GB | 38.6 s | 0.77 GB |
| `make-large.mjs`'s file | 110.1 MB | 110.1 MB | 1.7 s (1.1, 0.0, 0.6) | 1.19 GB (0.97 GB without loading first) | 1.4 s, 0.92 GB | 2.3 s | 1.36 GB |

In Node the draw time includes qpdf reading the 68 MB update before it writes. The 120,000-page file reads more slowly than in the experiment (14.1 s against 8.3 s), as the pages and the dictionaries are read by two capped qpdf runs and the plain copy counts its pages, where the experiment read both in one run; it needs a third less memory. The 110 MB file's peak is above the experiment's (Node 1.19 GB, or 0.97 GB without loading qpdf and pdf-lib first, against 0.92 GB; Chromium 1.36 GB over its baseline): `plainCopy`, shared with the page tools, makes a second qpdf only to count the pages, so one job makes four qpdf instances (opening, counting, reading, stamping), each holding a copy of the file until it is let go. Both differences are accepted for now (task 3.2); the later fix is to take the page count from `readPages` and skip the counting instance.

### Watermark (`src/engines/tools/watermark-pdf.ts`, with `src/engines/stamp.ts`)

Each file was watermarked in Node with the same qpdf and pdf-lib the browser gets (`tests/unit/watermark-pdf.test.ts`), and each result read back by qpdf and by PDF.js's legacy build. Every result passes `qpdf --check`, has the same pages, is not encrypted, and each page's text through PDF.js is its text as before followed by the watermark's words. The watermark is drawn by the same step as Add page numbers, so each page's own content streams are kept unchanged between a shared `q` and `Q`, and its stored turn, boxes and user unit are as they were. Sizes in bytes, from a run on 21 Nov 2026, with the text "Draft".

| File | Before | After | Outcome |
| --- | --- | --- | --- |
| `text.pdf`, `warning.pdf` | 6,057 | 5,179 | "Draft" across each of the 3 pages; progress "Reading the file", "Page 1 of 3" to "Page 3 of 3", then writing from 75% to 95%, and 100 once checked. qpdf's warning does not stop the job. "Brouillon – à relire" and `a) Tj (b \ % <x> [/y]` are read back by PDF.js exactly as typed; the second sits in the layer only inside one hex string |
| `pages-500.pdf` | 198,025 | 324,023 | All 500 pages show the text after their own; with a 50-character text, 350,561 bytes, about 300 bytes a page |
| `scanned.pdf` | 6,191 | 7,182 | The text shows over the whole-page picture on every page, centred within 3% |
| `password.pdf` | 7,178 | 5,216 | With `open-sesame`: watermarked, with no password and no restrictions. Without it, or with a wrong one, the job fails |
| `restricted.pdf` | 7,181 | 5,216 | Watermarked, with no restrictions |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | | | Not watermarked: the job fails and hands back nothing |
| `form.pdf` | 3,189 | 3,386 | Both fields kept, with the value `Sample text` |
| `mixed.pdf` | 2,257 | 3,907 | On each page as PDF.js shows it (A4, Letter on its side, A5 turned a quarter, A4 upside down), for "Draft" and for 50 characters: the pixels that changed form a box whose middle is within 3% of the centre and which stays inside the margin of a twelfth of the shorter side; the text rises at 45 degrees as shown (within half a degree); the grey drawn on white is 204 of 255 (within 3), mid-grey at 40%. Each layer is `/Artifact << /Type /Pagination /Subtype /Watermark >> BDC … EMC`, with `/ca 0.4` in its own resources and one shared, unembedded Helvetica Bold |
| `rich.pdf` | 2,064 | 2,868 | Bookmarks "Chapter one" and "Chapter two" pointing to their pages, the link and `note.txt` kept |
| `images.pdf` | 1,642 | 2,292 | Watermarked; the JPEG 2000 picture kept |
| `tagged.pdf` | 5,118 | 3,699 | Tags, destination, thread, the tagged field and its value, note and link kept; every page's own streams unchanged; PDF.js still resolves its tags, and the watermark is the page's last marked content, an `/Artifact` with no marked-content id, in no tag. Its tags point to objects and name no `/MCID`, so a page made in the test with `/MCID 0` and an `/MCR` for `/MCID 1` is checked beside it: both ids still in the page's own unchanged streams, `/StructParents` kept, and PDF.js finds "Hello tagged" and "Second part" from their tags, with no watermark words in them |
| `multilingual.pdf` | 48,414 | 39,843 | Watermarked; each page's text as before followed by the watermark, its own content streams unchanged |
| `chinese-unembedded.pdf` | 1,693 | 1,919 | Watermarked; its text operators and font reference kept |
| `compress-scans.pdf`, `compress-lossless.pdf`, `compress-kinds.pdf`, `compress-small-jpg.pdf`, `compress-text.pdf`, `compress-packed.pdf`, `compress-flate-bomb.pdf`, `compress-jpeg-mismatch.pdf` | | | Watermarked; pictures are not read. `compress-text.pdf` (21,019 to 4,056) and `compress-small-jpg.pdf` (12,852 to 9,529) come out smaller, as qpdf compresses their uncompressed streams |
| `compress-bomb-attachment.pdf` | 1,045,278 | 1,045,606 | Watermarked in about 0.2 seconds; the 1 GB attachment is copied as stored and never inflated |
| `compress-password.pdf` | 36,730 | 36,695 | With `open-sesame`: watermarked, with no password |
| `compress-json-bomb.pdf` | 140,759 | | Not watermarked: its JSON of dictionaries is refused at 64 MB, so the pages cannot be read, and the job fails with the engine's sentence after about 14 seconds in Node |

Files made in the test (`tests/unit/watermark-pdf.test.ts`):

| File | Outcome |
| --- | --- |
| An A4 page whose content sets `/ca 0.1`, a scaling `cm` (3 times, moved 40 points) and a red fill, and restores none of them | The pixels the watermark changes, and the grey it draws (204), are exactly those of the same page with no such content |
| 6,000 pages that share one tiny content stream (packed by qpdf), with a 50-character text | Done in about 3 seconds; every page still draws the one shared stream, unchanged; about 500 bytes a page more, as each page gets its own layer, a form holding the text, its graphics state and the font's name |
| The text sent as missing, empty, only spaces, 51 characters, "मसौदा", "Łódź", with a tab, a tab alone, a number, `null`, an array, an object, a direction override, and under `__proto__` | Refused with `TextRefused` (`text-refused`) before qpdf is asked for; no error message holds the text |

Measured as for Add page numbers, with a 50-character text: in Node, each file in a process of its own under the test runner, with qpdf and pdf-lib loaded first on `text.pdf`; peak is the process's highest resident memory, including the runner's own (about 0.14 GB). In Chromium, the built page through Playwright, from pressing the main button to the result, with the resident memory of every browser process added up and sampled every 0.2 seconds. Add page numbers' figures, from the table above, are in brackets.

| File | In | Out | Node: time (read, draw, write and check) | Node: peak | Chromium: time | Chromium: peak over baseline |
| --- | --- | --- | --- | --- | --- | --- |
| `pages-500.pdf` | 0.20 MB | 0.35 MB (0.27) | 0.44 s (0.40): 0.18, 0.05, 0.22 | 0.17 GB (0.17) | 0.9 s (0.83) | 0.04 GB (0.04) |
| 120,000 pages sharing one content stream (`make-many-pages.mjs`) | 16.6 MB | 61.1 MB (40.7) | 64.6 s (54.2): 13.8, 15.4, 35.4 | 1.05 GB (0.95) | 45.2 s (38.6) | 0.81 GB (0.77) |
| `make-large.mjs`'s file | 110.1 MB | 110.1 MB (110.1) | 1.8 s (1.7): 1.2, 0.0, 0.5 | 1.16 GB (1.19) | 2.4 s (2.3) | 1.32 GB (1.36) |

The bytes added per page differ between the tables because the text and the files differ: about 300 a page on `pages-500.pdf` with 50 characters, about 500 on the 6,000-page file made in the test, whose pages hold almost nothing else, so each page's own layer form is most of what qpdf writes for it, and about 370 on the 120,000-page file, whose object streams pack the changed page dictionaries more tightly. Every time and peak is within 20% of Add page numbers' (the largest gap is the 120,000-page file: 19% in Node, 17% in Chromium, 11% and 5% in memory). The output of the 120,000-page file is 50% larger: each page's layer holds the text, so the file grows by about 370 bytes a page (61,050,227 bytes against 16,578,179), against about 200 for a page number, and the extra time is mostly qpdf writing those bytes. It stays far inside the size budget, which is over 262 MB for this file (2 KB a page and 16 MB, before twice the plain copy is added). Sharing one form among pages of the same size could cut it (design, section 3); left for a later change if a real file shows the need.

### Sign PDF (`src/engines/tools/sign-pdf.ts`, with `src/engines/stamp.ts`)

Each file was signed in Node with the same qpdf and pdf-lib the browser gets (`tests/unit/sign-pdf.test.ts`), and each result read back by qpdf and by PDF.js's legacy build. Every result passes `qpdf --check`, has the same pages and is not encrypted. With the name "Jane Doe" typed and the last page chosen, the last page's text through PDF.js is its text as before followed by the name, and every other page's dictionary and content are exactly those of the plain copy: no layer, its own content alone. The signature is drawn by the same step as Add page numbers and Watermark, so a chosen page's own content streams are kept unchanged between a shared `q` and `Q`, and no stored turn, box or user unit changes. Sizes in bytes, from a run on 21 Nov 2026, at "Bottom right": typed on the last page, drawn (a wave across the pad) on the last page, `alpha.png` on the last page, and typed on every page.

| File | Before | Typed, last | Drawn, last | Picture, last | Typed, every | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| `text.pdf`, `warning.pdf` | 6,057 | 4,338 | 4,297 | 7,440 | 4,828 | The name on page 3 only; progress "Reading the file", then writing from 75% to 95%, and 100 once checked, with no page count for one page; on every page, "Page 1 of 3" to "Page 3 of 3". `a) Tj (b \ % <x>` is read back exactly, inside one hex string of the one signature form; "Zoë Ångström-Núñez" is read back as typed, in Times Italic, not put inside the file. qpdf's warning does not stop the job |
| `pages-500.pdf` | 198,025 | 102,380 | 102,280 | 105,433 | 225,965 | The last page only: 869 bytes more than the plain copy written with object streams. With `alpha.png` on every page, all 500 pages draw one signature form, which holds the picture and its soft mask once |
| `scanned.pdf` | 6,191 | 6,778 | 6,708 | 9,851 | 7,025 | The signature shows over the whole-page picture of the last page, inside its bottom-right margin; the other pages are unchanged pixel for pixel |
| `password.pdf` | 7,178 | 4,375 | 4,332 | 7,475 | 4,865 | With `open-sesame`: signed, with no password and no restrictions. Without it, or with a wrong one, the job fails |
| `restricted.pdf` | 7,181 | 4,375 | 4,332 | 7,475 | 4,865 | Signed, with no restrictions |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | | | | | | Read as damaged before any job; a run fails as the engine's failure and hands back nothing |
| `form.pdf` | 3,189 | 3,434 | 3,394 | 6,538 | 3,434 | Both fields kept, with the value `Sample text` (one page, so the last page is every page) |
| `mixed.pdf` | 2,257 | 2,403 | 2,361 | 5,504 | 3,352 | On every page as PDF.js shows it (A4, Letter on its side, A5 turned a quarter, A4 upside down), drawn, typed and with `turn-6.jpg`: the changed pixels sit at its bottom right inside the margin of a twentieth of the shorter side, a drawing's and a picture's edges on that margin; the typed name runs left to right as shown; at "Top left", at its top left. Stored turns and boxes unchanged |
| `rich.pdf` | 2,064 | 2,472 | 2,431 | 5,574 | 2,715 | Bookmarks "Chapter one" and "Chapter two" pointing to their pages, the link and `note.txt` kept |
| `images.pdf` | 1,642 | 2,345 | 2,298 | 5,442 | 2,345 | Signed; the JPEG 2000 picture kept |
| `tagged.pdf` | 5,118 | 3,310 | 3,266 | 6,410 | 3,543 | Tags, destination, thread, the tagged field and its value, note and link kept, with the same kinds of tag; the signature is in no tag. A page made in the test with `/MCID 0` and an `/MCR` for `/MCID 1`: both ids still in the page's own unchanged streams, `/StructParents` kept, and PDF.js finds "Hello tagged" and "Second part" from their tags |
| `multilingual.pdf` | 48,414 | 38,049 | 38,006 | 41,154 | 39,092 | Signed; every page's text as before, the name after the last page's, and each page's own content streams unchanged |
| `chinese-unembedded.pdf` | 1,693 | 1,947 | 1,908 | 5,044 | 1,947 | Signed; its text operators and font reference kept |
| `compress-scans.pdf`, `compress-lossless.pdf`, `compress-kinds.pdf`, `compress-small-jpg.pdf`, `compress-text.pdf`, `compress-packed.pdf`, `compress-flate-bomb.pdf`, `compress-jpeg-mismatch.pdf` | | | | | | Signed on the last page; pictures are not read. `compress-text.pdf` (21,019 to 3,209) and `compress-small-jpg.pdf` (12,852 to 9,582) come out smaller, as qpdf compresses their uncompressed streams |
| `compress-bomb-attachment.pdf` | 1,045,278 | 1,045,654 | 1,045,613 | 1,048,758 | 1,045,654 | Signed in about 0.3 seconds; the 1 GB attachment is copied as stored and never inflated |
| `compress-password.pdf` | 36,730 | 36,730 | 36,669 | 39,809 | 36,730 | With `open-sesame`: signed, with no password |
| `compress-json-bomb.pdf` | 140,759 | | | | | Not signed: its JSON of dictionaries is refused at 64 MB, so the pages cannot be read, and the job fails with the engine's sentence after about 14 seconds in Node |

Pictures, each on the last page of a white A4 page unless said (`tests/unit/sign-pdf.test.ts`):

| Picture | Outcome |
| --- | --- |
| `alpha.png` | On a red page: its opaque blue rectangle is blue, its see-through corners show the red page, its half see-through red circle is red; the file holds the picture and its soft mask |
| `turn-6.jpg`, `turn-3.jpg`, `turn-8.jpg`, `turn-6.png` | Upright, as a photo viewer shows them: red top left, green top right, blue bottom left, yellow bottom right, 160 by 100 as shown |
| `cmyk.jpg` | Kept as its own JPG data with `/DeviceCMYK` and `/Decode [1 0 1 0 1 0 1 0]`, as it has an Adobe segment, and each block drawn on the same side of the middle in every channel as a browser draws it. The same picture with its Adobe segment taken out has its `/Decode` dropped, as Image to PDF does |
| `details.jpg`, `details.png`, `details-progressive.jpg` | No `SECRET-` marker, `Exif`, `xmpmeta` or `GPS` anywhere in the new file, in its bytes or in any stream decoded |
| Every picture in `pictures/`, read before the job (`inspectPicture`) | Exactly `pictureOutcome` under the tool's rule (JPG and PNG, a notice over 8 MB or 16 million pixels), as the table for a picture chosen for an option gives; another key is damaged; fflate is asked for a JPG as for a PNG |
| `broken.png`, `broken.jpg`, `arithmetic.jpg`, `data-bomb.png`, `p3.icc`, a PDF, no bytes, a string, an array | Refused with `PictureRefused` (`picture-refused`) before qpdf is asked for |

Files and inputs made in the test (`tests/unit/sign-pdf.test.ts`, `tests/unit/stamp.test.ts`):

| File or input | Outcome |
| --- | --- |
| A page whose content leaves `/ca 0.1`, a scaling `cm` (3 times, moved 40 points) and a red fill set | The pixels each way changes are exactly those of the same page with no such content, and a drawn line is black |
| 6,000 pages that share one tiny content stream (packed by qpdf), a drawing on every page | Done in a few seconds; every page still draws the one shared stream, unchanged; under 300 bytes a page more, as each page's own layer only places the one signature form |
| A crop box showing 300 by 400 points of a 600 by 800 page | The signature inside the part shown, its right edge 15 points (a twentieth) from the shown edge |
| A loop in the left half of the pad | Drawn in black at the bottom right, its box 346 by 326 pad units (the empty right half left out), filling exactly the place `signaturePlace` gives, in the same proportions |
| A one-point line | A filled round dot the width of a line, about π/4 of its square |
| Three pages, the last chosen (`only`); the first of 120,000 chosen; pages 0 to 1,999 and 4,000 to 4,499 of 4,500 chosen; no page chosen | Only the chosen pages get a layer, the others' dictionaries and content as in the plain copy; one run for the first of 120,000, under 4 KB more than the plain copy with object streams; two runs for the 2,500 pages, none for the stretch with none chosen; no page chosen refused before anything is written ("No page was chosen to draw on.", the engine failure) |
| A 12 MB shared stream on `text.pdf`; shared bytes as large as the budget | Inside the budget at its own size, written once though the update carries it as base64; `OutputLimit` with the reason `shared` before any run is prepared |
| A 16-million-pixel gradient PNG, a photo of paper (made in the test, 0.2 MB as a PNG, 0.4 MB once compressed for the PDF) | On the last page of `text.pdf` and on every page of 2,100: decoded once and compressed once per job (spies on pdf-lib's PNG reader and its compressor), one image object in the new file, still compressed, no larger than its encoded bytes |
| A noise PNG of 2,600 by 2,400 pixels, about 19 MB once compressed, on `text.pdf` | `PictureTooLarge` (`picture-too-large`) before any run's document is made: only the document that read the picture was made |
| The way, the pages or the place as a label, an unknown value, a number, `null`, missing or under `__proto__` | Refused before qpdf is asked for, as the engine failure |
| With "Type your name" chosen: no name, empty, spaces, 51 characters, "सीता", "Łukasz", a tab, a number, `null`, an array, an object, a direction override; also no name beside a drawing and a picture | Refused with `TextRefused` (`text-refused`) before qpdf is asked for; no error holds the name, and the drawing or picture beside it is never taken instead |
| With "Draw it" chosen: no drawing, an empty one, an empty line, an odd count, points outside the pad, 1.5, `NaN`, text, `null`, 201 lines, 20,001 points, a string, a typed array; a name beside it | Refused with `DrawingRefused` (`drawing-refused`) before qpdf is asked for |

Measured as for Watermark: in Node, each case in a process of its own under the test runner, with qpdf and pdf-lib loaded first on `text.pdf`; peak is the process's highest resident memory, including the runner's own (about 0.14 GB); the time is split at qpdf's first write progress (to the write, then the write and check); the update is the bytes appended to qpdf's `/update.json`. In Chromium, the built page through Playwright at 1280 pixels, from pressing the main button to the result, with the resident memory of every browser process added up and sampled every 0.2 seconds, over its level just before the press (about 0.5 GB). "Typed, last" is "Jane Doe" on the last page; "8 MB picture, every" is a noise PNG of 1,680 by 1,680 pixels (8,471,528 bytes, 8,468,926 once compressed for the PDF) on every page. Watermark's figures for every page, with a 50-character text, are in brackets.

| File | Case | In | Out | Node: time (to the write, write and check) | Node: peak | Node: update | Chromium: time | Chromium: peak over baseline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages-500.pdf` | Typed, last | 0.20 MB | 102,380 bytes, 869 more than the plain copy with object streams | 0.3 s (0.2, 0.1) | 0.16 GB | | 0.8 s | 0.03 GB |
| `pages-500.pdf` | 8 MB picture, every | 0.20 MB | 8.7 MB | 2.2 s (1.7, 0.5) (0.44) | 0.35 GB (0.17) | 11.6 MB | 2.3 s (0.9) | 0.13 GB (0.04) |
| 120,000 pages (`make-many-pages.mjs`) | Typed, last | 16.6 MB | 1,131,624 bytes, 899 more than the plain copy with object streams | 18.8 s (13.9, 4.9) | 0.63 GB | 1,166 bytes | 12.9 s | 0.36 GB |
| 120,000 pages | 8 MB picture, every | 16.6 MB | 39.4 MB (61.1) | 51.8 s (32.8, 18.9) (64.6) | 1.04 to 1.10 GB (1.05) | 69.1 MB | 34.6 s (45.2) | 0.83 GB (0.81) |
| `make-large.mjs`'s file | Typed, last | 110.1 MB | 110,124,853 bytes, 799 more than the plain copy with object streams | 1.5 s (1.0, 0.5) | 1.16 GB | | 1.9 s | 1.27 GB |
| `make-large.mjs`'s file | 8 MB picture, every | 110.1 MB | 118.6 MB | 3.0 s (2.2, 0.8) (1.8) | 1.23 GB (1.16) | | 3.4 s (2.4) | 1.00 GB (1.32) |

The 16-million-pixel pictures, 4,000 by 4,000 pixels, as photos of a signature on paper (a paper-coloured gradient with a pen stroke): the gradient as made (215,411 bytes as a PNG, 400,012 once compressed for the PDF, as pdf-lib stores it without the PNG's row filters), and the same with camera-like grain (17,670,485 bytes as a PNG, 21,003,719 once compressed):

| File | Picture, pages | Out | Node: time | Node: peak | Node: update | Chromium: time | Chromium: peak over baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `text.pdf` (6,057 bytes) | Gradient, last | 404,467 bytes | 2.2 s | 0.31 GB | 535,489 bytes | 2.8 s | 0.23 GB |
| `text.pdf` | Gradient, every | 404,946 bytes | 2.1 s | 0.30 GB | | 2.8 s | |
| 2,100 pages sharing one content stream (283,745 bytes) | Gradient, every | 919,423 bytes | 2.8 s | 0.35 GB | 1,429,331 bytes | 3.3 s | 0.17 GB |
| `text.pdf` | Grain, last or every | Not made: `PictureTooLarge`, "noisy-16mp.png (16.9 MB) is too large to place on these pages. Crop it to the signature, or save a smaller copy." | 4.0 s | 0.39 GB | none written | 11.3 s | 0.20 GB |
| 2,100 pages | Grain, every | Not made: `PictureTooLarge` | 4.5 s | 0.38 GB | none written | | |
| 120,000 pages | Grain, every | 51.1 MB | 55.2 s | 1.20 GB | 81.0 MB | 47.6 s | 0.93 GB |

The two 8 MB picture, every page rows were measured again after the stage 2 review, once a large stream was keyed by its bytes rather than its text (21 Nov 2026). The machine ran slower that day: the code before the change, measured beside it, took 2.3 s and 0.33 GB on `pages-500.pdf`, and 56.6 and 59.4 s, 1.11 and 1.07 GB on the 120,000-page file, against 2.2 s and 0.35 GB, and 51.8 and 57.7 s, 1.10 and 1.04 GB after it, so the change saves a few seconds on the long file and leaves the peak about where it was; the table gives the faster run and both peaks. Output and update sizes are unchanged to the byte.

On the last page, each file grows by under 1 KB over the plain copy written with object streams, as the design asks. Every page stays inside the size budget; the update carries the picture once, as base64. Two every-page figures are more than 20% worse than Watermark's, both on small and medium files: `pages-500.pdf` (2.2 s against 0.44 s in Node, 2.3 s against 0.9 s in Chromium, and 0.35 GB against 0.17 GB) and `make-large.mjs`'s file (3.0 s against 1.8 s, 3.4 s against 2.4 s). The difference is reading the 8 MB picture once: pdf-lib decodes the PNG and compresses its pixels again (about 1.4 s in Node for this picture), which no Watermark job does; the pages themselves take what Watermark's take. On the 120,000-page file Sign PDF is faster than Watermark and its file 35% smaller, as each page's layer only places the one shared signature form. A grainy 16-million-pixel photo compresses to 21 MB, past the budget of any file under about 2.5 MB or a few thousand pages, so the job stops with the picture's own sentence after the picture is read (4 s in Node, 11 s in Chromium, where reading it before the job also takes time), and never writes the file; on a long file it fits and is written once.

The sizes for `multilingual.pdf` and `chinese-unembedded.pdf` are from a run on 23 Nov 2026.

### Protect with a password (`src/engines/tools/protect-pdf.ts`)

Each file was protected in Node with the same qpdf the browser uses, with the new password `Qz7 pw#%@ Kv4` (`tests/unit/protect-pdf.test.ts`), and each result read back by qpdf and by PDF.js's legacy build. Every result passes `qpdf --check` with the password, reports 256-bit AES (R 6, V 5, AESv3 for strings, streams and files) with every permission allowed, and is refused by qpdf and PDF.js with no password, with the password less its last character and with one character more. Opened with the password, each page's size, turn and text through PDF.js, and the bookmarks, form fields with their values and attached files with their contents through qpdf's JSON, are exactly as in the file chosen. The password is in no result's bytes, and no result shows `/MediaBox` in plain text: page dictionaries go into encrypted object streams. Sizes in bytes, from a run on 22 Nov 2026; encryption is random, so each run differs by a few bytes.

| File | Before | After | Outcome |
| --- | --- | --- | --- |
| `text.pdf`, `warning.pdf` | 6,057 | 4,302 | Protected; written in object streams, so smaller. qpdf's warning does not stop the job. Progress "Reading the file", then writing up to 50%, then 55, 95 and 100 as each check of the result passes |
| `pages-500.pdf` | 198,025 | 112,521 | All 500 pages, with their text |
| `scanned.pdf` | 6,191 | 6,746 | Protected; its two pictures' dictionaries (`/Width`, `/Height`, colour space, format) stay readable |
| `password.pdf` | 7,178 | 4,302 | With `open-sesame`: the new password only, every permission allowed; `open-sesame` no longer opens it and is not in its bytes. Without it, or with `open-sesam`: "A password did not open the file." |
| `restricted.pdf` | 7,181 | 4,302 | Needs the new password, with no restrictions |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | | | Read as damaged before any job; a run fails with "qpdf could not write the protected file." and hands back nothing |
| `form.pdf` | 3,189 | 3,491 | Both fields kept, with the value `Sample text`; the field's appearance names `/Helvetica` and gives its `/BBox`, both readable |
| `mixed.pdf` | 2,257 | 2,378 | Sizes and turns kept |
| `rich.pdf` | 2,064 | 2,757 | Bookmarks "Chapter one" and "Chapter two" pointing to their pages, the link and `note.txt` with its contents kept. The attachment's name, dates and contents are not readable; its type (`/Subtype /text#2fplain`) and size are |
| `images.pdf` | 1,642 | 2,290 | Protected; the JPEG 2000 picture's dictionary (`/Width`, format) stays readable |
| `tagged.pdf` | 5,118 | 3,400 | Tags, destination, thread, the tagged field and its value, note and link kept. Every `SECRET-` marker held in a string or a stream is gone from the bytes, the field's hex strings too; `SECRET-DEST-NAME`, a name in the catalog's old-style `/Dests`, stays readable, as the format leaves names |
| `multilingual.pdf` | 48,414 | 38,566 | Protected; with the password every page reads its text and holds its decoded content streams as before. Protected and then given back by Remove a password with the same password, every page is as before (`tests/unit/multilingual.test.ts`) |
| `chinese-unembedded.pdf` | 1,693 | 1,864 | Protected; with the password its text operators and font reference are kept |
| `compress-scans.pdf` | 634,679 | 635,113 | Protected; each picture stored as it was, encrypted |
| `compress-lossless.pdf` | 16,884 | 17,572 | Protected |
| `compress-small-jpg.pdf` | 12,852 | 9,531 | Protected; its uncompressed text stream is compressed, as qpdf does by default when it writes, so smaller |
| `compress-kinds.pdf` | 41,034 | 40,966 | Protected |
| `compress-text.pdf` | 21,019 | 3,164 | Protected; its uncompressed content streams are compressed, as qpdf does by default when it writes |
| `compress-packed.pdf` | 3,441 | 4,208 | Protected |
| `compress-bomb-attachment.pdf` | 1,045,278 | 1,045,718 | Protected in about 0.2 seconds: the 1 GB attachment is encrypted as stored and never inflated, by the write or the check |
| `compress-flate-bomb.pdf` | 103,018 | 103,703 | Protected; the picture's data is encrypted as stored and never inflated |
| `compress-jpeg-mismatch.pdf` | 15,014 | 15,559 | Protected; neither JPG is decoded |
| `compress-json-bomb.pdf` | 140,759 | 172,932 | Protected in about 9 seconds in Node: its 5,000 long strings are each encrypted, inside object streams; well inside the cap |
| `compress-password.pdf` | 36,730 | 36,610 | With `open-sesame`: the new password only |

Files and inputs made in the test (`tests/unit/protect-pdf.test.ts`):

| File or input | Outcome |
| --- | --- |
| A page whose title (a literal string) and XMP stream hold `SECRET-TITLE-WORD` and `SECRET-XMP-WORD` | Neither word in the result's bytes; PDF.js reads both back once the file is opened with the password |
| `text.pdf` with 128-bit RC4 (made with `--allow-weak-crypto`, in the test only), opened with its password | AES-256 only; the old password refused |
| `text.pdf` protected twice with the same password | Different `/U`, `/O`, `/UE` and `/OE`, and different bytes |
| The passwords `--help`, `@in.pdf` and `--decrypt` | Each taken as a password: the result opens with it, AES-256 |
| 20,000 empty streams (which cannot go in object streams, so each grows when encrypted) | Larger once protected, but inside the cap of twice the file and 16 MB; written under a cap of the file's own size, stopped with `OutputLimit` (`output-limit`) |
| No new password, an empty one, 128 characters, "café", a space first or last, a line break, a number, `null`, one under `__proto__` or under `password` | Refused with `PasswordRefused` (`password-refused`) before qpdf is asked for; no error holds what was sent |
| Every failure above, with both marked passwords | No error's message or stack holds either password or its parts |

Measured on 22 Nov 2026 in Node, each case in a process of its own under the test runner, with qpdf loaded first on `text.pdf`; peak is the process's highest resident memory, including the runner's own (about 0.1 GB before a small job, 0.28 GB once the 100 MB file is read). The time is split at the end of qpdf's write (the write, then the check of the result). In Chromium, the built page through Playwright at 1280 pixels, from pressing the main button to the result, the check timed from the bar reaching 90%, where the write ended under the bar's weighting at the time (the write now fills it to 50%), with the resident memory of every browser process added up and sampled every 0.2 seconds, over its level just before the press.

| File | In | Out | Node: time (write, check) | Node: peak | Chromium: time (check) | Chromium: peak over baseline |
| --- | --- | --- | --- | --- | --- | --- |
| `pages-500.pdf` | 198,025 bytes | 112,521 bytes | 0.23 s (0.10, 0.13) | 0.09 GB | 0.4 s (0.2) | 0.02 GB |
| 120,000 pages (`make-many-pages.mjs`) | 16.6 MB | 1.16 MB | 8.4 s (3.6, 4.8) | 0.32 GB | 5.3 s (3.1) | 0.28 GB |
| `make-large.mjs`'s file | 110.1 MB | 110,124,943 bytes, 371 more | 4.6 s (2.1, 2.5) | 0.83 GB | 4.9 s (2.7) | 0.93 GB |

The check of the result (decision 4 of the change) takes a little longer than the write itself, so it more than doubles the time on the largest files: 2.2 times on the 100 MB file and 2.3 times on the 120,000-page file in Node. The change says to raise this in the pull request; the check is kept until the reviewers agree otherwise. No genuine file comes near the cap of twice the file and 16 MB: the largest growth is the 100 MB file's 371 bytes.

The input is let go before the output is read: in Node, with the 100 MB file written by `cappedWrite`, which removes `/in.pdf` once the write has passed, the memory held right after the output is read (after a garbage collection) is 318 MB, against 423 MB when the same call keeps `/in.pdf`, each from 210 MB held at the start (the file and qpdf's copy of it). The peak itself comes during the write, when the file, qpdf's copy and the growing output all exist.

What stays readable without the password, because PDF encryption covers strings and streams only and the format never puts a stream's own dictionary in an object stream: the file's name, which is outside the file; whether it holds bookmarks, attached files or a form (the catalog's keys); roughly how large its parts are; each picture's pixel size, bits, colour space and format; each attached file's type and size; font names named in appearance streams; each drawn part's box (a form XObject's `/BBox`), such as a form field's appearance (`/BBox` on `form.pdf`'s result) and, in a file that carries a layer of Add page numbers, Watermark or Sign PDF, each page's size; and names in the catalog, such as old-style destination names. What is hidden: its pages and the sizes their dictionaries give, its text, the pictures' data, bookmarks' titles, attached files' names, dates and contents, and its title and XMP details.

Every readable file's pages are also checked to hold, read with the password, the same decoded content streams as before (added with `multilingual.pdf`). Protect has now been run on the multilingual file; opening its result in the readers by hand is still owed (issue #7).

### Remove a password (Unlock PDF) (`src/engines/tools/unlock-pdf.ts`)

Each file was run in Node with the same qpdf the browser uses (`tests/unit/unlock-pdf.test.ts`), the encrypted ones with the password they need (`open-sesame`, and for `password.pdf` also its password for permissions `owner-secret`). Every file given back is not encrypted, reports every permission allowed, passes `qpdf --check` with no password, opens in PDF.js with no password with each page's size, turn and text as in the file chosen, and holds neither password in its bytes. A file with no encryption gives no file ("This file has no password or restrictions."), after reading only: progress says "Reading the file" and nothing is written. Sizes in bytes, from a run on 22 Nov 2026; object streams are kept as they were.

| File | Before | After | Outcome |
| --- | --- | --- | --- |
| `password.pdf` | 7,178 | 6,183 | Given back, opened with `open-sesame` or with `owner-secret`. Without a password, or with `open-sesam`: "A password did not open the file.", with no other password tried. Progress "Reading the file", then writing up to 50%, then 55 and 100 as each check of the result passes |
| `restricted.pdf` | 7,181 | 6,183 | Given back with no password typed; every permission allowed |
| `compress-password.pdf` | 36,730 | 36,088 | Given back, opened with `open-sesame` |
| `text.pdf`, `warning.pdf`, `pages-500.pdf`, `scanned.pdf`, `form.pdf`, `mixed.pdf`, `rich.pdf`, `images.pdf`, `tagged.pdf`, `multilingual.pdf`, `chinese-unembedded.pdf` | | | Nothing to remove: no file. qpdf's warning on `warning.pdf` does not stop the reading |
| Every other `compress-*.pdf` | | | Nothing to remove: no file, in at most about 0.1 seconds; the bombs are never inflated, as only the encryption is read |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | | | Read as damaged before any job; a run fails with "qpdf could not read the file." and hands back nothing |

Files and inputs made in the test (`tests/unit/unlock-pdf.test.ts`):

| File or input | Outcome |
| --- | --- |
| `rich.pdf`, `form.pdf`, `tagged.pdf`, `mixed.pdf` and `pages-500.pdf`, each protected with `Qz7 pw#%@ Kv4` (256-bit AES) | Given back with everything kept: bookmarks pointing to their pages, the link and `note.txt` with its contents; both fields with the value `Sample text`; tags, named destination, reading thread, note, link and the tagged field with its value; each page's size and turn; all 500 pages with their text |
| `text.pdf` with 128-bit AES, 128-bit RC4 and 40-bit RC4 (made with `--allow-weak-crypto`, in the test only), each opened with its password and with its password for permissions | Given back, not encrypted, passing the check, without `--allow-weak-crypto` |
| `text.pdf` with only a password for permissions, printing and changes refused | Read as ready with no password; given back with every permission |
| 128-bit RC4 and 128-bit AES files opened with their password for permissions | qpdf's own `encrypt` answer holds the opening password it recovered (`recovereduserpassword`); no value the engine returns, no progress report and no error on the way (a wrong password, a result still encrypted) holds it |
| The passwords `--help`, `@in.pdf` and `--decrypt` | Each taken as a password |
| A file whose encryption names a certificate filter (`/Filter /Adobe.PubSec`, `certificatePdf` in `tests/unit/unlock-helpers.ts`) | Read with one qpdf call as `unsupported` ("… is saved in a way this tool cannot read." with the advice to ask for a copy without this protection); `inspectPdf`, which other tools use, still calls it damaged |
| A writer that copies the input instead of decrypting it | Refused before it is given back: "The unprotected file did not pass its check." |
| `pages-500.pdf` protected, written under a cap of 10,000 bytes | Stopped with `OutputLimit` (`output-limit`) |
| Every failure above, with the marked passwords | No error's message or stack holds a password or its parts |

Measured on 22 Nov 2026 as Protect's were: in Node, each case in a process of its own under the test runner, with qpdf loaded first on `restricted.pdf`, peak the process's highest resident memory including the runner's own; in Chromium, the built page through Playwright at 1280 pixels, from pressing the main button to the result, with the resident memory of every browser process added up and sampled every 0.2 seconds, over its level just before the press, the check timed from the bar passing half way. Each file was first protected with qpdf (256-bit AES, `Qz7 pw#%@ Kv4`). Node's times varied by up to a third between runs on this machine.

| File | In | Out | Node: time (reading and parse, write, check) | Node: peak | Chromium: time (check) | Chromium: peak over baseline |
| --- | --- | --- | --- | --- | --- | --- |
| `pages-500.pdf` | 204,908 bytes | 194,135 bytes | 0.2 s (0.12, 0.04, 0.05) | 0.10 GB | 0.3 s (0.1) | 0.02 GB |
| 120,000 pages (`make-many-pages.mjs`) | 17.4 MB | 17.4 MB, 614 bytes fewer | 12.6 s (4.1, 1.7, 6.8) | 0.35 GB | 6.4 s (3.4) | 0.30 GB |
| `make-large.mjs`'s file | 110.1 MB | 110.1 MB, 1,050 bytes fewer | 2.8 s (0.23, 2.3, 0.27) | 1.09 GB | 2.8 s (0.7) | 0.92 GB |

The reading of the result and its `--check` share one fresh qpdf, as the stage 1 review allowed if memory showed it: on the 100 MB file the Node peak fell from 1.19 GB, with a fresh qpdf for each, to 1.09 GB, in three runs each; on the 120,000-page file both gave 0.35 GB, with the shared one about a second slower, within this machine's spread. The reading of the input stays on a fresh qpdf of its own: reading it on the writer's qpdf before the write gave the same 1.09 GB on the 100 MB file and 0.50 GB on the 120,000-page file. On the 120,000-page file the check takes about half the time, as qpdf's `--check` reads every page; on the 100 MB file, whose size is one picture, the write takes most of it. No genuine file comes near the cap of twice the file and 16 MB: every file shrinks.

`multilingual.pdf` has neither a password nor restrictions, so on its own it gives no file. Protected with a password and then given back with it, every page reads its text and holds its decoded content streams as before (`tests/unit/multilingual.test.ts`). Opening that result in the readers by hand is still owed (issue #7).

### Crop PDF (`src/engines/tools/crop-pdf.ts`, with `measure` in `src/engines/thumbnail.ts`)

Each file was run in Node with the same qpdf, PDF.js and helper data the browser uses, and `@napi-rs/canvas` in place of the worker's `OffscreenCanvas` (`tests/unit/crop-pdf.test.ts`), the encrypted ones with `open-sesame`. Every file given back passes `qpdf --check`, is not encrypted, holds each page's decoded content streams byte for byte as before, keeps each page's paper box, turn, user unit and number of annotations, and its new crop boxes hold all the ink PDF.js draws for the original page. A page is counted as cut when it has a crop box of its own. Sizes in bytes, from a run on 23 Nov 2026.

| File | Before | After | Pages cut | Outcome |
| --- | --- | --- | --- | --- |
| `text.pdf`, `warning.pdf` | 6,057 | 3,566 | 3 of 3 | Cut. qpdf's warning on `warning.pdf` does not stop the job |
| `pages-500.pdf` | 198,025 | 101,925 | 500 of 500 | Cut, in about 4 seconds |
| `password.pdf` (with `open-sesame`), `restricted.pdf` | 7,178 and 7,181 | 3,604 | 3 of 3 | Cut; no password and no restrictions |
| `form.pdf` | 3,189 | 2,662 | 1 of 1 | Cut; both fields and the value `Sample text` kept, inside the new box |
| `mixed.pdf` | 2,257 | 1,646 | 4 of 4 | Cut; each page's paper box and turn as before |
| `rich.pdf` | 2,064 | 1,706 | 2 of 2 | Cut; bookmarks, the link (inside the new box) and `note.txt` kept |
| `tagged.pdf` | 5,118 | 2,537 | 2 of 2 | Cut; tags, named destination, reading thread, note, link and fields kept, every annotation inside its page's box |
| `images.pdf` | 1,642 | 1,562 | 1 of 1 | Cut; the JPEG 2000 picture and the CMYK shapes are inside |
| `multilingual.pdf` | 48,414 | 37,264 | 5 of 5 | Cut; every page's text read by PDF.js as before, and its ink inside the new boxes |
| `compress-bomb-attachment.pdf` | 1,045,278 | 1,044,877 | 1 of 1 | Cut; the attachment is never inflated |
| `compress-lossless.pdf`, `compress-packed.pdf`, `compress-small-jpg.pdf`, `compress-text.pdf` | | | every page | Cut |
| `chinese-unembedded.pdf` | | | 0 | No page cut, so no file ("No pages were cropped."): PDF.js is refused the character map `UniGB-UCS2-H`, so the page is not measured, though its text is not drawn. It is the one page left as it is only because a helper-data request was refused |
| `scanned.pdf`, `compress-kinds.pdf`, `compress-jpeg-mismatch.pdf`, `compress-password.pdf` (with `open-sesame`) | | | 0 | No page cut: their pictures reach the edges of each page |
| `compress-scans.pdf` | | | 0 | No page cut: the grey scan's paper is grey 236, under the white of 240, and the other two pages are filled to their edges |
| `compress-flate-bomb.pdf` | | | 0 | No page cut: the picture whose data inflates to 100 MB is not drawn, so the page is blank to PDF.js and left as it is |

After the stage 2 fix for pictures over PDF.js's size limit (a page whose largest picture is over 16,777,216 pixels is left as it is, before drawing), every file above gave the same outcome: no page changed from cut to uncut. The code reviewer's file (`bigPicturePage` in `tests/unit/crop-helpers.ts`: an A4 page with a 5,000 by 4,000 picture and "Page 1") gives no file, where it was cut to the page number before.
| `compress-json-bomb.pdf` | | | | Fails with "The pages could not be read.", after about 15 seconds: its JSON of dictionaries passes the page-reading cap. The page gives the shared failure |
| `damaged-xref.pdf`, `damaged-cut.pdf`, `not-a-pdf.pdf` | | | | Read as damaged before any job; a run fails with "qpdf could not read the file." |

Files made in the tests (`tests/unit/crop-pdf.test.ts`, `tests/unit/content-box.test.ts`): turned pages (90, 180, 270), offset and reversed paper boxes, a user unit of 2 and of 1,000, an inherited crop box, a poster of 14,400 points, a page of 1 by 100,000,000 points (not measured: the drawing cannot cover it), a page of 200 by 100 points (drawn 288 pixels wide), blank pages, grey 236 and 240 paper, light and hairline lines, an empty borderless field and a link over white space (kept inside), hidden, popup, empty and outside annotations (left out), own and shared bleed, trim and art boxes (cut back as the page's own arrays; a shared box object unchanged; an unreadable one removed), white text `SECRET-margin` in a cut-off margin (still in the content), and files of 2,003 pages, measured in two documents of up to 2,000 pages each, one with unembedded Chinese on page 3, after which no page is measured.

Measured on 23 Nov 2026. In Chromium, the built page through Playwright at 1280 pixels, from pressing the main button to the result, with the resident memory of every browser process added up and sampled every 0.2 seconds, over its level just before the press; the "tenths" are the average over the second and the ninth tenth of the job, to see whether memory grows with the pages measured. In Node, under the test runner, peak the process's highest resident memory, the runner's own included.

| File | In | Out | Chromium: time | Chromium: peak over baseline | Chromium: second and ninth tenth | Node: time | Node: peak |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pages-500.pdf` | 198,025 bytes | 101,925 bytes | 4.4 s | 0.18 GB | 0.07 and 0.09 GB | 4.9 s (pages 4.1 s) | see below |
| `make-large.mjs`'s file (one page) | 110.1 MB | 110.1 MB | 2.4 s | 0.53 GB | | 2.5 s | 0.93 GB |
| 120,000 pages (`make-many-pages.mjs`) | 16.6 MB | 1.1 MB | 1,495 s (about 25 minutes, 12.5 ms a page) | 0.72 GB | 0.29 and 0.40 GB | not measured | see below |

- **Against Add page numbers** on the 100 MB file (1.19 GB in Node, 1.36 GB in Chromium): Crop peaks at 0.93 GB in Node and 0.53 GB over baseline in Chromium.
- **Memory with the page count:** in Chromium, memory rose by about 0.11 GB between the second and the ninth tenth of the 120,000-page job, against 0.72 GB at its peak. PDF.js's page caches are let go every 2,000 pages; what is left rising was not found.
- **Node's memory is not the browser's:** `@napi-rs/canvas` 1.1.0, which only the Node tests use, keeps the memory of every `getImageData` call (about 2.3 MB for an A4 page read in full, with or without garbage collection, outside the test runner too). So `pages-500.pdf` peaks at 1.29 GB in Node, growing by the same amount each page, and the 120,000-page file runs Node out of memory. The worker's `OffscreenCanvas` does not do this, as the Chromium figures show.
- **Time on the 120,000-page file is over the 15 minutes the design set.** Measuring at a lower scale does not help: drawing 1,000 of its pages at half the scale took 15.2 s against 16.1 s, as the time goes to PDF.js's work for each page, not to its pixels. So of the design's two responses, only a sentence beside the 20,000-page notice is left, which needs a per-tool notice in the shared widget; it is not built here and is named in the pull request.
- **Known, not fixed here:** "Page N of M" has no thousands separator (`src/widget/format.ts`), so this file shows "Page 1 of 120000", as on every page tool.
