// js/cuentas.js
// Cuentas bancarias: globales + personalizadas por empresa

import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase.js';
import { toUpperStorage, toSentenceCase } from './ui.js';

// ── Cuentas globales (siempre disponibles) ─────────────────
const CUENTAS_GLOBALES = ['EFECTIVO', 'NEQUI', 'BANCOLOMBIA'];

// Cache local
let cachePersonalizadas = [];

// ── Referencia ─────────────────────────────────────────────
function refCuentas(empresaCodigo) {
  return doc(db, 'empresas', empresaCodigo, 'config', 'cuentas');
}

// ── Cargar cuentas personalizadas de la empresa ────────────
export async function cargarCuentas(empresaCodigo) {
  const snap = await getDoc(refCuentas(empresaCodigo));
  cachePersonalizadas = snap.exists() ? (snap.data().cuentas || []) : [];
  return cachePersonalizadas;
}

// ── Obtener lista completa (globales + personalizadas) ─────
export function getCuentas() {
  const personalizadas = cachePersonalizadas.filter(
    c => !CUENTAS_GLOBALES.includes(c.toUpperCase())
  );
  return [...CUENTAS_GLOBALES, ...personalizadas].map(toSentenceCase);
}

// ── Agregar cuenta personalizada ───────────────────────────
export async function agregarCuenta(empresaCodigo, nombre) {
  const nombreUp = toUpperStorage(nombre);
  if (CUENTAS_GLOBALES.includes(nombreUp)) return false;
  if (cachePersonalizadas.map(c => c.toUpperCase()).includes(nombreUp)) return false;

  await setDoc(refCuentas(empresaCodigo), {
    cuentas: arrayUnion(nombreUp)
  }, { merge: true });

  cachePersonalizadas.push(nombreUp);
  return true;
}

// ── Valor por defecto ──────────────────────────────────────
export const CUENTA_DEFAULT = 'Efectivo';

// ── Invalidar cache ────────────────────────────────────────
export function resetCuentas() { cachePersonalizadas = []; }
