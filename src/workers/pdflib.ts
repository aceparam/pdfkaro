// pdf-lib (@cantoo/pdf-lib), for engines that write a PDF from nothing (Image to PDF) and for the
// drawing step that draws on the pages of an existing PDF (stamp.ts: Add page numbers, then Watermark and Sign PDF).
// The tool worker loads this file with import() only when such an engine asks for it,
// so pdf-lib is one chunk with a stable name, pdflib-<hash>.js, that the build checks
// can list. pdf-lib imports fflate itself, so fflate's own chunk is fetched with it.

export * from '@cantoo/pdf-lib';
