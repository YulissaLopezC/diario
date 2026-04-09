// js/auth.js
// Login con Google, logout, estado del usuario autenticado

import { signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth, provider } from './firebase.js';
import { toast, showLoader, hideLoader } from './ui.js';

// Usuario actual (exportado para que otros módulos lo lean)
export let currentUser = null;

// ── Login con Google (redirect — sin popups, sin errores COOP) ──
export async function loginConGoogle() {
  try {
    showLoader();
    await signInWithRedirect(auth, provider);
    // El navegador redirige a Google y vuelve automáticamente.
    // getRedirectResult() en initAuth() captura el resultado al volver.
  } catch (err) {
    hideLoader();
    toast('Error al iniciar sesión. Intenta de nuevo.', 'error');
  }
}

// ── Capturar resultado del redirect (llamar al inicio) ────────
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    // Si hay resultado, onAuthStateChanged lo detecta automáticamente.
    // No necesitamos hacer nada extra aquí.
    return result;
  } catch (err) {
    console.error('Error en redirect result:', err);
    hideLoader();
    toast('Error al iniciar sesión. Intenta de nuevo.', 'error');
    return null;
  }
}

// ── Logout ─────────────────────────────────────────────────
export async function logout() {
  try {
    await signOut(auth);
    // onAuthStateChanged detecta el cambio y redirige al login
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
