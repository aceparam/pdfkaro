// Checks the Content Security Policy tag on every built page. Run after a
// build: `npm run check:csp [directory]`, with `dist` as the default.
// `check:base` runs it on its sub-path build too.
//
// For each page it checks that there is exactly one policy tag, straight after
// the character set tag and before any script, stylesheet or style; that the
// policy is exactly the site's (no 'unsafe-inline', 'unsafe-eval',
// 'strict-dynamic', data:, * or other origin); that every runnable inline
// script and every style block has its hash listed, and no other hash is; that
// no element has a style attribute, an on... handler or a javascript: address;
// and that no script or stylesheet comes from another site.
//
// It finds blocks and hashes them with its own code, not scripts/csp.mjs, so a
// mistake in one is caught by the other.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// A <script> whose type a browser may run, or that script-src governs inline anyway.
function scriptTypeIsRunnable(type) {
  if (type === undefined) return true;
  const value = type.trim().toLowerCase();
  if (value === '' || value === 'module' || value === 'importmap' || value === 'speculationrules') return true;
  return /^(text|application)\/(x-)?(javascript|ecmascript|jscript|livescript)/.test(value);
}

// Reads a start tag's attributes one character at a time.
function readAttributes(tag) {
  const attributes = [];
  // Skip the tag name.
  let i = tag.search(/[\s/>]/);
  if (i === -1) return attributes;
  while (i < tag.length) {
    while (i < tag.length && /[\s/]/.test(tag[i])) i += 1;
    if (i >= tag.length || tag[i] === '>') break;
    let name = '';
    while (i < tag.length && !/[\s=>/]/.test(tag[i])) name += tag[i++];
    while (i < tag.length && /\s/.test(tag[i])) i += 1;
    let value = '';
    if (tag[i] === '=') {
      i += 1;
      while (i < tag.length && /\s/.test(tag[i])) i += 1;
      const quote = tag[i];
      if (quote === '"' || quote === "'") {
        const end = tag.indexOf(quote, i + 1);
        value = tag.slice(i + 1, end === -1 ? tag.length : end);
        i = end === -1 ? tag.length : end + 1;
      } else {
        while (i < tag.length && !/[\s>]/.test(tag[i])) value += tag[i++];
      }
    }
    if (name) attributes.push({ name: name.toLowerCase(), value });
  }
  return attributes;
}

const attribute = (attributes, name) => attributes.find((each) => each.name === name)?.value;

// Splits the page into start tags and raw-text bodies of <script> and <style>.
function scan(html) {
  const tags = [];
  const blocks = [];
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf('<', i);
    if (open === -1) break;
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (!/[a-zA-Z]/.test(html[open + 1] ?? '')) {
      i = open + 1;
      continue;
    }
    const close = html.indexOf('>', open);
    if (close === -1) break;
    const tag = html.slice(open, close + 1);
    const name = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag)[1].toLowerCase();
    const attributes = readAttributes(tag);
    tags.push({ name, attributes, at: open, end: close + 1 });
    i = close + 1;
    if (name === 'script' || name === 'style') {
      const ending = html.toLowerCase().indexOf(`</${name}`, i);
      const body = html.slice(i, ending === -1 ? html.length : ending);
      blocks.push({ name, attributes, body });
      i = ending === -1 ? html.length : html.indexOf('>', ending) + 1;
    }
  }
  return { tags, blocks };
}

// The HTML parser turns CR LF and a lone CR into LF before a block's text exists, so the hash is over that.
const newlines = (text) => text.split('\r\n').join('\n').split('\r').join('\n');
const sha256 = (text) => `'sha256-${createHash('sha256').update(Buffer.from(newlines(text), 'utf8')).digest('base64')}'`;

