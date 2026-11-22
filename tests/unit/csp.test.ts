import { describe, expect, it } from 'vitest';
import { hashOf, inlineBlocks, policyFor, withPolicy } from '../../scripts/csp.mjs';
import { checkPage } from '../../scripts/check-csp.mjs';

// Astro's one inline style on every page with an island; a browser computes the same hash for it.
const astroStyle = 'astro-island,astro-slot,astro-static-slot{display:contents}';
const astroStyleHash = "'sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow='";

const page = (head: string, body = '') => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
const fixed = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'";

describe('hashOf', () => {
  it("gives the browser's hash for Astro's island style", () => {
    expect(hashOf(astroStyle)).toBe(astroStyleHash);
  });

  it('hashes the UTF-8 bytes of the text', () => {
    // sha256 of the UTF-8 bytes of "é" (c3 a9), base64.
    expect(hashOf('é')).toBe("'sha256-SplVfkAzw1Od4utlRyAXytX5VX96BiWgnxw/biumnEw='");
  });
});

describe('inlineBlocks', () => {
  it('returns scripts with no type, a JavaScript type, module, importmap and speculationrules', () => {
    const html = page(
      '',
      '<script>a()</script><script type="text/javascript">b()</script><script type="module">c()</script>' +
        '<script type="importmap">{"imports":{}}</script><script type="speculationrules">{}</script><script type="">d()</script>' +
        '<script type="TEXT/JavaScript">e()</script>',
    );
    expect(inlineBlocks(html).map((block: { text: string }) => block.text)).toEqual(['a()', 'b()', 'c()', '{"imports":{}}', '{}', 'd()', 'e()']);
  });

  it('leaves out data blocks such as JSON-LD', () => {
    expect(inlineBlocks(page('<script type="application/ld+json">{"@type":"WebPage"}</script>'))).toEqual([]);
  });

  it('leaves out a script with a source, which is not inline', () => {
    expect(inlineBlocks(page('', '<script type="module" src="/_astro/a.js"></script>'))).toEqual([]);
  });

  it('leaves out an empty script, which runs nothing, but keeps an empty style', () => {
    expect(inlineBlocks(page('<style></style>', '<script></script>'))).toEqual([{ kind: 'style', text: '' }]);
  });

  it('returns two blocks with the same body twice, in page order', () => {
    expect(inlineBlocks(page('', '<script>x()</script><style>p{}</style><script>x()</script>'))).toEqual([
      { kind: 'script', text: 'x()' },
      { kind: 'style', text: 'p{}' },
      { kind: 'script', text: 'x()' },
    ]);
  });
});

describe('line ends', () => {
  it('hashes CR LF and a lone CR as LF, as a browser reads them', () => {
    expect(inlineBlocks(page('', '<script>a()\r\nb()\rc()</script>'))).toEqual([{ kind: 'script', text: 'a()\nb()\nc()' }]);
    expect(policyFor(page('', '<style>p{}\r\nq{}</style>'))).toContain(hashOf('p{}\nq{}'));
  });

  it('the build check hashes them the same way', () => {
    const html = withPolicy(page('', '<script>a()\r\nb()\rc()</script><style>p{}\r\nq{}</style>'));
    expect(html).toContain(hashOf('a()\nb()\nc()'));
    expect(checkPage(html)).toEqual([]);
    // A policy holding the hash of the raw CR LF text is refused: no block on the page has that text.
    const raw = html.replace(hashOf('a()\nb()\nc()'), hashOf('a()\r\nb()\rc()'));
    expect(checkPage(raw)).toEqual([
      'an inline script has no hash in the policy: "a()\\r\\nb()\\rc()"',
      `script-src lists ${hashOf('a()\r\nb()\rc()')}, which matches no block on the page`,
    ]);
  });
});

describe('policyFor', () => {
  it('lists no hash on a page with no inline block', () => {
    expect(policyFor(page('<link rel="stylesheet" href="/_astro/a.css">'))).toBe(fixed);
  });

  it("lists each kind's hashes in its own directive, once each", () => {
    const policy = policyFor(page('', `<style>${astroStyle}</style><script>x()</script><script>x()</script><script type="module">y()</script>`));
    expect(policy).toBe(
      `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' ${hashOf('x()')} ${hashOf('y()')}; style-src 'self' ${astroStyleHash}; img-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'`,
    );
  });

  it('does not hash a JSON-LD block', () => {
    expect(policyFor(page('<script type="application/ld+json">{}</script>'))).toBe(fixed);
  });
});

