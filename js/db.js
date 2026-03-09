// ============================================================
//  PACE — db.js
//  Firebase Firestore database layer.
//  Firebase API keys are safe to commit — they are public
//  identifiers, secured by Firestore Security Rules instead.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT_ID.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
};

// ── Is the DB configured? ────────────────────────────────────
function dbConfigured() {
  return FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
}

// ── Firestore REST API base ──────────────────────────────────
function fsBase() {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
}

// ── Low-level Firestore REST helpers ────────────────────────
async function fsGet(path) {
  const res = await fetch(`${fsBase()}/${path}?key=${FIREBASE_CONFIG.apiKey}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read error ${res.status}`);
  return res.json();
}

async function fsPatch(path, fields) {
  const url = `${fsBase()}/${path}?key=${FIREBASE_CONFIG.apiKey}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore write error ${res.status}`);
  return res.json();
}

// ── Convert JS value → Firestore field value ────────────────
function toFs(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')  return { doubleValue: val };
  if (typeof val === 'string')  return { stringValue: val };
  if (Array.isArray(val))       return { arrayValue: { values: val.map(toFs) } };
  if (typeof val === 'object')  return { mapValue: { fields: objToFs(val) } };
  return { stringValue: String(val) };
}

function objToFs(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFs(v);
  return fields;
}

// ── Convert Firestore field value → JS value ────────────────
function fromFs(val) {
  if (!val) return null;
  if ('nullValue'    in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue'  in val) return Number(val.doubleValue);
  if ('stringValue'  in val) return val.stringValue;
  if ('arrayValue'   in val) return (val.arrayValue.values || []).map(fromFs);
  if ('mapValue'     in val) return fromFsObj(val.mapValue.fields || {});
  return null;
}

function fromFsObj(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) obj[k] = fromFs(v);
  return obj;
}

// ── DB object ────────────────────────────────────────────────
const DB = {

  // Load all runs and shoes from Firestore
  async load() {
    const doc = await fsGet('pace/data');
    if (!doc || !doc.fields) return { runs: [], shoes: [] };
    return {
      runs:  fromFs(doc.fields.runs)  || [],
      shoes: fromFs(doc.fields.shoes) || [],
    };
  },

  // Save entire state to Firestore as a single document
  async save(runs, shoes, _message) {
    await fsPatch('pace/data', {
      runs:        toFs(runs),
      shoes:       toFs(shoes),
      lastUpdated: toFs(new Date().toISOString()),
    });
  },
};
