// js/movimientos.js
// Agregar y leer movimientos por empresa y mes

import {
  collection, addDoc, query, where,
  getDocs, Timestamp, doc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase.js';
import { toUpperStorage, claveMes, parseFecha } from './ui.js';

// ── Referencia a la colección de movimientos ───────────────
function refMovimientos(empresaCodigo) {
  return collection(db, 'empresas', empresaCodigo, 'movimientos');
}

// ── Agregar un movimiento ──────────────────────────────────
// Datos esperados: { fecha, categoria, subcategoria, valor, proveedor, factura }
export async function agregarMovimiento(empresaCodigo, userId, datos) {
  const parsed = parseFecha(datos.fecha);
  if (!parsed) throw new Error('Fecha inválida');

  const doc = {
    fecha:         datos.fecha.trim(),
    dia:           parsed.dia,
    mes:           parsed.mes,
    anio:          parsed.anio,
    claveMes:      claveMes(parsed.mes, parsed.anio),
    categoria:     toUpperStorage(datos.categoria),
    subcategoria:  toUpperStorage(datos.subcategoria),
    valor:         parseFloat(String(datos.valor).replace(/[^0-9.]/g, '')) || 0,
    proveedor:     toUpperStorage(datos.proveedor || ''),
    factura:       toUpperStorage(datos.factura   || ''),
    creadoPor:     userId,
    creadoEn:      Timestamp.now()
  };

  const ref = await addDoc(refMovimientos(empresaCodigo), doc);
  return { id: ref.id, ...doc };
}

// ── Leer movimientos de un mes ─────────────────────────────
export async function getMovimientosMes(empresaCodigo, mes, anio) {
  const clave = claveMes(mes, anio);
  const q = query(
    refMovimientos(empresaCodigo),
    where('claveMes', '==', clave)
    // Sin orderBy compuesto → sin necesidad de índice
  );
  const snap = await getDocs(q);
  const movs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Ordenar en el cliente: más reciente primero
  return movs.sort((a, b) => {
    if (b.fecha !== a.fecha) return b.fecha.localeCompare(a.fecha);
    return (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0);
  });
}

// ── Obtener lista de meses con datos ──────────────────────
// Retorna array de claves únicas "YYYY-MM" ordenadas desc
export async function getMesesConDatos(empresaCodigo) {
  const snap = await getDocs(refMovimientos(empresaCodigo));
  const claves = new Set();
  snap.docs.forEach(d => {
    const c = d.data().claveMes;
    if (c) claves.add(c);
  });
  return [...claves].sort().reverse(); // más reciente primero
}

// ── Eliminar un movimiento ─────────────────────────────────
export async function eliminarMovimiento(empresaCodigo, movId) {
  const ref = doc(db, 'empresas', empresaCodigo, 'movimientos', movId);
  await deleteDoc(ref);
}

// ── Leer todos los movimientos (para dashboard anual) ──────
export async function getTodosMovimientos(empresaCodigo) {
  const snap = await getDocs(refMovimientos(empresaCodigo));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Leer movimientos de un rango de meses (para informes) ──
export async function getMovimientosRango(empresaCodigo, claveDesde, claveHasta) {
  const q = query(
    refMovimientos(empresaCodigo),
    where('claveMes', '>=', claveDesde),
    where('claveMes', '<=', claveHasta)
    // Sin orderBy compuesto → sin índice requerido
  );
  const snap = await getDocs(q);
  const movs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Ordenar en cliente: por mes y fecha ascendente
  return movs.sort((a, b) => {
    if (a.claveMes !== b.claveMes) return a.claveMes.localeCompare(b.claveMes);
    return a.fecha.localeCompare(b.fecha);
  });
}
