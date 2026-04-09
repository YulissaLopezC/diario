// js/subcategorias.js
// Leer, crear y eliminar subcategorías. Persisten por empresa.

import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase.js';
import { toUpperStorage, toSentenceCase } from './ui.js';

// Cache local para evitar lecturas repetidas
let cache = null;

// Estructura en Firestore:
// empresas/{codigo}/subcategorias/{docId}
// docId = "subcategorias" (único documento con arrays por categoría)
// { venta: ["MOSTRADOR","DOMICILIO"], gasto: [...], compra: [...] }

function refSub(empresaCodigo) {
  return doc(db, 'empresas', empresaCodigo, 'config', 'subcategorias');
}

// ── Cargar todas las subcategorías ────────────────────────
export async function cargarSubcategorias(empresaCodigo) {
  const snap = await getDoc(refSub(empresaCodigo));
  if (snap.exists()) {
    cache = snap.data();
  } else {
    // Defaults al crear empresa nueva
    cache = { venta: [], gasto: [], compra: [] };
    await setDoc(refSub(empresaCodigo), cache);
  }
  return cache;
}

// ── Obtener lista de subcategorías de una categoría ────────
export function getSubcategorias(categoria) {
  if (!cache) return [];
  return (cache[categoria.toLowerCase()] || []).map(toSentenceCase);
}

// ── Agregar subcategoría ───────────────────────────────────
export async function agregarSubcategoria(empresaCodigo, categoria, nombre) {
  const key    = categoria.toLowerCase();
  const nombre_up = toUpperStorage(nombre);

  // Verificar duplicado
  if (cache && cache[key]?.includes(nombre_up)) return false;

  await updateDoc(refSub(empresaCodigo), {
    [key]: arrayUnion(nombre_up)
  });

  if (!cache) cache = { venta: [], gasto: [], compra: [] };
  if (!cache[key]) cache[key] = [];
  cache[key].push(nombre_up);
  return true;
}

// ── Eliminar subcategoría ──────────────────────────────────
export async function eliminarSubcategoria(empresaCodigo, categoria, nombre) {
  const key      = categoria.toLowerCase();
  const nombre_up = toUpperStorage(nombre);

  await updateDoc(refSub(empresaCodigo), {
    [key]: arrayRemove(nombre_up)
  });

  if (cache && cache[key]) {
    cache[key] = cache[key].filter(s => s !== nombre_up);
  }
}

// ── Invalidar cache (al cambiar empresa) ──────────────────
export function resetSubcategorias() { cache = null; }
