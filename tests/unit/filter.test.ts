import { describe, expect, it } from 'vitest';
import { filterGroups, matchesPhrase, matchStatus } from '../../src/tools/filter';

const merge = { name: 'Merge PDF', summary: 'Combine several PDFs into one.' };

describe('matchesPhrase', () => {
  it('matches everything when nothing is typed', () => {
    expect(matchesPhrase(merge, '')).toBe(true);
    expect(matchesPhrase(merge, '   ')).toBe(true);
  });

  it('matches the name, whatever the case', () => {
    expect(matchesPhrase(merge, 'merge')).toBe(true);
    expect(matchesPhrase(merge, 'MERGE pdf')).toBe(true);
  });

  it('matches the summary', () => {
    expect(matchesPhrase(merge, 'combine')).toBe(true);
  });

  it('ignores spaces at the ends', () => {
    expect(matchesPhrase(merge, '  merge  ')).toBe(true);
  });

  it('ignores spaces inside the phrase and the words, so "200kb" finds "200 KB"', () => {
    const target = { name: 'Compress PDF to 200 KB', summary: 'Make a PDF 200 KB or smaller.' };
    expect(matchesPhrase(target, '200kb')).toBe(true);
    expect(matchesPhrase(target, '200KB')).toBe(true);
    expect(matchesPhrase(target, 'compress pdf to 200kb')).toBe(true);
    expect(matchesPhrase(target, 'compresspdf')).toBe(true);
    expect(matchesPhrase(target, '2 0 0 k b')).toBe(true);
    expect(matchesPhrase(target, '100kb')).toBe(false);
    expect(matchesPhrase(target, '200mb')).toBe(false);
  });

  it('loses no earlier match: every phrase found as typed is still found', () => {
    for (const phrase of ['merge', 'MERGE pdf', 'combine', 'several pdfs', '  merge  ', 'pdfs into one']) expect(matchesPhrase(merge, phrase)).toBe(true);
    expect(matchesPhrase({ name: 'A (b)', summary: '' }, '(b)')).toBe(true);
    expect(matchesPhrase({ name: 'A (b)', summary: '' }, 'a (b)')).toBe(true);
  });

  it('does not match other words', () => {
    expect(matchesPhrase(merge, 'rotate')).toBe(false);
  });

  it('treats the phrase as plain text, not as a pattern', () => {
    expect(matchesPhrase(merge, '.*')).toBe(false);
    expect(matchesPhrase(merge, '(')).toBe(false);
    expect(matchesPhrase({ name: 'A (b)', summary: '' }, '(b)')).toBe(true);
  });
});

describe('matchStatus', () => {
  it('says nothing when nothing is typed', () => {
    expect(matchStatus('', 16)).toBe('');
    expect(matchStatus('  ', 16)).toBe('');
  });

  it('counts many, one and none', () => {
    expect(matchStatus('pdf', 3)).toBe('3 tools match.');
    expect(matchStatus('merge', 1)).toBe('1 tool matches.');
    expect(matchStatus('zzz', 0)).toBe('No tools match. Try a shorter word.');
  });
});

describe('filterGroups', () => {
  const groups = [
    {
      id: 'organise',
      name: 'Organise pages',
      items: [
        { name: 'Merge PDF', summary: 'Combine several PDFs into one.', href: '/merge-pdf' },
        { name: 'Split PDF', summary: 'Cut one PDF into several files.', href: '/split-pdf' },
        { name: 'Rotate PDF', summary: 'Turn pages that are sideways.', href: '/rotate-pdf' },
      ],
    },
    {
      id: 'to-pdf',
      name: 'Convert to PDF',
      items: [{ name: 'JPG to PDF', summary: 'Turn photos into one PDF.', href: '/jpg-to-pdf' }],
    },
  ];
  const hiddenNames = (result: { groups: { items: { name: string; hidden: boolean }[] }[] }) =>
    result.groups.flatMap((group) => group.items.filter((item) => item.hidden).map((item) => item.name));

  it('hides nothing and counts every tool when nothing is typed', () => {
    const result = filterGroups(groups, '');
    expect(result.count).toBe(4);
    expect(hiddenNames(result)).toEqual([]);
    expect(result.groups.map((group) => group.shown)).toEqual([3, 1]);
  });

  it('hides each item that does not match and keeps the ones that do', () => {
    const result = filterGroups(groups, 'several');
    expect(result.count).toBe(2);
    expect(hiddenNames(result)).toEqual(['Rotate PDF', 'JPG to PDF']);
    expect(result.groups.map((group) => group.shown)).toEqual([2, 0]);
  });

  it('counts tools, not groups', () => {
    const result = filterGroups(groups, 'pdf');
    expect(result.count).toBe(4);
    expect(result.groups).toHaveLength(2);
  });

  it('keeps every item and the rest of each group, so the list keeps its shape', () => {
    const result = filterGroups(groups, 'jpg');
    expect(result.count).toBe(1);
    expect(result.groups.map((group) => group.items.length)).toEqual([3, 1]);
    expect(result.groups[1]).toMatchObject({ id: 'to-pdf', name: 'Convert to PDF', shown: 1 });
    expect(result.groups[1]?.items[0]).toMatchObject({ href: '/jpg-to-pdf', hidden: false });
  });

  it('shows no group when nothing matches', () => {
    const result = filterGroups(groups, 'zzz');
    expect(result.count).toBe(0);
    expect(result.groups.map((group) => group.shown)).toEqual([0, 0]);
  });
});
