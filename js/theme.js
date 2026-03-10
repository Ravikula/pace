// ============================================================
//  PACE — theme.js
//  Light/dark theme toggle + app initialisation (runs last)
// ============================================================

function toggleTheme(){
  const html=document.documentElement;
  const next=(html.getAttribute('data-theme')||'dark')==='dark'?'light':'dark';
  html.setAttribute('data-theme',next);
  document.getElementById('theme-toggle').textContent=next==='dark'?'🌙':'☀️';
  localStorage.setItem('pace_theme',next);
}

// Apply saved theme immediately (before paint) to avoid flash
(function(){
  const saved=localStorage.getItem('pace_theme')||'dark';
  document.documentElement.setAttribute('data-theme',saved);
  document.getElementById('theme-toggle').textContent=saved==='dark'?'🌙':'☀️';
})();

// Boot the app — called by auth.js after login, not here directly
// initData() is now invoked from auth.js → showApp()