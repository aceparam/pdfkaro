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
   * visible text. Only one kind exists so far.
   */
  itemToggle?: { kind: 'cut-after'; label: string };
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
];
