#!/usr/bin/env python3
"""
September 2026 price import — extracts the three "Bakery Inventory Adjustment" Code 206
workbooks (confirmed prices 1-30 Sep 2026) into docs/price_import_2026-09.json, which
app.js fetches at runtime (see computeSeptemberPriceImportPreview()).

Same rationale as extract_price_import.py (August): the write this feeds runs against
PRODUCTION, so the parse is done once, offline, self-verified, and committed as a plain
reviewable diff instead of parsing xlsx in the browser.

Sources (all three are inside "Bakery - September.zip"):
  FBK  - "Bakery Inventory Adjustment- FBK.xlsx"            main list, every store
  S2   - "...2026 2_17_57.xlsx"                             also for stores 2 / 17 / 57
  S22  - "...2026 22_350_121_138_..._352[79].xlsx"          also for the 22/350/121/138... group

Rules baked in here (decided with the project owner, 2 Oct 2026):
  * Only the EX VAT column is imported. IN VAT is read for a consistency check only.
  * Main FBK price wins whenever a code is priced in FBK AND a store file.
  * A store-file price is used only for a code that FBK does not price at all (and only if
    every store file that prices it agrees - otherwise it is a CONFLICT and is skipped).
  * Rows whose price cell is "-" ("use store retail cost") carry no price and are never
    imported as one; they are listed under storeCostOnly for the human.
  * The app has ONE global price per item, so store membership of a file is context only.

Usage:  python tools/extract_price_import_2026-09.py ["/path/to/Bakery - September.zip"]
Writes: docs/price_import_2026-09.json
Refuses to write if any self-check fails.
"""
import hashlib
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import openpyxl

REPO_ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = REPO_ROOT / "docs" / "price_import_2026-09.json"
DEFAULT_ZIP = Path.home() / "Downloads" / "Bakery - September.zip"

# Verified by hand against the three workbooks on 2 Oct 2026. If the parser disagrees the
# parser is wrong (or the files changed) - tell the human, do not adjust the numbers.
EXPECTED = {
    "FBK": {"table_rows": 242, "unique_codes": 240, "priced_unique": 240},
    "S22": {"table_rows": 83, "unique_codes": 82, "priced_unique": 54},
    "S2": {"table_rows": 61, "unique_codes": 59, "priced_unique": 34},
    "unique_codes_all_files": 312,
}
PRIORITY = ["FBK", "S22", "S2"]  # FBK wins; the rest only fill codes FBK does not price


def classify(member_name):
    if "FBK" in member_name:
        return "FBK"
    if "2_17_57" in member_name:
        return "S2"
    return "S22"


def num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def parse_sheet(ws):
    """Return (header_lines, rows). Columns are located from the 'No.' header cell, because
    the three files are laid out with different left margins."""
    grid = list(ws.iter_rows(values_only=True))
    hdr_idx = None
    for i, r in enumerate(grid):
        if any(isinstance(v, str) and v.strip() == "No." for v in r):
            hdr_idx = i
            off = next(j for j, v in enumerate(r) if isinstance(v, str) and v.strip() == "No.")
            break
    if hdr_idx is None:
        raise SystemExit("ERROR: no 'No.' header row found in sheet " + ws.title)
    header_lines = [str(v).strip() for r in grid[:hdr_idx] for v in r if isinstance(v, str) and v.strip()]
    rows = []
    for i, r in enumerate(grid[hdr_idx + 1:], start=hdr_idx + 2):
        no = r[off]
        code = r[off + 3] if len(r) > off + 3 else None
        if not num(no) or code in (None, ""):
            continue  # EX/IN VAT sub-header row, signature block, blanks
        ex, inv = r[off + 5], r[off + 6]
        rows.append({
            "sheetRow": i,
            "code": str(int(code)) if num(code) else str(code).strip(),
            "name": str(r[off + 4]).strip() if r[off + 4] is not None else "",
            "class": str(r[off + 1]).strip() if r[off + 1] is not None else "",
            "buyer": str(r[off + 2]).strip() if r[off + 2] is not None else "",
            "exVat": float(ex) if num(ex) else None,
            "inVat": float(inv) if num(inv) else None,
            "exRaw": None if num(ex) else (str(ex).strip() if ex is not None else None),
        })
    return header_lines, rows


