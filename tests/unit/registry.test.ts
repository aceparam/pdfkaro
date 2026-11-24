import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { footerLinks } from '../../src/site';
import { groups, tools, type Group, type HubSlug, type DrawingOption, type NewPasswordOption, type PictureOption, type TextOption, type Tool, type ToolOption } from '../../src/tools/registry';
import {
  characterRules,
  drawingRule,
  optionDrawings,
  optionPasswords,
  optionPictures,
  optionTexts,
  optionValues,
  passwordCharacters,
  passwordRule,
  pictureRule,
  sizeTargets,
  textRule,
  type SizeTargetKey,
  type DrawingRule,
  type PasswordRule,
  type PictureRule,
  type TextRule,
} from '../../src/widget/option-values';
import { passwordAdvice, ruleAdvice } from '../../src/widget/options';
import { toggleRules } from '../../src/widget/toggles';
import { turnRules } from '../../src/widget/turns';
import { allPages, pageWords, relatedItems } from '../../src/tools/queries';

const sitePageNames = ['about', 'privacy', 'changes', 'known-problems', 'contact', '404', 'index'];
const pages = allPages(tools);

describe('registry', () => {
  it('declares each tool once', () => {
    const ids = tools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every page its own slug', () => {
    const slugs = pages.map(({ page }) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses lowercase slugs with hyphens that are not site page names', () => {
    for (const { page } of pages) {
      expect(page.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(sitePageNames).not.toContain(page.slug);
    }
  });

  it('places every tool in one of the seven groups', () => {
    expect(groups).toHaveLength(7);
    const groupIds = groups.map((group) => group.id);
    for (const tool of tools) expect(groupIds).toContain(tool.group);
  });

  it('names four to six related tools, none twice; a page never links to itself, and only a tool of several pages names its own', () => {
    for (const tool of tools) {
      expect(tool.related.length).toBeGreaterThanOrEqual(4);
      expect(tool.related.length).toBeLessThanOrEqual(6);
      expect(new Set(tool.related).size).toBe(tool.related.length);
      if (tool.pages.length === 1) expect(tool.related).not.toContain(tool.pages[0]!.slug);
      for (const page of tool.pages) {
        const links = relatedItems(tools, tool, '/', page).map((item) => item.href);
        expect(links).not.toContain(`/${page.slug}`);
        expect(links.length, page.slug).toBeGreaterThanOrEqual(4);
        expect(links.length, page.slug).toBeLessThanOrEqual(6);
      }
    }
  });

  it('keeps titles under 60 characters, ending with the brand, and all different', () => {
    const titles = pages.map(({ page }) => page.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) {
      expect(title.length).toBeLessThan(60);
      expect(title.endsWith(' - PDFkaro')).toBe(true);
    }
  });

  it('keeps descriptions under 155 characters and all different', () => {
    const descriptions = pages.map(({ page }) => page.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) expect(description.length).toBeLessThan(155);
  });

  it('says where the file goes, truthfully for the kind of tool', () => {
    for (const { tool, page } of pages) {
      const words = `${page.sentence} ${page.description}`.toLowerCase();
      if (tool.runsIn === 'browser') {
        // "Files stay" or, for a tool that takes one file, "Your file stays".
        expect(page.sentence.toLowerCase()).toMatch(/stays? on your device/);
      } else {
        expect(page.sentence).toContain('uploaded');
        expect(page.sentence).toContain('deleted within an hour');
        expect(words).not.toMatch(/stays? on your device/);
        expect(words).not.toContain('never leaves');
      }
    }
  });

  it('has no exclamation marks in its wording', () => {
    for (const { page } of pages) {
      expect(Object.values(page).join(' ')).not.toContain('!');
    }
  });

  it('gives Merge PDF its widget words: at least two files, several at once, named after the first file', () => {
    const words = tools.find((tool) => tool.id === 'merge-pdf')?.widget;
    expect(words).toBeDefined();
    expect(words).toMatchObject({ actionLabel: 'Merge and download', outputSuffix: 'merged', minFiles: 2, multiple: true, resultPages: 'sum' });
    // The owner's decisions of 11 Nov 2026 are said with the result.
    expect(words!.resultNotes.join(' ')).toMatch(/first file only/);
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
  });

  it('gives Split PDF its words: one file, its pages, cut toggles and several files as a zip', () => {
    const words = tools.find((tool) => tool.id === 'split-pdf')?.widget;
    expect(words).toMatchObject({
      actionLabel: 'Split and download',
      outputSuffix: 'split',
      minFiles: 1,
      multiple: false,
      items: 'pages',
      itemControls: false,
      itemToggle: { kind: 'cut-after', label: 'Cut after' },
      outputs: 'several',
      partSuffix: 'part',
      resultPages: 'input',
    });
    // The owner's decisions of 12 Nov 2026 are said with the result.
    expect(words!.resultNotes.join(' ')).toMatch(/bookmarks that point to its own pages/);
    expect(words!.resultNotes.join(' ')).toMatch(/first file only/);
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
  });

  it('gives every widget a consistent shape: page tools take one file, several outputs need a part word', () => {
    for (const tool of tools) {
      const words = tool.widget;
      if (!words) continue;
      if (words.items === 'pages') expect(words).toMatchObject({ multiple: false, minFiles: 1 });
      if (words.outputs === 'several') expect(words.partSuffix).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      // Page items move only in a tool with no toggle (Reorder pages); Remove acts on files only.
      if (words.items === 'pages' && words.itemControls) expect(words.itemToggle).toBeUndefined();
      // A per-page toggle needs a list of pages.
      if (words.itemToggle) expect(words.items).toBe('pages');
    }
    expect(tools.find((tool) => tool.id === 'merge-pdf')?.widget).toMatchObject({ items: 'files', itemControls: true, outputs: 'one' });
  });

  it('keeps widget words plain: no exclamation marks, and nothing empty', () => {
    for (const tool of tools) {
      if (!tool.widget) continue;
      // An empty output suffix is the one empty word allowed: it adds no word to the name (Image to PDF).
      const { outputSuffix, ...rest } = tool.widget;
      expect(outputSuffix).toMatch(/^([a-z0-9]+(-[a-z0-9]+)*)?$/);
      const text = Object.values(rest).flat().filter((value) => typeof value === 'string') as string[];
      for (const value of text) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value).not.toContain('!');
      }
    }
  });
});

describe('catalogue order', () => {
  it('declares tools in the order SPEC.md lists them, so they are built in that order', async () => {
    const { readFileSync } = await import('node:fs');
    const spec = readFileSync('SPEC.md', 'utf8');
    const catalogue = spec.slice(spec.indexOf('## Tool catalogue'), spec.indexOf('## Architecture'));
    // The first address of every row, including a row that lists several ("/compress-pdf-to-100kb, -200kb, …").
    const order = [...catalogue.matchAll(/\| (\/[a-z0-9-]+)[,| ]/g)].map((match) => match[1]!.slice(1));
    // Image to PDF is one tool with three pages (the owner's decision of 13 Nov 2026). Its first page,
    // /jpg-to-pdf, sits under "Convert to PDF", but the owner's tool is Image to PDF, which the
    // export lists at /image2pdf, right after Rotate PDF; so it is counted there.
    const placeOf = (tool: (typeof tools)[number]) => (tool.id === 'images-to-pdf' ? 'image2pdf' : tool.pages[0]!.slug);
    const positions = tools.map((tool) => order.indexOf(placeOf(tool)));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // The row that lists several addresses is read by its first: Compress to a target size counts after Compress
    // PDF and before PDF to JPG.
    const target = order.indexOf('compress-pdf-to-100kb');
    expect(target).toBeGreaterThan(order.indexOf('compress-pdf'));
    expect(target).toBeLessThan(order.indexOf('pdf-to-jpg'));
    const ids = tools.map((tool) => tool.id);
    expect(ids.indexOf('compress-to-target')).toBe(ids.indexOf('compress-pdf') + 1);
  });
});

describe('Extract pages', () => {
  it('lists pages with a take toggle and gives one file', () => {
    const words = tools.find((tool) => tool.id === 'extract-pdf-pages')?.widget;
    expect(words).toMatchObject({ items: 'pages', itemControls: false, itemToggle: { kind: 'take', label: 'Take' }, outputs: 'one', outputSuffix: 'extracted', minFiles: 1, multiple: false });
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
    expect(words!.resultNotes.join(' ')).toMatch(/accessibility tags/);
    expect(words!.resultNotes.join(' ')).toMatch(/form fields, with what was typed in them/);
  });
});

describe('Delete pages', () => {
  it('lists pages with a drop toggle and gives one file, after Extract', () => {
    const words = tools.find((tool) => tool.id === 'delete-pdf-pages')?.widget;
    expect(words).toMatchObject({ items: 'pages', itemControls: false, itemToggle: { kind: 'drop', label: 'Delete' }, outputs: 'one', outputSuffix: 'pages-deleted', minFiles: 1, multiple: false });
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
    expect(words!.resultNotes.join(' ')).toMatch(/accessibility tags, the names of links inside it and reading threads/);
    expect(words!.resultNotes.join(' ')).toMatch(/form fields, with what was typed in them/);
    const ids = tools.map((tool) => tool.id);
    expect(ids.indexOf('delete-pdf-pages')).toBe(ids.indexOf('extract-pdf-pages') + 1);
  });
});

