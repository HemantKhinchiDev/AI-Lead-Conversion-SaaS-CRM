import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'https://web-olive-delta-41.vercel.app';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@example.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo123!';

test.describe('Leads CRUD (Live) - Create/Update Only', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill(DEMO_EMAIL);
    await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await page.waitForURL(/\/(dashboard|leads|app)\//, { timeout: 15000 });
  });

  test('T025: Create a new lead and verify it appears in the list', async ({ page }) => {
    const uniqueName = `E2E Lead ${Date.now()}`;
    const uniquePhone = `+1555${Math.floor(10000000 + Math.random() * 89999999)}`;

    // Navigate to Leads section
    await page.goto(`${BASE_URL}/leads`);

    // Click Add/Create Lead button
    const addBtn = page.getByRole('button', { name: /add lead|create lead|new lead|\+/i });
    await addBtn.click();

    // Fill lead form
    await page.getByLabel(/name/i).first().fill(uniqueName);
    await page.getByLabel(/phone/i).first().fill(uniquePhone);

    // Submit form
    await page.getByRole('button', { name: /save|create|submit/i }).click();

    // Verify lead appears in the list
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 });
  });

  test('T025: Update an existing lead and verify changes persist', async ({ page }) => {
    const uniqueName = `E2E Update ${Date.now()}`;
    const uniquePhone = `+1555${Math.floor(10000000 + Math.random() * 89999999)}`;
    const updatedName = `${uniqueName} - Updated`;

    // Navigate to Leads section
    await page.goto(`${BASE_URL}/leads`);

    // Create a lead first
    const addBtn = page.getByRole('button', { name: /add lead|create lead|new lead|\+/i });
    await addBtn.click();
    await page.getByLabel(/name/i).first().fill(uniqueName);
    await page.getByLabel(/phone/i).first().fill(uniquePhone);
    await page.getByRole('button', { name: /save|create|submit/i }).click();
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 });

    // Click on the lead to edit
    await page.getByText(uniqueName).click();

    // Update the name
    const nameInput = page.getByLabel(/name/i).first();
    await nameInput.fill(updatedName);

    // Save changes
    await page.getByRole('button', { name: /save|update/i }).click();

    // Verify updated name is visible
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10000 });
  });
});
