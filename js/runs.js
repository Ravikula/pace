// ============================================================
//  PACE — runs.js
//  Run stats, charts, run list rendering, log/edit modal, segment builder
// ============================================================

// ===================== INTERVAL AVERAGES =====================
function calcIntervalAverages(segs){
  if(!segs||!segs.length)return null;
  const reps=segs.filter(s=>s.segType==='Interval');
  if(!reps.length)return null;

  // Distance-weighted average pace
  let totalDist=0,totalPaceSec=0,validPace=0,totalHR=0,validHR=0;
  reps.forEach(r=>{
    const d=parseFloat(r.distance)||0;
    const ps=paceToSec(r.pace);
    const hr=parseFloat(r.hr)||0;
    totalDist+=d;
    if(ps&&d){totalPaceSec+=ps*d;validPace+=d;}
    if(hr){totalHR+=hr;validHR++;}
  });

  return{
    count:reps.length,
    totalDist:totalDist.toFixed(2),
    avgPace:validPace>0?secToPace(totalPaceSec/validPace):'—',
    avgHR:validHR>0?Math.round(totalHR/validHR):null,
    fastestPace:secToPace(Math.min(...reps.map(r=>paceToSec(r.pace)).filter(Boolean))),
    slowestPace:secToPace(Math.max(...reps.map(r=>paceToSec(r.pace)).filter(Boolean))),
  };
}

// Returns the display/stat distance for a run.
// For Interval runs with segments: sum all segment distances + (intervalCount - 1) * 0.4 km
function effectiveDist(r){
  if(r.type==='Interval'&&r.segments&&r.segments.length){
    const segTotal=r.segments.reduce((a,s)=>a+(parseFloat(s.distance)||0),0);
    const intervalCount=r.segments.filter(s=>s.segType==='Interval').length;
    const gap=intervalCount>1?(intervalCount-1)*0.4:0;
    return segTotal+gap;
  }
  return parseFloat(r.distance)||0;
}
let distRange='all', runsRange='all';

