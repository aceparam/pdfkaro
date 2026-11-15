// Every tool URL in the "Tool catalogue" tables of SPEC.md, as a type.
// This file holds a type only, with no value at run time. Nothing is generated
// from it; registry.ts stays the one place a tool is declared. The type exists
// so that a misspelt slug in the registry fails the type check.
//
// Two owner changes since the export (13 Nov 2026): Image to PDF is served at
// /image-to-pdf, beside /jpg-to-pdf and /png-to-pdf, and /image2pdf is dropped.

export type CatalogueSlug =
  // Organise pages
  | 'merge-pdf'
  | 'split-pdf'
  | 'extract-pdf-pages'
  | 'delete-pdf-pages'
  | 'rearrange-pdf-pages'
  | 'rotate-pdf'
  | 'crop-pdf'
  | 'resize-pdf'
  | 'add-pages-to-pdf'
  | 'pdf-pages-per-sheet'
  | 'pdf-booklet'
  | 'alternate-mix-pdf'
  | 'image-to-pdf'
  // Make smaller and fix
  | 'compress-pdf'
  | 'compress-pdf-to-100kb'
  | 'compress-pdf-to-200kb'
  | 'compress-pdf-to-500kb'
  | 'compress-pdf-to-1mb'
  | 'compress-pdf-to-2mb'
  | 'grayscale-pdf'
  | 'repair-pdf'
  | 'flatten-pdf'
  | 'pdf-to-pdfa'
  // Convert to PDF
  | 'jpg-to-pdf'
  | 'png-to-pdf'
  | 'heic-to-pdf'
  | 'webp-to-pdf'
  | 'tiff-to-pdf'
  | 'word-to-pdf'
  | 'excel-to-pdf'
  | 'powerpoint-to-pdf'
  | 'html-to-pdf'
  | 'text-to-pdf'
  | 'markdown-to-pdf'
  | 'scan-to-pdf'
  // Convert from PDF
  | 'pdf-to-jpg'
  | 'pdf-to-png'
  | 'pdf-to-text'
  | 'extract-images-from-pdf'
  | 'pdf-to-word'
  | 'pdf-to-excel'
  | 'pdf-to-powerpoint'
  | 'pdf-to-markdown'
  // Edit and sign
  | 'add-page-numbers-to-pdf'
  | 'watermark-pdf'
  | 'sign-pdf'
  | 'fill-pdf-form'
  | 'edit-pdf'
  | 'edit-pdf-metadata'
  | 'add-header-footer-to-pdf'
  | 'bates-numbering'
  | 'pdf-bookmarks'
  // Protect
  | 'protect-pdf'
  | 'unlock-pdf'
  | 'redact-pdf'
  | 'remove-pdf-metadata'
  | 'digitally-sign-pdf'
  // Read and check
  | 'ocr-pdf'
  | 'pdf-info'
  | 'compare-pdf'
  | 'pdf-viewer';
