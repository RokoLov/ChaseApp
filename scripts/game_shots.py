"""Screenshot check for a Battle Royale game.

Walks one phone through starting a game, hiding, leaving the zone, pocket mode,
hunting, catching and the end screen. The backend is replaced by a small pretend
one in this file, so this checks the screens and the app's own logic (timers,
zones, alerts), not the real database. The database rules are tested separately.

Usage: python3 scripts/game_shots.py http://localhost:4173 /tmp/shots
"""
import base64
import json
import sys
import time
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
ME = "11111111-1111-4111-8111-111111111111"
ANA = "33333333-3333-4333-8333-333333333333"
MARKO = "44444444-4444-4444-8444-444444444444"
GAME = "22222222-2222-4222-8222-222222222222"
CENTER = (45.8131, 15.9779)  # latitude, longitude
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
STYLE = {"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#8fa3ad"}}]}
RULES = {"gameMin": 25, "hideMin": 3, "hunters": 0, "zoneStages": 4, "revealOnShrink": True, "graceSec": 60}

# The pretend backend's memory.
world = {"status": "lobby", "started": None, "roles": {}, "winners": [], "end_reason": None, "events": [], "calls": []}


def north(metres):
    return {"latitude": CENTER[0] + metres / 111320, "longitude": CENTER[1]}


def iso(t):
    return t.isoformat().replace("+00:00", "Z")


def now():
    return datetime.now(timezone.utc)


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def fake_session():
    exp = int(time.time()) + 3600
    token = f'{b64({"alg": "HS256", "typ": "JWT"})}.{b64({"sub": ME, "role": "authenticated", "exp": exp})}.sig'
    user = {"id": ME, "aud": "authenticated", "role": "authenticated", "is_anonymous": True,
            "app_metadata": {}, "user_metadata": {}, "created_at": "2026-11-16T00:00:00Z"}
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600, "expires_at": exp,
            "refresh_token": "r", "user": user}


def player_rows():
    names = {ME: "Roko", ANA: "Ana", MARKO: "Marko"}
    rows = []
    for pid, name in names.items():
        role = world["roles"].get(pid)
        rows.append({
            "player_id": pid, "ready": True, "role": role,
            "hunter_since": iso(now()) if role == "hunter" else None,
            "hunter_reason": world.get("reasons", {}).get(pid, "start") if role == "hunter" else None,
            "caught_by": world.get("caught_by", {}).get(pid), "catches": world.get("catches", {}).get(pid, 0),
            "players": {"nickname": name, "photo_url": None},
        })
    return rows


