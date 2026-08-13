# HANDOFF — Counting Apps action plan (bakery-count)

This repo and its sibling `packaging-count` (`github.com/justheuristics/packaging-count`)
are being worked through a 9-ticket action plan in order, one ticket per branch,
one PR per ticket, merged before the next starts. **Read this whole file before
starting T8 or T9** — it has the guardrails, the full ticket list, what's
already done, and what's known to depart from the original plan doc.

If you have the original plan doc (`CLAUDE_CODE_ACTION_PLAN_Counting_Apps.md`),
this file summarizes it plus everything learned while implementing T1–T7 that
the original doc got wrong or didn't anticipate — read this file's departures
section even if you have the original, since some of its stated facts are stale.

## Guardrails — apply to every ticket, not just the one you're on

1. **Both apps talk to PRODUCTION Firebase from localhost.** No emulator, no
   staging project. Set `DB_ROOT = 'demo'` (this repo: `app.js`, currently `''`)
   before any write-path testing, revert to `''` before committing. Never
   commit `DB_ROOT = 'demo'`.
2. **`data.json` is not the live item master.** `loadMasterDataFromFB()`
   overwrites `ITEMS_DATA` from Firebase `masterData/items` on every load.
   Editing `data.json` alone changes nothing live. Production
   `masterData/items` has **338 items, 0 duplicates**, exactly matching
   `master_uom.json`'s key set. Production `masterData/stores` has **164
   stores**, all genuine stores (no DC/FC/dummy patterns).
3. **Item visibility is gated by `master_uom.json`.** `ITEMS_DATA = items.filter(i => MASTER_UOM[i.code])`.
   Deliberate — do not remove.
4. **Never guess a UOM, a Class, or a price denomination.** A wrong UOM
   reproduces the June 2026 valuation incident. A wrong Class silently
   miscategorizes an item for every store. A wrong `priceUom` is the same
   failure mode as the UOM case. If unverifiable, leave blank and raise it.
