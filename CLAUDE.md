# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A Thai-language stock-count web app for CP Axtra's bakery ingredient/packaging trading report ("Trading Report · BAKERY GRP.68,78"). Store staff log in and enter monthly item quantities; admins manage the item master and review store submissions. It is a **static, no-build vanilla JS site** — there is no `package.json`, no bundler, no test suite, and no linter. All logic lives in one file, `app.js` (~2200+ lines).

## Commands

There is nothing to install or build. To develop:

- **Run locally**: serve the directory over HTTP (not `file://` — `app.js` uses `fetch()` to load `data.json`/`master_uom.json`/etc., which browsers block under the `file://` scheme). From this directory:
  ```
  python -m http.server 8000
  ```
  then open `http://localhost:8000`.
- **No lint/test/build commands exist.** Verify changes by exercising the UI directly in a browser (see "Testing changes" below).
- **Seeding demo data**: `seedDemoData()` (in `seed.js`, loaded after `app.js`) writes fixture data for two months into `entries/`. It **refuses to run unless `DB_ROOT === 'demo'`** (see below) — it will not touch production data.

## Architecture

### Files

| File | Role |
|---|---|
| `index.html` | Markup shell + login/app screens; loads Firebase SDK, `firebase.js`, `app.js`, `seed.js`, in that order, plus `xlsx.js` (CDN) for Excel export/import |
| `app.js` | All application logic — data loading, rendering, entry/save flow, admin screens |
| `firebase.js` | Firebase project config + `LOGO_URI` constant |
| `data.json` | Bundled item master (`items`) and store/admin login list (`stores`, `admin`) — **see "Two sources of truth" below, this is often stale relative to production** |
| `master_uom.json` | Per-item reference: `{ name_fbk3, packtype, pack_size, sub_uom }`, keyed by item code |
| `master_cost.json` | Per-item indicative cost reference — display-only, never written back anywhere |
| `store_reference_band.json` | Per-store cost min/avg/max band, used only to draw a gauge on the dashboard |
| `seed.js` | Demo fixture writer, gated to `DB_ROOT==='demo'` |

### Two sources of truth for the item master — read this before touching items

`loadData()` loads `ITEMS_DATA` from `data.json` first. Immediately after, `loadMasterDataFromFB()` runs and **overwrites `ITEMS_DATA` with Firebase's `masterData/items` node if it exists.** In this project's production Firebase, that node already exists and has drifted well beyond `data.json` (491 items vs. 330 in the repo, last checked) because admins have been adding items directly through the in-app "➕ เพิ่มรายการสินค้าใหม่" screen (`showAddItemModal`/`doAddItem`/`saveMasterItems`, ~app.js:2106-2230), which writes straight to Firebase and never touches `data.json`.

**Practical consequence**: editing `data.json` alone does not add an item to the live app. `data.json` only matters as the fallback used if Firebase's `masterData/items` is ever empty. To make a new item actually appear live, it must go into Firebase's `masterData/items` — either through the admin "Add Item" UI, or an equivalent write to that node.

`master_uom.json`, `master_cost.json`, and `store_reference_band.json` are **not** Firebase-backed — they're plain static fetches, so editing those files and deploying takes effect immediately for everyone, independent of the Firebase item-master state.

### Item visibility is gated by `master_uom.json`

`loadData()` filters the item list:
```js
ITEMS_DATA = (json.items || []).filter(i => MASTER_UOM[i.code]);
```
(same filter is reapplied in `loadMasterDataFromFB()` for the Firebase-sourced list). This is a **deliberate design decision** (see the comment above it in `app.js`), not a bug: every countable item is guaranteed to have a UOM/pack_size reference, so หน่วยนับ/ขนาดบรรจุ can always be locked to the master value. The consequence: **adding an item to the item master alone is not enough — it also needs a `master_uom.json` entry, or it will silently never appear on the count screen.**

