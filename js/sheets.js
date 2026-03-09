// ============================================================
//  PACE — sheets.js
//  Google Sheets sync via Apps Script web app
// ============================================================

// ===================== GOOGLE SHEETS SYNC =====================
let sheetsConfig = JSON.parse(localStorage.getItem('pace_sheets') || 'null');

function updateSheetsUI(){
  const connected = !!sheetsConfig?.url;
  const dot   = document.getElementById('sheets-conn-dot');
  const label = document.getElementById('sheets-conn-label');
  document.getElementById('sheets-setup-body').style.display      = connected ? 'none'  : 'block';
  document.getElementById('sheets-connected-body').style.display  = connected ? 'block' : 'none';
  if(dot)  { dot.className   = connected ? 'conn-dot connected' : 'conn-dot'; }
  if(label){ label.textContent = connected ? 'Connected' : 'Not connected'; }
  if(connected){
    document.getElementById('sheets-url-display').textContent = sheetsConfig.url;
  }
}

async function connectSheets(){
  const url = document.getElementById('sheets-url-input').value.trim();
  if(!url){ showAlert('sheets-connect-alert','Please paste your Apps Script Web App URL.','error'); return; }

  const btn = document.querySelector('#sheets-setup-body .connect-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Connecting...'; }

  try{
    await fetch(url, { method:'GET', mode:'cors' }).catch(()=>null);
    sheetsConfig = { url };
    localStorage.setItem('pace_sheets', JSON.stringify(sheetsConfig));
    updateSheetsUI();
    await sheetsSyncAll();
  } catch(err){
    showAlert('sheets-connect-alert', 'Connection failed: ' + err.message, 'error');
  } finally {
    if(btn){ btn.disabled = false; btn.innerHTML = '📊 Connect & Sync'; }
  }
}

function disconnectSheets(){
  if(!confirm('Disconnect Google Sheets? Your existing data in the spreadsheet won\'t be deleted.')) return;
  sheetsConfig = null;
  localStorage.removeItem('pace_sheets');
  updateSheetsUI();
}

async function sheetsSyncAll(){
  if(!sheetsConfig?.url){ showAlert('sheets-sync-alert','No Sheets URL configured.','error'); return; }
  const btn = document.getElementById('sheets-sync-btn');
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Syncing...'; }

  const logEl = document.getElementById('sheets-sync-log');
  logEl.style.display = 'block';
  logEl.innerHTML = `[${now()}] Starting full sync of ${runs.length} runs...
`;

  try{
    // Attach stable IDs to any runs that don't have one
    let changed = false;
    runs.forEach(r => { if(!r.id){ r.id = `${r.date}-${r.type}-${Math.random().toString(36).slice(2,8)}`; changed=true; } });
    if(changed) save();

    const res = await fetch(sheetsConfig.url, {
      method : 'POST',
      mode   : 'no-cors', // Apps Script requires no-cors from browsers
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({ action:'sync_all', runs })
    });

    // no-cors means we can't read the response body — treat as success
    logEl.innerHTML += `[${now()}] ✅ Sync sent — ${runs.length} runs pushed to Google Sheets.
`;
    logEl.innerHTML += `[${now()}] Sheets are organised by run type (Long Run, Interval, Tempo, Easy, Recovery, Race) plus an All Runs master tab.
`;
    showAlert('sheets-sync-alert', `✅ Synced ${runs.length} runs to Google Sheets.`, 'success');
  } catch(err){
    logEl.innerHTML += `[${now()}] ❌ Error: ${err.message}
`;
    showAlert('sheets-sync-alert', 'Sync error: ' + err.message, 'error');
  } finally {
    if(btn){ btn.disabled=false; btn.innerHTML='↻ Sync All Runs'; }
  }
}

async function sheetsPushRun(run, action='add_run'){
  if(!sheetsConfig?.url) return; // silently skip if not configured
  if(!run.id) run.id = `${run.date}-${run.type}-${Math.random().toString(36).slice(2,8)}`;
  try{
    await fetch(sheetsConfig.url, {
      method : 'POST',
      mode   : 'no-cors',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({ action, run, runId: run.id })
    });
  } catch(e){ /* silent — local save already succeeded */ }
}

async function sheetsDeleteRun(runId){
  if(!sheetsConfig?.url || !runId) return;
  try{
    await fetch(sheetsConfig.url, {
      method : 'POST',
      mode   : 'no-cors',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({ action:'delete_run', runId })
    });
  } catch(e){ /* silent */ }
}

function now(){ return new Date().toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
