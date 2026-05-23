import { db } from './firebase.js';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs,
  query, where, Timestamp, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// --- CONFIG ---

export async function habilitarInventario(empresaCodigo) {
  await setDoc(
    doc(db, 'empresas', empresaCodigo, 'config', 'inventario'),
    { habilitado: true },
    { merge: true }
  );
}

export async function deshabilitarInventario(empresaCodigo) {
  await setDoc(
    doc(db, 'empresas', empresaCodigo, 'config', 'inventario'),
    { habilitado: false },
    { merge: true }
  );
}

export async function inventarioHabilitado(empresaCodigo) {
  try {
    const snap = await getDoc(doc(db, 'empresas', empresaCodigo, 'config', 'inventario'));
    return snap.exists() && snap.data()?.habilitado === true;
  } catch {
    return false;
  }
}

// --- UNIDADES ---

const UNIDADES_GLOBALES = [
  'Unidad','Kilogramo','Gramo','Libra','Litro','Mililitro',
  'Botella','Caja','Bolsa','Paquete','Docena','Par','Metro','Rollo'
];

export async function cargarUnidades(empresaCodigo) {
  const snap = await getDoc(doc(db, 'empresas', empresaCodigo, 'config', 'unidades'));
  const custom = snap.exists() ? (snap.data().unidades || []) : [];
  const customDisplay = custom.map(u => u.charAt(0).toUpperCase() + u.slice(1).toLowerCase());
  return [...UNIDADES_GLOBALES, ...customDisplay];
}

export async function agregarUnidad(empresaCodigo, nombre) {
  await setDoc(
    doc(db, 'empresas', empresaCodigo, 'config', 'unidades'),
    { unidades: arrayUnion(nombre.trim().toUpperCase()) },
    { merge: true }
  );
}

// --- TIPOS DE PRODUCTO ---

export async function cargarTiposProducto(empresaCodigo) {
  const snap = await getDoc(doc(db, 'empresas', empresaCodigo, 'config', 'tiposProducto'));
  return snap.exists() ? (snap.data().tipos || []) : [];
}

export async function agregarTipoProducto(empresaCodigo, nombre) {
  await setDoc(
    doc(db, 'empresas', empresaCodigo, 'config', 'tiposProducto'),
    { tipos: arrayUnion(nombre.trim().toUpperCase()) },
    { merge: true }
  );
}

// --- PRODUCTOS ---

export async function crearProducto(empresaCodigo, datos) {
  const ref = await addDoc(
    collection(db, 'empresas', empresaCodigo, 'productos'),
    {
      nombre:       datos.nombre.trim().toUpperCase(),
      unidad:       datos.unidad.trim(),
      tipo:         datos.tipo ? datos.tipo.trim().toUpperCase() : '',
      stockInicial: datos.stockInicial ?? 0,
      stockMinimo:  datos.stockMinimo ?? null,
      activo:       true,
      creadoEn:     Timestamp.now()
    }
  );
  return ref.id;
}

export async function getProductos(empresaCodigo) {
  const snap = await getDocs(
    query(
      collection(db, 'empresas', empresaCodigo, 'productos'),
      where('activo', '==', true)
    )
  );
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function desactivarProducto(empresaCodigo, productoId) {
  await updateDoc(
    doc(db, 'empresas', empresaCodigo, 'productos', productoId),
    { activo: false }
  );
}

// --- MOVIMIENTOS ---

export async function registrarMovInventario(empresaCodigo, userId, datos) {
  if (['salida', 'PERDIDA', 'CORTESIA', 'OTRA_SALIDA'].includes(datos.tipo)) {
    const snapMovs = await getDocs(
      query(
        collection(db, 'empresas', empresaCodigo, 'movInventario'),
        where('productoId', '==', datos.productoId)
      )
    );
    const productoSnap = await getDoc(
      doc(db, 'empresas', empresaCodigo, 'productos', datos.productoId)
    );
    const stockInicial = productoSnap.exists() ? (productoSnap.data().stockInicial ?? 0) : 0;
    const stockActual  = snapMovs.docs.reduce((acc, d) => {
      const m = d.data();
      return m.tipo === 'entrada' ? acc + m.cantidad : acc - m.cantidad;
    }, stockInicial);

    if (datos.cantidad > stockActual) {
      throw new Error(`Stock insuficiente. Stock actual: ${stockActual} unidades`);
    }
  }

  const ref = await addDoc(
    collection(db, 'empresas', empresaCodigo, 'movInventario'),
    {
      fecha:          datos.fecha,
      productoId:     datos.productoId,
      productoNombre: datos.productoNombre,
      tipo:           datos.tipo,
      cantidad:       datos.cantidad,
      nota:           datos.nota ?? '',
      creadoEn:       Timestamp.now(),
      creadoPor:      userId
    }
  );
  return ref.id;
}

export async function getMovimientosInventario(empresaCodigo, fecha) {
  const snap = await getDocs(
    query(
      collection(db, 'empresas', empresaCodigo, 'movInventario'),
      where('fecha', '==', fecha)
    )
  );
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => (a.creadoEn?.seconds || 0) - (b.creadoEn?.seconds || 0));
}

export async function eliminarMovInventario(empresaCodigo, movId) {
  await deleteDoc(doc(db, 'empresas', empresaCodigo, 'movInventario', movId));
}

export async function getStockHistorico(empresaCodigo, productoId, fecha) {
  const snap = await getDocs(
    query(
      collection(db, 'empresas', empresaCodigo, 'movInventario'),
      where('productoId', '==', productoId)
    )
  );

  const movimientos = snap.docs
    .map(d => d.data())
    .filter(m => m.fecha <= fecha)
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return (a.creadoEn?.seconds || 0) - (b.creadoEn?.seconds || 0);
    });

  const productoSnap = await getDoc(doc(db, 'empresas', empresaCodigo, 'productos', productoId));
  const stockInicial = productoSnap.exists() ? (productoSnap.data().stockInicial ?? 0) : 0;

  return movimientos.reduce((stock, mov) => {
    return mov.tipo === 'entrada' ? stock + mov.cantidad : stock - mov.cantidad;
  }, stockInicial);
}

// ======================================================
// UI — Lógica de pantalla
// ======================================================

import { toast, showConfirm, hoyISO, toSentenceCase } from './ui.js';
import { getRolUsuario } from './empresa.js';

const POR_PAGINA_MOVS  = 10;
const POR_PAGINA_STOCK = 20;

// Estado de módulo
let _empresa          = '';
let _userId           = '';
let _rol              = 'usuario';
let _productos        = [];
let _movsDia          = [];
let _movsDiaPag       = 0;
let _movsDiaFiltro    = 'todos';
let _movsDiaExpandido = false;
let _datosStock       = [];
let _unidades         = [];
let _tipos            = [];
let _stockTab         = 'todos';
let _stockBusqueda    = '';
let _stockPag         = 0;
let _stockTipoFiltro  = 'todos';

export function getTiposProducto() { return _tipos; }

// ── Inicialización principal ───────────────────────────
export async function initInventario(empresaCodigo, userId) {
  _empresa = empresaCodigo;
  _userId  = userId;
  _rol     = getRolUsuario(userId) || 'usuario';

  const elFecha = document.getElementById('inv-fecha');
  const hoy     = hoyISO();
  if (elFecha) {
    elFecha.value = hoy;
    if (_rol === 'usuario') {
      elFecha.min              = hoy;
      elFecha.max              = hoy;
      elFecha.readOnly         = true;
      elFecha.style.background = 'var(--surface-2)';
      elFecha.style.cursor     = 'not-allowed';
      elFecha.title            = 'Solo puedes registrar movimientos del día de hoy';
    } else {
      elFecha.removeAttribute('min');
      elFecha.removeAttribute('max');
      elFecha.readOnly         = false;
    }
  }

  const [unidades, tipos] = await Promise.all([
    cargarUnidades(empresaCodigo),
    cargarTiposProducto(empresaCodigo),
    _cargarProductos()
  ]);
  _unidades = unidades;
  _tipos    = tipos.map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

  await Promise.all([initMovimientosDia(), initInventarioActual()]);

  _bindEventos();
}

