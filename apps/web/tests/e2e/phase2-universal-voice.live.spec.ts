import { test, expect, type Page } from "@playwright/test";

const LIVE_BASE_URL =
  process.env.PLAYWRIGHT_LIVE_BASE_URL || "http://127.0.0.1:3000";

const LEAD_NAME = "Priya Mehta";
const BUSINESS_NAME = "Sunrise Multispeciality Clinic";

async function registerTenant(page: Page): Promise<void> {
  const ts = Date.now();
  await page.goto(`${LIVE_BASE_URL}/login`);
  await page.getByRole("button", { name: "Register business" }).click();
  await page.getByLabel("Business name").fill(`Universal Voice ${ts}`);
  await page.getByLabel("Your name").fill("Automation Tester");
  await page.getByLabel("Email").fill(`phase2-${ts}@example.com`);
  await page.getByLabel("Password").fill("Password123!");
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await expect(page.getByRole("heading", { name: "AI Lead Conversion" })).toBeVisible();
}

async function addConsentedLead(page: Page): Promise<void> {
  await page.getByPlaceholder("e.g. Rajesh Sharma").fill(LEAD_NAME);
  await page.getByPlaceholder("e.g. +91 98765 43210").fill("+91 98765 43211");
  await page.getByPlaceholder("e.g. 3BHK SG Highway").fill("Consultation enquiry");
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByText(LEAD_NAME).first()).toBeVisible({ timeout: 15000 });
}

test("Phase 2 E2E: Train KB -> Simulated call INTERESTED outcome & summary -> Export", async ({ page }) => {
  await registerTenant(page);
  await addConsentedLead(page);

  const phase2Probe = await page.request.get(`${LIVE_BASE_URL}/api/kb/train`);
  expect(
    phase2Probe.status(),
    `Phase 2 API is not deployed at ${LIVE_BASE_URL} (HTTP ${phase2Probe.status()})`
  ).not.toBe(404);

  const trainAgent = page
    .locator('section:has(h2:text-is("Train AI Agent")), [data-testid="train-agent"]')
    .first();
  await expect(trainAgent).toBeVisible({ timeout: 15000 });
  await trainAgent.getByLabel("Business name").fill(BUSINESS_NAME);
  await trainAgent.getByLabel("Website URL").fill("https://example.org");
  await trainAgent
    .getByLabel("Google Map link")
    .fill("https://www.google.com/maps/search/?api=1&query=Sunrise+Clinic");
  await trainAgent.getByLabel("Call goal").fill("Book a consultation this week");
  await trainAgent.getByLabel("Agent language").selectOption("en-IN");
  await trainAgent
    .getByLabel("Script editor")
    .fill("Namaste, this is Sunrise Clinic. How may we help you today?");
  await trainAgent.getByRole("button", { name: "Train AI Agent" }).click();

  await expect(page.getByText(/Knowledge base (trained|saved)/)).toBeVisible({ timeout: 30000 });
  await expect(trainAgent.getByRole("heading", { name: BUSINESS_NAME, exact: true })).toBeVisible({
    timeout: 15000,
  });

  const leadRow = page.locator("tr", { hasText: LEAD_NAME });
  await leadRow.getByRole("button", { name: "Trigger AI Call" }).click();
  await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 30000 });

  await page.reload();
  const refreshedLeadRow = page.locator("tr", { hasText: LEAD_NAME });
  await expect(refreshedLeadRow.getByTestId("lead-outcome")).toHaveAttribute(
    "data-outcome",
    "INTERESTED",
    { timeout: 20000 }
  );
  await expect(refreshedLeadRow.getByTestId("lead-ai-summary")).not.toHaveText(/^—$/, {
    timeout: 20000,
  });

  await refreshedLeadRow.getByRole("button", { name: "Call History" }).click();
  await expect(page.getByRole("dialog")).toContainText("Interested");
  await page.keyboard.press("Escape");

  const sheetsSync = page.getByTestId("sheets-sync");
  await expect(sheetsSync).toBeVisible({ timeout: 15000 });
  await expect(sheetsSync.getByRole("button", { name: "Export to CSV" })).toBeVisible();
  await expect(sheetsSync.getByRole("button", { name: "Export to Google Sheet" })).toBeVisible();
  await sheetsSync.getByRole("button", { name: "Export to CSV" }).click();
  await expect(sheetsSync.getByText(/CSV exported/)).toBeVisible({ timeout: 20000 });
});
