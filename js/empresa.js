// js/empresa.js
// Crear empresa, unirse con código, leer datos de empresa del usuario

import {
  doc, getDoc, setDoc, collection,
  query, where, getDocs, updateDoc, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase.js';
import { toast, toUpperStorage } from './ui.js';

// Empresa activa en esta sesión
export let empresaActual = null;

// ── Generar código único de empresa ───────────────────────
function generarCodigo(nombre) {
  const base = nombre.replace(/\s+/g, '').toUpperCase().slice(0, 5);
  const num  = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${num}`;
}

// ── Crear empresa nueva ────────────────────────────────────
export async function crearEmpresa(nombre, userId, userEmail, userName) {
  const codigo = generarCodigo(nombre);
  const ref    = doc(db, 'empresas', codigo);

  // Verificar que no exista ese código (muy improbable, pero seguro)
  const snap = await getDoc(ref);
  if (snap.exists()) return crearEmpresa(nombre, userId, userEmail, userName);

  const datos = {
    nombre:    toUpperStorage(nombre),
    codigo,
    creadaPor: userId,
    creadaEn:  new Date().toISOString(),
    usuarios: [{
      uid:    userId,
      email:  userEmail,
      nombre: userName,
      rol:    'admin'
    }]
  };

  await setDoc(ref, datos);

  // Registrar empresa en el perfil del usuario
  await setDoc(doc(db, 'usuarios', userId), {
    empresaCodigo: codigo,
    nombre: userName,
    email:  userEmail
  }, { merge: true });

  empresaActual = datos;
  return datos;
}

// ── Unirse a empresa con código ────────────────────────────
export async function unirseAEmpresa(codigo, userId, userEmail, userName) {
  const codigoUp = codigo.trim().toUpperCase();
  const ref      = doc(db, 'empresas', codigoUp);
  const snap     = await getDoc(ref);

  if (!snap.exists()) {
    toast('Código de empresa no encontrado.', 'error');
    return null;
  }

  const datos = snap.data();

  // Verificar si ya está en la empresa
  const yaEsta = datos.usuarios.some(u => u.uid === userId);
  if (!yaEsta) {
    await updateDoc(ref, {
      usuarios: arrayUnion({
        uid:    userId,
        email:  userEmail,
        nombre: userName,
        rol:    'usuario'
      })
    });
  }

  // Registrar empresa en el perfil del usuario
  await setDoc(doc(db, 'usuarios', userId), {
    empresaCodigo: codigoUp,
    nombre: userName,
    email:  userEmail
  }, { merge: true });

  empresaActual = { ...datos, codigo: codigoUp };
  return empresaActual;
}

// ── Cargar empresa del usuario al iniciar sesión ───────────
export async function cargarEmpresaDelUsuario(userId) {
  const userSnap = await getDoc(doc(db, 'usuarios', userId));
  if (!userSnap.exists()) return null;

  const { empresaCodigo } = userSnap.data();
  if (!empresaCodigo) return null;

  const empSnap = await getDoc(doc(db, 'empresas', empresaCodigo));
  if (!empSnap.exists()) return null;

  empresaActual = { ...empSnap.data(), codigo: empresaCodigo };
  return empresaActual;
}

// ── Rol del usuario en la empresa actual ──────────────────
export function getRolUsuario(userId) {
  if (!empresaActual) return null;
  const u = empresaActual.usuarios.find(u => u.uid === userId);
  return u?.rol || null;
}
