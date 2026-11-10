import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolList } from '../../src/components/ToolList/ToolList';

// The component is rendered to HTML in Node, with no browser, to check that
// what the filter rule decides is what the page shows.

const items = [
  { name: 'Merge PDF', href: '/merge-pdf', summary: 'Combine several PDFs into one.' },
  { name: 'Split PDF', href: '/split-pdf', summary: 'Cut one PDF into several files.', hidden: true },
  { name: 'Rotate PDF', href: '/rotate-pdf', summary: 'Turn pages that are sideways.', hidden: false },
];

/** The opening tag of the list item that holds the link to `href`. */
function itemTag(html: string, href: string): string {
  const match = html.match(new RegExp(`<li[^>]*>(?=<a href="${href}")`));
  if (!match) throw new Error(`No list item links to ${href}`);
  return match[0];
}

describe('ToolList', () => {
  const html = renderToStaticMarkup(<ToolList items={items} />);

  it('renders every item as a link with its summary', () => {
    for (const item of items) {
      expect(html).toContain(`<a href="${item.href}">${item.name}</a>`);
      expect(html).toContain(item.summary);
    }
    expect(html.match(/<li/g)).toHaveLength(3);
  });

  it('marks only the hidden item as hidden', () => {
    expect(itemTag(html, '/split-pdf')).toContain('hidden');
    expect(itemTag(html, '/merge-pdf')).not.toContain('hidden');
    expect(itemTag(html, '/rotate-pdf')).not.toContain('hidden');
  });

  it('renders an empty list when there are no items', () => {
    expect(renderToStaticMarkup(<ToolList items={[]} />)).not.toContain('<li');
  });
});
