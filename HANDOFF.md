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
| T8 | 🟡 P2 | Price list bulk import with preview-diff-confirm | ⛔ **blocked** — see "What still blocks T8/T9" below (Q3 decided and its T11 prerequisite merged; three real blockers remain) |
| T9 | 🟡 P2 | Stock-take Excel upload with validation gate | ⛔ **blocked** — see "What still blocks T8/T9" below (Q4 is decided) |
| T10 | 🔴 P0 | Admin-visible reference band + outlier no-coverage state | ✅ merged |
| T11 | 🟡 P2 | Snapshot price onto the entry at save time (**prerequisite for T8**) | ✅ merged — bakery's shape diverges from packaging's, see Q3 below |
| T8a | 🟡 P2 | One-off August 2026 price import (**bakery only**, narrowed from T8, see kickoff doc) | ✅ done — run against production 25 Aug 2026 |

T1–T7, T10, T11 and T8a are done in both repos where applicable (T8a is bakery-only). **Bakery's T11 diverges from packaging's shape** — see T11's "What's done" section for why. **T8 proper (the recurring import mechanism) remains open** — T8a only applied one month's numbers, it did not build the upload UI.

## What's done

### T1 — duplicate-code validator (merged)
Load-time validator (`scanItemMasterIssues`) in `loadData()` /
`loadMasterDataFromFB()`, surfaced as a persistent admin-visible banner
(`#masterDataAlert`) + a detailed card on the item-management screen + a
"รหัสซ้ำ" chip on affected entry rows.

### T2 — outlier variance guard + admin exception queue (merged)
Two-ratio check at save time: (a) qty vs. this store's own prior month
(`totalBaseQty`, symmetric), (b) value vs. the network median for that item
this month (one-directional). Either exceeding `OUTLIER_FACTOR` (2) requires
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
`flagged` semantics, `OUTLIER_FACTOR` (2), the never-auto-reject behaviour and
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

### T11 — snapshot price at save time (merged)

Q3, decided 25 Aug 2026: history freezes at count-time prices. `estCostOf()` always
read `item.price`/`item.priceUom` **live** from the item master (T6) — and, for the
pack basis, `MASTER_UOM[code].pack_size`/`.packtype`/`.sub_uom` **live** from the
static `master_uom.json` — so an admin editing one price, or deploying an edited
`master_uom.json`, silently restated every prior month's reported value, including
the T10 reference-band comparison. Packaging led T11
([bd6f420](https://github.com/justheuristics/packaging-count/commit/bd6f420)) with
`price_at_count` + `pack_at_count`. **Bakery's shape is different — deliberately —
because bakery's price model differs (T6's `price`/`priceUom`/`priceEffectiveFrom`
and `estCostOf()`).**

**The divergence, and why.** Two fields stamped: `price_at_count` and
**`priceUom_at_count`** — not packaging's `pack_at_count`. Bakery's entries have
stamped `pack_size`/`uom`/`sub_uom` since §3 already; the gap was never a missing
field, it was `estCostOf()` not reading them. So no new pack field was needed —
`estCostOf()`'s new snapshot branch (ahead of its existing item-master/`MASTER_COST`
branch, [app.js](app.js)) reads `e.pack_size`/`e.uom`/`e.sub_uom` instead of
`MASTER_UOM[code]`'s, but only when `hasPriceSnapshot(e)` is true. What bakery needs
that packaging doesn't is `priceUom_at_count`: bakery's price carries a
denomination (T6's `priceUom`, either the item's packtype **or** its sub_uom) —
packaging's price is always per `packCount`, no unit ambiguity to freeze.
`price_at_count` keeps packaging's exact field name on purpose: it's what T8's
importer and any cross-app tooling will look for.

**Rejected alternative — using `priceEffectiveFrom` instead of a snapshot.**
Doesn't work: the item master holds exactly one price version, so
`priceEffectiveFrom` says "this price applies from month X onward," never what the
price was before X. Editing the price still restates every month ≥ X. It's a useful
*staleness signal* (below), not a substitute — and until T11, it was written by T6
and never read anywhere.

