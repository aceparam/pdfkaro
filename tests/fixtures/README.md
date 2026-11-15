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

| File | What it is |
| --- | --- |
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