def main():
    zpath = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_ZIP
    if not zpath.exists():
        print(f"ERROR: zip not found at {zpath}", file=sys.stderr)
        sys.exit(1)

    files, per_file, header_notes = {}, {}, {}
    with zipfile.ZipFile(zpath) as z:
        members = [n for n in z.namelist() if n.lower().endswith(".xlsx") and not n.startswith("__MACOSX")]
        if len(members) != 3:
            print(f"ERROR: expected 3 workbooks in the zip, found {len(members)}: {members}", file=sys.stderr)
            sys.exit(1)
        for m in members:
            key = classify(m)
            if key in files:
                print(f"ERROR: two workbooks classified as {key}", file=sys.stderr)
                sys.exit(1)
            data = z.read(m)
            files[key] = {"file": m, "sha256": hashlib.sha256(data).hexdigest()}
            wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
            ws = wb.worksheets[0]
            hl, rows = parse_sheet(ws)
            per_file[key] = rows
            header_notes[key] = [t for t in hl if "สาขา" in t or "ราคายืนยัน" in t]
    if set(per_file) != {"FBK", "S22", "S2"}:
        print(f"ERROR: could not identify all three workbooks: {sorted(per_file)}", file=sys.stderr)
        sys.exit(1)

    problems = []

    # ── per-file de-dup: a repeated code must repeat the same price, else refuse ──
    uniq = {}
    for key, rows in per_file.items():
        seen = {}
        for r in rows:
            prev = seen.get(r["code"])
            if prev is None:
                seen[r["code"]] = r
            elif prev["exVat"] != r["exVat"]:
                problems.append(f"{key}: code {r['code']} repeated with different prices {prev['exVat']} vs {r['exVat']}")
        uniq[key] = seen

    # ── verification against the hand-checked counts ──
    for key in ("FBK", "S22", "S2"):
        got = {
            "table_rows": len(per_file[key]),
            "unique_codes": len(uniq[key]),
            "priced_unique": sum(1 for r in uniq[key].values() if r["exVat"] is not None),
        }
        for k, want in EXPECTED[key].items():
            if got[k] != want:
                problems.append(f"{key}.{k}: {got[k]} != {want}")
    all_codes = set().union(*[set(u) for u in uniq.values()])
    if len(all_codes) != EXPECTED["unique_codes_all_files"]:
        problems.append(f"unique codes across files: {len(all_codes)} != {EXPECTED['unique_codes_all_files']}")

    # ── VAT consistency: IN should be EX x 1.07. Flag (never silently 'fix') the rest ──
    vat_flags = []
    for key in PRIORITY:
        for r in uniq[key].values():
            if r["exVat"] and r["inVat"] and abs(r["inVat"] / r["exVat"] - 1.07) > 0.002:
                vat_flags.append({"file": key, "code": r["code"], "name": r["name"], "exVat": r["exVat"], "inVat": r["inVat"],
                                  "note": "IN VAT column is not EX x 1.07 - EX VAT column is what is imported"})

    # ── resolve one row per code ──
    out_rows, store_cost_only, conflicts, fbk_overrides_store_dash = [], [], [], []
    for code in sorted(all_codes, key=lambda c: (len(c), c)):
        by_file = {k: uniq[k][code] for k in PRIORITY if code in uniq[k]}
        priced = {k: r for k, r in by_file.items() if r["exVat"] is not None}
        any_row = next(iter(by_file.values()))
        name = by_file["FBK"]["name"] if "FBK" in by_file else any_row["name"]
        if not priced:
            store_cost_only.append({"code": code, "name": name, "files": sorted(by_file)})
            continue
        if "FBK" in priced:
            src = "FBK"
            for k, r in by_file.items():
                if k != "FBK" and r["exVat"] is None:
                    fbk_overrides_store_dash.append({"code": code, "name": name, "file": k, "fbkExVat": priced["FBK"]["exVat"],
                                                     "note": "store file says 'use store retail cost'; main FBK price used"})
        else:
            vals = {round(r["exVat"], 4) for r in priced.values()}
            if len(vals) > 1:
                conflicts.append({"code": code, "name": name, "kind": "STORE_FILES_DISAGREE",
                                  "prices": {k: r["exVat"] for k, r in priced.items()}})
                out_rows.append({"code": code, "name": name, "class": any_row["class"], "exVat": None, "inVat": None,
                                 "source": None, "status": "CONFLICT_UNRESOLVED", "sheetsSeen": sorted(by_file)})
                continue
            src = next(k for k in PRIORITY if k in priced)
        row = priced[src]
        others = {k: r["exVat"] for k, r in priced.items() if k != src and abs(r["exVat"] - row["exVat"]) > 0.0049}
        if others:
            conflicts.append({"code": code, "name": name, "kind": "FBK_WINS" if src == "FBK" else "STORE_FILE",
                              "used": {src: row["exVat"]}, "overruled": others})
        out_rows.append({"code": code, "name": name, "class": row["class"], "exVat": row["exVat"], "inVat": row["inVat"],
                         "source": src, "status": "PRICED", "sheetsSeen": sorted(by_file)})

    n_priced = sum(1 for r in out_rows if r["status"] == "PRICED")
    summary = {
        "unique_codes_all_files": len(all_codes),
        "priced_rows": n_priced,
        "from_FBK": sum(1 for r in out_rows if r["source"] == "FBK"),
        "from_store_file_only": sum(1 for r in out_rows if r["status"] == "PRICED" and r["source"] != "FBK"),
        "conflict_unresolved": sum(1 for r in out_rows if r["status"] == "CONFLICT_UNRESOLVED"),
        "store_cost_only": len(store_cost_only),
    }
    if summary["priced_rows"] + summary["conflict_unresolved"] + summary["store_cost_only"] != len(all_codes):
        problems.append("row accounting does not add up to the unique code count")

    if problems:
        print("REFUSING TO WRITE - self-checks failed:", file=sys.stderr)
        for p in problems:
            print("  -", p, file=sys.stderr)
        sys.exit(1)

    doc = {
        "effectiveFrom": "2026-09",
        "basis": "EX_VAT",
        "priceSource": "code-206-2026-09",
        "generatedBy": "tools/extract_price_import_2026-09.py",
        "sourceFiles": files,
        "sourceHeaderNotes": header_notes,
        "expected": EXPECTED,
        "summary": summary,
        "rows": out_rows,
        "storeCostOnly": store_cost_only,
        "conflicts": conflicts,
        "fbkOverridesStoreDash": fbk_overrides_store_dash,
        "vatInconsistent": vat_flags,
    }
    JSON_PATH.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", JSON_PATH, summary)
    print("  conflicts:", len(conflicts), "| fbk-over-store-dash:", len(fbk_overrides_store_dash), "| vat flags:", [v["code"] for v in vat_flags])


if __name__ == "__main__":
    main()
