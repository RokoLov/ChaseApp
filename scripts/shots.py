"""Screenshot check for the built app.

Opens the app in a phone-sized browser and walks through the screens. The backend is
replaced by canned replies, so this checks the screens and the app's own logic,
not the real database or live updates.

Usage: python3 scripts/shots.py http://localhost:4173 /tmp/shots
"""
import base64
import json
import sys
import time

from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
UID = "11111111-1111-4111-8111-111111111111"
GAME = "22222222-2222-4222-8222-222222222222"
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def fake_session():
    exp = int(time.time()) + 3600
    token = f'{b64({"alg": "HS256", "typ": "JWT"})}.{b64({"sub": UID, "role": "authenticated", "exp": exp})}.sig'
    user = {"id": UID, "aud": "authenticated", "role": "authenticated", "is_anonymous": True,
            "app_metadata": {}, "user_metadata": {}, "created_at": "2026-11-16T00:00:00Z"}
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600, "expires_at": exp,
            "refresh_token": "r", "user": user}


state = {"ready": False}


def backend(route):
    req = route.request
    url = req.url

    def reply(body, status=200):
        route.fulfill(status=status, headers={**CORS, "content-type": "application/json"}, body=json.dumps(body))

    if req.method == "OPTIONS":
        return route.fulfill(status=204, headers=CORS)
    if "/auth/v1/signup" in url:
        return reply(fake_session())
    if "/rest/v1/rpc/create_game" in url or "/rest/v1/rpc/join_game" in url:
        if "ZZZZZZ" in (req.post_data or ""):
            return reply({"code": "P0001", "message": "GAME_NOT_FOUND"}, 400)
        return reply("K7P2QX")
    if "/rest/v1/rpc/set_ready" in url:
        state["ready"] = json.loads(req.post_data)["p_ready"]
        return route.fulfill(status=204, headers=CORS)
    if "/rest/v1/games" in url:
        game = {"id": GAME, "code": "K7P2QX", "host_id": UID, "mode": "battle_royale", "status": "lobby",
                "preset": "classic", "settings": {"gameMin": 25, "hideMin": 3, "hunters": 0, "zoneStages": 4,
                                                  "revealOnShrink": True, "graceSec": 60}}
        return reply(game if "pgrst.object" in req.headers.get("accept", "") else [game])
    if "/rest/v1/game_players" in url:
        return reply([
            {"player_id": UID, "ready": state["ready"], "players": {"nickname": "Roko", "photo_url": None}},
            {"player_id": "33333333-3333-4333-8333-333333333333", "ready": True, "players": {"nickname": "Ana", "photo_url": None}},
            {"player_id": "44444444-4444-4444-8444-444444444444", "ready": False, "players": {"nickname": "Marko", "photo_url": None}},
        ])
    if "/rest/v1/players" in url:
        return reply([], 201)
    return route.abort()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for scheme in ("dark", "light"):
        state["ready"] = False
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme=scheme)
        ctx.route("**/*.supabase.co/**", backend)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        def shot(name):
            page.wait_for_timeout(350)
            page.screenshot(path=f"{out}/{scheme}-{name}.png")

        # A new player opens an invite link: Welcome first, then straight into the lobby.
        page.goto(base + "/join/k7p2qx", wait_until="networkidle")
        shot("1-welcome")
        page.fill("input[aria-label=Nickname]", "Roko")
        page.click("text=Continue")
        page.wait_for_url(base + "/lobby/K7P2QX")
        page.wait_for_selector("text=Players 3 / 10")
        shot("2-lobby")
        page.click("text=I’m ready")
        page.wait_for_selector("text=I’m not ready")
        page.click("button:has-text('QR')")
        shot("3-lobby-ready-qr")

        page.goto(base + "/", wait_until="networkidle")
        shot("4-home")
        page.click("text=Create game")
        shot("5-create-mode")
        page.click("text=Next")
        page.click("button:has-text('custom')")
        page.click("button[aria-label='More: Game length']")
        shot("6-create-rules-custom")
        page.click("text=Create lobby")
        page.wait_for_url(base + "/lobby/K7P2QX")

        page.goto(base + "/join", wait_until="networkidle")
        page.fill("input[aria-label='Game code']", "zzzzzz")
        page.click("button:has-text('Join')")
        page.wait_for_selector("[role=alert]")
        shot("7-join-wrong-code")

        print(scheme, "page errors:", errors)
        ctx.close()
    browser.close()
