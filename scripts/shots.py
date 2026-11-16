"""Open the built app in a phone-sized browser and save screenshots of each screen."""
import sys
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for scheme in ("dark", "light"):
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, color_scheme=scheme)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base, wait_until="networkidle")
        page.wait_for_timeout(500)
        page.screenshot(path=f"{out}/{scheme}-1-welcome.png")
        page.fill("input[aria-label=Nickname]", "Roko")
        page.click("text=Continue")
        page.wait_for_url(base + "/")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{out}/{scheme}-2-home.png")
        page.click("a[aria-label=Profile]")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{out}/{scheme}-3-profile.png")
        page.click("text=Settings")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{out}/{scheme}-4-settings.png")
        if scheme == "dark":
            page.click("text=Light")
            page.wait_for_timeout(200)
            print("theme after tapping Light:", page.evaluate("document.documentElement.dataset.theme"))
            page.click("text=System")
        page.goto(base + "/join", wait_until="networkidle")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{out}/{scheme}-5-join.png")
        print(scheme, "errors:", errors)
        ctx.close()
    browser.close()