describe('Reorder pages', () => {
  it('lists pages that move, with no toggle, and gives one file, after Delete', () => {
    const words = tools.find((tool) => tool.id === 'rearrange-pdf-pages')?.widget;
    expect(words).toMatchObject({ items: 'pages', itemControls: true, outputs: 'one', outputSuffix: 'reordered', resultPages: 'input', minFiles: 1, multiple: false });
    expect(words!.itemToggle).toBeUndefined();
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
    expect(words!.resultNotes.join(' ')).toMatch(/keeps its order/);
    const ids = tools.map((tool) => tool.id);
    expect(ids.indexOf('rearrange-pdf-pages')).toBe(ids.indexOf('delete-pdf-pages') + 1);
  });

  it('a tool has at most one of page moves, page turns and a toggle', () => {
    for (const tool of tools) {
      const words = tool.widget;
      if (words?.items !== 'pages') continue;
      expect([words.itemControls, words.itemTurns === true, words.itemToggle !== undefined].filter(Boolean).length, tool.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('Rotate PDF', () => {
  it('lists pages that turn, with no moves or toggle, and gives one file, after Reorder', () => {
    const words = tools.find((tool) => tool.id === 'rotate-pdf')?.widget;
    expect(words).toMatchObject({ items: 'pages', itemControls: false, itemTurns: true, outputs: 'one', outputSuffix: 'rotated', resultPages: 'input', minFiles: 1, multiple: false });
    expect(words!.itemToggle).toBeUndefined();
    expect(words!.resultNotes.join(' ')).toMatch(/no password and no restrictions/);
    const ids = tools.map((tool) => tool.id);
    expect(ids.indexOf('rotate-pdf')).toBe(ids.indexOf('rearrange-pdf-pages') + 1);
  });
});

describe('Images to PDF', () => {
  const tool = tools.find((each) => each.id === 'images-to-pdf')!;

  it('is one tool with three pages under Convert to PDF, taking JPG and PNG, after Resize pages', () => {
    expect(tool).toMatchObject({ group: 'to-pdf', runsIn: 'browser', phase: 1, accepts: ['image/jpeg', 'image/png'] });
    expect(tool.pages.map((page) => page.slug)).toEqual(['jpg-to-pdf', 'png-to-pdf', 'image-to-pdf']);
    expect(tool.pages.map((page) => page.name)).toEqual(['JPG to PDF', 'PNG to PDF', 'Image to PDF']);
    for (const page of tool.pages) expect(page.accepts).toBeUndefined();
    const ids = tools.map((each) => each.id);
    // At /image2pdf's catalogue row, the last of "Organise pages", so after Resize pages (/resize-pdf).
    expect(ids.indexOf('images-to-pdf')).toBe(ids.indexOf('resize-pdf') + 1);
    expect(tool.related).toEqual(['merge-pdf', 'compress-pdf', 'pdf-to-jpg', 'rotate-pdf', 'rearrange-pdf-pages']);
  });

  it('gives each page its own title, heading and sentence', () => {
    expect(tool.pages.map(({ title, heading, sentence }) => ({ title, heading, sentence }))).toEqual([
      { title: 'Convert JPG to PDF in your browser - PDFkaro', heading: 'Convert JPG to PDF', sentence: 'Turn one or more JPG photos into one PDF. Files stay on your device.' },
      { title: 'Convert PNG to PDF in your browser - PDFkaro', heading: 'Convert PNG to PDF', sentence: 'Turn one or more PNG pictures or screenshots into one PDF. Files stay on your device.' },
      {
        title: 'Convert images to PDF in your browser - PDFkaro',
        heading: 'Convert images to PDF',
        sentence: 'Turn JPG and PNG pictures into one PDF, in the order you choose. Files stay on your device.',
      },
    ]);
  });

  it('gives each page a description that names its pictures and says they are not uploaded', () => {
    const [jpg, png, image] = tool.pages.map((page) => page.description);
    expect(jpg).toMatch(/JPG/);
    expect(png).toMatch(/PNG/);
    expect(image).toMatch(/JPG and PNG/);
    for (const description of [jpg, png, image]) {
      expect(description!.length).toBeLessThan(155);
      expect(description).toMatch(/stay on your device and are not uploaded\.$/);
    }
  });

  it('has the widget words of the design', () => {
    expect(tool.widget).toMatchObject({
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
      outputSuffix: '',
      minFiles: 1,
      multiple: true,
      items: 'files',
      itemControls: true,
      outputs: 'one',
      resultPages: 'sum',
      memoryAdvice: 'Try fewer pictures, or smaller ones.',
    });
    expect(tool.widget!.resultNotes).toEqual(['The pictures’ details, such as the camera, the date and the place, are not copied into the PDF.']);
  });

  it('leaves the other tools without the new words, so they are unchanged', () => {
    for (const each of tools) {
      if (each.id === 'images-to-pdf') continue;
      expect(each.widget?.refusedAdvice).toBeUndefined();
      expect(each.widget?.listPages).toBeUndefined();
      // Remove a password (Unlock PDF) also names a file it cannot read: one protected with a certificate.
      if (each.id !== 'unlock-pdf') expect(each.widget?.unsupportedAdvice).toBeUndefined();
      expect(each.widget?.damagedAdvice).toBeUndefined();
    }
  });
});

describe('Crop PDF', () => {
  const tool = tools.find((each) => each.id === 'crop-pdf')!;

  it('is the first Phase 2 tool, right after Rotate PDF under "Organise pages", taking one PDF with no options', () => {
    expect(tool).toMatchObject({ group: 'organise', runsIn: 'browser', phase: 2, accepts: ['application/pdf'] });
    expect(tool.related).toEqual(['rotate-pdf', 'resize-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-jpg', 'merge-pdf']);
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('crop-pdf')).toBe(ids.indexOf('rotate-pdf') + 1);
    expect(tool.pages).toEqual([
      {
        slug: 'crop-pdf',
        name: 'Crop PDF',
        summary: 'Cut the white margins off the pages of a PDF.',
        title: 'Crop PDF margins in your browser - PDFkaro',
        description: 'Cut the white margins off the pages of a PDF. The file stays on your device and is not uploaded.',
        heading: 'Crop PDF margins',
        sentence: 'Cut the white margins off the pages of a PDF. Your file stays on your device.',
      },
    ]);
    expect(tool.widget?.options).toBeUndefined();
  });

  it('has the widget words of the design, with words for no page cut and three notes', () => {
    expect(tool.widget).toMatchObject({
      items: 'files',
      itemControls: false,
      multiple: false,
      minFiles: 1,
      outputSuffix: 'cropped',
      outputs: 'one',
      resultPages: 'input',
      actionLabel: 'Crop and download',
      failedHeading: 'The pages were not cropped.',
      noSmaller: { heading: 'No pages were cropped.' },
    });
    expect(tool.widget!.noSmaller!.advice).toMatch(/cannot be sure where everything on it is/);
    const notes = tool.widget!.resultNotes;
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatch(/pages the tool cannot measure safely are left as they are/);
    expect(notes[1]).toMatch(/still in the file/);
    expect(notes[1]).toMatch(/some programs can still find, copy or read aloud the text in it/);
    expect(notes[1]).toMatch(/not a way to hide something private/);
    expect(notes[2]).toMatch(/notes, bookmarks/);
    expect(notes[2]).toMatch(/no password and no restrictions/);
    for (const text of [...notes, ...Object.values(tool.widget!.noSmaller!)]) expect(text).not.toContain('!');
  });
});

describe('Resize pages', () => {
  const tool = tools.find((each) => each.id === 'resize-pdf')!;

  it('is the second Phase 2 tool, right after Crop PDF under "Organise pages", taking one PDF', () => {
    expect(tool).toMatchObject({ group: 'organise', runsIn: 'browser', phase: 2, accepts: ['application/pdf'] });
    expect(tool.related).toEqual(['crop-pdf', 'rotate-pdf', 'merge-pdf', 'compress-pdf', 'add-page-numbers-to-pdf']);
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('resize-pdf')).toBe(ids.indexOf('crop-pdf') + 1);
    expect(tool.pages).toEqual([
      {
        slug: 'resize-pdf',
        name: 'Resize pages to A4 or Letter',
        summary: 'Make every page A4 or Letter size, scaled to fit.',
        title: 'Resize PDF pages to A4 or Letter in your browser - PDFkaro',
        description: 'Make every page of a PDF A4 or Letter size, its content scaled to fit. The file stays on your device and is not uploaded.',
        heading: 'Resize PDF pages to A4 or Letter',
        sentence: 'Make every page of a PDF A4 or Letter size, scaled to fit. Your file stays on your device.',
      },
    ]);
  });

  it('offers one choice, "Paper size", A4 first and chosen at first, then Letter', () => {
    expect(tool.widget!.options).toEqual([
      {
        kind: 'choice',
        key: 'paper',
        legend: 'Paper size',
        initial: 'a4',
        choices: [
          { value: 'a4', label: 'A4, 210 by 297 mm' },
          { value: 'letter', label: 'Letter, 8.5 by 11 inches' },
        ],
      },
    ]);
  });

  it('has the widget words of the design, with words for no page changed and two notes', () => {
    expect(tool.widget).toMatchObject({
      items: 'files',
      itemControls: false,
      multiple: false,
      minFiles: 1,
      outputSuffix: 'resized',
      outputs: 'one',
      resultPages: 'input',
      actionLabel: 'Resize and download',
      writingLabel: 'Writing the resized file',
      doneHeading: 'Your resized file is ready',
      failedHeading: 'The pages were not resized.',
      tooFewFiles: 'Choose a PDF file to resize its pages.',
      memoryAdvice: 'Try on a computer, or split the file first and resize the parts.',
      noSmaller: {
        heading: 'Every page is already the paper size you chose.',
        advice: 'No new file was made. You can use your file as it is. To make the pages the other size, press Start again, choose the file and pick the other size.',
      },
    });
    const notes = tool.widget!.resultNotes;
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/the same way round as before/);
    expect(notes[0]).toMatch(/Pages that were already that size are left as they are/);
    expect(notes[1]).toMatch(/links, fields and notes move with the page/);
    expect(notes[1]).toMatch(/no password and no restrictions/);
    for (const text of [...notes, ...Object.values(tool.widget!.noSmaller!)]) expect(text).not.toContain('!');
  });

  it('names resizing in the "Organise pages" hub words', () => {
    const group = groups.find((each) => each.id === 'organise')!;
    expect(group.description).toBe('Combine, split, copy out, remove, reorder, turn, crop and resize the pages of a PDF, in your browser. Files stay on your device and are not uploaded.');
    expect(group.sentence).toBe('Tools that combine, split, reorder, crop and resize the pages of a PDF.');
    expect(group.claimsDevice).toBe(true);
  });
});

describe('Compress PDF', () => {
  const tool = tools.find((each) => each.id === 'compress-pdf')!;

  it('is the first row of "Make smaller and fix", after Image to PDF, taking one PDF', () => {
    expect(tool).toMatchObject({ group: 'smaller', runsIn: 'browser', phase: 1, accepts: ['application/pdf'] });
    expect(tool.related).toEqual(['merge-pdf', 'split-pdf', 'delete-pdf-pages', 'jpg-to-pdf', 'pdf-to-jpg', 'compress-pdf-to-200kb']);
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('compress-pdf')).toBe(ids.indexOf('images-to-pdf') + 1);
    expect(tool.pages).toEqual([
      {
        slug: 'compress-pdf',
        name: 'Compress PDF',
        summary: 'Make a PDF file smaller.',
        title: 'Compress a PDF file in your browser - PDFkaro',
        description: 'Make a PDF file smaller by shrinking its pictures. The file stays on your device and is not uploaded.',
        heading: 'Compress a PDF file',
        sentence: 'Make a PDF smaller. Your file stays on your device.',
      },
    ]);
  });

  it('has the widget words of the design, with the "was" size and the words for no smaller file', () => {
    expect(tool.widget).toMatchObject({
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      items: 'files',
      itemControls: false,
      multiple: false,
      minFiles: 1,
      tooFewFiles: 'Choose a PDF file to compress.',
      actionLabel: 'Compress and download',
      writingLabel: 'Writing the compressed file',
      doneHeading: 'Your compressed file is ready',
      failedHeading: 'The compression did not finish.',
      outputSuffix: 'compressed',
      outputs: 'one',
      resultPages: 'input',
      memoryAdvice: 'Try on a computer, or split the file first and compress the parts.',
      resultWas: true,
      noSmaller: {
        heading: 'This file could not be made smaller.',
        advice: 'It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more.',
      },
    });
    expect(tool.widget!.resultNotes).toEqual([
      'Pictures that were made smaller can look slightly less sharp up close.',
      'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
      'If the file had a password or restrictions, it still has them.',
    ]);
    for (const text of Object.values(tool.widget!.noSmaller!)) expect(text).not.toContain('!');
  });

  it('leaves the other tools without the "was" size or the words for no smaller file, so they are unchanged', () => {
    for (const each of tools) {
      if (each.id === 'compress-pdf') continue;
      // Compress to a target size shows the old size too, and gives no new file when nothing fits or saves 1%.
      if (each.id !== 'compress-to-target') expect(each.widget?.resultWas).toBeUndefined();
      // Remove a password (Unlock PDF) gives no new file for a file with nothing to remove.
      // Crop PDF gives no new file when no page is cut; Resize pages when every page is already the chosen size.
      if (!['unlock-pdf', 'crop-pdf', 'resize-pdf', 'compress-to-target'].includes(each.id)) expect(each.widget?.noSmaller).toBeUndefined();
    }
  });
});

describe('Compress to a target size', () => {
  const tool = tools.find((each) => each.id === 'compress-to-target')!;
  const sizes = [
    ['100kb', '100 KB'],
    ['200kb', '200 KB'],
    ['500kb', '500 KB'],
    ['1mb', '1 MB'],
    ['2mb', '2 MB'],
  ] as const;

  it('is one Phase 2 tool with five pages, right after Compress PDF under "Make smaller and fix", taking one PDF', () => {
    expect(tool).toMatchObject({ group: 'smaller', runsIn: 'browser', phase: 2, accepts: ['application/pdf'] });
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('compress-to-target')).toBe(ids.indexOf('compress-pdf') + 1);
    expect(tool.pages.map((page) => page.slug)).toEqual(sizes.map(([key]) => `compress-pdf-to-${key}`));
    expect(tool.related).toEqual(['compress-pdf-to-200kb', 'compress-pdf-to-500kb', 'compress-pdf-to-1mb', 'compress-pdf', 'delete-pdf-pages', 'split-pdf']);
  });

  it('gives each page its target through its preset, and its own words naming its size', () => {
    tool.pages.forEach((page, index) => {
      const [key, label] = sizes[index]!;
      expect(page.preset).toEqual({ target: key });
      expect(page.name).toBe(`Compress PDF to ${label}`);
      expect(page.summary).toBe(`Make a PDF ${label} or smaller.`);
      expect(page.title).toBe(`Compress a PDF to ${label} in your browser - PDFkaro`);
      expect(page.heading).toBe(`Compress a PDF to ${label}`);
      expect(page.sentence).toBe(`Make a PDF ${label} or smaller. Your file stays on your device.`);
      expect(page.words).toEqual({ actionLabel: `Compress to ${label} and download` });
      expect(page.description).toContain(label);
      expect(page.description).toContain('The file stays on your device and is not uploaded.');
      expect(pageWords(tool, page)?.actionLabel).toBe(`Compress to ${label} and download`);
    });
  });

  it('links each page to the others of the design, never to itself', () => {
    const links = (slug: string) => relatedItems(tools, tool, '/', tool.pages.find((page) => page.slug === slug)!).map((item) => item.href);
    expect(links('compress-pdf-to-200kb')).toEqual(['/compress-pdf-to-500kb', '/compress-pdf-to-1mb', '/compress-pdf', '/delete-pdf-pages', '/split-pdf']);
    expect(links('compress-pdf-to-100kb')).toHaveLength(6);
    expect(links('compress-pdf-to-2mb')).toHaveLength(6);
  });

  it('has the widget words of the design: one file as a row, no options, the "was" size, a size target and no smaller file', () => {
    expect(tool.widget).toMatchObject({
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      items: 'files',
      itemControls: false,
      multiple: false,
      minFiles: 1,
      tooFewFiles: 'Choose a PDF file to compress.',
      writingLabel: 'Writing the compressed file',
      doneHeading: 'Your compressed file is ready',
      failedHeading: 'The compression did not finish.',
      outputSuffix: 'compressed',
      outputs: 'one',
      resultPages: 'input',
      memoryAdvice: 'Try on a computer, or split the file first and compress the parts.',
      resultWas: true,
      sizeTarget: {
        overAdvice:
          'Pictures this tool can change were made as small as they can go while staying readable. Some kinds of picture are left as they are; the questions below say which. To get under the limit, remove pages you do not need, or split the file and send it in parts.',
      },
      noSmaller: {
        heading: 'This file could not be made smaller.',
        advice:
          'Its pictures are already small, or of a kind this tool leaves alone, and text, drawings and fonts keep their quality, so they cannot be made much smaller. To get under the limit, remove pages you do not need, or split the file and send it in parts.',
      },
    });
    expect(tool.widget!.options).toBeUndefined();
    expect(tool.widget!.resultNotes).toEqual([
      'Pictures were made smaller, so they can look less sharp up close. Text, drawings and fonts keep their quality.',
      'Pages, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
      'If the file had a password or restrictions, it still has them.',
    ]);
  });

  it('names upload limits in the "Make smaller and fix" hub words', () => {
    const smaller = groups.find((group) => group.id === 'smaller')!;
    expect(smaller.description).toBe(
      'Make a PDF smaller, or small enough for an upload limit, by shrinking its pictures in your browser. The file stays on your device and is not uploaded.',
    );
    expect(smaller.sentence).toBe('Tools that make a PDF file smaller, or small enough for an upload limit.');
    expect(smaller.claimsDevice).toBe(true);
  });
});

/**
 * What is wrong with a tool's size target: every page of a tool whose words declare one has a preset naming a key of
 * `sizeTargets`, whose label is in the page's heading, sentence, title and main button; no other tool's page sets
 * `target`. Run on every tool, and on entries made wrong on purpose so each check is seen to fail.
 */
function sizeTargetProblems(tool: Pick<Tool, 'id' | 'pages' | 'widget'>): string[] {
  const problems: string[] = [];
  for (const page of tool.pages) {
    const named = page.preset && Object.hasOwn(page.preset, 'target') ? page.preset.target : undefined;
    if (!tool.widget?.sizeTarget) {
      if (named !== undefined) problems.push(`${page.slug}: sets target, but the tool has no size target`);
      continue;
    }
    const target = typeof named === 'string' && Object.hasOwn(sizeTargets, named) ? sizeTargets[named as SizeTargetKey] : undefined;
    if (!target) {
      problems.push(`${page.slug}: the preset names no known target`);
      continue;
    }
    const button = pageWords(tool as Tool, page)?.actionLabel ?? '';
    for (const [name, words] of [['heading', page.heading], ['sentence', page.sentence], ['title', page.title], ['main button', button]] as const) {
      if (!words.includes(target.label)) problems.push(`${page.slug}: the ${name} does not name ${target.label}`);
    }
  }
  return problems;
}

describe('size targets', () => {
  const target = tools.find((each) => each.id === 'compress-to-target')!;
  const compress = tools.find((each) => each.id === 'compress-pdf')!;
  const withPage = (change: Partial<Tool['pages'][number]>, index = 2): Tool => ({
    ...target,
    pages: target.pages.map((page, at) => (at === index ? { ...page, ...change } : page)),
  });

  it('are sound for every tool', () => {
    for (const each of tools) expect(sizeTargetProblems(each), each.id).toEqual([]);
  });

  it('are written once, in thousands, with their labels and the labels in 1024s', () => {
    expect(Object.entries(sizeTargets)).toEqual([
      ['100kb', { bytes: 100_000, label: '100 KB', binary: 102_400 }],
      ['200kb', { bytes: 200_000, label: '200 KB', binary: 204_800 }],
      ['500kb', { bytes: 500_000, label: '500 KB', binary: 512_000 }],
      ['1mb', { bytes: 1_000_000, label: '1 MB', binary: 1_048_576 }],
      ['2mb', { bytes: 2_000_000, label: '2 MB', binary: 2_097_152 }],
    ]);
  });

  it('fail, naming the page, when a page has no target or an unknown one', () => {
    expect(sizeTargetProblems(withPage({ preset: undefined }))).toEqual(['compress-pdf-to-500kb: the preset names no known target']);
    expect(sizeTargetProblems(withPage({ preset: { target: '300kb' } }))).toEqual(['compress-pdf-to-500kb: the preset names no known target']);
    expect(sizeTargetProblems(withPage({ preset: { target: '__proto__' } }))).toEqual(['compress-pdf-to-500kb: the preset names no known target']);
  });

  it('fail when a tool without a size target has a page that sets target', () => {
    const page = { ...compress.pages[0]!, preset: { target: '200kb' } };
    expect(sizeTargetProblems({ ...compress, pages: [page] })).toEqual(['compress-pdf: sets target, but the tool has no size target']);
  });

  it('fail when the heading, sentence, title or main button lacks the label', () => {
    expect(sizeTargetProblems(withPage({ heading: 'Compress a PDF' }))).toEqual(['compress-pdf-to-500kb: the heading does not name 500 KB']);
    expect(sizeTargetProblems(withPage({ sentence: 'Make a PDF smaller. Your file stays on your device.' }))).toEqual(['compress-pdf-to-500kb: the sentence does not name 500 KB']);
    expect(sizeTargetProblems(withPage({ title: 'Compress a PDF in your browser - PDFkaro' }))).toEqual(['compress-pdf-to-500kb: the title does not name 500 KB']);
    expect(sizeTargetProblems(withPage({ words: { actionLabel: 'Compress and download' } }))).toEqual(['compress-pdf-to-500kb: the main button does not name 500 KB']);
    // A label of another page is not this page's label.
    expect(sizeTargetProblems(withPage({ heading: 'Compress a PDF to 200 KB' }))).toEqual(['compress-pdf-to-500kb: the heading does not name 500 KB']);
  });
});

describe('Remove a password (Unlock PDF)', () => {
  const tool = tools.find((each) => each.id === 'unlock-pdf')!;

  it('is the second row of "Protect", right after Protect with a password, taking one PDF, at the catalogue\'s address', () => {
    expect(tool).toMatchObject({ group: 'protect', runsIn: 'browser', phase: 1, accepts: ['application/pdf'] });
    expect(tool.related).toEqual(['protect-pdf', 'compress-pdf', 'merge-pdf', 'split-pdf', 'extract-pdf-pages']);
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('unlock-pdf')).toBe(ids.indexOf('protect-pdf') + 1);
    expect(tool.pages).toEqual([
      {
        slug: 'unlock-pdf',
        name: 'Remove a password',
        summary: 'Remove print and edit restrictions from a PDF, and its password if you know it.',
        title: 'Remove a password from a PDF in your browser - PDFkaro',
        description: 'Remove print and edit restrictions from a PDF, and its password if you know it. The file and the password are not uploaded.',
        heading: 'Remove a password from a PDF',
        sentence: 'Remove print and edit restrictions from a PDF, and its password if you know it. Your file stays on your device. This site does not upload your file or the password.',
      },
    ]);
    expect(tool.widget?.options).toBeUndefined();
    expect(tool.pages[0]!.preset).toBeUndefined();
  });

  it('has the widget words of the design, with the words for no new file and for a file it cannot read', () => {
    expect(tool.widget).toMatchObject({
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      items: 'files',
      itemControls: false,
      multiple: false,
      minFiles: 1,
      tooFewFiles: 'Choose a PDF file.',
      actionLabel: 'Remove protection and download',
      writingLabel: 'Writing the unprotected file',
      doneHeading: 'Your unprotected file is ready',
      failedHeading: 'The protection was not removed.',
      outputSuffix: 'unprotected',
      outputs: 'one',
      resultPages: 'input',
      memoryAdvice: 'Try on a computer.',
      unsupportedAdvice: 'It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection.',
      noSmaller: {
        heading: 'This file has no password or restrictions.',
        advice: 'There was nothing to remove, so no new file was made. You can use your file as it is.',
      },
    });
    expect(tool.widget!.resultNotes).toEqual([
      'The file now opens without a password, and its print, copy and edit restrictions are removed. Anyone who has this copy can open it.',
      'Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
    ]);
  });

  it('says "unlock" nowhere but its id and address, by the owner\'s decision of 22 Nov 2026', () => {
    const { id, pages, ...rest } = tool;
    const { slug, ...pageWords } = pages[0]!;
    expect(id).toBe('unlock-pdf');
    expect(slug).toBe('unlock-pdf');
    expect(JSON.stringify({ rest, pageWords })).not.toMatch(/unlock/i);
    expect(tool.pages[0]!.title.length).toBeLessThan(60);
    expect(tool.pages[0]!.description.length).toBeLessThan(155);
  });
});

