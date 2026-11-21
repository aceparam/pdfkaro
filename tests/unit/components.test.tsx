import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilePicker } from '../../src/components/FilePicker/FilePicker';
import { Notice } from '../../src/components/Notice/Notice';
import { PageGrid, sameItem, type GridItem } from '../../src/components/PageGrid/PageGrid';
import { PasswordField } from '../../src/components/PasswordField/PasswordField';
import { ProgressBar } from '../../src/components/ProgressBar/ProgressBar';
import { Result } from '../../src/components/Result/Result';
import { ChoiceGroup } from '../../src/components/ChoiceGroup/ChoiceGroup';
import { errorId, TextField } from '../../src/components/TextField/TextField';

const noop = () => {};

describe('FilePicker', () => {
  const html = renderToStaticMarkup(<FilePicker label="Choose PDF files" accepts={['application/pdf']} multiple onFiles={noop} />);

  it('is a real file input inside a label, so it works with the keyboard and before the script', () => {
    expect(html).toMatch(/^<label class="button [^"]*"><input [^>]*type="file"/);
    expect(html).toContain('accept="application/pdf"');
    expect(html).toContain('multiple=""');
    expect(html).toContain('Choose PDF files</label>');
  });

  it('takes the plainer look once files are listed', () => {
    expect(renderToStaticMarkup(<FilePicker label="Add more files" accepts={[]} multiple onFiles={noop} look="secondary" />)).toMatch(/^<label class="button-secondary /);
  });
});

describe('PageGrid', () => {
  const items = [
    { id: 'a', title: 'report.pdf', detail: '64 pages, 6.1 MB' },
    { id: 'b', title: 'appendix.pdf', detail: 'Getting ready' },
  ];
  const html = renderToStaticMarkup(<PageGrid items={items} onMove={noop} onRemove={noop} />);

  it('names each button after its file', () => {
    for (const label of ['Move report.pdf up', 'Move report.pdf down', 'Remove report.pdf', 'Move appendix.pdf up', 'Remove appendix.pdf']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('marks the first Move up and the last Move down as unavailable but keeps them as buttons', () => {
    expect(html).toMatch(/aria-label="Move report.pdf up" aria-disabled="true"/);
    expect(html).toMatch(/aria-label="Move appendix.pdf down" aria-disabled="true"/);
    expect(html).not.toMatch(/aria-label="Move report.pdf down" aria-disabled/);
    expect(html).not.toContain(' disabled=');
  });

  it('can be dragged only when there is something to reorder', () => {
    expect(html).toContain('draggable="true"');
    expect(renderToStaticMarkup(<PageGrid items={[items[0]!]} onMove={noop} onRemove={noop} />)).toContain('draggable="false"');
  });

  it('shows blank paper in a hidden slot until a thumbnail is drawn', () => {
    expect(html.match(/<div class="[^"]*slot[^"]*" aria-hidden="true"><div class="[^"]*picture[^"]*"><div class="[^"]*blank[^"]*"><\/div><\/div><\/div>/g)).toHaveLength(2);
    expect(html).not.toContain('<img');
  });

  it('shows a drawn thumbnail as a picture nobody can focus, hear or drag on its own', () => {
    const drawn = renderToStaticMarkup(
      <PageGrid items={[{ ...items[0]!, thumbnail: 'blob:http://localhost/1' }, items[1]!]} onMove={noop} onRemove={noop} />,
    );
    expect(drawn).toMatch(/<div class="[^"]*slot[^"]*" aria-hidden="true"><div class="[^"]*picture[^"]*"><img class="[^"]*thumb[^"]*" src="blob:http:\/\/localhost\/1" alt="" draggable="false"\/><\/div><\/div>/);
    expect(drawn).not.toMatch(/<img[^>]*tabindex/);
    expect(drawn.match(/blank/g)).toHaveLength(1);
  });

  it('shows each item in order with its detail', () => {
    expect(html.indexOf('report.pdf')).toBeLessThan(html.indexOf('appendix.pdf'));
    expect(html).toContain('Getting ready');
  });
});

describe('PageGrid listing the pages of one file', () => {
  const pages = Array.from({ length: 3 }, (_, index) => ({ id: `f1:${index + 1}`, title: `Page ${index + 1}`, detail: '' }));
  const html = renderToStaticMarkup(<PageGrid items={pages} onMove={noop} onRemove={noop} controls={false} layout="grid" />);

  it('lays the pages out as a grid, each named under its picture', () => {
    expect(html).toMatch(/^<ol class="[^"]*grid/);
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).toContain('Page 3</div>');
  });

  it('gives pages no buttons and no drag when the tool gives them no controls', () => {
    expect(html).not.toContain('<button');
    expect(html).not.toContain('draggable="true"');
    expect(html).not.toContain('<div class="muted">');
  });
});

describe('PageGrid with pages that move', () => {
  const pages = [3, 1, 2].map((page) => ({ id: `f1:${page}`, title: `Page ${page}`, detail: '' }));
  const html = renderToStaticMarkup(<PageGrid items={pages} onMove={noop} onRemove={noop} layout="grid" />);

  it('gives each page Earlier and Later, stacked, named for the page, and no Remove', () => {
    expect(html.match(/>Earlier</g)).toHaveLength(3);
    expect(html.match(/>Later</g)).toHaveLength(3);
    expect(html).toContain('aria-label="Move page 3 earlier"');
    expect(html).toContain('aria-label="Move page 2 later"');
    expect(html).toMatch(/class="[^"]*pageMoves/);
    expect(html).not.toContain('Remove');
    expect(html).not.toContain('Move up');
  });

  it('marks the first Earlier and the last Later unavailable', () => {
    expect(html).toMatch(/aria-label="Move page 3 earlier" aria-disabled="true"/);
    expect(html).toMatch(/aria-label="Move page 2 later" aria-disabled="true"/);
    expect(html).not.toMatch(/aria-label="Move page 1 (earlier|later)" aria-disabled/);
  });

  it('takes the end from the whole file when only some pages are shown', () => {
    const shown = renderToStaticMarkup(<PageGrid items={pages} onMove={noop} onRemove={noop} layout="grid" total={900} />);
    expect(shown).not.toMatch(/aria-label="Move page 2 later" aria-disabled/);
  });

  it('leaves a list of files with Move up, Move down and Remove', () => {
    const rows = renderToStaticMarkup(<PageGrid items={pages} onMove={noop} onRemove={noop} />);
    expect(rows).toContain('>Move up<');
    expect(rows).toContain('>Remove<');
    expect(rows).not.toContain('>Earlier<');
  });
});

describe('PageGrid with pages that turn', () => {
  const pages = [1, 2, 3].map((page) => ({ id: `f1:${page}`, title: `Page ${page}`, detail: '', thumbnail: `blob:http://localhost/${page}` }));
  const turnsOf: Record<string, number> = { 'f1:3': 1, 'f1:2': 2 };
  const turns = { of: (id: string) => turnsOf[id] ?? 0, caption: (title: string, turn: number) => (turn ? `${title}, turned ${['', 'right', 'half round', 'left'][turn]}` : title), onTurn: noop, stamp: () => 'one' };
  const html = renderToStaticMarkup(<PageGrid items={pages} onMove={noop} onRemove={noop} controls={false} layout="grid" turns={turns} />);

  it('gives each page Turn left and Turn right, named for the page, never unavailable, and no Remove', () => {
    expect(html.match(/>Turn left</g)).toHaveLength(3);
    expect(html.match(/>Turn right</g)).toHaveLength(3);
    expect(html).toContain('aria-label="Turn page 1 left"');
    expect(html).toContain('aria-label="Turn page 3 right"');
    expect(html).not.toContain('aria-disabled');
    expect(html).not.toContain('Remove');
  });

  it('says the turn in the caption, and turns the picture by a class at its own shape', () => {
    expect(html).toContain('Page 3, turned right</div>');
    expect(html).toContain('Page 2, turned half round</div>');
    expect(html).toContain('Page 1</div>');
    expect(html).toMatch(/src="blob:http:\/\/localhost\/3"/);
    expect(html).toMatch(/class="[^"]*turn1[^"]*" src="blob:http:\/\/localhost\/3"/);
    expect(html).toMatch(/class="[^"]*turn2[^"]*" src="blob:http:\/\/localhost\/2"/);
    expect(html).not.toMatch(/style="[^"]*rotate/);
  });
});

