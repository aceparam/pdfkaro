// Builds the site as a preview under a sub-path, then checks that every link,
// stylesheet and script in the built pages sits under that sub-path.
// A link written as "/about" in a page or component, and not passed through
// withBase, would work at the root and break on the preview. This catches it.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = '/base-check';
const outDir = 'dist-base';

rmSync(outDir, { recursive: true, force: true });
const build = spawnSync('npx', ['astro', 'build', '--outDir', outDir], {
  env: { ...process.env, SITE_BASE: base, ASTRO_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'ignore', 'inherit'],
  shell: process.platform === 'win32',
});
if (build.status !== 0) {
  console.error('The build under a sub-path failed.');
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const pages = walk(outDir).filter((file) => file.endsWith('.html'));
if (pages.length === 0) {
  console.error('The build under a sub-path made no pages.');
  process.exit(1);
}

const attribute = /(?:href|src|component-url|renderer-url|before-hydration-url)\s*=\s*["']([^"']*)["']/g;
const problems = [];
let checked = 0;
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  if (!html.includes('<meta name="robots" content="noindex"')) {
    problems.push(`${file}: a preview page must ask search engines to leave it out`);
  }
  for (const match of html.matchAll(attribute)) {
    const url = match[1];
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    checked += 1;
    if (url !== `${base}/` && !url.startsWith(`${base}/`)) {
      problems.push(`${file}: "${url}" is not under ${base}/`);
    }
  }
}

rmSync(outDir, { recursive: true, force: true });

if (problems.length > 0) {
  console.error('These would break on a preview under a sub-path:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`${pages.length} pages and ${checked} links, stylesheets and scripts all sit under the sub-path.`);