5. **No partial writes.** Bulk operations validate fully and commit whole, or
   reject and commit nothing. (T6's migration is a deliberate, documented
   exception to the "whole" half of this — see below — but the *validation*
   half still holds: it never guesses, it lists what it can't resolve.)
6. **Every write path gets a log entry** with who, when, and `source`
   (`'ui'` / `'excel-import'` / `'admin-override'`). T2's saves tag
   `source:'ui'` and `outlierConfirmed:<count>`.
7. **Preserve existing behaviour when porting between bakery and packaging** —
   match the existing app's output format rather than improving it, since
   these two reports get compared side by side. (T5's export in packaging is
   the one deliberate, documented exception — it has a column bakery lacks
   because this repo tracks data bakery doesn't.)
8. **One commit per ticket, stop for review after each 🔴 P0 ticket** (T1/T2
   already were; nothing left at that priority until T8/T9 unblock).
9. **Consequential production writes (bulk migrations, anything touching
   every row of a live table) get an explicit human go-ahead before firing**,
   not just a passing test in demo mode. T6's migration was built, previewed,
   and verified against live production data in one session, then held for
   the project owner to actually trigger — see T6 below.

## Full ticket list

| # | Priority | Scope | Status |
|---|---|---|---|
| T1 | 🔴 P0 | Reject duplicate item codes at load; normalise pack fields | ✅ merged ([#3](https://github.com/justheuristics/bakery-count/pull/3)) |
| T2 | 🔴 P0 | Outlier variance guard + admin exception queue | ✅ merged ([#4](https://github.com/justheuristics/bakery-count/pull/4)) |
| T3 | 🟢 P1 | Remove plaintext password column from bakery admin UI (**bakery only**) | ✅ merged ([#5](https://github.com/justheuristics/bakery-count/pull/5)) |
| T4 | 🟢 P1 | Location type + date-effective open/closed status (**both apps**) | ✅ merged ([#6](https://github.com/justheuristics/bakery-count/pull/6)) |
| T5 | 🟢 P1 | Export store submission status to Excel (**packaging only** — bakery already had this) | N/A here — see packaging's `HANDOFF.md` |
| T6 | 🟢 P1 | Price / priceUom / priceEffectiveFrom on bakery item master (**bakery only**) | ✅ merged ([#7](https://github.com/justheuristics/bakery-count/pull/7)) — migration run against production, 338/338 items priced |
| T7 | 🟢 P1 | Align Thai calendar display (BE) across both apps | ✅ merged ([#8](https://github.com/justheuristics/bakery-count/pull/8)) |
| T8 | 🟡 P2 | Price list bulk import with preview-diff-confirm | ⛔ **blocked** on open question Q3 (price-on-master restates prior months silently) |
| T9 | 🟡 P2 | Stock-take Excel upload with validation gate | ⛔ **blocked** on open question Q4 (store-only vs. admin-on-behalf upload) |

T1–T7 are done in both repos. **Stopped here, as planned, to await Q3/Q4
decisions before T8/T9.**

## What's done

### T1 — duplicate-code validator (merged)
Load-time validator (`scanItemMasterIssues`) in `loadData()` /
`loadMasterDataFromFB()`, surfaced as a persistent admin-visible banner
(`#masterDataAlert`) + a detailed card on the item-management screen + a
"รหัสซ้ำ" chip on affected entry rows.

### T2 — outlier variance guard + admin exception queue (merged)
Two-ratio check at save time: (a) qty vs. this store's own prior month
(`totalBaseQty`, symmetric), (b) value vs. the network median for that item
this month (one-directional). Either exceeding `OUTLIER_FACTOR` (10) requires
an explicit ticked confirmation before save; never auto-rejects.
`totalBaseQty()` requires `pack_size != null` on **both** months before
computing the qty ratio — carry this guard into any new code that touches
this logic.

### T3 — remove plaintext password column (merged)
Dropped the `PASSWORD` `<th>`/`<td>` from `buildManageStoresView()`; password
stays editable via the add/edit store modals. Cosmetic mitigation only — the
underlying auth model (client-side plaintext check against `data.json`) is
unchanged and out of scope, per `CLAUDE.md`.

### T4 — location type + date-effective status (merged)
Adds `locationType`/`status`/`effectiveFrom`/`effectiveTo`/`statusNote` to
store records via `normalizeStore()`, applied on every load path.
`isCountableAt(loc, ym)` is the single source of truth for a store's
denominator membership — `status` is a display label only, the effective
date range is what's actually evaluated, so closing a store today never
rewrites a past month's completion numbers. Applied to the admin dashboard,
the store-status page, and `exportStoreStatusExcel()`. Replaces store
deletion with a status-change modal; hard delete remains available but only
when a store has zero `entries/` history in Firebase.

**Kept bakery's existing short store-record keys** (`{n, name, u, p}`)
rather than renaming to packaging's `{locNo, name, username, password}` —
flagged in the PR, not resolved. The five new lifecycle fields are the part
of the shape that's genuinely shared; the pre-existing key names differ
between the two apps for no strong reason, but renaming touches ~15 call
sites (`initLogin()`, every store lookup) for no user-visible gain. Revisit
if BOM inheriting this shape ever needs the literal key names to match.

### T6 — price / priceUom / priceEffectiveFrom on item master (merged)
Three fields on `masterData/items`: `price`, `priceUom` (dropdown
constrained to that item's own `master_uom.json` `packtype`/`sub_uom`,
never free text), `priceEffectiveFrom`. `fmtPrice()` renders
`฿1,234.00 / ถุง` everywhere a price shows — UOM always adjacent, never a
bare figure. `estCostOf()` now prefers the item-master price over
`master_cost.json` (kept as read-only fallback), and correctly handles
either denomination (packtype or sub_uom) rather than assuming packtype
like the old cost_vat-only formula did.

**Migration run**: `showMasterCostMigrationModal()` previews before writing,
never overwrites an existing price, single atomic write. Triggered against
production on 2026-08-13 — confirmed via direct Firebase read afterward:
**338/338 items priced, 0 unresolved**, exactly matching the pre-migration
preview. This was deliberately held back from the PR itself (a session
shouldn't autonomously fire a bulk write touching every row of a production
table) and run separately once reviewed.

### T7 — Thai Buddhist-era calendar (merged)
Bakery's `ymToThai()`/`ymToFull()` were already BE; `formatThaiDT()` wasn't,
so `exportStoreStatusExcel()`'s "บันทึกล่าสุด" column mixed a BE month
heading with a CE timestamp in the same file. Fixed to match. (Packaging's
half — `thaiMonthLabel`/`thaiDate`/`fmtDateTime` — is in that repo's PR;
both apps now render the same month as the same year.)

## Departures from the original plan doc

These were verified against actual code/data while implementing T1–T7:

1. **T4 needed a real build in bakery, less rework in packaging** — as
   predicted. Bakery's 164 production stores are all genuine stores, so T4
   here was purely the lifecycle-status + `isCountableAt` build, no
   classification problem. Packaging carried the harder classification half
   (208 locations, DC/FC/dummy/virtual/frozen) — see that repo's `HANDOFF.md`.
2. **T6 was fully resolvable, not partially blocked** — confirmed exactly:
   the migration produced **zero** `price: null` rows against live
   production data, matching the departure noted before T6 started.
3. Bakery's `master_uom.json` `packtype` values include some that aren't in
   `UOM_LIST` (`app.js`) — `ห่อ`, `กระปุก`, `แผง`, `ก้อน`, `ขวด`, `ถัง`, and two
   likely typos `ถง` / `แพค`. Not a blocker for T6 (its dropdown sources from
   `master_uom` directly) — reported here, not silently fixed, per guardrail 4.

## Before starting T8 or T9

1. **Both are blocked** — do not start either without Q3/Q4 answered by the
   project owner + Buyer/Tech Lead as applicable. This isn't a technical
   blocker, it's a product decision:
   - **Q3** (gates T8): if price lives only on the item master, does
     uploading a new price list silently restate the reported value of every
     prior month? T6 already put `price`/`priceUom`/`priceEffectiveFrom` on
     the master — T8's price-import tool needs to decide whether historical
     `recordAmount()`/`estCostOf()` calls should snapshot the price at
     count-time instead of always reading the current master value, which is
     the crux of Q3.
   - **Q4** (gates T9): store-only upload vs. admin-on-behalf upload, and
     whether `submittedBy` needs to record which case applied.
2. Once unblocked: `git checkout -b ticket-8-price-import main` (or
   `ticket-9-...`), confirm `git log origin/main` shows T1–T7 merged first.
3. Delete this section (and update the ticket table above) once T8/T9 are
   answered and started, so this file stays a living resume point. Don't
   delete the guardrails/departures sections — they stay relevant.
