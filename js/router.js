// js/router.js
// Orquesta el flujo: login → empresa → app
// Es el punto de entrada principal que conecta todos los módulos

import { initAuth, loginConGoogle, logout, getInitials } from './auth.js';
import { cargarEmpresaDelUsuario, crearEmpresa, unirseAEmpresa, empresaActual } from './empresa.js';
import { cargarSubcategorias, getSubcategorias, agregarSubcategoria } from './subcategorias.js';
import { agregarMovimiento, getMovimientosMes, getMesesConDatos } from './movimientos.js';
import { renderDashboard } from './dashboard.js';
import { initInformes } from './informes.js';
import {
  showPage, toast, showLoader, hideLoader,
  showModal, showConfirm, formatCOP, labelMes,
  claveMes, parseFecha, hoy, toSentenceCase, emptyState
} from './ui.js';

// ── Estado local ───────────────────────────────────────────
let userActual    = null;
let empresaCodigo = null;
let mesesConDatos = [];
let mesSelIdx     = 0;  // índice en mesesConDatos

// ── Inicio ─────────────────────────────────────────────────
export function init() {
  initAuth(onLogin, onLogout);
  bindLogin();
}

// ── Flujo al hacer login ───────────────────────────────────
async function onLogin(user) {
  userActual = user;
  showLoader();

  try {
    const empresa = await cargarEmpresaDelUsuario(user.uid);

    if (!empresa) {
      // Primera vez: mostrar flujo de empresa
      hideLoader();
      mostrarFlujoEmpresa(user);
      return;
    }

    empresaCodigo = empresa.codigo;
    await cargarSubcategorias(empresaCodigo);
    await iniciarApp();
  } catch (err) {
    console.error(err);
    hideLoader();
    toast('Error al cargar datos. Intenta de nuevo.', 'error');
  }
}

// ── Flujo al hacer logout ──────────────────────────────────
function onLogout() {
  userActual    = null;
  empresaCodigo = null;
  mesesConDatos = [];
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('topbar').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  hideLoader();
}

// ── Iniciar la app después de tener usuario + empresa ──────
async function iniciarApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('app').classList.remove('hidden');

  renderTopbar();
  bindNav();

  await goToDashboard();
  hideLoader();
}

// ── Topbar ─────────────────────────────────────────────────
function renderTopbar() {
  const chip = document.getElementById('user-chip');
  if (!chip) return;

  const foto = userActual.photoURL;
  const avatarHtml = foto
    ? `<img src="${foto}" alt="foto" />`
    : getInitials(userActual.displayName || userActual.email);

  chip.querySelector('.user-avatar').innerHTML = avatarHtml;
  chip.querySelector('.user-name').textContent =
    (userActual.displayName || userActual.email).split(' ')[0];

  chip.addEventListener('click', toggleUserMenu);
}

function toggleUserMenu() {
  let menu = document.getElementById('user-menu');
  if (menu) { menu.remove(); return; }

  const empresa = empresaActual; // importado de empresa.js
  menu = document.createElement('div');
  menu.id = 'user-menu';
  menu.className = 'user-menu';
  menu.innerHTML = `
    <div class="user-menu-header">
      <div class="user-menu-name">${userActual.displayName || 'Usuario'}</div>
      <div class="user-menu-email">${userActual.email}</div>
    </div>
    <div class="user-menu-empresa">
      Empresa: <strong>${toSentenceCase(empresa?.nombre || '')}</strong><br/>
      Código: <strong>${empresa?.codigo || ''}</strong>
    </div>
    <button class="user-menu-btn danger" id="btn-logout">Cerrar sesión</button>
  `;
  document.body.appendChild(menu);
  document.getElementById('btn-logout').addEventListener('click', logout);
  setTimeout(() => document.addEventListener('click', cerrarMenuUsuario), 10);
}

function cerrarMenuUsuario(e) {
  const menu = document.getElementById('user-menu');
  if (menu && !menu.contains(e.target)) {
    menu.remove();
    document.removeEventListener('click', cerrarMenuUsuario);
  }
}

// ── Navegación ─────────────────────────────────────────────
function bindNav() {
  document.getElementById('logo-btn').addEventListener('click', goToDashboard);
  document.getElementById('nav-dashboard').addEventListener('click', goToDashboard);
  document.getElementById('nav-registro').addEventListener('click', goToRegistro);
  document.getElementById('nav-informes').addEventListener('click', goToInformes);
}

async function goToDashboard() {
  showPage('dashboard');
  await renderDashboard(empresaCodigo);
}

async function goToRegistro() {
  showPage('registro');
  await initRegistro();
}

async function goToInformes() {
  showPage('informes');
  await initInformes(empresaCodigo);
}

