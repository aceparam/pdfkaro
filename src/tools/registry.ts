// The one place a tool is declared. Pages, the home page list and related
// links are all generated from this file. Data and types only: no logic here.

import type { CatalogueSlug } from './catalogue';
import type { OutputExtension } from '../widget/format';

export type GroupId = 'organise' | 'smaller' | 'to-pdf' | 'from-pdf' | 'edit' | 'protect' | 'read';

export type Group = {
  id: GroupId;
  name: string;
};

/** One URL that a tool serves. Most tools have one; some have several. */
export type ToolPage = {
  /** The URL, at the site root. A published slug never changes. */
  slug: CatalogueSlug;
  /** Link text in lists. */
  name: string;
  /** One line for lists. */
  summary: string;
  /** Title tag: the job first, then the brand, under 60 characters. */
  title: string;
  /** Meta description, under 155 characters. */
  description: string;
  /** The one h1 on the page. */
  heading: string;
  /** What the tool does and where the file goes. */
  sentence: string;
  /** File types this URL accepts, when they differ from the tool's own list. */
  accepts?: string[];
  /** Options already chosen when this URL opens, such as a target size. Engine options only; the engine checks them. */
  preset?: Record<string, string | number | boolean>;
  /**
   * Widget words this URL says differently from the tool's, such as the main button of a
   * page whose preset sets the result's format. Only these keys; `pageWords` in queries.ts merges them.
   */
  words?: PageWords;
};

/** The widget words a page may say differently from its tool's. */
export type PageWords = Partial<Pick<ToolWidgetWords, 'actionLabel' | 'resultNotes' | 'outputExtension'>>;

/**
 * When an option is shown: only while the earlier choice `key` of the same tool holds `value`.
 * The registry test checks that `key` is a choice listed earlier with no condition of its own,
 * that `value` is one of its values, and that a tool's first option has none.
 */
export type OptionCondition = { key: string; value: string };

/**
 * A choice of one value from several, drawn as radio buttons. The values each tool accepts are
 * also written in src/widget/option-values.ts, which its engine reads; the registry test checks
 * the two lists are the same.
 */
export type ChoiceOption = {
  kind: 'choice';
  /** The key the engine receives: `position`. No page preset of the tool uses it. */
  key: string;
  /** The group's visible name: "Where the numbers go". */
  legend: string;
  /** The values, in the order shown, each with its label. */
  choices: { value: string; label: string }[];
  /** The value chosen at first, with which the main button works. */
  initial: string;
  /** Shown only while the earlier choice `key` holds `value` (src/widget/options.ts). Left out, always shown. */
  when?: OptionCondition;
};

/**
 * A typed text, one line. It is the job's input: it starts empty, and the main button waits until
 * it holds text. Its most characters and character rule are written once, in
 * src/widget/option-values.ts (`optionTexts`), by tool id and key; the registry holds only its words.
 */
export type TextOption = {
  kind: 'text';
  /** The key the engine receives: `text`. No page preset of the tool uses it. */
  key: string;
  /** The field's visible label: "Watermark text". */
  label: string;
  /** Under the field, read with it: what it takes. "Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks." */
  hint: string;
  /** Tied to the main button while the field holds no text: "Type the watermark text first." */
  emptySentence: string;
  /** When the engine refuses the text. Left out: "The text could not be used. Check it and try again." */
  refusedSentence?: string;
  /** Shown only while the earlier choice `key` holds `value` (src/widget/options.ts). Left out, always shown. */
  when?: OptionCondition;
};

/**
 * A drawing on a pad, with a finger, a mouse or a pen. It is the job's input: it starts empty, and the
 * main button waits until something is drawn. It needs a pointer, so it is never a tool's first option
 * (the registry test), and its hint names the tool's way to do the job without drawing. Its limits are
 * written once, in src/widget/option-values.ts (`optionDrawings`); the registry holds only its words.
 */