function setDistRange(range, btn){
  distRange=range;
  document.querySelectorAll('[data-dist-range]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('dist-custom-range').style.display=(range==='custom')?'flex':'none';
  updateStats();
}
function setRunsRange(range, btn){
  runsRange=range;
  document.querySelectorAll('[data-runs-range]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('runs-custom-range').style.display=(range==='custom')?'flex':'none';
  updateStats();
}

function filterByRange(runList, range, fromId, toId){
  const now=new Date(); now.setHours(23,59,59);
  if(range==='all') return runList;
  if(range==='year'){
    const start=new Date(now.getFullYear(),0,1);
    return runList.filter(r=>new Date(r.date+'T00:00:00')>=start);
  }
  if(range==='month'){
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    return runList.filter(r=>new Date(r.date+'T00:00:00')>=start);
  }
  if(range==='custom'){
    const from=document.getElementById(fromId)?.value;
    const to=document.getElementById(toId)?.value;
    return runList.filter(r=>{
      const d=r.date;
      if(from&&d<from)return false;
      if(to&&d>to)return false;
      return true;
    });
  }
  return runList;
}

function rangeLabel(range, fromId, toId){
  if(range==='all')return'all time';
  if(range==='year')return'this year';
  if(range==='month')return'this month';
  if(range==='custom'){
    const from=document.getElementById(fromId)?.value;
    const to=document.getElementById(toId)?.value;
    if(from&&to)return`${from} → ${to}`;
    if(from)return`from ${from}`;
    if(to)return`to ${to}`;
    return'custom range';
  }
  return'';
}

// ===================== STATS =====================
function updateStats(){
  // Total Distance
  const distRuns=filterByRange(runs,distRange,'dist-from','dist-to');
  const tot=distRuns.reduce((a,r)=>a+effectiveDist(r),0);
  document.getElementById('stat-distance').textContent=tot.toFixed(1);
  document.getElementById('stat-distance-unit').textContent=`km · ${rangeLabel(distRange,'dist-from','dist-to')}`;

  // Total Runs
  const runsFiltered=filterByRange(runs,runsRange,'runs-from','runs-to');
  document.getElementById('stat-runs').textContent=runsFiltered.length;
  document.getElementById('stat-runs-unit').textContent=`sessions · ${rangeLabel(runsRange,'runs-from','runs-to')}`;

  // Total Time (all time)
  const totM=runs.reduce((a,r)=>a+(parseFloat(r.duration)||0),0);
  // stat-time removed from dashboard

  // Interval Avg Pace — from last N interval runs with segments
  const iPaceN=document.getElementById('interval-pace-n')?.value;
  const intervalRuns=[...runs].filter(r=>r.type==='Interval'&&r.segments?.length).sort((a,b)=>b.date.localeCompare(a.date));
  const iPacePool=iPaceN==='all'?intervalRuns:intervalRuns.slice(0,parseInt(iPaceN));
  if(iPacePool.length){
    // Average the per-run average paces (distance-weighted across all their reps)
    let totalPaceSec=0,totalDist=0;
    iPacePool.forEach(r=>{
      const avgs=calcIntervalAverages(r.segments);
      if(avgs){const ps=paceToSec(avgs.avgPace);const d=parseFloat(avgs.totalDist)||0;if(ps&&d){totalPaceSec+=ps*d;totalDist+=d;}}
    });
    document.getElementById('stat-interval-pace').textContent=totalDist>0?secToPace(totalPaceSec/totalDist):'—';
  } else {
    document.getElementById('stat-interval-pace').textContent='—';
  }

  // Interval Avg HR — from last N interval runs
  const iHRN=document.getElementById('interval-hr-n')?.value;
  const iHRPool=iHRN==='all'?intervalRuns:intervalRuns.slice(0,parseInt(iHRN));
  if(iHRPool.length){
    let totalHR=0,count=0;
    iHRPool.forEach(r=>{
      const avgs=calcIntervalAverages(r.segments);
      if(avgs&&avgs.avgHR){totalHR+=avgs.avgHR;count++;}
    });
    document.getElementById('stat-interval-hr').textContent=count>0?Math.round(totalHR/count):'—';
  } else {
    document.getElementById('stat-interval-hr').textContent='—';
  }

  // Long Run Avg HR — from last N long runs
  const lrHRN=document.getElementById('longrun-hr-n')?.value;
  const longRuns=[...runs].filter(r=>r.type==='Long Run'&&r.hr).sort((a,b)=>b.date.localeCompare(a.date));
  const lrPool=lrHRN==='all'?longRuns:longRuns.slice(0,parseInt(lrHRN));
  if(lrPool.length){
    const avgHR=lrPool.reduce((a,r)=>a+(parseFloat(r.hr)||0),0)/lrPool.length;
    document.getElementById('stat-longrun-hr').textContent=Math.round(avgHR);
  } else {
    document.getElementById('stat-longrun-hr').textContent='—';
  }
}

function updateChart(){
  const chart=document.getElementById('bar-chart'),now=new Date();
  const weeks=Array.from({length:8},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()-i*7);const s=new Date(d);s.setDate(s.getDate()-s.getDay());return s;}).reverse();
  const wd=weeks.map(s=>{const e=new Date(s);e.setDate(e.getDate()+6);const dist=runs.filter(r=>{const rd=new Date(r.date+'T00:00:00');return rd>=s&&rd<=e;}).reduce((a,r)=>a+effectiveDist(r),0);return{dist,label:s.toLocaleDateString('en-AU',{month:'short',day:'numeric'})};});
  const max=Math.max(...wd.map(w=>w.dist),1);
  chart.innerHTML=wd.map(w=>`<div class="bar-col" title="${w.dist.toFixed(1)} km"><div class="bar" style="height:${Math.max((w.dist/max)*120,w.dist>0?8:0)}px;background:linear-gradient(180deg,#a78bfa,#6d28d9);opacity:${w.dist>0?1:0.15}"><span class="bar-label">${w.label}</span></div></div>`).join('');
}

