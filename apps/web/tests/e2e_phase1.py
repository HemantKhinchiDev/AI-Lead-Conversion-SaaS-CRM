import os
from playwright.sync_api import sync_playwright

BASE = "https://web-olive-delta-41.vercel.app"
email = os.environ.get("TEST_EMAIL", "").strip()
password = os.environ.get("TEST_PASSWORD", "").strip()


def run_e2e() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify /login renders cleanly
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
        assert page.locator('input[type="email"]').is_visible(), "Email input missing"
        assert page.locator('input[type="password"]').is_visible(), "Password input missing"
        print("PASS_1_LOGIN_PAGE")

        # 2. Verify unauthenticated /dashboard redirects to /login
        page.goto(f"{BASE}/dashboard", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1500)
        assert "/login" in page.url, f"Expected /login redirect, got {page.url}"
        print("PASS_2_UNAUTH_GUARD_REDIRECT:", page.url)

        if email and password:
            page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
            page.locator('input[type="email"]').fill(email)
            page.locator('input[type="password"]').fill(password)
            page.locator('button[type="submit"]').click()
            page.wait_for_url("**/dashboard**", timeout=25000)
            page.wait_for_timeout(2000)
            assert page.locator('[data-testid="csv-import"]').is_visible(), "CsvImportCard not visible"
            print("PASS_3_AUTH_DASHBOARD_AND_CSV:", page.url)

        browser.close()


if __name__ == "__main__":
    run_e2e()