describe('PDF to JPG and PDF to PNG', () => {
  const tool = tools.find((each) => each.id === 'pdf-to-images')!;

  it('is one tool with two pages under Convert from PDF, taking one PDF, after Compress to a target size, each page setting its format', () => {
    expect(tool).toMatchObject({ group: 'from-pdf', runsIn: 'browser', phase: 1, accepts: ['application/pdf'] });
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('pdf-to-images')).toBe(ids.indexOf('compress-to-target') + 1);
    expect(tool.pages.map(({ slug, name, preset }) => ({ slug, name, preset }))).toEqual([
      { slug: 'pdf-to-jpg', name: 'PDF to JPG', preset: { format: 'jpg' } },
      { slug: 'pdf-to-png', name: 'PDF to PNG', preset: { format: 'png' } },
    ]);
    for (const page of tool.pages) expect(page.accepts).toBeUndefined();
  });

  it('gives each page the title, heading, sentence and description of the design', () => {
    expect(tool.pages.map(({ title, heading, sentence, description }) => ({ title, heading, sentence, description }))).toEqual([
      {
        title: 'Convert PDF to JPG in your browser - PDFkaro',
        heading: 'Convert PDF to JPG',
        sentence: 'Turn each page of a PDF into a JPG picture. Files stay on your device.',
        description: 'Turn each page of a PDF into a JPG picture. The file stays on your device and is not uploaded.',
      },
      {
        title: 'Convert PDF to PNG in your browser - PDFkaro',
        heading: 'Convert PDF to PNG',
        sentence: 'Turn each page of a PDF into a PNG picture. Files stay on your device.',
        description: 'Turn each page of a PDF into a PNG picture. The file stays on your device and is not uploaded.',
      },
    ]);
  });

  it('has the shared widget words of the design: one file listed as a row, several outputs as a zip of pages', () => {
    expect(tool.widget).toMatchObject({
      pickerLabel: 'Choose a PDF file',
      addLabel: 'Choose another file',
      dropHint: 'You can also drop a file anywhere on this page, or paste it.',
      acceptsName: 'a PDF',
      items: 'files',
      itemControls: false,
      multiple: false,
      minFiles: 1,
      tooFewFiles: 'Choose a PDF file to convert.',
      outputs: 'several',
      partSuffix: 'page',
      outputSuffix: '',
      resultPages: 'none',
      writingLabel: 'Writing the zip',
      doneHeading: 'Your download is ready',
      failedHeading: 'The conversion did not finish.',
      memoryAdvice: 'Try on a computer, or split the file first and convert the parts.',
      zipLimitAdvice: 'Split the file first, then convert the parts.',
    });
  });

  it("gives each page its own button, result notes and extension, merged over the tool's words", () => {
    const [jpg, png] = tool.pages.map((page) => pageWords(tool, page)!);
    expect(jpg).toMatchObject({ actionLabel: 'Convert to JPG and download', outputExtension: 'jpg', partSuffix: 'page', writingLabel: 'Writing the zip' });
    expect(jpg!.resultNotes).toEqual(['Each page is a JPG picture at 150 pixels to the inch. The PDF itself was not changed.']);
    expect(png).toMatchObject({ actionLabel: 'Convert to PNG and download', outputExtension: 'png', partSuffix: 'page' });
    expect(png!.resultNotes).toEqual(['Each page is a PNG picture at 150 pixels to the inch, without loss. The PDF itself was not changed.']);
  });

  it('links each page to the other and to the tools of the design, never to itself', () => {
    const [jpg, png] = tool.pages;
    expect(relatedItems(tools, tool, '/', jpg).map((item) => item.href)).toEqual(['/pdf-to-png', '/jpg-to-pdf', '/extract-pdf-pages', '/compress-pdf', '/split-pdf']);
    expect(relatedItems(tools, tool, '/', png).map((item) => item.href)).toEqual(['/pdf-to-jpg', '/jpg-to-pdf', '/extract-pdf-pages', '/compress-pdf', '/split-pdf']);
  });

  it('leaves every other tool and page without page words or an output extension, so their outputs stay PDFs', () => {
    for (const each of tools) {
      if (each.id === 'pdf-to-images') continue;
      expect(each.widget?.outputExtension).toBeUndefined();
      for (const page of each.pages) {
        // Compress to a target size's pages name only their own main button, and still give PDFs.
        if (each.id === 'compress-to-target') {
          expect(Object.keys(page.words ?? {})).toEqual(['actionLabel']);
          continue;
        }
        expect(page.words).toBeUndefined();
        expect(pageWords(each, page)).toEqual(each.widget);
      }
    }
  });
});