export type DrawingOption = {
  kind: 'drawing';
  /** The key the engine receives: `drawing`. No page preset of the tool uses it. */
  key: string;
  /** Above the box, naming it: "Draw your signature". */
  label: string;
  /** Under the box, describing it: how to draw, and the way to do the job without drawing. */
  hint: string;
  /** The button that empties the box: "Clear the drawing". */
  clearLabel: string;
  /** Tied to the main button while nothing is drawn: "Draw your signature first." */
  emptySentence: string;
  /** When the engine refuses the drawing. Left out: "The drawing could not be used. Clear it and draw again." */
  refusedSentence?: string;
  /** Shown only while the earlier choice `key` holds `value` (src/widget/options.ts). Left out, always shown. */
  when?: OptionCondition;
};

/**
 * An option a tool's working area shows once its file has been read, below the file and above
 * the main button, in registry order: a choice, a text or a drawing. One with a condition (`when`)
 * is shown, held and sent only while its condition holds.
 */
export type ToolOption = ChoiceOption | TextOption | DrawingOption;

/** The kinds of per-page toggle. What each means is in src/widget/toggles.ts. */
export type ToggleKind = 'cut-after' | 'take' | 'drop';

/**
 * The words and rules a tool's widget uses. Everything here is plain text or
 * numbers, because it is passed from the page to the widget island.
 */
export type ToolWidgetWords = {
  /** The picker button: "Choose PDF files". */
  pickerLabel: string;
  /** The picker once files are listed: "Add more files". */
  addLabel: string;
  /** Under the picker: "You can also drop files anywhere on this page, or paste them." */
  dropHint: string;
  /** What a refused file is not: "a PDF", as in "notes.txt is not a PDF, so it was not added." */
  acceptsName: string;
  /** Said once after the names of refused files: "To add a picture of another kind, save it as a JPG or PNG first." */
  refusedAdvice?: string;
  /** Said under "… is saved in a way this tool cannot read.": what to do with such a file. Without it, only leaving it out is offered. */
  unsupportedAdvice?: string;
  /** Said under "… is damaged and cannot be read.": what to try with such a file. Without it, only leaving it out is offered. */
  damagedAdvice?: string;
  /** Under the summary of listed files, if the order matters: "They will be joined in this order." */
  listNote?: string;
  /**
   * `false` leaves the page count out of each row and the summary, for a tool
   * whose every file is one page and whose list note says so (Image to PDF).
   */
  listPages?: false;
  /** The main button, named after the result: "Merge and download". */
  actionLabel: string;
  /** While the result is written: "Writing the merged file". */
  writingLabel: string;
  /** Above the result: "Your merged file is ready". */
  doneHeading: string;
  /** When a job fails: "The merge did not finish." */
  failedHeading: string;
  /** Tied to the main button while too few files are listed: "Add at least one more file to merge." */
  tooFewFiles: string;
  /** Put after the first input's name to name the result: "merged". Empty adds no word: "IMG_2041.pdf". */
  outputSuffix: string;
  /**
   * The extension of each output, alone or inside a zip, which the download's type follows.
   * Left out, `pdf`. A page whose preset sets the format says it in its own words (PDF to JPG).
   */
  outputExtension?: OutputExtension;
  /** How many files the tool needs before it can run. */
  minFiles: number;
  /** Whether the picker takes several files at once. */
  multiple: boolean;
  /**
   * Where a single result's page count comes from, so the page can say it:
   * the inputs added up, the one input as it was, or not known.
   */
  resultPages: 'sum' | 'input' | 'none';
  /** After running out of memory, the one thing to try. Without it: "Try fewer or smaller files." */
  memoryAdvice?: string;
  /** For a tool that gives several files: the one thing to try when they would not fit in one zip. */
  zipLimitAdvice?: string;
  /**
   * A toggle on each page, for a tool that lists pages. `kind` says what the
   * toggles mean, which decides the option sent to the engine, which pages have
   * none and the line that says what the main button will give. `label` is its
   * visible text. What each kind means, including when it holds the main
   * button back and how many pages the result has, is in src/widget/toggles.ts.
   */
  itemToggle?: { kind: ToggleKind; label: string };
  /** For a tool that lists pages: each page turns, by "Turn left" and "Turn right" under it (Rotate PDF). */
  itemTurns?: true;
  /** For a tool that makes a file smaller: the result shows the input's size beside the new one, "4.2 MB, was 11.8 MB". */
  resultWas?: true;
  /**
   * For a tool whose engine can give no file because the file could not be improved (Compress PDF):
   * the heading shown in place of the result, and the one thing to try. Without it, no file is the engine's failure.
   */
  noSmaller?: { heading: string; advice: string };
  /** Plain notes shown with the result, such as what was not carried over. */
  resultNotes: string[];
  /** The options the working area shows, in order. Left out, none. */
  options?: ToolOption[];
  /** What the list shows: one item per file, or the pages of one file. */
  items: 'files' | 'pages';
  /** Whether items have Move up, Move down and Remove, and can be dragged. */
  itemControls: boolean;
} & (
  | {
      /** A run gives one file. */
      outputs: 'one';
      partSuffix?: never;
    }
  | {
      /** A run can give several files, which come back as one zip. */
      outputs: 'several';
      /** The word for files inside the zip: "part", as in "report-part-1.pdf". */
      partSuffix: string;
    }
);

