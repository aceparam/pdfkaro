# Engine outcomes against every fixture (task 2.4)

From `ENGINE_LOADS_REPORT=… npx vitest run tests/unit/engine-loads`, run on this branch. For each engine: the libraries its steps asked for (always within its declared set), then each fixture's outcome: `inspect` without and with its password where it has one, and the job. "failed (Error)" is the engine refusing the file, which the page never runs (it shows the file as damaged, unsupported or needing a password first).

## add-page-numbers

Asked for: inspect qpdf; run pdflib, qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | failed (Error) |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## compress-pdf

Asked for: inspect qpdf; run fflate, qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | no new file |
| `compress-flate-bomb.pdf` | ready / ready | no new file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | no new file |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | no new file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## delete-pdf-pages

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | failed (Error) |
| `compress-flate-bomb.pdf` | ready / ready | failed (Error) |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | failed (Error) |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | failed (Error) |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | failed (Error) |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | failed (Error) |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | failed (Error) |
| `images.pdf` | ready / ready | failed (Error) |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## extract-pdf-pages

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | 1 file |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## images-to-pdf

Asked for: inspect fflate; run fflate, pdflib

| Input | Read | Job |
| --- | --- | --- |
| `alpha.png` | ready / ready | 1 file |
| `animated.png` | ready / ready | 1 file |
| `arithmetic.jpg` | unsupported / unsupported | failed (Error) |
| `bad-profile.jpg` | ready / ready | 1 file |
| `bad-profile.png` | ready / ready | 1 file |
| `bomb-profile.png` | ready / ready | 1 file |
| `broken.jpg` | damaged / damaged | failed (Error) |
| `broken.png` | damaged / damaged | failed (Error) |
| `cmyk.jpg` | ready / ready | 1 file |
| `data-bomb.png` | damaged / damaged | failed (Error) |
| `details-progressive.jpg` | ready / ready | 1 file |
| `details.jpg` | ready / ready | 1 file |
| `details.png` | ready / ready | 1 file |
| `grey-profile.png` | ready / ready | 1 file |
| `grey-scan.jpg` | ready / ready | 1 file |
| `grey16.png` | ready / ready | 1 file |
| `huge.jpg` | ready / ready | 1 file |
| `huge.png` | ready / ready | 1 file |
| `p3.jpg` | ready / ready | 1 file |
| `palette.png` | ready / ready | 1 file |
| `profile.png` | ready / ready | 1 file |
| `progressive.jpg` | ready / ready | 1 file |
| `scan-g4.tif` | damaged / damaged | failed (Error) |
| `screenshot.png` | ready / ready | 1 file |
| `small.png` | ready / ready | 1 file |
| `tall.jpg` | ready / ready | 1 file |
| `text-bomb.png` | ready / ready | 1 file |
| `turn-1.jpg` | ready / ready | 1 file |
| `turn-2.jpg` | ready / ready | 1 file |
| `turn-3.jpg` | ready / ready | 1 file |
| `turn-4.jpg` | ready / ready | 1 file |
| `turn-5.jpg` | ready / ready | 1 file |
| `turn-6.jpg` | ready / ready | 1 file |
| `turn-6.png` | ready / ready | 1 file |
| `turn-7.jpg` | ready / ready | 1 file |
| `turn-8.jpg` | ready / ready | 1 file |
| `wide.jpg` | ready / ready | 1 file |
| `zero-size.png` | damaged / damaged | failed (Error) |
| `compress-bomb-attachment.pdf` | damaged / damaged | failed (Error) |
| `compress-flate-bomb.pdf` | damaged / damaged | failed (Error) |
| `compress-jpeg-mismatch.pdf` | damaged / damaged | failed (Error) |
| `compress-json-bomb.pdf` | damaged / damaged | failed (Error) |
| `compress-kinds.pdf` | damaged / damaged | failed (Error) |
| `compress-lossless.pdf` | damaged / damaged | failed (Error) |
| `compress-packed.pdf` | damaged / damaged | failed (Error) |
| `compress-password.pdf` | damaged / damaged | failed (Error) |
| `compress-scans.pdf` | damaged / damaged | failed (Error) |
| `compress-small-jpg.pdf` | damaged / damaged | failed (Error) |
| `compress-text.pdf` | damaged / damaged | failed (Error) |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | damaged / damaged | failed (Error) |
| `images.pdf` | damaged / damaged | failed (Error) |
| `mixed.pdf` | damaged / damaged | failed (Error) |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | damaged / damaged | failed (Error) |
| `password.pdf` | damaged / damaged | failed (Error) |
| `restricted.pdf` | damaged / damaged | failed (Error) |
| `rich.pdf` | damaged / damaged | failed (Error) |
| `scanned.pdf` | damaged / damaged | failed (Error) |
| `tagged.pdf` | damaged / damaged | failed (Error) |
| `text.pdf` | damaged / damaged | failed (Error) |
| `warning.pdf` | damaged / damaged | failed (Error) |

