// js/empresa.js
// Crear empresa, unirse con código, multi-empresa por usuario

import {
  doc, getDoc, setDoc, updateDoc, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase.js';
import { toast, toUpperStorage, toSentenceCase } from './ui.js';

// Empresa activa en esta sesión
export let empresaActual = null;

// Lista de empresas del usuario en esta sesión
export let misEmpresas = [];

// ── Generar código único ───────────────────────────────────
function generarCodigo(nombre) {
  const base = nombre.replace(/\s+/g, '').toUpperCase().slice(0, 5);
  const num  = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${num}`;
}

// ── Crear empresa nueva ────────────────────────────────────
export async function crearEmpresa(nombre, userId, userEmail, userName) {
  const codigo = generarCodigo(nombre);
  const ref    = doc(db, 'empresas', codigo);

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
  await agregarEmpresaAlUsuario(userId, userEmail, userName, codigo);

  empresaActual = datos;
  if (!misEmpresas.find(e => e.codigo === codigo)) {
    misEmpresas.push(datos);
  }
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

  await agregarEmpresaAlUsuario(userId, userEmail, userName, codigoUp);

  const empresa = { ...datos, codigo: codigoUp };
  empresaActual = empresa;
  if (!misEmpresas.find(e => e.codigo === codigoUp)) {
    misEmpresas.push(empresa);
  }
  return empresa;
}

// ── Agregar empresa al perfil del usuario (array) ──────────
async function agregarEmpresaAlUsuario(userId, userEmail, userName, codigo) {
  await setDoc(doc(db, 'usuarios', userId), {
    nombre: userName,
    email:  userEmail,
    empresas: arrayUnion(codigo)   // array — puede tener múltiples
  }, { merge: true });
}

// ── Cargar todas las empresas del usuario ──────────────────
export async function cargarEmpresasDelUsuario(userId) {
  const userSnap = await getDoc(doc(db, 'usuarios', userId));
  if (!userSnap.exists()) return [];

  const data = userSnap.data();

  // Compatibilidad con perfil antiguo que tenía empresaCodigo (string)
  let codigos = [];
  if (Array.isArray(data.empresas)) {
    codigos = data.empresas;
  } else if (data.empresaCodigo) {
    codigos = [data.empresaCodigo];
    // Migrar al nuevo formato
    await setDoc(doc(db, 'usuarios', userId), {
      empresas: [data.empresaCodigo]
    }, { merge: true });
  }

  if (!codigos.length) return [];

  // Cargar datos de cada empresa
  const empresas = await Promise.all(
    codigos.map(async codigo => {
      const snap = await getDoc(doc(db, 'empresas', codigo));
      if (!snap.exists()) return null;
      return { ...snap.data(), codigo };
    })
  );

  misEmpresas = empresas.filter(Boolean);
  return misEmpresas;
}

// ── Cambiar empresa activa ─────────────────────────────────
export function setEmpresaActual(codigo) {
  const empresa = misEmpresas.find(e => e.codigo === codigo);
  if (empresa) empresaActual = empresa;
  return empresaActual;
}

// ── Rol del usuario en la empresa actual ──────────────────
export function getRolUsuario(userId) {
  if (!empresaActual) return null;
  const u = empresaActual.usuarios?.find(u => u.uid === userId);
  return u?.rol || null;
}
