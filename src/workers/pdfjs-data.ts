// PDF.js's helper data, as one fixed set: the same script for every file, by
// the owner's decision of 11 Nov 2026, so no request ever depends on what a
// PDF needs. The tool worker loads this file with import() when the first
// thumbnail is drawn, never statically, and hands the data to PDF.js from
// memory. Character maps are left out on purpose, as are PDF.js's colour
// profiles, its JavaScript sandbox and its colour decoder (qcms), which PDF.js
// never asks for when it does not fetch for itself; it converts colours in
// JavaScript instead.
//
// The licence of every file is kept beside it in `licences`. Liberation Sans is
// GPL v2 with a font exception, shipped unchanged by the owner's decision.

import FoxitDingbats_pfb from 'pdfjs-dist/standard_fonts/FoxitDingbats.pfb?inline';
import FoxitFixed_pfb from 'pdfjs-dist/standard_fonts/FoxitFixed.pfb?inline';
import FoxitFixedBold_pfb from 'pdfjs-dist/standard_fonts/FoxitFixedBold.pfb?inline';
import FoxitFixedBoldItalic_pfb from 'pdfjs-dist/standard_fonts/FoxitFixedBoldItalic.pfb?inline';
import FoxitFixedItalic_pfb from 'pdfjs-dist/standard_fonts/FoxitFixedItalic.pfb?inline';
import FoxitSerif_pfb from 'pdfjs-dist/standard_fonts/FoxitSerif.pfb?inline';
import FoxitSerifBold_pfb from 'pdfjs-dist/standard_fonts/FoxitSerifBold.pfb?inline';
import FoxitSerifBoldItalic_pfb from 'pdfjs-dist/standard_fonts/FoxitSerifBoldItalic.pfb?inline';
import FoxitSerifItalic_pfb from 'pdfjs-dist/standard_fonts/FoxitSerifItalic.pfb?inline';
import FoxitSymbol_pfb from 'pdfjs-dist/standard_fonts/FoxitSymbol.pfb?inline';
import LiberationSans_Bold_ttf from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?inline';
import LiberationSans_BoldItalic_ttf from 'pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf?inline';
import LiberationSans_Italic_ttf from 'pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?inline';
import LiberationSans_Regular_ttf from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?inline';
import jbig2_wasm from 'pdfjs-dist/wasm/jbig2.wasm?inline';
import openjpeg_wasm from 'pdfjs-dist/wasm/openjpeg.wasm?inline';
import LICENSE_FOXIT_font from 'pdfjs-dist/standard_fonts/LICENSE_FOXIT?raw';
import LICENSE_LIBERATION_font from 'pdfjs-dist/standard_fonts/LICENSE_LIBERATION?raw';
import LICENSE_JBIG2_wasm from 'pdfjs-dist/wasm/LICENSE_JBIG2?raw';
import LICENSE_OPENJPEG_wasm from 'pdfjs-dist/wasm/LICENSE_OPENJPEG?raw';
import LICENSE_PDFJS_JBIG2_wasm from 'pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2?raw';
import LICENSE_PDFJS_OPENJPEG_wasm from 'pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG?raw';

/** Data addresses (base64) by the file name PDF.js asks for. */
const fonts: Record<string, string> = {
  'FoxitDingbats.pfb': FoxitDingbats_pfb,
  'FoxitFixed.pfb': FoxitFixed_pfb,
  'FoxitFixedBold.pfb': FoxitFixedBold_pfb,
  'FoxitFixedBoldItalic.pfb': FoxitFixedBoldItalic_pfb,
  'FoxitFixedItalic.pfb': FoxitFixedItalic_pfb,
  'FoxitSerif.pfb': FoxitSerif_pfb,
  'FoxitSerifBold.pfb': FoxitSerifBold_pfb,
  'FoxitSerifBoldItalic.pfb': FoxitSerifBoldItalic_pfb,
  'FoxitSerifItalic.pfb': FoxitSerifItalic_pfb,
  'FoxitSymbol.pfb': FoxitSymbol_pfb,
  'LiberationSans-Bold.ttf': LiberationSans_Bold_ttf,
  'LiberationSans-BoldItalic.ttf': LiberationSans_BoldItalic_ttf,
  'LiberationSans-Italic.ttf': LiberationSans_Italic_ttf,
  'LiberationSans-Regular.ttf': LiberationSans_Regular_ttf,
};

const decoders: Record<string, string> = {
  'jbig2.wasm': jbig2_wasm,
  'openjpeg.wasm': openjpeg_wasm,
};

/** The licence text of each file shipped here, by the licence file's name. */
export const licences: Record<string, string> = {
  'LICENSE_FOXIT': LICENSE_FOXIT_font,
  'LICENSE_LIBERATION': LICENSE_LIBERATION_font,
  'LICENSE_JBIG2': LICENSE_JBIG2_wasm,
  'LICENSE_OPENJPEG': LICENSE_OPENJPEG_wasm,
  'LICENSE_PDFJS_JBIG2': LICENSE_PDFJS_JBIG2_wasm,
  'LICENSE_PDFJS_OPENJPEG': LICENSE_PDFJS_OPENJPEG_wasm,
};

function bytesOf(dataAddress: string): Uint8Array {
  const base64 = dataAddress.slice(dataAddress.indexOf(',') + 1);
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return bytes;
}

export type PdfjsData = {
  /** A standard font by file name, or undefined when there is none by that name. */
  font(name: string): Uint8Array | undefined;
  /** A WebAssembly decoder by file name, or undefined. */
  decoder(name: string): Uint8Array | undefined;
};

/** The fixed helper data. Each call gives fresh bytes, as PDF.js may take ownership of them. */
export const pdfjsData: PdfjsData = {
  font: (name) => (Object.hasOwn(fonts, name) ? bytesOf(fonts[name]!) : undefined),
  decoder: (name) => (Object.hasOwn(decoders, name) ? bytesOf(decoders[name]!) : undefined),
};
