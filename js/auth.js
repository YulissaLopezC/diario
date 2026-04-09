// js/auth.js
// Login con Google, logout, estado del usuario autenticado

import { signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth, provider } from './firebase.js';
import { toast, showLoader, hideLoader } from './ui.js';

export let currentUser = null;

// ── Login con Google (popup) ───────────────────────────────
// Nota: el navegador puede mostrar advertencias COOP en consola —
// son inofensivas, el login funciona correctamente.
export async function loginConGoogle() {
  try {
    showLoader();
    await signInWithPopup(auth, provider);
    // onAuthStateChanged detecta el usuario y continúa el flujo
  } catch (err) {
    hideLoader();
    // Ignorar si el usuario simplemente cerró el popup
    if (err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request') return;
    console.error('Login error:', err);
    toast('Error al iniciar sesión. Intenta de nuevo.', 'error');
  }
}

// ── Logout ─────────────────────────────────────────────────
export async function logout() {
  try {
    await signOut(auth);
  } catch {
    toast('Error al cerrar sesión.', 'error');
  }
}

// ── Observador de estado ───────────────────────────────────
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
