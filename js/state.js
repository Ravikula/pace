// ============================================================
//  PACE — state.js
//  Global state, constants, shared helper functions.
//  On load: reads from GitHub data.json, falls back to localStorage.
// ============================================================

const TYPE_COLORS = {
  'Long Run':'#a78bfa','Interval':'#8b5cf6','Recovery':'#c4b5fd',
  'Tempo':'#7c3aed','Easy':'#a78bfa','Race':'#6d28d9'
};

function stravaToType(act){
  const wt=act.workout_type,name=(act.name||'').toLowerCase();
  if(wt===1)return'Race';if(wt===2)return'Long Run';
  if(wt===3){if(/interval|repeat|speed/.test(name))return'Interval';if(/tempo|threshold/.test(name))return'Tempo';return'Interval';}
  if(/long/.test(name))return'Long Run';if(/interval|repeat|speed/.test(name))return'Interval';
  if(/tempo|threshold/.test(name))return'Tempo';if(/recovery|easy|shakeout|jog/.test(name))return'Recovery';
  if(/race|5k|10k|half|marathon|parkrun/.test(name))return'Race';
  const km=(act.distance||0)/1000;if(km>=18)return'Long Run';if(km<=7)return'Recovery';return'Easy';
}

// ── App state ──────────────────────────────────────────────
let runs         = [];
let shoes        = [];
let stravaConfig = JSON.parse(localStorage.getItem('pace_strava')|| 'null');
let activeFilter = 'All';
let segments     = [];
let editingIdx   = null;
let editingShoeIdx = null;

// ── Local cache helpers ────────────────────────────────────
function save()      { localStorage.setItem('pace_runs',  JSON.stringify(runs));  }
function saveShoes() { localStorage.setItem('pace_shoes', JSON.stringify(shoes)); }
function saveStrava(cfg){ stravaConfig=cfg; localStorage.setItem('pace_strava', JSON.stringify(cfg)); }

function showAlert(id, msg, type){
  const el=document.getElementById(id); if(!el)return;
  el.textContent=msg; el.className=`alert ${type} show`;
  if(type!=='info') setTimeout(()=>el.classList.remove('show'), 6000);
}

function ensureIds(){
  let changed=false;
  runs.forEach(r=>{ if(!r.id){ r.id=`${r.date}-${r.type}-${Math.random().toString(36).slice(2,8)}`; changed=true; }});
  shoes.forEach(s=>{ if(!s.id){ s.id=`shoe-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; changed=true; }});
  if(changed){ save(); saveShoes(); }
}

// ── Push full state to GitHub ──────────────────────────────
// Called after every run/shoe save or delete
async function dbSave(message){
  if(!dbConfigured()) return;
  try{
    await DB.save(runs, shoes, message);
  } catch(err){
    console.warn('GitHub save failed:', err.message);
    showDbStatus('error');
  }
}



// ── DB status banner ───────────────────────────────────────
function showDbStatus(state){
  const el=document.getElementById('db-status'); if(!el) return;
  const map={
    loading:      { text:'Syncing with Firebase…',              cls:'info'    },
    connected:    { text:'✓ Synced with Firebase',              cls:'success' },
    offline:      { text:'⚠ Offline — using local cache',    cls:'warning' },
    error:        { text:'⚠ Firebase save failed — check credentials', cls:'warning'},
    unconfigured: { text:'ⓘ No database configured — data is local only', cls:'info' },
  };
  const s=map[state]||map.unconfigured;
  el.textContent=s.text; el.className=`db-status-bar ${s.cls}`; el.style.display='block';
  if(state==='connected') setTimeout(()=>{ el.style.display='none'; }, 3000);
}

// ── Helpers ────────────────────────────────────────────────
function formatPace(distKm,durMin){
  if(!distKm||!durMin||isNaN(distKm)||isNaN(durMin))return'—';
  const s=(parseFloat(durMin)*60)/parseFloat(distKm);
  return`${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,'0')}`;
}
function paceToSec(p){
  if(!p)return null;
  const str=String(p).trim();
  if(str.includes(':')){const[m,s]=str.split(':');return parseFloat(m)*60+parseFloat(s||0);}
  const[m,s]=str.split('.');return parseFloat(m)*60+parseFloat((s||'0').padEnd(2,'0').substring(0,2));
}
function secToPace(s){
  if(!s||isNaN(s))return'—';
  return`${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,'0')}`;
}
function formatDate(s){
  if(!s)return'';
  return new Date(s+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
}

// ── Boot: load from Firebase, ignore localStorage ───────────
async function initData(){
  showDbStatus('loading');

  // Always clear local cache when Firebase is configured
  // so stale data never shows up
  if(dbConfigured()){
    localStorage.removeItem('pace_runs');
    localStorage.removeItem('pace_shoes');
  }

  if(!dbConfigured()){
    showDbStatus('unconfigured');
    updateAll(); updateSheetsUI(); updateGear();
    return;
  }

  try{
    const { runs: dbRuns, shoes: dbShoes } = await DB.load();
    runs  = dbRuns;
    shoes = dbShoes;
    showDbStatus('connected');
  } catch(err){
    console.warn('Firebase unavailable:', err.message);
    showDbStatus('offline');
  }

  updateAll(); updateSheetsUI(); updateGear();
}