// ============================================================
//  PACE — shoes.js
//  Shoe tracking — mileage calculation, gear UI, shoe modal
// ============================================================

// ===================== SHOE HELPERS =====================
const SHOE_MAX_KM = 800; // guide for bar fill

function shoeKmFromRuns(shoeId){
  return runs.reduce((total,r)=>{
    if(r.shoeId!==shoeId)return total;
    return total+effectiveDist(r);
  },0);
}

function shoeTotalKm(shoe){
  return (parseFloat(shoe.mileage)||0) + shoeKmFromRuns(shoe.id);
}

function shoeName(shoeId){
  if(!shoeId) return null;
  const s=shoes.find(s=>s.id===shoeId);
  return s?s.model:null;
}

function populateShoeSelect(selectedId=''){
  const sel=document.getElementById('f-shoe');
  if(!sel)return;
  const active=shoes.filter(s=>s.status!=='retired');
  sel.innerHTML=`<option value="">— No shoe selected —</option>`
    +active.map(s=>`<option value="${s.id}"${s.id===selectedId?' selected':''}>${s.model}${s.size?' · Size '+s.size:''}</option>`).join('');
}

// ===================== GEAR UI =====================
function updateGear(){
  const grid=document.getElementById('shoe-grid');
  const empty=document.getElementById('shoe-empty');
  const label=document.getElementById('shoe-count-label');
  if(!grid)return;
  const active=shoes.filter(s=>s.status!=='retired').length;
  label.textContent=`${shoes.length} shoe${shoes.length!==1?'s':''} tracked · ${active} active`;
  if(!shoes.length){grid.style.display='none';empty.style.display='block';return;}
  grid.style.display='grid';empty.style.display='none';

  // Active first, then retired
  const sorted=[...shoes].map((s,i)=>({s,i})).sort((a,b)=>{
    if(a.s.status===b.s.status)return 0;
    return a.s.status!=='retired'?-1:1;
  });

  grid.innerHTML=sorted.map(({s:shoe,i})=>{
    const total=shoeTotalKm(shoe);
    const fromRuns=shoeKmFromRuns(shoe.id);
    const start=parseFloat(shoe.mileage)||0;
    const pct=Math.min((total/SHOE_MAX_KM)*100,100);
    const runCount=runs.filter(r=>r.shoeId===shoe.id).length;
    const retired=shoe.status==='retired';
    const warn=!retired && total>=SHOE_MAX_KM*0.85;
    const barColor=retired?'linear-gradient(90deg,var(--p800),var(--p600))':
      warn?'linear-gradient(90deg,var(--p400),var(--p300))':
      'linear-gradient(90deg,var(--p500),var(--p300))';

    return`<div class="shoe-card ${retired?'shoe-retired':''}">
      <div class="shoe-header">
        <div>
          <div class="shoe-model">👟 ${shoe.model}</div>
          <div class="shoe-meta">${shoe.size?'Size '+shoe.size:'No size set'}${retired?' · <em style="color:var(--muted)">Retired</em>':''}</div>
        </div>
        <div class="shoe-actions">
          <span class="shoe-badge ${retired?'retired':'active'}">${retired?'Retired':'Active'}</span>
          <button class="edit-btn" onclick="openShoeModal(${i})" title="Edit">✎</button>
          <button class="delete-btn" onclick="deleteShoe(${i})" title="Delete">✕</button>
        </div>
      </div>

      <div class="shoe-km-display">
        <div class="shoe-km-total">${total.toFixed(1)}<span class="shoe-km-unit"> km</span></div>
        <div class="shoe-km-breakdown">
          <span style="color:var(--muted)">${start.toFixed(0)} starting</span>
          <span style="color:var(--muted)"> + </span>
          <span style="color:var(--accent)">${fromRuns.toFixed(1)} from ${runCount} run${runCount!==1?'s':''}</span>
        </div>
      </div>

      <div class="shoe-wear-bar-bg">
        <div class="shoe-wear-bar-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="shoe-progress-label">
        <span>0 km</span>
        ${warn?`<span style="color:var(--p400);font-weight:600">⚠ ${total.toFixed(0)} km — consider replacing</span>`:`<span style="color:var(--muted)">${total.toFixed(0)} / ${SHOE_MAX_KM} km guide</span>`}
        <span>${SHOE_MAX_KM} km</span>
      </div>

      ${shoe.notes?`<div class="shoe-notes">"${shoe.notes}"</div>`:''}
    </div>`;
  }).join('');
}


// ===================== SHOE MODAL =====================
function openShoeModal(idx=null){
  editingShoeIdx=idx;
  document.getElementById('shoe-modal-title').textContent=idx!==null?'Edit Shoe':'Add Shoe';
  if(idx!==null&&shoes[idx]){
    const s=shoes[idx];
    document.getElementById('s-model').value=s.model||'';
    document.getElementById('s-size').value=s.size||'';
    document.getElementById('s-mileage').value=s.mileage||'';
    document.getElementById('s-status').value=s.status||'active';
    document.getElementById('s-notes').value=s.notes||'';
  }else{
    ['s-model','s-size','s-notes'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('s-mileage').value='0';
    document.getElementById('s-status').value='active';
  }
  document.getElementById('shoe-modal').classList.add('open');
}

function closeShoeModal(){document.getElementById('shoe-modal').classList.remove('open');editingShoeIdx=null;}
document.getElementById('shoe-modal').addEventListener('click',e=>{if(e.target.id==='shoe-modal')closeShoeModal();});

function saveShoeFn(){
  const model=document.getElementById('s-model').value.trim();
  if(!model){alert('Please enter a shoe model name.');return;}
  const isEdit=editingShoeIdx!==null;
  const shoe={
    id:isEdit?shoes[editingShoeIdx].id:`shoe-${Date.now()}`,
    model,
    size:document.getElementById('s-size').value.trim(),
    mileage:document.getElementById('s-mileage').value||'0',
    status:document.getElementById('s-status').value,
    notes:document.getElementById('s-notes').value.trim(),
  };
  if(isEdit){shoes[editingShoeIdx]=shoe;}
  else{shoes.unshift(shoe);}
  saveShoes();
  updateGear();
  closeShoeModal();
  populateShoeSelect(document.getElementById('f-shoe')?.value||'');
  if(dbConfigured()){
    (isEdit?DB.updateShoe(shoe):DB.addShoe(shoe)).catch(e=>console.warn('DB shoe save failed:',e));
  }
}

function deleteShoe(idx){
  const shoe=shoes[idx];
  if(!shoe)return;
  const usedIn=runs.filter(r=>r.shoeId===shoe.id).length;
  const msg=usedIn>0
    ?`Delete "${shoe.model}"? It's linked to ${usedIn} run${usedIn!==1?'s':''} — those runs will no longer have a shoe assigned.`
    :`Delete "${shoe.model}"?`;
  if(!confirm(msg))return;
  runs.forEach(r=>{if(r.shoeId===shoe.id)r.shoeId=null;});
  save();
  shoes.splice(idx,1);
  saveShoes();updateAll();updateGear();
  if(dbConfigured())DB.deleteShoe(shoe.id).catch(e=>console.warn('DB shoe delete failed:',e));
}
