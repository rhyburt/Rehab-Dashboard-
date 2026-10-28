# Rehab Dashboard

A browser app version of **Rehab_Testing_Dashboard_LUFC_v5_TickBox.xlsx**: rehabilitation testing, live exit criteria, LSI, GPS pitch load and availability/status for each player. It runs in any modern browser (iPad, iPhone, Android, laptop), installs to the home screen like an app, and works offline once it has loaded.

## Private by design

- **Player data never leaves the device.** Everything you type is saved in that browser's local storage. There is no server, no account, no analytics and no third-party code or fonts. The page's Content Security Policy blocks it from contacting anything else.
- The hosted site contains only the app code. Anyone who opens the link gets an empty app, and each device only sees its own data.
- The page asks search engines not to index it (`noindex`).
- **Back up regularly.** Clearing browser data, or uninstalling the home-screen app, deletes the data. Use **Players → Back up all players** to download a `.json` backup, and **Restore from backup** to load it again or move players to another device. **Export** on a player's page saves just that player.

## What's in it (same structure as the workbook)

| Workbook tab | App |
|---|---|
| Dashboard | **Dashboard**: player and injury details, maturity, current status, pitch-exposure chips, stage history, region ticks, what's open, latest tests with LSI and Δ, GPS summary, LSI progression charts, all regions at a glance |
| (new) | **Athlete Profile**: dated log of height, sitting height, body mass, predicted adult height and maturity offset; % PAH, maturity status, leg length and growth rate are calculated, with growth charts. The latest values fill the Dashboard |
| (new) | **Wellness**: 0–10 NRS symptom log (pain at rest, during activity, next morning) with a trend chart; the latest scores and changes show in a Symptoms card on the Dashboard |
| Status Log | **Status Log**: availability, base focus and stacking pitch add-ons. The newest entry drives the headline |
| Hip / Hamstring / Knee / Ankle-Foot / Shoulder | **Region tabs**: 6 phases × 3 live exit criteria (test · measure · operator · threshold, with Y/N override), phase status, ROM / Strength / Jump blocks with 8 renameable test slots each, injured-side LSI, latest-by-date, rehab week, and L vs R progression charts |
| GPS | **GPS**: return-to-sport criteria, pre-injury baseline, weekly totals, weekly charts, session log. Sessions can be marked **Alter-G** (with % body weight): they plot as dashed lines and are kept out of the on-pitch % baseline, criteria and chips |
| Lists | **Settings**: the availability, focus and session-type dropdowns |

The calculations reproduce the workbook's formulas. The worked example (Players → **Load example player**) gives the same results as the spreadsheet: the same phases, LSIs, Δs, criteria, GPS weeks and status chips.

Small differences from the spreadsheet: there is no limit on how many test dates, sessions or status entries you can add. Rows can be added and deleted with buttons. Each test slot has a "bilateral" switch. Region-tab LSI colours use the dashboard's LSI target.

## Performance testing (Athlete Profile)

At the bottom of the Athlete Profile tab you can log performance tests such as Hawkin CMJ (jump height, mRSI, relative peak power) and isometrics (squat, hip adduction and abduction, ankle). Rename the ten metric slots under **Edit metrics**. Each metric is compared with its **pre-injury value**, which you can type in or leave blank to use the last test dated before the injury. You get a summary table (latest, % of pre-injury, change, best since injury) plus charts. **Import CSV (Hawkin)** reads Hawkin exports: one row per trial (best or average per day), the Test Type / Tags column to tell the isometrics apart, and jump height in metres converted to cm.

## Pain scores on tests

In any test block, **Edit tests → Record pain (NRS)** adds a 0–10 symptom-response column to that test only. Scores are colour-coded (0–2 green, 3–5 amber, 6+ red), and the latest one appears as a small badge in the Dashboard's latest-tests list.

## Archiving players

When a player has returned to play, use **Archive** on their card (or **Archive player** at the bottom of their Dashboard). Archived players drop out of the main list but keep all their data. **Show archived players** lists them, and **Restore** puts them back, e.g. after a re-injury.

## Importing from CSV

- **GPS tab → Import CSV:** session exports from Catapult, STATSports and similar. The app finds the header row and matches columns such as date, player, total distance, HSR, sprint distance, accelerations, decelerations and max speed. It filters a squad export to this player, converts km/h to m/s, can combine one-row-per-drill exports into one session per day, can mark the rows as Alter-G, and skips sessions that are already logged.
- **Region tab → each test block → Import CSV:** force-plate or testing-software exports. Columns are matched to the block's tests by name, with left and right read from headings such as "Left", "L" or "Right". A date that's already in the table fills in that row instead of adding a duplicate.

Paste the data (straight from Excel works too) or choose a .csv file. The file is read on the device and never uploaded. Check the column matches and the preview before importing.

## Hosting on GitHub Pages

1. In the repository go to **Settings → Pages**.
2. Under **Build and deployment** choose **Source: Deploy from a branch**, pick the branch that holds these files (e.g. `main`) and the **/ (root)** folder, then **Save**.
3. After a minute or two the app is live at `https://rhyburt.github.io/Rehab-Dashboard-/`.

GitHub Pages for a **private** repository needs a paid GitHub plan (Pro, Team or Enterprise). On a free account, make the repository public as your SCAT apps are. It holds only the app code and the example spreadsheet, never any player data. Even when built from a private repository, a Pages site can be opened by anyone who has the link (except on GitHub Enterprise Cloud with private Pages). Privacy comes from keeping all data on the device.

### Install on a phone or tablet
- **iPhone / iPad (Safari):** open the link → Share → **Add to Home Screen**.
- **Android / Chrome / Edge:** open the link → menu → **Install app** (or *Add to Home screen*).

### Releasing changes
The app is cached for offline use. After changing any file, bump `CACHE` in `sw.js` (e.g. `rehabdash-v2`) so installed copies fetch the new version. They update on the next launch after that.

## Files

```
index.html             page shell
css/app.css            styles (Leeds United branding; cream = input, pale blue = calculated)
js/calc.js             data model + all calculations (no DOM; mirrors the workbook formulas)
js/csv.js              CSV parsing and column matching for imports
js/app.js              user interface, storage, backup/restore, charts
sw.js                  offline cache
manifest.webmanifest   install / home-screen settings
icons/                 app icons
source/                the original workbook and the Python script that built it
```
