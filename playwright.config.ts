import { defineConfig } from '@playwright/test';

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
    { name: 'phone', use: { viewport: { width: 360, height: 740 } }, grepInvert: /@desktop/ },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4321 --ignore-lock',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    env: { ASTRO_TELEMETRY_DISABLED: '1' },
  },
});