/**
 * The keys a job is sent for what the page's items say (jobOption in src/hooks/useToolRun.ts): every
 * toggle kind's key, the turns, and `order` for pages that move. An option never uses one, so a
 * choice never replaces them.
 */
const itemKeys = new Set([
  ...Object.values(toggleRules).flatMap((rules) => Object.keys(rules.option([]))),
  ...Object.keys(turnRules.option(null, 1)),
  'order',
]);

type Values = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
type Texts = Readonly<Record<string, Readonly<Record<string, TextRule>>>>;
type Drawings = Readonly<Record<string, Readonly<Record<string, DrawingRule>>>>;
type Pictures = Readonly<Record<string, Readonly<Record<string, PictureRule>>>>;
type Passwords = Readonly<Record<string, Readonly<Record<string, PasswordRule>>>>;

/** Keys the worker itself puts beside the options it hands the engine: an option never uses one. */
const workerKeys = new Set(['passwords']);

/** A word the widget shows: not empty, and plain (no exclamation mark). */
const plain = (words: string | undefined) => words !== undefined && words.trim() !== '' && !words.includes('!');

/**
 * What is wrong with a tool's options, as plain sentences; none for a tool whose options are sound.
 * Run on every tool, and on entries made wrong on purpose so each check is seen to fail.
 */
function optionProblems(
  tool: Pick<Tool, 'id' | 'pages' | 'widget'>,
  values: Values,
  texts: Texts = optionTexts,
  drawings: Drawings = optionDrawings,
  pictures: Pictures = optionPictures,
  passwords: Passwords = optionPasswords,
): string[] {
  const options = tool.widget?.options ?? [];
  const problems: string[] = [];
  const keys = options.map((option) => option.key);
  if (new Set(keys).size !== keys.length) problems.push('an option key is used twice');
  for (const option of options) {
    if (option.kind === 'choice') {
      const listed = option.choices.map((choice) => choice.value);
      if (option.legend.trim() === '' || option.legend.includes('!')) problems.push(`${option.key}: the legend is empty or not plain`);
      if (listed.length < 2) problems.push(`${option.key}: fewer than two values`);
      if (new Set(listed).size !== listed.length) problems.push(`${option.key}: a value is listed twice`);
      if (option.choices.some((choice) => choice.label.trim() === '' || choice.label.includes('!'))) problems.push(`${option.key}: a value has no plain label`);
      if (!listed.includes(option.initial)) problems.push(`${option.key}: the starting value is not among the values`);
      const accepted = Object.hasOwn(values, tool.id) && Object.hasOwn(values[tool.id]!, option.key) ? values[tool.id]![option.key]! : undefined;
      if (!accepted || accepted.length !== listed.length || [...accepted].sort().join('\n') !== [...listed].sort().join('\n')) {
        problems.push(`${option.key}: the values are not those of option-values.ts`);
      }
    } else if (option.kind === 'text') {
      problems.push(...textProblems(tool.id, option, texts));
    } else if (option.kind === 'drawing') {
      problems.push(...drawingProblems(tool.id, option, drawings));
    } else if (option.kind === 'picture') {
      problems.push(...pictureProblems(tool.id, option, pictures));
    } else if (option.kind === 'new-password') {
      problems.push(...newPasswordProblems(tool.id, option, passwords));
    } else {
      problems.push(`${(option as { key: string }).key}: unknown kind`);
    }
    if (!/^[a-z][a-zA-Z0-9]*$/.test(option.key)) problems.push(`${option.key}: the key is not a plain word`);
    if (itemKeys.has(option.key)) problems.push(`${option.key}: the key is one the page's items send`);
    if (workerKeys.has(option.key)) problems.push(`${option.key}: the key is one the worker sends`);
    for (const page of tool.pages) {
      if (page.preset && Object.hasOwn(page.preset, option.key)) problems.push(`${option.key}: the preset of ${page.slug} uses the key`);
    }
  }
  problems.push(...conditionProblems(options));
  // A drawing needs a pointer, so it is never first: focus moves to the first option once the file is read,
  // and a keyboard user meets the tool's other ways before it.
  const first = options[0];
  if (first !== undefined && first.kind === 'drawing') problems.push(`${first.key}: the first option is a drawing`);
  // Every accepted-values line belongs to a choice the registry shows, every text line to a text, and every drawing line to a drawing.
  const kindOf = (key: string) => options.find((option) => option.key === key)?.kind;
  if (Object.hasOwn(values, tool.id)) {
    for (const key of Object.keys(values[tool.id]!)) {
      if (kindOf(key) !== 'choice') problems.push(`${key}: in option-values.ts but not an option of the tool`);
    }
  }
  if (Object.hasOwn(texts, tool.id)) {
    for (const key of Object.keys(texts[tool.id]!)) {
      if (kindOf(key) !== 'text') problems.push(`${key}: in optionTexts but not a text of the tool`);
    }
  }
  if (Object.hasOwn(drawings, tool.id)) {
    for (const key of Object.keys(drawings[tool.id] ?? {})) {
      if (kindOf(key) !== 'drawing') problems.push(`${key}: in optionDrawings but not a drawing of the tool`);
    }
  }
  if (Object.hasOwn(pictures, tool.id)) {
    for (const key of Object.keys(pictures[tool.id] ?? {})) {
      if (kindOf(key) !== 'picture') problems.push(`${key}: in optionPictures but not a picture of the tool`);
    }
  }
  if (Object.hasOwn(passwords, tool.id)) {
    for (const key of Object.keys(passwords[tool.id] ?? {})) {
      if (kindOf(key) !== 'new-password') problems.push(`${key}: in optionPasswords but not a new password of the tool`);
    }
  }
  return problems;
}

/** What is wrong with one new password: its words, and its line in optionPasswords. */
function newPasswordProblems(toolId: string, option: NewPasswordOption, passwords: Passwords): string[] {
  const problems: string[] = [];
  const words: [string, string | undefined, boolean][] = [
    ['label', option.label, true],
    ['again label', option.againLabel, true],
    ['hint', option.hint, true],
    ['empty sentence', option.emptySentence, true],
    ['again sentence', option.againSentence, true],
    ['refused sentence', option.refusedSentence, false],
  ];
  for (const [name, said, needed] of words) {
    if ((needed || said !== undefined) && !plain(said)) problems.push(`${option.key}: the ${name} is empty or not plain`);
  }
  const rule = passwordRule(toolId, option.key, passwords);
  if (rule === undefined) {
    problems.push(`${option.key}: no line in optionPasswords`);
    return problems;
  }
  // The format's own limit for a 256-bit key: every reader cuts a longer password to 127 bytes.
  if (!Number.isInteger(rule.maxLength) || rule.maxLength < 1 || rule.maxLength > 127) problems.push(`${option.key}: the most characters is not a whole number from 1 to 127`);
  if (!Object.hasOwn(passwordCharacters, rule.characters)) problems.push(`${option.key}: the character rule is not known`);
  // The hint ends with what the rule takes, in the rule's own words, so the hint and the rule cannot drift apart.
  else if (!option.hint.endsWith(passwordAdvice[rule.characters])) problems.push(`${option.key}: the hint does not end with what its rule takes`);
  // "Up to 127 characters": a hint that names a number of characters names the limit.
  for (const match of option.hint.matchAll(/(\d[\d,]*)\s+characters?\b/g)) {
    if (Number(match[1]!.replaceAll(',', '')) !== rule.maxLength) problems.push(`${option.key}: the hint names ${match[1]} characters, not the most characters`);
  }
  return problems;
}

const megabyte = 1_048_576;
const pictureTypes = new Set(['image/jpeg', 'image/png']);