function updateBreakdown(){
  const types=['Long Run','Interval','Recovery','Tempo','Easy','Race'],counts={};
  types.forEach(t=>counts[t]=0);runs.forEach(r=>{if(counts[r.type]!==undefined)counts[r.type]++;});
  const total=runs.length||1;
  const max=Math.max(...Object.values(counts),1);
  document.getElementById('run-type-pct-sub').textContent=`Percentage of ${runs.length} session${runs.length!==1?'s':''}`;
  document.getElementById('type-breakdown').innerHTML=types.map(t=>{
    const pct=Math.round((counts[t]/total)*100);
    return`<div class="type-row"><div class="type-dot" style="background:${TYPE_COLORS[t]}"></div><div class="type-name">${t}</div><div class="type-bar-bg"><div class="type-bar-fill" style="width:${(counts[t]/max)*100}%;background:${TYPE_COLORS[t]}"></div></div><div class="type-count" style="min-width:40px">${pct}%</div></div>`;
  }).join('');
}

// ===================== INTERVAL DETAIL HTML =====================
function intervalDetailHTML(r){
  if(!r.segments||!r.segments.length)return'';
  const avgs=calcIntervalAverages(r.segments);
  const reps=r.segments.filter(s=>s.segType==='Interval');
  // Find fastest pace for bar scaling
  const paceSecs=reps.map(s=>paceToSec(s.pace)).filter(Boolean);
  const minPace=paceSecs.length?Math.min(...paceSecs):null;
  const maxPace=paceSecs.length?Math.max(...paceSecs):null;

  let summaryHTML='';
  if(avgs){
    summaryHTML=`<div class="interval-summary-bar">
      <div class="isb-card"><div class="isb-label">Reps</div><div class="isb-val">${avgs.count}</div><div class="isb-sub">interval reps</div></div>
      <div class="isb-card"><div class="isb-label">Avg Pace</div><div class="isb-val">${avgs.avgPace}</div><div class="isb-sub">min/km</div></div>
      <div class="isb-card"><div class="isb-label">Avg HR</div><div class="isb-val">${avgs.avgHR||'—'}</div><div class="isb-sub">bpm</div></div>
      <div class="isb-card"><div class="isb-label">Rep Distance</div><div class="isb-val">${avgs.totalDist}</div><div class="isb-sub">km total reps</div></div>
    </div>`;
  }

  const rows=r.segments.map((s,i)=>{
    const isWU=s.segType==='Warmup',isCD=s.segType==='Cooldown',isIV=s.segType==='Interval';
    const cls=isWU?'seg-warmup':isCD?'seg-cooldown':'seg-interval';
    const badge=isWU?'<span class="seg-badge badge-wu">Warmup</span>':isCD?'<span class="seg-badge badge-cd">Cooldown</span>':`<span class="seg-badge badge-iv">Rep ${r.segments.filter((x,j)=>x.segType==='Interval'&&j<=i).length}</span>`;
    const pSec=paceToSec(s.pace);
    let paceCell=s.pace||'—';
    if(isIV&&pSec&&minPace&&maxPace&&maxPace>minPace){
      const pct=Math.round(((maxPace-pSec)/(maxPace-minPace))*70+15);
      paceCell=`<div class="pace-bar-cell"><span>${s.pace}</span><div class="pace-mini-bar" style="width:${pct}px"></div></div>`;
    }
    return`<tr class="${cls}"><td>${badge}</td><td>${s.distance||'—'} km</td><td>${paceCell}</td><td>${s.hr||'—'} bpm</td></tr>`;
  }).join('');

  return`${summaryHTML}
  <table class="interval-table">
    <thead><tr><th>Segment</th><th>Distance</th><th>Pace (min/km)</th><th>Heart Rate</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ===================== RUN ROW HTML =====================
function runRowHTML(r,idx,showEdit=false){
  const hasIntervals=r.type==='Interval'&&r.segments&&r.segments.length>0;
  const avgs=hasIntervals?calcIntervalAverages(r.segments):null;

  const paceDisplay=avgs?avgs.avgPace:formatPace(effectiveDist(r),r.duration);
  const hrDisplay=avgs&&avgs.avgHR?avgs.avgHR:(r.hr||'—');

  const expandBtn=hasIntervals?`<button class="expand-btn" onclick="event.stopPropagation();toggleDetail(${idx},this)">▾ Intervals</button>`:'<span></span>';
  const detailPanel=hasIntervals?`<div class="interval-detail" id="detail-${idx}">${intervalDetailHTML(r)}</div>`:'';

  const editBtn=showEdit?`<button class="edit-btn" onclick="event.stopPropagation();openEditModal(${idx})" title="Edit run">✎</button>`:'';
  const delBtn=showEdit?`<button class="delete-btn" onclick="event.stopPropagation();deleteRun(${idx})" title="Delete run">✕</button>`:'<button class="delete-btn" style="display:none">✕</button>';

  const clickable=showEdit?`style="cursor:pointer" onclick="openEditModal(${idx})"` :'';

  return`<div class="run-row" id="run-row-${idx}">
    <div class="run-row-main" ${clickable}>
      <div class="run-type-badge" style="background:${TYPE_COLORS[r.type]||'#555'}"></div>
      <div><div class="run-name">${r.type}${hasIntervals?` <span style="font-size:0.7rem;color:var(--accent);font-weight:400">${calcIntervalAverages(r.segments).count} reps</span>`:''}</div><div class="run-date">${formatDate(r.date)}${r.shoeId?` · <span style="color:var(--accent);font-size:0.72rem">👟 ${(shoes.find(s=>s.id===r.shoeId)||{model:'Unknown'}).model}</span>`:''}</div></div>
      ${r.fromStrava?'<span class="strava-icon">Strava</span>':'<span></span>'}
      <div class="run-stat"><div class="run-stat-val">${effectiveDist(r).toFixed(1)}</div><div class="run-stat-key">km total</div></div>
      <div class="run-stat"><div class="run-stat-val">${paceDisplay}</div><div class="run-stat-key">${avgs?'avg rep pace':'min/km'}</div></div>
      <div class="run-stat"><div class="run-stat-val">${hrDisplay}</div><div class="run-stat-key">${avgs&&avgs.avgHR?'avg rep HR':'bpm'}</div></div>
      ${(()=>{const sh=r.shoeId?shoes.find(s=>s.id===r.shoeId):null;return sh?`<div class="run-stat"><div class="run-stat-val" style="font-size:0.75rem;color:var(--accent)">👟</div><div class="run-stat-key" style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sh.model}</div></div>`:'<span></span>';})()}
      ${expandBtn}
      ${editBtn}
      ${delBtn}
    </div>
    ${detailPanel}
  </div>`;
}

function toggleDetail(idx,btn){
  const panel=document.getElementById(`detail-${idx}`);
  if(!panel)return;
  const open=panel.classList.toggle('open');
  btn.textContent=open?'▴ Intervals':'▾ Intervals';
  if(open)btn.style.borderColor='var(--interval)';
  else btn.style.borderColor='';
}

function updateRunList(){
  const last5=[...runs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  document.getElementById('recent-list').innerHTML=last5.length?last5.map(r=>runRowHTML(r,runs.indexOf(r),false)).join(''):`<div class="empty-state"><div class="empty-icon">🏃</div><div class="empty-text">No runs yet</div><p>Click "+ Log Run" to add your first session</p></div>`;
  const sorted=[...runs].sort((a,b)=>b.date.localeCompare(a.date));
  const filtered=activeFilter==='All'?sorted:sorted.filter(r=>r.type===activeFilter);
  document.getElementById('run-count-label').textContent=`${runs.length} session${runs.length!==1?'s':''} logged`;
  document.getElementById('full-run-list').innerHTML=filtered.length?filtered.map(r=>runRowHTML(r,runs.indexOf(r),true)).join(''):`<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">No ${activeFilter==='All'?'runs':activeFilter+' runs'} yet</div></div>`;
}

