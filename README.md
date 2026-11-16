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

## Backend (Supabase)

The backend is already created (project "chase", Frankfurt region) and its address and public key are in `.env`. Both values are public by design; the database rules in `supabase/schema.sql` are what protect the data.

One setting must be on in the Supabase dashboard: **Authentication > Sign In / Providers > Allow anonymous sign-ins**. Without it the app still works, and Settings shows "Profile storage: This phone only".

`supabase/schema.sql` is a copy of what has been applied to the database.

## Deploy

Any static host with HTTPS works. Build command: `npm run build`. Output folder: `dist`.

## Project layout

- `src/pages` — one file per screen
- `src/components` — shared parts (buttons, avatar, photo picker)
- `src/lib` — theme, profile storage, backend connection
- `src/index.css` — the CHASE Theme colours for dark and light
- `supabase/schema.sql` — database tables and access rules
- `scripts` — icon generator and a screenshot check