describe('withPolicy', () => {
  it('puts the tag straight after the character set tag', () => {
    const out = withPolicy(page('<title>A</title><link rel="stylesheet" href="/a.css">'));
    expect(out).toContain(`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${fixed}"><title>A</title>`);
    expect(checkPage(out)).toEqual([]);
  });

  it('refuses a page that already has a policy tag', () => {
    expect(() => withPolicy(withPolicy(page('')))).toThrow('already has a policy tag');
  });

  it('refuses a page with a script before the character set tag', () => {
    expect(() => withPolicy('<html><head><script>x()</script><meta charset="utf-8"></head></html>')).toThrow('before the character set tag');
  });

  it('refuses a page with no character set tag', () => {
    expect(() => withPolicy('<html><head></head></html>')).toThrow('no <meta charset');
  });
});

describe('the build check', () => {
  const island = `<main><style>${astroStyle}</style><script>x()</script></main>`;
  const good = withPolicy(page('<title>A</title><link rel="stylesheet" href="/_astro/a.css">', island));

  it('accepts a page as the build writes it', () => {
    expect(checkPage(good)).toEqual([]);
  });

  it('accepts an unhashed JSON-LD block', () => {
    expect(checkPage(withPolicy(page('<script type="application/ld+json">{"@type":"WebPage"}</script>')))).toEqual([]);
  });

  it('refuses a page with no tag', () => {
    expect(checkPage(page(''))).toEqual(['it has no policy tag']);
  });

  it('refuses a tag after a stylesheet', () => {
    const html = page(`<link rel="stylesheet" href="/a.css"><meta http-equiv="Content-Security-Policy" content="${fixed}">`);
    const problems = checkPage(html);
    expect(problems).toContain('the policy tag is not straight after the character set tag');
    expect(problems).toContain('a <link> comes before the policy tag');
  });

  it('refuses an inline script with no hash', () => {
    const html = good.replace('</main>', '<script>y()</script></main>');
    expect(checkPage(html)).toEqual(['an inline script has no hash in the policy: "y()"']);
  });

  it('refuses a hash that matches no block', () => {
    const html = good.replace('<script>x()</script>', '');
    expect(checkPage(html)).toEqual([`script-src lists ${hashOf('x()')}, which matches no block on the page`]);
  });

  it('refuses a style attribute', () => {
    expect(checkPage(good.replace('<main>', '<main style="color:red">'))).toEqual(['a <main> has a style attribute']);
  });

  it('refuses an inline handler', () => {
    expect(checkPage(good.replace('<main>', '<main><button onclick="x()">A</button>'))).toEqual(['a <button> has an inline handler, onclick']);
  });

  it('refuses a javascript: address', () => {
    expect(checkPage(good.replace('<main>', '<main><a href=" JavaScript:x()">A</a>'))).toEqual(['a <a> has a javascript: address']);
  });

  it("refuses 'unsafe-inline'", () => {
    expect(checkPage(good.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"))).toEqual(["style-src allows 'unsafe-inline'"]);
  });

  it("refuses a worker-src other than 'self' blob:", () => {
    expect(checkPage(good.replace("worker-src 'self' blob:", "worker-src 'self' blob: data:"))).toEqual(['worker-src allows data:']);
    expect(checkPage(good.replace("worker-src 'self' blob:", 'worker-src blob:'))).toEqual(["worker-src lacks 'self'"]);
    expect(checkPage(good.replace("worker-src 'self' blob:", "worker-src 'self' blob: https://example.com"))).toEqual([
      "worker-src allows https://example.com, which the site's policy does not",
    ]);
  });

  it('refuses a script from another site', () => {
    expect(checkPage(good.replace('</main>', '<script src="https://example.com/a.js"></script></main>'))).toEqual([
      'a script comes from another site: https://example.com/a.js',
    ]);
    expect(checkPage(good.replace('</main>', '<script src="//example.com/a.js"></script></main>'))).toEqual(['a script comes from another site: //example.com/a.js']);
  });

  it('refuses a directive the site does not use, and a missing one', () => {
    expect(checkPage(good.replace("; form-action 'none'", "; frame-ancestors 'none'"))).toEqual([
      'the policy has a directive it should not: frame-ancestors',
      'the policy has no form-action',
    ]);
  });
});
