import { describe, expect, it } from 'vitest';
import { matchesPhrase, matchStatus } from '../../src/tools/filter';

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
    expect(matchStatus('zzz', 0)).toBe('No tools match.');
  });
});
