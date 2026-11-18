# CHASE decision log

Settled decisions, so they are not reopened. Newest at the bottom.

1. Build as a PWA; no native app for now
2. A catch is confirmed by scanning or typing the caught player's code; GPS handles only boundaries, zones and the jail
3. No accounts/login: nickname and avatar, join by link or code
4. Location uses periodic check-ins plus pocket mode, not background tracking
5. Pocket mode strict by default (most players use iPhone)
6. Battle Royale: 1–2 hunters at start; caught players become hunters
7. Battle Royale is built first
8. Then Sardines, then Cops & Robbers
9. Achievements, power-ups and a Competitive preset wait for later
10. Friends list and player stats are in the MVP
11. Replay map is in the MVP
12. Hider outside the zone gets a notification and a grace period, then becomes a hunter
13. Defaults tuned for 5–10 players (1 hunter for up to 7 players, 2 for 8–10)
14. Profile saved on the phone, no login; optional email backup later
15. Profile photo upload (stored online), default avatar as fallback
16. Friends added from the results screen; invites go through the phone's share menu; no in-app notifications
17. Alerts on iPhone are sound only (iPhone browsers cannot vibrate); vibration on Android
18. Battle Royale hunters picked at random or chosen by the host
19. Catching: QR scan first, 4-digit code as fallback
20. Hiders can see how many hunters there are
21. A catchable player's code is always visible on their game screen
22. Pocket mode turns on only when the player taps its button
23. Visual identity: lime action colour, one colour per mode (Battle Royale `#FF5A3C`, Sardines `#35D0FF`, Cops & Robbers `#8B7CFF`), fonts Space Grotesk + Inter
24. Settings has Appearance: System (default), Light, Dark. Pocket mode is always black

## Milestone 5 (17 Nov 2026)

25. A win goes to the surviving hiders. When every hider is caught, the win goes to the players who **started** as hunters
26. Adding a friend is one-sided, like saving a contact (no requests to accept)
27. Replay routes are kept for 24 hours after a game, and deleted sooner once everyone has left the lobby
28. "Time survived" counts from the start of the game

## After the first indoor test (17 Nov 2026)

29. Polygon corners can be tapped in any order; CHASE joins them so the edges never cross
30. Hide time ends early once every hider taps "I'm hidden". Hunters still cannot catch during hide time, so no one can be caught before they have had the chance to hide
31. During a game the map opens fullscreen, with the timer, role, alerts, counts and the main action in a panel at the bottom

## Milestone 6: Sardines (18 Nov 2026)

32. The Battle Royale zone shrinks toward a random spot anywhere in the play area (edges included), the same on every phone
33. Settings shows the version and milestone (version 0.N = milestone N), updated with every milestone
34. Sardines: the hider taps "I'm hidden" to start the search early, like in Battle Royale
35. Sardines: a seeker joins by scanning the hider's code or the code of anyone already in the group
36. Sardines: seekers get a hint circle that always contains the hider, placed at random around them and shrinking at set times; the hider's phone warns them if they move more than 20 m from their spot
37. Sardines winners: when everyone finds the group, all but the last finder win (with a single seeker, finding the hider wins); when time runs out, the hider and everyone who found them win; if the hider leaves, the game ends with no winner
