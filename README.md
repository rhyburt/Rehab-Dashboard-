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
| Status Log | **Status Log**: availability, base focus and stacking pitch add-ons. The newest entry drives the headline |
| Hip / Hamstring / Knee / Ankle-Foot / Shoulder | **Region tabs**: 6 phases × 3 live exit criteria (test · measure · operator · threshold, with Y/N override), phase status, ROM / Strength / Jump blocks with 8 renameable test slots each, injured-side LSI, latest-by-date, rehab week, and L vs R progression charts |
| GPS | **GPS**: return-to-sport criteria, pre-injury baseline, weekly totals, weekly charts, session log |
| Lists | **Settings**: the availability, focus and session-type dropdowns |

The calculations reproduce the workbook's formulas. The worked example (Players → **Load example player**) gives the same results as the spreadsheet: the same phases, LSIs, Δs, criteria, GPS weeks and status chips.

Small differences from the spreadsheet: there is no limit on how many test dates, sessions or status entries you can add. Rows can be added and deleted with buttons. Each test slot has a "bilateral" switch. Region-tab LSI colours use the dashboard's LSI target.

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
js/app.js              user interface, storage, backup/restore, charts
sw.js                  offline cache
manifest.webmanifest   install / home-screen settings
icons/                 app icons and the club crest (icons/crest.png)
source/                the original workbook and the Python script that built it
```