/** What is wrong with one picture: its words, and its line in optionPictures. */
function pictureProblems(toolId: string, option: PictureOption, pictures: Pictures): string[] {
  const problems: string[] = [];
  const words: [string, string | undefined, boolean][] = [
    ['label', option.label, true],
    ['pick label', option.pickLabel, true],
    ['again label', option.againLabel, true],
    ['hint', option.hint, true],
    ['accepts name', option.acceptsName, true],
    ['empty sentence', option.emptySentence, true],
    ['refused sentence', option.refusedSentence, false],
    ['large advice', option.largeAdvice, false],
    ['too-large advice', option.tooLargeAdvice, false],
  ];
  for (const [name, said, needed] of words) {
    if ((needed || said !== undefined) && !plain(said)) problems.push(`${option.key}: the ${name} is empty or not plain`);
  }
  const rule = pictureRule(toolId, option.key, pictures);
  if (rule === undefined) {
    problems.push(`${option.key}: no line in optionPictures`);
    return problems;
  }
  const types: readonly string[] = rule.types;
  if (types.length < 1 || types.length > 2 || new Set(types).size !== types.length || !types.every((type) => pictureTypes.has(type))) {
    problems.push(`${option.key}: the types are not JPG, PNG or both, once each`);
  }
  const megabytes = rule.noticeBytes / megabyte;
  if (!Number.isInteger(megabytes) || megabytes < 1 || megabytes > 50) problems.push(`${option.key}: the notice size is not a whole number of MB from 1 to 50`);
  const millions = rule.noticePixels / 1_000_000;
  if (!Number.isInteger(millions) || millions < 1 || millions > 100) problems.push(`${option.key}: the notice pixels are not a whole number of millions from 1 to 100`);
  // "One over 8 MB": a hint that names a size in MB names the notice size, so the two cannot drift apart.
  for (const match of option.hint.matchAll(/(\d[\d,.]*)\s*MB\b/g)) {
    const named = match[1] ?? '';
    if (Number(named.replaceAll(',', '')) !== megabytes) problems.push(`${option.key}: the hint names ${named} MB, not the notice size`);
  }
  return problems;
}

/** What is wrong with one drawing: its words, and its line in optionDrawings. */
function drawingProblems(toolId: string, option: DrawingOption, drawings: Drawings): string[] {
  const problems: string[] = [];
  if (!plain(option.label)) problems.push(`${option.key}: the label is empty or not plain`);
  if (!plain(option.hint)) problems.push(`${option.key}: the hint is empty or not plain`);
  if (!plain(option.clearLabel)) problems.push(`${option.key}: the clear label is empty or not plain`);
  if (!plain(option.emptySentence)) problems.push(`${option.key}: the empty sentence is empty or not plain`);
  if (option.refusedSentence !== undefined && !plain(option.refusedSentence)) problems.push(`${option.key}: the refused sentence is empty or not plain`);
  const rule = drawingRule(toolId, option.key, drawings);
  if (rule === undefined) {
    problems.push(`${option.key}: no line in optionDrawings`);
    return problems;
  }
  if (!Number.isInteger(rule.maxLines) || rule.maxLines < 1 || rule.maxLines > 1000) problems.push(`${option.key}: the most lines is not a whole number from 1 to 1,000`);
  if (!Number.isInteger(rule.maxPoints) || rule.maxPoints < 1 || rule.maxPoints > 100_000) problems.push(`${option.key}: the most points is not a whole number from 1 to 100,000`);
  return problems;
}

/**
 * What is wrong with the tool's conditions: each names a choice listed earlier, with no condition of
 * its own, and one of its values; and the first option has none, so focus after reading has a place.
 */
function conditionProblems(options: readonly ToolOption[]): string[] {
  const problems: string[] = [];
  const first = options[0];
  if (first !== undefined && first.when !== undefined) problems.push(`${first.key}: the first option has a condition`);
  options.forEach((option, index) => {
    const when = option.when;
    if (when === undefined) return;
    const named = options.slice(0, index).find((earlier) => earlier.key === when.key);
    if (named === undefined || named.kind !== 'choice') {
      problems.push(`${option.key}: the condition names no earlier choice`);
      return;
    }
    if (named.when !== undefined) problems.push(`${option.key}: the condition names a choice that has a condition`);
    if (!named.choices.some((choice) => choice.value === when.value)) problems.push(`${option.key}: the condition names a value the choice does not have`);
  });
  return problems;
}

/** What is wrong with one text: its words, and its line in optionTexts. */
function textProblems(toolId: string, option: TextOption, texts: Texts): string[] {
  const problems: string[] = [];
  if (!plain(option.label)) problems.push(`${option.key}: the label is empty or not plain`);
  if (!plain(option.hint)) problems.push(`${option.key}: the hint is empty or not plain`);
  if (!plain(option.emptySentence)) problems.push(`${option.key}: the empty sentence is empty or not plain`);
  if (option.refusedSentence !== undefined && !plain(option.refusedSentence)) problems.push(`${option.key}: the refused sentence is empty or not plain`);
  if (option.charactersAdvice !== undefined && !plain(option.charactersAdvice)) problems.push(`${option.key}: the characters advice is empty or not plain`);
  const rule = textRule(toolId, option.key, texts);
  if (rule === undefined) {
    problems.push(`${option.key}: no line in optionTexts`);
    return problems;
  }
  if (!Number.isInteger(rule.maxLength) || rule.maxLength < 1 || rule.maxLength > 200) problems.push(`${option.key}: the most characters is not a whole number from 1 to 200`);
  if (!Object.hasOwn(characterRules, rule.characters)) problems.push(`${option.key}: the character rule is not known`);
  // The hint ends with what the rule takes, in the rule's own words, so the hint and the rule cannot drift apart.
  else if (!option.hint.endsWith(ruleAdvice[rule.characters])) problems.push(`${option.key}: the hint does not end with what its rule takes`);
  // "Up to 50 characters": a hint that names a number of characters names the limit, so the two cannot drift apart.
  for (const match of option.hint.matchAll(/(\d[\d,]*)\s+characters?\b/g)) {
    if (Number(match[1]!.replaceAll(',', '')) !== rule.maxLength) problems.push(`${option.key}: the hint names ${match[1]} characters, not the most characters`);
  }
  return problems;
}

describe('options', () => {
  const position: ToolOption = {
    kind: 'choice',
    key: 'position',
    legend: 'Where the numbers go',
    choices: [
      { value: 'bottom-centre', label: 'Bottom, in the middle' },
      { value: 'bottom-right', label: 'Bottom right' },
      { value: 'top-right', label: 'Top right' },
    ],
    initial: 'bottom-centre',
  };
  const merge = tools.find((each) => each.id === 'merge-pdf')!;
  const entry = (options: ToolOption[], preset?: Record<string, string>): Tool => ({
    ...merge,
    id: 'test-options',
    pages: [{ ...merge.pages[0]!, preset }],
    widget: { ...merge.widget!, options },
  });
  const values: Values = { 'test-options': { position: ['top-right', 'bottom-centre', 'bottom-right'] } };

  it('are sound for every tool, and option-values.ts names only tools in the registry', () => {
    for (const tool of tools) expect(optionProblems(tool, optionValues), tool.id).toEqual([]);
    for (const id of Object.keys(optionValues)) expect(tools.map((tool) => tool.id)).toContain(id);
  });

  it('pass for a sound entry, with its values in any order', () => {
    expect(optionProblems(entry([position]), values)).toEqual([]);
  });

  it('fail when a key is used twice', () => {
    expect(optionProblems(entry([position, { ...position, legend: 'Again' }]), values)).toContain('an option key is used twice');
  });

  it('fail with fewer than two values, a value twice or a value with no label', () => {
    const one = { ...position, choices: [position.choices[0]!] };
    expect(optionProblems(entry([one]), { 'test-options': { position: ['bottom-centre'] } })).toContain('position: fewer than two values');
    const twice = { ...position, choices: [...position.choices, position.choices[0]!] };
    expect(optionProblems(entry([twice]), values)).toContain('position: a value is listed twice');
    const unlabelled = { ...position, choices: position.choices.map((choice, index) => (index === 1 ? { ...choice, label: ' ' } : choice)) };
    expect(optionProblems(entry([unlabelled]), values)).toContain('position: a value has no plain label');
  });

  it('fail when the starting value is not among the values', () => {
    expect(optionProblems(entry([{ ...position, initial: 'middle' }]), values)).toContain('position: the starting value is not among the values');
  });

  it('fail when the values are not exactly those of option-values.ts', () => {
    const wrong = 'position: the values are not those of option-values.ts';
    expect(optionProblems(entry([position]), {})).toContain(wrong);
    expect(optionProblems(entry([position]), { 'test-options': { position: ['bottom-centre', 'bottom-right'] } })).toContain(wrong);
    expect(optionProblems(entry([position]), { 'test-options': { position: ['bottom-centre', 'bottom-right', 'top-left'] } })).toContain(wrong);
    expect(optionProblems(entry([position]), { 'test-options': { position: [...values['test-options']!.position!, 'top-left'] } })).toContain(wrong);
    expect(optionProblems(entry([position]), { 'test-options': { position: values['test-options']!.position!, size: ['small'] } })).toContain(
      'size: in option-values.ts but not an option of the tool',
    );
  });

  it("fail when an option key is one the page's items send: cuts, pages, turns or order", () => {
    expect([...itemKeys].sort()).toEqual(['cuts', 'order', 'pages', 'turns']);
    for (const key of itemKeys) {
      expect(optionProblems(entry([{ ...position, key }]), { 'test-options': { [key]: values['test-options']!.position! } })).toContain(
        `${key}: the key is one the page's items send`,
      );
    }
  });

  it('fail when a page preset uses an option key, so a choice never replaces what the page promises', () => {
    expect(optionProblems(entry([position], { position: 'top-right' }), values)).toContain('position: the preset of merge-pdf uses the key');
  });
});

