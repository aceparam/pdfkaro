// Makes public/social.png, the one plain picture link previews show (og:image).
// Run it by hand when the site name or tagline changes, look at the result, and
// commit it: `node scripts/social-image.mjs`. It is not run in CI, because another
// machine's fonts would change its bytes. No page loads the picture.
//
// It shows only the site name and the tagline from src/site.ts, the same words as
// og:image:alt, in the site's light colours and system font, centred so that a
// centred square crop keeps both lines whole. No picture, icon, shape, border,
// shadow or gradient.
//
// The page is written with setContent and every request is refused, so nothing is
// fetched while it is drawn.
//
// The system font is whatever the machine running this has. "Banned patterns" in
// SPEC.md bans the Inter font, and some Linux machines give Inter as system-ui, so the
// script asks Chromium which fonts it really drew and writes nothing if one is Inter.
// On such a machine, point FONTCONFIG_FILE at a configuration that rejects Inter.

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { siteName, tagline } from '../src/site.ts';

const out = fileURLToPath(new URL('../public/social.png', import.meta.url));

const escapeHtml = (text) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

// The tagline breaks after its first comma, so each line fits inside the centred 630px square.
const comma = tagline.indexOf(',');
const lines = comma === -1 ? [tagline] : [tagline.slice(0, comma + 1), tagline.slice(comma + 1).trim()];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; }
  body {
    background: #fbfaf6;
    color: #1b1b1b;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  h1 { margin: 0 0 28px; font-size: 112px; line-height: 1.1; font-weight: 700; }
  p { margin: 0; font-size: 44px; line-height: 1.3; font-weight: 400; }
</style>
</head>
<body>
<h1>${escapeHtml(siteName)}</h1>
<p>${lines.map(escapeHtml).join('<br>')}</p>
</body>
</html>`;

/** The font families Chromium really used for the heading and the tagline, from the DevTools protocol. */
async function fontsDrawn(page) {
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument');
  const families = new Set();
  for (const selector of ['h1', 'p']) {
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    for (const font of fonts) families.add(font.familyName);
  }
  return [...families];
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route('**', (route) => route.abort());
  await page.setContent(html);
  const drawn = await fontsDrawn(page);
  // Any family whose name holds "inter": Inter, Inter Display, InterVariable.
  const banned = drawn.filter((family) => /inter/i.test(family));
  if (banned.length > 0) {
    console.error(`This machine draws the text in ${banned.join(', ')}, a banned font. Nothing was written. Reject it with FONTCONFIG_FILE and run again.`);
    process.exitCode = 1;
  } else {
    console.log(`Drawn in ${drawn.join(', ')}.`);
    mkdirSync(fileURLToPath(new URL('../public/', import.meta.url)), { recursive: true });
    await page.screenshot({ path: out, type: 'png' });
    console.log(`Wrote ${out}.`);
  }
} finally {
  await browser.close();
}