def backend(route):
    req = route.request
    url = req.url

    def reply(body, status=200):
        route.fulfill(status=status, headers={**CORS, "content-type": "application/json"}, body=json.dumps(body))

    if req.method == "OPTIONS":
        return route.fulfill(status=204, headers=CORS)
    if "/auth/v1/signup" in url:
        return reply(fake_session())
    if "/rest/v1/rpc/" in url:
        name = url.split("/rpc/")[1].split("?")[0]
        args = json.loads(req.post_data or "{}")
        if name != "report_position":
            world["calls"].append(name)
        if name == "join_game":
            return reply("K7P2QX")
        if name == "server_now":
            return reply(iso(now()))
        if name == "start_game":
            assert args["p_hunters"] == [ANA], args
            world.update(status="running", started=now(), roles={ME: "hider", ANA: "hunter", MARKO: "hider"})
            return route.fulfill(status=204, headers=CORS)
        if name == "catch_player":
            if args["p_code"] != "4729":
                return reply({"code": "P0001", "message": "WRONG_CODE"}, 400)
            world["roles"][MARKO] = "hunter"
            world.setdefault("reasons", {})[MARKO] = "caught"
            world.setdefault("caught_by", {})[MARKO] = ME
            world.setdefault("catches", {})[ME] = 1
            return reply(MARKO)
        if name == "get_reveal":
            return reply([{"player_id": MARKO, "lat": CENTER[0] + 0.0004, "lng": CENTER[1] - 0.0006}])
        if name == "zone_out":
            world["roles"][ME] = "hunter"
            world.setdefault("reasons", {})[ME] = "zone"
        return route.fulfill(status=204, headers=CORS)
    if "/rest/v1/games" in url:
        game = {"id": GAME, "code": "K7P2QX", "host_id": ME, "mode": "battle_royale", "status": world["status"],
                "preset": "classic", "settings": RULES,
                "area": {"type": "circle", "center": [CENTER[1], CENTER[0]], "radiusM": 160},
                "started_at": iso(world["started"]) if world["started"] else None, "ended_at": None,
                "winners": world["winners"], "end_reason": world["end_reason"]}
        return reply(game if "pgrst.object" in req.headers.get("accept", "") else [game])
    if "/rest/v1/game_players" in url:
        return reply(player_rows())
    if "/rest/v1/catch_codes" in url:
        return reply({"code": "4729"} if "pgrst.object" in req.headers.get("accept", "") else [{"code": "4729"}])
    if "/rest/v1/events" in url:
        return reply(world["events"])
    if "/rest/v1/positions" in url:
        return reply([{"player_id": ANA, "lat": CENTER[0] - 0.0005, "lng": CENTER[1] + 0.0004}])
    if "/rest/v1/players" in url:
        return reply([], 201)
    return route.abort()


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/google-chrome",
        args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
              "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    )
    for scheme in ("dark", "light"):
        world.update(status="lobby", started=None, roles={}, winners=[], end_reason=None, events=[], calls=[],
                     reasons={}, caught_by={}, catches={})
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme=scheme,
                                  permissions=["geolocation", "camera"], geolocation=north(20))
        ctx.route("**/*.supabase.co/**", backend)
        ctx.route("**/tiles.openfreemap.org/**", lambda r: r.fulfill(
            status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(STYLE)))
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        def shot(name):
            page.wait_for_timeout(700)
            page.screenshot(path=f"{out}/{scheme}-{name}.png")

        def enter():
            page.wait_for_selector("text=You are a")
            page.click("text=I’m ready to play")

        # 1. The host starts the game from the lobby.
        page.goto(base + "/lobby/K7P2QX", wait_until="load")
        page.fill("input[aria-label=Nickname]", "Roko")
        page.click("text=Continue")
        page.wait_for_selector("text=Everyone is ready.")
        page.click("button:has-text('Start game')")
        for box in page.locator("input[type=checkbox]").all():
            box.check()
        page.click("text=I choose")
        page.click("li button:has-text('Ana')")
        shot("g1-start-sheet")
        page.locator("button:has-text('Start game')").last.click()

        # 2. Role reveal, then the game screen during hide time.
        page.wait_for_url(base + "/game/K7P2QX")
        page.wait_for_selector("text=You are a")
        shot("g2-role-reveal")
        page.click("text=I’m ready to play")
        page.wait_for_selector("text=Go and hide inside the play area")
        page.wait_for_selector("text=4729")
        shot("g3-hider-hide-time")

        # 3. Twelve minutes in: the zone has shrunk twice and this hider is outside it.
        world["started"] = now() - timedelta(minutes=12)
        ctx.set_geolocation(north(130))
        page.goto(base + "/game/K7P2QX", wait_until="load")
        enter()
        page.wait_for_selector("text=Outside the zone!")
        shot("g4-hider-outside-zone")
        page.click("button[aria-label='Open the full map']")
        page.wait_for_selector("text=Zone 2 of 4")
        shot("g5-full-map")
        page.click("button[aria-label='Close the full map']")
        page.click("text=My code")
        page.wait_for_selector("text=Show this to the hunter")
        shot("g6-my-code")
        page.click("button[aria-label=Close]")
        page.click("text=Pocket mode")
        page.wait_for_selector("text=Hold to unlock")
        shot("g7-pocket-mode")
        ring = page.locator("button[aria-label='Hold to unlock']").bounding_box()
        page.mouse.move(ring["x"] + 40, ring["y"] + 40)
        page.mouse.down()
        page.wait_for_timeout(1500)
        page.mouse.up()
        page.wait_for_selector("text=Pocket mode >> nth=0")
        assert page.locator("text=Hold to unlock").count() == 0, "holding the ring must unlock pocket mode"

        # 4. As a hunter, just after the first shrink: hiders are revealed, then a catch.
        world.update(started=now() - timedelta(minutes=7, seconds=27), roles={ME: "hunter", ANA: "hunter", MARKO: "hider"})
        ctx.set_geolocation(north(20))
        page.goto(base + "/game/K7P2QX", wait_until="load")
        enter()
        page.wait_for_selector("text=Find the hiders and enter their codes")
        page.wait_for_timeout(5000)
        shot("g8-hunter-reveal")
        assert "get_reveal" in world["calls"], "a hunter must ask the backend for the reveal"
        page.click("text=Catch a hider")
        page.fill("input[aria-label=\"Hider's code\"]", "1111")
        page.click("text=Confirm catch")
        page.wait_for_selector("text=That code does not belong to a hider")
        shot("g9-catch-wrong-code")
        page.fill("input[aria-label=\"Hider's code\"]", "4729")
        page.wait_for_timeout(1600)
        page.click("text=Confirm catch")
        page.wait_for_selector("text=You caught Marko!")
        shot("g10-hunter-after-catch")

        # 5. The game ends.
        world.update(status="ended", winners=[], end_reason="all_caught")
        page.wait_for_selector("text=Game over")
        shot("g11-ended")

        print(scheme, "page errors:", errors, "| backend calls:", sorted(set(world["calls"])))
        ctx.close()
    browser.close()