async function _cargarProductos() {
  _productos = await getProductos(_empresa);
  _llenarSelects();
}

function _llenarSelects() {
  const opts = _productos.length
    ? _productos.map(p => `<option value="${p.id}">${toSentenceCase(p.nombre)}</option>`).join('')
    : '<option value="" disabled>Sin productos</option>';

  ['inv-producto'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">— Selecciona —</option>${opts}`;
    if (prev) sel.value = prev;
  });
}

// ── Binding de eventos (cloneNode para limpiar listeners) ─
function _bindEventos() {
  ['inv-btn-registrar', 'inv-btn-abrir-modal', 'inv-btn-informe']
    .forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const nuevo = btn.cloneNode(true);
      btn.parentNode.replaceChild(nuevo, btn);
    });

  document.getElementById('inv-btn-registrar')
    ?.addEventListener('click', _registrar);
  document.getElementById('inv-btn-abrir-modal')
    ?.addEventListener('click', abrirModalCrearProducto);
  document.getElementById('inv-btn-informe')
    ?.addEventListener('click', abrirModalInforme);

  // Cerrar modal al clic fuera
  document.getElementById('inv-modal-backdrop')
    ?.addEventListener('click', e => {
      if (e.target === document.getElementById('inv-modal-backdrop')) _cerrarModal();
    });

  // Autocomplete de unidades y tipos (los inputs viven en el modal del DOM)
  _initAutocompleteUnidad();
  _initAutocompleteTipo();
}

// ── Modal: Crear producto ──────────────────────────────
export function abrirModalCrearProducto() {
  // Resetear formulario
  const nombre   = document.getElementById('inv-prod-nombre');
  const unidad   = document.getElementById('inv-prod-unidad');
  const tipo     = document.getElementById('inv-prod-tipo');
  const stock    = document.getElementById('inv-prod-stock');
  const stockMin = document.getElementById('inv-prod-stock-min');
  if (nombre)   nombre.value   = '';
  if (unidad)   unidad.value   = '';
  if (tipo)     tipo.value     = '';
  if (stock)    stock.value    = '0';
  if (stockMin) stockMin.value = '';

  // Resetear estado CSV
  const inputCSV     = document.getElementById('inv-input-csv');
  const nombreEl     = document.getElementById('inv-nombre-archivo');
  const previewEl    = document.getElementById('inv-csv-preview');
  const btnCargar    = document.getElementById('inv-btn-cargar-csv');
  const btnConfirmar = document.getElementById('inv-btn-confirmar-carga');
  if (inputCSV)     inputCSV.value                = '';
  if (nombreEl)     { nombreEl.textContent = ''; nombreEl.style.display = 'none'; }
  if (previewEl)    previewEl.innerHTML            = '';
  if (btnCargar)    btnCargar.style.display        = 'none';
  if (btnConfirmar) btnConfirmar.style.display     = 'none';

  // Mostrar vista formulario, ocultar vista CSV
  document.getElementById('inv-modal-vista-form').style.display = '';
  document.getElementById('inv-modal-vista-csv').style.display  = 'none';

  // Mostrar modal centrado con flex y rebindear botones
  document.getElementById('inv-modal-backdrop').style.display = 'flex';
  _bindModalBotones();

  setTimeout(() => document.getElementById('inv-prod-nombre')?.focus(), 50);
}

function _cerrarModal() {
  const backdrop = document.getElementById('inv-modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

function _bindModalBotones() {
  // CloneNode para limpiar listeners acumulados
  [
    'inv-modal-cancelar-form', 'inv-modal-cancelar-csv',
    'inv-btn-crear-producto', 'inv-link-csv', 'inv-btn-volver-form',
    'inv-btn-descargar-plantilla', 'inv-btn-cargar-csv', 'inv-btn-confirmar-carga'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const nuevo = el.cloneNode(true);
    el.parentNode.replaceChild(nuevo, el);
  });

  document.getElementById('inv-modal-cancelar-form')?.addEventListener('click', _cerrarModal);
  document.getElementById('inv-modal-cancelar-csv')?.addEventListener('click', _cerrarModal);
  document.getElementById('inv-btn-crear-producto')?.addEventListener('click', _crearProductoUI);

  document.getElementById('inv-link-csv')?.addEventListener('click', () => {
    document.getElementById('inv-modal-vista-form').style.display = 'none';
    document.getElementById('inv-modal-vista-csv').style.display  = 'flex';
  });
  document.getElementById('inv-btn-volver-form')?.addEventListener('click', () => {
    document.getElementById('inv-modal-vista-form').style.display = '';
    document.getElementById('inv-modal-vista-csv').style.display  = 'none';
  });

  document.getElementById('inv-btn-descargar-plantilla')?.addEventListener('click', _descargarPlantillaCSV);

  // Input de archivo: mostrar nombre y botón Confirmar
  const inputCSV = document.getElementById('inv-input-csv');
  if (inputCSV) {
    const nuevoInput = inputCSV.cloneNode(true);
    inputCSV.parentNode.replaceChild(nuevoInput, inputCSV);
    nuevoInput.addEventListener('change', () => {
      const file = nuevoInput.files[0];
      if (!file) return;
      const nombreEl  = document.getElementById('inv-nombre-archivo');
      const btnCargar = document.getElementById('inv-btn-cargar-csv');
      if (nombreEl)  { nombreEl.textContent = file.name; nombreEl.style.display = ''; }
      if (btnCargar) btnCargar.style.display = '';
    });
  }

  document.getElementById('inv-btn-cargar-csv')?.addEventListener('click', () => {
    const file = document.getElementById('inv-input-csv')?.files[0];
    if (!file) { toast('Selecciona un archivo primero.', 'error'); return; }
    _procesarArchivo(file);
  });
}

// ── Registrar movimiento ───────────────────────────────
async function _registrar() {
  const fecha      = document.getElementById('inv-fecha')?.value;
  const productoId = document.getElementById('inv-producto')?.value;
  const tipo       = document.getElementById('inv-tipo')?.value;
  const cantidadRaw = document.getElementById('inv-cantidad')?.value;
  const nota       = document.getElementById('inv-nota')?.value?.trim() || '';

  if (!fecha)      { toast('Ingresa una fecha.', 'error'); return; }
  if (_rol === 'usuario' && fecha !== hoyISO()) {
    toast('Solo puedes registrar movimientos del día de hoy.', 'error');
    return;
  }
  if (!productoId) { toast('Selecciona un producto.', 'error'); return; }
  const cantidad = parseInt(cantidadRaw, 10);
  if (!cantidad || cantidad <= 0) { toast('Ingresa una cantidad válida.', 'error'); return; }

  const producto = _productos.find(p => p.id === productoId);
  if (!producto) return;

  try {
    await registrarMovInventario(_empresa, _userId, {
      fecha, productoId,
      productoNombre: producto.nombre,
      tipo, cantidad, nota
    });
    toast('Movimiento registrado.');
    document.getElementById('inv-cantidad').value = '';
    document.getElementById('inv-nota').value     = '';
    await Promise.all([_recargarMovDia(), _recargarTablaStock()]);
  } catch (err) {
    toast(err.message || 'Error al registrar el movimiento.', 'error');
  }
}

// ── Movimientos del día: init y helpers ───────────────
async function initMovimientosDia() {
  _movsDiaFiltro    = 'todos';
  _movsDiaPag       = 0;
  _movsDiaExpandido = false;

  const fecha = hoyISO();

  // Fecha input
  const fechaEl = document.getElementById('inv-movs-fecha');
  if (fechaEl) {
    const nuevaFecha = fechaEl.cloneNode(true);
    fechaEl.parentNode.replaceChild(nuevaFecha, fechaEl);
    nuevaFecha.value = fecha;
    nuevaFecha.addEventListener('change', async e => {
      _movsDiaPag = 0;
      _movsDiaFiltro = 'todos';
      _actualizarFechaLabel(e.target.value);
      _movsDia = await getMovimientosInventario(_empresa, e.target.value);
      _actualizarResumen();
      _actualizarFiltros();
      renderTablaMovimientos();
    });
  }

  _actualizarFechaLabel(fecha);
  _setMovsColapsado(true);

  // Header toggle (cloneNode limpia listeners acumulados)
  const header = document.getElementById('inv-movs-header');
  if (header) {
    const nuevoHeader = header.cloneNode(true);
    header.parentNode.replaceChild(nuevoHeader, header);
    nuevoHeader.addEventListener('click', _toggleMovsDia);
  }

  // Filtros
  document.querySelectorAll('.inv-filtro-btn').forEach(btn => {
    const nuevo = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevo, btn);
    nuevo.addEventListener('click', e => {
      e.stopPropagation();
      _movsDiaFiltro = nuevo.dataset.filtro;
      _movsDiaPag    = 0;
      _actualizarFiltros();
      renderTablaMovimientos();
    });
  });

  _movsDia = await getMovimientosInventario(_empresa, fecha);
  _actualizarResumen();
  _actualizarFiltros();
  renderTablaMovimientos();
}