describe('PageGrid chunks redraw when an item changes', () => {
  const item: GridItem = { id: 'p1', title: 'Page 1', detail: '', thumbnail: 'blob:http://localhost/1' };

  it('sees two items with the same fields as the same', () => {
    expect(sameItem(item, { ...item })).toBe(true);
  });

  it('sees a new thumbnail, title or detail as a change', () => {
    expect(sameItem(item, { ...item, thumbnail: 'blob:http://localhost/2' })).toBe(false);
    expect(sameItem(item, { ...item, title: 'Page 2' })).toBe(false);
    expect(sameItem(item, { ...item, detail: 'Getting ready' })).toBe(false);
    expect(sameItem({ id: 'p1', title: 'Page 1', detail: '' }, item)).toBe(false);
  });

  it('compares every field, so a field added to GridItem later is never missed', () => {
    const later = { ...item, caption: 'turned right' } as GridItem;
    expect(sameItem(later, { ...later, caption: 'turned left' } as GridItem)).toBe(false);
    expect(sameItem(item, later)).toBe(false);
  });
});

describe('PageGrid with a toggle on each page', () => {
  const pages = Array.from({ length: 3 }, (_, index) => ({ id: `f1:${index + 1}`, title: `Page ${index + 1}`, detail: '' }));
  const toggle = {
    label: 'Cut after',
    name: (title: string) => `Cut after ${title.toLowerCase()}`,
    pressed: new Set(['f1:1']),
    skip: new Set(['f1:3']),
    drawsCut: true,
    onToggle: noop,
  };
  const html = renderToStaticMarkup(<PageGrid items={pages} onMove={noop} onRemove={noop} controls={false} layout="grid" toggle={toggle} />);

  it('gives each page but the skipped one a real button, named for its page, marked pressed or not', () => {
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Cut after page 1"[^>]*>Cut after<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="Cut after page 2"[^>]*>Cut after<\/button>/);
    expect(html).not.toContain('Cut after page 3');
  });

  it('draws a cut line only for a toggle kind that draws one', () => {
    const take = renderToStaticMarkup(<PageGrid items={pages} onMove={noop} onRemove={noop} controls={false} layout="grid" toggle={{ ...toggle, drawsCut: false }} />);
    expect(take).not.toMatch(/<li[^>]*class="[^"]*cut/);
    expect(take).toMatch(/aria-pressed="true"/);
  });

  it('marks the cell with a cut, and lets a page with no toggle take focus from code only', () => {
    expect(html.match(/<li[^>]*class="[^"]*cut/g)).toHaveLength(1);
    expect(html).toMatch(/<li[^>]*tabindex="-1"[^>]*data-id="f1:3"|<li[^>]*data-id="f1:3"[^>]*tabindex="-1"/);
    expect(html).not.toMatch(/<li[^>]*data-id="f1:1"[^>]*tabindex/);
  });
});

