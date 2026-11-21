import { test, expect } from "@playwright/test";
import { LIVE_BASE_URL, loginAsTenant, signOut } from "./helpers";
import { createClient } from "@supabase/supabase-js";

test("T018a: Cross-tenant lead read denial - tenant A cannot see tenant B's leads", async ({ page }) => {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  await page.goto(`${LIVE_BASE_URL}/login`);

  // Create tenant B user and associate with tenant B
  const tenantBEmail = `user-t018b-${Date.now()}@example.com`;
  const tenantBPassword = "Password123";
  const { data: bUser, error: bUserError } = await supa.auth.signUp({
    email: tenantBEmail,
    password: tenantBPassword,
  });
  if (bUserError || !bUser) throw new Error("Failed to create tenant B user");

  const { error: assocError } = await supa.from("public.users").insert({
    id: bUser.user!.id,
    tenant_id: "tenant-b-id",
  });
  if (assocError) throw new Error("Failed to associate tenant B user");

  await loginAsTenant(page, tenantBEmail, tenantBPassword);
  await expect(page.locator("text=No leads match your view")).toBeVisible();
  await signOut(page);

  // Tenant A logs in and should NOT see tenant B's leads
  const tenantAEmail = `user-t018a-${Date.now()}@example.com`;
  const tenantAPassword = "Password123";
  await loginAsTenant(page, tenantAEmail, tenantAPassword);
  await expect(page.locator("text=No leads match your view")).toBeVisible();
  await signOut(page);
});

test("T018b: Cross-tenant call_logs write denial", async ({ page }) => {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Create two tenants
  const tAEmail = `usera-t018-${Date.now()}@example.com`;
  const tAPassword = "Password123";
  const { data: tAUser } = await supa.auth.signUp({
    email: tAEmail,
    password: tAPassword,
  });

  const tBEmail = `userb-t018-${Date.now()}@example.com`;
  const { data: tBUser } = await supa.auth.signUp({
    email: tBEmail,
    password: tAPassword,
  });

  await supa.from("public.users").insert({ id: tAUser.user!.id, tenant_id: "tenant-a" });
  await supa.from("public.users").insert({ id: tBUser.user!.id, tenant_id: "tenant-b" });

  await loginAsTenant(page, tAEmail, tAPassword);
  await signOut(page);

  await loginAsTenant(page, tBEmail, tAPassword);
  await page.goto(`${LIVE_BASE_URL}/dashboard`);
  await expect(page.locator('[data-state="error"]')).toContainText("Consent is required");
  await signOut(page);
});