function _setMovsColapsado(colapsar) {
  _movsDiaExpandido = !colapsar;
  const body   = document.getElementById('inv-movs-body');
  const toggle = document.getElementById('inv-movs-toggle');
  if (body)   body.style.maxHeight   = colapsar ? '0' : '700px';
  if (toggle) {
    toggle.textContent = colapsar ? '▼' : '▲';
    toggle.setAttribute('aria-label', colapsar ? 'Expandir' : 'Colapsar');
  }
}

function _toggleMovsDia() {
  _setMovsColapsado(_movsDiaExpandido);
}

function _actualizarResumen() {
  const entradas = _movsDia.filter(m => m.tipo === 'entrada').length;
  const salidas  = _movsDia.filter(m => m.tipo === 'salida').length;
  const el = document.getElementById('inv-movs-resumen');
  if (el) el.textContent = `${entradas} entrada${entradas !== 1 ? 's' : ''} · ${salidas} salida${salidas !== 1 ? 's' : ''}`;
}

function _actualizarFechaLabel(fecha) {
  const el = document.getElementById('inv-movs-fecha-label');
  if (!el || !fecha) return;
  const [y, m, d] = fecha.split('-');
  el.textContent = `${d}/${m}/${y}`;
}

function _actualizarFiltros() {
  document.querySelectorAll('.inv-filtro-btn').forEach(btn => {
    const activo = btn.dataset.filtro === _movsDiaFiltro;
    btn.style.borderBottom = activo ? '2px solid var(--green)' : '';
    btn.style.color        = activo ? 'var(--green)' : '';
    btn.style.fontWeight   = activo ? '600' : '';
  });
}

async function _recargarMovDia() {
  const fecha = document.getElementById('inv-movs-fecha')?.value || hoyISO();
  _movsDia    = await getMovimientosInventario(_empresa, fecha);
  _movsDiaPag = 0;
  _actualizarResumen();
  renderTablaMovimientos();
}

// ── Recargar tabla de stock actual ────────────────────
async function _recargarTablaStock() {
  _productos = await getProductos(_empresa);
  _llenarSelects();

  const snap     = await getDocs(collection(db, 'empresas', _empresa, 'movInventario'));
  const movsTodos = snap.docs.map(d => d.data());

  const porProducto = {};
  movsTodos.forEach(m => {
    if (!porProducto[m.productoId]) porProducto[m.productoId] = { entradas: 0, salidas: 0 };
    if (m.tipo === 'entrada') porProducto[m.productoId].entradas += m.cantidad;
    else                      porProducto[m.productoId].salidas  += m.cantidad;
  });

  _datosStock = _productos.map(p => ({
    ...p,
    entradas:    porProducto[p.id]?.entradas || 0,
    salidas:     porProducto[p.id]?.salidas  || 0,
    stockActual: (p.stockInicial || 0)
                 + (porProducto[p.id]?.entradas || 0)
                 - (porProducto[p.id]?.salidas  || 0)
  }));

  renderTablaInventario();
}

// ── Inventario actual: init y helpers ─────────────────
async function initInventarioActual() {
  _stockTab         = 'todos';
  _stockBusqueda    = '';
  _stockPag         = 0;
  _stockTipoFiltro  = 'todos';

  // Búsqueda reactiva
  const busquedaEl = document.getElementById('inv-stock-busqueda');
  if (busquedaEl) {
    const nuevo = busquedaEl.cloneNode(true);
    busquedaEl.parentNode.replaceChild(nuevo, busquedaEl);
    nuevo.value = '';
    nuevo.addEventListener('input', () => {
      _stockBusqueda = nuevo.value.trim();
      _stockPag      = 0;
      renderTablaInventario();
    });
  }

  // Tabs de estado
  document.querySelectorAll('.inv-stock-tab').forEach(btn => {
    const nuevo = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevo, btn);
    nuevo.addEventListener('click', () => {
      _stockTab = nuevo.dataset.stockTab;
      _stockPag = 0;
      renderTablaInventario();
    });
  });

  // Filtro por tipo
  const filtroTipo = document.getElementById('inv-stock-filtro-tipo');
  if (filtroTipo) {
    const nuevoFiltro = filtroTipo.cloneNode(true);
    filtroTipo.parentNode.replaceChild(nuevoFiltro, filtroTipo);
    nuevoFiltro.addEventListener('change', () => {
      _stockTipoFiltro = nuevoFiltro.value;
      _stockPag        = 0;
      renderTablaInventario();
    });
  }

  // Botón exportar
  const btnExp = document.getElementById('inv-btn-exportar-csv');
  if (btnExp) {
    const nuevo = btnExp.cloneNode(true);
    btnExp.parentNode.replaceChild(nuevo, btnExp);
    nuevo.addEventListener('click', _exportarCSVFiltrado);
  }

  await _recargarTablaStock();
}

function _estadoProducto(p) {
  if (p.stockActual <= 0) return 'agotado';
  if (p.stockMinimo !== null && p.stockMinimo !== undefined && p.stockActual <= p.stockMinimo) return 'bajo';
  return 'ok';
}

function _estilosEstado(estado) {
  if (estado === 'agotado') return {
    badgeHtml:  `<span class="badge" style="background:var(--red-light,#FEE2E2);color:var(--red)">🔴 Agotado</span>`,
    stockColor: 'var(--red)',
    rowBg:      'background:color-mix(in srgb, var(--red) 6%, transparent)'
  };
  if (estado === 'bajo') return {
    badgeHtml:  `<span class="badge" style="background:var(--amber-light,#FEF3C7);color:var(--amber,#B45309)">⚠️ Stock bajo</span>`,
    stockColor: 'var(--amber,#B45309)',
    rowBg:      ''
  };
  return {
    badgeHtml:  `<span class="badge" style="background:var(--green-light,#D1FAE5);color:var(--green-dark,#065F46)">✅ OK</span>`,
    stockColor: 'var(--green)',
    rowBg:      ''
  };
}