function updateStravaUI(){
  const dot=document.getElementById('strava-conn-dot'),label=document.getElementById('strava-conn-label');
  if(stravaConfig?.accessToken){
    if(dot){dot.className='conn-dot connected';}
    if(label){label.textContent=stravaConfig.athleteName||'Connected';}
    const connBody=document.getElementById('strava-connected-body');
    const setupBody=document.getElementById('strava-setup-body');
    if(connBody)connBody.style.display='block';
    if(setupBody)setupBody.style.display='none';
    const nameEl=document.getElementById('conn-athlete-name');
    if(nameEl)nameEl.textContent=`Connected as ${stravaConfig.athleteName||'Strava Athlete'}`;
  }else{
    if(dot){dot.className='conn-dot';}
    if(label){label.textContent='Not connected';}
    const connBody=document.getElementById('strava-connected-body');
    const setupBody=document.getElementById('strava-setup-body');
    if(connBody)connBody.style.display='none';
    if(setupBody)setupBody.style.display='block';
  }
}

function updateAll(){updateStats();updateChart();updateBreakdown();updateRunList();updateStravaUI();updateGear();}

// ===================== MODAL =====================
function openModal(){
  editingIdx=null;
  document.getElementById('modal-title-text').textContent='Log a Run';
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  ['f-distance','f-duration','f-hr','f-cadence','f-notes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-type').value='Easy';
  document.getElementById('f-shoe').value='';
  segments=[];
  renderSegments();
  populateShoeSelect();
  document.getElementById('interval-section').classList.remove('show');
  document.getElementById('modal').classList.add('open');
}

