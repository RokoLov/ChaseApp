# CHASE

Real-world hide and seek for friends, refereed by your phone. CHASE is a PWA: a website that installs on the home screen like an app.

## Status: milestone 4 of 8

| Works now | Not built yet |
| --- | --- |
| Welcome, Home, Profile, Settings; Light, Dark and System appearance | Full results, stats, friends, replay (milestone 5) |
| Create a game: mode, play area on a map, rules | Sardines, Cops & Robbers (milestones 6 and 7) |
| Join by code, invite link or QR code; live lobby | Pause for everyone and the emergency alert |
| Start: safety checklist, hunters picked at random or by the host | |
| Battle Royale: role reveal, shared timer, shrinking zone, alerts | |
| Out-of-zone warning, then the hider becomes a hunter | |
| Catches by QR scan or typed 4-digit code | |
| Hunters see each other, and hiders for 20 seconds after each shrink | |
| Pocket mode, alert sounds, screen kept awake | |
| Game end with winner, and Play again | |

Stats and friends on the Profile screen stay empty until milestone 5.

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
- `src/lib` — theme, profile storage, backend connection, map maths, location
- `src/index.css` — the CHASE Theme colours for dark and light
- `supabase/schema.sql` — database tables and access rules
- `scripts` — icon generator and two screenshot checks (they replace the backend with a pretend one)
