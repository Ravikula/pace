// ============================================================
//  PACE — auth.js
//  Login screen UI — Email/Password + Google Sign-In
// ============================================================

let _authMode = 'signin'; // 'signin' | 'signup'

function toggleAuthMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSignUp = _authMode === 'signup';
  document.getElementById('auth-submit-btn').textContent  = isSignUp ? 'Create Account' : 'Sign In';
  document.getElementById('auth-toggle-text').textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('auth-toggle-btn').textContent  = isSignUp ? 'Sign In' : 'Sign Up';
  document.getElementById('auth-error').style.display = 'none';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

async function handleAuthSubmit() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn      = document.getElementById('auth-submit-btn');

  if (!email || !password) { showAuthError('Please enter your email and password.'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

  btn.textContent = 'Please wait…';
  btn.disabled = true;
  document.getElementById('auth-error').style.display = 'none';

  try {
    if (_authMode === 'signup') {
      await authSignUp(email, password);
    } else {
      await authSignIn(email, password);
    }
    localStorage.setItem('pace_auth', JSON.stringify({ email, password }));
    showApp();
  } catch(err) {
    showAuthError(friendlyAuthError(err.message));
    btn.textContent = _authMode === 'signup' ? 'Create Account' : 'Sign In';
    btn.disabled = false;
  }
}

// ── Google Sign-In ───────────────────────────────────────────
async function handleGoogleSignIn() {
  const btn = document.getElementById('google-btn');
  btn.disabled = true;
  btn.textContent = 'Opening Google…';
  document.getElementById('auth-error').style.display = 'none';

  try {
    // Open Google OAuth popup
    const redirectUri = encodeURIComponent(location.origin + location.pathname);
    const clientId    = await getGoogleClientId();
    const nonce       = Math.random().toString(36).slice(2);
    const oauthUrl    = `https://accounts.google.com/o/oauth2/v2/auth`
      + `?client_id=${clientId}`
      + `&redirect_uri=${redirectUri}`
      + `&response_type=id_token`
      + `&scope=email%20profile`
      + `&nonce=${nonce}`;

    // Use popup window
    const popup = window.open(oauthUrl, 'googleSignIn', 'width=500,height=600,left=200,top=100');

    // Listen for the redirect back with id_token in hash
    const checkPopup = setInterval(async () => {
      try {
        if (!popup || popup.closed) {
          clearInterval(checkPopup);
          btn.disabled = false;
          btn.innerHTML = googleBtnHTML();
          return;
        }
        const hash = popup.location.hash;
        if (hash && hash.includes('id_token')) {
          clearInterval(checkPopup);
          popup.close();
          const params = new URLSearchParams(hash.slice(1));
          const idToken = params.get('id_token');
          await authGoogleSignIn(idToken);
          localStorage.setItem('pace_auth_google', '1');
          localStorage.removeItem('pace_auth');
          showApp();
        }
      } catch(e) { /* cross-origin, keep waiting */ }
    }, 300);

  } catch(err) {
    showAuthError('Google sign-in failed. Please try again.');
    btn.disabled = false;
    btn.innerHTML = googleBtnHTML();
  }
}

async function getGoogleClientId() {
  // Fetch client ID from Firebase project config
  const res = await fetch(
    `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${FIREBASE_CONFIG.apiKey}`
  );
  const data = await res.json();
  const provider = (data.authorizedDomains && data.idpConfig)
    ? data.idpConfig.find(p => p.provider === 'google.com')
    : null;
  if (provider) return provider.clientId;
  throw new Error('Google provider not configured');
}

function googleBtnHTML() {
  return `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.3z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.9 2.3-8 2.3-6.1 0-11.3-4.1-13.1-9.7H2.7v6.2C6.7 42.8 14.8 48 24 48z"/><path fill="#FBBC05" d="M10.9 28.8c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.7C1 17.2 0 20.5 0 24s1 6.8 2.7 9.2l8.2-4.4z"/><path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.8 0 6.7 5.2 2.7 12.8l8.2 4.4C12.7 13.6 17.9 9.5 24 9.5z"/></svg> Continue with Google`;
}

function friendlyAuthError(msg) {
  console.error('Auth error:', msg);
  if (msg.includes('EMAIL_EXISTS'))            return 'That email is already registered. Try signing in.';
  if (msg.includes('INVALID_LOGIN_CREDENTIALS') || msg.includes('INVALID_PASSWORD') || msg.includes('EMAIL_NOT_FOUND'))
                                               return 'Incorrect email or password.';
  if (msg.includes('TOO_MANY_ATTEMPTS'))       return 'Too many attempts. Please try again later.';
  if (msg.includes('WEAK_PASSWORD'))           return 'Password must be at least 6 characters.';
  if (msg.includes('INVALID_EMAIL'))           return 'Please enter a valid email address.';
  return msg; // Show raw error for debugging
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const u = currentUser();
  if (u) {
    const label = document.getElementById('user-email-label');
    if (label) { label.textContent = u.email; label.style.display = 'inline'; }
  }
  initData();
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// Enter key submits
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display !== 'none') {
    handleAuthSubmit();
  }
});

// ── Boot ─────────────────────────────────────────────────────
(async function boot() {
  const restored = await authRestore();
  if (restored) {
    showApp();
  } else {
    showAuthScreen();
  }
})();