function _actualizarFiltroTipo() {
  const sel = document.getElementById('inv-stock-filtro-tipo');
  if (!sel) return;
  const tiposSet = new Set(_datosStock.map(p => p.tipo || '').filter(Boolean));
  const tiposOrdenados = [...tiposSet].sort();
  sel.innerHTML = `<option value="todos">Todos los tipos</option>` +
    tiposOrdenados.map(t => {
      const display = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      return `<option value="${t}"${_stockTipoFiltro === t ? ' selected' : ''}>${display}</option>`;
    }).join('');
}

function _actualizarTabsStock() {
  const base = _stockTipoFiltro === 'todos'
    ? _datosStock
    : _datosStock.filter(p => (p.tipo || '').toUpperCase() === _stockTipoFiltro.toUpperCase());
  const conteos = { todos: base.length, ok: 0, bajo: 0, agotado: 0 };
  base.forEach(p => { conteos[_estadoProducto(p)]++; });

  document.querySelectorAll('.inv-stock-tab').forEach(btn => {
    const tab    = btn.dataset.stockTab;
    const activo = tab === _stockTab;
    btn.style.borderBottom = activo ? '2px solid var(--green)' : '2px solid transparent';
    btn.style.color        = activo ? 'var(--green)' : '';
    btn.style.fontWeight   = activo ? '600' : '';
    const countEl = btn.querySelector('.tab-count');
    if (countEl) countEl.textContent = `(${conteos[tab] ?? 0})`;
  });
}

function _renderPaginadorStock(total, totalPags) {
  const pag = document.getElementById('inv-paginador-stock');
  if (!pag) return;
  if (totalPags <= 1) { pag.innerHTML = ''; return; }
  pag.innerHTML = `
    <span>Pág. ${_stockPag + 1} de ${totalPags}</span>
    <button class="pag-arrow" id="inv-stock-pag-prev" ${_stockPag === 0 ? 'disabled' : ''}>&#8249;</button>
    <button class="pag-arrow" id="inv-stock-pag-next" ${_stockPag >= totalPags - 1 ? 'disabled' : ''}>&#8250;</button>
  `;
  document.getElementById('inv-stock-pag-prev')?.addEventListener('click', () => {
    if (_stockPag > 0) { _stockPag--; renderTablaInventario(); }
  });
  document.getElementById('inv-stock-pag-next')?.addEventListener('click', () => {
    if (_stockPag < totalPags - 1) { _stockPag++; renderTablaInventario(); }
  });
}

function _abrirModalDetalle(prod) {
  const estado = _estadoProducto(prod);
  const { badgeHtml, stockColor } = _estilosEstado(estado);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:460px;width:100%">

      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:20px">
        <div style="flex:1;min-width:0">
          <h3 style="margin:0 0 8px">${toSentenceCase(prod.nombre)}</h3>
          ${badgeHtml}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;color:var(--text-3);margin-bottom:2px">Stock actual</div>
          <div style="font-size:30px;font-weight:700;line-height:1;color:${stockColor}">${prod.stockActual}</div>
        </div>
      </div>

      <div style="background:var(--surface-2);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Información</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
          <div><div style="color:var(--text-3);font-size:11px">Tipo</div><strong>${prod.tipo ? prod.tipo.charAt(0).toUpperCase() + prod.tipo.slice(1).toLowerCase() : '—'}</strong></div>
          <div><div style="color:var(--text-3);font-size:11px">Unidad</div><strong>${prod.unidad || '—'}</strong></div>
          <div><div style="color:var(--text-3);font-size:11px">Stock inicial</div><strong>${prod.stockInicial ?? 0}</strong></div>
          <div><div style="color:var(--text-3);font-size:11px">Stock mínimo</div><strong>${prod.stockMinimo ?? '—'}</strong></div>
          <div><div style="color:var(--text-3);font-size:11px">Total entradas</div><strong style="color:var(--green)">${prod.entradas}</strong></div>
          <div><div style="color:var(--text-3);font-size:11px">Total salidas</div><strong style="color:var(--red)">${prod.salidas}</strong></div>
        </div>
      </div>

      <div style="background:var(--surface-2);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Consulta histórica</div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="date" id="inv-det-fecha" style="height:32px;font-size:13px;flex:1" />
          <button class="btn-primary" id="inv-det-consultar" style="height:32px;padding:0 14px;font-size:13px;white-space:nowrap">Consultar</button>
        </div>
        <div id="inv-det-resultado" style="margin-top:10px;display:none;font-size:13px;padding:8px 12px;background:var(--surface);border-radius:var(--radius-sm)"></div>
      </div>

      <div class="modal-btns" style="justify-content:space-between">
        <button class="btn-secondary" id="inv-det-desactivar" style="color:var(--red)">Desactivar producto</button>
        <button class="btn-secondary" id="inv-det-cerrar">Cerrar</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector('#inv-det-fecha').value = hoyISO();

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#inv-det-cerrar').addEventListener('click', close);

  backdrop.querySelector('#inv-det-consultar').addEventListener('click', async () => {
    const fecha     = backdrop.querySelector('#inv-det-fecha').value;
    const resultado = backdrop.querySelector('#inv-det-resultado');
    if (!fecha) { toast('Selecciona una fecha.', 'error'); return; }
    try {
      const stock  = await getStockHistorico(_empresa, prod.id, fecha);
      const [y, m, d] = fecha.split('-');
      const color  = stock <= 0 ? 'var(--red)' : 'var(--green)';
      resultado.innerHTML = `Stock al <strong>${d}/${m}/${y}</strong>: <strong style="font-size:16px;color:${color}">${stock}</strong> ${prod.unidad || 'unidades'}`;
      resultado.style.display = '';
    } catch {
      toast('Error al consultar el histórico.', 'error');
    }
  });

  backdrop.querySelector('#inv-det-desactivar').addEventListener('click', () => {
    showConfirm({
      title: 'Desactivar producto',
      description: `¿Desactivar "${toSentenceCase(prod.nombre)}"? Ya no aparecerá para nuevos movimientos.`,
      confirmText: 'Desactivar',
      danger: true,
      onConfirm: async () => {
        try {
          await desactivarProducto(_empresa, prod.id);
          close();
          toast('Producto desactivado.');
          await _recargarTablaStock();
        } catch {
          toast('Error al desactivar.', 'error');
        }
      }
    });
  });
}

