# HANDOFF — Counting Apps action plan (bakery-count)

This repo and its sibling `packaging-count` (`github.com/justheuristics/packaging-count`)
are being worked through a 9-ticket action plan in order, one ticket per branch,
one PR per ticket, merged before the next starts. **Read this whole file before
starting T3 or any later ticket** — it has the guardrails, the full ticket list,
what's already done, and what's known to depart from the original plan doc.

If you have the original plan doc (`CLAUDE_CODE_ACTION_PLAN_Counting_Apps.md`),
this file summarizes it plus everything learned while implementing T1/T2 that
the original doc got wrong or didn't anticipate — read this file's departures
section even if you have the original, since some of its stated facts are stale.

## Guardrails — apply to every ticket, not just the one you're on

1. **Both apps talk to PRODUCTION Firebase from localhost.** No emulator, no
   staging project. Set `DB_ROOT = 'demo'` (this repo: `app.js`, currently `''`)
   before any write-path testing, revert to `''` before committing. Never
   commit `DB_ROOT = 'demo'`.
2. **`data.json` is not the live item master.** `loadMasterDataFromFB()`
   overwrites `ITEMS_DATA` from Firebase `masterData/items` on every load.
   Editing `data.json` alone changes nothing live. As of the T1 snapshot,
   production `masterData/items` has **338 items, 0 duplicates**, exactly
   matching `master_uom.json`'s key set — cleaner than `data.json` (366 items,
   111 codes not in the live master). Production `masterData/stores` has
   **164 stores**, all genuine stores (no DC/FC/dummy patterns) — this
   matches the original doc's "164 locations" claim, which is about live
   Firebase, not `data.json` (185 stores) or any local file.
3. **Item visibility is gated by `master_uom.json`.** `ITEMS_DATA = items.filter(i => MASTER_UOM[i.code])`.
   Deliberate — do not remove.
4. **Never guess a UOM or a Class.** A wrong UOM reproduces the June 2026
   valuation incident. A wrong Class silently miscategorizes an item for
   every store. If unverifiable, leave blank and raise it.
5. **No partial writes.** Bulk operations validate fully and commit whole, or
   reject and commit nothing.
6. **Every write path gets a log entry** with who, when, and `source`
   (`'ui'` / `'excel-import'` / `'admin-override'`). T2's saves now tag
   `source:'ui'` and `outlierConfirmed:<count>`.
7. **Preserve existing behaviour when porting between bakery and packaging** —
   match the existing app's output format rather than improving it, since
   these two reports get compared side by side.
8. **One commit per ticket, stop for review after each 🔴 P0 ticket.**

## Full ticket list

| # | Priority | Scope | Status |
|---|---|---|---|
| T1 | 🔴 P0 | Reject duplicate item codes at load; normalise pack fields | ✅ committed, merged to `main` (both repos) |
| T2 | 🔴 P0 | Outlier variance guard + admin exception queue | ✅ committed on `ticket-2-outlier-guard` (both repos), **not yet pushed** |
| T3 | 🟢 P1 | Remove plaintext password column from bakery admin UI (**bakery only**) | ⬜ not started |
| T4 | 🟢 P1 | Location type + date-effective open/closed status (**both apps**) | ⬜ not started — see departures below, this ticket needs real rework vs. the original doc |
| T5 | 🟢 P1 | Export store submission status to Excel (**packaging only** — bakery already has this) | ⬜ not started |
| T6 | 🟢 P1 | Price / priceUom / priceEffectiveFrom on bakery item master (**bakery only**) | ⬜ not started — see departures below |
| T7 | 🟢 P1 | Align Thai calendar display (BE) across both apps | ⬜ not started |
| T8 | 🟡 P2 | Price list bulk import with preview-diff-confirm | ⛔ **blocked** on open question Q3 (price-on-master restates prior months silently) |
| T9 | 🟡 P2 | Stock-take Excel upload with validation gate | ⛔ **blocked** on open question Q4 (store-only vs. admin-on-behalf upload) |

Suggested commit sequence (unchanged from the original plan): T1 → T2 → T3 → T4 →
T5 → T6 → T7 → **stop, await Q3/Q4 decisions** → T8 → T9.

## What's done

