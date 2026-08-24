import { defineConfig, devices } from '@playwright/test';

// Points at the isolated e2e stack started by scripts/e2e.sh (docker-compose.e2e.yml,
// ports 8199/5199 — never the real dev/prod instance). No webServer here: the compose
// stack needs a Docker build + health-wait that Playwright's webServer isn't a good fit
// for, so scripts/e2e.sh manages the stack's lifecycle and just invokes `playwright test`.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share one backend/DB — avoid races between specs
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