function _exportarCSVFiltrado() {
  const q = _stockBusqueda.toLowerCase();
  let filtrados = q
    ? _datosStock.filter(p => p.nombre.toLowerCase().includes(q))
    : [..._datosStock];
  if (_stockTab !== 'todos') filtrados = filtrados.filter(p => _estadoProducto(p) === _stockTab);

  if (!filtrados.length) { toast('No hay datos para exportar.', 'error'); return; }

  const etiquetaEstado = e => e === 'agotado' ? 'Agotado' : e === 'bajo' ? 'Stock bajo' : 'OK';
  const cabecera = 'nombre;tipo;unidad;stock_inicial;stock_actual;stock_minimo;estado';
  const filas    = filtrados.map(p => [
    toSentenceCase(p.nombre),
    p.tipo ? p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1).toLowerCase() : '',
    p.unidad || '',
    p.stockInicial ?? 0,
    p.stockActual,
    p.stockMinimo ?? '',
    etiquetaEstado(_estadoProducto(p))
  ].join(';')).join('\n');

  const blob = new Blob(['﻿' + cabecera + '\n' + filas], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `DiarIO_inventario_${hoyISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Render: tabla movimientos del día ─────────────────
export function renderTablaMovimientos() {
  const tbody = document.getElementById('inv-tbody-movimientos');
  if (!tbody) return;

  const filtrados = _movsDiaFiltro === 'todos'
    ? _movsDia
    : _movsDia.filter(m => m.tipo === _movsDiaFiltro);

  const total     = filtrados.length;
  const totalPags = Math.max(1, Math.ceil(total / POR_PAGINA_MOVS));
  if (_movsDiaPag >= totalPags) _movsDiaPag = 0;

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px 0;font-size:12px">Sin movimientos para esta fecha.</td></tr>`;
    _renderPaginador(0, 0);
    return;
  }

  const inicio = _movsDiaPag * POR_PAGINA_MOVS;
  const pagina = filtrados.slice(inicio, inicio + POR_PAGINA_MOVS);

  tbody.innerHTML = pagina.map(m => {
    const tipoMap = {
      'entrada':     ['badge-venta',       'Entrada'],
      'salida':      ['badge-gasto',       'Salida'],
      'PERDIDA':     ['badge-perdida',     'Pérdida'],
      'CORTESIA':    ['badge-cortesia',    'Cortesía'],
      'OTRA_SALIDA': ['badge-otra-salida', 'Otra salida'],
    };
    const [badgeCls, tipoLabel] = tipoMap[m.tipo] ?? ['badge-gasto', m.tipo];
    const notaHtml  = m.nota ? m.nota : '<span style="color:var(--text-3)">—</span>';
    return `<tr>
      <td>${toSentenceCase(m.productoNombre)}</td>
      <td><span class="badge ${badgeCls}">${tipoLabel}</span></td>
      <td style="text-align:right">${m.cantidad}</td>
      <td>${notaHtml}</td>
      <td>
        <button class="btn-secondary" style="height:26px;padding:0 10px;font-size:11px"
          data-movid="${m.id}">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-movid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const movId = btn.dataset.movid;
      showConfirm({
        title: 'Eliminar movimiento',
        description: '¿Estás segura de que deseas eliminar este movimiento?',
        confirmText: 'Eliminar',
        danger: true,
        onConfirm: async () => {
          try {
            await eliminarMovInventario(_empresa, movId);
            toast('Movimiento eliminado.');
            const fecha = document.getElementById('inv-movs-fecha')?.value || hoyISO();
            _movsDia = await getMovimientosInventario(_empresa, fecha);
            _actualizarResumen();
            renderTablaMovimientos();
            await _recargarTablaStock();
          } catch {
            toast('Error al eliminar.', 'error');
          }
        }
      });
    });
  });

  _renderPaginador(total, totalPags);
}

function _renderPaginador(total, totalPags) {
  const pag = document.getElementById('inv-paginador-movs');
  if (!pag) return;

  if (totalPags <= 1) { pag.innerHTML = ''; return; }

  pag.innerHTML = `
    <span>Pág. ${_movsDiaPag + 1} de ${totalPags}</span>
    <button class="pag-arrow" id="inv-pag-prev" ${_movsDiaPag === 0 ? 'disabled' : ''}>&#8249;</button>
    <button class="pag-arrow" id="inv-pag-next" ${_movsDiaPag >= totalPags - 1 ? 'disabled' : ''}>&#8250;</button>
  `;

  document.getElementById('inv-pag-prev')?.addEventListener('click', () => {
    if (_movsDiaPag > 0) { _movsDiaPag--; renderTablaMovimientos(); }
  });
  document.getElementById('inv-pag-next')?.addEventListener('click', () => {
    if (_movsDiaPag < totalPags - 1) { _movsDiaPag++; renderTablaMovimientos(); }
  });
}

// ── Render: tabla inventario actual ───────────────────
export function renderTablaInventario() {
  const tbody = document.getElementById('inv-tbody-stock');
  if (!tbody) return;

  _actualizarFiltroTipo();
  _actualizarTabsStock();

  const q = _stockBusqueda.toLowerCase();
  let filtrados = q
    ? _datosStock.filter(p => p.nombre.toLowerCase().includes(q))
    : [..._datosStock];
  if (_stockTipoFiltro !== 'todos')
    filtrados = filtrados.filter(p => (p.tipo || '').toUpperCase() === _stockTipoFiltro.toUpperCase());
  if (_stockTab !== 'todos') filtrados = filtrados.filter(p => _estadoProducto(p) === _stockTab);

  const total     = filtrados.length;
  const totalPags = Math.max(1, Math.ceil(total / POR_PAGINA_STOCK));
  if (_stockPag >= totalPags) _stockPag = 0;

  if (!total) {
    const msg = _datosStock.length
      ? 'No se encontraron productos con ese criterio.'
      : 'Sin productos registrados.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:20px 0;font-size:12px">${msg}</td></tr>`;
    _renderPaginadorStock(0, 0);
    return;
  }

  const inicio = _stockPag * POR_PAGINA_STOCK;
  const pagina = filtrados.slice(inicio, inicio + POR_PAGINA_STOCK);

  tbody.innerHTML = pagina.map(p => {
    const estado = _estadoProducto(p);
    const { badgeHtml, stockColor, rowBg } = _estilosEstado(estado);
    const tipoDisplay = p.tipo
      ? p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1).toLowerCase()
      : '<span style="color:var(--text-3)">—</span>';
    return `<tr style="${rowBg}">
      <td>${toSentenceCase(p.nombre)}</td>
      <td>${tipoDisplay}</td>
      <td>${p.unidad || '—'}</td>
      <td style="text-align:right;font-weight:700;color:${stockColor}">${p.stockActual}</td>
      <td style="text-align:right;color:var(--text-2)">${p.stockMinimo ?? '—'}</td>
      <td>${badgeHtml}</td>
      <td>
        <button class="btn-secondary" style="height:26px;padding:0 10px;font-size:11px"
          data-prodid="${p.id}">Ver</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-prodid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prod = _datosStock.find(p => p.id === btn.dataset.prodid);
      if (prod) _abrirModalDetalle(prod);
    });
  });

  _renderPaginadorStock(total, totalPags);
}

// ── Autocomplete de unidades ──────────────────────────
function _initAutocompleteUnidad() {
  const inp   = document.getElementById('inv-prod-unidad');
  const lista = document.getElementById('inv-prod-unidad-lista');
  if (!inp || !lista) return;

  let idxSel = -1;

  function _mostrarItems(items) {
    lista.innerHTML = items;
    lista.style.display = items ? 'block' : 'none';
    lista.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', async e => {
        e.preventDefault();
        if (item.dataset.nueva) {
          const nombre = item.dataset.nueva;
          inp.value = nombre;
          lista.style.display = 'none';
          await agregarUnidad(_empresa, nombre);
          const display = nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
          if (!_unidades.some(u => u.toLowerCase() === nombre.toLowerCase())) {
            _unidades.push(display);
          }
          toast(`Unidad "${nombre}" agregada.`);
        } else {
          inp.value = item.textContent;
          lista.style.display = 'none';
        }
        idxSel = -1;
      });
    });
  }

  inp.addEventListener('focus', () => {
    if (inp.value) return;
    const html = _unidades.slice(0, 10)
      .map((u, i) => `<div class="autocomplete-item" data-idx="${i}">${u}</div>`).join('');
    _mostrarItems(html);
  });

  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    idxSel = -1;
    if (!q) { lista.style.display = 'none'; return; }

    const coincidencias = _unidades.filter(u => u.toLowerCase().includes(q)).slice(0, 8);
    const exacta        = _unidades.some(u => u.toLowerCase() === q);
    const itemsHtml     = coincidencias
      .map((u, i) => `<div class="autocomplete-item" data-idx="${i}">${u}</div>`).join('');
    const nuevaHtml     = !exacta
      ? `<div class="autocomplete-item" data-nueva="${inp.value.trim()}">+ Nueva unidad: "${inp.value.trim()}"</div>`
      : '';
    _mostrarItems(itemsHtml + nuevaHtml);
  });

  inp.addEventListener('keydown', e => {
    const items = lista.querySelectorAll('.autocomplete-item');
    if (!items.length || lista.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idxSel = Math.min(idxSel + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idxSel = Math.max(idxSel - 1, -1);
    } else if (e.key === 'Enter' && idxSel >= 0) {
      e.preventDefault();
      items[idxSel].dispatchEvent(new MouseEvent('mousedown'));
      return;
    } else if (e.key === 'Escape') {
      lista.style.display = 'none';
      return;
    }
    items.forEach((it, i) => it.classList.toggle('selected', i === idxSel));
    if (idxSel >= 0) items[idxSel].scrollIntoView({ block: 'nearest' });
  });

  inp.addEventListener('blur', () => {
    setTimeout(() => { lista.style.display = 'none'; idxSel = -1; }, 150);
  });
}

// ── Autocomplete de tipos de producto ────────────────
function _initAutocompleteTipo() {
  const inp   = document.getElementById('inv-prod-tipo');
  const lista = document.getElementById('inv-prod-tipo-lista');
  if (!inp || !lista) return;

  let idxSel = -1;

  function _mostrarItems(items) {
    lista.innerHTML = items;
    lista.style.display = items ? 'block' : 'none';
    lista.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', async e => {
        e.preventDefault();
        if (item.dataset.nuevo) {
          const nombre = item.dataset.nuevo;
          inp.value = nombre;
          lista.style.display = 'none';
          await agregarTipoProducto(_empresa, nombre);
          const display = nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
          if (!_tipos.some(t => t.toLowerCase() === nombre.toLowerCase())) {
            _tipos.push(display);
          }
          _actualizarFiltroTipo();
          toast(`Tipo "${nombre}" agregado.`);
        } else {
          inp.value = item.textContent;
          lista.style.display = 'none';
        }
        idxSel = -1;
      });
    });
  }

  inp.addEventListener('focus', () => {
    if (inp.value) return;
    const html = _tipos.slice(0, 10)
      .map((t, i) => `<div class="autocomplete-item" data-idx="${i}">${t}</div>`).join('');
    _mostrarItems(html || `<div class="autocomplete-item" style="color:var(--text-3);pointer-events:none;font-size:12px">Sin tipos creados aún</div>`);
  });

  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    idxSel = -1;
    if (!q) { lista.style.display = 'none'; return; }

    const coincidencias = _tipos.filter(t => t.toLowerCase().includes(q)).slice(0, 8);
    const exacta        = _tipos.some(t => t.toLowerCase() === q);
    const itemsHtml     = coincidencias
      .map((t, i) => `<div class="autocomplete-item" data-idx="${i}">${t}</div>`).join('');
    const nuevoHtml     = !exacta
      ? `<div class="autocomplete-item" data-nuevo="${inp.value.trim()}">+ Nuevo tipo de producto: "${inp.value.trim()}"</div>`
      : '';
    _mostrarItems(itemsHtml + nuevoHtml);
  });

  inp.addEventListener('keydown', e => {
    const items = lista.querySelectorAll('.autocomplete-item');
    if (!items.length || lista.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idxSel = Math.min(idxSel + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idxSel = Math.max(idxSel - 1, -1);
    } else if (e.key === 'Enter' && idxSel >= 0) {
      e.preventDefault();
      items[idxSel].dispatchEvent(new MouseEvent('mousedown'));
      return;
    } else if (e.key === 'Escape') {
      lista.style.display = 'none';
      return;
    }
    items.forEach((it, i) => it.classList.toggle('selected', i === idxSel));
    if (idxSel >= 0) items[idxSel].scrollIntoView({ block: 'nearest' });
  });

  inp.addEventListener('blur', () => {
    setTimeout(() => { lista.style.display = 'none'; idxSel = -1; }, 150);
  });
}

// ── Crear producto (formulario manual) ───────────────
async function _crearProductoUI() {
  const nombre    = document.getElementById('inv-prod-nombre')?.value?.trim();
  const unidad    = document.getElementById('inv-prod-unidad')?.value?.trim();
  const tipo      = document.getElementById('inv-prod-tipo')?.value?.trim();
  const siRaw     = document.getElementById('inv-prod-stock')?.value;
  const smRaw     = document.getElementById('inv-prod-stock-min')?.value?.trim();

  if (!nombre) { toast('Ingresa el nombre del producto.', 'error'); return; }
  if (!unidad) { toast('Ingresa la unidad de medida.', 'error'); return; }
  if (!tipo)   { toast('Selecciona o crea un tipo de producto.', 'error'); return; }

  const stockInicial = parseInt(siRaw || '0', 10);
  if (isNaN(stockInicial) || stockInicial < 0) {
    toast('El stock inicial debe ser 0 o mayor.', 'error'); return;
  }

  let stockMinimo = null;
  if (smRaw) {
    stockMinimo = parseInt(smRaw, 10);
    if (isNaN(stockMinimo) || stockMinimo < 0) {
      toast('El stock mínimo debe ser 0 o mayor.', 'error'); return;
    }
  }

  const nombreUpper = nombre.toUpperCase();
  if (_productos.some(p => p.nombre.toUpperCase() === nombreUpper)) {
    toast('Ya existe un producto con ese nombre.', 'error'); return;
  }

  try {
    // Guardar tipo en Firestore si es nuevo
    const tipoUpper = tipo.toUpperCase();
    const tipoExiste = _tipos.some(t => t.toUpperCase() === tipoUpper);
    if (!tipoExiste) {
      await agregarTipoProducto(_empresa, tipo);
      const display = tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
      _tipos.push(display);
      _actualizarFiltroTipo();
    }

    await crearProducto(_empresa, { nombre, unidad, tipo, stockInicial, stockMinimo });
    _cerrarModal();
    toast('Producto creado.');
    await _recargarTablaStock();
  } catch {
    toast('Error al crear el producto.', 'error');
  }
}

// ── Carga masiva CSV ──────────────────────────────────
function _descargarPlantillaCSV() {
  const contenido =
    'nombre;unidad;tipo;stock_inicial;stock_minimo\n' +
    'Ron de Caldas;Botella;Ron;24;5\n' +
    'Agua Cristal;Unidad;Gaseosa;48;10\n' +
    'Café Juan Valdez 500g;Paquete;Café;12;3\n';
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'DiarIO_plantilla_inventario.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function _detectarDelimitador(primeraLinea) {
  const conPuntoYComa = (primeraLinea.match(/;/g) || []).length;
  const conComa       = (primeraLinea.match(/,/g) || []).length;
  return conPuntoYComa >= conComa ? ';' : ',';
}

function _parsearCeldas(linea, delimitador) {
  const celdas = [];
  let celda = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      enComillas = !enComillas;
    } else if (ch === delimitador && !enComillas) {
      celdas.push(celda.trim());
      celda = '';
    } else {
      celda += ch;
    }
  }
  celdas.push(celda.trim());
  return celdas;
}

function _procesarArchivo(file) {
  const reader = new FileReader();
  reader.onload  = e => {
    const { validos, invalidos, delimitador } = _parsearCSV(e.target.result);
    _mostrarVistaPrevia(validos, invalidos, delimitador);
  };
  reader.onerror = () => toast('Error al leer el archivo.', 'error');
  reader.readAsText(file, 'UTF-8');
}

function _parsearCSV(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lineas.length < 2) return { validos: [], invalidos: [], delimitador: ';' };

  const delimitador = _detectarDelimitador(lineas[0]);
  const validos     = [];
  const invalidos   = [];

  lineas.slice(1).forEach((linea, idx) => {
    const cols   = _parsearCeldas(linea, delimitador);
    const nombre = cols[0]?.trim();
    const unidad = cols[1]?.trim();
    const tipo   = cols[2]?.trim();
    const siRaw  = cols[3]?.trim();
    const smRaw  = cols[4]?.trim();

    if (!nombre || !unidad) {
      invalidos.push({ linea: idx + 2, texto: linea, error: 'Nombre y unidad son obligatorios' });
      return;
    }
    if (!tipo) {
      invalidos.push({ linea: idx + 2, texto: linea, error: `El tipo de producto es obligatorio — fila ${idx + 2}` });
      return;
    }
    if (_productos.some(p => p.nombre.toUpperCase() === nombre.toUpperCase())) {
      invalidos.push({ linea: idx + 2, texto: linea, error: 'Ya existe un producto con este nombre' });
      return;
    }

    const stockInicial = siRaw ? parseInt(siRaw, 10) : 0;
    if (isNaN(stockInicial) || stockInicial < 0) {
      invalidos.push({ linea: idx + 2, texto: linea, error: 'Stock inicial debe ser un número ≥ 0' });
      return;
    }

    let stockMinimo = null;
    if (smRaw) {
      stockMinimo = parseInt(smRaw, 10);
      if (isNaN(stockMinimo) || stockMinimo < 0) {
        invalidos.push({ linea: idx + 2, texto: linea, error: 'Stock mínimo debe ser un número ≥ 0' });
        return;
      }
    }

    const tipoNuevo   = !_tipos.some(t => t.toUpperCase() === tipo.toUpperCase());
    const unidadNueva = !_unidades.some(u => u.toLowerCase() === unidad.toLowerCase());
    validos.push({ nombre, unidad, tipo, stockInicial, stockMinimo, tipoNuevo, unidadNueva });
  });

  return { validos, invalidos, delimitador };
}

function _mostrarVistaPrevia(validos, invalidos, delimitador = ';') {
  const el = document.getElementById('inv-csv-preview');
  if (!el) return;

  const msgDelimitador = delimitador === ';'
    ? 'Delimitador detectado: punto y coma (;)'
    : 'Delimitador detectado: coma (,)';

  if (!validos.length && !invalidos.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-3)">El archivo no contiene filas de datos.</p>`;
    return;
  }

  const filasOK = validos.map(p => {
    let estadoBadge;
    if (p.tipoNuevo && p.unidadNueva) {
      estadoBadge = `<span class="badge" style="background:#EDE9FE;color:#6D28D9">🆕 Tipo: ${p.tipo} · Unidad: ${p.unidad}</span>`;
    } else if (p.tipoNuevo) {
      estadoBadge = `<span class="badge" style="background:#EDE9FE;color:#6D28D9">🆕 Tipo nuevo: ${p.tipo}</span>`;
    } else if (p.unidadNueva) {
      estadoBadge = `<span class="badge" style="background:#EDE9FE;color:#6D28D9">🆕 Unidad nueva: ${p.unidad}</span>`;
    } else {
      estadoBadge = `<span class="badge badge-venta">✅ Listo</span>`;
    }
    return `<tr>
      <td>${toSentenceCase(p.nombre)}</td>
      <td>${p.unidad}</td>
      <td>${p.tipo}</td>
      <td style="text-align:right">${p.stockInicial}</td>
      <td style="text-align:right">${p.stockMinimo ?? '<span style="color:var(--text-3)">—</span>'}</td>
      <td>${estadoBadge}</td>
    </tr>`;
  }).join('');

  const filasErr = invalidos.map(p => `<tr>
    <td colspan="5" style="color:var(--red);font-size:12px">
      Fila ${p.linea}: ${p.error} — <em>${p.texto}</em>
    </td>
    <td><span class="badge badge-gasto">❌ Error</span></td>
  </tr>`).join('');

  el.innerHTML = `
    <div style="font-size:11px;color:var(--text-3);margin-bottom:6px">${msgDelimitador}</div>
    <div class="card-title" style="margin-bottom:10px">
      Vista previa — ${validos.length} válido${validos.length !== 1 ? 's' : ''}
      ${invalidos.length ? `, ${invalidos.length} con error` : ''}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nombre</th><th>Unidad</th><th>Tipo</th>
          <th style="text-align:right">Stock inicial</th>
          <th style="text-align:right">Stock mínimo</th>
          <th>Estado</th>
        </tr></thead>
        <tbody>${filasOK}${filasErr}</tbody>
      </table>
    </div>
  `;

  // Mover botón confirmar al footer fijo del modal
  const btnCargar    = document.getElementById('inv-btn-cargar-csv');
  const btnConfirmar = document.getElementById('inv-btn-confirmar-carga');
  if (btnCargar) btnCargar.style.display = 'none';
  if (btnConfirmar) {
    const nuevo = btnConfirmar.cloneNode(true);
    btnConfirmar.parentNode.replaceChild(nuevo, btnConfirmar);
    if (validos.length) {
      nuevo.style.display  = '';
      nuevo.textContent    = `Confirmar carga (${validos.length} producto${validos.length !== 1 ? 's' : ''})`;
      nuevo.addEventListener('click', () => _confirmarCargaMasiva(validos));
    } else {
      nuevo.style.display = 'none';
    }
  }
}

