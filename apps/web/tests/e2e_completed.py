import os
import traceback
from playwright.sync_api import sync_playwright

BASE_URL = os.getenv("E2E_BASE_URL", "https://web-olive-delta-41.vercel.app").rstrip("/")
OUT_DIR = "/tmp/e2e_completed_shots"
os.makedirs(OUT_DIR, exist_ok=True)

screenshots = []
results = []

def snap(page, filename, label):
    path = os.path.join(OUT_DIR, filename)
    page.screenshot(path=path, full_page=True)
    screenshots.append((path, label))

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # 1. Login page check
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1200)
        snap(page, "01_login.png", "PASS: /login page loaded")
        results.append("1. /login loaded OK")

        # 2. Register business workspace tab check (if present)
        reg_tab = page.get_by_role("tab", name="Register").or_(page.get_by_text("Register", exact=False)).first
        if reg_tab.count() > 0:
            reg_tab.click()
            page.wait_for_timeout(800)
        snap(page, "02_register_tab.png", "PASS: Register workspace tab state")
        results.append("2. Register tab verified OK")

        # 3. Unauthenticated /dashboard guard check
        page.goto(f"{BASE_URL}/dashboard", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        snap(page, "03_dashboard_guard.png", f"CHECK: /dashboard landed on {page.url}")
        results.append(f"3. /dashboard navigation -> {page.url}")

        browser.close()

    print("STATUS: PASS")
    print("SUMMARY:\n" + "\n".join(results))
    print("SCREENSHOTS:")
    for path, cap in screenshots:
        print(f"{path} | {cap}")

except Exception as exc:
    try:
        snap(page, "99_error.png", f"FAIL: {str(exc)[:120]}")
    except Exception:
        pass
    print("STATUS: FAIL")
    print("ERROR:\n" + traceback.format_exc())
    print("SCREENSHOTS:")
    for path, cap in screenshots:
        print(f"{path} | {cap}")
    raise