function openEditModal(idx){
  const r=runs[idx];
  if(!r)return;
  editingIdx=idx;
  document.getElementById('modal-title-text').textContent='Edit Run';
  document.getElementById('f-date').value=r.date||'';
  document.getElementById('f-type').value=r.type||'Easy';
  document.getElementById('f-distance').value=r.distance||'';
  document.getElementById('f-duration').value=r.duration||'';
  document.getElementById('f-hr').value=r.hr||'';
  document.getElementById('f-cadence').value=r.cadence||'';
  document.getElementById('f-notes').value=r.notes||'';
  populateShoeSelect(r.shoeId||'');
  segments=r.segments?r.segments.map(s=>({...s})):[];
  renderSegments();
  const sec=document.getElementById('interval-section');
  if(r.type==='Interval'&&segments.length){sec.classList.add('show');}
  else{sec.classList.remove('show');}
  document.getElementById('modal').classList.add('open');
}

function closeModal(){document.getElementById('modal').classList.remove('open');editingIdx=null;}
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});

function onTypeChange(){
  const t=document.getElementById('f-type').value;
  const sec=document.getElementById('interval-section');
  if(t==='Interval'){
    sec.classList.add('show');
    if(segments.length===0){
      // Pre-populate with warmup + 1 interval + cooldown
      segments=[
        {segType:'Warmup',distance:'',pace:'',hr:''},
        {segType:'Interval',distance:'',pace:'',hr:''},
        {segType:'Cooldown',distance:'',pace:'',hr:''},
      ];
      renderSegments();
    }
  }else{
    sec.classList.remove('show');
  }
}

// ===================== SEGMENT BUILDER =====================
function addSegment(type){
  segments.push({segType:type,distance:'',pace:'',hr:''});
  renderSegments();
}

function removeSegment(i){
  segments.splice(i,1);
  renderSegments();
}

function updateSegment(i,field,val){
  segments[i][field]=val;
  updateIntervalPreview();
}

function renderSegments(){
  const builder=document.getElementById('segment-builder');
  if(!segments.length){builder.innerHTML='';updateIntervalPreview();return;}
  builder.innerHTML=segments.map((s,i)=>{
    const color=s.segType==='Warmup'?'var(--warmup)':s.segType==='Cooldown'?'var(--cooldown)':'var(--interval)';
    const repNum=s.segType==='Interval'?segments.slice(0,i+1).filter(x=>x.segType==='Interval').length:null;
    const label=s.segType==='Warmup'?'Warmup':s.segType==='Cooldown'?'Cooldown':`Rep ${repNum}`;
    return`<div class="segment-row" style="border-left:3px solid ${color};padding-left:10px;border-radius:0 10px 10px 0;background:rgba(255,255,255,0.015);padding:8px 8px 8px 12px;border-radius:10px;">
      <div>
        <div class="seg-label" style="color:${color}">${label}</div>
        <select class="seg-type-select" onchange="changeSegType(${i},this.value)" style="border-color:${color}40;color:${color}">
          <option value="Warmup"${s.segType==='Warmup'?' selected':''}>Warmup</option>
          <option value="Interval"${s.segType==='Interval'?' selected':''}>Interval</option>
          <option value="Cooldown"${s.segType==='Cooldown'?' selected':''}>Cooldown</option>
        </select>
      </div>
      <div>
        <div class="seg-label">Distance (km)</div>
        <input type="number" step="0.01" min="0" placeholder="e.g. 0.4" value="${s.distance}" oninput="updateSegment(${i},'distance',this.value)">
      </div>
      <div>
        <div class="seg-label">Pace (min:sec)</div>
        <input type="text" placeholder="e.g. 4:33" value="${s.pace}" oninput="updateSegment(${i},'pace',this.value)">
      </div>
      <div>
        <div class="seg-label">Heart Rate</div>
        <input type="number" min="0" placeholder="bpm" value="${s.hr}" oninput="updateSegment(${i},'hr',this.value)">
      </div>
      <button class="remove-seg-btn" onclick="removeSegment(${i})">✕</button>
    </div>`;
  }).join('');
  updateIntervalPreview();
}

