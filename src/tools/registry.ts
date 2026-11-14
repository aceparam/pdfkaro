// The one place a tool is declared. Pages, the home page list and related
// links are all generated from this file. Data and types only: no logic here.

import type { CatalogueSlug } from './catalogue';

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
  /** Options already chosen when this URL opens, such as a target size. */
  preset?: Record<string, string | number | boolean>;
};

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
  /** Under the summary of listed files, if the order matters: "They will be joined in this order." */
  listNote?: string;
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
  /** Put after the first input's name to name the result: "merged". */
  outputSuffix: string;
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
  /** Plain notes shown with the result, such as what was not carried over. */
  resultNotes: string[];
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
        "Apart from the password, nothing changes but the way pages face: text, links, form fields, bookmarks, attached files, hidden text and the document's details are as they were.",
        'The new file has no password and no restrictions, even if the file you chose had them.',
      ],
    },
  },
];