export type Tool = {
  id: string;
  group: GroupId;
  /** Where the file is processed. */
  runsIn: 'browser' | 'server';
  /** The build phase in which the tool ships. */
  phase: 1 | 2 | 3;
  /** File types the tool accepts, as MIME types. */
  accepts: string[];
  /** Four to six related tools, by slug. A page links only to those that are published. */
  related: CatalogueSlug[];
  /** Every URL the tool serves. */
  pages: ToolPage[];
  /** The widget's words. A tool without them has no working widget yet. */
  widget?: ToolWidgetWords;
};

/** The seven groups, in the order the home page shows them. */
export const groups: Group[] = [
  { id: 'organise', name: 'Organise pages' },
  { id: 'smaller', name: 'Make smaller and fix' },
  { id: 'to-pdf', name: 'Convert to PDF' },
  { id: 'from-pdf', name: 'Convert from PDF' },
  { id: 'edit', name: 'Edit and sign' },
  { id: 'protect', name: 'Protect' },
  { id: 'read', name: 'Read and check' },
];

// A tool is published when it has an entry here. An entry is added in the
// tool's first change. Wording below is a draft for the owner to review.
export const tools: Tool[] = [
  {
    id: 'merge-pdf',
    group: 'organise',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['split-pdf', 'rearrange-pdf-pages', 'rotate-pdf', 'compress-pdf', 'jpg-to-pdf'],
    pages: [
      {
        slug: 'merge-pdf',
        name: 'Merge PDF',
        summary: 'Combine several PDFs into one.',
        title: 'Merge PDF files in your browser - PDFkaro',
        description:
          'Combine several PDF files into one, in the order you choose. The files stay on your device and are not uploaded.',
        heading: 'Merge PDF files',
        sentence: 'Combine several PDFs into one. Files stay on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose PDF files',
      addLabel: 'Add more files',
      dropHint: 'You can also drop files anywhere on this page, or paste them.',
      acceptsName: 'a PDF',
      listNote: 'They will be joined in this order.',
      actionLabel: 'Merge and download',
      writingLabel: 'Writing the merged file',
      doneHeading: 'Your merged file is ready',
      failedHeading: 'The merge did not finish.',
      tooFewFiles: 'Add at least one more file to merge.',
      outputSuffix: 'merged',
      minFiles: 2,
      multiple: true,
      resultPages: 'sum',
      // Both by the owner's decisions of 11 Nov 2026.
      items: 'files',
      itemControls: true,
      outputs: 'one',
      resultNotes: [
        'Bookmarks and attachments come from the first file only.',
        'The merged file has no password and no restrictions, even if a file you chose had them.',
      ],
    },
  },
  {
    id: 'split-pdf',
    group: 'organise',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['merge-pdf', 'extract-pdf-pages', 'delete-pdf-pages', 'rearrange-pdf-pages', 'rotate-pdf'],
    pages: [
      {
        slug: 'split-pdf',
        name: 'Split PDF',
        summary: 'Cut one PDF into several.',
        title: 'Split a PDF file in your browser - PDFkaro',
        description: 'Cut one PDF into several files at the pages you choose, or one file per page. The file stays on your device and is not uploaded.',
        heading: 'Split a PDF file',
        sentence: 'Cut one PDF into several. Files stay on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Split and download',
      writingLabel: 'Putting the files into one zip',
      doneHeading: 'Your files are ready',
      failedHeading: 'The split did not finish.',
      tooFewFiles: 'Choose a PDF file to split.',
      outputSuffix: 'split',
      minFiles: 1,
      multiple: false,
      resultPages: 'input',
      memoryAdvice: 'Mark cuts so the file is split into fewer parts, then try again.',
      zipLimitAdvice: 'Mark cuts so the file is split into fewer parts.',
      items: 'pages',
      itemControls: false,
      itemToggle: { kind: 'cut-after', label: 'Cut after' },
      outputs: 'several',
      partSuffix: 'part',
      // The owner's decisions of 12 Nov 2026.
      resultNotes: [
        'Each file keeps the bookmarks that point to its own pages. Files attached to the document go with the first file only.',
        'The new files have no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
  {
    id: 'extract-pdf-pages',
    group: 'organise',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['split-pdf', 'delete-pdf-pages', 'merge-pdf', 'rearrange-pdf-pages', 'rotate-pdf'],
    pages: [
      {
        slug: 'extract-pdf-pages',
        name: 'Extract pages',
        summary: 'Copy chosen pages into a new PDF.',
        title: 'Extract pages from a PDF in your browser - PDFkaro',
        description: 'Copy the pages you choose from a PDF into a new file. The file stays on your device and is not uploaded.',
        heading: 'Extract pages from a PDF',
        sentence: 'Copy the pages you choose into a new PDF. Files stay on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Extract and download',
      writingLabel: 'Writing the new file',
      doneHeading: 'Your new file is ready',
      failedHeading: 'The new file was not made.',
      tooFewFiles: 'Choose a PDF file to take pages from.',
      outputSuffix: 'extracted',
      minFiles: 1,
      multiple: false,
      // The result's page count comes from the take toggle (src/widget/toggles.ts), not from here.
      resultPages: 'none',
      items: 'pages',
      itemControls: false,
      itemToggle: { kind: 'take', label: 'Take' },
      outputs: 'one',
      // The owner's decisions of 13 Nov 2026.
      resultNotes: [
        'The new file keeps the bookmarks that point to its pages, and the files attached to the document.',
        "It also keeps the document's details, accessibility tags, the names of links inside it and reading threads whole. These can describe or name pages you did not take. In a file with accessibility tags, they can also bring along those pages' form fields, with what was typed in them, their notes, and their links with the web addresses they open.",
        'The new file has no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
  {
    id: 'delete-pdf-pages',
    group: 'organise',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['extract-pdf-pages', 'split-pdf', 'rearrange-pdf-pages', 'rotate-pdf', 'merge-pdf'],
    pages: [
      {
        slug: 'delete-pdf-pages',
        name: 'Delete pages',
        summary: 'Remove chosen pages from a PDF.',
        title: 'Delete pages from a PDF in your browser - PDFkaro',
        description: 'Remove the pages you choose from a PDF. The file stays on your device and is not uploaded.',
        heading: 'Delete pages from a PDF',
        sentence: 'Remove the pages you choose from a PDF. Files stay on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Delete and download',
      writingLabel: 'Writing the new file',
      doneHeading: 'Your new file is ready',
      failedHeading: 'The new file was not made.',
      tooFewFiles: 'Choose a PDF file to delete pages from.',
      outputSuffix: 'pages-deleted',
      minFiles: 1,
      multiple: false,
      // The result's page count comes from the drop toggle (src/widget/toggles.ts), not from here.
      resultPages: 'none',
      items: 'pages',
      itemControls: false,
      itemToggle: { kind: 'drop', label: 'Delete' },
      outputs: 'one',
      // The owner's decisions of 13 Nov 2026.
      resultNotes: [
        'The new file keeps the bookmarks that point to its pages, and the files attached to the document.',
        "It also keeps the document's details, accessibility tags, the names of links inside it and reading threads whole. These can describe or name the pages you deleted. In a file with accessibility tags, they can also keep those pages' form fields, with what was typed in them, their notes, and their links with the web addresses they open.",
        'The new file has no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
  {
    id: 'rearrange-pdf-pages',
    group: 'organise',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['delete-pdf-pages', 'extract-pdf-pages', 'rotate-pdf', 'split-pdf', 'merge-pdf'],
    pages: [
      {
        slug: 'rearrange-pdf-pages',
        name: 'Reorder pages',
        summary: 'Put the pages of a PDF in a new order.',
        title: 'Reorder the pages of a PDF in your browser - PDFkaro',
        description: 'Put the pages of a PDF in the order you want. The file stays on your device and is not uploaded.',
        heading: 'Reorder the pages of a PDF',
        sentence: 'Put the pages of a PDF in the order you want. Your file stays on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Reorder and download',
      writingLabel: 'Writing the new file',
      doneHeading: 'Your new file is ready',
      failedHeading: 'The new file was not made.',
      tooFewFiles: 'Choose a PDF file to reorder.',
      outputSuffix: 'reordered',
      minFiles: 1,
      multiple: false,
      resultPages: 'input',
      items: 'pages',
      // The pages move: "Earlier" and "Later" under each, and drag.
      itemControls: true,
      outputs: 'one',
      // The owner's decision of 13 Nov 2026 on passwords; the rest is left as it was.
      resultNotes: [
        'The new file keeps every page, and its bookmarks still point to the same pages, wherever they now are. Files attached to the document are kept.',
        'The list of bookmarks keeps its order. In a file with accessibility tags, a screen reader may still read the pages in their original order.',
        'The new file has no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
  {
    id: 'rotate-pdf',
    group: 'organise',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['rearrange-pdf-pages', 'delete-pdf-pages', 'extract-pdf-pages', 'split-pdf', 'merge-pdf'],
    pages: [
      {
        slug: 'rotate-pdf',
        name: 'Rotate PDF',
        summary: 'Turn the pages of a PDF.',
        title: 'Rotate PDF pages in your browser - PDFkaro',
        description: 'Turn one page or every page of a PDF. The file stays on your device and is not uploaded.',
        heading: 'Rotate PDF pages',
        sentence: 'Turn one page or every page of a PDF. Your file stays on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Turn and download',
      writingLabel: 'Writing the new file',
      doneHeading: 'Your new file is ready',
      failedHeading: 'The new file was not made.',
      tooFewFiles: 'Choose a PDF file to turn its pages.',
      outputSuffix: 'rotated',
      minFiles: 1,
      multiple: false,
      resultPages: 'input',
      items: 'pages',
      itemControls: false,
      itemTurns: true,
      outputs: 'one',
      // The owner's decision of 13 Nov 2026 on passwords; only each page's turn changes.
      resultNotes: [
        "Pages, text, links, form fields, bookmarks, attached files, hidden text and the document's details are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.",
        'The new file has no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
  {
    // One tool with three pages, by the owner's decision of 13 Nov 2026. It sits at
    // /image2pdf's place in catalogue order ("Organise pages", after Rotate PDF), but
    // all three pages are listed under "Convert to PDF", where people look for a conversion.
    id: 'images-to-pdf',
    group: 'to-pdf',
    runsIn: 'browser',
    phase: 1,
    accepts: ['image/jpeg', 'image/png'],
    related: ['merge-pdf', 'compress-pdf', 'pdf-to-jpg', 'rotate-pdf', 'rearrange-pdf-pages'],
    pages: [
      {
        slug: 'jpg-to-pdf',
        name: 'JPG to PDF',
        summary: 'Turn JPG photos into one PDF.',
        title: 'Convert JPG to PDF in your browser - PDFkaro',
        description: 'Turn JPG photos into one PDF, in the order you choose. The photos stay on your device and are not uploaded.',
        heading: 'Convert JPG to PDF',
        sentence: 'Turn one or more JPG photos into one PDF. Files stay on your device.',
      },
      {
        slug: 'png-to-pdf',
        name: 'PNG to PDF',
        summary: 'Turn PNG pictures and screenshots into one PDF.',
        title: 'Convert PNG to PDF in your browser - PDFkaro',
        description: 'Turn PNG pictures and screenshots into one PDF. The pictures stay on your device and are not uploaded.',
        heading: 'Convert PNG to PDF',
        sentence: 'Turn one or more PNG pictures or screenshots into one PDF. Files stay on your device.',
      },
      {
        slug: 'image-to-pdf',
        name: 'Image to PDF',
        summary: 'Turn JPG and PNG pictures into one PDF.',
        title: 'Convert images to PDF in your browser - PDFkaro',
        description: 'Turn JPG and PNG pictures into one PDF, in the order you choose. The pictures stay on your device and are not uploaded.',
        heading: 'Convert images to PDF',
        sentence: 'Turn JPG and PNG pictures into one PDF, in the order you choose. Files stay on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose pictures',
      addLabel: 'Add more pictures',
      dropHint: 'You can also drop pictures anywhere on this page, or paste them.',
      acceptsName: 'a JPG or PNG picture',
      refusedAdvice: 'To add a picture of another kind, save it as a JPG or PNG first.',
      unsupportedAdvice: 'Open it in a photo app, save a copy as a JPG, and add the copy.',
      damagedAdvice: 'Open it in a photo app, save a copy, and add the copy.',
      listNote: 'Each picture becomes one page, in this order.',
      listPages: false,
      actionLabel: 'Convert and download',
      writingLabel: 'Writing the PDF',
      doneHeading: 'Your PDF is ready',
      failedHeading: 'The conversion did not finish.',
      tooFewFiles: 'Choose a picture to convert.',
      // The extension changes, so no word is added: IMG_2041.jpg gives IMG_2041.pdf.
      outputSuffix: '',
      minFiles: 1,
      multiple: true,
      resultPages: 'sum',
      memoryAdvice: 'Try fewer pictures, or smaller ones.',
      items: 'files',
      itemControls: true,
      outputs: 'one',
      resultNotes: ['The pictures’ details, such as the camera, the date and the place, are not copied into the PDF.'],
    },
  },
  {
    // The first row of "Make smaller and fix". Our own recompression on qpdf, by the owner's decision of 13 Nov 2026.
    id: 'compress-pdf',
    group: 'smaller',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    related: ['merge-pdf', 'split-pdf', 'delete-pdf-pages', 'jpg-to-pdf', 'pdf-to-jpg'],
    pages: [
      {
        slug: 'compress-pdf',
        name: 'Compress PDF',
        summary: 'Make a PDF file smaller.',
        title: 'Compress a PDF file in your browser - PDFkaro',
        description: 'Make a PDF file smaller by shrinking its pictures. The file stays on your device and is not uploaded.',
        heading: 'Compress a PDF file',
        sentence: 'Make a PDF smaller. Your file stays on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Compress and download',
      writingLabel: 'Writing the compressed file',
      doneHeading: 'Your compressed file is ready',
      failedHeading: 'The compression did not finish.',
      tooFewFiles: 'Choose a PDF file to compress.',
      outputSuffix: 'compressed',
      minFiles: 1,
      multiple: false,
      resultPages: 'input',
      memoryAdvice: 'Try on a computer, or split the file first and compress the parts.',
      items: 'files',
      itemControls: false,
      outputs: 'one',
      resultWas: true,
      // Page text, a draft for the owner's review like the result notes.
      noSmaller: {
        heading: 'This file could not be made smaller.',
        advice: 'It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more.',
      },
      // Passwords are kept: Compress PDF is not among the page tools that drop them (13 Nov 2026).
      resultNotes: [
        'Pictures that were made smaller can look slightly less sharp up close.',
        'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
        'If the file had a password or restrictions, it still has them.',
      ],
    },
  },
  {
    // The first two rows of "Convert from PDF", one tool with two pages by the agent's choice, after the
    // owner's Image to PDF decision (13 Nov 2026). Each page sets the format through its preset.
    id: 'pdf-to-images',
    group: 'from-pdf',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    // Each page links to the other; a page never links to itself (relatedItems in queries.ts).
    related: ['pdf-to-jpg', 'pdf-to-png', 'jpg-to-pdf', 'extract-pdf-pages', 'compress-pdf', 'split-pdf'],
    pages: [
      {
        slug: 'pdf-to-jpg',
        name: 'PDF to JPG',
        summary: 'Turn each page of a PDF into a JPG picture.',
        title: 'Convert PDF to JPG in your browser - PDFkaro',
        description: 'Turn each page of a PDF into a JPG picture. The file stays on your device and is not uploaded.',
        heading: 'Convert PDF to JPG',
        sentence: 'Turn each page of a PDF into a JPG picture. Files stay on your device.',
        preset: { format: 'jpg' },
        words: {
          actionLabel: 'Convert to JPG and download',
          outputExtension: 'jpg',
          resultNotes: ['Each page is a JPG picture at 150 pixels to the inch. The PDF itself was not changed.'],
        },
      },
      {
        slug: 'pdf-to-png',
        name: 'PDF to PNG',
        summary: 'Turn each page of a PDF into a PNG picture.',
        title: 'Convert PDF to PNG in your browser - PDFkaro',
        description: 'Turn each page of a PDF into a PNG picture. The file stays on your device and is not uploaded.',
        heading: 'Convert PDF to PNG',
        sentence: 'Turn each page of a PDF into a PNG picture. Files stay on your device.',
        preset: { format: 'png' },
        words: {
          actionLabel: 'Convert to PNG and download',
          outputExtension: 'png',
          resultNotes: ['Each page is a PNG picture at 150 pixels to the inch, without loss. The PDF itself was not changed.'],
        },
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      // Each page names its own button, result notes and extension, above.
      actionLabel: 'Convert and download',
      writingLabel: 'Writing the zip',
      doneHeading: 'Your download is ready',
      failedHeading: 'The conversion did not finish.',
      tooFewFiles: 'Choose a PDF file to convert.',
      // The extension changes, so no word is added: report.pdf gives report.jpg, or report.zip for several pages.
      outputSuffix: '',
      minFiles: 1,
      multiple: false,
      resultPages: 'none',
      memoryAdvice: 'Try on a computer, or split the file first and convert the parts.',
      zipLimitAdvice: 'Split the file first, then convert the parts.',
      items: 'files',
      itemControls: false,
      outputs: 'several',
      partSuffix: 'page',
      resultNotes: [],
    },
  },
  {
    // The first row of "Edit and sign", and the first tool that draws on the visitor's pages (src/engines/stamp.ts).
    id: 'add-page-numbers',
    group: 'edit',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    // Watermark and Sign PDF are linked once they are published.
    related: ['merge-pdf', 'rearrange-pdf-pages', 'delete-pdf-pages', 'watermark-pdf', 'sign-pdf', 'compress-pdf'],
    pages: [
      {
        slug: 'add-page-numbers-to-pdf',
        name: 'Add page numbers',
        summary: 'Number the pages of a PDF.',
        title: 'Add page numbers to a PDF in your browser - PDFkaro',
        description: 'Put a page number on every page of a PDF, at the top or bottom. The file stays on your device and is not uploaded.',
        heading: 'Add page numbers to a PDF',
        sentence: 'Put a number on every page of a PDF. Your file stays on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Add numbers and download',
      writingLabel: 'Writing the numbered file',
      doneHeading: 'Your numbered file is ready',
      failedHeading: 'The numbers were not added.',
      tooFewFiles: 'Choose a PDF file to number its pages.',
      outputSuffix: 'numbered',
      minFiles: 1,
      multiple: false,
      resultPages: 'input',
      memoryAdvice: 'Try on a computer, or split the file first and number the parts.',
      items: 'files',
      itemControls: false,
      outputs: 'one',
      // The values are also listed in src/widget/option-values.ts, which the engine reads.
      options: [
        {
          kind: 'choice',
          key: 'position',
          legend: 'Where the numbers go',
          initial: 'bottom-centre',
          choices: [
            { value: 'bottom-left', label: 'Bottom left' },
            { value: 'bottom-centre', label: 'Bottom centre' },
            { value: 'bottom-right', label: 'Bottom right' },
            { value: 'top-left', label: 'Top left' },
            { value: 'top-centre', label: 'Top centre' },
            { value: 'top-right', label: 'Top right' },
          ],
        },
      ],
      // Page tools drop passwords and restrictions (13 Nov 2026), and the decision names Add page numbers.
      resultNotes: [
        'Each page has its number. Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
        'The new file has no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
  {
    id: 'watermark-pdf',
    group: 'edit',
    runsIn: 'browser',
    phase: 1,
    accepts: ['application/pdf'],
    // Sign PDF and Protect are linked once they are published.
    related: ['add-page-numbers-to-pdf', 'sign-pdf', 'protect-pdf', 'merge-pdf', 'compress-pdf', 'rotate-pdf'],
    pages: [
      {
        slug: 'watermark-pdf',
        name: 'Watermark',
        summary: 'Put your own text across every page of a PDF.',
        title: 'Add a watermark to a PDF in your browser - PDFkaro',
        description: 'Put a text watermark across every page of a PDF, in your browser. The file stays on your device and is not uploaded.',
        heading: 'Add a watermark to a PDF',
        sentence: 'Put your own text across every page of a PDF. Your file stays on your device.',
      },
    ],
    widget: {
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      actionLabel: 'Add watermark and download',
      writingLabel: 'Writing the watermarked file',
      doneHeading: 'Your watermarked file is ready',
      failedHeading: 'The watermark was not added.',
      tooFewFiles: 'Choose a PDF file to add a watermark.',
      outputSuffix: 'watermarked',
      minFiles: 1,
      multiple: false,
      resultPages: 'input',
      memoryAdvice: 'Try on a computer, or split the file first and add the watermark to each part.',
      items: 'files',
      itemControls: false,
      outputs: 'one',
      // The text's most characters and character rule are in src/widget/option-values.ts, which the engine reads.
      options: [
        {
          kind: 'text',
          key: 'text',
          label: 'Watermark text',
          hint: 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.',
          emptySentence: 'Type the watermark text first.',
          refusedSentence: 'The watermark text could not be used. Check it and try again.',
        },
      ],
      // Page tools drop passwords and restrictions (13 Nov 2026), and the decision names Watermark.
      resultNotes: [
        'The watermark is on every page. Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
        'The new file has no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
];