async function _confirmarCargaMasiva(productosValidos) {
  const btnConfirmar = document.getElementById('inv-btn-confirmar-carga');
  if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.textContent = 'Creando...'; }

  let creados       = 0;
  let tiposNuevos   = 0;
  let unidadesNuevas = 0;
  let errores       = 0;

  for (const p of productosValidos) {
    try {
      if (p.unidadNueva) {
        const display = p.unidad.charAt(0).toUpperCase() + p.unidad.slice(1).toLowerCase();
        if (!_unidades.some(u => u.toLowerCase() === display.toLowerCase())) {
          await agregarUnidad(_empresa, p.unidad);
          _unidades.push(display);
          unidadesNuevas++;
        }
      }

      if (p.tipoNuevo) {
        const display = p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1).toLowerCase();
        if (!_tipos.some(t => t.toLowerCase() === display.toLowerCase())) {
          await agregarTipoProducto(_empresa, p.tipo);
          _tipos.push(display);
          tiposNuevos++;
        }
      }

      await crearProducto(_empresa, p);
      creados++;
    } catch {
      errores++;
    }
  }

  // Recargar desde Firestore para dejar el cache local sincronizado
  const [tiposFS, unidadesFS] = await Promise.all([
    cargarTiposProducto(_empresa),
    cargarUnidades(_empresa)
  ]);
  _tipos    = tiposFS.map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  _unidades = unidadesFS;

  const partes = [`${creados} producto${creados !== 1 ? 's' : ''} creado${creados !== 1 ? 's' : ''}`];
  if (tiposNuevos)    partes.push(`${tiposNuevos} tipo${tiposNuevos !== 1 ? 's' : ''} nuevo${tiposNuevos !== 1 ? 's' : ''} creado${tiposNuevos !== 1 ? 's' : ''}`);
  if (unidadesNuevas) partes.push(`${unidadesNuevas} unidad${unidadesNuevas !== 1 ? 'es' : ''} nueva${unidadesNuevas !== 1 ? 's' : ''} creada${unidadesNuevas !== 1 ? 's' : ''}`);
  if (errores)        partes.push(`${errores} error${errores !== 1 ? 'es' : ''}`);

  _cerrarModal();
  toast(partes.join(', '));

  await _recargarTablaStock();
}

