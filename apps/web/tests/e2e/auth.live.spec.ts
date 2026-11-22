import { test, expect } from "@playwright/test";
import { LIVE_BASE_URL, loginAsTenant, signOut } from "./helpers";

test("T016a: Live registration flow - sign up new tenant", async ({ page }) => {
  await page.goto(`${LIVE_BASE_URL}/login`);
  const randomEmail = `user-t016a-${Date.now()}@example.com`;
  await page.fill('input[type="email"]', randomEmail);
  await page.fill('input[type="password"]', "Password123");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(`${LIVE_BASE_URL}/dashboard`);
});

test("T016b: Live login flow - sign in existing user", async ({ page }) => {
  await page.goto(`${LIVE_BASE_URL}/login`);
  await loginAsTenant(page, "demo@example.com", "Password123");
});

test("T016c: Live invalid credentials handling", async ({ page }) => {
  await page.goto(`${LIVE_BASE_URL}/login`);
  await page.fill('input[type="email"]', "user@example.com");
  await page.fill('input[type="password"]', "wrongpassword");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(`${LIVE_BASE_URL}/login`);
  await expect(page.locator('[data-state="error"]')).toBeVisible();
});

test("T016d: Live sign-out flow", async ({ page }) => {
  await page.goto(`${LIVE_BASE_URL}/dashboard`);
  await signOut(page);
});