import { test, expect } from "@playwright/test";
import { LIVE_BASE_URL } from "./helpers";

test("T017a: Dashboard route guard - redirect to login when unauthenticated", async ({ page }) => {
  await page.goto(`${LIVE_BASE_URL}/dashboard`);
  await expect(page).toHaveURL(`${LIVE_BASE_URL}/login`);
});

test("T017b: Browser bundle - no service-role credentials exposed", async ({ page }) => {
  const sources = await page.content();
  expect(sources).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(sources).not.toContain("service_role");
});

test("T017c: Dashboard page loads after successful login", async ({ page }) => {
  await page.goto(`${LIVE_BASE_URL}/login`);
  await page.fill('input[name="email"]', "demo@example.com");
  await page.fill('input[name="password"]', "Password123");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(`${LIVE_BASE_URL}/dashboard`);
  await expect(page.locator("h1")).toContainText("AI Lead Conversion");
});