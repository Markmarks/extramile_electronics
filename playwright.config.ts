import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for both apps (see .claude/skills/verify).
 *   pnpm e2e                       # everything; @backend tests self-skip when Supabase is down
 *   pnpm e2e --project=desktop     # one app
 *   pnpm e2e:offline               # only tests that need no backend
 *
 * Runs in the installed Microsoft Edge (channel "msedge"): no browser download, and it is
 * the same Chromium engine as the WebView2 the Tauri back-office ships in. Set
 * PW_CHANNEL=chromium after `pnpm exec playwright install chromium` to use Playwright's own.
 *
 * Retries stay 0 locally so flakes surface instead of hiding; in CI a pass-on-retry is
 * still reported, and failOnFlakyTests turns it into a failure.
 */
const CI = !!process.env.CI;
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  timeout: 60_000, // Next dev compiles each route on first hit — slow on Windows
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  failOnFlakyTests: CI,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 60_000,
  },
  // localhost, not 127.0.0.1: Vite binds localhost, which on Windows/Node 17+ is IPv6 ::1 only
  // (matches tauri.conf.json devUrl). Probing 127.0.0.1 misses a running server.
  webServer: [
    {
      name: 'web',
      command: 'node apps/web/node_modules/next/dist/bin/next dev apps/web --port 3001',
      url: 'http://localhost:3001/login',
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: 'ignore',
    },
    {
      name: 'desktop',
      command: 'pnpm --filter @extramile/desktop dev',
      url: 'http://localhost:1420',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'web',
      testDir: 'apps/web/e2e',
      use: { ...devices['Desktop Chrome'], channel, baseURL: 'http://localhost:3001' },
    },
    {
      name: 'desktop',
      testDir: 'apps/desktop/e2e',
      use: { ...devices['Desktop Chrome'], channel, baseURL: 'http://localhost:1420' },
    },
  ],
});
