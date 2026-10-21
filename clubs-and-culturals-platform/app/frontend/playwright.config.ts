import { defineConfig, devices } from '@playwright/test';

/**
 * One smoke journey against a real backend. Run the API first (see README),
 * point VITE_API_BASE at it, then `npm run e2e`. Not wired into CI yet.
 *
 * E2E_PORT picks the dev-server port (default 5173) so the smoke can run next
 * to another Vite instance; the backend must list that origin in
 * CORS_ALLOWED_ORIGINS.
 */
const port = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
