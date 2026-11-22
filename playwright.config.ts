import { existsSync } from 'node:fs';
import { defineConfig, devices, firefox, webkit } from '@playwright/test';

// The Content Security Policy checks (csp.spec.ts) also run in Firefox and WebKit. CI installs both
// browsers; elsewhere they run only where they are installed, so a machine with Chromium alone still
// runs every other test.
const otherEngines = [
  { name: 'firefox', browser: firefox, device: devices['Desktop Firefox'] },
  { name: 'webkit', browser: webkit, device: devices['Desktop Safari'] },
]
  .filter(({ browser }) => Boolean(process.env.CI) || existsSync(browser.executablePath()))
  .map(({ name, device }) => ({ name, use: { ...device, viewport: { width: 1280, height: 800 } }, testMatch: /csp\.spec\.ts/ }));

// End-to-end tests run against the built site, at a phone width and a desktop width.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4321',
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
    command: 'npm run preview -- --port 4321 --ignore-lock',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    env: { ASTRO_TELEMETRY_DISABLED: '1' },
  },
});
