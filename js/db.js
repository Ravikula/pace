// ============================================================
//  PACE — db.js
//  Supabase database layer — all reads and writes go through here.
//  Paste your Project URL and anon key below after creating
//  your Supabase project.
// ============================================================

const SUPABASE_URL = 'YOUR_PROJECT_URL';        // e.g. https://xxxx.supabase.co
const SUPABASE_KEY = 'YOUR_ANON_PUBLIC_KEY';    // from Settings → API

// ── Low-level fetch wrapper ──────────────────────────────────
async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        options.prefer || '',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase error ${res.status}`);
  }
  // 204 No Content has no body
  if (res.status === 204) return null;
  return res.json();
}

// ── DB STATUS ────────────────────────────────────────────────
// Returns true if Supabase credentials look configured
function dbConfigured() {
  return SUPABASE_URL !== 'YOUR_PROJECT_URL' && SUPABASE_KEY !== 'YOUR_ANON_PUBLIC_KEY';
}

// ── RUNS ─────────────────────────────────────────────────────
const DB = {

  // Fetch all runs, ordered newest first, with their segments
  async getRuns() {
    const runs = await sbFetch('runs?select=*&order=date.desc,created_at.desc');
    const segs  = await sbFetch('segments?select=*&order=run_id,seg_index');

    // Attach segments to their parent run
    const segMap = {};
    segs.forEach(s => {
      if (!segMap[s.run_id]) segMap[s.run_id] = [];
      segMap[s.run_id].push({
        segType:  s.seg_type,
        distance: String(s.distance ?? ''),
        pace:     s.pace ?? '',
        hr:       s.hr ? String(s.hr) : '',
      });
    });

    return runs.map(r => ({
      id:          r.id,
      date:        r.date,
      type:        r.type,
      distance:    r.distance != null ? String(r.distance) : '',
      duration:    r.duration != null ? String(r.duration) : '',
      hr:          r.hr       != null ? String(r.hr)       : '',
      cadence:     r.cadence  != null ? String(r.cadence)  : '',
      shoeId:      r.shoe_id  ?? null,
      notes:       r.notes    ?? '',
      fromStrava:  r.from_strava ?? false,
      stravaId:    r.strava_id  ?? null,
      segments:    segMap[r.id] ?? [],
    }));
  },

  // Insert a new run (and its segments)
  async addRun(run) {
    await sbFetch('runs', {
      method:  'POST',
      prefer:  'return=minimal',
      body:    JSON.stringify(runToRow(run)),
    });
    await writeSegments(run);
  },

  // Update an existing run (upsert + replace segments)
  async updateRun(run) {
    await sbFetch(`runs?id=eq.${encodeURIComponent(run.id)}`, {
      method:  'PATCH',
      prefer:  'return=minimal',
      body:    JSON.stringify(runToRow(run)),
    });
    // Delete old segments then rewrite
    await sbFetch(`segments?run_id=eq.${encodeURIComponent(run.id)}`, { method: 'DELETE' });
    await writeSegments(run);
  },

  // Delete a run (segments cascade automatically)
  async deleteRun(runId) {
    await sbFetch(`runs?id=eq.${encodeURIComponent(runId)}`, { method: 'DELETE' });
  },

  // ── SHOES ────────────────────────────────────────────────
  async getShoes() {
    const rows = await sbFetch('shoes?select=*&order=created_at');
    return rows.map(s => ({
      id:      s.id,
      model:   s.model,
      size:    s.size    ?? '',
      mileage: s.mileage != null ? String(s.mileage) : '0',
      status:  s.status  ?? 'active',
      notes:   s.notes   ?? '',
    }));
  },

  async addShoe(shoe) {
    await sbFetch('shoes', {
      method:  'POST',
      prefer:  'return=minimal',
      body:    JSON.stringify(shoeToRow(shoe)),
    });
  },

  async updateShoe(shoe) {
    await sbFetch(`shoes?id=eq.${encodeURIComponent(shoe.id)}`, {
      method:  'PATCH',
      prefer:  'return=minimal',
      body:    JSON.stringify(shoeToRow(shoe)),
    });
  },

  async deleteShoe(shoeId) {
    await sbFetch(`shoes?id=eq.${encodeURIComponent(shoeId)}`, { method: 'DELETE' });
  },

  // ── BULK SYNC ────────────────────────────────────────────
  // Push all localStorage data up to Supabase (first-time migration)
  async syncAll(runs, shoes) {
    // Upsert runs
    if (runs.length) {
      await sbFetch('runs', {
        method:  'POST',
        prefer:  'resolution=merge-duplicates,return=minimal',
        body:    JSON.stringify(runs.map(runToRow)),
      });
      // Upsert segments — delete all first then reinsert cleanly
      await sbFetch('segments', { method: 'DELETE', headers: { 'id': 'gt.0' } });
      const allSegs = runs.flatMap(r => buildSegRows(r));
      if (allSegs.length) {
        await sbFetch('segments', {
          method: 'POST',
          prefer: 'return=minimal',
          body:   JSON.stringify(allSegs),
        });
      }
    }
    // Upsert shoes
    if (shoes.length) {
      await sbFetch('shoes', {
        method:  'POST',
        prefer:  'resolution=merge-duplicates,return=minimal',
        body:    JSON.stringify(shoes.map(shoeToRow)),
      });
    }
  },
};

// ── Row converters ───────────────────────────────────────────
function runToRow(r) {
  return {
    id:           r.id,
    date:         r.date,
    type:         r.type,
    distance:     parseFloat(r.distance) || null,
    duration:     parseFloat(r.duration) || null,
    hr:           parseInt(r.hr)         || null,
    cadence:      parseInt(r.cadence)    || null,
    shoe_id:      r.shoeId              || null,
    notes:        r.notes               || null,
    from_strava:  r.fromStrava          || false,
    strava_id:    r.stravaId            || null,
  };
}

function shoeToRow(s) {
  return {
    id:       s.id,
    model:    s.model,
    size:     s.size    || null,
    mileage:  parseFloat(s.mileage) || 0,
    status:   s.status  || 'active',
    notes:    s.notes   || null,
  };
}

function buildSegRows(run) {
  if (!run.segments?.length) return [];
  return run.segments.map((s, i) => ({
    run_id:    run.id,
    seg_index: i,
    seg_type:  s.segType,
    distance:  parseFloat(s.distance) || null,
    pace:      s.pace  || null,
    hr:        parseInt(s.hr) || null,
  }));
}

async function writeSegments(run) {
  const rows = buildSegRows(run);
  if (!rows.length) return;
  await sbFetch('segments', {
    method:  'POST',
    prefer:  'return=minimal',
    body:    JSON.stringify(rows),
  });
}