describe('texts', () => {
  const words: TextOption = {
    kind: 'text',
    key: 'text',
    label: 'Watermark text',
    hint: 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.',
    emptySentence: 'Type the watermark text first.',
  };
  const merge = tools.find((each) => each.id === 'merge-pdf')!;
  const entry = (options: ToolOption[], preset?: Record<string, string>): Tool => ({
    ...merge,
    id: 'test-options',
    pages: [{ ...merge.pages[0]!, preset }],
    widget: { ...merge.widget!, options },
  });
  const texts: Texts = { 'test-options': { text: { maxLength: 50, characters: 'standard-font' } } };

  it('are sound for every tool, and optionTexts names only tools in the registry', () => {
    for (const tool of tools) expect(optionProblems(tool, optionValues, optionTexts), tool.id).toEqual([]);
    for (const id of Object.keys(optionTexts)) expect(tools.map((tool) => tool.id)).toContain(id);
  });

  it('pass for a sound entry, alone, with its own refused sentence, or beside a choice', () => {
    expect(optionProblems(entry([words]), {}, texts)).toEqual([]);
    expect(optionProblems(entry([{ ...words, refusedSentence: 'This watermark text could not be used. Check it and try again.' }]), {}, texts)).toEqual([]);
    const position: ToolOption = { kind: 'choice', key: 'position', legend: 'Where it goes', choices: [{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }], initial: 'top' };
    expect(optionProblems(entry([position, words]), { 'test-options': { position: ['top', 'bottom'] } }, texts)).toEqual([]);
  });

  it('fail when a word is empty or not plain', () => {
    expect(optionProblems(entry([{ ...words, label: ' ' }]), {}, texts)).toContain('text: the label is empty or not plain');
    expect(optionProblems(entry([{ ...words, hint: '' }]), {}, texts)).toContain('text: the hint is empty or not plain');
    expect(optionProblems(entry([{ ...words, emptySentence: 'Type it first!' }]), {}, texts)).toContain('text: the empty sentence is empty or not plain');
    expect(optionProblems(entry([{ ...words, refusedSentence: ' ' }]), {}, texts)).toContain('text: the refused sentence is empty or not plain');
    expect(optionProblems(entry([{ ...words, charactersAdvice: ' ' }]), {}, texts)).toContain('text: the characters advice is empty or not plain');
    expect(optionProblems(entry([{ ...words, charactersAdvice: 'Draw it instead!' }]), {}, texts)).toContain('text: the characters advice is empty or not plain');
    expect(optionProblems(entry([{ ...words, charactersAdvice: 'To sign in another script, draw it.' }]), {}, texts)).toEqual([]);
  });

  it('fail when the key is not a plain word, is used twice, is a preset key or one the items send', () => {
    expect(optionProblems(entry([{ ...words, key: 'the text' }]), {}, { 'test-options': { 'the text': texts['test-options']!.text! } })).toContain(
      'the text: the key is not a plain word',
    );
    expect(optionProblems(entry([words, { ...words, label: 'Again' }]), {}, texts)).toContain('an option key is used twice');
    expect(optionProblems(entry([words], { text: 'Draft' }), {}, texts)).toContain('text: the preset of merge-pdf uses the key');
    expect(optionProblems(entry([{ ...words, key: 'order' }]), {}, { 'test-options': { order: texts['test-options']!.text! } })).toContain(
      "order: the key is one the page's items send",
    );
  });

  it('fail with no line in optionTexts, or a line that belongs to no text', () => {
    expect(optionProblems(entry([words]), {}, {})).toContain('text: no line in optionTexts');
    expect(optionProblems(entry([words]), {}, { 'test-options': { other: texts['test-options']!.text! } })).toContain('text: no line in optionTexts');
    expect(optionProblems(entry([words]), {}, { 'test-options': { ...texts['test-options']!, size: texts['test-options']!.text! } })).toContain(
      'size: in optionTexts but not a text of the tool',
    );
    // A text's key is not a choice's line, and the reverse.
    expect(optionProblems(entry([words]), { 'test-options': { text: ['a', 'b'] } }, texts)).toContain('text: in option-values.ts but not an option of the tool');
    const position: ToolOption = { kind: 'choice', key: 'position', legend: 'Where it goes', choices: [{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }], initial: 'top' };
    expect(
      optionProblems(entry([position]), { 'test-options': { position: ['top', 'bottom'] } }, { 'test-options': { position: texts['test-options']!.text! } }),
    ).toContain('position: in optionTexts but not a text of the tool');
  });

  it('fail when the most characters is not a whole number from 1 to 200, or the rule is not known', () => {
    const limit = 'text: the most characters is not a whole number from 1 to 200';
    const noNumber = { ...words, hint: 'On one line. Use letters from English and other Western European languages, numbers and common marks.' };
    for (const maxLength of [0, 201, 2.5, Number.NaN]) {
      expect(optionProblems(entry([noNumber]), {}, { 'test-options': { text: { maxLength, characters: 'standard-font' } } })).toContain(limit);
    }
    expect(optionProblems(entry([noNumber]), {}, { 'test-options': { text: { maxLength: 200, characters: 'standard-font' } } })).toEqual([]);
    const unknown = { maxLength: 50, characters: 'any' as TextRule['characters'] };
    expect(optionProblems(entry([words]), {}, { 'test-options': { text: unknown } })).toContain('text: the character rule is not known');
    const inherited = { maxLength: 50, characters: 'toString' as TextRule['characters'] };
    expect(optionProblems(entry([words]), {}, { 'test-options': { text: inherited } })).toContain('text: the character rule is not known');
  });

  it('fail when the hint does not end with what its rule takes', () => {
    const wrong = 'text: the hint does not end with what its rule takes';
    expect(optionProblems(entry([{ ...words, hint: 'Up to 50 characters, on one line.' }]), {}, texts)).toContain(wrong);
    expect(optionProblems(entry([{ ...words, hint: `${words.hint} Or anything.` }]), {}, texts)).toContain(wrong);
    expect(optionProblems(entry([words]), {}, texts)).not.toContain(wrong);
  });

  it('fail when the hint names a number of characters other than the most characters', () => {
    expect(optionProblems(entry([words]), {}, { 'test-options': { text: { maxLength: 40, characters: 'standard-font' } } })).toContain(
      'text: the hint names 50 characters, not the most characters',
    );
    const long = { ...words, hint: 'Up to 1,200 characters. Use letters from English and other Western European languages, numbers and common marks.' };
    expect(optionProblems(entry([long]), {}, { 'test-options': { text: { maxLength: 200, characters: 'standard-font' } } })).toContain(
      'text: the hint names 1,200 characters, not the most characters',
    );
  });
});

describe('conditions', () => {
  const way: ToolOption = { kind: 'choice', key: 'way', legend: 'How', choices: [{ value: 'a', label: 'Way a' }, { value: 'b', label: 'Way b' }], initial: 'a' };
  const hint = 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.';
  const forA: ToolOption = { kind: 'text', key: 'textA', label: 'Text for a', hint, emptySentence: 'Type the text for a first.', when: { key: 'way', value: 'a' } };
  const forB: ToolOption = { kind: 'text', key: 'textB', label: 'Text for b', hint, emptySentence: 'Type the text for b first.', when: { key: 'way', value: 'b' } };
  const size: ToolOption = { kind: 'choice', key: 'size', legend: 'Size', choices: [{ value: 'small', label: 'Small' }, { value: 'large', label: 'Large' }], initial: 'small' };
  const merge = tools.find((each) => each.id === 'merge-pdf');
  if (merge === undefined || merge.widget === undefined) throw new Error('merge-pdf has no widget');
  const mergeWidget = merge.widget;
  const entry = (options: ToolOption[]): Tool => ({ ...merge, id: 'test-options', widget: { ...mergeWidget, options } });
  const values: Values = { 'test-options': { way: ['a', 'b'], size: ['small', 'large'] } };
  const rule: TextRule = { maxLength: 50, characters: 'standard-font' };
  const texts: Texts = { 'test-options': { textA: rule, textB: rule } };

  it('pass for every tool, and for an entry whose texts are shown by an earlier choice', () => {
    for (const tool of tools) expect(optionProblems(tool, optionValues, optionTexts), tool.id).toEqual([]);
    expect(optionProblems(entry([way, forA, forB, size]), values, texts)).toEqual([]);
    expect(optionProblems(entry([way, size, forB, { ...forA, when: { key: 'way', value: 'a' } }]), values, texts)).toEqual([]);
    const sizeForB: ToolOption = { ...size, when: { key: 'way', value: 'b' } };
    expect(optionProblems(entry([way, forA, sizeForB]), values, { 'test-options': { textA: rule } })).toEqual([]);
  });

  it('fail when a condition names no earlier choice: a later one, a text, a missing key or the option itself', () => {
    const wrong = (key: string) => `${key}: the condition names no earlier choice`;
    expect(optionProblems(entry([way, { ...forA, when: { key: 'size', value: 'small' } }, size]), values, { 'test-options': { textA: rule } })).toContain(wrong('textA'));
    expect(optionProblems(entry([way, forA, { ...forB, when: { key: 'textA', value: 'a' } }]), values, texts)).toContain(wrong('textB'));
    expect(optionProblems(entry([way, { ...forA, when: { key: 'nothing', value: 'a' } }]), values, { 'test-options': { textA: rule } })).toContain(wrong('textA'));
    expect(optionProblems(entry([way, { ...size, when: { key: 'size', value: 'small' } }]), values)).toContain(wrong('size'));
  });

  it('fail when a condition names a value the choice does not have', () => {
    expect(optionProblems(entry([way, { ...forA, when: { key: 'way', value: 'c' } }]), values, { 'test-options': { textA: rule } })).toContain(
      'textA: the condition names a value the choice does not have',
    );
  });

  it('fail when a condition names a choice that has a condition of its own', () => {
    const sizeForB: ToolOption = { ...size, when: { key: 'way', value: 'b' } };
    expect(optionProblems(entry([way, sizeForB, { ...forA, when: { key: 'size', value: 'small' } }]), values, { 'test-options': { textA: rule } })).toContain(
      'textA: the condition names a choice that has a condition',
    );
  });

  it('fail when the first option has a condition', () => {
    const problems = optionProblems(entry([{ ...forA, when: { key: 'way', value: 'a' } }, way]), values, { 'test-options': { textA: rule } });
    expect(problems).toContain('textA: the first option has a condition');
  });
});

describe('drawings', () => {
  const way: ToolOption = { kind: 'choice', key: 'way', legend: 'How', choices: [{ value: 'draw', label: 'Draw it' }, { value: 'type', label: 'Type it' }], initial: 'draw' };
  const drawing: DrawingOption = {
    kind: 'drawing',
    key: 'drawing',
    label: 'Draw your signature',
    hint: 'Draw with a finger, a mouse or a pen. To use a keyboard, type your name instead.',
    clearLabel: 'Clear the drawing',
    emptySentence: 'Draw your signature first.',
  };
  const merge = tools.find((each) => each.id === 'merge-pdf');
  if (merge === undefined || merge.widget === undefined) throw new Error('merge-pdf has no widget');
  const mergeWidget = merge.widget;
  const entry = (options: ToolOption[], preset?: Record<string, string>): Tool => ({ ...merge, id: 'test-options', pages: merge.pages.map((page) => ({ ...page, preset })), widget: { ...mergeWidget, options } });
  const values: Values = { 'test-options': { way: ['draw', 'type'] } };
  const rule: DrawingRule = { maxLines: 50, maxPoints: 5000 };
  const drawings: Drawings = { 'test-options': { drawing: rule } };

  it('are sound for every tool, and optionDrawings names only tools in the registry', () => {
    for (const tool of tools) expect(optionProblems(tool, optionValues, optionTexts, optionDrawings), tool.id).toEqual([]);
    for (const id of Object.keys(optionDrawings)) expect(tools.map((tool) => tool.id)).toContain(id);
  });

  it('pass for a sound entry after a choice, with its own refused sentence, or shown by that choice', () => {
    expect(optionProblems(entry([way, drawing]), values, {}, drawings)).toEqual([]);
    expect(optionProblems(entry([way, { ...drawing, refusedSentence: 'This signature could not be used. Clear it and draw again.' }]), values, {}, drawings)).toEqual([]);
    expect(optionProblems(entry([way, { ...drawing, when: { key: 'way', value: 'draw' } }]), values, {}, drawings)).toEqual([]);
  });

  it('fail when a word is empty or not plain', () => {
    expect(optionProblems(entry([way, { ...drawing, label: ' ' }]), values, {}, drawings)).toContain('drawing: the label is empty or not plain');
    expect(optionProblems(entry([way, { ...drawing, hint: '' }]), values, {}, drawings)).toContain('drawing: the hint is empty or not plain');
    expect(optionProblems(entry([way, { ...drawing, clearLabel: 'Clear!' }]), values, {}, drawings)).toContain('drawing: the clear label is empty or not plain');
    expect(optionProblems(entry([way, { ...drawing, emptySentence: 'Draw it first!' }]), values, {}, drawings)).toContain('drawing: the empty sentence is empty or not plain');
    expect(optionProblems(entry([way, { ...drawing, refusedSentence: ' ' }]), values, {}, drawings)).toContain('drawing: the refused sentence is empty or not plain');
  });

  it('fail with no line in optionDrawings, or a line that belongs to no drawing', () => {
    expect(optionProblems(entry([way, drawing]), values, {}, {})).toContain('drawing: no line in optionDrawings');
    expect(optionProblems(entry([way, drawing]), values, {}, { 'test-options': { other: rule } })).toContain('drawing: no line in optionDrawings');
    expect(optionProblems(entry([way, drawing]), values, {}, { 'test-options': { drawing: rule, size: rule } })).toContain('size: in optionDrawings but not a drawing of the tool');
    // A choice's key is not a drawing's line, a drawing's key not a text's line.
    expect(optionProblems(entry([way, drawing]), values, {}, { 'test-options': { drawing: rule, way: rule } })).toContain('way: in optionDrawings but not a drawing of the tool');
    expect(optionProblems(entry([way, drawing]), values, { 'test-options': { drawing: { maxLength: 50, characters: 'standard-font' } } }, drawings)).toContain(
      'drawing: in optionTexts but not a text of the tool',
    );
    // An inherited name is never taken for a tool's or a drawing's line.
    expect(optionProblems(entry([way, { ...drawing, key: 'toString' }]), values, {}, drawings)).toContain('toString: no line in optionDrawings');
  });

  it('fail when the most lines or points is not a whole number within its bounds', () => {
    const lines = 'drawing: the most lines is not a whole number from 1 to 1,000';
    const points = 'drawing: the most points is not a whole number from 1 to 100,000';
    for (const maxLines of [0, 1001, 2.5, Number.NaN]) {
      expect(optionProblems(entry([way, drawing]), values, {}, { 'test-options': { drawing: { ...rule, maxLines } } })).toContain(lines);
    }
    for (const maxPoints of [0, 100_001, 2.5, Number.POSITIVE_INFINITY]) {
      expect(optionProblems(entry([way, drawing]), values, {}, { 'test-options': { drawing: { ...rule, maxPoints } } })).toContain(points);
    }
    expect(optionProblems(entry([way, drawing]), values, {}, { 'test-options': { drawing: { maxLines: 1, maxPoints: 1 } } })).toEqual([]);
    expect(optionProblems(entry([way, drawing]), values, {}, { 'test-options': { drawing: { maxLines: 1000, maxPoints: 100_000 } } })).toEqual([]);
  });

  it('fail when the key is used twice, is a preset key or one the items send', () => {
    expect(optionProblems(entry([way, drawing, { ...drawing, label: 'Again' }]), values, {}, drawings)).toContain('an option key is used twice');
    expect(optionProblems(entry([way, drawing], { drawing: 'yes' }), values, {}, drawings)).toContain(`drawing: the preset of ${merge.pages[0]?.slug ?? ''} uses the key`);
    expect(optionProblems(entry([way, { ...drawing, key: 'turns' }]), values, {}, { 'test-options': { turns: rule } })).toContain("turns: the key is one the page's items send");
  });

  it('fail when the first option is a drawing, alone or before a choice', () => {
    expect(optionProblems(entry([drawing]), {}, {}, drawings)).toContain('drawing: the first option is a drawing');
    expect(optionProblems(entry([drawing, way]), values, {}, drawings)).toContain('drawing: the first option is a drawing');
    expect(optionProblems(entry([way, drawing]), values, {}, drawings)).not.toContain('drawing: the first option is a drawing');
  });
});

