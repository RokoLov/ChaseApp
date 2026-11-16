# CHASE

Real-world hide and seek for friends, refereed by your phone. CHASE is a PWA: a website that installs on the home screen like an app.

## Status: milestone 1 of 8

| Works now | Not built yet |
| --- | --- |
| Welcome: nickname and profile photo | Create game, Join game, Lobby (milestones 2 and 3) |
| Home, Profile, Settings | Maps and location (milestone 3) |
| Light, Dark and System appearance | Battle Royale (milestone 4) |
| Installable on the home screen | Results, stats, friends, replay (milestone 5) |
| Profile saved on the phone | Sardines, Cops & Robbers (milestones 6 and 7) |

Stats and friends are shown but stay empty until games exist.

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Open the address it prints. To try it on a phone on the same Wi-Fi, run `npm run dev -- --host` and open the "Network" address. Location and installing need HTTPS, so those are tested on the deployed site, not this way.

## Connect the backend (Supabase)

Without this step the app still runs and keeps the profile on the phone only.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **Authentication > Sign In / Providers** and turn on **Anonymous** sign-ins.
3. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from **Project Settings > API**.
5. Restart `npm run dev`. Settings then shows "Backend: Connected".

The anon key is designed to be public; the database rules in `schema.sql` are what protect the data.

## Deploy

Any static host with HTTPS works. Build command: `npm run build`. Output folder: `dist`. Add the two `VITE_SUPABASE_...` values as environment variables on the host.

## Project layout

- `src/pages` — one file per screen
- `src/components` — shared parts (buttons, avatar, photo picker)
- `src/lib` — theme, profile storage, backend connection
- `src/index.css` — the CHASE Theme colours for dark and light
- `supabase/schema.sql` — database tables and access rules
- `scripts` — icon generator and a screenshot check
