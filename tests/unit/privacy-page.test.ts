// Guards on the words of the Privacy page draft (src/pages/privacy.astro). Each sentence is checked
// against the code before each release, by the table in design.md of add-privacy-draft; these tests
// watch the sentences a test can watch, so the page cannot quietly drift from the code. The page is
// read as text without its frontmatter and comments, so a comment can neither satisfy nor break a guard.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tools as registryTools, type Tool, type ToolOption } from '../../src/tools/registry';
import { bannedWords } from '../e2e/pages';
import { serverTools } from './server-tools';

type Section = { title: string; text: string; paragraphs: string[] };

/** Plain text: tags removed, spaces collapsed. */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .trim();
}

/** The page's markup without its frontmatter (between the first two `---` lines) and without comments. */
function body(source: string): string {
  const lines = source.split('\n');
  const open = lines.indexOf('---');
  const close = lines.indexOf('---', open + 1);
  if (open !== 0 || close < 0) throw new Error('The Privacy page has no frontmatter between two --- lines.');
  return lines
    .slice(close + 1)
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function sections(markup: string): Section[] {
  return markup
    .split('<h2>')
    .slice(1)
    .map((chunk) => {
      const [title = '', rest = ''] = chunk.split('</h2>');
      const paragraphs = [...rest.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => plain(match[1] ?? ''));
      return { title: plain(title), text: plain(rest), paragraphs };
    });
}

const markup = body(readFileSync(new URL('../../src/pages/privacy.astro', import.meta.url), 'utf8'));
const pageText = plain(markup);
const pageSections = sections(markup);

function section(title: string): Section {
  const found = pageSections.find((each) => each.title === title);
  if (!found) throw new Error(`The Privacy page has no section "${title}".`);
  return found;
}

/** The sentences that say every tool works in the browser, and the phrase that says nothing is uploaded. */
const browserOnlySentences = ['Every tool on this site does its work inside your browser, on your device.', 'No tool on this site runs on a server today.'];
const browserOnlyClaims = [...browserOnlySentences, 'not uploaded'];

/**
 * While the page says every tool runs in the browser, every published tool must; and while every published
 * tool does, the page must keep at least one of the two sentences, so this guard cannot switch off by rewording.
 */
function serverProblem(text: string, tools: readonly Pick<Tool, 'id' | 'runsIn'>[]): string | null {
  const server = serverTools(tools);
  const claims = browserOnlyClaims.filter((claim) => text.includes(claim));
  if (server.length > 0 && claims.length > 0) {
    return (
      `The Privacy page says every tool runs in the browser, but ${server.join(', ')} do not. ` +
      'Stop this change: update the Privacy page to say what happens to files sent to the server, and ask the owner to review it.'
    );
  }
  if (server.length === 0 && !browserOnlySentences.some((sentence) => text.includes(sentence))) {
    return `Every published tool runs in the browser, but the Privacy page no longer holds either of: ${browserOnlySentences.map((each) => `"${each}"`).join(', ')}. Keep one, so the server guard still watches the page.`;
  }
  return null;
}

/**
 * The tools a section must name: those with an option of one of `kinds`, plus `alsoIds`. A tool is named when the
 * section holds one of its page names. Gives the tools to add to the section and those to take out of it.
 */
function namesProblem(text: string, tools: readonly Pick<Tool, 'id' | 'pages' | 'widget'>[], kinds: ToolOption['kind'][], alsoIds: string[] = []): string | null {
  const nameOf = (tool: Pick<Tool, 'pages'>) => tool.pages[0]?.name ?? '';
  const wanted = tools.filter((tool) => alsoIds.includes(tool.id) || (tool.widget?.options ?? []).some((option) => kinds.includes(option.kind)));
  const named = tools.filter((tool) => tool.pages.some((page) => text.includes(page.name)));
  const missing = wanted.filter((tool) => !named.includes(tool)).map(nameOf);
  const extra = named.filter((tool) => !wanted.includes(tool)).map(nameOf);
  if (missing.length === 0 && extra.length === 0) return null;
  return (
    'Update the Privacy page: ' +
    [missing.length > 0 ? `name ${missing.join(', ')}` : '', extra.length > 0 ? `stop naming ${extra.join(', ')}` : ''].filter(Boolean).join('; ') +
    ', and say what the page does with what they are given.'
  );
}

describe('the Privacy page', () => {
  it('has the sections the privacy spec asks for, in order', () => {
    expect(pageSections.map((each) => each.title)).toEqual([
      'In short',
      'What happens to your file',
      'How long the page holds your file',
      'Passwords',
      'Text, drawings and pictures',
      'Scripts and the home page',
      'What your browser may do',
      'What the page may load and send',
      'Who serves the site',
    ]);
  });

  describe('server guard', () => {
    it('holds: every published tool runs in the browser, and the page says so', () => {
      // Thrown with its own words, so the failure says what to do.
      const problem = serverProblem(pageText, registryTools);
      if (problem) throw new Error(problem);
    });

    it('trips as soon as a published tool runs on the server, and says to ask the owner', () => {
      const problem = serverProblem(pageText, [...registryTools, { id: 'word-to-pdf', runsIn: 'server' }]);
      expect(problem).toContain('word-to-pdf');
      expect(problem).toContain('update the Privacy page');
      expect(problem).toContain('ask the owner');
    });

    it('trips on "not uploaded" alone', () => {
      expect(serverProblem('Your files are not uploaded.', [{ id: 'word-to-pdf', runsIn: 'server' }])).toContain('word-to-pdf');
    });

    it('trips when both browser-only sentences are gone, so it cannot switch off silently', () => {
      let text = pageText;
      for (const sentence of browserOnlySentences) text = text.replace(sentence, '');
      expect(serverProblem(text, registryTools)).toContain('no longer holds either');
    });

    it('does not trip for a page that makes no claim about where files go, beside a server tool', () => {
      expect(serverProblem('Some tools upload files.', [{ id: 'word-to-pdf', runsIn: 'server' }])).toBeNull();
    });
  });

  describe('words guard', () => {
    it('makes no absolute claim', () => {
      const absolute = /100\s*%|\bnever\b|\bsecure(ly)?\b|\bguarantee|\bsafe(ly)?\b|\bprivate\b|\bcompletely\b|\btotally\b|\babsolutely\b|\balways\b|military|bank-grade|\banonymous/i;
      expect(pageText.match(absolute)?.[0] ?? null).toBeNull();
    });

    it('holds no banned word, no exclamation mark and no address', () => {
      const lower = pageText.toLowerCase();
      for (const word of bannedWords) expect(lower, `banned word "${word}"`).not.toContain(word);
      expect(pageText).not.toContain('!');
      expect(pageText).not.toContain('@');
    });
  });

  describe('Crop PDF guard', () => {
    it('says that what Crop PDF cuts off stays in the file, as the tool page and its result say', () => {
      const sentence = 'Crop PDF does not remove what it cuts off. It stays in the new file, where anyone who has the file can get it back, and some programs can still find, copy or read aloud the text in it.';
      expect(section('What happens to your file').text).toContain(sentence);
      const toolText = readFileSync(new URL('../../src/content/tools/crop-pdf.md', import.meta.url), 'utf8');
      for (const words of ['still in the file', 'Anyone who has the file can get it back', 'some programs can still find, copy or read aloud the text in it', 'not a way to hide something private'])
        expect(toolText).toContain(words);
    });
  });

  describe('policy guard', () => {
    const policy = section('What the page may load and send');

    it('says the policy has not yet been checked in Safari', () => {
      // This sentence may go only once the issue #7 hand check (the policy reaches PDF.js's worker in Safari) is
      // done, in a change that also edits this guard.
      expect(policy.text).toContain('It has not yet been checked in Safari.');
    });

    it('names no worker in its unconditional claim, and names workers only where the tests check them', () => {
      expect(policy.paragraphs[0]).toBeDefined();
      expect(policy.paragraphs[0]).not.toMatch(/worker/i);
      for (const paragraph of policy.paragraphs) {
        if (/worker/i.test(paragraph)) expect(paragraph).toMatch(/^In Chrome and Firefox/);
      }
    });

    it('says what the policy does not stop', () => {
      const stop = policy.paragraphs.find((paragraph) => paragraph.startsWith('The rule does not stop'));
      expect(stop).toBeDefined();
      for (const named of ['following a link', 'opening another page', 'WebRTC', 'DNS prefetch', 'this site’s own address']) expect(stop).toContain(named);
    });
  });

  describe('names guard', () => {
    it('names exactly the tools that take text, drawings or pictures', () => {
      const problem = namesProblem(section('Text, drawings and pictures').text, registryTools, ['text', 'drawing', 'picture']);
      if (problem) throw new Error(problem);
    });

    it('names exactly the tools that take a new password, and Remove a password', () => {
      // Remove a password (id unlock-pdf) is the one tool whose job is the input file's own password, which every
      // tool asks for when a PDF needs one; it has no option for it, so it is listed by id.
      const problem = namesProblem(section('Passwords').text, registryTools, ['new-password'], ['unlock-pdf']);
      if (problem) throw new Error(problem);
    });

    it('trips when a tool gains a text option, and names it', () => {
      const merge = registryTools.find((tool) => tool.id === 'merge-pdf')!;
      const withText = { ...merge, widget: { ...merge.widget!, options: [{ kind: 'text' as const, key: 'text', label: 'Text', hint: 'Hint.', emptySentence: 'Type.' }] } };
      const tools = registryTools.map((tool) => (tool.id === 'merge-pdf' ? withText : tool));
      expect(namesProblem(section('Text, drawings and pictures').text, tools, ['text', 'drawing', 'picture'])).toContain('name Merge PDF');
    });

    it('trips when a named tool is renamed', () => {
      const tools = registryTools.map((tool) => (tool.id === 'watermark-pdf' ? { ...tool, pages: tool.pages.map((page) => ({ ...page, name: 'Add a watermark' })) } : tool));
      expect(namesProblem(section('Text, drawings and pictures').text, tools, ['text', 'drawing', 'picture'])).toContain('name Add a watermark');
    });
  });
});
