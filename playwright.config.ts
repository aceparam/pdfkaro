import { existsSync } from 'node:fs';
import { defineConfig, devices, firefox } from '@playwright/test';
import { defaultOrigin } from './src/site.ts';

// The Content Security Policy checks (csp.spec.ts) also run in Firefox. This project has no grepInvert, so
// csp.spec.ts's @desktop tests (the tag on every page) run in it too, by intent. CI installs Firefox; elsewhere it
// runs only where it is installed, so a machine with Chromium alone still runs every other test.
// WebKit is not run (owner, 22 Nov 2026): Playwright's WebKit does not report a worker started inside a worker
// (CI run 44998603164), so the policy in PDF.js's worker is checked by hand in Safari instead (issue #7).
const otherEngines = [{ name: 'firefox', browser: firefox, device: devices['Desktop Firefox'] }]
  .filter(({ browser }) => Boolean(process.env.CI) || existsSync(browser.executablePath()))
  .map(({ name, device }) => ({ name, use: { ...device, viewport: { width: 1280, height: 800 } }, testMatch: /csp\.spec\.ts/ }));

// End-to-end tests run against the built site, at a phone width and a desktop width.

// The tests need the server they start themselves, serving `dist/`. They never reuse one already
// listening: a dev server on the same port serves other files, and another run's server stops when
// that run ends, which failed tests that fetch files late (thumbnails, engines) at random. A port in
// use fails the run at once (with `strictPort` in astro.config.mjs for the preview server).
// The address is defaultOrigin, which a build with no SITE_ORIGIN writes into its canonical tags, so
// the end-to-end tests can check that each canonical is the address shown.
const origin = defaultOrigin;
const port = new URL(origin).port;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: origin,
    trace: 'off',
  },
  projects: [
    // Tests tagged @desktop need a mouse or need to run only once.
    { name: 'phone', use: { viewport: { width: 360, height: 740 } }, grepInvert: /@desktop/, testIgnore: /performance\.spec\.ts/ },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testIgnore: /performance\.spec\.ts/ },
    // Timing checks run last, at phone size, once the other projects are done, so no other browser competes for the machine.
    { name: 'performance', use: { viewport: { width: 360, height: 740 } }, testMatch: /performance\.spec\.ts/, dependencies: ['phone', 'desktop'] },
    ...otherEngines,
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --ignore-lock`,
    url: origin,
    reuseExistingServer: false,
    env: { ASTRO_TELEMETRY_DISABLED: '1' },
  },
});
