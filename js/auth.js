// js/auth.js
// Login con Google, logout, estado del usuario autenticado

import { signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth, provider } from './firebase.js';
import { toast, showLoader, hideLoader } from './ui.js';

// Usuario actual (exportado para que otros módulos lo lean)
export let currentUser = null;

// ── Login con Google ───────────────────────────────────────
export async function loginConGoogle() {
  try {
    showLoader();
    await signInWithPopup(auth, provider);
    // onAuthStateChanged en router.js se encarga del resto
  } catch (err) {
    hideLoader();
    if (err.code !== 'auth/popup-closed-by-user') {
      toast('Error al iniciar sesión. Intenta de nuevo.', 'error');
    }
  }
}

// ── Logout ─────────────────────────────────────────────────
export async function logout() {
  try {
    await signOut(auth);
    // router.js detecta el cambio y redirige al login
  } catch {
    toast('Error al cerrar sesión.', 'error');
  }
}

// ── Observador de estado (llamado desde router.js) ─────────
export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) onLogin(user);
    else       onLogout();
  });
}

// ── Helpers ────────────────────────────────────────────────
export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