describe('PasswordField', () => {
  const html = renderToStaticMarkup(<PasswordField fileName="secret.pdf" onSubmit={noop} onLeaveOut={noop} />);

  it('has a labelled password field that names the file, and the note', () => {
    expect(html).toMatch(/<label for="([^"]+)">Password for secret.pdf<\/label><input id="\1" type="password"/);
    expect(html).toContain('The password stays in your browser. It is not sent anywhere.');
  });

  it('sits in no form and has no name, so it can never be sent to an address', () => {
    expect(html).not.toContain('<form');
    expect(html).not.toContain('name=');
  });

  it('ties a wrong-password message to the field', () => {
    const wrong = renderToStaticMarkup(<PasswordField fileName="secret.pdf" error="That password did not open the file." onSubmit={noop} onLeaveOut={noop} />);
    const describedBy = wrong.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(wrong).toContain('aria-invalid="true"');
    expect(wrong).toMatch(new RegExp(`<p id="${describedBy}"[^>]*><strong[^>]*>That password did not open the file. </strong>`));
  });
});

describe('Result', () => {
  const html = renderToStaticMarkup(
    <Result heading="Your merged file is ready" file={{ name: 'report-merged.pdf', detail: '11.6 MB, 120 pages', href: 'blob:abc' }} notes={['Bookmarks come from the first file only.']} onStartAgain={noop} />,
  );

  it('offers the file under its name, and starts nothing by itself', () => {
    expect(html).toContain('<a class="button ');
    expect(html).toContain('href="blob:abc" download="report-merged.pdf">Download</a>');
    expect(html).toContain('11.6 MB, 120 pages');
  });

  it('has a heading focus can move to, the notes and Start again', () => {
    expect(html).toContain('<h2 tabindex="-1"');
    expect(html).toContain('Bookmarks come from the first file only.');
    expect(html).toContain('>Start again</button>');
  });

  it('shows "was" and the old size when given them', () => {
    const was = renderToStaticMarkup(
      <Result heading="Your compressed file is ready" file={{ name: 'report-compressed.pdf', detail: '4.2 MB, was 11.8 MB, 64 pages', href: 'blob:abc' }} notes={[]} onStartAgain={noop} />,
    );
    expect(was).toContain('4.2 MB, was 11.8 MB, 64 pages');
  });

  it('with no new file: the sentence and its advice tied to the heading, Start again, and no Download', () => {
    const none = renderToStaticMarkup(
      <Result
        heading="This file could not be made smaller."
        advice="It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more."
        notes={['Pictures that were made smaller can look slightly less sharp up close.']}
        onStartAgain={noop}
      />,
    );
    const describedBy = none.match(/<h2 [^>]*aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(none).toContain('tabindex="-1"');
    expect(none).toMatch(new RegExp(`<p id="${describedBy}"[^>]*>It may already be compressed`));
    expect(none).not.toContain('Download');
    expect(none).not.toContain('<a ');
    // The notes are about a new file, so none is shown.
    expect(none).not.toContain('less sharp');
    expect(none).toContain('>Start again</button>');
  });
});

describe('ProgressBar and Notice', () => {
  it('reports progress in whole percent, kept between 0 and 100', () => {
    expect(renderToStaticMarkup(<ProgressBar fraction={0.4} label="Merging" />)).toContain('aria-valuenow="40"');
    expect(renderToStaticMarkup(<ProgressBar fraction={3} label="Merging" />)).toContain('aria-valuenow="100"');
    expect(renderToStaticMarkup(<ProgressBar fraction={-1} label="Merging" />)).toContain('aria-valuenow="0"');
  });

  it('gives a notice a heading focus can move to, and announces nothing by itself', () => {
    const html = renderToStaticMarkup(<Notice heading="appendix.pdf is damaged and cannot be read." />);
    expect(html).toContain('<h2 tabindex="-1"');
    expect(html).not.toMatch(/role="(alert|status)"/);
  });
});

describe('ChoiceGroup, a choice of a test entry', () => {
  const option = {
    kind: 'choice' as const,
    key: 'position',
    legend: 'Where the numbers go',
    choices: [
      { value: 'bottom-centre', label: 'Bottom, in the middle' },
      { value: 'bottom-right', label: 'Bottom right' },
      { value: 'top-right', label: 'Top right' },
    ],
    initial: 'bottom-centre',
  };
  const html = renderToStaticMarkup(<ChoiceGroup option={option} value="bottom-right" name="r1-position" onChoose={noop} />);

  it('is a fieldset named by its legend, with no ARIA role added', () => {
    expect(html).toMatch(/^<fieldset class="[^"]*choiceGroup[^"]*"><legend class="[^"]*legend[^"]*">Where the numbers go<\/legend>/);
    expect(html).not.toContain('role=');
    expect(html).not.toContain('aria-');
  });

  it('gives each value one native radio button in its own label, sharing one name, in order', () => {
    expect(html.match(/<label class="[^"]*choice[^"]*"><input type="radio" name="r1-position"( checked="")? value="[a-z-]+"\/><span>[^<]+<\/span><\/label>/g)).toHaveLength(3);
    expect(html.indexOf('Bottom, in the middle')).toBeLessThan(html.indexOf('Bottom right'));
    expect(html.indexOf('Bottom right')).toBeLessThan(html.indexOf('Top right'));
  });

  it('shows the chosen value checked, and only that one', () => {
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(/checked="" value="bottom-right"/);
  });

  it('says the value chosen when a radio button changes, and puts the focus ref on the chosen one only', () => {
    const chosen: string[] = [];
    const ref = { current: null };
    const group = ChoiceGroup({ option, value: 'bottom-centre', name: 'r1-position', onChoose: (value) => chosen.push(value), chosenRef: ref });
    const labels = (group.props as { children: ReactElement[] }).children[1] as unknown as ReactElement<{ children: ReactElement[] }>[];
    const inputs = labels.map((label) => label.props.children[0] as ReactElement<{ onChange(): void; value: string }>);
    inputs[2]!.props.onChange();
    inputs[0]!.props.onChange();
    expect(chosen).toEqual(['top-right', 'bottom-centre']);
    expect(inputs.map((input) => (input as unknown as { props: { ref?: unknown } }).props.ref)).toEqual([ref, undefined, undefined]);
  });
});

describe("ChoiceGroup with Add page numbers' entry", async () => {
  const { tools } = await import('../../src/tools/registry');
  const { chosenValue } = await import('../../src/widget/options');
  const option = tools.find((tool) => tool.id === 'add-page-numbers')!.widget!.options![0]!;
  // An option is now a choice or a text; Add page numbers' first option is a choice.
  if (option.kind !== 'choice') throw new Error('Add page numbers lists a choice first');
  // As the workspace draws it before anything is chosen: the option's starting value.
  const html = renderToStaticMarkup(<ChoiceGroup option={option} value={chosenValue(option, {})} name="r2-position" onChoose={noop} />);

  it('is named "Where the numbers go", with its six places in order, and "Bottom centre" chosen', () => {
    expect(html).toContain('<legend class="');
    expect(html).toContain('>Where the numbers go</legend>');
    const labels = [...html.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    expect(labels).toEqual(['Bottom left', 'Bottom centre', 'Bottom right', 'Top left', 'Top centre', 'Top right']);
    expect(html.match(/type="radio" name="r2-position"/g)).toHaveLength(6);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toMatch(/checked="" value="bottom-centre"/);
  });
});

describe('TextField, a text of a test entry', () => {
  const option = {
    kind: 'text' as const,
    key: 'text',
    label: 'Watermark text',
    hint: 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.',
    emptySentence: 'Type the watermark text first.',
  };
  const html = renderToStaticMarkup(<TextField option={option} id="r3-text" raw="Draft" onType={noop} onEnter={noop} />);
  const sentence = 'Ł and ź cannot be used.';
  const wrong = renderToStaticMarkup(<TextField option={option} id="r3-text" raw="Łódź" error={sentence} onType={noop} onEnter={noop} />);
  const input = (markup: string) => markup.match(/<input [^>]*\/>/)?.[0] ?? '';

  it("uses the site's field style, with a visible label tied to the field", () => {
    expect(html).toMatch(/^<div class="field field-short [^"]+"><label for="r3-text">Watermark text<\/label><input /);
    expect(input(html)).toContain('id="r3-text"');
  });

  it('is one line of text with no name, no form, no length cap, no form memory and no spell checking, and labels Enter "Go"', () => {
    const field = input(html);
    expect(field).toContain('type="text"');
    // HTML attribute names are read without regard to case; React writes these in camel case.
    expect(field).toMatch(/\sautocomplete="off"/i);
    expect(field).toMatch(/\sspellcheck="false"/i);
    expect(field).toMatch(/\senterkeyhint="go"/i);
    expect(field).toContain('value="Draft"');
    expect(field).not.toMatch(/\sname=/);
    expect(field).not.toMatch(/maxlength/i);
    expect(html).not.toContain('<form');
  });

  it('with nothing wrong: no sentence, not invalid, and the hint read with the field', () => {
    expect(input(html)).not.toContain('aria-invalid');
    expect(input(html)).toContain('aria-describedby="r3-text-hint"');
    expect(html).not.toContain(errorId('r3-text'));
    expect(html).toMatch(/<\/label><input [^>]*\/><p id="r3-text-hint" class="[^"]+">Up to 50 characters/);
  });

  it('with something wrong: the sentence between the label and the field, invalid, and read before the hint', () => {
    expect(errorId('r3-text')).toBe('r3-text-error');
    expect(wrong).toMatch(/<\/label><p id="r3-text-error" class="[^"]+">Ł and ź cannot be used\.<\/p><input /);
    expect(input(wrong)).toContain('aria-invalid="true"');
    expect(input(wrong)).toContain('aria-describedby="r3-text-error r3-text-hint"');
    expect(wrong.indexOf('r3-text-error')).toBeLessThan(wrong.indexOf('<input'));
    expect(wrong.indexOf('id="r3-text-hint"')).toBeGreaterThan(wrong.indexOf('<input'));
  });

  it('passes on what is typed, does what the main button does on Enter only, and puts the focus ref on the field', () => {
    const typed: string[] = [];
    let entered = 0;
    const ref = { current: null };
    const field = TextField({ option, id: 'r3-text', raw: '', onType: (value) => typed.push(value), onEnter: () => (entered += 1), focusRef: ref });
    const children = (field.props as { children: (ReactElement | null)[] }).children;
    const inputs = children.filter((child): child is ReactElement => child !== null && child.type === 'input');
    expect(inputs).toHaveLength(1);
    const props = inputs[0]?.props as {
      onChange(event: { currentTarget: { value: string } }): void;
      onKeyDown(event: { key: string; keyCode?: number; nativeEvent: { isComposing: boolean }; preventDefault(): void }): void;
    };
    expect((inputs[0] as unknown as { props: { ref?: unknown } }).props.ref).toBe(ref);
    props.onChange({ currentTarget: { value: ' Draft copy ' } });
    expect(typed).toEqual([' Draft copy ']);
    let prevented = 0;
    const prevent = () => (prevented += 1);
    props.onKeyDown({ key: 'a', nativeEvent: { isComposing: false }, preventDefault: prevent });
    expect([entered, prevented]).toEqual([0, 0]);
    // The Enter that confirms an input method's or a phone keyboard's word does nothing here.
    props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault: prevent });
    props.onKeyDown({ key: 'Enter', keyCode: 229, nativeEvent: { isComposing: false }, preventDefault: prevent });
    expect([entered, prevented]).toEqual([0, 0]);
    props.onKeyDown({ key: 'Enter', keyCode: 13, nativeEvent: { isComposing: false }, preventDefault: prevent });
    expect([entered, prevented]).toEqual([1, 1]);
  });
});