### Class taxonomy: two incompatible numbering schemes exist in the wild

The app's real `class` field (used by the Class filter and stored on every item) comes from the FBK3/Inhouse ingredient extracts' "Class" column (e.g. `68`, `78`, `306`, `732`, `829`...). Various other spreadsheets (e.g. cost-tracking sheets) carry a **different** "Subclass" column with small numbers (`10`–`48`) that look similar but are a completely unrelated taxonomy — e.g. Subclass `30` = "Bread Sweet bun" while the app's actual Class `30` = "FRESH EGGS". **Never copy a "Subclass" value into `class` directly.** When the correct Class can't be verified (e.g. by cross-referencing the item's category text against known Class↔SubClassText pairs elsewhere in the FBK3/Inhouse data), leave the item out and ask rather than guess — a wrong Class silently miscategorizes the item for every store.

### Adding new items — checklist

Given both gotchas above, adding an item that actually shows up and counts correctly requires:
1. A verified `class` from the real taxonomy (not a "Subclass" from an incompatible sheet).
2. An entry in Firebase's `masterData/items` (via the admin UI, not just `data.json`) for it to appear live at all.
3. A `master_uom.json` entry (`packtype`, `pack_size`, `sub_uom`) for it to actually render on the count screen instead of being filtered out.
4. If also updating `data.json` for repo hygiene, keep `no` sequential and unique, and keep the diff minimal — don't reformat unrelated entries.

### Entry data model & backward compatibility

Entries live in Firebase at `entries/{storeNo}/{YYYY-MM}/{itemCode}`. Current shape:
```js
{ qty, uom, pack_size, subunit_qty, sub_uom, counted_at }
```
Older data may be a bare number/string. `normalizeEntry(v)` (app.js) is the single place every read goes through; it marks legacy bare values `{ legacy: true, uom: null, ... }` and **must never coerce a legacy value into a guessed UOM** — legacy rows render a `หน่วยไม่ระบุ` warning chip instead.

### Month-over-month flag logic

On load, each item's current entry is compared to the previous month's (also via `normalizeEntry`). Exactly one flag is shown per row, first match wins: **A** UOM changed (no % shown — a cross-unit delta is meaningless), **B** pack size mismatch vs. master (informational), **C** quantity variance >30% (`VARIANCE_THRESHOLD`, hardcoded), **D** new item, **E** missing UOM (blocks save). Flags A and E require ticking a confirmation checkbox in a modal before `saveEntry()` will write.

### `DB_ROOT` — demo vs. production

`const DB_ROOT` in `app.js` prefixes every Firebase path (`dbGet`/`dbSet`/`dbUpdate`/`dbRemove`/`dbPush`). Currently `''` = production — every read/write hits real store data. `seedDemoData()` refuses to run unless this is `'demo'`, specifically to prevent a seed script from overwriting live entries. If you ever need a sandbox, this is the mechanism, not a separate Firebase project.

### Auth model

Login (`initLogin()`, app.js:357) checks the submitted username/password against `ADMIN` and `STORES` from `data.json` **in plaintext, entirely client-side** — there is no Firebase Auth, no hashing, no server-side check. Anyone who can fetch `data.json` (i.e. anyone) can read every store's and the admin's credentials. This is a known, long-standing limitation, not something introduced by any recent change — be aware of it but treat changing the auth model as out of scope unless specifically asked.

### Testing changes

There's no automated test suite. To validate a change: serve the directory locally (see Commands), and either log in as a store (credentials are in `data.json`'s `stores` array) to exercise the count screen, or as admin (`data.json`'s `admin` object) to exercise the item-master/settings screens. Because of the Firebase override behavior above, a local static server still talks to the **real production Firebase** (`firebase.js` has live credentials) — so `ITEMS_DATA` will reflect production's `masterData/items`, and any write action (save entry, add item, etc.) will hit real production data. There is no local/offline Firebase emulator configured in this project.
