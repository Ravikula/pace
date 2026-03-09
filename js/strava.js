// ============================================================
//  PACE — strava.js
//  Strava OAuth integration and activity sync
// ============================================================

// ===================== STRAVA =====================
function openStravaAuth(){
  const clientId=document.getElementById('client-id').value.trim();
  if(!clientId){showAlert('connect-alert','Please enter your Client ID first.','error');return;}
  const url=`https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=activity:read_all`;
  showAlert('connect-alert','Strava auth page opened in a new tab. Click Authorize, then copy the code from the redirect URL.','info');
  window.open(url,'_blank');
}

async function exchangeToken(){
  const clientId=document.getElementById('client-id').value.trim();
  const clientSecret=document.getElementById('client-secret').value.trim();
  const code=document.getElementById('auth-code').value.trim();
  if(!clientId||!clientSecret||!code){showAlert('connect-alert','Please fill in all three fields.','error');return;}
  const btn=document.getElementById('connect-btn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Connecting...';
  try{
    const res=await fetch('https://www.strava.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code'})});
    const data=await res.json();
    if(!data.access_token)throw new Error(data.message||'Token exchange failed.');
    const cfg={clientId,clientSecret,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:data.expires_at,athleteName:`${data.athlete?.firstname||''} ${data.athlete?.lastname||''}`.trim()};
    saveStrava(cfg);updateStravaUI();
    showAlert('connect-alert','✅ Connected! Syncing your runs now...','success');
    await syncStrava();
  }catch(err){showAlert('connect-alert',`Error: ${err.message}`,'error');}
  finally{btn.disabled=false;btn.innerHTML='⚡ Connect & Sync Strava';}
}

async function refreshTokenIfNeeded(){
  if(!stravaConfig)return false;
  if(stravaConfig.expiresAt-Math.floor(Date.now()/1000)>300)return true;
  try{
    const res=await fetch('https://www.strava.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:stravaConfig.clientId,client_secret:stravaConfig.clientSecret,refresh_token:stravaConfig.refreshToken,grant_type:'refresh_token'})});
    const data=await res.json();
    if(!data.access_token)throw new Error('Refresh failed');
    stravaConfig.accessToken=data.access_token;stravaConfig.refreshToken=data.refresh_token;stravaConfig.expiresAt=data.expires_at;
    saveStrava(stravaConfig);return true;
  }catch{return false;}
}

async function syncStrava(){
  if(!stravaConfig?.accessToken)return;
  const btn=document.getElementById('sync-now-btn');
  if(btn){btn.disabled=true;btn.textContent='Syncing...';}
  const log=document.getElementById('sync-log'),syncAlert=document.getElementById('sync-alert');
  if(log){log.style.display='block';log.innerHTML='';}
  const logLine=msg=>{if(log){log.innerHTML+=msg+'<br>';log.scrollTop=log.scrollHeight;}};
  try{
    const valid=await refreshTokenIfNeeded();
    if(!valid)throw new Error('Could not refresh token. Please reconnect Strava.');
    const count=parseInt(document.getElementById('sync-count')?.value||60);
    const autoMap=document.getElementById('auto-map')?.checked!==false;
    logLine(`🔄 Fetching last ${count} activities from Strava...`);
    const res=await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${count}&page=1`,{headers:{'Authorization':`Bearer ${stravaConfig.accessToken}`}});
    if(!res.ok)throw new Error(`Strava API error ${res.status}`);
    const activities=await res.json();
    if(!Array.isArray(activities))throw new Error(activities.message||'Unexpected response');
    const runActs=activities.filter(a=>a.sport_type==='Run'||a.type==='Run');
    logLine(`📦 Found ${runActs.length} runs out of ${activities.length} total activities`);
    const existingIds=new Set(runs.filter(r=>r.stravaId).map(r=>r.stravaId));
    let added=0,skipped=0;
    for(const act of runActs){
      if(existingIds.has(act.id)){skipped++;continue;}
      const distKm=(act.distance||0)/1000,durMin=Math.round((act.moving_time||0)/60),dateStr=(act.start_date_local||act.start_date||'').substring(0,10),type=autoMap?stravaToType(act):'Easy';
      runs.push({date:dateStr,type,distance:distKm.toFixed(2),duration:durMin,hr:act.average_heartrate?Math.round(act.average_heartrate):'',cadence:act.average_cadence?Math.round(act.average_cadence*2):'',notes:act.name||'',fromStrava:true,stravaId:act.id});
      added++;
    }
    runs.sort((a,b)=>b.date.localeCompare(a.date));save();updateAll();
    logLine(`✅ Done — ${added} new run${added!==1?'s':''} imported, ${skipped} already existed`);
    if(syncAlert)showAlert('sync-alert',`Sync complete! ${added} new run${added!==1?'s':''} imported.`,added>0?'success':'info');
  }catch(err){
    logLine(`❌ ${err.message}`);
    if(syncAlert)showAlert('sync-alert',`Sync failed: ${err.message}`,'error');
  }finally{if(btn){btn.disabled=false;btn.textContent='↻ Sync Now';}}
}

function disconnectStrava(){
  if(!confirm('Disconnect Strava? Synced runs will remain.'))return;
  localStorage.removeItem('pace_strava');stravaConfig=null;updateStravaUI();
}
