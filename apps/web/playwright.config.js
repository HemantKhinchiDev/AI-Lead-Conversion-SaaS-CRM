const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  grep: [],

  timeout: 60000,

  retries: process.env.CI ? 2 : 0,

  testMatch: '**/e2e/**/*.spec.ts',

  use: {
    baseURL: process.env.PLAYWRIGHT_LIVE_BASE_URL || "https://web-olive-delta-41.vercel.app",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "Chromium",
      use: { ...module.exports.use, browser: "chromium" },
    },
  ],
});