## merge-pdf

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | 1 file |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## pdf-to-images

Asked for: inspect qpdf; run pdfjs

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 2 files |
| `compress-json-bomb.pdf` | ready / ready | 1 file |
| `compress-kinds.pdf` | ready / ready | 7 files |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 3 files |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 3 files |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 3 files |
| `damaged-cut.pdf` | damaged / damaged | failed (InvalidPDFException) |
| `damaged-xref.pdf` | damaged / damaged | 3 files |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 4 files |
| `not-a-pdf.pdf` | damaged / damaged | failed (InvalidPDFException) |
| `pages-500.pdf` | ready / ready | 500 files |
| `password.pdf` | needs-password / ready | 3 files |
| `restricted.pdf` | ready / ready | 3 files |
| `rich.pdf` | ready / ready | 2 files |
| `scanned.pdf` | ready / ready | 2 files |
| `tagged.pdf` | ready / ready | 2 files |
| `text.pdf` | ready / ready | 3 files |
| `warning.pdf` | ready / ready | 3 files |

## protect-pdf

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | 1 file |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## rearrange-pdf-pages

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | 1 file |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## rotate-pdf

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | 1 file |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |

## sign-pdf

Asked for: inspect qpdf; inspectPicture fflate; run fflate, pdflib, qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | failed (Error) |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |
| `text.pdf, drawn` | - | 1 file |
| `text.pdf, picture alpha.png` | - | 1 file |
| `text.pdf, picture animated.png` | - | 1 file |
| `text.pdf, picture arithmetic.jpg` | - | failed (PictureRefused) |
| `text.pdf, picture bad-profile.jpg` | - | 1 file |
| `text.pdf, picture bad-profile.png` | - | 1 file |
| `text.pdf, picture bomb-profile.png` | - | 1 file |
| `text.pdf, picture broken.jpg` | - | failed (PictureRefused) |
| `text.pdf, picture broken.png` | - | failed (PictureRefused) |
| `text.pdf, picture cmyk.jpg` | - | 1 file |
| `text.pdf, picture data-bomb.png` | - | failed (PictureRefused) |
| `text.pdf, picture details-progressive.jpg` | - | 1 file |
| `text.pdf, picture details.jpg` | - | 1 file |
| `text.pdf, picture details.png` | - | 1 file |
| `text.pdf, picture grey-profile.png` | - | 1 file |
| `text.pdf, picture grey-scan.jpg` | - | 1 file |
| `text.pdf, picture grey16.png` | - | 1 file |
| `text.pdf, picture huge.jpg` | - | failed (Error) |
| `text.pdf, picture huge.png` | - | 1 file |
| `text.pdf, picture p3.jpg` | - | 1 file |
| `text.pdf, picture palette.png` | - | 1 file |
| `text.pdf, picture profile.png` | - | 1 file |
| `text.pdf, picture progressive.jpg` | - | 1 file |
| `text.pdf, picture scan-g4.tif` | - | failed (PictureRefused) |
| `text.pdf, picture screenshot.png` | - | 1 file |
| `text.pdf, picture small.png` | - | 1 file |
| `text.pdf, picture tall.jpg` | - | 1 file |
| `text.pdf, picture text-bomb.png` | - | 1 file |
| `text.pdf, picture turn-1.jpg` | - | 1 file |
| `text.pdf, picture turn-2.jpg` | - | 1 file |
| `text.pdf, picture turn-3.jpg` | - | 1 file |
| `text.pdf, picture turn-4.jpg` | - | 1 file |
| `text.pdf, picture turn-5.jpg` | - | 1 file |
| `text.pdf, picture turn-6.jpg` | - | 1 file |
| `text.pdf, picture turn-6.png` | - | 1 file |
| `text.pdf, picture turn-7.jpg` | - | 1 file |
| `text.pdf, picture turn-8.jpg` | - | 1 file |
| `text.pdf, picture wide.jpg` | - | 1 file |
| `text.pdf, picture zero-size.png` | - | failed (PictureRefused) |

