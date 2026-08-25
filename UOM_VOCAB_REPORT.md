# `master_uom.json` UOM vocabulary reconciliation — bakery-count

**Ticket:** T10 sub-item 10.3 · **Raised:** 25 Aug 2026 · **Status:** awaiting decision
**For:** Buyer / master-data owner
**Action taken in this repo: none.** No `packtype`, no `sub_uom`, and no `UOM_LIST` entry
was edited. This file is a list to decide from, not a change.

## Why this is a list and not a fix

Guardrail 4 (`HANDOFF.md`, both repos): **never guess a UOM.** A wrong UOM reproduces the
June 2026 valuation incident. The two suspected typos below are exactly the shape of a guess
that looks obviously safe and isn't — if any store counted against `ถง` historically, silently
renaming it changes what those counts meant, with no record that the meaning changed.

## What the mismatch actually is

`UOM_LIST` (`app.js`) holds 11 values:

> ลัง · กล่อง · ถุง · แพ็ค · กระสอบ · ชิ้น · ฟอง · ซอง · ชุด · กรัม · กิโลกรัม

`master_uom.json` (338 items) uses **8 `packtype` values** and **3 `sub_uom` values** that are
not in that list. The ticket brief flagged the packtype half; the `sub_uom` half is an
additional finding from this pass and is included below.

### Practical impact today

Low, but not nil. `UOM_LIST` is used in three places:

1. **`uomSelect()`** — the หน่วยนับ dropdown. Not reached for any item below: every one of
   them has a `master_uom.json` `packtype`, so its หน่วยนับ is master-locked and rendered as
   read-only text, never as a `<select>`.
2. **`computeSubtotals()` / per-UOM subtotal lines** — `UOM_LIST` sets the display *order*;
   a defensive fallback appends any unlisted unit afterwards. So these units do display, just
   always last and in arbitrary order.
3. **T6's `priceUom` dropdown** — sources from `master_uom.json` directly, not `UOM_LIST`, so
   it is unaffected.

### The part that raises the stakes on the two typos

**T6's price migration already wrote `priceUom` equal to the unlisted `packtype` for all 14
items — including `ถง` and `แพค`.** Both spellings are now live in Firebase
`masterData/items` as well as in `master_uom.json`.

That makes a rename a **two-place, must-be-atomic** change. `estCostOf()` returns `null` (and
the UI shows `—` instead of a cost) whenever `priceUom` matches neither the item's `packtype`
nor its `sub_uom`. Correcting `master_uom.json` alone would silently blank the estimated cost
for that item in every store, in every month, immediately. Please factor that into the
decision — it is not a one-line text fix.

---

## A. `packtype` values absent from `UOM_LIST`

`Stores` = distinct stores with at least one saved (non-empty) entry against that item code.
`Rows` = total saved entries. Read from production Firebase `entries/` on 25 Aug 2026;
the live data spans two months, **2026-06 and 2026-07**.

### A1 — Genuine units, simply never added to `UOM_LIST` (6 values, 12 items)

| packtype | Code | Item name | Pack size | sub_uom | Class | Stores | Rows | Months |
|---|---|---|---|---|---|---|---|---|
| ห่อ | 197135 | สติ๊กเกอร์ขนมปังกระเทียมFZ2000ใบ | 2000 | ใบ | 68 | 134 | 228 | 06, 07 |
| ห่อ | 241755 | เอโร่ ซอสมะเขือเทศ 10กรัมx100ซอง | 1000 | กรัม | 732 | 138 | 232 | 06, 07 |
| ห่อ | 328980 | RM_ถุงขนมปังบริยอช 30 ชิ้น x 1 | 30 | ชิ้น | 78 | 148 | 249 | 06, 07 |
| ห่อ | 933179 | แดรีโกลด์พาร์มีซานชีสชนิดผง500กX1 | 500 | กรัม | 45 | 131 | 190 | 06, 07 |
| กระปุก | 230851 | โอวาเล็ต 800 กรัมX1 | 0.8 | กิโลกรัม | 68 | 133 | 225 | 06, 07 |
| กระปุก | 833762 | นูเทลล่า เฮเซลนัทเปรด 3กก.X1 | 3000 | กรัม | 310 | 141 | 236 | 06, 07 |
| กระปุก | 155061 | แม่ประนอม น้ำพริกเผาต้มยำ 900กX1 | 900 | กรัม | 885 | 101 | 101 | 07 only |
| กระปุก | 153014 | แม่ประนอม น้ำพริกเผาต้มยำ 3 กก.X1 | 3000 | กรัม | 885 | 101 | 101 | 07 only |
| แผง | 198368 | ARO ไข่ไก่ เบอร์2 มีฝา 30 ฟอง | 30 | ฟอง | 30 | 146 | 245 | 06, 07 |
| ก้อน | 316825 | เพรสซิเด้นท์ครีมชีส 2 กก. X 1 | 1880 | กรัม | 68 | 155 | 285 | 06, 07 |
| ขวด | 231231 | เกลือทะเลฝาบดแม็คคอร์มิด172*1 | 172 | กรัม | 30 | 128 | 185 | 06, 07 |
| ถัง | 927368 | โอวาเล็ต 5 กก. X1 | 5000 | กรัม | 43 | 127 | 181 | 06, 07 |