**Stamped once, never re-stamped**, mirroring `counted_at: e.counted_at ||
Date.now()`'s idiom right above it in `doSaveEntry()`: an item with no price stays
un-stamped (never `price_at_count: 0`, which would read as "this genuinely cost
฿0"), legacy rows are never stamped, and a row that already carries a stamp keeps
it regardless of what the item master says by the time of a later save. **Bug found
and fixed while building this**: the stamp must also be written back onto the
in-memory `ENTRY_DATA[code]` object, not just the Firebase-bound `rec` — otherwise
a second `doSaveEntry()` call in the same page session (edit more rows, save again,
no reload) can't see its own prior stamp and re-prices the row at whatever the item
master says by then. Caught by testing two saves in one session against `demo/`
before this was added; without it, "never re-stamp" silently failed exactly the
scenario Q3 exists to prevent.

**No backfill** — every record that existed before this ticket keeps reading the
live master (both price and pack), same as today. Verified against production
2026-07 data before and after: submitted-store count (154/164), total items
(36,180), total est. cost (฿70,508,736.89), the T10 band summary (102 in-range / 46
out-of-band / 6 no-band), and stores 153 and 159's figures were all
**bit-for-bit unchanged** — the snapshot branch never fires on an un-stamped row,
so this is a true read-side no-op.

**Measured, not fixed: the pack-basis split this leaves open.** Before this ticket,
`totalBaseQty()` (T2/T10's outlier and cost math) already used `entry.pack_size`
while `estCostOf()` used `MASTER_UOM[code].pack_size` on the *same* entry — the
source of flag B. Scanned all of production `entries/`: **47 of 36,121 (0.13%)
non-legacy counted rows** have `entry.pack_size` disagreeing with
`MASTER_UOM[code].pack_size`, all 47 in store 155 / 2026-07, and all 47 also have
`entry.uom`/`entry.sub_uom` unset (`null`) — a pre-existing §3-era data-quality gap
in that one store/month, not something T11 introduced. Per the decided approach,
`estCostOf()`'s snapshot branch trusts the entry's own pack basis **only when
`hasPriceSnapshot(e)` is true** — so these 47 pre-T11 rows keep reading
`MASTER_UOM` exactly as before, unchanged, and will self-heal the moment store 155
re-saves that month under T11. Not backfilled, for the same reason nothing else is.

**Fallback visibility — "un-stamped ≠ frozen," T10's "missing ≠ passed" idiom.** A
muted pill (`ราคาปัจจุบัน — ยังไม่ได้ตรึง`) on un-stamped rows in the admin
per-store detail table (`loadSingleStoreDet()`); a `ราคาฐาน` column in both
`buildExportDetailRows()`-based exports and `exportAllStoresMonth()`'s Detail
sheet, stating `ราคา ณ วันที่นับ` vs. the same pill text per row; a
`livePriceNoteHtml()` card on the admin dashboard (modelled on T10's
`coverageNoteHtml()`, same placement rule — next to the numbers it qualifies,
renders even at 0) counted for free inside `storeMonthTotals()`'s existing loop; and
a note plus a changed-price warning toast on the item edit modal
(`showEditItemModal()`/`doEditItem()`), the screen where a live-price restatement
actually originates.

**`priceEffectiveFrom` staleness signal — included, not deferred.** On an
**un-stamped** row, when the item's `priceEffectiveFrom` is later than the counted
month, the pill/export text names the effective month (BE) — the live price being
shown demonstrably did not apply back then. First real use of a T6 field that had
been written and never read.

**Not in scope, verified and recorded rather than fixed:**
- `doSaveEntry()` drops T2's `confirmedBy`/`confirmedAt`/`flagReason` on a re-save
  of a row that no longer re-flags (same class of bug packaging's T11 fixed in
  `saveEditedRecord()` — but bakery has no equivalent admin inline-edit path;
  `doSaveEntry()` is the only writer to `entries/`, and it's store-driven). Mostly
  self-healing (a row that still flags re-prompts and re-stamps its confirmation
  fields); left as a known gap rather than widening this ticket.
- `stats/{ym}/itemMedian` will blend stamped and un-stamped price bases in the
  first month a mix occurs. Self-corrects the following month.

### T8a — August 2026 price import, one-off (done)

Narrowed from T8 per the kickoff doc: applied the August 2026 Code 206 Bakery price list
(EX VAT, valid 1–31 Aug 2026) against production. Did **not** build the recurring import
mechanism (template download / upload UI / preview screen) — that stays T8, in September,
against the September list.

**Step 1 — `priceBasis` + `priceStatus` fields, backfill (run 25 Aug 2026).** Added
`priceBasis` (`'EX_VAT'|'IN_VAT'|null`) and `priceStatus` (`'NO_CONFIRMED_PRICE'|null`) to
`masterData/items`, and `priceBasis_at_count` alongside T11's `price_at_count`/
`priceUom_at_count` snapshot. `estCostOf()` gained an explicit guard: `priceStatus ===
'NO_CONFIRMED_PRICE'` returns `null` *before* falling back to `master_cost.json`'s old IN
VAT number — without this, "no confirmed price" would have silently rendered the stale
figure with no error, exactly the "wrong number, no error raised" failure mode this ticket
existed to prevent. Add/edit item modals now require a VAT basis whenever a price is set by
hand, and the T6 `master_cost.json` migration button now stamps `IN_VAT` on any
newly-resolved item too — both close paths that could otherwise reintroduce basis-less
prices after this ticket. Basis shown wherever a price shows: item master, exports,
un-stamped-row warnings, per-store detail, entry-screen tooltip — never guessed when
unrecorded (a pre-T8a stamped entry has no `priceBasis_at_count`; it reads as "ฐาน VAT
ไม่ระบุ", not a guessed IN_VAT).

Backfill (`computeBasisBackfillPreview`/`showBasisBackfillModal`/`doBasisBackfill`, mirrors
T6's migration pattern) labelled all 338 then-priced items `IN_VAT` — verified against
production before and after: 338/338, 0 unresolved, zero unintended field changes (spot-
checked `price`/`priceUom`/`priceEffectiveFrom`/`priceStatus` on every item), audit log
present (`source:'admin-override'`). July 2026 dashboard bit-for-bit unchanged after this
step (154/164, ฿70,508,736.89, band split 102/46/6) — pure basis-labelling, no price moved.

**Step 2 — the August update (run 25 Aug 2026).** Source: `docs/Bakery_Price_Import_2026-08_FILLED.xlsx`,
extracted by `tools/extract_price_import.py` into the committed `docs/price_import_2026-08.json`
(only columns A/Code and K/New Price EX VAT are imported, per the brief; the extractor
self-verifies every count against the kickoff brief's numbers and refuses to write on any
mismatch — none occurred). `computeAugustPriceImportPreview()`/`showAugustPriceImportModal()`
re-verify those counts against the *live* item master at run time (not just at extraction
time) and route strictly by `Status` (column M) — never by the sheet's own `Countable`/`In
Item Master` columns, which turned out to be computed against the stale `data.json` rather
than this repo's live `master_uom.json`/`masterData/items`.

Two live-master discrepancies surfaced by the runtime check, both reported rather than
silently resolved:
- **83 rows** the sheet marked `Not countable` that the live `master_uom.json` actually has
  an entry for. Per Status-only routing (explicitly confirmed before running), these stay
  skipped — still `IN_VAT`, unchanged by this ticket.
- **24 of the 38 `NO_PRICE`-status codes** don't exist in the live item master or
  `master_uom.json` at all — confirmed directly against production 25 Aug 2026, not a
  parsing artifact. The sheet's "In Item Master" column said Y for these (computed against
  `data.json`, which still has 366 items vs. live's 338). Explicitly confirmed to skip
  these the same way as `NOT_COUNTABLE` — there is nowhere to write a status for an item
  that isn't live, and they can never appear on a count screen regardless.

**Written**: 127 rows — 29 `CHANGED` + 61 `Unchanged` + 23 `NEW` → `price`/`priceUom` set,
`priceBasis:'EX_VAT'`, `priceEffectiveFrom:'2026-08'`, `priceSource:'code-206-2026-08'`; 14
`NO_PRICE` (of 38 in the file; 24 skipped as above) → `priceStatus:'NO_CONFIRMED_PRICE'`,
`price`/`priceUom`/`priceBasis` nulled. **Skipped**: 144 `Not countable` + 24
missing-from-live-master = 168, untouched. Verified item-by-item against a fresh
production read after the write: 127/127 matched the expected write exactly (0 mismatches),
211 untouched items confirmed byte-identical to their pre-write state. Audit log entry
present: `source:'excel-import'`, all per-status counts recorded.

**IN_VAT residual: 338 → 211** (113 moved to `EX_VAT`, 14 moved to `NO_CONFIRMED_PRICE` —
both leave the `IN_VAT` bucket). This is the size of the mixed-basis population carried
forward until Ticket 8 proper — the number the project owner asked to be tracked most
closely. Confirmed by a direct post-write production read (`priceBasis` counts: 211
`IN_VAT` / 113 `EX_VAT` / 14 `NO_CONFIRMED_PRICE`, summing to 338). The step-2 preview
modal originally miscalculated this as 225 — it only subtracted the 113 codes moving to
`EX_VAT` and forgot the 14 `NO_PRICE` codes also leave `IN_VAT` (they move to no-basis, not
staying `IN_VAT`) — caught and fixed in `computeAugustPriceImportPreview()` immediately
after the write; the actual write was correct throughout, only this forward-looking display
number was wrong.

**Two separate no-price populations, not merged, per the brief:**
- The 38 `NO_PRICE` rows *inside* `PriceImport` (no confirmed price in the Code 206
  source) — 14 written as `NO_CONFIRMED_PRICE`, 24 skipped as missing-from-master (above).
- The **42** rows on the workbook's `NoPriceInSource` sheet — a *different* set, confirmed
  all 42 are live, countable items (`master_uom.json` entries exist) that Code 206 doesn't
  cover at all. This is a coverage gap in the source document, not a code problem — a
  question for the Buyer, left unresolved here per the brief. All 42 remain `IN_VAT`,
  untouched (no import row exists for them to route).

**19 rows beyond ±20%**, listed in the step-2 diff: 10 genuine `CHANGED` price moves
(largest `922291`, ฿1,340→฿819.67, −38.8%, mostly packaging/box items) and 9 `NO_PRICE`
rows whose "−100%" is an artifact of the delta formula against an empty New Price cell, not
an actual price drop.

**5 conflict codes** named per the brief (store 2/17/57 pricing differs from the all-stores
default used here — the app has one global price per item and cannot represent this):
`924802`, `213860`, `204345`, `183153`, `182866`. Not resolved — a question for Phat, per
the brief. Not built: per-store pricing.

**T10 dashboard, before → after (July 2026, the only month with un-stamped — i.e. still
price-floating — rows; expected movement, not a bug, per T11's design):**
total cost ฿70,508,736.89 → ฿64,030,013.04 (−9.2%, larger than the ~6.5% pure-VAT effect
because several `CHANGED` packaging items also moved 20–39% on the underlying price, not
just the VAT basis); band split 102/46/6 → 103/45/6. 13 stores crossed a boundary: 7 moved
from above-max into range as packaging costs dropped (4 บางบอน, 37 ชัยภูมิ, 41 เชียงใหม่2,
43 ชุมพร, 133 รามคำแหง24, 141 ลำลูกกา, 155 ปิ่นเกล้า); 6 moved from in-range below the
minimum as their totals shrank (50 แม่ริม, 66 พัทยาเหนือ, 70 สุโขทัย, 86 ศรีนครินทร์2, 89
พิษณุโลก2, 132 สัตหีบ). Reconstructed by re-deriving July's per-store totals from
`master_cost.json`'s original IN VAT figures (T6's source for every pre-T8a price) —
matched the captured pre-write baseline to within $0.005, confirming the reconstruction
(and therefore this delta) is exact.

**Ran within the price validity window** (1–31 Aug 2026; executed 25 Aug 2026, six days of
headroom). `DB_ROOT` was never set to `'demo'` for this ticket — both writes went straight
to production per the kickoff doc's explicit build→preview→wait→confirm sequence; every
number was preview-verified against live data before either write fired, and re-verified
against a fresh Firebase read after.

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
- **Q3 — DECIDED and IMPLEMENTED: snapshot the price onto the entry at save
  time.** History freezes at count-time prices. **Implemented by T11** — see its
  "What's done" section above for the shape (`price_at_count` +
  `priceUom_at_count`, deliberately different from packaging's
  `pack_at_count`), the no-backfill decision, and the verification numbers.
  `estCostOf()` now prefers a row's own snapshot when present and only falls
  back to the live master when it isn't — so a price edit today only moves
  months that were never stamped, not the ones that were.
- **Q4 — DECIDED: store-only upload.** No admin-on-behalf path in T9, and
  therefore no `submittedBy` case-branching to build. **Known open consequence,
  recorded honestly:** the de facto recovery path when a store cannot upload is
  an admin logging in as that store, which the audit trail will attribute to the
  store, not to the admin. That is accepted for now. It is a known limitation of
  the decision, not an oversight in it.
- **`OUTLIER_FACTOR` lowered 10× → 2×** per project owner decision (call, 25 Aug
  2026), to catch anomalies earlier. Same change made in `packaging-count` the
  same day. Known trade-off, flagged at the time and not yet resolved: at 2×
  the guard will fire on ordinary variance — seasonal swings, delivery timing
  around month-end — far more often than at 10×, which risks people learning to
  tick through the confirmation and dulling the control on the rows where it
  matters. Watch for this once live; if confirm-rate climbs, consider a
  two-tier version (warn at 2×, hard-confirm at a higher threshold) rather than
  reverting outright.
- **`packaging-count` excluded stores 801 and 804 from counting on 25 Aug 2026**
  (528 retained). Bakery has the same three store codes but was **not** asked
  to make the same exclusion — this session was threshold-only. If bakery
  should match, that's a separate decision and a separate ticket; bakery has no
  exclusion mechanism today (see bakery's own T4 comment in `app.js`).

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

T11's sequencing requirement is now cleared — it's merged, so bakery's half of T8
has no outstanding prerequisite. T8a (bakery's one-off August price application, see
above) is also done — T8 proper still needs the recurring upload/preview mechanism built,
against September's list, and still carries a mixed-basis population (211 IN_VAT / 113
EX_VAT / 14 NO_CONFIRMED_PRICE after T8a) to reconcile. T8 remains blocked on blockers 1–3 above
(packaging-side item codes and price source, plus the shared `demo/` rules gap) —
those are packaging-only; bakery's half is otherwise ready to build.

When starting: `git checkout -b ticket-8-price-import main` (or `ticket-9-…`),
and confirm `git log origin/main` shows T1–T7, T10 and T11 merged first. Update
this section as blockers clear, so the file stays a living resume point. Don't
delete the guardrails/departures sections — they stay relevant.
