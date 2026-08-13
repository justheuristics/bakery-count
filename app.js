/* ═══════════════════════════════════════════════════
   app.js — Application Logic v5.0 (Monthly Edition)
   Trading Report · BAKERY GRP.68,78 · CP Axtra
   ═══════════════════════════════════════════════════
   
   Firebase structure:
   entries/{storeNo}/{YYYY-MM}/{itemCode}   ← monthly data
   monthControl/{YYYY-MM}/active            ← true/false (admin controls)
   ═══════════════════════════════════════════════════ */

/* ════ DATA GLOBALS ════ */
let ITEMS_DATA = [];
let STORES     = [];
let ADMIN      = {};
let MASTER_UOM = {};   // item-master UOM reference (master_uom.json), keyed by item code
let MASTER_COST = {};  // indicative cost reference (master_cost.json), keyed by item code — display only, never persisted
let REFERENCE_BAND = {}; // store cost reference band (store_reference_band.json), keyed by store no — display only, never persisted

/* ════ ITEM MASTER VALIDATION (T1) ════
   รหัสสินค้าซ้ำ = key เดียวกันใน entries/{storeNo}/{YYYY-MM}/{itemCode} → เขียนทับกันเงียบๆ
   ตรวจตั้งแต่โหลด ไม่ปล่อยผ่านด้วย console.warn เฉยๆ (แนวเดียวกับ packaging repo) */
let ITEM_MASTER_ISSUES = { duplicates: [] };

function scanItemMasterIssues(items){
  const seen = new Set();
  const dupCodes = new Set();
  const duplicates = [];
  items.forEach(item=>{
    const code = item.code;
    if(seen.has(code) && !dupCodes.has(code)){
      dupCodes.add(code);
      duplicates.push({ code });
    }
    seen.add(code);
  });
  return { duplicates };
}

function isDuplicateItemCode(code){
  return ITEM_MASTER_ISSUES.duplicates.some(d => d.code === code);
}

function renderMasterDataAlert(){
  const el = document.getElementById('masterDataAlert');
  if(!el) return;
  const { duplicates } = ITEM_MASTER_ISSUES;
  if(duplicates.length === 0){ el.classList.add('hidden'); el.innerHTML=''; return; }
  const dupList = duplicates.map(d => esc(d.code)).join(', ');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div style="background:var(--red-bg);border-bottom:1px solid rgba(224,50,68,.3);color:var(--red);padding:10px 20px;font-size:12.5px;font-weight:600;line-height:1.6">
      ⚠️ พบรหัสสินค้าซ้ำในรายการสินค้าหลัก (${duplicates.length} รายการ) — แจ้ง Admin เพื่อแก้ไข: ${dupList}
    </div>`;
}

/* ════ LOAD DATA ════ */
async function loadData() {
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    STORES     = json.stores || [];
    ADMIN      = json.admin  || {};
    /* โหลด item-master UOM — ต้องโหลดก่อน เพราะใช้กรอง ITEMS_DATA ด้านล่าง */
    try {
      const mres = await fetch('master_uom.json');
      MASTER_UOM = mres.ok ? (await mres.json()) : {};
    } catch(me) { MASTER_UOM = {}; console.warn('master_uom.json load failed:', me.message); }
    /* โหลด indicative cost reference — buyer-facing display only, never written back to Firebase */
    try {
      const cres = await fetch('master_cost.json');
      MASTER_COST = cres.ok ? (await cres.json()) : {};
    } catch(ce) { MASTER_COST = {}; console.warn('master_cost.json load failed:', ce.message); }
    /* โหลดช่วงอ้างอิงต้นทุนรายสาขา — ใช้แสดงผลเทียบเท่านั้น ไม่บันทึกกลับ Firebase */
    try {
      const rres = await fetch('store_reference_band.json');
      REFERENCE_BAND = rres.ok ? (await rres.json()) : {};
    } catch(re) { REFERENCE_BAND = {}; console.warn('store_reference_band.json load failed:', re.message); }
    /* ตรวจรหัสสินค้าซ้ำใน master ก่อนกรอง — ซ้ำที่ระดับ raw list คือปัญหาจริง ไม่ว่าจะผ่าน filter ด้านล่างหรือไม่ */
    ITEM_MASTER_ISSUES = scanItemMasterIssues(json.items || []);
    if(ITEM_MASTER_ISSUES.duplicates.length){
      console.error('[scanItemMasterIssues] duplicate codes found in data.json items:', ITEM_MASTER_ISSUES.duplicates);
    }
    renderMasterDataAlert();
    /* จำกัดรายการนับเฉพาะรายการที่มี master record — ทุกรายการที่เหลือรับประกันว่ามี UOM/pack_size
       จาก master แล้ว หน่วยนับ/ขนาดบรรจุ จึงล็อกเสมอ (ทาง fallback แบบแก้ไขเองยังอยู่ในโค้ด
       แต่ในทางปฏิบัติ unreachable แล้ว เพราะไม่มีรายการไหนไม่มี master อีกต่อไป) */
    ITEMS_DATA = (json.items || []).filter(i => MASTER_UOM[i.code]);
    ALL_CLS = ['ALL', ...new Set(ITEMS_DATA.map(i => i.class).filter(Boolean))]
      .sort((a, b) => {
        if (a === 'ALL') return -1;
        if (b === 'ALL') return 1;
        const na = Number(a), nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    console.log('[loadData] items:', ITEMS_DATA.length, 'stores:', STORES.length);
  } catch (e) {
    console.error('loadData failed:', e);
    const errEl = document.getElementById('loginErr');
    if(errEl){ errEl.textContent='⚠️ โหลดข้อมูลไม่สำเร็จ กรุณา Refresh ('+e.message+')'; errEl.style.display='block'; }
  }
}

/* ════ HELPERS ════ */
function p2(n){return String(n).padStart(2,'0');}
function todayStr(){const d=new Date();return`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;}
function currentYM(){const d=new Date();return`${d.getFullYear()}-${p2(d.getMonth()+1)}`;}
function ymToThai(ym){if(!ym)return'-';const[y,m]=ym.split('-');const months=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];return`${months[parseInt(m)]} ${parseInt(y)+543}`;}
function ymToFull(ym){if(!ym)return'-';const[y,m]=ym.split('-');const months=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];return`${months[parseInt(m)]} ${parseInt(y)+543}`;}
function fNum(n,dec=0){return(Number(n)||0).toLocaleString('th-TH',{minimumFractionDigits:dec,maximumFractionDigits:dec});}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function hlText(t,q){if(!q)return t;try{return t.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark class="hl">$1</mark>');}catch(e){return t;}}
let _tt=null;
function toast(msg,type=''){const el=document.getElementById('toast');el.textContent=msg;el.className='show'+(type?' '+type:'');clearTimeout(_tt);_tt=setTimeout(()=>el.className='',3400);}
function showModal(html,cb){const r=document.getElementById('modalRoot');r.innerHTML=`<div class="modal-bg" id="mbg"><div class="modal">${html}</div></div>`;document.getElementById('mbg').addEventListener('click',e=>{if(e.target.id==='mbg')closeModal();});if(cb)cb(r);}
function closeModal(){document.getElementById('modalRoot').innerHTML='';}
function setBtn(b,on,t='...'){if(!b)return;if(on){b._orig=b.innerHTML;b.innerHTML=t;b.disabled=true;}else{if(b._orig)b.innerHTML=b._orig;b.disabled=false;}}

/* ════ FIREBASE HELPERS ════ */
/* DB_ROOT: '' = production (reads/writes the real root: entries/, monthControl/,
   masterData/…). Set to 'demo' only for local dev against the seeded sandbox.
   NOTE: seed.js is hard-gated to DB_ROOT==='demo' so it can never overwrite real
   data while this is ''. */
const DB_ROOT = '';
async function dbGet(path){if(!fbOk)return null;try{const s=await db.ref(DB_ROOT+'/'+path).once('value');return s.val();}catch(e){console.error('dbGet:',path,e.message);return null;}}
async function dbUpdate(obj){if(!fbOk)return;try{const prefixed={};for(const k in obj){prefixed[DB_ROOT+'/'+k]=obj[k];}await db.ref().update(prefixed);}catch(e){console.error('dbUpdate:',e.message);throw e;}}
async function dbRemove(path){if(!fbOk)return;try{await db.ref(DB_ROOT+'/'+path).remove();}catch(e){throw e;}}
async function dbSet(path,val){if(!fbOk)return;try{await db.ref(DB_ROOT+'/'+path).set(val);}catch(e){throw e;}}
/* ใช้ Firebase push() สร้าง unique key สำหรับ logs — ป้องกัน collision กรณีหลายสาขา save พร้อมกัน */
async function dbPush(path,val){if(!fbOk)return;try{await db.ref(DB_ROOT+'/'+path).push(val);}catch(e){console.error('dbPush:',e.message);}}

/* ════ SESSION ════ */
let SES=null;
const SK='bk_ses_v5';
function saveSes(s){sessionStorage.setItem(SK,JSON.stringify(s));}
function loadSes(){try{return JSON.parse(sessionStorage.getItem(SK));}catch(e){return null;}}
function clearSes(){sessionStorage.removeItem(SK);}

/* ════ FIREBASE CONNECTION STATE ════ */
let FB_ONLINE = true;
let _saveInProgress = false; // ป้องกัน double-click save

function initFBConnectionMonitor(){
  if(!fbOk) return;
  const connRef = db.ref('.info/connected');
  connRef.on('value', snap => {
    FB_ONLINE = snap.val() === true;
    const indicator = document.getElementById('fbConnIndicator');
    if(indicator){
      indicator.textContent = FB_ONLINE ? '🟢 Online' : '🔴 Offline';
      indicator.style.color = FB_ONLINE ? 'var(--green)' : 'var(--red)';
    }
    if(!FB_ONLINE) toast('⚠️ ขาดการเชื่อมต่อ Firebase — ข้อมูลจะบันทึกเมื่อออนไลน์อีกครั้ง','err');
  });
}

/* ════ NAV ════ */
const STORE_NAV=[
  {section:'ภาพรวม'},
  {id:'dashboard', ico:'📊', lbl:'แดชบอร์ด'},
  {section:'ข้อมูล'},
  {id:'entry',     ico:'📝', lbl:'บันทึกการตรวจนับ'},
  {id:'history',   ico:'🗂️', lbl:'ประวัติ / Export'}
];
const ADMIN_NAV=[
  {section:'ภาพรวม'},
  {id:'dashboard',     ico:'📊', lbl:'แดชบอร์ด'},
  {id:'storestatus',   ico:'📋', lbl:'สถานะการบันทึก'},
  {id:'presence',      ico:'👥', lbl:'ผู้ใช้งานออนไลน์'},
  {section:'ข้อมูล'},
  {id:'storedata',     ico:'🔍', lbl:'ข้อมูลการตรวจนับ'},
  {id:'manageitems',   ico:'📦', lbl:'รายการสินค้า'},
  {section:'ตั้งค่า & ดูแลระบบ'},
  {id:'managestores',  ico:'🏪', lbl:'จัดการสาขา'},
  {id:'monthcontrol',  ico:'📅', lbl:'จัดการเดือนที่เปิด/ปิด'},
  {id:'clearall',      ico:'🗑️', lbl:'ล้างข้อมูลทั้งหมด'}
];

/* ════ ENTRY STATE ════ */
let ENTRY_DATA={}, DIRTY=false, SEARCH_Q='', CLS_FILTER='ALL';
let ENTRY_YM = currentYM(); // current month YYYY-MM
let ALL_CLS = [];

/* ════ UOM (§5) — flat dropdown list, exact order from FBK3 extract ════ */
const UOM_LIST = [
  "ลัง", "กล่อง", "ถุง", "แพ็ค", "กระสอบ",
  "ชิ้น", "ฟอง", "ซอง", "ชุด",
  "กรัม", "กิโลกรัม"
];
/* ════ ENTRY NORMALISER (§3) — used on every read; backward-compatible ════
   Legacy bare number/string → { legacy:true, uom:null } — never coerce into a UOM. */
function normalizeEntry(v){
  if(v===null||v===undefined||v==='') return null;
  if(typeof v==='number'||typeof v==='string'){
    return { qty: parseFloat(v)||0, uom: null, pack_size: null, subunit_qty: 0, sub_uom: null, legacy: true, counted_at: null };
  }
  return {
    qty: parseFloat(v.qty)||0,
    uom: (v.uom!=null && v.uom!=='') ? String(v.uom) : null,
    pack_size: (v.pack_size!=null && v.pack_size!=='') ? (parseFloat(v.pack_size)||0) : null,
    subunit_qty: (v.subunit_qty!=null && v.subunit_qty!=='') ? (parseFloat(v.subunit_qty)||0) : 0,
    sub_uom: (v.sub_uom!=null && v.sub_uom!=='') ? String(v.sub_uom) : null,
    legacy: false,
    counted_at: (v.counted_at!=null) ? v.counted_at : null
  };
}

/* ── working-entry helpers (ENTRY_DATA[code] = object | null | undefined) ── */
function isFilled(e){ return e && typeof e==='object' && e.qty!=='' && e.qty!==null && e.qty!==undefined; }
/* master-locked UOM: non-empty MASTER_UOM[code].packtype means หน่วยนับ is locked to this value */
function masterUomOf(code){ const m=MASTER_UOM[code]; return (m && m.packtype) ? m.packtype : null; }
/* master-defined sub-unit label for เศษ (e.g. "ชิ้น") — same locked-denormalization pattern as masterUomOf */
function masterSubUomOf(code){ const m=MASTER_UOM[code]; return (m && m.sub_uom) ? m.sub_uom : null; }
/* master-locked pack size: a valid non-zero MASTER_UOM[code].pack_size means ขนาดบรรจุ is locked to this value */
function masterPackSizeOf(code){ const m=MASTER_UOM[code]; return (m && m.pack_size!=null && Number(m.pack_size)>0) ? Number(m.pack_size) : null; }

/* ═══ ประมาณการต้นทุน (est. cost) — buyer-facing reference only ═══
   Computed at render time from MASTER_COST; never stored on the entry object,
   never sent to doSaveEntry()/Firebase, never summed anywhere. */
function estCostOf(code, e){
  const m = MASTER_UOM[code];
  const c = MASTER_COST[code];
  if(!m || !c || c.cost_vat==null) return null;         // no master record or no cost data → "—"
  const packSize = Number(m.pack_size) || 0;
  const qty    = (e && typeof e==='object' && e.qty!=='' && e.qty!=null) ? Number(e.qty) : 0;
  const subQty = (e && typeof e==='object' && e.subunit_qty!=null) ? Number(e.subunit_qty) : 0;
  const perSubUnit = packSize>0 ? (c.cost_vat / packSize) : 0;
  return qty * c.cost_vat + subQty * perSubUnit;
}
/* shared as_of date for the column-header disclaimer (all entries share one extraction date today) */
function costAsOfDate(){
  const first = Object.values(MASTER_COST)[0];
  return first ? first.as_of : null;
}
function estCostCellContent(code, e){
  // not counted yet → show "—", same as any other empty cell in the row. estCostOf treats
  // a missing qty as 0 (correct for summing into monthTotalCost/exports), but that 0 is not
  // a real value to display here — showing "≈ 0.00" on an untouched row reads as fabricated data.
  if(!isFilled(e)) return { cls:'est-cost-cell muted', html:'—' };
  const cost = estCostOf(code, e);
  if(cost===null) return { cls:'est-cost-cell muted', html:'—' };
  return { cls:'est-cost-cell', html:`≈ ${fNum(cost,2)}` };
}
function estCostCell(code, e){
  const {cls, html} = estCostCellContent(code, e);
  return `<td class="${cls}" id="ec_${esc(code)}">${html}</td>`;
}
/* live single-row cost refresh (mirrors updateFlagCell's old pattern) — keeps input focus, no full re-render */
function updateEstCostCell(code){
  const el = document.getElementById(`ec_${code}`);
  if(!el) return;
  const {cls, html} = estCostCellContent(code, ENTRY_DATA[code]);
  el.className = cls;
  el.innerHTML = html;
}
/* current month's total estimated cost across every counted item — reuses estCostOf,
   no second cost calculation. Display only: never persisted, never exported (yet). */
function monthTotalCost(){
  return ITEMS_DATA.reduce((sum, item) => {
    const entry = ENTRY_DATA[item.code];
    return sum + (entry ? (estCostOf(item.code, entry) || 0) : 0);
  }, 0);
}
/* store cost reference band panel — total vs. historical min/avg/max, out-of-range flag.
   Missing REFERENCE_BAND[storeNo] is the normal case today, not an edge case: never
   fabricate a band, never fall back to another store, never compare against 0. */
function refBandInnerHtml(){
  const total = monthTotalCost();
  const totalHtml = `
    <div class="ref-band-total">
      <div class="ref-band-total-lbl">มูลค่ารวมที่นับได้</div>
      <div class="ref-band-total-val">฿${fNum(total,2)}</div>
    </div>`;

  const band = REFERENCE_BAND[String(SES.no)];
  if(!band){
    return `
      <div class="ref-band-flex">
        ${totalHtml}
        <div class="ref-band-gauge-wrap">
          <div class="ref-band-nodata">ยังไม่มีข้อมูลอ้างอิงสำหรับสาขานี้</div>
        </div>
      </div>`;
  }

  const {min, max, avg, months, period} = band;
  const range = max - min;
  const pctOf = v => range>0 ? Math.min(100, Math.max(0, ((v-min)/range)*100)) : 50;
  const markerPct = pctOf(total);
  const avgPct = pctOf(avg);

  let status, cls;
  if(total < min){ status='ต่ำกว่าค่าต่ำสุด'; cls='amber'; }
  else if(total > max){ status='สูงกว่าค่าสูงสุด'; cls='red'; }
  else { status='อยู่ในช่วงปกติ'; cls='green'; }

  return `
    <div class="ref-band-flex">
      ${totalHtml}
      <div class="ref-band-gauge-wrap">
        <div class="ref-band-statuschip ${cls}">${status}</div>
        <div class="ref-band-track">
          <div class="ref-band-avgtick" style="left:${avgPct}%" title="ค่าเฉลี่ย ${fNum(avg,0)}"></div>
          <div class="ref-band-marker ${cls}" style="left:${markerPct}%"></div>
        </div>
        <div class="ref-band-scale"><span>${fNum(min,0)}</span><span>${fNum(max,0)}</span></div>
        <div class="ref-band-caption">อ้างอิง ${months} เดือน (${period})</div>
      </div>
    </div>`;
}
let _refBandDebounce=null;
function updateReferenceBand(){
  clearTimeout(_refBandDebounce);
  _refBandDebounce = setTimeout(()=>{
    const el = document.getElementById('refBandInner');
    if(el) el.innerHTML = refBandInnerHtml();
  }, 200);
}
/* lazily create a working entry, seeding UOM/pack defaults from MASTER_UOM (matches displayed defaults) */
function ensureEntry(code){
  let e = ENTRY_DATA[code];
  const mu = masterUomOf(code);
  const msu = masterSubUomOf(code);
  const mps = masterPackSizeOf(code);
  if(!e || typeof e!=='object'){
    const m = MASTER_UOM[code];
    e = { qty:'', uom: mu, pack_size: mps!=null?mps:'', subunit_qty:0, sub_uom: msu, counted_at:null, legacy:false };
    ENTRY_DATA[code] = e;
  } else if(!e.legacy){
    // master-locked rows: pin these here too, in case this entry pre-dates the lock
    // (or pre-dates this item having master coverage at all)
    if(mu) e.uom = mu;
    if(msu) e.sub_uom = msu;
    if(mps!=null) e.pack_size = mps;
    if(e.subunit_qty==null) e.subunit_qty = 0;
  }
  return e;
}
/* total quantity in base sub-units — falls back to raw qty for legacy/no-conversion entries */
function totalBaseQty(entry){
  if(!entry || entry.pack_size == null) return entry ? entry.qty : 0;
  return entry.qty * entry.pack_size + (entry.subunit_qty || 0);
}

/* ════ PER-UOM SUBTOTALS (§6) — replaces the meaningless cross-unit sum ════ */
function computeSubtotals(){
  const byUom={}; const bySubUom={}; let filled=0;
  ITEMS_DATA.forEach(it=>{
    const e=ENTRY_DATA[it.code];
    if(isFilled(e)){
      filled++;
      if(e.uom){ byUom[e.uom]=(byUom[e.uom]||0)+Number(e.qty); }
      if(e.subunit_qty && e.sub_uom){ bySubUom[e.sub_uom]=(bySubUom[e.sub_uom]||0)+Number(e.subunit_qty); }
    }
  });
  return { byUom, bySubUom, filled };
}
function subtotalText(){
  const {byUom,bySubUom,filled}=computeSubtotals();
  const parts=UOM_LIST.filter(u=>byUom[u]!=null).map(u=>`${fNum(byUom[u], byUom[u]%1===0?0:2)} ${u}`);
  // include any uom not in UOM_LIST (defensive), preserve remaining
  Object.keys(byUom).forEach(u=>{ if(!UOM_LIST.includes(u)) parts.push(`${fNum(byUom[u], byUom[u]%1===0?0:2)} ${u}`); });
  const sum = parts.length ? parts.join(' · ') : '—';

  const subParts=UOM_LIST.filter(u=>bySubUom[u]!=null).map(u=>`${fNum(bySubUom[u], bySubUom[u]%1===0?0:2)} ${u}`);
  Object.keys(bySubUom).forEach(u=>{ if(!UOM_LIST.includes(u)) subParts.push(`${fNum(bySubUom[u], bySubUom[u]%1===0?0:2)} ${u}`); });
  const subSum = subParts.length ? subParts.join(' · ') : null;   // null → no เศษ line at all

  return { sum, subSum, filled };
}
/* shared footer/live-update formatter, so both the initial render and updateSubtotal stay in sync */
function subtotalLineHtml(s){
  return `รวม: ${s.sum} <span class="muted">(กรอกแล้ว ${s.filled} / ${ITEMS_DATA.length} รายการ)</span>${s.subSum?` &nbsp;|&nbsp; เศษ: ${s.subSum}`:''}`;
}

function fItems(){
  let it=ITEMS_DATA;
  if(CLS_FILTER!=='ALL')it=it.filter(i=>i.class===CLS_FILTER);
  if(SEARCH_Q){const q=SEARCH_Q.toLowerCase();it=it.filter(i=>i.code.toLowerCase().includes(q)||i.name.toLowerCase().includes(q));}
  return it;
}

/* ════ SIDEBAR ════ */
function closeSB(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sbBd').classList.remove('show');}
function setTB(t,s=''){document.getElementById('tbTitle').textContent=t;document.getElementById('tbSub').textContent=s;}
function buildNav(){
  const nav=SES.role==='store'?STORE_NAV:ADMIN_NAV;
  document.getElementById('sbNav').innerHTML=nav.map(n=>{
    if(n.section) return `<div class="nav-section-label">${n.section}</div>`;
    return `<div class="nav-item" data-id="${n.id}"><span class="ico">${n.ico}</span>${n.lbl}</div>`;
  }).join('');
  document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>{go(el.dataset.id);closeSB();}));
}
function setActive(id){document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.id===id));}
let CURVIEW='';
function go(id){CURVIEW=id;setActive(id);({dashboard:renderDashboard,entry:renderEntry,history:renderHistory,storedata:renderStoreData,monthcontrol:renderMonthControl,clearall:renderClearAll,manageitems:renderManageItems,managestores:renderManageStores,storestatus:renderStoreStatus,presence:renderPresence}[id]||function(){})();}

