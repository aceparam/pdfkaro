import { defineConfig } from '@playwright/test';

// End-to-end tests run against the built site, at a phone width and a desktop width.

// The tests need the server they start themselves, serving `dist/`. They never reuse one already
// listening: a dev server on Astro's usual port 4321 serves other files, and another run's server
// stops when that run ends, which failed tests that fetch files late (thumbnails, engines) at random.
// So the port is not 4321, and a port in use fails the run at once. Runs side by side each need
// their own port: E2E_PORT=4331 npm run e2e.
const port = Number(process.env.E2E_PORT ?? 4329);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`E2E_PORT must be a port number from 1024 to 65535, not "${process.env.E2E_PORT}".`);
const origin = `http://localhost:${port}`;

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
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --ignore-lock`,
    url: origin,
    reuseExistingServer: false,
    env: { ASTRO_TELEMETRY_DISABLED: '1' },
  },
});
