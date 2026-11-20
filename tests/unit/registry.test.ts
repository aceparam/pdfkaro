import { describe, expect, it } from 'vitest';
import { groups, tools } from '../../src/tools/registry';
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
    const order = [...catalogue.matchAll(/\| (\/[a-z0-9-]+) \|/g)].map((match) => match[1]!.slice(1));
    // Image to PDF is one tool with three pages (the owner's decision of 13 Nov 2026). Its first page,
    // /jpg-to-pdf, sits under "Convert to PDF", but the owner's tool is Image to PDF, which the
    // export lists at /image2pdf, right after Rotate PDF; so it is counted there.
    const placeOf = (tool: (typeof tools)[number]) => (tool.id === 'images-to-pdf' ? 'image2pdf' : tool.pages[0]!.slug);
    const positions = tools.map((tool) => order.indexOf(placeOf(tool)));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
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

  it('is one tool with three pages under Convert to PDF, taking JPG and PNG, after Rotate', () => {
    expect(tool).toMatchObject({ group: 'to-pdf', runsIn: 'browser', phase: 1, accepts: ['image/jpeg', 'image/png'] });
    expect(tool.pages.map((page) => page.slug)).toEqual(['jpg-to-pdf', 'png-to-pdf', 'image-to-pdf']);
    expect(tool.pages.map((page) => page.name)).toEqual(['JPG to PDF', 'PNG to PDF', 'Image to PDF']);
    for (const page of tool.pages) expect(page.accepts).toBeUndefined();
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('images-to-pdf')).toBe(ids.indexOf('rotate-pdf') + 1);
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
      expect(each.widget?.unsupportedAdvice).toBeUndefined();
      expect(each.widget?.damagedAdvice).toBeUndefined();
    }
  });
});

describe('Compress PDF', () => {
  const tool = tools.find((each) => each.id === 'compress-pdf')!;

  it('is the first row of "Make smaller and fix", after Image to PDF, taking one PDF', () => {
    expect(tool).toMatchObject({ group: 'smaller', runsIn: 'browser', phase: 1, accepts: ['application/pdf'] });
    expect(tool.related).toEqual(['merge-pdf', 'split-pdf', 'delete-pdf-pages', 'jpg-to-pdf', 'pdf-to-jpg']);
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
      expect(each.widget?.resultWas).toBeUndefined();
      expect(each.widget?.noSmaller).toBeUndefined();
    }
  });
});

describe('PDF to JPG and PDF to PNG', () => {
  const tool = tools.find((each) => each.id === 'pdf-to-images')!;

  it('is one tool with two pages under Convert from PDF, taking one PDF, after Compress PDF, each page setting its format', () => {
    expect(tool).toMatchObject({ group: 'from-pdf', runsIn: 'browser', phase: 1, accepts: ['application/pdf'] });
    const ids = tools.map((each) => each.id);
    expect(ids.indexOf('pdf-to-images')).toBe(ids.indexOf('compress-pdf') + 1);
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
        expect(page.words).toBeUndefined();
        expect(pageWords(each, page)).toEqual(each.widget);
      }
    }
  });
});