describe('pictures', () => {
  const way: ToolOption = { kind: 'choice', key: 'way', legend: 'How', choices: [{ value: 'draw', label: 'Draw it' }, { value: 'picture', label: 'Use a picture' }], initial: 'draw' };
  const picture: PictureOption = {
    kind: 'picture',
    key: 'picture',
    label: 'Picture of your signature',
    pickLabel: 'Choose a picture',
    againLabel: 'Choose another picture',
    hint: 'A JPG or PNG picture. One over 8 MB or 16 million pixels still works but makes the signed file large.',
    acceptsName: 'a JPG or PNG picture',
    emptySentence: 'Choose a picture of your signature first.',
  };
  const merge = tools.find((each) => each.id === 'merge-pdf');
  if (merge === undefined || merge.widget === undefined) throw new Error('merge-pdf has no widget');
  const mergeWidget = merge.widget;
  const entry = (options: ToolOption[], preset?: Record<string, string>): Tool => ({ ...merge, id: 'test-options', pages: merge.pages.map((page) => ({ ...page, preset })), widget: { ...mergeWidget, options } });
  const values: Values = { 'test-options': { way: ['draw', 'picture'] } };
  const rule: PictureRule = { types: ['image/jpeg', 'image/png'], noticeBytes: 8 * 1_048_576, noticePixels: 16_000_000 };
  const pictures: Pictures = { 'test-options': { picture: rule } };
  const check = (options: ToolOption[], table: Pictures = pictures, preset?: Record<string, string>) =>
    optionProblems(entry(options, preset), options.includes(way) ? values : {}, {}, {}, table);

  it('are sound for every tool, and optionPictures names only tools in the registry', () => {
    for (const tool of tools) expect(optionProblems(tool, optionValues, optionTexts, optionDrawings, optionPictures), tool.id).toEqual([]);
    for (const id of Object.keys(optionPictures)) expect(tools.map((tool) => tool.id)).toContain(id);
  });

  it('pass for a sound entry: first, after a choice, with a condition, or with its own words', () => {
    expect(check([picture])).toEqual([]);
    expect(check([way, { ...picture, when: { key: 'way', value: 'picture' } }])).toEqual([]);
    expect(
      check([way, { ...picture, refusedSentence: 'This picture could not be used. Choose another picture.', largeAdvice: 'Save a smaller copy. You can still go ahead.', tooLargeAdvice: 'Crop it to the signature, or save a smaller copy.' }]),
    ).toEqual([]);
    expect(check([picture], { 'test-options': { picture: { ...rule, types: ['image/png'] } } })).toEqual([]);
  });

  it('fail when a word is empty or not plain', () => {
    expect(check([{ ...picture, label: ' ' }])).toContain('picture: the label is empty or not plain');
    expect(check([{ ...picture, pickLabel: '' }])).toContain('picture: the pick label is empty or not plain');
    expect(check([{ ...picture, againLabel: 'Again!' }])).toContain('picture: the again label is empty or not plain');
    expect(check([{ ...picture, hint: '' }])).toContain('picture: the hint is empty or not plain');
    expect(check([{ ...picture, acceptsName: ' ' }])).toContain('picture: the accepts name is empty or not plain');
    expect(check([{ ...picture, emptySentence: 'Choose one!' }])).toContain('picture: the empty sentence is empty or not plain');
    expect(check([{ ...picture, refusedSentence: ' ' }])).toContain('picture: the refused sentence is empty or not plain');
    expect(check([{ ...picture, largeAdvice: '' }])).toContain('picture: the large advice is empty or not plain');
    expect(check([{ ...picture, tooLargeAdvice: 'Smaller!' }])).toContain('picture: the too-large advice is empty or not plain');
  });

  it('fail with no line in optionPictures, or a line that belongs to no picture', () => {
    expect(check([picture], {})).toContain('picture: no line in optionPictures');
    expect(check([picture], { 'test-options': { other: rule } })).toContain('picture: no line in optionPictures');
    expect(check([picture], { 'test-options': { picture: rule, size: rule } })).toContain('size: in optionPictures but not a picture of the tool');
    expect(check([way, picture], { 'test-options': { picture: rule, way: rule } })).toContain('way: in optionPictures but not a picture of the tool');
    // An inherited name is never taken for a tool's or a picture's line.
    expect(check([{ ...picture, key: 'toString' }])).toContain('toString: no line in optionPictures');
  });

  it('fail when the types are not JPG, PNG or both, once each', () => {
    const wrong = 'picture: the types are not JPG, PNG or both, once each';
    const typesOf = (types: readonly string[]): Pictures => ({ 'test-options': { picture: { ...rule, types: types as PictureRule['types'] } } });
    for (const types of [[], ['image/jpeg', 'image/jpeg'], ['image/gif'], ['image/jpeg', 'image/png', 'image/webp'], ['application/pdf']]) {
      expect(check([picture], typesOf(types)), types.join(' ')).toContain(wrong);
    }
    expect(check([picture], typesOf(['image/jpeg']))).not.toContain(wrong);
  });

  it('fail when a notice size is not within its bounds', () => {
    const bytes = 'picture: the notice size is not a whole number of MB from 1 to 50';
    const pixels = 'picture: the notice pixels are not a whole number of millions from 1 to 100';
    const noSize = { ...picture, hint: 'A JPG or PNG picture.' };
    for (const noticeBytes of [0, 51 * 1_048_576, 8_000_000, 1.5 * 1_048_576, Number.NaN]) {
      expect(check([noSize], { 'test-options': { picture: { ...rule, noticeBytes } } })).toContain(bytes);
    }
    for (const noticePixels of [0, 101_000_000, 16_500_000, Number.NaN]) {
      expect(check([noSize], { 'test-options': { picture: { ...rule, noticePixels } } })).toContain(pixels);
    }
    expect(check([noSize], { 'test-options': { picture: { ...rule, noticeBytes: 1_048_576, noticePixels: 1_000_000 } } })).toEqual([]);
    expect(check([noSize], { 'test-options': { picture: { ...rule, noticeBytes: 50 * 1_048_576, noticePixels: 100_000_000 } } })).toEqual([]);
  });

  it('fail when the hint names a size in MB other than the notice size', () => {
    expect(check([picture], { 'test-options': { picture: { ...rule, noticeBytes: 10 * 1_048_576 } } })).toContain('picture: the hint names 8 MB, not the notice size');
    expect(check([picture])).not.toContain('picture: the hint names 8 MB, not the notice size');
  });

  it('fail when the key is used twice, is a preset key, one the items send, or passwords', () => {
    expect(check([picture, { ...picture, label: 'Again' }])).toContain('an option key is used twice');
    expect(check([picture], pictures, { picture: 'yes' })).toContain(`picture: the preset of ${merge.pages[0]?.slug ?? ''} uses the key`);
    expect(check([{ ...picture, key: 'order' }], { 'test-options': { order: rule } })).toContain("order: the key is one the page's items send");
    expect(check([{ ...picture, key: 'passwords' }], { 'test-options': { passwords: rule } })).toContain('passwords: the key is one the worker sends');
  });
});

describe('the worker keys', () => {
  it('fail for an option of any kind keyed passwords, which the worker sends beside the options', () => {
    const merge = tools.find((each) => each.id === 'merge-pdf');
    if (merge === undefined || merge.widget === undefined) throw new Error('merge-pdf has no widget');
    const choice: ToolOption = { kind: 'choice', key: 'passwords', legend: 'Which', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], initial: 'a' };
    const tool: Tool = { ...merge, id: 'test-options', widget: { ...merge.widget, options: [choice] } };
    expect(optionProblems(tool, { 'test-options': { passwords: ['a', 'b'] } })).toContain('passwords: the key is one the worker sends');
  });
});