Picture reads (63 files, every picture and PDF fixture): damaged 30, ready 32, unsupported 1

## split-pdf

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 2 files |
| `compress-json-bomb.pdf` | ready / ready | 1 file |
| `compress-kinds.pdf` | ready / ready | 7 files |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 3 files |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 3 files |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 3 files |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 4 files |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 500 files |
| `password.pdf` | needs-password / ready | 3 files |
| `restricted.pdf` | ready / ready | 3 files |
| `rich.pdf` | ready / ready | 2 files |
| `scanned.pdf` | ready / ready | 2 files |
| `tagged.pdf` | ready / ready | 2 files |
| `text.pdf` | ready / ready | 3 files |
| `warning.pdf` | ready / ready | 3 files |

## unlock-pdf

Asked for: inspect qpdf; run qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | no new file |
| `compress-flate-bomb.pdf` | ready / ready | no new file |
| `compress-jpeg-mismatch.pdf` | ready / ready | no new file |
| `compress-json-bomb.pdf` | ready / ready | no new file |
| `compress-kinds.pdf` | ready / ready | no new file |
| `compress-lossless.pdf` | ready / ready | no new file |
| `compress-packed.pdf` | ready / ready | no new file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | no new file |
| `compress-small-jpg.pdf` | ready / ready | no new file |
| `compress-text.pdf` | ready / ready | no new file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | no new file |
| `images.pdf` | ready / ready | no new file |
| `mixed.pdf` | ready / ready | no new file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | no new file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | no new file |
| `scanned.pdf` | ready / ready | no new file |
| `tagged.pdf` | ready / ready | no new file |
| `text.pdf` | ready / ready | no new file |
| `warning.pdf` | ready / ready | no new file |

## watermark-pdf

Asked for: inspect qpdf; run pdflib, qpdf

| Input | Read | Job |
| --- | --- | --- |
| `compress-bomb-attachment.pdf` | ready / ready | 1 file |
| `compress-flate-bomb.pdf` | ready / ready | 1 file |
| `compress-jpeg-mismatch.pdf` | ready / ready | 1 file |
| `compress-json-bomb.pdf` | ready / ready | failed (Error) |
| `compress-kinds.pdf` | ready / ready | 1 file |
| `compress-lossless.pdf` | ready / ready | 1 file |
| `compress-packed.pdf` | ready / ready | 1 file |
| `compress-password.pdf` | needs-password / ready | 1 file |
| `compress-scans.pdf` | ready / ready | 1 file |
| `compress-small-jpg.pdf` | ready / ready | 1 file |
| `compress-text.pdf` | ready / ready | 1 file |
| `damaged-cut.pdf` | damaged / damaged | failed (Error) |
| `damaged-xref.pdf` | damaged / damaged | failed (Error) |
| `form.pdf` | ready / ready | 1 file |
| `images.pdf` | ready / ready | 1 file |
| `mixed.pdf` | ready / ready | 1 file |
| `not-a-pdf.pdf` | damaged / damaged | failed (Error) |
| `pages-500.pdf` | ready / ready | 1 file |
| `password.pdf` | needs-password / ready | 1 file |
| `restricted.pdf` | ready / ready | 1 file |
| `rich.pdf` | ready / ready | 1 file |
| `scanned.pdf` | ready / ready | 1 file |
| `tagged.pdf` | ready / ready | 1 file |
| `text.pdf` | ready / ready | 1 file |
| `warning.pdf` | ready / ready | 1 file |