const expected = {
  'default-src': ["'none'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'blob:'],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
};
const neverAllowed = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'strict-dynamic'", 'data:', '*'];
// A browser drops spaces and control characters from an address before reading its scheme.
const withoutControls = (value) => [...value].filter((character) => character.charCodeAt(0) > 32).join('');
const isOtherSite = (address) => /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(address.trim()) || address.trim().startsWith('//');

/** The problems with one built page; an empty list when it passes. */
export function checkPage(html) {
  const problems = [];
  const { tags, blocks } = scan(html);

  const policies = tags.filter((tag) => tag.name === 'meta' && attribute(tag.attributes, 'http-equiv')?.trim().toLowerCase() === 'content-security-policy');
  if (policies.length !== 1) {
    problems.push(policies.length === 0 ? 'it has no policy tag' : `it has ${policies.length} policy tags`);
    return problems;
  }
  const policy = policies[0];
  const charset = tags.find((tag) => tag.name === 'meta' && attribute(tag.attributes, 'charset') !== undefined);
  if (!charset) problems.push('it has no character set tag');
  else if (policy.at !== charset.end) problems.push('the policy tag is not straight after the character set tag');
  const early = tags.find((tag) => ['script', 'link', 'style'].includes(tag.name) && tag.at < policy.at);
  if (early) problems.push(`a <${early.name}> comes before the policy tag`);

  // The directives, exactly.
  const directives = new Map();
  for (const part of (attribute(policy.attributes, 'content') ?? '').split(';')) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const name = words[0].toLowerCase();
    if (directives.has(name)) problems.push(`the policy names ${name} twice`);
    directives.set(name, words.slice(1));
  }
  for (const name of directives.keys()) if (!(name in expected)) problems.push(`the policy has a directive it should not: ${name}`);
  const hashes = { 'script-src': [], 'style-src': [] };
  for (const [name, sources] of Object.entries(expected)) {
    const given = directives.get(name);
    if (!given) {
      problems.push(`the policy has no ${name}`);
      continue;
    }
    for (const source of given) {
      if (neverAllowed.includes(source.toLowerCase())) problems.push(`${name} allows ${source}`);
      else if (name in hashes && /^'sha256-[A-Za-z0-9+/]+=*'$/.test(source)) hashes[name].push(source);
      else if (!sources.includes(source)) problems.push(`${name} allows ${source}, which the site's policy does not`);
    }
    for (const source of sources) if (!given.includes(source)) problems.push(`${name} lacks ${source}`);
  }

  // Every runnable inline block is hashed, and nothing else is.
  const needed = { 'script-src': new Set(), 'style-src': new Set() };
  for (const block of blocks) {
    if (block.name === 'script') {
      if (attribute(block.attributes, 'src') !== undefined) continue;
      if (!scriptTypeIsRunnable(attribute(block.attributes, 'type')) || block.body === '') continue;
      const hash = sha256(block.body);
      needed['script-src'].add(hash);
      if (!hashes['script-src'].includes(hash)) problems.push(`an inline script has no hash in the policy: ${JSON.stringify(block.body.slice(0, 60))}`);
    } else {
      const type = attribute(block.attributes, 'type');
      if (type !== undefined && !['', 'text/css'].includes(type.trim().toLowerCase())) continue;
      const hash = sha256(block.body);
      needed['style-src'].add(hash);
      if (!hashes['style-src'].includes(hash)) problems.push(`an inline style has no hash in the policy: ${JSON.stringify(block.body.slice(0, 60))}`);
    }
  }
  for (const name of ['script-src', 'style-src']) {
    for (const hash of hashes[name]) if (!needed[name].has(hash)) problems.push(`${name} lists ${hash}, which matches no block on the page`);
  }

  // No style attribute, inline handler or javascript: address; nothing from another site.
  for (const tag of tags) {
    for (const { name, value } of tag.attributes) {
      if (name === 'style') problems.push(`a <${tag.name}> has a style attribute`);
      if (/^on/.test(name)) problems.push(`a <${tag.name}> has an inline handler, ${name}`);
      if (/^javascript:/i.test(withoutControls(value))) problems.push(`a <${tag.name}> has a javascript: address`);
    }
    const src = attribute(tag.attributes, 'src');
    if (tag.name === 'script' && src !== undefined && isOtherSite(src)) problems.push(`a script comes from another site: ${src}`);
    const href = attribute(tag.attributes, 'href');
    // A link whose only rel is "canonical" names the page's own address for search engines; a browser
    // never fetches it, and it is absolute by rule (scripts/check-seo.mjs checks its value). Any other
    // link, or a rel that adds another word to canonical, may load something, so it must stay on the site.
    const rels = (attribute(tag.attributes, 'rel') ?? '').trim().toLowerCase().split(/\s+/);
    const onlyNames = rels.length === 1 && rels[0] === 'canonical';
    if (tag.name === 'link' && href !== undefined && isOtherSite(href) && !onlyNames) problems.push(`a <link> points to another site: ${href}`);
  }
  return problems;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Checks every page in a built directory; returns the problems as lines, and how many pages were read. */
export function checkDirectory(dir) {
  const pages = walk(dir).filter((file) => file.endsWith('.html'));
  const problems = [];
  if (pages.length === 0) problems.push(`${dir} holds no pages.`);
  for (const file of pages) {
    for (const problem of checkPage(readFileSync(file, 'utf8'))) problems.push(`${relative(dir, file)}: ${problem}`);
  }
  return { pages: pages.length, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? 'dist';
  const { pages, problems } = checkDirectory(dir);
  if (problems.length > 0) {
    console.error('The Content Security Policy check failed:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`${pages} pages in ${dir} each carry the site's policy first after the character set, with a hash for every inline block and nothing else inline.`);
}