// ── Pantalla de Registro ───────────────────────────────────
async function initRegistro() {
  // Inicializar campo de fecha
  document.getElementById('inp-fecha').value = hoy();

  // Cargar subcategorías en el select de categoría
  const selCat = document.getElementById('inp-categoria');
  const selSub = document.getElementById('inp-subcategoria');

  selCat.addEventListener('change', () => actualizarSubcats(selCat.value, selSub));
  actualizarSubcats(selCat.value, selSub);

  // Evento "agregar" - botón y Enter en último campo
  document.getElementById('btn-agregar').addEventListener('click', agregarMovimientoUI);
  document.getElementById('inp-factura').addEventListener('keydown', e => {
    if (e.key === 'Enter') agregarMovimientoUI();
  });

  // Cargar meses y tabla
  await recargarMeses();
}

function actualizarSubcats(categoria, selSub) {
  const subs = getSubcategorias(categoria);
  selSub.innerHTML = subs
    .map(s => `<option value="${s}">${s}</option>`)
    .join('') + '<option value="__nueva__">+ Nueva subcategoría...</option>';
}

async function agregarMovimientoUI() {
  const fecha    = document.getElementById('inp-fecha').value.trim();
  const cat      = document.getElementById('inp-categoria').value;
  let   sub      = document.getElementById('inp-subcategoria').value;
  const valor    = document.getElementById('inp-valor').value.trim();
  const prov     = document.getElementById('inp-proveedor').value.trim();
  const factura  = document.getElementById('inp-factura').value.trim();

  // ¿Nueva subcategoría?
  if (sub === '__nueva__') {
    showModal({
      title: 'Nueva subcategoría',
      description: `Ingresa el nombre para la subcategoría de "${cat}":`,
      placeholder: 'Ej: Domicilio, Nómina...',
      confirmText: 'Crear',
      onConfirm: async (nombre) => {
        const ok = await agregarSubcategoria(empresaCodigo, cat, nombre);
        if (ok) {
          toast(`Subcategoría "${toSentenceCase(nombre)}" creada.`);
          const selSub = document.getElementById('inp-subcategoria');
          actualizarSubcats(cat, selSub);
          selSub.value = toSentenceCase(nombre);
        } else {
          toast('Esa subcategoría ya existe.', 'info');
        }
      }
    });
    return;
  }

  // Validaciones
  if (!fecha) { toast('Ingresa la fecha.', 'error'); return; }
  if (!parseFecha(fecha)) { toast('Formato de fecha: DD/MM/YYYY', 'error'); return; }
  if (!sub)   { toast('Selecciona una subcategoría.', 'error'); return; }
  if (!valor || isNaN(parseFloat(valor.replace(/[^0-9.]/g,'')))) {
    toast('Ingresa un valor válido.', 'error'); return;
  }

  try {
    const mov = await agregarMovimiento(empresaCodigo, userActual.uid, {
      fecha, categoria: cat, subcategoria: sub, valor, proveedor: prov, factura
    });

    toast('Movimiento guardado.');
    limpiarFormulario();

    // Si el mes del registro coincide con el mes que se está viendo, agregar a la tabla
    const parsed = parseFecha(fecha);
    if (parsed && mesesConDatos.length > 0) {
      const claveReg = claveMes(parsed.mes, parsed.anio);
      const claveVista = mesesConDatos[mesSelIdx];
      if (claveReg === claveVista) {
        prependarFilaTabla(mov);
      }
    }

    // Actualizar lista de meses disponibles
    await recargarMeses();

  } catch (err) {
    console.error(err);
    toast('Error al guardar. Intenta de nuevo.', 'error');
  }
}

function limpiarFormulario() {
  document.getElementById('inp-fecha').value    = hoy();
  document.getElementById('inp-valor').value    = '';
  document.getElementById('inp-proveedor').value= '';
  document.getElementById('inp-factura').value  = '';
  document.getElementById('inp-categoria').focus();
}

// ── Tabla de movimientos ───────────────────────────────────
async function recargarMeses() {
  mesesConDatos = await getMesesConDatos(empresaCodigo);
  renderSelectorMes();
  await renderTabla();
}

function renderSelectorMes() {
  const sel = document.getElementById('sel-mes');
  if (!sel) return;

  if (!mesesConDatos.length) {
    sel.innerHTML = '<option value="">Sin datos</option>';
    return;
  }

  sel.innerHTML = mesesConDatos.map((c, i) => {
    const [anio, mes] = c.split('-');
    return `<option value="${i}">${labelMes(parseInt(mes), parseInt(anio))}</option>`;
  }).join('');

  sel.value = String(mesSelIdx);
  sel.onchange = async () => {
    mesSelIdx = parseInt(sel.value);
    await renderTabla();
  };

  document.getElementById('btn-mes-prev').onclick = async () => {
    if (mesSelIdx < mesesConDatos.length - 1) {
      mesSelIdx++;
      sel.value = String(mesSelIdx);
      await renderTabla();
    }
  };
  document.getElementById('btn-mes-next').onclick = async () => {
    if (mesSelIdx > 0) {
      mesSelIdx--;
      sel.value = String(mesSelIdx);
      await renderTabla();
    }
  };
}

