# HANDOFF — Counting Apps action plan (bakery-count)

This repo and its sibling `packaging-count` (`github.com/justheuristics/packaging-count`)
are being worked through a ticket-by-ticket action plan in order, one ticket per
branch, one PR per ticket, merged before the next starts. **Read this whole file
before starting T8, T9 or T11** — it has the guardrails, the full ticket list,
what's already done, which questions are closed, and what's known to depart from
the original plan doc.

If you have the original plan doc (`CLAUDE_CODE_ACTION_PLAN_Counting_Apps.md`),
this file summarizes it plus everything learned while implementing T1–T7 and T10
that the original doc got wrong or didn't anticipate — read this file's departures
section even if you have the original, since some of its stated facts are stale.
The original doc lists 9 tickets; T10 and T11 were added after it was written.

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
8. **One commit per ticket, stop for review after each 🔴 P0 ticket** (T1, T2
   and T10 all did; nothing left at that priority right now).
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
| T8 | 🟡 P2 | Price list bulk import with preview-diff-confirm | ⛔ **blocked** — see "What still blocks T8/T9" below (Q3 is decided; T11 is now its prerequisite) |
| T9 | 🟡 P2 | Stock-take Excel upload with validation gate | ⛔ **blocked** — see "What still blocks T8/T9" below (Q4 is decided) |
| T10 | 🔴 P0 | Admin-visible reference band + outlier no-coverage state | ✅ merged |
| T11 | 🟡 P2 | Snapshot price onto the entry at save time (**prerequisite for T8**) | 📋 not started — design decided 25 Aug 2026, see Q3 below |

T1–T7 and T10 are done in both repos.

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

### T10 — admin-visible reference band + outlier no-coverage state (merged)

Two controls that were assumed closed but weren't.

**10.1 — the band an admin can actually see.** `refBandInnerHtml()` reads `SES.no`
and `monthTotalCost()`, so the store cost band was visible only to the store
itself. The July 2026 anomaly was caught *by this band* — it is the
store-total-vs-band check, a different control from T2's per-item ratio vs. the
network median — and the person who reports the number upward could not see it.
Extracted the three-way classification into a pure `classifyAgainstBand(total,
band) → {status, cls}` and gave it three renderers: the store panel (unchanged
output), the admin dashboard's submitted-stores list, and
`exportStoreStatusExcel()`. **No band is its own outcome** (`cls:'none'`, muted),
never green — an admin table showing "in range ✅" for a store with no band is
worse than showing nothing. 152 of 164 stores have a band, so this is the normal
case, not an edge case. Submitted stores sort red → amber → green → no-band, so
out-of-band stores are reachable without scrolling, and the summary line above
the list keeps the no-band count as its own number.

**10.2 — "could not be checked" is no longer indistinguishable from "passed".**
`evalOutlier()` returned `flagged:false` both when a row passed both ratios and
when neither ratio could be computed at all. Added a third field, `coverage`
(`'full'` / `'partial'` / `'none'`), derived from whether each ratio is non-null.
`flagged` semantics, `OUTLIER_FACTOR` (10), the never-auto-reject behaviour and
the `pack_size != null` guard on `totalBaseQty()` are all unchanged.
**No-coverage deliberately does not set `flagged`** — that would put a
confirmation modal in front of every item in its first month, train people to
tick through it, and degrade the control that does work. Instead: a distinct grey
dashed `ยังเทียบไม่ได้` chip on the entry row (visually separate from T1's amber
`รหัสซ้ำ`), and an unchecked-row count on the admin exception card, shown in the
"no exceptions found" branch too — a bare all-clear reads as full coverage when
it may be no coverage.

**10.3 — `master_uom.json` UOM vocabulary: reported, not fixed.** See
`UOM_VOCAB_REPORT.md`. Zero values edited, per guardrail 4.

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
   **T10 turned this into a committed list for the Buyer** —
   `UOM_VOCAB_REPORT.md` — and found two things the T6 note didn't: `sub_uom` has
   the same problem (`ใบ` on 14 items, `กระป๋อง` on 2, `กระปุก` on 1), and T6's own
   migration already wrote `priceUom` equal to the unlisted packtype for all 14
   items, `ถง` and `แพค` included. A rename is therefore a two-place atomic change
   — `master_uom.json` **and** `masterData/items[code].priceUom` — because
   `estCostOf()` returns `null` when `priceUom` matches neither the packtype nor
   the sub_uom, which would blank that item's cost in every store and every month.