### T1 — duplicate-code validator (merged)
Load-time validator (`scanItemMasterIssues`) in `loadData()` /
`loadMasterDataFromFB()`, surfaced as a persistent admin-visible banner
(`#masterDataAlert`) + a detailed card on the item-management screen + a
"รหัสซ้ำ" chip on affected entry rows. Verified: `data.json` and production
`masterData/items` both have 0 duplicates today — this ships as a guardrail
against future drift, not a fix for an existing problem.

### T2 — outlier variance guard + admin exception queue (committed, not pushed)
Two-ratio check at save time: (a) qty vs. this store's own prior month
(`totalBaseQty`, symmetric — flags spikes and collapses), (b) value vs. the
network median for that item this month (one-directional — overstatement
only). Either exceeding `OUTLIER_FACTOR` (10) requires an explicit ticked
confirmation before save; never auto-rejects. Confirmed records get
`confirmedBy`/`confirmedAt`/`flagReason` stamped. Admin dashboard gains a
"รายการที่ต้องตรวจสอบ" exception card (top 20 by ratio), which persists
`stats/{ym}/itemMedian` — the baseline the store-side check reads.

**Bug caught and fixed while building this**: `totalBaseQty()` falls back to
raw `qty` when `pack_size` is `null` (legacy/missing-UOM rows). That fallback
is a different unit basis than a real base-qty total — comparing the two
produced an observed 3555.6x ratio on an otherwise-normal row. Fixed by
requiring `pack_size != null` on **both** months before computing the qty
ratio at all, in both the store-side (`loadOutlierContext`,
`computeOutlierFlag`) and admin-side (`computeAndPersistOutlierExceptions`)
code paths. **Carry this guard if you touch this logic in T4/T6/packaging.**

Verified live against `demo/` Firebase (bakery's demo sandbox has working
security rules — packaging's does not, see packaging's `HANDOFF.md`): modal
blocks save until confirmed, confirmed record carries the stamp, exception
card ranks/truncates correctly against real pre-existing demo data, median
snapshot persists.

## Departures from the original plan doc — read before starting T4 or T6

These were verified against actual code/data while implementing T1/T2 and
change how later tickets should be approached:

1. **T4 (location status) needs a real build in bakery, less rework in
   packaging.** Bakery's 164 production stores are all genuine stores — no
   DC/FC/dummy classification needed here, just add the lifecycle status
   fields (`locationType`, `status`, `effectiveFrom`, `effectiveTo`,
   `statusNote`) and `isCountableAt(loc, ym)`, then replace the store-delete
   button (`confirmDeleteStore`/`doDeleteStore` in `app.js`) with a status
   change, hard-delete only when a store has zero `entries/` history.
   Packaging's location classification (DC/FC/dummy/virtual/frozen) is the
   harder half of T4 — see packaging's `HANDOFF.md`.
2. **T6 (price on item master) is fully resolvable, not partially blocked.**
   `estCostOf()` (`app.js`) already fixes the denomination: `cost_vat` is
   unambiguously per `packtype`. All 338 production `master_uom` codes have a
   non-empty `packtype` and non-zero `pack_size` — the migration should
   produce **zero** `price: null` rows, not the "some items may be
   unresolvable" caveat the original ticket implies.
3. Bakery's `master_uom.json` `packtype` values include some that aren't in
   `UOM_LIST` (`app.js`) — `ห่อ`, `กระปุก`, `แผง`, `ก้อน`, `ขวด`, `ถัง`, and two
   likely typos `ถง` / `แพค`. Not a blocker for T6 (its dropdown sources from
   `master_uom` directly), but report the typos, don't silently "fix" them
   (guardrail 4).

## Before starting T3

1. Confirm T1 and T2 are merged to `main` (check `git log origin/main`).
2. `git checkout -b ticket-3-remove-password-column main`.
3. T3 is small (~15 min per the original estimate): remove the `PASSWORD`
   `<th>`/`<td>` from `buildManageStoresView()` in `app.js`, fix the
   `colspan` values, keep the password field in the add/edit modals (admin
   still needs to set it). Bakery-only — packaging has no store admin UI at
   all (`STORES_DATA` there is a hardcoded source array, never
   Firebase-backed — nothing to remove).
4. This one doesn't touch the write path or Firebase data, so `DB_ROOT`
   doesn't need to change for testing — just serve locally and check the
   admin store list visually.
5. Delete this section (and update the "What's done" table above) once T3
   is merged, so this file stays a living resume point instead of drifting
   stale. Don't delete the whole file — the guardrails and departures
   sections stay relevant for the rest of the plan.