async function renderTabla() {
  const wrap = document.getElementById('tabla-movimientos');
  if (!wrap) return;

  if (!mesesConDatos.length) {
    wrap.innerHTML = emptyState('No hay movimientos aún. ¡Registra el primero!');
    document.getElementById('tabla-footer').innerHTML = '';
    return;
  }

  const clave = mesesConDatos[mesSelIdx];
  const [anio, mes] = clave.split('-');
  const movs = await getMovimientosMes(empresaCodigo, parseInt(mes), parseInt(anio));

  if (!movs.length) {
    wrap.innerHTML = emptyState('Sin movimientos en este mes.');
    document.getElementById('tabla-footer').innerHTML = '';
    return;
  }

  let totalVenta = 0, totalGasto = 0, totalCompra = 0;

  const filas = movs.map(m => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  totalVenta  += m.valor;
    if (cat === 'gasto')  totalGasto  += m.valor;
    if (cat === 'compra') totalCompra += m.valor;

    return `<tr>
      <td>${m.fecha}</td>
      <td><span class="badge badge-${cat}">${toSentenceCase(m.categoria)}</span></td>
      <td>${toSentenceCase(m.subcategoria)}</td>
      <td>${m.proveedor ? toSentenceCase(m.proveedor) : '<span style="color:var(--text-3)">—</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${m.factura || '<span style="color:var(--text-3)">—</span>'}</td>
      <td class="amount ${cat}">${formatCOP(m.valor)}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Categoría</th><th>Subcategoría</th>
            <th>Proveedor</th><th>N° Factura</th><th style="text-align:right">Valor</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  document.getElementById('tabla-footer').innerHTML = `
    <div class="table-footer">
      <span style="color:var(--green)">Ventas: ${formatCOP(totalVenta)}</span>
      <span style="color:var(--red)">Gastos: ${formatCOP(totalGasto)}</span>
      <span style="color:var(--blue)">Compras: ${formatCOP(totalCompra)}</span>
    </div>`;
}

// Agregar fila al inicio de la tabla sin recargar todo
function prependarFilaTabla(m) {
  const tbody = document.querySelector('#tabla-movimientos tbody');
  if (!tbody) return;
  const cat = (m.categoria || '').toLowerCase();
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${m.fecha}</td>
    <td><span class="badge badge-${cat}">${toSentenceCase(m.categoria)}</span></td>
    <td>${toSentenceCase(m.subcategoria)}</td>
    <td>${m.proveedor ? toSentenceCase(m.proveedor) : '<span style="color:var(--text-3)">—</span>'}</td>
    <td style="font-family:var(--font-mono);font-size:12px">${m.factura || '<span style="color:var(--text-3)">—</span>'}</td>
    <td class="amount ${cat}">${formatCOP(m.valor)}</td>`;
  tbody.insertBefore(tr, tbody.firstChild);
}

// ── Flujo de empresa (primer login) ───────────────────────
function mostrarFlujoEmpresa(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('topbar').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');

  const screen = document.getElementById('empresa-screen');
  screen.classList.remove('hidden');

  document.getElementById('btn-crear-empresa').addEventListener('click', async () => {
    const nombre = document.getElementById('inp-nombre-empresa').value.trim();
    if (!nombre) { toast('Ingresa el nombre de tu empresa.', 'error'); return; }
    showLoader();
    try {
      await crearEmpresa(nombre, user.uid, user.email, user.displayName || '');
      await cargarSubcategorias(empresaCodigo || (await cargarEmpresaDelUsuario(user.uid))?.codigo);
      screen.classList.add('hidden');
      await onLogin(user);
    } catch (err) {
      console.error(err);
      hideLoader();
      toast('Error al crear empresa.', 'error');
    }
  });

  document.getElementById('btn-unirse-empresa').addEventListener('click', async () => {
    const codigo = document.getElementById('inp-codigo-empresa').value.trim();
    if (!codigo) { toast('Ingresa el código de la empresa.', 'error'); return; }
    showLoader();
    try {
      const empresa = await unirseAEmpresa(codigo, user.uid, user.email, user.displayName || '');
      if (!empresa) { hideLoader(); return; }
      await cargarSubcategorias(empresa.codigo);
      screen.classList.add('hidden');
      await onLogin(user);
    } catch (err) {
      console.error(err);
      hideLoader();
      toast('Error al unirse a la empresa.', 'error');
    }
  });
}

// ── Bind login ─────────────────────────────────────────────
function bindLogin() {
  document.getElementById('btn-google-login')?.addEventListener('click', loginConGoogle);
}
