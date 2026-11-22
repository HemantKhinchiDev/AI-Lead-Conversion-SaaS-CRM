import { test, expect } from "@playwright/test";

test("Phase 1 MVP E2E: Register -> Login -> Create Lead -> Consent -> Trigger AI Call -> Call History", async ({ page }) => {
  const ts = Date.now();
  const email = `builder-${ts}@example.com`;
  const password = "Password123!";

  await page.goto("/login");
  await page.getByRole("button", { name: "Register business" }).click();
  await page.getByLabel("Business name").fill(`Ahmedabad Realty ${ts}`);
  await page.getByLabel("Your name").fill("Hemant Builder");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator('form button[type="submit"]').first().click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await expect(page.getByRole("heading", { name: "AI Lead Conversion" })).toBeVisible();

  await page.getByPlaceholder("e.g. Rajesh Sharma").fill("Rohan Sharma");
  await page.getByPlaceholder("e.g. +91 98765 43210").fill("+91 98765 43210");
  await page.getByPlaceholder("e.g. 3BHK SG Highway").fill("3BHK Flat Ahmedabad");
  await page.locator('form button[type="submit"]').first().click();

  await expect(page.getByText("Rohan Sharma")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Trigger AI Call" }).first().click();

  await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Call History" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Outcome");
});