function changeSegType(i,val){
  segments[i].segType=val;
  renderSegments();
}

function updateIntervalPreview(){
  const preview=document.getElementById('interval-preview');
  const avgs=calcIntervalAverages(segments);
  if(!avgs||!segments.length){preview.style.display='none';return;}
  preview.style.display='block';
  const reps=segments.filter(s=>s.segType==='Interval');
  const wu=segments.filter(s=>s.segType==='Warmup').length;
  const cd=segments.filter(s=>s.segType==='Cooldown').length;
  preview.innerHTML=`<b>Live Summary:</b> &nbsp;${reps.length} rep${reps.length!==1?'s':''} · <b>Avg Pace: ${avgs.avgPace}</b> min/km · <b>Avg HR: ${avgs.avgHR||'—'}</b> bpm · Total rep distance: ${avgs.totalDist} km${wu?` · ${wu} warmup`:''}${cd?` · ${cd} cooldown`:''}`;
}

// ===================== SAVE RUN =====================
function saveRun(){
  const type=document.getElementById('f-type').value;
  const run={
    date:document.getElementById('f-date').value,
    type,
    distance:document.getElementById('f-distance').value,
    duration:document.getElementById('f-duration').value,
    hr:document.getElementById('f-hr').value,
    cadence:document.getElementById('f-cadence').value,
    shoeId:document.getElementById('f-shoe').value||null,
    notes:document.getElementById('f-notes').value,
  };
  if(!run.date||!run.type){alert('Please fill in date and type.');return;}
  if(type==='Interval'&&segments.length>0){run.segments=[...segments];}
  // Preserve Strava metadata when editing
  if(editingIdx!==null){
    if(runs[editingIdx].fromStrava)run.fromStrava=runs[editingIdx].fromStrava;
    if(runs[editingIdx].stravaId)run.stravaId=runs[editingIdx].stravaId;
    const oldId=runs[editingIdx].id;
    if(oldId)run.id=oldId;
    runs[editingIdx]=run;
    save();updateAll();closeModal();
    if(dbConfigured())DB.updateRun(run).catch(e=>console.warn('DB update failed:',e));
    sheetsPushRun(run,'update_run');
  } else {
    run.id=`${run.date}-${run.type}-${Math.random().toString(36).slice(2,8)}`;
    runs.unshift(run);
    save();updateAll();closeModal();
    if(dbConfigured())DB.addRun(run).catch(e=>console.warn('DB insert failed:',e));
    sheetsPushRun(run,'add_run');
  }
}

function deleteRun(idx){
  if(!confirm('Delete this run?'))return;
  const runId=runs[idx]?.id;
  runs.splice(idx,1);
  save();updateAll();
  if(runId){
    if(dbConfigured())DB.deleteRun(runId).catch(e=>console.warn('DB delete failed:',e));
    sheetsDeleteRun(runId);
  }
}
function filterRuns(type,el){activeFilter=type;document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));el.classList.add('active');updateRunList();}
function switchView(id,btn){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const view=document.getElementById('view-'+id);
  if(view){view.classList.add('active');view.style.display='';}
  // Sync top nav
  document.querySelectorAll('#top-nav button').forEach(b=>b.classList.remove('active'));
  // Sync bottom nav
  document.querySelectorAll('.bnav-btn').forEach(b=>{
    b.classList.toggle('active', b.getAttribute('data-view')===id);
  });
  if(btn&&btn.classList.contains('active')===false) btn.classList.add('active');
}
