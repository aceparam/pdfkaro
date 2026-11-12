import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilePicker } from '../../src/components/FilePicker/FilePicker';
import { Notice } from '../../src/components/Notice/Notice';
import { PageGrid } from '../../src/components/PageGrid/PageGrid';
import { PasswordField } from '../../src/components/PasswordField/PasswordField';
import { ProgressBar } from '../../src/components/ProgressBar/ProgressBar';
import { Result } from '../../src/components/Result/Result';

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
    expect(html.match(/<div class="[^"]*slot[^"]*" aria-hidden="true"><div class="[^"]*blank[^"]*"><\/div><\/div>/g)).toHaveLength(2);
    expect(html).not.toContain('<img');
  });

  it('shows a drawn thumbnail as a picture nobody can focus, hear or drag on its own', () => {
    const drawn = renderToStaticMarkup(
      <PageGrid items={[{ ...items[0]!, thumbnail: 'blob:http://localhost/1' }, items[1]!]} onMove={noop} onRemove={noop} />,
    );
    expect(drawn).toMatch(/<div class="[^"]*slot[^"]*" aria-hidden="true"><img class="[^"]*thumb[^"]*" src="blob:http:\/\/localhost\/1" alt="" draggable="false"\/><\/div>/);
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
    <Result heading="Your merged file is ready" name="report-merged.pdf" detail="11.6 MB, 120 pages" href="blob:abc" notes={['Bookmarks come from the first file only.']} onStartAgain={noop} />,
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