/* ════ AUTH ════ */
function initLogin(){
  document.getElementById('loginForm').addEventListener('submit',e=>{
    e.preventDefault();
    const u=document.getElementById('fUser').value.trim().toLowerCase();
    const p=document.getElementById('fPass').value;
    if(u===ADMIN.u&&p===ADMIN.p){SES={role:'admin',name:ADMIN.name};saveSes(SES);startApp();return;}
    const st=STORES.find(s=>s.u===u&&s.p===p);
    if(st){SES={role:'store',no:st.n,name:st.name,u:st.u};saveSes(SES);startApp();return;}
    const err=document.getElementById('loginErr');err.style.display='block';setTimeout(()=>err.style.display='none',3000);
  });
  document.getElementById('logoutBtn').addEventListener('click',()=>{
    cleanupPresence();
    clearSes();SES=null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('fUser').value='';document.getElementById('fPass').value='';
  });
}
function startApp(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  if(typeof LOGO_URI!=='undefined'){document.getElementById('loginLogo').src=LOGO_URI;document.getElementById('sbLogo').src=LOGO_URI;}
  const isAdmin=SES.role==='admin';
  document.getElementById('sbName').textContent=isAdmin?SES.name:`สาขา ${SES.no} — ${SES.name}`;
  document.getElementById('sbRole').textContent=isAdmin?'ผู้ดูแลระบบ (Admin)':'บัญชีสาขา (Store)';
  const av=document.getElementById('sbAvatar');
  if(isAdmin){av.textContent='👑';av.classList.add('admin');}else{av.textContent='🏪';}
  initFBConnectionMonitor(); // [NEW] monitor connection state
  if(!isAdmin) initPresence(); // เริ่ม presence tracking สำหรับ store
  buildNav();go('dashboard');
}

/* ════ PRESENCE SYSTEM ════
   Firebase path: presence/{storeNo}
   { no, name, loginAt, lastSeen, ua, online:true }
   ใช้ onDisconnect() + .info/connected สำหรับ reliable presence
════════════════════════════════════════════ */
let _presenceRef = null;
let _presenceInterval = null;
let _connectedRef = null;

