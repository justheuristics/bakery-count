/* ═══════════════════════════════════════════════════
   seed.js — Demo seed script (§9)
   Writes seeded demo data under demo/... — this is what the demo runs on.
   Loaded after firebase.js + app.js (uses their `db`, `DB_ROOT`, `fbOk`).
   Run via the "🌱 Seed ข้อมูลเดโม" button on the admin Clear-All page,
   or call seedDemoData() directly from the console.
   ═══════════════════════════════════════════════════ */

const SEED_STORE  = '1';                       // ลาดพร้าว — log in as store001 / welcome1 for the demo
const SEED_MONTHS = ['2026-06', '2026-07'];

/* 20 items drawn from codes present in both data.json and master_uom.json,
   across classes 68 and 78 (§9). 7 planted cases + 13 stable items. */
const SEED_ITEMS = {
  /* ── planted cases (§9 table) ── */
  '133352': { case:1, label:'UOM change',        june:{qty:240, uom:'ชิ้น',  pack_size:1},    july:{qty:2,  uom:'ลัง',   pack_size:120} },
  '859997': { case:2, label:'Pack size mismatch', june:{qty:1,   uom:'ลัง',  pack_size:6000}, july:{qty:1,  uom:'ลัง',   pack_size:16000} }, // master says 6000 — real FBK3 discrepancy
  '111419': { case:3, label:'Large increase',     june:{qty:12,  uom:'ลัง',  pack_size:50},   july:{qty:22, uom:'ลัง',   pack_size:50} },   // +83%
  '112057': { case:4, label:'Large decrease',     june:{qty:40,  uom:'กล่อง', pack_size:5},    july:{qty:15, uom:'กล่อง', pack_size:5} },    // -63%
  '117886': { case:5, label:'Legacy row',         june:'legacy35', july:null },                                                             // bare number → หน่วยไม่ระบุ; no July entry
  '125789': { case:6, label:'New item',           june:null,       july:{qty:5, uom:'ถุง', pack_size:null} },                               // no prior record
  '125844': { case:7, label:'Missing UOM',        june:{qty:8,   uom:'ถุง',  pack_size:4000}, july:{qty:9,  uom:null,   pack_size:null} },  // blocks save

  /* ── stable items (small drift, same UOM both months → no flag) ── */
  '106901': { june:{qty:20, uom:'กล่อง', pack_size:1000}, july:{qty:21, uom:'กล่อง', pack_size:1000} },
  '141305': { june:{qty:18, uom:'ลัง',   pack_size:50},   july:{qty:17, uom:'ลัง',   pack_size:50} },
  '143737': { june:{qty:25, uom:'ลัง',   pack_size:120},  july:{qty:26, uom:'ลัง',   pack_size:120} },
  '162408': { june:{qty:30, uom:'ลัง',   pack_size:20},   july:{qty:29, uom:'ลัง',   pack_size:20} },
  '163374': { june:{qty:12, uom:'ลัง',   pack_size:100},  july:{qty:12, uom:'ลัง',   pack_size:100} },
  '163376': { june:{qty:40, uom:'ลัง',   pack_size:100},  july:{qty:42, uom:'ลัง',   pack_size:100} },
  '163379': { june:{qty:16, uom:'ลัง',   pack_size:100},  july:{qty:15, uom:'ลัง',   pack_size:100} },
  '163385': { june:{qty:22, uom:'ลัง',   pack_size:100},  july:{qty:23, uom:'ลัง',   pack_size:100} },
  '281556': { june:{qty:8,  uom:'กล่อง', pack_size:1000}, july:{qty:8,  uom:'กล่อง', pack_size:1000} }, // class 78
  '317649': { june:{qty:14, uom:'กล่อง', pack_size:80},   july:{qty:13, uom:'กล่อง', pack_size:80} },   // class 78
  '344085': { june:{qty:10, uom:'กล่อง', pack_size:300},  july:{qty:10, uom:'กล่อง', pack_size:300} },  // class 78
  '358213': { june:{qty:19, uom:'กล่อง', pack_size:300},  july:{qty:20, uom:'กล่อง', pack_size:300} },  // class 78
  '369481': { june:{qty:6,  uom:'กล่อง', pack_size:200},  july:{qty:6,  uom:'กล่อง', pack_size:200} }   // class 78
};

async function seedDemoData(){
  if(typeof db==='undefined' || typeof DB_ROOT==='undefined' || !fbOk){
    console.error('[seed] Firebase not ready — load seed.js after firebase.js + app.js, on a page with a live connection.');
    return { ok:false, error:'Firebase not ready' };
  }
  /* SAFETY: this seeder writes to entries/{store} and monthControl/ under DB_ROOT.
     Under production (DB_ROOT==='') that would OVERWRITE real store data. Refuse
     unless we're explicitly in the demo sandbox. */
  if(DB_ROOT !== 'demo'){
    console.error(`[seed] REFUSED — seedDemoData only runs when DB_ROOT==='demo' (current: '${DB_ROOT}'). This prevents overwriting real production data.`);
    return { ok:false, error:`refused: DB_ROOT is '${DB_ROOT}', not 'demo' — seeding is disabled in production` };
  }
  const now = Date.now();
  const upd = {};

  Object.keys(SEED_ITEMS).forEach(code=>{
    const c = SEED_ITEMS[code];
    if(c.june === 'legacy35'){
      upd[`entries/${SEED_STORE}/2026-06/${code}`] = 35; // bare legacy number — no object shape
    } else if(c.june){
      upd[`entries/${SEED_STORE}/2026-06/${code}`] = { qty:c.june.qty, uom:c.june.uom, pack_size:c.june.pack_size, counted_at: now };
    }
    if(c.july){
      upd[`entries/${SEED_STORE}/2026-07/${code}`] = { qty:c.july.qty, uom:c.july.uom, pack_size:c.july.pack_size, counted_at: now };
    }
  });

  /* §9: 2026-06 closed, 2026-07 open for entry */
  upd['monthControl/2026-06'] = { active:false, updatedBy:'seed', updatedAt: now };
  upd['monthControl/2026-07'] = { active:true,  updatedBy:'seed', updatedAt: now };

  await dbUpdate(upd); // dbUpdate prefixes every key with DB_ROOT + '/' — stays under demo/
  console.log(`[seed] wrote ${Object.keys(SEED_ITEMS).length} items × ${SEED_MONTHS.length} months to demo/entries/${SEED_STORE}, set monthControl for 2026-06/2026-07`);
  return { ok:true, store:SEED_STORE, itemCount:Object.keys(SEED_ITEMS).length };
}