// ── Informe de inventario por período ────────────────

function _diaAnterior(fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function _isoADisplay(fechaISO) {
  const [y, m, d] = fechaISO.split('-');
  return `${d}/${m}/${y}`;
}

export async function generarInformeInventario(fechaDesde, fechaHasta) {
  const [snapProds, snapMovs] = await Promise.all([
    getDocs(collection(db, 'empresas', _empresa, 'productos')),
    getDocs(collection(db, 'empresas', _empresa, 'movInventario'))
  ]);

  const productos = snapProds.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = (a.tipo || '').toUpperCase();
      const tb = (b.tipo || '').toUpperCase();
      if (ta !== tb) return ta.localeCompare(tb);
      return a.nombre.localeCompare(b.nombre);
    });

  const movsTodos  = snapMovs.docs.map(d => d.data());
  const fechaAntes = _diaAnterior(fechaDesde);

  return productos.map(p => {
    const movsProd = movsTodos.filter(m => m.productoId === p.id);

    const stockInicial = movsProd
      .filter(m => m.fecha <= fechaAntes)
      .reduce((acc, m) => m.tipo === 'entrada' ? acc + m.cantidad : acc - m.cantidad, p.stockInicial ?? 0);

    const movsRango    = movsProd.filter(m => m.fecha >= fechaDesde && m.fecha <= fechaHasta);
    const entradas     = movsRango.filter(m => m.tipo === 'entrada').reduce((a, m) => a + m.cantidad, 0);
    const salidas      = movsRango.filter(m => m.tipo === 'salida').reduce((a, m) => a + m.cantidad, 0);
    const otrasSalidas = movsRango
      .filter(m => ['PERDIDA', 'CORTESIA', 'OTRA_SALIDA'].includes(m.tipo))
      .reduce((a, m) => a + m.cantidad, 0);
    const stockFinal   = stockInicial + entradas - salidas - otrasSalidas;

    return {
      nombre:      p.nombre,
      tipo:        p.tipo || '',
      unidad:      p.unidad || '—',
      stockMinimo: p.stockMinimo ?? null,
      stockInicial,
      entradas,
      salidas,
      otrasSalidas,
      stockFinal,
    };
  });
}

