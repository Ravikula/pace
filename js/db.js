// ============================================================
//  PACE — db.js
//  Firebase Auth + Firestore via REST API.
//  Each user's data is stored at: users/{uid}/data/runs
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:     'AIzaSyDn71sBBRWl6uENdhSvs_7hujjvN8Mpyl4',
  authDomain: 'pace-25c02.firebaseapp.com',
  projectId:  'pace-25c02',
};

function dbConfigured() {
  return FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
}

// ── Auth state ───────────────────────────────────────────────
let _currentUser = null;   // { uid, email, idToken }
let _authReadyResolve;
const authReady  = new Promise(res => { _authReadyResolve = res; });

function currentUser() { return _currentUser; }

// ── Firebase Auth REST ───────────────────────────────────────
const AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

async function authRequest(endpoint, body) {
  const res = await fetch(`${AUTH_BASE}:${endpoint}?key=${FIREBASE_CONFIG.apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Auth error');
  return data;
}

async function authSignUp(email, password) {
  const data = await authRequest('signUp', { email, password, returnSecureToken: true });
  _setUser(data);
  return data;
}

async function authSignIn(email, password) {
  const data = await authRequest('signInWithPassword', { email, password, returnSecureToken: true });
  _setUser(data);
  return data;
}

async function authGoogleSignIn(googleIdToken) {
  const data = await authRequest('signInWithIdp', {
    postBody:          `id_token=${googleIdToken}&providerId=google.com`,
    requestUri:        location.origin + location.pathname,
    returnSecureToken: true,
    returnIdpCredential: true,
  });
  _setUser(data);
  return data;
}

function authSignOut() {
  _currentUser = null;
  localStorage.removeItem('pace_auth');
  location.reload();
}

async function authRestore() {
  const saved = localStorage.getItem('pace_auth');
  if (saved) {
    try {
      const { email, password } = JSON.parse(saved);
      const data = await authRequest('signInWithPassword', { email, password, returnSecureToken: true });
      _setUser(data);
      return true;
    } catch(e) {
      localStorage.removeItem('pace_auth');
    }
  }
  _authReadyResolve(null);
  return false;
}

function _setUser(data) {
  _currentUser = { uid: data.localId, email: data.email, idToken: data.idToken };
  _authReadyResolve(_currentUser);
}

// ── Firestore REST ───────────────────────────────────────────
function fsBase() {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
}

function fsHeaders() {
  if (!_currentUser) throw new Error('Not authenticated');
  return { 'Authorization': `Bearer ${_currentUser.idToken}`, 'Content-Type': 'application/json' };
}

function userDocPath() {
  if (!_currentUser) throw new Error('Not authenticated');
  return `users/${_currentUser.uid}/data/runs`;
}

async function fsGet(path) {
  const res = await fetch(`${fsBase()}/${path}`, { headers: fsHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read error ${res.status}`);
  return res.json();
}

async function fsPatch(path, fields) {
  const res = await fetch(`${fsBase()}/${path}`, {
    method:  'PATCH',
    headers: fsHeaders(),
    body:    JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore write error ${res.status}`);
  return res.json();
}

// ── Firestore value converters ───────────────────────────────
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
  const f = {};
  for (const [k, v] of Object.entries(obj)) f[k] = toFs(v);
  return f;
}
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
  async load() {
    const doc = await fsGet(userDocPath());
    if (!doc || !doc.fields) return { runs: [], shoes: [] };
    return {
      runs:  fromFs(doc.fields.runs)  || [],
      shoes: fromFs(doc.fields.shoes) || [],
    };
  },
  async save(runs, shoes, _message) {
    await fsPatch(userDocPath(), {
      runs:        toFs(runs),
      shoes:       toFs(shoes),
      lastUpdated: toFs(new Date().toISOString()),
    });
  },
};