describe("TextField with Watermark's entry", async () => {
  const { tools } = await import('../../src/tools/registry');
  const { optionsHold, optionsToSend } = await import('../../src/widget/options');
  const widget = tools.find((tool) => tool.id === 'watermark-pdf')!.widget!;
  const option = widget.options![0]!;
  if (option.kind !== 'text') throw new Error('Watermark lists a text first');
  // As the workspace draws it once the file is read: empty.
  const html = renderToStaticMarkup(<TextField option={option} id="r4-text" raw="" onType={noop} onEnter={noop} />);
  const field = html.match(/<input [^>]*\/>/)?.[0] ?? '';

  it('is the only option: "Watermark text", empty, with its hint read with it', () => {
    expect(widget.options).toHaveLength(1);
    expect(option.key).toBe('text');
    expect(html).toContain('<label for="r4-text">Watermark text</label>');
    expect(field).toContain('value=""');
    expect(field).not.toContain('aria-invalid');
    expect(field).toContain('aria-describedby="r4-text-hint"');
    expect(html).toContain('>Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.</p>');
  });

  it('holds the main button back while empty or only spaces, with "Type the watermark text first.", and sends nothing then', () => {
    for (const raw of [undefined, '', '   ']) {
      const choices: Record<string, string> = raw === undefined ? {} : { text: raw };
      expect(optionsHold('watermark-pdf', widget.options, choices)).toEqual({ key: 'text', kind: 'empty', sentence: 'Type the watermark text first.' });
    }
    expect(optionsHold('watermark-pdf', widget.options, { text: 'Draft for review' })).toBeNull();
    expect(optionsToSend(widget.options, { text: 'Draft for review' })).toEqual({ text: 'Draft for review' });
  });

  it('refuses "मसौदा", "Łódź" and 63 characters with their sentences, and takes "Brouillon – à relire"', () => {
    expect(optionsHold('watermark-pdf', widget.options, { text: 'मसौदा' })).toEqual({ key: 'text', kind: 'characters', sentence: 'Some characters cannot be used.' });
    expect(optionsHold('watermark-pdf', widget.options, { text: 'Łódź' })).toEqual({ key: 'text', kind: 'characters', sentence: 'Ł and ź cannot be used.' });
    expect(optionsHold('watermark-pdf', widget.options, { text: 'x'.repeat(63) })).toEqual({ key: 'text', kind: 'too-long', sentence: 'This text has 63 characters. Use 50 or fewer.' });
    expect(optionsHold('watermark-pdf', widget.options, { text: 'Brouillon – à relire' })).toBeNull();
  });
});

describe('Enter in a typed field (TextField and PasswordField)', async () => {
  const { pressesButton } = await import('../../src/widget/keys');

  it('presses the button on Enter, but not on the Enter that confirms a composed word, or another key', () => {
    expect(pressesButton({ key: 'Enter', keyCode: 13, nativeEvent: { isComposing: false } })).toBe(true);
    expect(pressesButton({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false);
    expect(pressesButton({ key: 'Enter', keyCode: 229, nativeEvent: { isComposing: false } })).toBe(false);
    expect(pressesButton({ key: 'Process', keyCode: 229 })).toBe(false);
    expect(pressesButton({ key: 'a', keyCode: 65, nativeEvent: { isComposing: false } })).toBe(false);
  });
});