export function exportarInformeInventario(filas, fechaDesde, fechaHasta) {
  const cabecera = 'Producto;Tipo;Unidad;Stock inicial;Entradas;Salidas;Otras salidas;Stock final';
  let cuerpo = '';
  let tipoActual = null;
  filas.forEach(f => {
    const tipo = f.tipo || '—';
    if (tipo !== tipoActual) {
      tipoActual = tipo;
      const tipoDisplay = tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
      cuerpo += `${tipoDisplay};;;;;;;\n`;
    }
    cuerpo += [
      toSentenceCase(f.nombre),
      tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase(),
      f.unidad,
      f.stockInicial,
      f.entradas,
      f.salidas,
      f.otrasSalidas,
      f.stockFinal,
    ].join(';') + '\n';
  });
  cuerpo = cuerpo.trimEnd();

  const blob = new Blob(['﻿' + cabecera + '\n' + cuerpo], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `DiarIO_Inventario_${_empresa}_${fechaDesde}_${fechaHasta}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function abrirModalInforme() {
  const backdrop  = document.getElementById('inv-inf-backdrop');
  const preview   = document.getElementById('inv-inf-preview');
  const loading   = document.getElementById('inv-inf-loading');
  const btnExcelF = document.getElementById('inv-inf-btn-excel-footer');
  if (!backdrop) return;

  // Resetear estado visual
  preview.style.display   = 'none';
  loading.style.display   = 'none';
  btnExcelF.style.display = 'none';
  document.getElementById('inv-inf-tbody').textContent   = '';
  document.getElementById('inv-inf-periodo').textContent = '';
  backdrop.style.display = '';

  let _filas = [];

  const close = () => { backdrop.style.display = 'none'; };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  // Limpiar listeners acumulados con cloneNode
  ['inv-inf-btn-cerrar', 'inv-inf-btn-preview', 'inv-inf-btn-excel-top', 'inv-inf-btn-excel-footer']
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const n = el.cloneNode(true);
      el.parentNode.replaceChild(n, el);
    });

  document.getElementById('inv-inf-btn-cerrar').addEventListener('click', close);

  const _descargar = () => {
    if (!_filas.length) { toast('Genera la vista previa primero.', 'error'); return; }
    exportarInformeInventario(
      _filas,
      document.getElementById('inv-inf-desde').value,
      document.getElementById('inv-inf-hasta').value
    );
  };
  document.getElementById('inv-inf-btn-excel-top').addEventListener('click', _descargar);
  document.getElementById('inv-inf-btn-excel-footer').addEventListener('click', _descargar);

  document.getElementById('inv-inf-btn-preview').addEventListener('click', async () => {
    const desde = document.getElementById('inv-inf-desde').value;
    const hasta = document.getElementById('inv-inf-hasta').value;

    if (!desde || !hasta) { toast('Ingresa las dos fechas.', 'error'); return; }
    if (desde > hasta)    { toast('La fecha Desde no puede ser mayor que Hasta.', 'error'); return; }

    preview.style.display   = 'none';
    loading.style.display   = '';
    btnExcelF.style.display = 'none';
    _filas = [];

    try {
      _filas = await generarInformeInventario(desde, hasta);
    } catch {
      toast('Error al generar el informe.', 'error');
      loading.style.display = 'none';
      return;
    }

    loading.style.display = 'none';

    if (!_filas.length) {
      document.getElementById('inv-inf-tbody').innerHTML =
        `<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:20px 0;font-size:12px">No hay productos registrados en esta empresa.</td></tr>`;
      preview.style.display = '';
      return;
    }

    document.getElementById('inv-inf-periodo').textContent =
      `Período: ${_isoADisplay(desde)} al ${_isoADisplay(hasta)} · ${_filas.length} producto${_filas.length !== 1 ? 's' : ''}`;

    let tipoActualPrev = null;
    document.getElementById('inv-inf-tbody').innerHTML = _filas.map(f => {
      let rowBg = '';
      if (f.stockFinal <= 0) rowBg = 'background:var(--red-light)';
      else if (f.stockMinimo !== null && f.stockFinal <= f.stockMinimo) rowBg = 'background:var(--amber-light)';
      const tipo = f.tipo || '—';
      let separador = '';
      if (tipo !== tipoActualPrev) {
        tipoActualPrev = tipo;
        const tipoDisplay = tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
        separador = `<tr style="background:var(--surface-2)">
          <td colspan="8" style="font-weight:600;font-size:11px;padding:5px 8px;color:var(--text-2);letter-spacing:.3px">${tipoDisplay}</td>
        </tr>`;
      }
      const tipoDisplay = tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
      return separador + `<tr style="${rowBg}">
        <td>${toSentenceCase(f.nombre)}</td>
        <td style="color:var(--text-2);font-size:12px">${tipoDisplay}</td>
        <td>${f.unidad}</td>
        <td style="text-align:right;font-weight:700">${f.stockInicial}</td>
        <td style="text-align:right;color:var(--green)">${f.entradas}</td>
        <td style="text-align:right;color:var(--red)">${f.salidas}</td>
        <td style="text-align:right;color:var(--amber)">${f.otrasSalidas}</td>
        <td style="text-align:right;font-weight:700">${f.stockFinal}</td>
      </tr>`;
    }).join('');

    preview.style.display   = '';
    btnExcelF.style.display = '';
  });
}