async function initPresence(){
  if(!fbOk || SES.role !== 'store') return;
  const path = `presence/${SES.no}`;
  _presenceRef = db.ref(DB_ROOT+'/'+path);

  /* ใช้ .info/connected เพื่อรู้ว่า connected จริงๆ ก่อน set presence */
  _connectedRef = db.ref('.info/connected');
  _connectedRef.on('value', async (snap) => {
    if(snap.val() !== true) return;
    /* เมื่อ disconnect → Firebase server จะ set online=false ทันที */
    await _presenceRef.onDisconnect().update({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    /* เขียน presence ทันทีที่ connected */
    await _presenceRef.set({
      no: String(SES.no),
      name: SES.name,
      loginAt: Date.now(),
      lastSeen: Date.now(),
      ua: navigator.userAgent,
      online: true
    });
  });
  /* heartbeat ทุก 30 วินาที */
  _presenceInterval = setInterval(async () => {
    if(_presenceRef && FB_ONLINE){
      try { await _presenceRef.update({ lastSeen: Date.now(), online: true }); }
      catch(e) { /* ignore */ }
    }
  }, 30000);
}

function cleanupPresence(){
  if(_connectedRef){ _connectedRef.off(); _connectedRef = null; }
  if(_presenceRef){
    _presenceRef.onDisconnect().cancel();
    _presenceRef.update({ online: false, lastSeen: Date.now() });
    _presenceRef = null;
  }
  if(_presenceInterval){ clearInterval(_presenceInterval); _presenceInterval = null; }
}

/* ════════════════════════════════════════════
   MONTH CONTROL HELPERS
   Firebase: monthControl/{YYYY-MM}/active = true/false
════════════════════════════════════════════ */
async function getMonthControl(){
  return await dbGet('monthControl') || {};
}
async function isMonthActive(ym){
  const mc = await dbGet(`monthControl/${ym}`);
  return mc && mc.active === true;
}
async function setMonthActive(ym, active){
  await dbSet(`monthControl/${ym}`, { active, updatedBy:'admin', updatedAt: Date.now() });
}

/* สร้างรายการเดือนย้อนหลัง 24 เดือน → ธ.ค. 2030
   ครอบคลุมทั้งอดีต (ย้อนหลัง) + ปัจจุบัน + อนาคต
   → ทำให้ Admin เปิด Active เดือนย้อนหลังได้
   → ทำให้ Store เห็นและบันทึกเดือนย้อนหลังที่ Admin เปิดไว้ได้ */
function generateMonthList(){
  const list=[];
  const now=new Date();
  /* เริ่มจาก 24 เดือนก่อนเดือนปัจจุบัน (ปรับค่าได้ที่ PAST_MONTHS) */
  const PAST_MONTHS = 24;
  const startDate = new Date(now.getFullYear(), now.getMonth() - PAST_MONTHS, 1);
  const endY=2030, endM=11; // ธ.ค. 2030
  let y=startDate.getFullYear(), m=startDate.getMonth(); // 0-indexed
  while(y<endY||(y===endY&&m<=endM)){
    list.push(`${y}-${p2(m+1)}`);
    m++;
    if(m>11){m=0;y++;}
  }
  return list; // ascending: 24 เดือนก่อน → ธ.ค. 2030
}

/* ════════════════════════════════════════════
   STORE DASHBOARD — กราฟรายเดือน
════════════════════════════════════════════ */
async function renderDashboard(){
  const C=document.getElementById('content');
  if(SES.role==='store'){
    await renderStoreDashboard(C);
  } else {
    await renderAdminDashboard(C);
  }
}

async function renderStoreDashboard(C){
  setTB('แดชบอร์ด',`สาขา ${SES.no} — ${SES.name}`);
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';

  const curYM = currentYM();
  const mc = await getMonthControl();
  const curActive = mc[curYM] && mc[curYM].active === true;
  const total = ITEMS_DATA.length;

  // โหลดข้อมูลเดือนปัจจุบัน
  const curData = await dbGet(`entries/${SES.no}/${curYM}`) || {};
  // per-UOM subtotals (§6) — แทนที่ผลรวมข้ามหน่วยที่ไม่มีความหมาย
  const byUom={}; let filledCount=0;
  Object.keys(curData).forEach(k=>{
    const e=normalizeEntry(curData[k]);
    if(e && e.qty!==''&&e.qty!=null){ filledCount++; if(e.uom){ byUom[e.uom]=(byUom[e.uom]||0)+Number(e.qty); } }
  });
  const uomParts=UOM_LIST.filter(u=>byUom[u]!=null).map(u=>`${fNum(byUom[u], byUom[u]%1===0?0:2)} ${u}`);
  Object.keys(byUom).forEach(u=>{ if(!UOM_LIST.includes(u)) uomParts.push(`${fNum(byUom[u], byUom[u]%1===0?0:2)} ${u}`); });
  const uomSummary = uomParts.length ? uomParts.join(' · ') : '—';
  const pct = total>0 ? Math.round(filledCount/total*100) : 0;

  // นับเดือนที่เคยบันทึก
  const allD = await dbGet(`entries/${SES.no}`) || {};
  const savedMonths = Object.keys(allD).filter(k=>/^\d{4}-\d{2}$/.test(k));
  const totalMonths = savedMonths.length;

  const lockBanner = !curActive ? `
    <div class="month-lock-banner">
      <div class="lock-icon">🔒</div>
      <div class="lock-text">
        <div class="lock-title">ยังไม่เปิดให้บันทึกข้อมูลเดือนนี้</div>
        <div class="lock-sub">เดือน ${ymToFull(curYM)} — กรุณารอ Admin เปิดใช้งาน หรือติดต่อผู้ดูแลระบบ</div>
      </div>
    </div>` : '';

  C.innerHTML=`
    ${lockBanner}
    <div class="hero-card" style="margin-bottom:16px">
      <div class="hero-blob"></div>
      <div class="hero-icon">🥐</div>
      <div class="hero-content">
        <div class="hero-lbl">รายการที่บันทึกแล้วเดือนนี้</div>
        <div class="hero-val num">${fNum(filledCount)}<span style="font-size:22px;opacity:.65"> / ${fNum(total)}</span></div>
        <div class="hero-hint">${ymToFull(curYM)} · BAKERY GRP.68,78 · ${curActive?'<span style="color:#7DFFD0">✅ เปิดบันทึก</span>':'<span style="color:#FFCDD2">🔒 ยังไม่เปิด</span>'}</div>
      </div>
      <div class="hero-badge">BAKERY</div>
    </div>

    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-card amber">
        <div class="kpi-lbl">✅ กรอกแล้วเดือนนี้</div>
        <div class="kpi-val">${fNum(filledCount)}</div>
        <div class="kpi-hint">/ ${fNum(total)} รายการ</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">📦 รวมตามหน่วยนับเดือนนี้</div>
        <div class="kpi-val" style="font-size:15px;line-height:1.35;font-family:inherit;font-weight:800">${esc(uomSummary)}</div>
        <div class="kpi-hint">รวมแยกตามหน่วยนับ</div>
      </div>
      <div class="kpi-card ${curActive?'green':'red'}">
        <div class="kpi-lbl">📅 สถานะเดือนนี้</div>
        <div class="kpi-val" style="font-size:20px">${curActive?'✅':'🔒'}</div>
        <div class="kpi-hint">${curActive?'เปิดบันทึกแล้ว':'ยังไม่เปิด'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">🗂️ เดือนที่บันทึกแล้ว</div>
        <div class="kpi-val">${totalMonths}</div>
        <div class="kpi-hint">เดือน (ทั้งหมด)</div>
      </div>
    </div>

    <div class="prog-card" style="margin-bottom:16px">
      <div class="prog-head">
        <div><div class="prog-title">ความครบถ้วนเดือนนี้</div><div class="prog-sub">สาขา ${SES.no} — ${esc(SES.name)}</div></div>
        <div class="prog-pct">${pct}%</div>
      </div>
      <div class="prog-track"><div class="prog-fill" style="width:${Math.min(100,pct)}%"></div></div>
      <div class="prog-labels"><span>0 รายการ</span><span>${fNum(total)} รายการ</span></div>
    </div>

    <button class="btn btn-primary" onclick="go('entry')" ${!curActive?'disabled title="Admin ยังไม่เปิดเดือนนี้"':''} style="${!curActive?'opacity:.55;cursor:not-allowed':''}">
      📝 ${curActive?'เริ่มบันทึกการตรวจนับ':'รอ Admin เปิดเดือนก่อนบันทึก'}
    </button>
    <button class="btn btn-secondary" onclick="exportStoreTemplate()" style="margin-top:10px">
      📋 Export Template รายการสินค้า (สำหรับตรวจสอบล่วงหน้า)
    </button>
    ${(()=>{
      /* แจ้งเตือนถ้ามีเดือนย้อนหลังที่ Admin เปิด Active ไว้ */
      const pastActive = Object.keys(mc).filter(k=>/^\d{4}-\d{2}$/.test(k) && k < curYM && mc[k] && mc[k].active === true);
      if(!pastActive.length) return '';
      return `<div style="margin-top:12px;padding:12px 16px;background:var(--warn-bg);border:1px solid rgba(212,139,10,.25);border-radius:var(--r12);display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">↩️</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--warn)">มีเดือนย้อนหลังที่เปิดรับบันทึก (${pastActive.length} เดือน)</div>
          <div style="font-size:12px;color:var(--txt3);margin-top:2px">
            ${pastActive.sort().reverse().map(m=>ymToFull(m)).join(', ')} — ไปที่ <b>บันทึกการตรวจนับ</b> เพื่อเลือกเดือน
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="go('entry')" style="margin-left:auto;white-space:nowrap">📝 บันทึกย้อนหลัง</button>
      </div>`;
    })()}`;
}

/* ════════════════════════════════════════════
   MONTH CONTROL (Admin) — v5.3
   รองรับเปิด/ปิดเดือนย้อนหลัง + อนาคต
   Dropdown แบ่ง optgroup: ย้อนหลัง / ปัจจุบัน / อนาคต
   default select = เดือนปัจจุบัน
════════════════════════════════════════════ */
async function renderMonthControl(){
  setTB('จัดการเดือน','Month Control — Admin');
  const C=document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  const mc = await getMonthControl();
  const curYM = currentYM();
  const months = generateMonthList(); // ย้อนหลัง 24 เดือน → ธ.ค. 2030

  const activeCount = months.filter(ym=>mc[ym]&&mc[ym].active===true).length;
  const pastMonths    = months.filter(ym=>ym <  curYM).reverse(); // ย้อนหลัง เรียงใหม่ล่าสุดก่อน
  const futureMonths  = months.filter(ym=>ym >  curYM);           // อนาคต

  /* Dropdown แบ่ง 3 กลุ่ม เพื่อให้หาเดือนได้ง่าย */
  const makeOpt = ym => {
    const isAct = mc[ym]&&mc[ym].active===true;
    const icon  = isAct ? '✅' : '🔒';
    return `<option value="${ym}">${icon} ${ym} — ${ymToFull(ym)}</option>`;
  };
  const ymOpts = `
    <optgroup label="📅 เดือนปัจจุบัน">
      ${makeOpt(curYM)}
    </optgroup>
    <optgroup label="↩️ ย้อนหลัง (${pastMonths.length} เดือน)">
      ${pastMonths.map(makeOpt).join('')}
    </optgroup>
    <optgroup label="🔮 อนาคต (${futureMonths.length} เดือน)">
      ${futureMonths.map(makeOpt).join('')}
    </optgroup>`;

  C.innerHTML=`
    <!-- Header card -->
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--blue)">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:36px">📅</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:800;color:var(--txt)">Month Control — จัดการเดือนที่เปิดรับบันทึก</div>
          <div style="font-size:13px;color:var(--txt3);margin-top:4px">
            กำหนดว่าเดือนไหน <b style="color:var(--green)">Active</b> (สาขาบันทึกได้) หรือ <b style="color:var(--red)">Inactive</b> (ดูได้อย่างเดียว)
            — <b>รองรับเดือนย้อนหลัง 24 เดือน</b>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:12px;background:var(--green-bg);color:var(--green);border-radius:999px;padding:3px 10px;font-weight:700">✅ Active: ${activeCount} เดือน</span>
            <span style="font-size:12px;background:var(--surface2);color:var(--txt3);border-radius:999px;padding:3px 10px">📅 ปัจจุบัน: ${ymToFull(curYM)}</span>
            <span style="font-size:12px;background:var(--warn-bg);color:var(--warn);border-radius:999px;padding:3px 10px">↩️ ย้อนหลัง: ${pastMonths.length} เดือน</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="renderMonthControl()">🔄</button>
      </div>
    </div>

    <!-- Quick Action: เปิด/ปิดทีละเดือน -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <div class="card-title">🔧 เปิด / ปิดเดือน</div>
      </div>

      <!-- Dropdown พร้อม optgroup -->
      <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <div style="flex:1;min-width:260px">
          <label class="flabel">📅 เลือกเดือนที่ต้องการจัดการ</label>
          <select class="ctrl w100" id="mcYMSel" style="font-size:13px">
            ${ymOpts}
          </select>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-blue" id="mcOpenBtn" onclick="mcToggleSelected(true)">✅ เปิด Active</button>
          <button class="btn btn-sm" id="mcCloseBtn" style="background:var(--red-bg);color:var(--red);border:1px solid rgba(224,50,68,.2);padding:9px 16px;border-radius:var(--r8);font-weight:600;cursor:pointer" onclick="mcToggleSelected(false)">🔒 ปิด Inactive</button>
        </div>
      </div>

      <!-- Status box แสดงสถานะเดือนที่เลือก realtime -->
      <div id="mcStatusBox" style="padding:14px 18px;border-radius:var(--r12);background:var(--surface2);border:1px solid var(--border2);min-height:60px">
        <div style="font-size:12px;color:var(--txt3)">← เลือกเดือนด้านบน เพื่อดูสถานะและจัดการ</div>
      </div>

      <div style="margin-top:12px;padding:11px 15px;background:var(--warn-bg);border-radius:var(--r8);border:1px solid rgba(212,139,10,.20);font-size:12.5px;color:var(--warn)">
        ⚠️ <b>หมายเหตุ:</b> เมื่อปิดเดือน (Inactive) สาขายังดูข้อมูล / Export ได้ แต่บันทึกหรือแก้ไขไม่ได้
        <br>เมื่อเปิดเดือนย้อนหลัง (Active) สาขาจะเห็นเดือนนั้นใน dropdown บันทึกการตรวจนับและบันทึกย้อนหลังได้ทันที
      </div>
    </div>

    <!-- Batch action: เปิดหลายเดือนพร้อมกัน -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <div class="card-title">⚡ เปิด/ปิดหลายเดือนพร้อมกัน</div>
        <button class="btn btn-secondary btn-sm" onclick="toggleBatchPanel()">▼ แสดง</button>
      </div>
      <div id="batchPanel" style="display:none;margin-top:8px">
        <div style="margin-bottom:10px;font-size:13px;color:var(--txt2)">เลือกเดือนที่ต้องการ แล้วกด <b>เปิดทั้งหมดที่เลือก</b> หรือ <b>ปิดทั้งหมดที่เลือก</b></div>
        <div id="batchCheckboxes" style="display:flex;flex-wrap:wrap;gap:6px;max-height:220px;overflow-y:auto;padding:4px 0">
          ${months.map(ym=>{
            const isAct = mc[ym]&&mc[ym].active===true;
            const isPast = ym < curYM;
            const isCur  = ym === curYM;
            const bg = isCur?'var(--blue-xl)':isPast?'var(--warn-bg)':'var(--surface2)';
            const col = isCur?'var(--blue)':isPast?'var(--warn)':'var(--txt2)';
            return `<label style="display:inline-flex;align-items:center;gap:6px;background:${bg};border:1px solid var(--border2);border-radius:var(--r8);padding:5px 10px;cursor:pointer;font-size:12px;color:${col};font-weight:600">
              <input type="checkbox" data-ym="${ym}" style="accent-color:var(--blue)">
              ${isAct?'✅':'🔒'} ${ymToFull(ym)}${isCur?' ⭐':''}${isPast?' ↩️':''}
            </label>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-blue btn-sm" onclick="batchSelectAll(true)">☑️ เลือกทั้งหมด</button>
          <button class="btn btn-secondary btn-sm" onclick="batchSelectAll(false)">☐ ยกเลิกทั้งหมด</button>
          <div style="flex:1"></div>
          <button class="btn btn-blue" onclick="doBatchToggle(true)">✅ เปิดที่เลือกทั้งหมด</button>
          <button class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid rgba(224,50,68,.2);padding:9px 16px;border-radius:var(--r8);font-weight:600;cursor:pointer" onclick="doBatchToggle(false)">🔒 ปิดที่เลือกทั้งหมด</button>
        </div>
      </div>
    </div>

    <!-- รายการเดือนที่ Active ทั้งหมด -->
    <div class="card">
      <div class="card-head"><div class="card-title">✅ เดือนที่เปิด Active <span class="sub">${activeCount} เดือน</span></div></div>
      <div id="activeMonthList">
        ${buildActiveMonthList(months, mc)}
      </div>
    </div>`;

  /* ── ผูก event: select แสดงสถานะ realtime ── */
  const selEl = document.getElementById('mcYMSel');
  // set default = เดือนปัจจุบัน
  selEl.value = curYM;

  function updateStatusBox(){
    const ym  = selEl.value;
    const isAct = mc[ym]&&mc[ym].active===true;
    const isPast = ym < curYM;
    const isCur  = ym === curYM;
    const isFut  = ym > curYM;
    const typeLabel = isCur
      ? '<span style="font-size:11px;background:var(--blue-xl);color:var(--blue);border-radius:999px;padding:2px 8px;margin-left:6px">ปัจจุบัน</span>'
      : isPast
        ? '<span style="font-size:11px;background:var(--warn-bg);color:var(--warn);border-radius:999px;padding:2px 8px;margin-left:6px">↩️ ย้อนหลัง</span>'
        : '<span style="font-size:11px;background:var(--surface3);color:var(--txt3);border-radius:999px;padding:2px 8px;margin-left:6px">🔮 อนาคต</span>';
    document.getElementById('mcStatusBox').innerHTML=`
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:32px">${isAct?'✅':'🔒'}</span>
        <div style="flex:1">
          <div style="font-weight:800;font-size:15px;color:var(--txt);display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            ${ymToFull(ym)} ${typeLabel}
          </div>
          <div style="font-size:13px;color:${isAct?'var(--green)':'var(--red)'};font-weight:700;margin-top:4px">
            ${isAct?'Active — สาขาบันทึกได้ตอนนี้':'Inactive — สาขาบันทึกไม่ได้'}
          </div>
          <div style="font-size:12px;color:var(--txt3);margin-top:2px">${ym}</div>
        </div>
        <div style="display:flex;gap:8px">
          ${!isAct?`<button class="btn btn-blue btn-sm" onclick="mcToggleSelected(true)">✅ เปิด Active</button>`:''}
          ${isAct ?`<button class="btn btn-sm" style="background:var(--red-bg);color:var(--red);border:1px solid rgba(224,50,68,.2);padding:7px 14px;border-radius:var(--r8);font-weight:600;cursor:pointer;font-size:12px" onclick="mcToggleSelected(false)">🔒 ปิด Inactive</button>`:''}
        </div>
      </div>`;
  }

  selEl.addEventListener('change', updateStatusBox);
  updateStatusBox(); // trigger ครั้งแรก
}

/* ── Batch panel toggle ── */
function toggleBatchPanel(){
  const p = document.getElementById('batchPanel');
  const btn = p.previousElementSibling.querySelector('button');
  if(p.style.display==='none'){ p.style.display='block'; if(btn) btn.textContent='▲ ซ่อน'; }
  else { p.style.display='none'; if(btn) btn.textContent='▼ แสดง'; }
}
function batchSelectAll(checked){
  document.querySelectorAll('#batchCheckboxes input[type=checkbox]')
    .forEach(cb=>cb.checked=checked);
}
async function doBatchToggle(active){
  const checked=[...document.querySelectorAll('#batchCheckboxes input[type=checkbox]:checked')]
    .map(cb=>cb.dataset.ym);
  if(!checked.length){ toast('ยังไม่ได้เลือกเดือน','err'); return; }
  const label = active?'เปิด Active':'ปิด Inactive';
  const icon  = active?'✅':'🔒';
  showModal(`
    <h3>${icon} ยืนยัน Batch ${label}</h3>
    <p style="color:var(--txt2);margin-top:10px">
      ต้องการ <b>${label}</b> จำนวน <b>${checked.length} เดือน</b> ใช่หรือไม่?<br>
      <span style="font-size:12px;color:var(--txt3)">${checked.map(ym=>ymToFull(ym)).join(', ')}</span>
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn ${active?'btn-blue':'btn-danger'}" onclick="doBatchConfirm(${JSON.stringify(checked)},${active})">${icon} ยืนยัน</button>
    </div>`);
}
async function doBatchConfirm(yms, active){
  closeModal();
  let ok=0, fail=0;
  for(const ym of yms){
    try{ await setMonthActive(ym, active); ok++; }
    catch(e){ fail++; }
  }
  toast(`${active?'✅ เปิด':'🔒 ปิด'} ${ok} เดือน สำเร็จ${fail?` (ล้มเหลว ${fail})`:''}`, ok>0?'ok':'err');
  renderMonthControl();
}

function buildActiveMonthList(months, mc){
  const actives=months.filter(ym=>mc[ym]&&mc[ym].active===true).slice().reverse(); // เรียงใหม่ล่าสุดก่อน
  if(!actives.length) return '<div style="padding:16px;text-align:center;color:var(--txt3);font-size:13px">ยังไม่มีเดือนที่เปิด Active</div>';
  const curYM=currentYM();
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0">
    ${actives.map(ym=>{
      const isPast = ym < curYM;
      const isCur  = ym === curYM;
      const isFut  = ym > curYM;
      return `
      <div style="display:inline-flex;align-items:center;gap:8px;background:${isPast?'var(--warn-bg)':'var(--green-bg)'};border:1px solid ${isPast?'rgba(212,139,10,.25)':'rgba(13,159,110,.20)'};border-radius:var(--r8);padding:7px 13px">
        <span style="font-size:12.5px;font-weight:700;color:${isPast?'var(--warn)':'var(--green)'}">${ymToFull(ym)}</span>
        ${isCur?'<span style="font-size:10px;background:var(--blue-xl);color:var(--blue);border-radius:999px;padding:1px 7px">ปัจจุบัน</span>':''}
        ${isPast?'<span style="font-size:10px;background:rgba(212,139,10,.15);color:var(--warn);border-radius:999px;padding:1px 7px">ย้อนหลัง</span>':''}
        ${isFut?'<span style="font-size:10px;background:var(--surface3);color:var(--txt3);border-radius:999px;padding:1px 7px">อนาคต</span>':''}
        <button onclick="toggleMonth('${ym}',false)" style="background:none;border:none;cursor:pointer;color:var(--txt4);font-size:13px;padding:0;line-height:1" title="ปิดเดือนนี้">✕</button>
      </div>`;
    }).join('')}
  </div>`;
}

async function mcToggleSelected(active){
  const sel=document.getElementById('mcYMSel');
  if(!sel)return;
  const ym=sel.value;
  await toggleMonth(ym, active);
}

async function toggleMonth(ym, active){
  const label = active ? 'เปิด (Active)' : 'ปิด (Inactive)';
  const icon  = active ? '✅' : '🔒';
  const curYM = currentYM();
  const isPast = ym < curYM;
  const isCur  = ym === curYM;
  const typeTag = isCur
    ? '<span style="font-size:11px;background:var(--blue-xl);color:var(--blue);border-radius:999px;padding:2px 8px;margin-left:6px">เดือนปัจจุบัน</span>'
    : isPast
      ? '<span style="font-size:11px;background:var(--warn-bg);color:var(--warn);border-radius:999px;padding:2px 8px;margin-left:6px">↩️ ย้อนหลัง</span>'
      : '<span style="font-size:11px;background:var(--surface3);color:var(--txt3);border-radius:999px;padding:2px 8px;margin-left:6px">🔮 อนาคต</span>';
  showModal(`
    <h3>${icon} ยืนยันการ${label}</h3>
    <p style="color:var(--txt2);margin-top:12px">
      ต้องการ <b>${label}</b> เดือน<br>
      <span style="font-size:16px;font-weight:800;color:var(--txt)">${ymToFull(ym)}</span> ${typeTag}
    </p>
    <p style="margin-top:10px;font-size:13px">
      ${active
        ? '<span style="color:var(--green)">→ สาขาทุกสาขา จะสามารถบันทึก / แก้ไขข้อมูลเดือนนี้ได้ทันที</span>'
        : '<span style="color:var(--red)">→ สาขาทุกสาขา จะไม่สามารถบันทึก / แก้ไขข้อมูลเดือนนี้ได้ (ยังดูและ Export ได้ปกติ)</span>'
      }
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn ${active?'btn-blue':'btn-danger'}" onclick="doToggleMonth('${ym}',${active})">${icon} ยืนยัน</button>
    </div>`);
}

async function doToggleMonth(ym, active){
  closeModal();
  try{
    await setMonthActive(ym, active);
    toast(`${active?'✅ เปิด':'🔒 ปิด'} เดือน ${ymToFull(ym)} แล้ว`,'ok');
    // refresh view ที่กำลังแสดงอยู่
    if(CURVIEW==='monthcontrol') renderMonthControl();
    else if(CURVIEW==='dashboard') go('dashboard');
  }catch(e){
    toast('เกิดข้อผิดพลาด: '+e.message,'err');
  }
}

/* ════════════════════════════════════════════
   ENTRY (Monthly)
════════════════════════════════════════════ */
async function renderEntry(){
  setTB('บันทึกการตรวจนับ',`สาขา ${SES.no}`);
  const C=document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';

  // โหลดข้อมูลเดือน + ตรวจสอบสถานะ
  const mc = await getMonthControl();

  // หาเดือนที่ Active ทั้งหมด (ครอบคลุมย้อนหลัง 24 เดือนแล้ว)
  const activeMonths = generateMonthList().filter(ym => mc[ym] && mc[ym].active === true);
  // เดือนที่เคยมีข้อมูลแล้ว
  const allStoreData = await dbGet(`entries/${SES.no}`) || {};
  const savedMonths = Object.keys(allStoreData).filter(ym => /^\d{4}-\d{2}$/.test(ym));

  // รวม: Active + ที่เคยบันทึก (edit ได้แม้ inactive)
  const editableMonths = [...new Set([...activeMonths, ...savedMonths])].sort().reverse();

  // ถ้าไม่มีเดือนไหนเลย
  if(!editableMonths.length){
    ENTRY_YM = currentYM();
    C.innerHTML=`
      <div class="month-lock-banner">
        <div class="lock-icon">🔒</div>
        <div class="lock-text">
          <div class="lock-title">ยังไม่เปิดให้บันทึกข้อมูล</div>
          <div class="lock-sub">ยังไม่มีเดือนไหนที่ Admin เปิด Active ไว้ กรุณารอ Admin เปิดเดือนที่ต้องการก่อน (รองรับย้อนหลังได้)</div>
        </div>
      </div>
      <div class="card tc" style="padding:32px;color:var(--txt3)">
        <div style="font-size:48px;margin-bottom:12px">📅</div>
        <div style="font-size:15px;font-weight:700;color:var(--txt);margin-bottom:8px">ยังไม่มีเดือนที่เปิดให้บันทึก</div>
        <div style="font-size:13px">กรุณาติดต่อ Admin เพื่อเปิด Active เดือนที่ต้องการ (สามารถเปิดย้อนหลังได้)</div>
      </div>`;
    return;
  }

  /* เลือก default เดือนอัจฉริยะ:
     1. ถ้าเดือนที่กำลัง select อยู่ยังอยู่ใน list → คงไว้
     2. ถ้าเดือนปัจจุบันมีใน editableMonths → เลือกเดือนปัจจุบัน
     3. ไม่งั้นเลือกเดือน Active ล่าสุด (index 0 หลัง sort().reverse()) */
  if(!editableMonths.includes(ENTRY_YM)){
    const curYM = currentYM();
    ENTRY_YM = editableMonths.includes(curYM) ? curYM : editableMonths[0];
  }

  await loadEntryForMonth(ENTRY_YM, editableMonths, mc, C);
}

async function loadEntryForMonth(ym, editableMonths, mc, C){
  ENTRY_YM = ym;
  const isActive = mc[ym] && mc[ym].active === true;
  const data = await dbGet(`entries/${SES.no}/${ym}`) || {};
  // normalize current month into working objects (§3)
  ENTRY_DATA = {};
  for(const code in data){ const n=normalizeEntry(data[code]); if(n) ENTRY_DATA[code]=n; }
  // master-locked UOM: pin current-month uom to master. Covers rows saved before the
  // lock existed or before this item had master coverage. Never touches legacy rows —
  // legacy values are never coerced into a UOM.
  for(const code in ENTRY_DATA){
    const e = ENTRY_DATA[code];
    if(e.legacy) continue;
    const mu = masterUomOf(code);
    if(mu) e.uom = mu;
    const msu = masterSubUomOf(code);
    if(msu) e.sub_uom = msu;
    if(e.subunit_qty==null) e.subunit_qty = 0;
  }
  DIRTY = false;
  buildEntryView(C, editableMonths, mc, isActive);
}

function buildEntryView(C, editableMonths, mc, isActive){
  const items=fItems();
  const fAll=ITEMS_DATA.filter(i=>isFilled(ENTRY_DATA[i.code])).length;
  const fView=items.filter(i=>isFilled(ENTRY_DATA[i.code])).length;
  const sub=subtotalText();
  const clsOpts=ALL_CLS.map(c=>`<option value="${c}" ${CLS_FILTER===c?'selected':''}>${c==='ALL'?`ทั้งหมด (${ITEMS_DATA.length})`:`Class ${c} (${ITEMS_DATA.filter(i=>i.class===c).length})`}</option>`).join('');
  const curYM = currentYM();

  // Month selector options — แสดง label ย้อนหลัง / ปัจจุบัน / อนาคต
  const ymOpts = editableMonths.map(ym=>{
    const isPast = ym < curYM;
    const isCur  = ym === curYM;
    const isAct  = mc[ym] && mc[ym].active === true;
    let label = ymToFull(ym);
    if(isCur)  label += ' ⭐ (ปัจจุบัน)';
    if(isPast) label += ' ↩️ (ย้อนหลัง)';
    if(!isAct) label += ' 🔒';
    return `<option value="${ym}" ${ENTRY_YM===ym?'selected':''}>${label}</option>`;
  }).join('');

  const lockWarning = !isActive ? `
    <div style="background:var(--warn-bg);border:1px solid rgba(212,139,10,.25);border-radius:var(--r12);padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">⚠️</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--warn)">เดือนนี้อยู่ในโหมดดูอย่างเดียว (Inactive)</div>
        <div style="font-size:12px;color:var(--txt3)">เดือน ${ymToFull(ENTRY_YM)} Admin ยังไม่ได้เปิด Active — ดูข้อมูลที่บันทึกไว้ได้ แต่ยังแก้ไขไม่ได้</div>
      </div>
    </div>` : '';

  C.innerHTML=`
    ${lockWarning}
    <div class="card ref-band-card" style="margin-bottom:14px">
      <div id="refBandInner">${refBandInnerHtml()}</div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">📝 บันทึกจำนวนสินค้า <span class="sub">GRP.68,78</span></div>
        <div class="flex gap8 items-c" style="flex-wrap:wrap">
          <div class="dirty-badge ${DIRTY?'show':''}" id="dirtyBadge">⚠️ มีการแก้ไข</div>
          ${isActive?`<button class="btn btn-secondary btn-sm" onclick="clearAllQty()">🗑️ ล้าง</button>`:''}
          ${isActive?`<button class="btn btn-primary" id="saveBtn" onclick="doSaveEntry()">💾 บันทึก</button>`:''}
        </div>
      </div>
      <div class="filter-bar">
        <div>
          <label class="flabel">📅 เดือนที่บันทึก</label>
          <select class="ctrl" id="entryYMSel" onchange="onYMChange(this.value)" style="min-width:180px">
            ${ymOpts}
          </select>
        </div>
        <div><label class="flabel">🏷️ Class</label><select class="ctrl" id="clsSel" onchange="onClsChange(this.value)">${clsOpts}</select></div>
        <div class="flex-1"><label class="flabel">🔍 ค้นหา</label><div class="search-wrap"><span class="search-ico">🔍</span><input type="text" class="ctrl" id="searchInp" placeholder="ชื่อสินค้า หรือ รหัส..." value="${esc(SEARCH_Q)}" oninput="onSearch(this.value)"></div></div>
      </div>
      <div class="info-bar">
        <span id="infoTxt">เดือน <strong>${ymToFull(ENTRY_YM)}</strong> · กรอกแล้ว <strong>${fView}</strong> / ${items.length} · ทั้งหมด <strong>${fAll}</strong> / ${ITEMS_DATA.length}</span>
        <span style="font-size:12px;color:${isActive?'var(--green)':'var(--warn)'};font-weight:700">${isActive?'✅ Active':'🔒 Inactive'}</span>
      </div>
      <div class="tbl-wrap entry-tbl-wrap">
        <table class="dtbl">
          <thead><tr><th style="width:40px">No.</th><th style="width:56px">Class</th><th style="width:88px">รหัส</th><th>ชื่อสินค้า</th><th style="width:96px;text-align:right">จำนวน</th><th style="width:118px">หน่วยนับ</th><th style="width:110px">เศษ</th><th style="width:92px;text-align:right">ขนาดบรรจุ</th><th style="width:120px">อ้างอิง</th><th style="width:150px">ประมาณการต้นทุน (est.)<div class="cost-disclaimer">ราคาโดยประมาณ ณ ${esc(costAsOfDate()||'-')} — ไม่ใช่มูลค่าอย่างเป็นทางการ</div></th></tr></thead>
          <tbody id="entryBody">${buildEntryRows(items, isActive)}</tbody>
          <tfoot><tr><td colspan="10" class="entry-subtotal"><span id="subTotal">${subtotalLineHtml(sub)}</span></td></tr></tfoot>
        </table>
      </div>
    </div>`;
}

/* อ้างอิง cell — "120 ชิ้น/ลัง" from master, or "—" if no master record (§6) */
function refCell(code){
  const m=MASTER_UOM[code];
  if(!m) return `<td class="ref-cell muted">—</td>`;
  return `<td class="ref-cell">${fNum(m.pack_size)} ${esc(m.sub_uom||'')}/${esc(m.packtype||'')}</td>`;
}
/* หน่วยนับ <select> from UOM_LIST, default = selected value or blank */
function uomSelect(code, selected){
  const opts = [`<option value="">— เลือกหน่วย —</option>`]
    .concat(UOM_LIST.map(u=>`<option value="${esc(u)}" ${selected===u?'selected':''}>${esc(u)}</option>`))
    .join('');
  return `<select class="uom-sel" id="u_${esc(code)}" onchange="onUom('${esc(code)}',this.value)">${opts}</select>`;
}

function buildEntryRows(items, isActive=true){
  if(!items.length)return`<tr><td colspan="10" class="tc muted" style="padding:28px">ไม่พบรายการ</td></tr>`;
  return items.map((it,idx)=>{
    const code=it.code;
    const m=MASTER_UOM[code];
    const e=ENTRY_DATA[code];                        // object | null | undefined
    const filled=isFilled(e);
    const qv=filled ? e.qty : '';
    const isLegacy = e && typeof e==='object' && e.legacy;
    const masterUom = masterUomOf(code);   // non-null → หน่วยนับ is locked to this value
    // defaults: master lock → stored value → blank (never for legacy — never coerce into a UOM)
    const uomVal  = (!isLegacy && masterUom) ? masterUom
                  : (e&&typeof e==='object') ? (e.uom||'') : '';
    const packVal = (e&&typeof e==='object' && e.pack_size!=null && e.pack_size!=='') ? e.pack_size
                    : ((!e||typeof e!=='object') && m && m.pack_size!=null ? m.pack_size : '');
    const masterPackSize = masterPackSizeOf(code);
    const packLocked = !isLegacy && masterPackSize!=null;
    const msu = masterSubUomOf(code);
    const subunitVal = (e&&typeof e==='object' && e.subunit_qty!=null) ? e.subunit_qty : 0;
    // เศษ is disabled for legacy rows too — same "never coerce" reasoning as หน่วยนับ:
    // a legacy row has no recorded sub_uom, nothing to attach a เศษ count to.
    const subunitEnabled = !isLegacy && !!msu;
    const psz = packLocked ? masterPackSize : (packVal!=='' ? Number(packVal) : null);
    const dupBadge = isDuplicateItemCode(code)
      ? ` <span class="uom-warn" title="รหัสสินค้านี้ซ้ำกับรายการอื่นในรายการหลัก — แจ้ง Admin เพื่อแก้ไข">รหัสซ้ำ</span>` : '';
    const nameCell=`<td class="name-cell">${SEARCH_Q?hlText(esc(it.name),SEARCH_Q):esc(it.name)}${dupBadge}</td>`;
    const head=`<td class="code-cell">${it.no}</td><td><span class="cls-badge">${esc(it.class)}</span></td><td class="code-cell">${esc(code)}</td>${nameCell}`;

    // หน่วยนับ cell — same markup regardless of month-active state:
    //  legacy        → warning chip (unchanged)
    //  master-locked → non-interactive, styled like อ้างอิง — never a <select>
    //  no master     → <select> when editable, plain text when read-only
    let uomCell;
    if(isLegacy){
      uomCell = `<td><span class="uom-warn">หน่วยไม่ระบุ</span></td>`;
    } else if(masterUom){
      uomCell = `<td class="ref-cell">${esc(masterUom)}</td>`;
    } else if(isActive){
      uomCell = `<td>${uomSelect(code, uomVal)}</td>`;
    } else {
      uomCell = `<td class="ro-cell">${uomVal?esc(uomVal):'—'}</td>`;
    }

    // เศษ cell — numeric entry only when master defines a sub_uom (and not a legacy row);
    // otherwise same visual treatment as an empty อ้างอิง cell, no input accepted.
    let subunitCell;
    if(!subunitEnabled){
      subunitCell = `<td class="ref-cell muted">—</td>`;
    } else if(!isActive){
      subunitCell = `<td class="ro-cell">${filled?`${fNum(subunitVal)} ${esc(msu)}`:'—'}</td>`;
    } else {
      const warn = subunitWarnText(subunitVal, psz);
      subunitCell = `<td>
        <div class="subunit-wrap">
          <input class="subunit-inp" type="number" min="0" step="1" id="su_${esc(code)}" value="${esc(String(subunitVal))}" onchange="onSubunit('${esc(code)}',this.value)" onkeydown="navSubunit(event,${idx})">
          <span class="subunit-suffix">${esc(msu)}</span>
        </div>
        <div class="subunit-warn-text" id="sw_${esc(code)}">${warn}</div>
      </td>`;
    }

    // ขนาดบรรจุ cell — same markup regardless of month-active state:
    //  master-locked (non-legacy) → non-interactive, styled like อ้างอิง/หน่วยนับ — never an <input>
    //  otherwise                  → numeric input when editable, plain read-only number otherwise
    let packCell;
    if(packLocked){
      packCell = `<td class="ref-cell">${fNum(masterPackSize)}</td>`;
    } else if(isActive){
      packCell = `<td class="tr"><input class="pack-inp" type="number" min="0" step="1" id="p_${esc(code)}" value="${esc(String(packVal))}" onchange="onPack('${esc(code)}',this.value)"></td>`;
    } else {
      packCell = `<td class="tr num ${packVal!==''?'':'muted'}" style="font-family:var(--mono)">${packVal!==''?fNum(packVal):'—'}</td>`;
    }

    if(!isActive){
      // ── readonly (inactive/past month) ──
      return`<tr>${head}<td class="tr num ${filled?'':'muted'}" style="font-family:var(--mono)">${filled?fNum(Number(qv), Number(qv)%1===0?0:2):'—'}</td>${uomCell}${subunitCell}${packCell}${refCell(code)}${estCostCell(code,e)}</tr>`;
    }

    // ── editable (active month) ──
    const qtyCell=`<td class="tr"><input class="qty-inp${filled?' filled':''}" type="number" min="0" step="1" id="q_${esc(code)}" value="${esc(String(qv))}" onchange="onQty('${esc(code)}',this.value)" onkeydown="navRow(event,${idx})"></td>`;
    return`<tr>${head}${qtyCell}${uomCell}${subunitCell}${packCell}${refCell(code)}${estCostCell(code,e)}</tr>`;
  }).join('');
}
/* soft, non-blocking validation — not a flag chip */
function subunitWarnText(subQty, packSize){
  if(packSize==null || !(packSize>0)) return '';
  if(Number(subQty) >= Number(packSize)) return `⚠️ เศษ ≥ ขนาดบรรจุ — ควรนับเป็นแพ็คเต็มแทน`;
  return '';
}

function refreshEntryBody(){
  // ต้องรู้ว่า isActive ไหม — อ่านจาก UI state
  const activeLabel = document.querySelector('.info-bar span[style]');
  const isActive = activeLabel ? activeLabel.textContent.includes('Active') && !activeLabel.textContent.includes('Inactive') : true;
  const items=fItems();
  const tbody=document.getElementById('entryBody');if(tbody)tbody.innerHTML=buildEntryRows(items, isActive);
  const fAll=ITEMS_DATA.filter(i=>isFilled(ENTRY_DATA[i.code])).length;
  const fView=items.filter(i=>isFilled(ENTRY_DATA[i.code])).length;
  const it2=document.getElementById('infoTxt');if(it2)it2.innerHTML=`เดือน <strong>${ymToFull(ENTRY_YM)}</strong> · กรอกแล้ว <strong>${fView}</strong> / ${items.length} · ทั้งหมด <strong>${fAll}</strong> / ${ITEMS_DATA.length}`;
  updateSubtotal();
}

function updateSubtotal(){ const el=document.getElementById('subTotal'); if(el){ el.innerHTML=subtotalLineHtml(subtotalText()); } }
function updateSubunitWarn(code){
  const el=document.getElementById(`sw_${code}`); if(!el) return;
  const e=ENTRY_DATA[code];
  const psz=(e&&e.pack_size!=null&&e.pack_size!=='')?Number(e.pack_size):null;
  const subQty=(e&&e.subunit_qty!=null)?e.subunit_qty:0;
  el.textContent = subunitWarnText(subQty, psz);
}
function markDirty(){ DIRTY=true; const db2=document.getElementById('dirtyBadge'); if(db2)db2.className='dirty-badge show'; }

async function onYMChange(ym){
  ENTRY_YM=ym;
  const C=document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  const mc = await getMonthControl();
  const allStoreData = await dbGet(`entries/${SES.no}`) || {};
  const savedMonths = Object.keys(allStoreData).filter(ym2 => /^\d{4}-\d{2}$/.test(ym2));
  const activeMonths = generateMonthList().filter(ym2 => mc[ym2] && mc[ym2].active === true);
  const editableMonths = [...new Set([...activeMonths, ...savedMonths])].sort().reverse();
  await loadEntryForMonth(ym, editableMonths, mc, C);
}

function onClsChange(v){CLS_FILTER=v;refreshEntryBody();}
function onSearch(v){SEARCH_Q=v.trim();refreshEntryBody();}
function onQty(code,val){
  const e=ensureEntry(code);
  // จำนวน is whole packs only — เศษ already carries the fractional/partial-pack amount
  e.qty = val===''?'':(Math.round(parseFloat(val))||0);
  markDirty();
  const inp=document.getElementById(`q_${code}`);
  if(inp){
    inp.classList.toggle('filled',val!=='');
    if(val!=='') inp.value = e.qty; // snap the displayed value if a decimal was typed/pasted in
  }
  updateSubtotal();
  updateEstCostCell(code);
  updateReferenceBand();
}
function onUom(code,val){ const e=ensureEntry(code); e.uom=val||null; markDirty(); updateSubtotal(); }
function onPack(code,val){ const e=ensureEntry(code); e.pack_size = val===''?'':(parseFloat(val)||0); markDirty(); updateSubunitWarn(code); }
function onSubunit(code,val){
  const e=ensureEntry(code);
  e.subunit_qty = val===''?0:(parseFloat(val)||0);
  markDirty();
  updateSubtotal(); updateSubunitWarn(code);
  updateEstCostCell(code);
  updateReferenceBand();
}
function navRow(e,idx){
  const items=fItems();
  if(e.key==='Enter'||e.key==='ArrowDown'||e.key==='Tab'){
    if(e.key==='Tab' && e.shiftKey) return;   // let native Shift+Tab behave normally
    e.preventDefault();
    const cur=items[idx];
    if(cur && masterSubUomOf(cur.code)){
      const su=document.getElementById(`su_${cur.code}`);
      if(su){ su.focus(); return; }
    }
    const n=document.getElementById(`q_${items[idx+1]?.code}`);
    if(n)n.focus();
  }else if(e.key==='ArrowUp'){
    e.preventDefault();
    const p=document.getElementById(`q_${items[idx-1]?.code}`);
    if(p)p.focus();
  }
}
function navSubunit(e,idx){
  const items=fItems();
  if(e.key==='Enter'||e.key==='ArrowDown'||e.key==='Tab'){
    if(e.key==='Tab' && e.shiftKey) return;
    e.preventDefault();
    const n=document.getElementById(`q_${items[idx+1]?.code}`);
    if(n)n.focus();
  }else if(e.key==='ArrowUp'){
    e.preventDefault();
    const cur=items[idx];
    const q=cur?document.getElementById(`q_${cur.code}`):null;
    if(q)q.focus();
  }
}
function clearAllQty(){showModal(`<h3>🗑️ ล้างข้อมูลเดือน ${ymToFull(ENTRY_YM)}</h3><p style="color:var(--txt2);margin-top:8px">ต้องการล้างจำนวนที่บันทึกทั้งหมดใช่หรือไม่?</p><div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button><button class="btn btn-danger" onclick="confirmClear()">ล้างข้อมูล</button></div>`);}
async function confirmClear(){
  ITEMS_DATA.forEach(i=>{ENTRY_DATA[i.code]=null;});
  markDirty();
  closeModal();
  refreshEntryBody();
  await doSaveEntry(); // erase takes effect immediately — reuses the normal save path (month-active recheck, retry, offline guard), no separate save click required
}

async function doSaveEntry(){
  if(_saveInProgress){ toast('กำลังบันทึกอยู่ กรุณารอสักครู่...','err'); return; }
  if(!FB_ONLINE){ toast('❌ ขาดการเชื่อมต่อ Firebase — กรุณาตรวจสอบเครือข่าย','err'); return; }
  _saveInProgress = true;
  const btn=document.getElementById('saveBtn');setBtn(btn,true,'💾 กำลังบันทึก...');
  // ตรวจสอบ active อีกครั้งก่อน save
  const isActive = await isMonthActive(ENTRY_YM);
  if(!isActive){ toast('เดือนนี้ Admin ยังไม่เปิด Active — ไม่สามารถบันทึกได้','err'); setBtn(btn,false); _saveInProgress=false; return; }

  /* ══ แต่ละสาขาเขียนเฉพาะ path ของตัวเอง (entries/{storeNo}/...)
     Firebase Multi-path update ที่ไม่ overlap กัน = Atomic + Concurrent-safe ══
     ── §3 new object shape: {qty, uom, pack_size, counted_at}; cleared rows → null ── */
  const upd={};
  ITEMS_DATA.forEach(i=>{
    const e=ENTRY_DATA[i.code];
    const path=`entries/${SES.no}/${ENTRY_YM}/${i.code}`;
    if(!isFilled(e)){ upd[path]=null; return; }
    const lockedPack = (!e.legacy) ? masterPackSizeOf(i.code) : null;
    upd[path]={
      qty: Number(e.qty)||0,
      uom: (!e.legacy && masterUomOf(i.code)) || e.uom || null, // master-locked rows always save the master uom
      pack_size: (lockedPack!=null) ? lockedPack : ((e.pack_size!==''&&e.pack_size!=null) ? Number(e.pack_size) : null),
      subunit_qty: Number(e.subunit_qty) || 0,
      sub_uom: (!e.legacy && masterSubUomOf(i.code)) || null,   // denormalized from master, same pattern as uom
      counted_at: e.counted_at || Date.now()
    };
  });

  let retries=0;
  const MAX_RETRY=3;
  while(retries<=MAX_RETRY){
    try{
      await dbUpdate(upd);
      /* ── Log บันทึกแยกต่างหากด้วย push() → unique key ป้องกัน collision ── */
      await dbPush('logs',{no:SES.no,name:SES.name,ym:ENTRY_YM,ts:Date.now(),action:'save'});
      DIRTY=false;
      const db2=document.getElementById('dirtyBadge');if(db2)db2.className='dirty-badge';
      toast('บันทึกสำเร็จ ✅','ok');
      break;
    }catch(e){
      retries++;
      if(retries>MAX_RETRY){
        toast('❌ บันทึกไม่สำเร็จ ('+e.message+') กรุณาลองใหม่','err');
      } else {
        toast(`⚠️ กำลังลองใหม่... (${retries}/${MAX_RETRY})`);
        await new Promise(r=>setTimeout(r, 500*retries));
      }
    }
  }
  setBtn(btn,false);
  _saveInProgress = false;
}

/* ════════════════════════════════════════════
   HISTORY (Store) — รายเดือน
════════════════════════════════════════════ */
async function renderHistory(){
  setTB('ประวัติ / Export',`สาขา ${SES.no}`);
  const C=document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  const all = await dbGet(`entries/${SES.no}`) || {};
  const months = Object.keys(all).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort().reverse();
  if(!months.length){C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">ยังไม่มีประวัติ</div>';return;}
  const rows = months.map(ym=>{
    const mData=all[ym]||{};
    let f=0, costSum=0;
    ITEMS_DATA.forEach(i=>{
      const entry = normalizeEntry(mData[i.code]);
      if(entry && entry.qty!=='' && entry.qty!=null){
        f++;
        const c = estCostOf(i.code, entry);
        if(c!=null) costSum += c;
      }
    });
    const pct=ITEMS_DATA.length>0?Math.round(f/ITEMS_DATA.length*100):0;
    return`<tr>
      <td><b>${ym}</b></td>
      <td style="color:var(--txt2)">${ymToFull(ym)}</td>
      <td class="tr num">${f} / ${ITEMS_DATA.length}</td>
      <td class="tr num">${fNum(costSum,2)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:6px;border-radius:3px;background:var(--surface3);overflow:hidden;min-width:60px">
            <div style="height:100%;border-radius:3px;background:${pct>=100?'var(--green)':pct>50?'var(--amber)':'var(--blue)'};width:${pct}%"></div>
          </div>
          <span style="font-size:11px;color:var(--txt3);min-width:28px">${pct}%</span>
        </div>
      </td>
      <td class="tr"><button class="btn btn-secondary btn-xs" onclick="exportStoreMonth('${ym}')">📥 Export</button></td>
    </tr>`;
  }).join('');

  C.innerHTML=`
    <div class="card">
      <div class="card-head">
        <div class="card-title">🗂️ ประวัติการบันทึก <span class="sub">${months.length} เดือน</span></div>
        <div class="flex gap8 items-c">
          <button class="btn btn-secondary" onclick="exportStoreTemplate()" title="Export รายการสินค้าทั้งหมด (หน่วยนับ/ขนาดบรรจุ prefill จาก master) เพื่อกรอกก่อนบันทึก">📋 Export Template</button>
          <button class="btn btn-primary" onclick="exportStoreAll()">📥 Export ทั้งหมด</button>
        </div>
      </div>
      <div class="tbl-wrap">
        <table class="dtbl">
          <thead><tr><th>เดือน</th><th>ชื่อเดือน</th><th class="tr">รายการที่กรอก</th><th class="tr">ต้นทุนประมาณการรวม</th><th>ความครบถ้วน</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* shared per-month detail-row builder — current entry schema + est. cost.
   Used by exportStoreMonth, exportStoreAll, and the admin exports below.
   Empty/uncounted rows get blank numeric cells (not 0). Cost is display-derived
   (estCostOf), exported here intentionally, still never persisted to Firebase. */
function buildExportDetailRows(mData){
  const rows=[['ลำดับ','Class','รหัส','ชื่อสินค้า','จำนวน','หน่วยนับ','เศษ','หน่วยเศษ','ขนาดบรรจุ','ปริมาณรวม(ฐาน)','ต้นทุนประมาณการ — ไม่ใช่มูลค่าอย่างเป็นทางการ']];
  ITEMS_DATA.forEach(i=>{
    const entry = normalizeEntry(mData[i.code]);
    if(!entry || entry.qty===''||entry.qty==null){
      rows.push([i.no,i.class,i.code,i.name,'','','','','','','']);
      return;
    }
    const cost = estCostOf(i.code, entry);
    rows.push([
      i.no, i.class, i.code, i.name,
      entry.qty,
      entry.uom!=null?entry.uom:'',
      entry.subunit_qty!=null?entry.subunit_qty:'',
      entry.sub_uom!=null?entry.sub_uom:'',
      entry.pack_size!=null?entry.pack_size:'',
      totalBaseQty(entry),
      cost!=null?Number(cost.toFixed(2)):''
    ]);
  });
  return rows;
}

async function exportStoreMonth(ym){
  toast('กำลังสร้าง Excel...');
  const dd=await dbGet(`entries/${SES.no}/${ym}`)||{};
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(buildExportDetailRows(dd));
  XLSX.utils.book_append_sheet(wb,ws,ym);
  XLSX.writeFile(wb,`BakeryStock_${SES.no}_${ym}.xlsx`);
  toast('Export สำเร็จ ✅','ok');
}

async function exportStoreAll(){
  toast('กำลังสร้าง Excel...');
  const all=await dbGet(`entries/${SES.no}`)||{};
  const months=Object.keys(all).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort();
  const wb=XLSX.utils.book_new();
  // Summary sheet
  const sumRows=[['เดือน','ชื่อเดือน','รายการที่กรอก','ต้นทุนประมาณการรวม — ไม่ใช่มูลค่าอย่างเป็นทางการ']];
  months.forEach(ym=>{
    const mData=all[ym]||{};
    let f=0, costSum=0;
    ITEMS_DATA.forEach(i=>{
      const entry = normalizeEntry(mData[i.code]);
      if(entry && entry.qty!=='' && entry.qty!=null){
        f++;
        const c = estCostOf(i.code, entry);
        if(c!=null) costSum += c;
      }
    });
    sumRows.push([ym, ymToFull(ym), f, Number(costSum.toFixed(2))]);
  });
  const wsSummary=XLSX.utils.aoa_to_sheet(sumRows);
  XLSX.utils.book_append_sheet(wb,wsSummary,'สรุปรายเดือน');
  // Detail per month
  months.forEach(ym=>{
    const mData=all[ym]||{};
    const ws=XLSX.utils.aoa_to_sheet(buildExportDetailRows(mData));
    XLSX.utils.book_append_sheet(wb,ws,ym.replace('-','_'));
  });
  XLSX.writeFile(wb,`BakeryStock_${SES.no}_All.xlsx`);
  toast('Export สำเร็จ ✅','ok');
}

/* ════════════════════════════════════════════
   ADMIN DASHBOARD
════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════
   ADMIN DASHBOARD v5.3 — เลือกเดือนได้ + 2-col store status
═══════════════════════════════════════════════════ */
let DASH_YM = currentYM();

async function renderAdminDashboard(C){
  setTB('แดชบอร์ด & ภาพรวม','Admin');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  const mc = await getMonthControl();
  if(!DASH_YM) DASH_YM = currentYM();
  await renderAdminDashboardForYM(C, mc, DASH_YM);
}

async function renderAdminDashboardForYM(C, mc, selYM){
  const curYM = currentYM();
  const allE = await dbGet('entries') || {};
  const months = generateMonthList();
  const activeCount = months.filter(ym=>mc[ym]&&mc[ym].active===true).length;
  const selActive = mc[selYM] && mc[selYM].active === true;
  const totalStoresAll = STORES.length;

  let selStores=0, selItems=0, selCost=0;
  const sentStoreNos = new Set();
  Object.keys(allE).forEach(sNo=>{
    const mData=(allE[sNo]||{})[selYM]||{};
    let f=0, costSum=0;
    ITEMS_DATA.forEach(item=>{
      const entry = normalizeEntry(mData[item.code]);
      if(entry && entry.qty!=='' && entry.qty!=null){
        f++;
        const c = estCostOf(item.code, entry);
        if(c!=null) costSum += c;
      }
    });
    if(f>0){ selStores++; selItems+=f; selCost+=costSum; sentStoreNos.add(String(sNo)); }
  });
  const sentPct=totalStoresAll>0?Math.round(selStores/totalStoresAll*100):0;
  const sentList = STORES.filter(s=>sentStoreNos.has(String(s.n)));
  const notSentList = STORES.filter(s=>!sentStoreNos.has(String(s.n)));

  const pastMonths   = months.filter(ym=>ym < curYM).reverse();
  const futureMonths = months.filter(ym=>ym > curYM);
  const makeOpt2 = ym => {
    const isAct = mc[ym]&&mc[ym].active===true;
    return `<option value="${ym}" ${selYM===ym?'selected':''} >${isAct?'✅':'🔒'} ${ym} — ${ymToFull(ym)}</option>`;
  };
  const ymOpts2 = `
    <optgroup label="📅 เดือนปัจจุบัน">${makeOpt2(curYM)}</optgroup>
    <optgroup label="↩️ ย้อนหลัง (${pastMonths.length})">${pastMonths.map(makeOpt2).join('')}</optgroup>
    <optgroup label="🔮 อนาคต (${futureMonths.length})">${futureMonths.map(makeOpt2).join('')}</optgroup>`;

  const logs = await dbGet('logs') || {};
  const lastSaveMap = {};
  Object.values(logs).forEach(l=>{ if(l&&l.no&&l.ym===selYM){ if(!lastSaveMap[l.no]||l.ts>lastSaveMap[l.no]) lastSaveMap[l.no]=l.ts; } });
  const pastActive = months.filter(ym=>ym<curYM && mc[ym]&&mc[ym].active===true).reverse();

  const isPast = selYM < curYM;
  const isCur  = selYM === curYM;

  /* ═══ คำนวณสถิติ Class (Items + ต้นทุนประมาณการ) ═══
     ใช้ต้นทุนประมาณการเป็นตัวรวมข้ามหน่วยนับ — เหมือนกับที่ใช้ใน renderHistory/exports
     แทนที่การรวม Pack Size แบบเดิมซึ่งข้าม UOM คนละหน่วยเข้าด้วยกันแล้วไม่มีความหมาย */
  const classMap = {};
  ITEMS_DATA.forEach(item => {
    const cls = String(item.class);
    if(!classMap[cls]) classMap[cls] = { totalItems: 0, filledCost: 0 };
    classMap[cls].totalItems++;
  });
  Object.keys(allE).forEach(sNo => {
    const mData = (allE[sNo] || {})[selYM] || {};
    ITEMS_DATA.forEach(item => {
      const entry = normalizeEntry(mData[item.code]);
      if(entry && entry.qty!=='' && entry.qty!=null){
        const c = estCostOf(item.code, entry);
        if(c!=null) classMap[String(item.class)].filledCost += c;
      }
    });
  });
  const classKeys = Object.keys(classMap).sort((a,b) => {
    const na=Number(a), nb=Number(b);
    return (!isNaN(na)&&!isNaN(nb)) ? na-nb : a.localeCompare(b);
  });
  const maxItems = Math.max(...classKeys.map(c=>classMap[c].totalItems), 1);
  const maxCost  = Math.max(...classKeys.map(c=>classMap[c].filledCost), 1);
  const chartColors = ['#0E8B8B','#2EC4B6','#F0A030','#059669','#60A5FA','#A78BFA','#F472B6','#FB923C','#34D399','#818CF8'];
  function cColor(i){ return chartColors[i % chartColors.length]; }

  const classChartHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-head">
        <div class="card-title">📊 ภาพรวมรายการสินค้าแยกตาม Class — ${ymToFull(selYM)}</div>
        <div style="font-size:12px;color:var(--txt3)">${classKeys.length} Class · ${ITEMS_DATA.length} รายการ</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="background:var(--surface2);border-radius:var(--r12);padding:16px;border:1px solid var(--border2)">
          <div style="font-size:12.5px;font-weight:700;color:var(--txt2);margin-bottom:12px;display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:3px;background:var(--blue);display:inline-block"></span>
            จำนวน Item ในแต่ละ Class
          </div>
          ${classKeys.map((cls,i) => {
            const d = classMap[cls];
            const pct = Math.round((d.totalItems / maxItems) * 100);
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
              <div style="min-width:56px;font-size:11px;font-weight:700;color:var(--txt2);text-align:right">Class ${cls}</div>
              <div style="flex:1;height:20px;background:var(--surface);border-radius:5px;overflow:hidden;border:1px solid var(--border2)">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${cColor(i)},${cColor(i)}BB);border-radius:5px"></div>
              </div>
              <div style="min-width:32px;font-size:11.5px;font-weight:800;color:var(--txt);font-family:var(--mono);text-align:right">${d.totalItems}</div>
            </div>`;
          }).join('')}
          <div style="margin-top:8px;text-align:right;font-size:10.5px;color:var(--txt4)">รวม ${ITEMS_DATA.length} รายการ</div>
        </div>
        <div style="background:var(--surface2);border-radius:var(--r12);padding:16px;border:1px solid var(--border2)">
          <div style="font-size:12.5px;font-weight:700;color:var(--txt2);margin-bottom:12px;display:flex;align-items:center;gap:6px">
            <span style="width:10px;height:10px;border-radius:3px;background:var(--amber);display:inline-block"></span>
            ต้นทุนประมาณการรวมที่บันทึก ในแต่ละ Class
          </div>
          ${classKeys.map((cls,i) => {
            const d = classMap[cls];
            const pct = maxCost > 0 ? Math.round((d.filledCost / maxCost) * 100) : 0;
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
              <div style="min-width:56px;font-size:11px;font-weight:700;color:var(--txt2);text-align:right">Class ${cls}</div>
              <div style="flex:1;height:20px;background:var(--surface);border-radius:5px;overflow:hidden;border:1px solid var(--border2)">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${cColor(i+3)},${cColor(i+3)}BB);border-radius:5px"></div>
              </div>
              <div style="min-width:50px;font-size:11.5px;font-weight:800;color:var(--txt);font-family:var(--mono);text-align:right">${fNum(d.filledCost,0)}</div>
            </div>`;
          }).join('')}
          <div style="margin-top:8px;text-align:right;font-size:10.5px;color:var(--txt4)">ต้นทุนประมาณการรวม ${fNum(selCost,2)} (ไม่ใช่มูลค่าอย่างเป็นทางการ)</div>
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
        ${classKeys.map((cls,i) => {
          const d = classMap[cls];
          const qtyPct = selCost > 0 ? Math.round((d.filledCost / selCost) * 100) : 0;
          return `<div style="display:flex;align-items:center;gap:5px;background:var(--surface);border:1px solid var(--border2);border-radius:var(--r8);padding:5px 10px">
            <div style="width:8px;height:8px;border-radius:2px;background:${cColor(i)}"></div>
            <span style="font-size:10.5px;font-weight:700;color:var(--txt2)">Class ${cls}</span>
            <span style="font-size:10px;color:var(--txt4)">${d.totalItems} items</span>
            <span style="font-size:10px;font-weight:700;color:var(--blue);font-family:var(--mono)">${qtyPct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  const periodBadge = isCur
    ? `<span style="font-size:11px;background:var(--blue-xl);color:var(--blue);border-radius:999px;padding:2px 8px">ปัจจุบัน</span>`
    : isPast
      ? `<span style="font-size:11px;background:var(--warn-bg);color:var(--warn);border-radius:999px;padding:2px 8px">↩️ ย้อนหลัง</span>`
      : `<span style="font-size:11px;background:var(--surface3);color:var(--txt3);border-radius:999px;padding:2px 8px">🔮 อนาคต</span>`;

  C.innerHTML=`
    <div class="hero-card" style="margin-bottom:16px">
      <div class="hero-blob"></div>
      <div class="hero-icon">📊</div>
      <div class="hero-content">
        <div class="hero-lbl">สถานะการบันทึกข้อมูล</div>
        <div class="hero-val num">${selStores}<span style="font-size:22px;opacity:.65"> / ${totalStoresAll}</span></div>
        <div class="hero-hint">${sentPct}% · ${selActive?'<span style="color:#7DFFD0">✅ เปิดบันทึก</span>':'<span style="color:#FFCDD2">🔒 ปิด</span>'}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <div class="hero-badge">ADMIN</div>
        <select class="ctrl" id="dashYMSel" style="font-size:12px;min-width:220px;background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.3)" onchange="onDashYMChange(this.value)">
          ${ymOpts2}
        </select>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:14px">
      <div class="kpi-card ${selActive?'green':'red'}">
        <div class="kpi-lbl">📅 สถานะเดือนที่เลือก</div>
        <div class="kpi-val" style="font-size:18px;color:${selActive?'var(--green)':'var(--red)'}">${selActive?'✅ Active':'🔒 Inactive'}</div>
        <div class="kpi-hint">${ymToFull(selYM)}</div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-lbl">🏪 บันทึกแล้ว</div>
        <div class="kpi-val">${selStores}</div>
        <div class="kpi-hint">/ ${totalStoresAll} สาขา (${sentPct}%)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">📦 รายการรวม</div>
        <div class="kpi-val">${fNum(selItems)}</div>
        <div class="kpi-hint">ต้นทุนประมาณการ ${fNum(selCost,2)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">✅ เดือนที่เปิดอยู่</div>
        <div class="kpi-val">${activeCount}</div>
        <div class="kpi-hint">เดือน (Active)</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <div class="card-title">⚡ Quick Action — ${ymToFull(selYM)} ${periodBadge}</div>
        <button class="btn btn-blue btn-sm" onclick="go('monthcontrol')">📅 จัดการเดือน</button>
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-size:13px;color:${selActive?'var(--green)':'var(--red)'};font-weight:700">${selActive?'✅ เปิดให้สาขาบันทึกอยู่':'🔒 ปิด — สาขาบันทึกไม่ได้'}</div>
          <div style="height:6px;border-radius:3px;background:var(--surface3);margin-top:10px;overflow:hidden;max-width:280px">
            <div style="height:100%;border-radius:3px;background:var(--blue);width:${sentPct}%;transition:width .6s"></div>
          </div>
          <div style="font-size:11px;color:var(--txt4);margin-top:3px">${sentPct}% (${selStores} / ${totalStoresAll} สาขา)</div>
        </div>
        <button class="btn" style="${selActive?'background:var(--red-bg);color:var(--red);border:1px solid rgba(224,50,68,.2)':'background:var(--green-bg);color:var(--green);border:1px solid rgba(13,159,110,.2)'};padding:11px 20px;font-weight:700;border-radius:var(--r8);cursor:pointer;font-size:13.5px" onclick="toggleMonth('${selYM}',${!selActive})">
          ${selActive?'🔒 ปิดเดือนนี้':'✅ เปิดเดือนนี้'}
        </button>
      </div>
      ${pastActive.length ? `<div style="margin-top:12px;padding:10px 13px;background:var(--warn-bg);border-radius:var(--r8);border:1px solid rgba(212,139,10,.25)">
        <div style="font-size:12px;font-weight:700;color:var(--warn);margin-bottom:6px">↩️ เดือนย้อนหลัง Active (${pastActive.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">${pastActive.map(ym=>`<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.6);border:1px solid rgba(212,139,10,.3);border-radius:var(--r8);padding:3px 8px"><span style="font-size:11px;font-weight:700;color:var(--warn)">${ymToFull(ym)}</span><button onclick="toggleMonth('${ym}',false)" style="background:none;border:none;cursor:pointer;color:var(--txt4);font-size:11px;padding:0;line-height:1">✕</button></div>`).join('')}</div>
      </div>` : ''}
    </div>

    ${classChartHTML}

    <div class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:8px">
        <div>
          <div class="card-title">📋 สถานะการบันทึกข้อมูลรายสาขา — ${ymToFull(selYM)}</div>
          <div style="font-size:12px;color:var(--txt3);margin-top:2px">แบ่งสาขาตามสถานะ เพื่อให้ติดตามสาขาที่ยังไม่บันทึกได้ง่ายขึ้น</div>
        </div>
        <button onclick="exportStoreStatusExcel('${selYM}')" style="background:var(--amber);color:#fff;border:none;font-weight:700;padding:9px 16px;border-radius:var(--r8);cursor:pointer;font-size:13px">🧾 Export Excel</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--border2);border-radius:var(--r12);overflow:hidden">
        <div style="border-right:1px solid var(--border2)">
          <div style="padding:11px 15px;background:var(--red-bg);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:7px"><div style="width:8px;height:8px;border-radius:50%;background:var(--red)"></div><span style="font-size:13px;font-weight:700;color:var(--red)">ยังไม่บันทึกข้อมูล</span></div>
            <span style="font-size:12px;font-weight:800;background:var(--red);color:#fff;border-radius:999px;padding:2px 10px">${notSentList.length} สาขา</span>
          </div>
          <div style="max-height:52vh;overflow-y:auto">
            ${notSentList.length===0
              ? '<div style="padding:24px;text-align:center;color:var(--green);font-weight:700;font-size:13px">✅ ทุกสาขาบันทึกแล้ว!</div>'
              : notSentList.map((s,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border2);${i%2===0?'background:var(--surface1)':''}" ><span style="font-size:11px;color:var(--txt4);font-weight:700;min-width:22px">${i+1}</span><span style="font-size:12.5px;color:var(--txt);font-weight:500">บมจ.ซีพี แอ็กซ์ตร้า สาขา${esc(s.name)} ${s.n}</span></div>`).join('')}
          </div>
        </div>
        <div>
          <div style="padding:11px 15px;background:var(--green-bg);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:7px"><div style="width:8px;height:8px;border-radius:50%;background:var(--green)"></div><span style="font-size:13px;font-weight:700;color:var(--green)">บันทึกข้อมูลแล้ว</span></div>
            <span style="font-size:12px;font-weight:800;background:var(--green);color:#fff;border-radius:999px;padding:2px 10px">${sentList.length} สาขา</span>
          </div>
          <div style="max-height:52vh;overflow-y:auto">
            ${sentList.length===0
              ? '<div style="padding:24px;text-align:center;color:var(--txt3);font-size:13px">ยังไม่มีสาขาที่บันทึก</div>'
              : sentList.map((s,i)=>{ const ts=lastSaveMap[String(s.n)]; return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border2);${i%2===0?'background:var(--surface1)':''}" ><span style="font-size:11px;color:var(--txt4);font-weight:700;min-width:22px">${s.n}</span><span style="font-size:12.5px;color:var(--txt);font-weight:500;flex:1">บมจ.ซีพี แอ็กซ์ตร้า สาขา${esc(s.name)} ${s.n}</span><span style="font-size:11px;color:var(--txt4);white-space:nowrap">${ts?formatThaiDT(ts):''}</span></div>`; }).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

async function onDashYMChange(ym){
  DASH_YM = ym;
  const C = document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  const mc = await getMonthControl();
  await renderAdminDashboardForYM(C, mc, ym);
}

function formatThaiDT(ts){
  if(!ts) return '';
  const d=new Date(ts), pad=n=>String(n).padStart(2,'0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function exportStoreStatusExcel(selYM){
  toast('กำลังสร้างไฟล์ Excel...','');
  const allE = await dbGet('entries') || {};
  const logs  = await dbGet('logs') || {};
  const lastSaveMap = {};
  Object.values(logs).forEach(l=>{ if(l&&l.no&&l.ym===selYM){ if(!lastSaveMap[l.no]||l.ts>lastSaveMap[l.no]) lastSaveMap[l.no]=l.ts; } });
  const sentNos = new Set();
  Object.keys(allE).forEach(sNo=>{ const mData=(allE[sNo]||{})[selYM]||{}; if(Object.keys(mData).filter(k=>mData[k]!==null&&mData[k]!=='').length>0) sentNos.add(String(sNo)); });
  const wb = XLSX.utils.book_new();
  const notR=[['ลำดับ','เลขสาขา','ชื่อสาขา','Username','สถานะ']];
  STORES.filter(s=>!sentNos.has(String(s.n))).forEach((s,i)=>notR.push([i+1,s.n,s.name,s.u,'ยังไม่บันทึก']));
  const ws1=XLSX.utils.aoa_to_sheet(notR); ws1['!cols']=[{wch:6},{wch:10},{wch:32},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws1,'ยังไม่บันทึก');
  const sentR=[['ลำดับ','เลขสาขา','ชื่อสาขา','Username','บันทึกล่าสุด','สถานะ']];
  STORES.filter(s=>sentNos.has(String(s.n))).forEach((s,i)=>sentR.push([i+1,s.n,s.name,s.u,lastSaveMap[String(s.n)]?formatThaiDT(lastSaveMap[String(s.n)]):'—','บันทึกแล้ว']));
  const ws2=XLSX.utils.aoa_to_sheet(sentR); ws2['!cols']=[{wch:6},{wch:10},{wch:32},{wch:14},{wch:20},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws2,'บันทึกแล้ว');
  const allR=[['ลำดับ','เลขสาขา','ชื่อสาขา','Username','สถานะ','บันทึกล่าสุด']];
  STORES.forEach((s,i)=>{ const sent=sentNos.has(String(s.n)); allR.push([i+1,s.n,s.name,s.u,sent?'บันทึกแล้ว':'ยังไม่บันทึก',sent&&lastSaveMap[String(s.n)]?formatThaiDT(lastSaveMap[String(s.n)]):'—']); });
  const ws3=XLSX.utils.aoa_to_sheet(allR); ws3['!cols']=[{wch:6},{wch:10},{wch:32},{wch:14},{wch:14},{wch:20}];
  XLSX.utils.book_append_sheet(wb,ws3,'ทั้งหมด');
  XLSX.writeFile(wb,`StoreStatus_${selYM}_Bakery.xlsx`);
  toast('Export สำเร็จ ✅','ok');
}

/* ════════════════════════════════════════════
   ADMIN STORE DATA (monthly)
════════════════════════════════════════════ */
let ASTORE=null, AMONTH=currentYM();

async function renderStoreData(){
  setTB('ดูข้อมูลรายสาขา','Admin');
  const C=document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  const allE=await dbGet('entries')||{};
  const fbKeys=Object.keys(allE);
  if(!fbKeys.length){
    C.innerHTML=`<div class="card"><div class="card-title" style="margin-bottom:12px">🏪 ดูข้อมูลรายสาขา</div><p style="color:var(--txt3)">ยังไม่มีข้อมูลใน Firebase</p></div>`;
    return;
  }

  // รวบรวมเดือนที่มีข้อมูล
  const allMonths=new Set();
  fbKeys.forEach(k=>Object.keys(allE[k]||{}).filter(m=>/^\d{4}-\d{2}$/.test(m)).forEach(m=>allMonths.add(m)));
  const monthList=[...allMonths].sort().reverse();
  if(!monthList.includes(AMONTH)) AMONTH=monthList[0]||currentYM();

  const storeList=fbKeys.map(k=>{
    const f=STORES.find(s=>String(s.n)===String(k));
    return{key:k,name:f?f.name:`สาขา ${k}`};
  }).sort((a,b)=>Number(a.key)-Number(b.key));

  const allOpt=`<option value="ALL" ${ASTORE==='ALL'?'selected':''}>🏪 ทุกสาขา (${fbKeys.length} สาขา)</option>`;
  const stOpts=storeList.map(s=>`<option value="${s.key}" ${ASTORE===s.key?'selected':''}>${s.key} — ${esc(s.name)}</option>`).join('');
  const mOpts=monthList.map(m=>`<option value="${m}" ${AMONTH===m?'selected':''}>${m} — ${ymToFull(m)}</option>`).join('');

  C.innerHTML=`
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">🏪 ข้อมูลรายสาขา <span class="sub">${fbKeys.length} สาขาใน Firebase</span></div></div>
      <div class="filter-bar" style="align-items:flex-end;gap:12px">
        <div style="flex:1;min-width:200px">
          <label class="flabel">🏪 เลือกสาขา</label>
          <select class="ctrl w100" id="aStoreSel" onchange="ASTORE=this.value">
            ${allOpt}${stOpts}
          </select>
        </div>
        <div style="min-width:200px">
          <label class="flabel">📅 เดือน</label>
          <select class="ctrl w100" id="aMonthSel" onchange="AMONTH=this.value">
            ${mOpts}
          </select>
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="btn btn-blue" onclick="loadStoreDet()">🔍 ดูข้อมูล</button>
        </div>
      </div>
    </div>
    <div id="aDet"><div class="card tc" style="padding:28px;color:var(--txt3)">เลือกสาขาและเดือน แล้วกด "ดูข้อมูล"</div></div>`;

  if(!ASTORE) ASTORE='ALL';
  loadStoreDet();
}

async function loadStoreDet(){
  const sNo=(document.getElementById('aStoreSel')?.value||ASTORE)||'ALL';
  const ym=document.getElementById('aMonthSel')?.value||AMONTH;
  ASTORE=sNo; AMONTH=ym;
  const det=document.getElementById('aDet');
  if(!det) return;
  det.innerHTML='<div class="card tc" style="padding:32px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  if(sNo==='ALL'){ await loadAllStoresDet(ym,det); }
  else { await loadSingleStoreDet(sNo,ym,det); }
}

async function loadAllStoresDet(ym, det){
  const allE=await dbGet('entries')||{};
  const fbKeys=Object.keys(allE);
  const storeSummary=[];
  fbKeys.forEach(k=>{
    const mData=(allE[k]||{})[ym]||{};
    const found=STORES.find(s=>String(s.n)===String(k));
    const sName=found?found.name:`สาขา ${k}`;
    let f=0, costSum=0;
    ITEMS_DATA.forEach(item=>{
      const entry = normalizeEntry(mData[item.code]);
      if(entry && entry.qty!=='' && entry.qty!=null){
        f++;
        const c = estCostOf(item.code, entry);
        if(c!=null) costSum += c;
      }
    });
    storeSummary.push({n:k,name:sName,filledCount:f,totalCost:costSum,hasData:f>0});
  });
  storeSummary.sort((a,b)=>Number(a.n)-Number(b.n));
  const withData=storeSummary.filter(s=>s.hasData);
  const totalItems=withData.reduce((s,st)=>s+st.filledCount,0);
  const totalCost=withData.reduce((s,st)=>s+st.totalCost,0);

  det.innerHTML=`
    <div class="sd-summary" style="margin-bottom:14px">
      <div class="sd-stat"><div class="sd-sv">${withData.length}</div><div class="sd-sl">สาขาที่มีข้อมูล</div></div>
      <div class="sd-stat"><div class="sd-sv">${fNum(totalItems)}</div><div class="sd-sl">รายการรวม</div></div>
      <div class="sd-stat"><div class="sd-sv" style="color:var(--amber)">${fNum(totalCost,2)}</div><div class="sd-sl">ต้นทุนประมาณการรวม</div></div>
      <div class="sd-stat"><div class="sd-sv" style="font-size:16px">${ymToFull(ym)}</div><div class="sd-sl">เดือนที่ดู</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">📊 สรุปรายสาขา <span class="sub">${ymToFull(ym)}</span></div>
        <button class="btn btn-primary" onclick="exportAllStoresMonth('${ym}')">📥 Export Excel</button>
      </div>
      <div class="tbl-wrap">
        <table class="dtbl">
          <thead><tr><th>สาขา</th><th>ชื่อ</th><th class="tr">รายการที่กรอก</th><th class="tr">%</th><th class="tr">ต้นทุนประมาณการรวม</th></tr></thead>
          <tbody>
            ${storeSummary.map(s=>`
              <tr>
                <td class="bold num">${s.n}</td>
                <td style="font-size:12.5px">${esc(s.name)}</td>
                <td class="tr num">${s.hasData?s.filledCount:'—'}</td>
                <td class="tr">
                  ${s.hasData?`<span class="pill ${s.filledCount>=ITEMS_DATA.length?'pill-ok':s.filledCount>0?'pill-amber':'pill-no'}">${ITEMS_DATA.length>0?Math.round(s.filledCount/ITEMS_DATA.length*100):0}%</span>`:'<span class="pill pill-no">ไม่มีข้อมูล</span>'}
                </td>
                <td class="tr num">${s.hasData?fNum(s.totalCost,2):'—'}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="2" class="bold">รวม ${withData.length} สาขาที่มีข้อมูล</td>
            <td class="tr num bold">${fNum(totalItems)}</td>
            <td></td>
            <td class="tr num bold">${fNum(totalCost,2)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
}

async function loadSingleStoreDet(sNo, ym, det){
  const stData=await dbGet(`entries/${sNo}`)||{};
  const found=STORES.find(s=>String(s.n)===String(sNo));
  const sName=found?found.name:`สาขา ${sNo}`;
  const mData=stData[ym]||{};
  const filledItems=[];
  let totalFilled=0, totalCost=0;
  ITEMS_DATA.forEach(item=>{
    const entry=normalizeEntry(mData[item.code]);
    if(entry && entry.qty!=='' && entry.qty!=null){
      const cost=estCostOf(item.code, entry);
      filledItems.push({code:item.code,name:item.name,cls:item.class,no:item.no,qty:entry.qty,uom:entry.uom,cost});
      totalFilled++;
      if(cost!=null) totalCost+=cost;
    }
  });
  const pct=ITEMS_DATA.length>0?Math.round(totalFilled/ITEMS_DATA.length*100):0;

  det.innerHTML=`
    <div class="sd-summary" style="margin-bottom:14px">
      <div class="sd-stat"><div class="sd-sv">${fNum(totalFilled)}</div><div class="sd-sl">รายการที่กรอก</div></div>
      <div class="sd-stat"><div class="sd-sv">${pct}%</div><div class="sd-sl">ความครบถ้วน</div></div>
      <div class="sd-stat"><div class="sd-sv" style="color:var(--amber)">${fNum(totalCost,2)}</div><div class="sd-sl">ต้นทุนประมาณการรวม</div></div>
      <div class="sd-stat"><div class="sd-sv" style="font-size:16px">${ymToFull(ym)}</div><div class="sd-sl">เดือนที่ดู</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">📋 รายละเอียด <span class="sub">สาขา ${sNo} ${esc(sName)} · ${ymToFull(ym)}</span></div>
        <button class="btn btn-primary btn-sm" onclick="exportAdminSingleMonth('${sNo}','${ym}')">📥 Export Excel</button>
      </div>
      <div class="tbl-wrap" style="max-height:60vh">
        <table class="dtbl">
          <thead><tr><th style="width:44px">No.</th><th style="width:64px">Class</th><th style="width:96px">รหัส</th><th>ชื่อสินค้า</th><th class="tr" style="width:80px">จำนวน</th><th style="width:90px">หน่วยนับ</th><th class="tr" style="width:110px">ประมาณการต้นทุน</th></tr></thead>
          <tbody>
            ${filledItems.length>0
              ? filledItems.map(r=>`<tr><td class="code-cell">${r.no}</td><td><span class="cls-badge">${esc(r.cls)}</span></td><td class="code-cell">${esc(r.code)}</td><td style="white-space:normal;line-height:1.3">${esc(r.name)}</td><td class="tr num bold">${fNum(r.qty, r.qty%1===0?0:2)}</td><td>${esc(r.uom||'—')}</td><td class="tr num">${r.cost!=null?'≈ '+fNum(r.cost,2):'—'}</td></tr>`).join('')
              : '<tr><td colspan="7" class="tc muted" style="padding:20px">ไม่มีข้อมูลในเดือนนี้</td></tr>'
            }
          </tbody>
          ${filledItems.length>0?`<tfoot><tr><td colspan="6" class="bold">รวม ${totalFilled} รายการ</td><td class="tr num bold">${fNum(totalCost,2)}</td></tr></tfoot>`:''}
        </table>
      </div>
    </div>`;
}

/* ════ ADMIN EXPORTS ════ */
async function exportAllStoresMonth(ym){
  toast('กำลังสร้าง Excel...');
  const allE=await dbGet('entries')||{};
  const wb=XLSX.utils.book_new();
  const sumRows=[['สาขา','ชื่อสาขา','รายการที่กรอก','ต้นทุนประมาณการรวม — ไม่ใช่มูลค่าอย่างเป็นทางการ']];
  const detRows=[['สาขา','ชื่อสาขา','Class','รหัสสินค้า','ชื่อสินค้า','จำนวน','หน่วยนับ','เศษ','หน่วยเศษ','ขนาดบรรจุ','ปริมาณรวม(ฐาน)','ต้นทุนประมาณการ']];
  Object.keys(allE).sort((a,b)=>Number(a)-Number(b)).forEach(k=>{
    const mData=(allE[k]||{})[ym]||{};
    const found=STORES.find(s=>String(s.n)===String(k));
    const sName=found?found.name:`สาขา ${k}`;
    let f=0, costSum=0;
    ITEMS_DATA.forEach(item=>{
      const entry = normalizeEntry(mData[item.code]);
      if(entry && entry.qty!=='' && entry.qty!=null){
        f++;
        const cost = estCostOf(item.code, entry);
        if(cost!=null) costSum += cost;
        detRows.push([
          k, sName, item.class, item.code, item.name,
          entry.qty,
          entry.uom!=null?entry.uom:'',
          entry.subunit_qty!=null?entry.subunit_qty:'',
          entry.sub_uom!=null?entry.sub_uom:'',
          entry.pack_size!=null?entry.pack_size:'',
          totalBaseQty(entry),
          cost!=null?Number(cost.toFixed(2)):''
        ]);
      }
    });
    if(f>0) sumRows.push([k,sName,f,Number(costSum.toFixed(2))]);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sumRows),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detRows),'Detail');
  XLSX.writeFile(wb,`BakeryStock_AllStores_${ym}.xlsx`);
  toast('Export สำเร็จ ✅','ok');
}

async function exportAdminSingleMonth(sNo,ym){
  toast('กำลังสร้าง Excel...');
  const mData=await dbGet(`entries/${sNo}/${ym}`)||{};
  const found=STORES.find(s=>String(s.n)===String(sNo));
  const sName=found?found.name:`สาขา ${sNo}`;
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(buildExportDetailRows(mData));
  XLSX.utils.book_append_sheet(wb,ws,ym);
  XLSX.writeFile(wb,`BakeryStock_ST${sNo}_${ym}.xlsx`);
  toast('Export สำเร็จ ✅','ok');
}

/* ════ CLEAR ALL ════ */
function renderClearAll(){
  setTB('ล้างข้อมูล','⚠️ อันตราย');
  const seedBtn = (typeof seedDemoData==='function' && DB_ROOT==='demo') ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><div class="card-title">🌱 Seed ข้อมูลเดโม</div></div>
      <p style="color:var(--txt2);margin-bottom:16px">เขียนข้อมูลตัวอย่าง 20 รายการ สำหรับสาขา <b>${esc(SEED_STORE)}</b> เดือน <b>2026-06</b> และ <b>2026-07</b> ลงใต้ <code class="inline">demo/</code> (ใช้สำหรับ demo เท่านั้น — จะเขียนทับข้อมูลของรายการ/เดือนที่ seed เท่านั้น)</p>
      <button class="btn btn-secondary" onclick="runSeedDemoData()">🌱 Seed ข้อมูลเดโม</button>
    </div>` : '';
  document.getElementById('content').innerHTML=`
    ${seedBtn}
    <div class="card" style="border-color:rgba(224,50,68,.25)">
      <div class="card-head"><div class="card-title" style="color:var(--red)">🗑️ ล้างข้อมูลทั้งหมด</div></div>
      <p style="color:var(--txt2);margin-bottom:16px">การดำเนินการนี้จะลบข้อมูลการตรวจนับ <b>ทั้งหมด</b> รวมถึง Month Control ออกจาก Firebase อย่างถาวร</p>
      <button class="btn btn-danger" onclick="confirmClearAll()">🗑️ ล้างข้อมูลทั้งหมด</button>
    </div>`;
}
async function runSeedDemoData(){
  toast('กำลัง seed ข้อมูลเดโม...');
  try{
    const r = await seedDemoData();
    if(r && r.ok) toast(`✅ Seed สำเร็จ — ${r.itemCount} รายการ สาขา ${r.store}`,'ok');
    else toast('❌ Seed ไม่สำเร็จ: '+(r&&r.error||'unknown error'),'err');
  }catch(e){ toast('❌ Seed ไม่สำเร็จ: '+e.message,'err'); }
}
function confirmClearAll(){showModal(`<h3 style="color:var(--red)">⚠️ ยืนยันการล้างข้อมูล</h3><p style="color:var(--txt2);margin-top:8px">กรุณาพิมพ์ <b>DELETE</b> เพื่อยืนยัน</p><input type="text" id="cInp" style="width:100%;margin-top:12px;padding:11px 13px;border-radius:var(--r8);border:1.5px solid var(--border);font-size:14px" placeholder="พิมพ์ DELETE"><div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button><button class="btn btn-danger" onclick="doClear()">ลบทั้งหมด</button></div>`);}
async function doClear(){
  if(document.getElementById('cInp').value.trim()!=='DELETE'){toast('พิมพ์ DELETE ให้ถูกต้อง','err');return;}
  try{
    await dbRemove('entries');
    await dbRemove('logs');
    await dbRemove('monthControl');
    closeModal();toast('ล้างข้อมูลแล้ว','ok');
  }catch(e){toast('Error: '+e.message,'err');}
}

/* ════ BOOTSTRAP ════ */
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  await loadMasterDataFromFB(); // [NEW] override items/stores from Firebase if admin has updated
  if(typeof LOGO_URI!=='undefined'){
    document.getElementById('loginLogo').src=LOGO_URI;
    document.getElementById('sbLogo').src=LOGO_URI;
  }
  initLogin();
  document.getElementById('menuBtn').addEventListener('click',()=>{
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sbBd').classList.add('show');
  });
  document.getElementById('sbBd').addEventListener('click',closeSB);
  const ses=loadSes();
  if(ses){SES=ses;startApp();}
});

/* ════════════════════════════════════════════
   [NEW v5.1] MASTER DATA — Firebase path:
   masterData/items/{index}  (Array)
   masterData/stores/{index} (Array)
   ════════════════════════════════════════════ */

/* ── โหลด masterData จาก Firebase (ถ้ามี override data.json) ── */
async function loadMasterDataFromFB() {
  try {
    const md = await dbGet('masterData');
    if (md) {
      if (md.items && Array.isArray(md.items) && md.items.length > 0) {
        // ตรวจรหัสสินค้าซ้ำใน Firebase master ก่อนกรอง — masterData/items เขียนตรงจากหน้า admin
        // "เพิ่มรายการสินค้าใหม่" ไม่ผ่านการตรวจ build-time ใดๆ จึงต้องตรวจตรงนี้
        ITEM_MASTER_ISSUES = scanItemMasterIssues(md.items);
        if(ITEM_MASTER_ISSUES.duplicates.length){
          console.error('[scanItemMasterIssues] duplicate codes found in masterData/items:', ITEM_MASTER_ISSUES.duplicates);
        }
        renderMasterDataAlert();
        // same master-record filter as loadData() — an admin override must not resurrect
        // items without a master UOM/pack_size record
        ITEMS_DATA = md.items.filter(i => MASTER_UOM[i.code]);
        ALL_CLS = ['ALL', ...new Set(ITEMS_DATA.map(i => i.class).filter(Boolean))]
          .sort((a, b) => {
            if (a === 'ALL') return -1; if (b === 'ALL') return 1;
            const na = Number(a), nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
          });
        console.log('[FB masterData] items overridden:', ITEMS_DATA.length);
      }
      if (md.stores && Array.isArray(md.stores) && md.stores.length > 0) {
        STORES = md.stores;
        console.log('[FB masterData] stores overridden:', STORES.length);
      }
    }
  } catch (e) {
    console.warn('loadMasterDataFromFB error:', e.message);
  }
}

/* ════════════════════════════════════════════
   [NEW] STORE: Export Template Excel (ก่อนบันทึก)
   — Export รายการสินค้าทั้งหมด, หน่วยนับ/ขนาดบรรจุ prefill จาก master (จำนวน/เศษ ว่างไว้ให้กรอก)
   ════════════════════════════════════════════ */
function exportStoreTemplate() {
  toast('กำลังสร้าง Excel Template...');
  const wb = XLSX.utils.book_new();
  const rows = [
    ['No.', 'Class', 'รหัส', 'ชื่อสินค้า', 'จำนวน', 'หน่วยนับ (จำนวน)', 'เศษ', 'หน่วยนับ (เศษ)', 'ขนาดบรรจุ']
  ];
  ITEMS_DATA.forEach(i => {
    const mps = masterPackSizeOf(i.code);
    rows.push([i.no, i.class, i.code, i.name, '', masterUomOf(i.code)||'', '', masterSubUomOf(i.code)||'', mps!=null?mps:'']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // กำหนดความกว้างคอลัมน์
  ws['!cols'] = [
    { wch: 6 }, { wch: 8 }, { wch: 14 }, { wch: 48 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'รายการสินค้า');
  XLSX.writeFile(wb, `BakeryTemplate_ST${SES.no}_${currentYM()}.xlsx`);
  toast('Export Template สำเร็จ ✅', 'ok');
}

/* ════════════════════════════════════════════
   [NEW] ADMIN: จัดการ Items (เพิ่ม / แก้ไข / ลบ)
   ════════════════════════════════════════════ */
let ITEM_SEARCH_Q = '';

function renderManageItems() {
  setTB('จัดการรายการสินค้า', 'Admin — Items');
  const C = document.getElementById('content');
  buildManageItemsView(C);
}

/* การ์ดแจ้งรหัสสินค้าซ้ำใน master แบบละเอียด — แสดงเฉพาะเมื่อพบปัญหา (T1) */
function masterDataIssuesCardHtml(){
  const { duplicates } = ITEM_MASTER_ISSUES;
  if(duplicates.length === 0) return '';
  const rows = duplicates.map(d => `<tr><td class="code-cell">${esc(d.code)}</td><td>รหัสสินค้าซ้ำในรายการหลัก</td></tr>`).join('');
  return `
    <div class="card" style="margin-bottom:14px;border:1px solid rgba(224,50,68,.35)">
      <div class="card-head">
        <div class="card-title" style="color:var(--red)">⚠️ ปัญหา Item Master ที่ต้องแก้ไข</div>
        <div class="sub">${duplicates.length} รายการ — ส่งให้ Buyer/Admin ตรวจสอบก่อนใช้งานรหัสเหล่านี้</div>
      </div>
      <div class="tbl-wrap">
        <table class="dtbl">
          <thead><tr><th>รหัสสินค้า</th><th>ปัญหา</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function buildManageItemsView(C) {
  const filtered = ITEM_SEARCH_Q
    ? ITEMS_DATA.filter(i =>
        i.code.toLowerCase().includes(ITEM_SEARCH_Q.toLowerCase()) ||
        i.name.toLowerCase().includes(ITEM_SEARCH_Q.toLowerCase()) ||
        String(i.class).includes(ITEM_SEARCH_Q))
    : ITEMS_DATA;

  const rows = filtered.map((it, idx) => `
    <tr>
      <td class="code-cell">${it.no}</td>
      <td><span class="cls-badge">${esc(String(it.class))}</span></td>
      <td class="code-cell">${esc(it.code)}</td>
      <td style="white-space:normal;line-height:1.35;max-width:320px">${esc(it.name)}</td>
      <td class="tr" style="white-space:nowrap">
        <button class="btn btn-secondary btn-xs" onclick="showEditItemModal(${ITEMS_DATA.indexOf(it)})">✏️ แก้ไข</button>
        <button class="btn btn-xs" style="background:var(--red-bg);color:var(--red);border:1px solid rgba(224,50,68,.2);cursor:pointer;padding:3px 8px;border-radius:var(--r8);font-size:11px;font-weight:600" onclick="confirmDeleteItem(${ITEMS_DATA.indexOf(it)})">🗑️ ลบ</button>
      </td>
    </tr>`).join('');

  C.innerHTML = `
    ${masterDataIssuesCardHtml()}
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--blue)">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:36px">📦</div>
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--txt)">จัดการรายการสินค้า</div>
          <div style="font-size:13px;color:var(--txt3);margin-top:4px">เพิ่ม แก้ไข หรือลบรายการสินค้าที่แสดงในทุกสาขา · <b style="color:var(--blue)">${ITEMS_DATA.length} รายการ</b></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">📦 รายการสินค้าทั้งหมด <span class="sub">${ITEMS_DATA.length} รายการ</span></div>
        <div class="flex gap8 items-c">
          <button class="btn btn-blue" onclick="showAddItemModal()">➕ เพิ่มสินค้า</button>
          <button class="btn btn-secondary btn-sm" onclick="renderManageItems()">🔄 รีเฟรช</button>
        </div>
      </div>

      <div class="filter-bar" style="margin-bottom:12px">
        <div class="flex-1">
          <label class="flabel">🔍 ค้นหาสินค้า</label>
          <div class="search-wrap">
            <span class="search-ico">🔍</span>
            <input type="text" class="ctrl" id="itemSearchInp" placeholder="ชื่อสินค้า, รหัส, Class..." value="${esc(ITEM_SEARCH_Q)}"
              oninput="ITEM_SEARCH_Q=this.value;buildManageItemsView(document.getElementById('content'))">
          </div>
        </div>
      </div>

      <div style="margin-bottom:10px;padding:10px 14px;background:var(--warn-bg);border-radius:var(--r8);border:1px solid rgba(212,139,10,.2);font-size:12.5px;color:var(--warn)">
        ⚠️ <b>การเปลี่ยนแปลงจะมีผลทันทีกับทุกสาขา</b> — ข้อมูลจะถูกบันทึกลง Firebase และโหลดใหม่อัตโนมัติเมื่อ Login ครั้งถัดไป
      </div>

      <div class="tbl-wrap" style="max-height:65vh">
        <table class="dtbl">
          <thead>
            <tr>
              <th style="width:44px">No.</th>
              <th style="width:68px">Class</th>
              <th style="width:104px">รหัส</th>
              <th>ชื่อสินค้า</th>
              <th style="width:120px;text-align:right">จัดการ</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5" class="tc muted" style="padding:28px">ไม่พบรายการ</td></tr>'}</tbody>
          <tfoot>
            <tr><td colspan="5" class="tr" style="font-size:12px;color:var(--txt3)">แสดง ${filtered.length} / ${ITEMS_DATA.length} รายการ</td></tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}

function showAddItemModal() {
  const clsOptions = [...new Set(ITEMS_DATA.map(i => i.class).filter(Boolean))]
    .sort((a, b) => { const na = Number(a), nb = Number(b); return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b); })
    .map(c => `<option value="${c}">Class ${c}</option>`).join('');
  const nextNo = ITEMS_DATA.length > 0 ? Math.max(...ITEMS_DATA.map(i => Number(i.no) || 0)) + 1 : 1;

  showModal(`
    <h3>➕ เพิ่มรายการสินค้าใหม่</h3>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
      <div>
        <label class="flabel">Class <span style="color:var(--red)">*</span></label>
        <div style="display:flex;gap:8px">
          <select class="ctrl" id="mi_cls" style="flex:1">${clsOptions}</select>
          <input type="text" class="ctrl" id="mi_cls_new" placeholder="หรือพิมพ์ Class ใหม่" style="flex:1">
        </div>
        <div style="font-size:11px;color:var(--txt3);margin-top:3px">เลือก Class ที่มีอยู่ หรือพิมพ์ Class ใหม่ในช่องขวา</div>
      </div>
      <div>
        <label class="flabel">รหัสสินค้า <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="mi_code" placeholder="เช่น 123456">
      </div>
      <div>
        <label class="flabel">ชื่อสินค้า <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="mi_name" placeholder="ชื่อสินค้า">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-blue" onclick="doAddItem(${nextNo})">➕ เพิ่มสินค้า</button>
    </div>`);
}

async function doAddItem(nextNo) {
  const clsSel = document.getElementById('mi_cls').value.trim();
  const clsNew = document.getElementById('mi_cls_new').value.trim();
  const cls = clsNew || clsSel;
  const code = document.getElementById('mi_code').value.trim();
  const name = document.getElementById('mi_name').value.trim();
  if (!cls || !code || !name) { toast('กรุณากรอกข้อมูลให้ครบถ้วน', 'err'); return; }
  if (ITEMS_DATA.find(i => i.code === code)) { toast('รหัสสินค้านี้มีอยู่แล้ว', 'err'); return; }
  const newItem = { no: nextNo, class: cls, code, name };
  const newItems = [...ITEMS_DATA, newItem];
  closeModal();
  await saveMasterItems(newItems, `เพิ่มสินค้า ${code} — ${name} แล้ว ✅`);
}

function showEditItemModal(idx) {
  const it = ITEMS_DATA[idx];
  if (!it) return;
  const clsOptions = [...new Set(ITEMS_DATA.map(i => i.class).filter(Boolean))]
    .sort((a, b) => { const na = Number(a), nb = Number(b); return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b); })
    .map(c => `<option value="${c}" ${c === String(it.class) ? 'selected' : ''}>Class ${c}</option>`).join('');

  showModal(`
    <h3>✏️ แก้ไขสินค้า</h3>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
      <div>
        <label class="flabel">Class <span style="color:var(--red)">*</span></label>
        <div style="display:flex;gap:8px">
          <select class="ctrl" id="ei_cls" style="flex:1">${clsOptions}</select>
          <input type="text" class="ctrl" id="ei_cls_new" placeholder="พิมพ์ Class ใหม่" style="flex:1">
        </div>
      </div>
      <div>
        <label class="flabel">รหัสสินค้า</label>
        <input type="text" class="ctrl w100" id="ei_code" value="${esc(it.code)}" readonly style="background:var(--surface2);color:var(--txt3)">
      </div>
      <div>
        <label class="flabel">ชื่อสินค้า <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="ei_name" value="${esc(it.name)}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-blue" onclick="doEditItem(${idx})">💾 บันทึกการแก้ไข</button>
    </div>`);
}

async function doEditItem(idx) {
  const clsSel = document.getElementById('ei_cls').value.trim();
  const clsNew = document.getElementById('ei_cls_new').value.trim();
  const cls = clsNew || clsSel;
  const name = document.getElementById('ei_name').value.trim();
  if (!cls || !name) { toast('กรุณากรอกข้อมูลให้ครบถ้วน', 'err'); return; }
  const newItems = ITEMS_DATA.map((it, i) => i === idx ? { ...it, class: cls, name } : it);
  closeModal();
  await saveMasterItems(newItems, `แก้ไขสินค้า ${ITEMS_DATA[idx].code} แล้ว ✅`);
}

function confirmDeleteItem(idx) {
  const it = ITEMS_DATA[idx];
  showModal(`
    <h3 style="color:var(--red)">🗑️ ยืนยันการลบสินค้า</h3>
    <p style="color:var(--txt2);margin-top:10px">
      ต้องการลบสินค้า <b>${esc(it.code)} — ${esc(it.name)}</b> ใช่หรือไม่?<br>
      <span style="color:var(--txt3);font-size:12px">⚠️ ข้อมูลที่สาขาบันทึกไว้จะยังคงอยู่ แต่จะไม่แสดงในรายการอีกต่อไป</span>
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-danger" onclick="doDeleteItem(${idx})">🗑️ ลบสินค้า</button>
    </div>`);
}

async function doDeleteItem(idx) {
  const it = ITEMS_DATA[idx];
  const newItems = ITEMS_DATA.filter((_, i) => i !== idx)
    .map((item, i) => ({ ...item, no: i + 1 }));
  closeModal();
  await saveMasterItems(newItems, `ลบสินค้า ${it.code} แล้ว`);
}

async function saveMasterItems(newItems, successMsg) {
  try {
    /* ใช้ transaction ป้องกัน Admin 2 คนแก้ masterData/items พร้อมกัน */
    await db.ref(DB_ROOT+'/masterData/items').transaction(() => newItems);
    ITEMS_DATA = newItems;
    ALL_CLS = ['ALL', ...new Set(ITEMS_DATA.map(i => i.class).filter(Boolean))]
      .sort((a, b) => {
        if (a === 'ALL') return -1; if (b === 'ALL') return 1;
        const na = Number(a), nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
    toast(successMsg || 'บันทึกแล้ว ✅', 'ok');
    buildManageItemsView(document.getElementById('content'));
  } catch (e) {
    toast('เกิดข้อผิดพลาด: ' + e.message, 'err');
  }
}

/* ════════════════════════════════════════════
   [NEW] ADMIN: จัดการ Stores (เพิ่มสาขาใหม่)
   ════════════════════════════════════════════ */
let STORE_SEARCH_Q = '';

function renderManageStores() {
  setTB('จัดการสาขา', 'Admin — Stores');
  const C = document.getElementById('content');
  buildManageStoresView(C);
}

function buildManageStoresView(C) {
  const filtered = STORE_SEARCH_Q
    ? STORES.filter(s =>
        String(s.n).includes(STORE_SEARCH_Q) ||
        s.name.toLowerCase().includes(STORE_SEARCH_Q.toLowerCase()) ||
        (s.u || '').toLowerCase().includes(STORE_SEARCH_Q.toLowerCase()))
    : STORES;

  const rows = filtered.map((s) => `
    <tr>
      <td class="bold num">${s.n}</td>
      <td>${esc(s.name)}</td>
      <td class="code-cell">${esc(s.u)}</td>
      <td class="code-cell">${esc(s.p)}</td>
      <td class="tr" style="white-space:nowrap">
        <button class="btn btn-secondary btn-xs" onclick="showEditStoreModal('${s.n}')">✏️ แก้ไข</button>
        <button class="btn btn-xs" style="background:var(--red-bg);color:var(--red);border:1px solid rgba(224,50,68,.2);cursor:pointer;padding:3px 8px;border-radius:var(--r8);font-size:11px;font-weight:600" onclick="confirmDeleteStore('${s.n}')">🗑️ ลบ</button>
      </td>
    </tr>`).join('');

  C.innerHTML = `
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--amber)">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:36px">🏪</div>
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--txt)">จัดการสาขา</div>
          <div style="font-size:13px;color:var(--txt3);margin-top:4px">เพิ่ม แก้ไข หรือลบสาขา · <b style="color:var(--amber)">${STORES.length} สาขา</b></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">🏪 รายการสาขาทั้งหมด <span class="sub">${STORES.length} สาขา</span></div>
        <div class="flex gap8 items-c">
          <button class="btn btn-blue" onclick="showAddStoreModal()">➕ เพิ่มสาขาใหม่</button>
          <button class="btn btn-secondary btn-sm" onclick="renderManageStores()">🔄 รีเฟรช</button>
        </div>
      </div>

      <div class="filter-bar" style="margin-bottom:12px">
        <div class="flex-1">
          <label class="flabel">🔍 ค้นหาสาขา</label>
          <div class="search-wrap">
            <span class="search-ico">🔍</span>
            <input type="text" class="ctrl" id="storeSearchInp" placeholder="เลขสาขา, ชื่อสาขา, Username..."
              value="${esc(STORE_SEARCH_Q)}"
              oninput="STORE_SEARCH_Q=this.value;buildManageStoresView(document.getElementById('content'))">
          </div>
        </div>
      </div>

      <div style="margin-bottom:10px;padding:10px 14px;background:var(--warn-bg);border-radius:var(--r8);border:1px solid rgba(212,139,10,.2);font-size:12.5px;color:var(--warn)">
        ⚠️ <b>สาขาที่เพิ่มใหม่จาก Firebase จะ Login และใช้งานได้เหมือนสาขาเดิมทุกประการ</b>
      </div>

      <div class="tbl-wrap" style="max-height:65vh">
        <table class="dtbl">
          <thead>
            <tr>
              <th style="width:60px">เลขสาขา</th>
              <th>ชื่อสาขา</th>
              <th style="width:110px">Username</th>
              <th style="width:100px">Password</th>
              <th style="width:120px;text-align:right">จัดการ</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5" class="tc muted" style="padding:28px">ไม่พบสาขา</td></tr>'}</tbody>
          <tfoot>
            <tr><td colspan="5" class="tr" style="font-size:12px;color:var(--txt3)">แสดง ${filtered.length} / ${STORES.length} สาขา</td></tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}

function showAddStoreModal() {
  showModal(`
    <h3>➕ เพิ่มสาขาใหม่</h3>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
      <div>
        <label class="flabel">เลขสาขา <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="as_n" placeholder="เช่น 999" oninput="autoFillStoreUser()">
        <div style="font-size:11px;color:var(--txt3);margin-top:3px">ตัวเลข เช่น 11, 999 — จะใช้เป็น store011, store999</div>
      </div>
      <div>
        <label class="flabel">ชื่อสาขา <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="as_name" placeholder="เช่น พิษณุโลก">
      </div>
      <div>
        <label class="flabel">Username <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="as_u" placeholder="store011">
        <div style="font-size:11px;color:var(--txt3);margin-top:3px">กรอกเลขสาขาแล้ว Username จะถูกสร้างอัตโนมัติ</div>
      </div>
      <div>
        <label class="flabel">Password <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="as_p" value="welcome1" placeholder="welcome1">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-blue" onclick="doAddStore()">➕ เพิ่มสาขา</button>
    </div>`);
}

function autoFillStoreUser() {
  const nVal = document.getElementById('as_n')?.value.trim();
  const uInp = document.getElementById('as_u');
  if (nVal && uInp) {
    uInp.value = 'store' + String(nVal).padStart(3, '0');
  }
}

async function doAddStore() {
  const n = document.getElementById('as_n').value.trim();
  const name = document.getElementById('as_name').value.trim();
  const u = document.getElementById('as_u').value.trim().toLowerCase();
  const p = document.getElementById('as_p').value.trim();
  if (!n || !name || !u || !p) { toast('กรุณากรอกข้อมูลให้ครบถ้วน', 'err'); return; }
  if (STORES.find(s => String(s.n) === String(n))) { toast('เลขสาขา ' + n + ' มีอยู่แล้ว', 'err'); return; }
  if (STORES.find(s => s.u === u)) { toast('Username "' + u + '" มีอยู่แล้ว', 'err'); return; }
  const newStore = { n, name, u, p };
  const newStores = [...STORES, newStore].sort((a, b) => Number(a.n) - Number(b.n));
  closeModal();
  await saveMasterStores(newStores, `เพิ่มสาขา ${n} ${name} แล้ว ✅`);
}

function showEditStoreModal(storeN) {
  const s = STORES.find(st => String(st.n) === String(storeN));
  if (!s) return;
  showModal(`
    <h3>✏️ แก้ไขสาขา ${s.n}</h3>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
      <div>
        <label class="flabel">เลขสาขา</label>
        <input type="text" class="ctrl w100" value="${esc(String(s.n))}" readonly style="background:var(--surface2);color:var(--txt3)">
      </div>
      <div>
        <label class="flabel">ชื่อสาขา <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="es_name" value="${esc(s.name)}">
      </div>
      <div>
        <label class="flabel">Username</label>
        <input type="text" class="ctrl w100" value="${esc(s.u)}" readonly style="background:var(--surface2);color:var(--txt3)">
      </div>
      <div>
        <label class="flabel">Password <span style="color:var(--red)">*</span></label>
        <input type="text" class="ctrl w100" id="es_p" value="${esc(s.p)}">
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-blue" onclick="doEditStore('${s.n}')">💾 บันทึก</button>
    </div>`);
}

async function doEditStore(storeN) {
  const name = document.getElementById('es_name').value.trim();
  const p = document.getElementById('es_p').value.trim();
  if (!name || !p) { toast('กรุณากรอกข้อมูลให้ครบถ้วน', 'err'); return; }
  const newStores = STORES.map(s => String(s.n) === String(storeN) ? { ...s, name, p } : s);
  closeModal();
  await saveMasterStores(newStores, `แก้ไขสาขา ${storeN} แล้ว ✅`);
}

function confirmDeleteStore(storeN) {
  const s = STORES.find(st => String(st.n) === String(storeN));
  showModal(`
    <h3 style="color:var(--red)">🗑️ ยืนยันการลบสาขา</h3>
    <p style="color:var(--txt2);margin-top:10px">
      ต้องการลบสาขา <b>${s.n} — ${esc(s.name)}</b> ใช่หรือไม่?<br>
      <span style="color:var(--txt3);font-size:12px">⚠️ ข้อมูลการบันทึกของสาขานี้ใน Firebase จะยังคงอยู่</span>
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-danger" onclick="doDeleteStore('${storeN}')">🗑️ ลบสาขา</button>
    </div>`);
}

async function doDeleteStore(storeN) {
  const s = STORES.find(st => String(st.n) === String(storeN));
  const newStores = STORES.filter(st => String(st.n) !== String(storeN));
  closeModal();
  await saveMasterStores(newStores, `ลบสาขา ${storeN} ${s ? s.name : ''} แล้ว`);
}

async function saveMasterStores(newStores, successMsg) {
  try {
    /* ใช้ transaction ป้องกัน concurrent overwrite */
    await db.ref(DB_ROOT+'/masterData/stores').transaction(() => newStores);
    STORES = newStores;
    toast(successMsg || 'บันทึกแล้ว ✅', 'ok');
    buildManageStoresView(document.getElementById('content'));
  } catch (e) {
    toast('เกิดข้อผิดพลาด: ' + e.message, 'err');
  }
}

/* ════════════════════════════════════════════
   [NEW] STORE STATUS PAGE — สถานะการบันทึกรายสาขา
   Admin เลือกเดือน + เห็น 2 col (ยังไม่บันทึก / บันทึกแล้ว) + Export
════════════════════════════════════════════ */
let STATUS_YM = currentYM();

async function renderStoreStatus(){
  setTB('สถานะการบันทึก','Admin — Store Status');
  const C = document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  if(!STATUS_YM) STATUS_YM = currentYM();
  const mc = await getMonthControl();
  await renderStoreStatusForYM(C, mc, STATUS_YM);
}

async function renderStoreStatusForYM(C, mc, selYM){
  const curYM = currentYM();
  const allE = await dbGet('entries') || {};
  const months = generateMonthList();

  const sentStoreNos = new Set();
  Object.keys(allE).forEach(sNo=>{
    const mData=(allE[sNo]||{})[selYM]||{};
    if(Object.keys(mData).filter(k=>mData[k]!==null&&mData[k]!=='').length>0) sentStoreNos.add(String(sNo));
  });
  const sentList    = STORES.filter(s=>sentStoreNos.has(String(s.n)));
  const notSentList = STORES.filter(s=>!sentStoreNos.has(String(s.n)));

  const logs = await dbGet('logs') || {};
  const lastSaveMap = {};
  Object.values(logs).forEach(l=>{ if(l&&l.no&&l.ym===selYM){ if(!lastSaveMap[l.no]||l.ts>lastSaveMap[l.no]) lastSaveMap[l.no]=l.ts; } });

  const pastMonths   = months.filter(ym=>ym < curYM).reverse();
  const futureMonths = months.filter(ym=>ym > curYM);
  const makeOpt = ym => {
    const isAct = mc[ym]&&mc[ym].active===true;
    return `<option value="${ym}" ${selYM===ym?'selected':''}>${isAct?'✅':'🔒'} ${ym} — ${ymToFull(ym)}</option>`;
  };
  const ymOpts = `
    <optgroup label="📅 เดือนปัจจุบัน">${makeOpt(curYM)}</optgroup>
    <optgroup label="↩️ ย้อนหลัง (${pastMonths.length})">${pastMonths.map(makeOpt).join('')}</optgroup>
    <optgroup label="🔮 อนาคต (${futureMonths.length})">${futureMonths.map(makeOpt).join('')}</optgroup>`;

  const sentPct = STORES.length>0 ? Math.round(sentList.length/STORES.length*100) : 0;

  C.innerHTML=`
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--blue)">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="font-size:36px">📋</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:800;color:var(--txt)">สถานะการบันทึกข้อมูลรายสาขา — ${ymToFull(selYM)}</div>
          <div style="font-size:13px;color:var(--txt3);margin-top:4px">แบ่งสาขาตามสถานะ เพื่อให้ติดตามสาขาที่ยังไม่บันทึกได้ง่ายขึ้น</div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select class="ctrl" id="statusYMSel" style="font-size:12.5px" onchange="onStatusYMChange(this.value)">${ymOpts}</select>
            <span style="font-size:12px;background:var(--red-bg);color:var(--red);border-radius:999px;padding:3px 10px;font-weight:700">● ยังไม่บันทึก ${notSentList.length}</span>
            <span style="font-size:12px;background:var(--green-bg);color:var(--green);border-radius:999px;padding:3px 10px;font-weight:700">● บันทึกแล้ว ${sentList.length}</span>
          </div>
        </div>
        <button onclick="exportStoreStatusExcel('${selYM}')" style="background:var(--amber);color:#fff;border:none;font-weight:700;padding:9px 18px;border-radius:var(--r8);cursor:pointer;font-size:13px;white-space:nowrap">🧾 Export Excel</button>
      </div>
    </div>

    <div style="margin-bottom:10px">
      <div style="height:10px;border-radius:999px;background:var(--surface3);overflow:hidden">
        <div style="height:100%;border-radius:999px;background:var(--green);width:${sentPct}%;transition:width .8s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--txt3)">
        <span>${sentPct}% บันทึกแล้ว</span>
        <span>${sentList.length} / ${STORES.length} สาขา</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <!-- ยังไม่บันทึก -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:12px 16px;background:var(--red-bg);display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:9px;height:9px;border-radius:50%;background:var(--red)"></div>
            <span style="font-size:13.5px;font-weight:700;color:var(--red)">ยังไม่บันทึกข้อมูล</span>
          </div>
          <span style="font-size:12px;font-weight:800;background:var(--red);color:#fff;border-radius:999px;padding:2px 12px">${notSentList.length} สาขา</span>
        </div>
        <div style="max-height:68vh;overflow-y:auto">
          ${notSentList.length===0
            ? '<div style="padding:32px;text-align:center;color:var(--green);font-weight:700;font-size:14px">✅ ทุกสาขาบันทึกแล้ว!</div>'
            : notSentList.map((s,i)=>`
              <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border2);${i%2===0?'background:var(--surface1)':''}">
                <span style="font-size:11.5px;color:var(--txt4);font-weight:700;min-width:22px;text-align:right">${i+1}</span>
                <span style="font-size:12.5px;color:var(--txt);font-weight:500">บมจ.ซีพี แอ็กซ์ตร้า สาขา${esc(s.name)} ${s.n}</span>
              </div>`).join('')}
        </div>
      </div>

      <!-- บันทึกแล้ว -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:12px 16px;background:var(--green-bg);display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:9px;height:9px;border-radius:50%;background:var(--green)"></div>
            <span style="font-size:13.5px;font-weight:700;color:var(--green)">บันทึกข้อมูลแล้ว</span>
          </div>
          <span style="font-size:12px;font-weight:800;background:var(--green);color:#fff;border-radius:999px;padding:2px 12px">${sentList.length} สาขา</span>
        </div>
        <div style="max-height:68vh;overflow-y:auto">
          ${sentList.length===0
            ? '<div style="padding:32px;text-align:center;color:var(--txt3);font-size:13px">ยังไม่มีสาขาที่บันทึก</div>'
            : sentList.map((s,i)=>{
                const ts = lastSaveMap[String(s.n)];
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border2);${i%2===0?'background:var(--surface1)':''}">
                  <span style="font-size:11.5px;color:var(--txt4);font-weight:700;min-width:22px;text-align:right">${s.n}</span>
                  <span style="font-size:12.5px;color:var(--txt);font-weight:500;flex:1">บมจ.ซีพี แอ็กซ์ตร้า สาขา${esc(s.name)} ${s.n}</span>
                  <span style="font-size:11px;color:var(--txt4);white-space:nowrap">${ts?formatThaiDT(ts):''}</span>
                </div>`;
              }).join('')}
        </div>
      </div>
    </div>`;
}

async function onStatusYMChange(ym){
  STATUS_YM = ym;
  const C = document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';
  const mc = await getMonthControl();
  await renderStoreStatusForYM(C, mc, ym);
}

/* ════════════════════════════════════════════
   [NEW] PRESENCE PAGE — สาขาออนไลน์ (Realtime)
   Firebase path: presence/{storeNo}
   { no, name, loginAt, lastSeen, ua, online }
════════════════════════════════════════════ */
let _presenceListener = null;

async function renderPresence(){
  setTB('สาขาออนไลน์','Admin — Realtime Presence');
  const C = document.getElementById('content');
  C.innerHTML='<div class="card tc" style="padding:40px;color:var(--txt3)">⏳ กำลังโหลด...</div>';

  // ยกเลิก listener เก่าถ้ามี
  if(_presenceListener){ db.ref(DB_ROOT+'/presence').off('value', _presenceListener); _presenceListener=null; }

  buildPresenceView(C, {});

  // ผูก realtime listener
  _presenceListener = db.ref(DB_ROOT+'/presence').on('value', snap=>{
    const data = snap.val() || {};
    if(CURVIEW === 'presence') buildPresenceView(C, data);
    else { db.ref(DB_ROOT+'/presence').off('value', _presenceListener); _presenceListener=null; }
  });
}

function buildPresenceView(C, presenceData){
  const now = Date.now();
  const TIMEOUT_MS = 2 * 60 * 1000; // 2 นาที = อาจไม่ตอบสนอง

  const allPresence = Object.values(presenceData).map(p=>{
    if(!p || !p.no) return null;
    const store = STORES.find(s=>String(s.n)===String(p.no));
    const elapsed = now - (p.lastSeen||0);
    let status = 'offline';
    if(p.online && elapsed < TIMEOUT_MS)        status = 'online';
    else if(p.online && elapsed >= TIMEOUT_MS)  status = 'stale'; // heartbeat หายไป
    return { ...p, storeName: store ? store.name : p.name, elapsed, status };
  }).filter(Boolean).sort((a,b)=>{
    const ord = {online:0, stale:1, offline:2};
    return (ord[a.status]||2) - (ord[b.status]||2) || (b.lastSeen||0) - (a.lastSeen||0);
  });

  const onlineList = allPresence.filter(p=>p.status==='online');
  const staleList  = allPresence.filter(p=>p.status==='stale');
  const offlineList= allPresence.filter(p=>p.status==='offline');

  function elapsedStr(ms){
    if(ms < 60000) return `${Math.round(ms/1000)} วินาทีที่แล้ว`;
    if(ms < 3600000) return `${Math.round(ms/60000)} นาทีที่แล้ว`;
    return `${Math.round(ms/3600000)} ชั่วโมงที่แล้ว`;
  }

  function uaShort(ua=''){
    if(!ua) return '—';
    if(ua.includes('Edg')) return 'Edge';
    if(ua.includes('Chrome')) return 'Chrome';
    if(ua.includes('Firefox')) return 'Firefox';
    if(ua.includes('Safari')) return 'Safari';
    return 'Browser';
  }

  function statusBadge(p){
    if(p.status==='online') return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--green-bg);color:var(--green);font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px"><span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;animation:pulse-dot 1.4s infinite"></span>Online</span>';
    if(p.status==='stale')  return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--warn-bg);color:var(--warn);font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px">⏸ อาจไม่ตอบสนอง</span>';
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface2);color:var(--txt4);font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px">● Offline</span>';
  }

  function presenceRow(p, i){
    const loginStr = p.loginAt ? formatThaiDT(p.loginAt) : '—';
    const lastStr  = p.lastSeen ? formatThaiDT(p.lastSeen) : '—';
    const elapsed  = p.lastSeen ? elapsedStr(now - p.lastSeen) : '—';
    return `<tr>
      <td style="padding:10px 14px;font-weight:600;color:var(--txt2)">${p.no} — บมจ.ซีพี แอ็กซ์ตร้า สาขา${esc(p.storeName)} ${p.no}</td>
      <td style="padding:10px 14px">${statusBadge(p)}</td>
      <td style="padding:10px 14px;color:var(--txt3);font-size:12px">${loginStr}</td>
      <td style="padding:10px 14px;color:var(--txt3);font-size:12px">${elapsed}</td>
      <td style="padding:10px 14px;color:var(--txt4);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(uaShort(p.ua))} · ${esc((p.ua||'').substring(0,40))}${(p.ua||'').length>40?'…':''}</td>
      <td style="padding:10px 14px;text-align:right">
        ${p.status!=='offline'?`<button onclick="forceLogoutPresence('${p.no}')" style="background:var(--red-bg);color:var(--red);border:1px solid rgba(224,50,68,.2);padding:4px 10px;border-radius:var(--r8);font-size:11.5px;font-weight:600;cursor:pointer">บังคับออกจากระบบ</button>`:''}
      </td>
    </tr>`;
  }

  const tableRows = allPresence.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--txt3)">ยังไม่มีสาขาที่เข้าระบบ</td></tr>'
    : allPresence.map((p,i)=>presenceRow(p,i)).join('');

  C.innerHTML=`
    <style>
      @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
    </style>
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--green)">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="font-size:36px">🟢</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:800;color:var(--txt)">สถานะการเข้าใช้งานระบบของสาขา</div>
          <div style="font-size:13px;color:var(--txt3);margin-top:4px">แสดงผลแบบ Real-time — รายการนี้จะอัปเดตอัตโนมัติเมื่อมีสาขา เข้า/ออก ระบบ</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:12px;background:var(--green-bg);color:var(--green);border-radius:999px;padding:4px 12px;font-weight:700">🟢 ${onlineList.length} สาขาออนไลน์</span>
          ${staleList.length?`<span style="font-size:12px;background:var(--warn-bg);color:var(--warn);border-radius:999px;padding:4px 12px;font-weight:700">⏸ ${staleList.length} อาจไม่ตอบสนอง</span>`:''}
          <button class="btn btn-secondary btn-sm" onclick="renderPresence()">🔄</button>
        </div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-wrap">
        <table class="dtbl">
          <thead>
            <tr>
              <th>สาขา</th>
              <th style="width:150px">สถานะ</th>
              <th style="width:140px">เวลาเข้าระบบ</th>
              <th style="width:130px">เห็นล่าสุด</th>
              <th style="width:200px">อุปกรณ์ / เบราว์เซอร์</th>
              <th style="width:130px;text-align:right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:10px;padding:10px 14px;background:var(--surface2);border-radius:var(--r8);font-size:12px;color:var(--txt3)">
      💡 <b>หมายเหตุ:</b> สถานะ "อาจไม่ตอบสนอง" หมายถึงสาขาไม่ได้ส่ง heartbeat ภายใน 2 นาที (อาจปิดหน้าจอหรือเน็ตหลุด)
      &nbsp;·&nbsp; Realtime listener ทำงานอยู่ — หน้านี้อัปเดตอัตโนมัติเมื่อมีการเปลี่ยนแปลง
    </div>`;
}

async function forceLogoutPresence(storeNo){
  showModal(`
    <h3 style="color:var(--red)">⚠️ บังคับออกจากระบบ</h3>
    <p style="color:var(--txt2);margin-top:10px">
      ต้องการบังคับ <b>สาขา ${storeNo}</b> ออกจากระบบใช่หรือไม่?<br>
      <span style="font-size:12px;color:var(--txt3)">สาขาจะถูก set offline ทันที แต่ยังสามารถ Login ได้ใหม่</span>
    </p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-danger" onclick="doForceLogoutPresence('${storeNo}')">⚠️ บังคับออก</button>
    </div>`);
}

async function doForceLogoutPresence(storeNo){
  closeModal();
  try{
    await dbSet(`presence/${storeNo}/online`, false);
    await dbSet(`presence/${storeNo}/lastSeen`, Date.now());
    toast(`บังคับสาขา ${storeNo} ออกจากระบบแล้ว`,'ok');
  }catch(e){ toast('เกิดข้อผิดพลาด: '+e.message,'err'); }
}
