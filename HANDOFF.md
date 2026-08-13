# Handoff — Ticket 2: Variance guard + admin exception queue

Working from `CLAUDE_CODE_ACTION_PLAN_Counting_Apps.md`. Ticket 1 (duplicate-code
validator) is merged to `main`. This branch (`ticket-2-outlier-guard`) adds the
outlier variance guard and the admin exception queue. **Read this file before
touching this branch** — it's the state at handoff, not a design doc; delete it
once T2 is merged.

## What's here

All in `app.js`, all in the section headed `OUTLIER GUARD (T2)` plus the two call
sites it plugs into:

- `OUTLIER_FACTOR = 10` — the single tunable threshold, next to `DB_ROOT`.
- `prevYM()`, `loadOutlierContext(ym)`, `evalOutlier(...)`, `computeOutlierFlag(code, entry)`
  — core ratio logic. Two ratios: (a) this store's qty vs. its own prior month
  (`totalBaseQty`, cross-UOM safe, symmetric — flags both a spike and a collapse),
  (b) this line's value vs. the network median for that item this month
  (one-directional — only overstatement vs. peers). A missing median is recorded
  as `medianUnavailable`, never silently treated as a pass.
- `showOutlierConfirmModal()` / `doSaveEntry(confirmedFlags)` — two-phase save.
  First call (no arg) computes flags; if any exist, shows a modal and returns
  without writing. The modal's confirm button re-calls `doSaveEntry(flagged)`,
  which stamps `confirmedBy`/`confirmedAt`/`flagReason` onto each flagged record
  before the real `dbUpdate`. Never auto-rejects — visibility only.
- `computeAndPersistOutlierExceptions(allE, selYM)` / `exceptionQueueCardHtml(...)`
  — admin dashboard card "🚩 รายการที่ต้องตรวจสอบ", top 20 by ratio. Reuses `allE`
  (already fetched by the caller) rather than issuing new reads. Also persists
  `stats/{ym}/itemMedian` and `stats/{ym}/computedAt` every time an admin opens
  the dashboard for a month — that's the write path the store-side median read
  depends on.

## A real bug this caught, fixed here — carry this if you port the pattern

`totalBaseQty(entry)` falls back to the raw `qty` field when `entry.pack_size`
is `null` (legacy rows, or — as seeded in `seed.js` case 7 — a deliberately
missing-UOM row). That fallback is a **different unit basis** than a real
base-qty total (`qty * pack_size + subunit_qty`). Comparing the two months
naively produced a real observed ratio of **3555.6x** on a row that was not
actually a 3555x anomaly — it was an artifact of comparing base units against
raw units.

Fix: both `loadOutlierContext()` (prior-month side) and `computeOutlierFlag()`
(current-month side) now require `pack_size != null` on **both** sides before
computing `qtyRatio` at all. Same guard applied in the admin-side
`computeAndPersistOutlierExceptions()`. If you extract this logic for reuse
elsewhere (e.g. porting to packaging, which already carries an equivalent
duplicated copy — see `packaging-count/index.html`), keep this guard attached.

## Verification status

**Fully verified live**, against `demo/` Firebase (bakery's demo sandbox has
working security rules):
- Seeded via `seedDemoData()` (`seed.js`).
- Edited item `106901` to a 12.5x qty spike vs. its June baseline → modal
  appeared, listed the correct ratio and reason, confirm button stayed disabled
  until the checkbox was ticked.
- Confirmed the save was blocked until confirmed (re-read the record from
  Firebase between attempts — value only changed after confirming).
- Confirmed the saved record carries `confirmedBy`/`confirmedAt`/`flagReason`.
- Confirmed the admin exception card ranks it correctly alongside pre-existing
  demo data (some existing demo rows had ratios in the thousands — top-20
  truncation observed working correctly, item `106901` at ratio 12.5 did NOT
  make the top 20 in that run, which is correct given the more extreme rows
  present).
- Confirmed `stats/2026-07/itemMedian` and `.../computedAt` persisted to
  Firebase after opening the admin dashboard for that month.

## Before committing / resuming

1. `DB_ROOT` is `''` (production) as of this handoff — already reverted, do not
   set it back to `'demo'` without reverting again before your own commit.
2. `node --check app.js` should pass clean.
3. Guardrail 8: this is a 🔴 P0 ticket — stop for review after committing, before
   starting T3.
4. Estimated-cost label sweep: only one genuine gap was found in this app
   (the entry-screen reference-band panel, `refBandInnerHtml()`) — already fixed.
   Everywhere else already carried the disclaimer from prior work.

## Not done yet (repo-agnostic, tracked in the shared plan)

T3–T7 not started. Full 7-ticket plan and cross-repo status lives in the
plan file used by the Claude Code session that did this work — ask the user
for it if you need the broader picture; this file only covers what's on this
branch, in this repo.