4. **T10 departure — the export's "submitted" rule changed.**
   `exportStoreStatusExcel()` derived "บันทึกแล้ว" from *any non-empty key* under
   the month node, while the admin dashboard used *any `ITEMS_DATA` row with a
   non-null qty*. Two rules, silently disagreeing whenever a stale key for a
   delisted item lingers. `renderStoreStatusForYM()` was a *third* copy of the
   same question — it used the export's rule while hosting the export button, so
   its on-screen counts could disagree with the file that button produced.
   T10 extracted `storeMonthTotals()` and pointed all three at
   the dashboard's rule, because shipping band columns computed one way beside a
   status column computed another way is exactly the drift T10 exists to stop.
   Row counts in the export can therefore differ slightly from pre-T10 files.
5. **T10 departure — two acceptance items in the T10 brief were packaging-only.**
   `EXCLUDE_SIAM_FROZEN_ADJACENT` and `REF_BAND_READY` do not exist anywhere in
   this repo; bakery loads `REFERENCE_BAND` synchronously in `loadData()` with no
   ready gate, so there is no loading-vs-no-band distinction to preserve here and
   no constant whose comment needs rewording. The Q1 decision is recorded below as
   text instead. Also, the brief cites band maxima of ฿233,899 (store 153) and
   ฿379,328 (store 159); bakery's `store_reference_band.json` has ฿456,724 and
   ฿622,202 — the brief's figures are packaging's. Both stores are still far
   outside their bakery bands, so the acceptance check holds either way.

## Decisions closed on 25 Aug 2026 — do not re-raise these

Q1, Q3 and Q4 were open questions that gated T8/T9. **All three were decided by
the project owner on 25 Aug 2026.** They are recorded rather than deleted so the
reasoning survives. A future session should not stop on any of them, and should
not reopen them without a new instruction from the project owner.

- **Q1 — DECIDED: keep 528 / 801 / 804 counted.** In packaging,
  `EXCLUDE_SIAM_FROZEN_ADJACENT` stays `false`; this is now settled
  configuration, not a pending question. *(Bakery has no such constant — its 164
  production locations are all genuine stores, so there was never a
  classification problem here. This entry exists for parity with packaging's
  `HANDOFF.md`.)*
- **Q3 — DECIDED: snapshot the price onto the entry at save time.** History
  freezes at count-time prices. **This is not implemented by T10 — it is T11, and
  T11 is a prerequisite for T8.** See the T11 row in the ticket table; the design
  is described there and only there, so there is one description of it rather
  than two that can drift apart. **Until T11 lands, `estCostOf()` still reads the
  live master price for every month, so historical totals are not yet stable** —
  editing a price on the item master today silently restates every prior month's
  reported value, including the band comparison T10 just put on the admin screen.
- **Q4 — DECIDED: store-only upload.** No admin-on-behalf path in T9, and
  therefore no `submittedBy` case-branching to build. **Known open consequence,
  recorded honestly:** the de facto recovery path when a store cannot upload is
  an admin logging in as that store, which the audit trail will attribute to the
  store, not to the admin. That is accepted for now. It is a known limitation of
  the decision, not an oversight in it.

## What still blocks T8/T9

These are the real blockers. Each needs an owner to act; none is a coding task.

1. **Five `Non-Cat` item codes** (packaging) — still colliding on a single
   Firebase key. Needs either real codes or a formal exclusion.
   **Owner: Buyer / Fresh Food packaging (Phat).**
   Blocks **both T8 and T9**, since both write by item code.
2. **Packaging price source** — still PDF-only. Needs a fixed Excel template.
   **Owner: Sornmongkol / CGA, chased via Phat and Sakuntala.**
   Blocks **T8's packaging half only** — bakery's half is source-ready
   (Code 206, EX VAT).
3. **Packaging `demo/` Firebase security rules** — unfixed; reads/writes under
   that root return `PERMISSION_DENIED` and fall back to leaf-only
   localStorage. T8 and T9 are both write paths, so this must either be fixed,
   or logic-only verification accepted as an explicit, discussed trade-off.
   **Owner: project owner.**
   (T10 was unaffected — 10.1 and 10.2 are read/display changes.)

Plus one sequencing note that is not a blocker but is easy to miss: **T11 must
land before T8**, per the Q3 decision above.

When starting: `git checkout -b ticket-8-price-import main` (or `ticket-9-…` /
`ticket-11-…`), and confirm `git log origin/main` shows T1–T7 and T10 merged
first. Update this section as blockers clear, so the file stays a living resume
point. Don't delete the guardrails/departures sections — they stay relevant.
