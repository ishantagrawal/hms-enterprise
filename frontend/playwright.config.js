import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5187',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 375, height: 812 }
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort',
    port: 5187,
    reuseExistingServer: !process.env.CI
  }
});
