import os
import urllib.request
from playwright.sync_api import sync_playwright

BASE = "https://web-olive-delta-41.vercel.app"
OUT = "/tmp/e2e_screenshots"
email = os.environ.get("TEST_EMAIL", "").strip()
password = os.environ.get("TEST_PASSWORD", "").strip()


def send_telegram_photo(photo_path: str, caption: str) -> None:
    env = {}
    for p in ["/home/ubuntu/hermes/.env", "/home/ubuntu/.env"]:
        if os.path.exists(p):
            for line in open(p):
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    env[k] = v.strip("\"'")
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or env.get("TELEGRAM_CHAT_ID") or env.get("ALLOWED_USER_ID", "")
    if not token or not chat_id or not os.path.exists(photo_path):
        print(f"SAVED_LOCAL: {photo_path} ({caption})")
        return

    boundary = "----HermesBoundary7MA4YWxkTrZu0gW"
    with open(photo_path, "rb") as f:
        img_bytes = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="chat_id"\r\n\r\n{chat_id}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="caption"\r\n\r\n{caption}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="photo"; filename="{os.path.basename(photo_path)}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + img_bytes + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendPhoto",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    urllib.request.urlopen(req, timeout=20).read()
    print(f"SENT_TELEGRAM: {photo_path}")


def run_e2e() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # Step 1: /login Sign In view
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
        page.screenshot(path=f"{OUT}/01_login.png", full_page=True)
        send_telegram_photo(f"{OUT}/01_login.png", "Step 1: Live /login Sign In page")

        # Step 2: Register business tab view
        page.get_by_role("button", name="Register business").click()
        page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/02_register_tab.png", full_page=True)
        send_telegram_photo(f"{OUT}/02_register_tab.png", "Step 2: Register business workspace view")

        # Step 3: Unauthenticated /dashboard redirect guard
        page.goto(f"{BASE}/dashboard", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{OUT}/03_unauth_guard.png", full_page=True)
        send_telegram_photo(f"{OUT}/03_unauth_guard.png", f"Step 3: Auth guard redirect -> {page.url}")

        # Step 4: Authenticated /dashboard + CSV Import (if credentials passed)
        if email and password:
            page.goto(f"{BASE}/login", wait_until="networkidle", timeout=30000)
            page.locator('input[type="email"]').fill(email)
            page.locator('input[type="password"]').fill(password)
            page.locator('button[type="submit"]').click()
            page.wait_for_url("**/dashboard**", timeout=25000)
            page.wait_for_timeout(2000)
            page.screenshot(path=f"{OUT}/04_dashboard_csv.png", full_page=True)
            send_telegram_photo(f"{OUT}/04_dashboard_csv.png", "Step 4: Authenticated /dashboard + CSV Import")

        browser.close()


if __name__ == "__main__":
    run_e2e()
