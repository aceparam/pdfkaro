// The Content Security Policy for every built page, as plain functions over
// the HTML text (Node only, no DOM). The Astro integration in astro.config.mjs
// runs `withPolicy` over every built page, so each page's hashes are taken
// from the file exactly as it is served and cannot drift from it.
//
// `scripts/check-csp.mjs` checks the result with its own code, not this file,
// so a mistake in one is caught by the other.

import { createHash } from 'node:crypto';

// The inline <script> types that the browser runs, or that script-src governs
// inline anyway. Anything else, such as application/ld+json, is a data block.
const javascriptTypes = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);
const governedScriptTypes = new Set(['module', 'importmap', 'speculationrules']);

/** The attributes of one start tag's inside, such as ` type="module" async`, by lower-case name. */
function attributesOf(inside) {
  const found = new Map();
  for (const match of inside.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (!found.has(name)) found.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return found;
}

function runsAsScript(attributes) {
  if (attributes.has('src')) return false;
  if (!attributes.has('type')) return true;
  const type = attributes.get('type').trim().toLowerCase();
  return type === '' || javascriptTypes.has(type) || governedScriptTypes.has(type);
}

function appliesAsStyle(attributes) {
  if (!attributes.has('type')) return true;
  const type = attributes.get('type').trim().toLowerCase();
  return type === '' || type === 'text/css';
}

/**
 * Each inline block the policy must allow, in page order: the body of every
 * runnable inline <script> (an empty one runs nothing and is left out) and of
 * every <style> that applies.
 */
export function inlineBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const kind = match[1].toLowerCase();
    const attributes = attributesOf(match[2]);
    // A browser reads CR LF and a lone CR as LF before it sees the block, so it hashes the text that way.
    const text = match[3].replace(/\r\n?/g, '\n');
    if (kind === 'script' && runsAsScript(attributes) && text !== '') blocks.push({ kind: 'script', text });
    if (kind === 'style' && appliesAsStyle(attributes)) blocks.push({ kind: 'style', text });
  }
  return blocks;
}

/** The policy source for one block of text: SHA-256, base64, over its UTF-8 bytes, as a browser hashes it. */
export function hashOf(text) {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** The policy for one page, with the hashes of that page's own inline blocks and no others. */
export function policyFor(html) {
  const blocks = inlineBlocks(html);
  const hashes = (kind) => [...new Set(blocks.filter((block) => block.kind === kind).map((block) => hashOf(block.text)))];
  return [
    "default-src 'none'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...hashes('script')].join(' '),
    ["style-src 'self'", ...hashes('style')].join(' '),
    "img-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** The page with its policy tag straight after the character set tag. */
export function withPolicy(html) {
  const charset = /<meta\s+charset=["']?utf-8["']?\s*\/?>/i.exec(html);
  if (!charset) throw new Error('The page has no <meta charset="utf-8"> tag to put the policy after.');
  if (/<meta\s[^>]*http-equiv\s*=\s*["']?content-security-policy/i.test(html)) throw new Error('The page already has a policy tag.');
  const before = html.slice(0, charset.index);
  if (/<(script|link|style)\b/i.test(before)) throw new Error('A script, stylesheet or link comes before the character set tag.');
  const end = charset.index + charset[0].length;
  return `${html.slice(0, end)}<meta http-equiv="Content-Security-Policy" content="${policyFor(html)}">${html.slice(end)}`;
}