**Proposed action, on confirmation only:** add `ห่อ`, `กระปุก`, `แผง`, `ก้อน`, `ขวด`, `ถัง`
to `UOM_LIST`. This is additive — it changes no stored data and no existing count, only the
dropdown vocabulary and the subtotal display order.

### A2 — Suspected typos — **do not touch pending an explicit answer** (2 values, 2 items)

| packtype | Likely intended | Code | Item name | Pack size | sub_uom | Class | Stores | Rows | Months |
|---|---|---|---|---|---|---|---|---|---|
| **ถง** | `ถุง`? | 917469 | ผักกาดหอม 1กก. แพ็คละ | 1000 | กรัม | 718 | **101** | **101** | 07 only |
| **แพค** | `แพ็ค`? | 829152 | ออลโคโคเนื้อมะพร้าว | 1000 | กรัม | 13 | **105** | **135** | 06, 07 |

**These are not orphan codes.** 101 stores have counted against `ถง` and 105 against `แพค` —
206 real submissions between them. This is the exact scenario guardrail 4 describes: renaming
the unit silently changes what those existing counts meant, with nothing in the data recording
that the meaning changed.

Note also that the item name for 917469 reads "แพ็คละ" while its `packtype` is `ถง` — so `ถุง`
is a plausible reading, but not the only one, and the name argues weakly for `แพ็ค` instead.
That contradiction is precisely why this needs an answer rather than an inference.

**Questions for the master-data owner:**

1. Is `ถง` on item 917469 a misspelling of `ถุง`, or of something else, or is it a real unit?
2. Is `แพค` on item 829152 a misspelling of `แพ็ค`?
3. If either is a typo: the correction must be applied to `master_uom.json` **and** to
   `masterData/items[code].priceUom` in the same change, or that item's estimated cost blanks
   out. Confirm we may do both together.
4. Do any historical counts against these two codes need re-stating, or is a
   spelling-only correction with no change of meaning acceptable?

---

## B. `sub_uom` values absent from `UOM_LIST` — additional finding

Not mentioned in the T10 brief; found while compiling section A. Same rule applies: reported,
not fixed.

| sub_uom | Items | Example codes (stores counted / rows) | Assessment |
|---|---|---|---|
| ใบ | 14 | 922164 (156/286), 922291 (156/286), 802110 (156/277), 802839 (155/275), 802111 (150/270), 802837 (144/249), 802109 (139/235), 197135 (134/228) | Genuine unit (bags/sheets, counted per piece). Unlisted. |
| กระป๋อง | 2 | 155191 (134/228), 155112 (134/227) | Genuine unit (cans). Unlisted. |
| กระปุก | 1 | 104517 (139/237) | Genuine unit (jars). Unlisted; same word as an A1 `packtype`. |

`ใบ` at 14 items is the largest single gap in the vocabulary — larger than any individual
packtype gap above. No suspected typos in this group.

**Proposed action, on confirmation only:** add `ใบ` and `กระป๋อง` to `UOM_LIST` alongside the
A1 additions (`กระปุก` would already be covered by A1).

---

## Summary

| | Count |
|---|---|
| Items in `master_uom.json` | 338 |
| Distinct `packtype` values in use | 14 |
| …absent from `UOM_LIST` | **8** (6 genuine + 2 suspected typos) |
| Items affected by an unlisted `packtype` | 14 |
| Distinct `sub_uom` values in use | 12 |
| …absent from `UOM_LIST` | **3** (all genuine) |
| Items affected by an unlisted `sub_uom` | 17 |
| Values changed by this ticket | **0** |

## How to reproduce this list

```bash
python -c "import json,collections; mu=json.load(open('master_uom.json',encoding='utf-8')); U=['ลัง','กล่อง','ถุง','แพ็ค','กระสอบ','ชิ้น','ฟอง','ซอง','ชุด','กรัม','กิโลกรัม']; [print(k,v) for k,v in collections.Counter(x['packtype'] for x in mu.values()).items() if k not in U]"
```

The `Stores` / `Rows` / `Months` columns come from a read-only pass over production Firebase
`entries/` (25 Aug 2026) — they are not derivable from any file in this repo. To re-derive
them, serve the repo locally and run this in the browser console (**read only — no `dbSet`,
no `dbUpdate`, nothing is written**):

```js
(async () => {
  const codes = ['197135','241755','328980','933179','230851','833762','155061','153014',
                 '198368','316825','231231','927368','917469','829152'];
  const allE = await dbGet('entries') || {};
  const stores = {}, rows = {};
  codes.forEach(c => { stores[c] = new Set(); rows[c] = 0; });
  Object.keys(allE).forEach(sNo =>
    Object.keys(allE[sNo] || {}).filter(m => /^\d{4}-\d{2}$/.test(m)).forEach(ym =>
      codes.forEach(c => {
        const e = normalizeEntry((allE[sNo][ym] || {})[c]);
        if (e && isFilled(e)) { stores[c].add(String(sNo)); rows[c]++; }
      })));
  console.table(codes.map(c => ({ code: c, stores: stores[c].size, rows: rows[c] })));
})()
```
