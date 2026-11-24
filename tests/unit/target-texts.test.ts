// The text below each of Compress to a target size's five pages. SPEC.md forbids pages "that are the same text with
// one word swapped", so once every size and number is one token, no run of eight words may appear in two of them,
// steps and questions included. Each is 250 to 500 words, a draft, explains how its target's bytes are counted, and
// holds nothing from the banned patterns.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tools } from '../../src/tools/registry';
import { sizeTargets, type SizeTargetKey } from '../../src/widget/option-values';

const tool = tools.find((each) => each.id === 'compress-to-target')!;
const texts = tool.pages.map((page) => {
  const raw = readFileSync(join(__dirname, '../../src/content/tools', `${page.slug}.md`), 'utf8');
  const [, front = '', body = ''] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw) ?? [];
  return { slug: page.slug, target: sizeTargets[page.preset!.target as SizeTargetKey], front, body };
});

/** The words of a text, with every number (and a unit after it) as one token, lower case, without Markdown marks or punctuation. */
function words(body: string): string[] {
  return body
    .replace(/\d[\d,.]*\s*(?:KB|MB|GB|bytes|%)?/g, ' NUMBER ')
    .replace(/[“”"'’‘#*`.,:;?()!]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Every run of `length` words, joined. */
const runs = (list: readonly string[], length = 8) => new Set(list.slice(0, Math.max(0, list.length - length + 1)).map((_, index) => list.slice(index, index + length).join(' ')));

const banned = ['seamless', 'effortless', 'powerful', 'blazing', 'supercharge', 'unlock', 'elevate', 'revolutionise', 'revolutionize', 'all-in-one'];

describe('the text below each target page', () => {
  it('has one Markdown file per page, each marked as a draft', () => {
    expect(texts).toHaveLength(5);
    for (const text of texts) expect(text.front, text.slug).toMatch(/^status: Draft\./);
  });

  it('is 250 to 500 words each', () => {
    for (const text of texts) {
      const count = text.body.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
      expect(count, text.slug).toBeGreaterThanOrEqual(250);
      expect(count, text.slug).toBeLessThanOrEqual(500);
    }
  });

  it('shares no run of eight words between two pages once sizes are one token, steps and questions included', () => {
    const shared: string[] = [];
    for (let a = 0; a < texts.length; a++) {
      const mine = runs(words(texts[a]!.body));
      for (let b = a + 1; b < texts.length; b++) {
        for (const run of runs(words(texts[b]!.body))) if (mine.has(run)) shared.push(`${texts[a]!.slug} and ${texts[b]!.slug}: "${run}"`);
      }
    }
    expect(shared).toEqual([]);
  });

  it('the check finds a run shared by two texts', () => {
    const one = words('Press the button to compress the file to 100 KB and then download it.');
    const two = words('First press the button to compress the file to 2 MB and then wait.');
    const common = [...runs(one)].filter((run) => runs(two).has(run));
    expect(common.length).toBeGreaterThan(0);
  });

  it('names its own size, and says how its bytes are counted', () => {
    for (const text of texts) {
      expect(text.body, text.slug).toContain(text.target.label);
      // The target's bytes, written with the thousands separator, as each text explains them.
      expect(text.body, text.slug).toContain(text.target.bytes.toLocaleString('en-GB'));
      for (const other of texts.filter((each) => each !== text)) expect(text.body.includes(`to ${other.target.label}`), `${text.slug} names ${other.target.label}`).toBe(false);
    }
  });

  it('holds no banned word, no "100%", no capitals for emphasis and no exclamation mark', () => {
    for (const text of texts) {
      const lower = text.body.toLowerCase();
      for (const word of banned) expect(lower.includes(word), `${text.slug}: ${word}`).toBe(false);
      expect(text.body).not.toContain('100%');
      expect(text.body).not.toContain('!');
      // Words of three or more capitals are kinds of picture or units only.
      const capitals = [...text.body.matchAll(/\b[A-Z]{3,}\b/g)].map((match) => match[0]);
      for (const word of capitals) expect(['PDF', 'JPG', 'JPEG', 'CMYK', 'CV'].includes(word), `${text.slug}: ${word}`).toBe(true);
    }
  });

  it('says the file is not uploaded, a password is kept, and a signature stops being valid', () => {
    for (const text of texts) {
      const lower = text.body.toLowerCase();
      expect(lower, text.slug).toMatch(/not uploaded|never sent|not sent anywhere|leaves it|is not uploaded|leave my|no\. (all|the|your|it|however)/);
      expect(lower, text.slug).toMatch(/password/);
      expect(lower, text.slug).toMatch(/signature/);
    }
  });
});
