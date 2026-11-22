import { test, expect, type Page } from "@playwright/test";

export const LIVE_BASE_URL = process.env.PLAYWRIGHT_LIVE_BASE_URL || "https://web-olive-delta-41.vercel.app";

export async function loginAsTenant(page: Page, tenantEmail: string, tenantPassword: string) {
  await page.goto(`${LIVE_BASE_URL}/login`);
  await page.fill('input[type="email"]', tenantEmail);
  await page.fill('input[type="password"]', tenantPassword);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(`${LIVE_BASE_URL}/dashboard`);
}

export async function signOut(page: Page) {
  await page.goto(`${LIVE_BASE_URL}/dashboard`);
  await page.click('text=Sign out');
  await expect(page).toHaveURL(`${LIVE_BASE_URL}/login`);
}

export async function createSyntheticTenant(supa: any, tenantName: string, userEmail: string, userPassword: string) {
  const { data, error } = await supa.auth.signUp({
    email: userEmail,
    password: userPassword,
    options: {
      dataOf: { tenant_name: tenantName },
    },
  });
  if (error) throw error;
  return data.user;
}

export async function associateUserWithTenant(supa: any, userId: string, tenantId: string) {
  const { error } = await supa.from("public.users").insert({
    id: userId,
    tenant_id: tenantId,
  });
  if (error) throw error;
}