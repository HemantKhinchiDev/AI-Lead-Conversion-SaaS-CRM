const { defineConfig } = require("@playwright/test");

const LOCAL_BASE_URL = "http://127.0.0.1:3000";
const baseURL = process.env.PLAYWRIGHT_LIVE_BASE_URL || LOCAL_BASE_URL;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
    browserName: "chromium",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: LOCAL_BASE_URL,
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: "Chromium",
      use: { browserName: "chromium" },
    },
  ],
});