describe('new passwords', () => {
  // Protect's key, `newPassword`: never `password`, one letter from the worker's `passwords`.
  const password: NewPasswordOption = {
    kind: 'new-password',
    key: 'newPassword',
    label: 'New password',
    againLabel: 'Type the new password again',
    hint: `Up to 127 characters. ${passwordAdvice['printable-ascii']}`,
    emptySentence: 'Type a password first.',
    againSentence: 'Type the password again to check it.',
  };
  const way: ToolOption = { kind: 'choice', key: 'way', legend: 'How', choices: [{ value: 'lock', label: 'Lock it' }, { value: 'keep', label: 'Keep it' }], initial: 'lock' };
  const merge = tools.find((each) => each.id === 'merge-pdf');
  if (merge === undefined || merge.widget === undefined) throw new Error('merge-pdf has no widget');
  const mergeWidget = merge.widget;
  const entry = (options: ToolOption[], preset?: Record<string, string>): Tool => ({ ...merge, id: 'test-options', pages: merge.pages.map((page) => ({ ...page, preset })), widget: { ...mergeWidget, options } });
  const values: Values = { 'test-options': { way: ['lock', 'keep'] } };
  const rule: PasswordRule = { maxLength: 127, characters: 'printable-ascii' };
  const passwords: Passwords = { 'test-options': { newPassword: rule } };
  const check = (options: ToolOption[], table: Passwords = passwords, preset?: Record<string, string>) =>
    optionProblems(entry(options, preset), options.includes(way) ? values : {}, {}, {}, {}, table);

  it('are sound for every tool, and optionPasswords names only tools in the registry', () => {
    for (const tool of tools) expect(optionProblems(tool, optionValues, optionTexts, optionDrawings, optionPictures, optionPasswords), tool.id).toEqual([]);
    for (const id of Object.keys(optionPasswords)) expect(tools.map((tool) => tool.id)).toContain(id);
  });

  it('pass for a sound entry keyed newPassword: first, after a choice, with a condition, or with its own refused sentence', () => {
    expect(password.key).toBe('newPassword');
    expect(check([password])).toEqual([]);
    expect(check([way, { ...password, when: { key: 'way', value: 'lock' } }])).toEqual([]);
    expect(check([{ ...password, refusedSentence: 'This password could not be used. Go back to your file and type it again.' }])).toEqual([]);
    expect(check([{ ...password, hint: passwordAdvice['printable-ascii'] }], { 'test-options': { newPassword: { maxLength: 1, characters: 'printable-ascii' } } })).toEqual([]);
  });

  it('fail when a word is empty or not plain', () => {
    expect(check([{ ...password, label: ' ' }])).toContain('newPassword: the label is empty or not plain');
    expect(check([{ ...password, againLabel: '' }])).toContain('newPassword: the again label is empty or not plain');
    expect(check([{ ...password, hint: '' }])).toContain('newPassword: the hint is empty or not plain');
    expect(check([{ ...password, emptySentence: 'Type one!' }])).toContain('newPassword: the empty sentence is empty or not plain');
    expect(check([{ ...password, againSentence: ' ' }])).toContain('newPassword: the again sentence is empty or not plain');
    expect(check([{ ...password, refusedSentence: '' }])).toContain('newPassword: the refused sentence is empty or not plain');
  });

  it('fail with no line in optionPasswords, or a line that belongs to no new password', () => {
    expect(check([password], {})).toContain('newPassword: no line in optionPasswords');
    expect(check([password], { 'test-options': { other: rule } })).toContain('newPassword: no line in optionPasswords');
    expect(check([password], { 'test-options': { newPassword: rule, size: rule } })).toContain('size: in optionPasswords but not a new password of the tool');
    expect(check([way, password], { 'test-options': { newPassword: rule, way: rule } })).toContain('way: in optionPasswords but not a new password of the tool');
    // A new password's key is not a text's line, and the reverse.
    expect(optionProblems(entry([password]), {}, { 'test-options': { newPassword: { maxLength: 50, characters: 'standard-font' } } }, {}, {}, passwords)).toContain(
      'newPassword: in optionTexts but not a text of the tool',
    );
    // An inherited name is never taken for a tool's or a password's line.
    expect(check([{ ...password, key: 'toString' }])).toContain('toString: no line in optionPasswords');
  });

  it('fail when the most characters is not a whole number from 1 to 127, or the rule is not known', () => {
    const limit = 'newPassword: the most characters is not a whole number from 1 to 127';
    const noNumber = { ...password, hint: passwordAdvice['printable-ascii'] };
    for (const maxLength of [0, 128, 2.5, Number.NaN]) {
      expect(check([noNumber], { 'test-options': { newPassword: { maxLength, characters: 'printable-ascii' } } }), String(maxLength)).toContain(limit);
    }
    expect(check([noNumber], { 'test-options': { newPassword: { maxLength: 127, characters: 'printable-ascii' } } })).toEqual([]);
    for (const characters of ['any', 'standard-font', 'toString']) {
      expect(check([password], { 'test-options': { newPassword: { maxLength: 127, characters: characters as PasswordRule['characters'] } } })).toContain(
        'newPassword: the character rule is not known',
      );
    }
  });

  it('fail when the hint does not end with what its rule takes, or names another number of characters', () => {
    const wrong = 'newPassword: the hint does not end with what its rule takes';
    expect(check([{ ...password, hint: 'Up to 127 characters.' }])).toContain(wrong);
    expect(check([{ ...password, hint: `${password.hint} Or anything.` }])).toContain(wrong);
    expect(check([password])).not.toContain(wrong);
    expect(check([password], { 'test-options': { newPassword: { maxLength: 64, characters: 'printable-ascii' } } })).toContain(
      'newPassword: the hint names 127 characters, not the most characters',
    );
  });

  it('fail when the key is not a plain word, is used twice, is a preset key, one the items send, or passwords', () => {
    expect(check([{ ...password, key: 'new password' }], { 'test-options': { 'new password': rule } })).toContain('new password: the key is not a plain word');
    expect(check([password, { ...password, label: 'Again' }])).toContain('an option key is used twice');
    expect(check([password], passwords, { newPassword: 'x' })).toContain(`newPassword: the preset of ${merge.pages[0]?.slug ?? ''} uses the key`);
    expect(check([{ ...password, key: 'pages' }], { 'test-options': { pages: rule } })).toContain("pages: the key is one the page's items send");
    expect(check([{ ...password, key: 'passwords' }], { 'test-options': { passwords: rule } })).toContain('passwords: the key is one the worker sends');
  });
});

describe('group hub pages', () => {
  // catalogue.ts is a type, so its slugs are read as text, as catalogue.test.ts does. The pattern matches every
  // quoted name in the file, a few more than the catalogue's slugs, which only widens what is refused.
  const catalogueSlugs = [...readFileSync('src/tools/catalogue.ts', 'utf8').matchAll(/\| '([^']+)'/g)].map((match) => match[1] ?? '');
  // Addresses a hub page may never take: every footer page (so a new one is covered with no second list), 404 and the two crawler files.
  const reserved = [...footerLinks.map((link) => link.href.slice(1)), '404', 'sitemap.xml', 'robots.txt'];
  const deviceWords = /device|browser|upload|never leaves|not sent/i;

  /** Everything wrong with the groups' hub words and addresses, as plain lines naming the group. */
  function groupProblems(all: Group[], published: Tool[]): string[] {
    const problems: string[] = [];
    const slugs = all.map((group) => group.slug);
    if (new Set(slugs).size !== slugs.length) problems.push('a hub address is used twice');
    for (const group of all) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(group.slug)) problems.push(`${group.name}: the address is not lowercase with hyphens`);
      if (catalogueSlugs.includes(group.slug)) problems.push(`${group.name}: the address is a catalogue slug`);
      if (reserved.includes(group.slug)) problems.push(`${group.name}: the address is a site page or a crawler file`);
      if (group.title.length >= 60 || !group.title.endsWith(' - PDFkaro')) problems.push(`${group.name}: the title is 60 characters or more, or does not end with the brand`);
      if (group.description.length >= 155) problems.push(`${group.name}: the description is 155 characters or more`);
      for (const words of [group.title, group.description, group.sentence]) {
        if (words.trim() === '' || words.includes('!')) problems.push(`${group.name}: a hub word is empty or has an exclamation mark`);
      }
      const claims = deviceWords.test([group.title, group.sentence, group.description].join(' '));
      if (claims && !group.claimsDevice) problems.push(`${group.name}: its words say where files go, but it does not declare claimsDevice`);
      if (group.claimsDevice) {
        const server = published.filter((tool) => tool.group === group.id && tool.runsIn !== 'browser').map((tool) => tool.id);
        if (server.length > 0) problems.push(`${group.name}: its words claim the device, but ${server.join(', ')} does not run in the browser`);
      }
    }
    const pageWordsOf = (key: 'title' | 'description') => [
      ...allPages(published).map(({ page }) => page[key]),
      ...all.filter((group) => published.some((tool) => tool.group === group.id)).map((group) => group[key]),
    ];
    for (const key of ['title', 'description'] as const) {
      const words = pageWordsOf(key);
      if (new Set(words).size !== words.length) problems.push(`a ${key} is shared by two tool or hub pages`);
    }
    return problems;
  }

  const organise = groups.find((group) => group.id === 'organise')!;
  const others = groups.filter((group) => group.id !== 'organise');
  const withOrganise = (change: Partial<Group>) => [{ ...organise, ...change }, ...others];

  it('are sound for every group', () => {
    expect(groupProblems(groups, tools)).toEqual([]);
  });

  it('use the agent\'s default addresses, the group name at the root, until the owner answers', () => {
    expect(groups.map((group) => group.slug)).toEqual([
      'organise-pages',
      'make-smaller-and-fix',
      'convert-to-pdf',
      'convert-from-pdf',
      'edit-and-sign',
      'protect',
      'read-and-check',
    ]);
  });

  it('fail when an address is a tool slug, a site page or a crawler file, or is used twice', () => {
    expect(groupProblems(withOrganise({ slug: 'merge-pdf' as HubSlug }), tools)).toContain('Organise pages: the address is a catalogue slug');
    // An unpublished catalogue slug is refused too.
    expect(groupProblems(withOrganise({ slug: 'pdf-viewer' as HubSlug }), tools)).toContain('Organise pages: the address is a catalogue slug');
    for (const slug of ['about', 'contact', '404', 'sitemap.xml', 'robots.txt']) {
      expect(groupProblems(withOrganise({ slug: slug as HubSlug }), tools), slug).toContain('Organise pages: the address is a site page or a crawler file');
    }
    expect(groupProblems(withOrganise({ slug: 'protect' }), tools)).toContain('a hub address is used twice');
    expect(groupProblems(withOrganise({ slug: 'Organise_Pages' as HubSlug }), tools)).toContain('Organise pages: the address is not lowercase with hyphens');
  });

  it('fail on a long title, a title without the brand or a long description', () => {
    expect(groupProblems(withOrganise({ title: `${'x'.repeat(50)} - PDFkaro` }), tools)).toContain(
      'Organise pages: the title is 60 characters or more, or does not end with the brand',
    );
    expect(groupProblems(withOrganise({ title: 'Organise PDF pages' }), tools)).toContain(
      'Organise pages: the title is 60 characters or more, or does not end with the brand',
    );
    expect(groupProblems(withOrganise({ description: 'x'.repeat(155) }), tools)).toContain('Organise pages: the description is 155 characters or more');
  });

  it('fail when a hub title or description repeats a tool page\'s', () => {
    const merge = tools.find((tool) => tool.id === 'merge-pdf')!.pages[0]!;
    expect(groupProblems(withOrganise({ title: merge.title }), tools)).toContain('a title is shared by two tool or hub pages');
    expect(groupProblems(withOrganise({ description: merge.description }), tools)).toContain('a description is shared by two tool or hub pages');
  });

  it('fail when words say where files go but the group does not declare it', () => {
    expect(groupProblems(withOrganise({ sentence: 'Tools that work in your browser.', claimsDevice: false, description: 'Organise.' }), tools)).toContain(
      'Organise pages: its words say where files go, but it does not declare claimsDevice',
    );
    for (const words of ['Files are not uploaded.', 'Your file never leaves.', 'It is not sent anywhere.', 'On your device.']) {
      expect(groupProblems(withOrganise({ sentence: words, description: 'Organise.', claimsDevice: false }), tools), words).toContain(
        'Organise pages: its words say where files go, but it does not declare claimsDevice',
      );
    }
  });

  it('fail, naming the group, when a server tool joins a group whose words claim the device', () => {
    const merge = tools.find((tool) => tool.id === 'merge-pdf')!;
    const server: Tool = { ...merge, id: 'test-server-tool', runsIn: 'server', pages: [{ ...merge.pages[0]!, slug: 'word-to-pdf', title: 'Test - PDFkaro', description: 'Test.' }] };
    expect(groupProblems(groups, [...tools, server])).toContain(
      'Organise pages: its words claim the device, but test-server-tool does not run in the browser',
    );
  });
});
