// js/router.js
// Orquesta el flujo: login → empresa → app
// Es el punto de entrada principal que conecta todos los módulos

import { initAuth, loginConGoogle, logout, getInitials } from './auth.js';
import { cargarEmpresaDelUsuario, crearEmpresa, unirseAEmpresa, empresaActual } from './empresa.js';
import { cargarSubcategorias } from './subcategorias.js';
import { agregarMovimiento, getMovimientosMes, getMesesConDatos, eliminarMovimiento } from './movimientos.js';
import { renderDashboard } from './dashboard.js';
import { initInformes } from './informes.js';
import {
  showPage, toast, showLoader, hideLoader,
  showModal, showConfirm, formatCOP, labelMes,
  claveMes, parseFecha, hoy, toSentenceCase, emptyState
} from './ui.js';

// ── hoyISO: fecha de hoy en formato YYYY-MM-DD ─────────────
function hoyISO() {
  const d  = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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

  // Exponer navegación global para que dashboard.js pueda usarla
  window.__navTo = (page) => {
    if (page === 'dashboard') goToDashboard();
    if (page === 'registro')  goToRegistro();
    if (page === 'informes')  goToInformes();
  };
}

async function goToDashboard() {
  showPage('dashboard');
  await renderDashboard(empresaCodigo, empresaActual?.nombre || '');
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
  // Fecha de hoy en formato YYYY-MM-DD (requerido por input type=date)
  const inpFecha = document.getElementById('inp-fecha');
  inpFecha.value = hoyISO();

  // Formato de número con puntos mientras escribe
  const inpValor = document.getElementById('inp-valor');
  inpValor.addEventListener('input', () => {
    const raw = inpValor.value.replace(/\./g, '').replace(/[^0-9]/g, '');
    inpValor.value = raw ? parseInt(raw, 10).toLocaleString('es-CO') : '';
  });

  // Enter en valor o factura → agregar
  inpValor.addEventListener('keydown',  e => { if (e.key === 'Enter') agregarMovimientoUI(); });
  document.getElementById('inp-factura').addEventListener('keydown', e => {
    if (e.key === 'Enter') agregarMovimientoUI();
  });
  document.getElementById('btn-agregar').addEventListener('click', agregarMovimientoUI);

  await recargarMeses();
}


async function agregarMovimientoUI() {
  const fechaISO = document.getElementById('inp-fecha').value;           // "YYYY-MM-DD"
  const cat      = document.getElementById('inp-categoria').value;
  const valorRaw = document.getElementById('inp-valor').value.replace(/\./g, '').trim();
  const prov     = document.getElementById('inp-proveedor').value.trim();
  const factura  = document.getElementById('inp-factura').value.trim();

  if (!fechaISO) { toast('Selecciona una fecha.', 'error'); return; }
  if (!valorRaw || isNaN(parseFloat(valorRaw))) {
    toast('Ingresa un valor válido.', 'error'); return;
  }

  // Convertir YYYY-MM-DD → DD/MM/YYYY para mostrar y guardar
  const [anio, mes, dia] = fechaISO.split('-');
  const fechaDisplay = `${dia}/${mes}/${anio}`;

  try {
    const mov = await agregarMovimiento(empresaCodigo, userActual.uid, {
      fecha: fechaDisplay,
      categoria: cat,
      subcategoria: '',
      valor: valorRaw,
      proveedor: prov,
      factura
    });

    toast('Movimiento guardado.');
    limpiarFormulario();

    // Si el mes del registro coincide con el mes visible, agregar fila
    const claveReg   = `${anio}-${mes}`;
    const claveVista = mesesConDatos[mesSelIdx];
    if (claveReg === claveVista) {
      prependarFilaTabla(mov);
      actualizarFooter();
    }

    await recargarMeses();

  } catch (err) {
    console.error(err);
    toast('Error al guardar. Intenta de nuevo.', 'error');
  }
}

function limpiarFormulario() {
  document.getElementById('inp-fecha').value     = hoyISO();
  document.getElementById('inp-valor').value     = '';
  document.getElementById('inp-proveedor').value = '';
  document.getElementById('inp-factura').value   = '';
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

// ── Estado de paginación ───────────────────────────────────
const POR_PAGINA  = 15;
let pagActual     = 1;
let movsCache     = [];   // todos los movs del mes, para paginar en cliente

async function renderTabla(resetPag = true) {
  const wrap = document.getElementById('tabla-movimientos');
  if (!wrap) return;

  if (!mesesConDatos.length) {
    wrap.innerHTML = emptyState('No hay movimientos aún. ¡Registra el primero!');
    document.getElementById('tabla-footer').innerHTML = '';
    return;
  }

  const clave = mesesConDatos[mesSelIdx];
  const [anio, mes] = clave.split('-');
  movsCache = await getMovimientosMes(empresaCodigo, parseInt(mes), parseInt(anio));

  if (!movsCache.length) {
    wrap.innerHTML = emptyState('Sin movimientos en este mes.');
    document.getElementById('tabla-footer').innerHTML = '';
    return;
  }

  if (resetPag) pagActual = 1;
  renderPagina();
}

function renderPagina() {
  const wrap = document.getElementById('tabla-movimientos');
  if (!wrap) return;

  const totalPags = Math.ceil(movsCache.length / POR_PAGINA);
  if (pagActual > totalPags) pagActual = totalPags;

  const inicio = (pagActual - 1) * POR_PAGINA;
  const pagMovs = movsCache.slice(inicio, inicio + POR_PAGINA);

  // Totales siempre del mes completo (no solo la página)
  let totalVenta = 0, totalGasto = 0, totalCompra = 0;
  movsCache.forEach(m => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  totalVenta  += m.valor;
    if (cat === 'gasto')  totalGasto  += m.valor;
    if (cat === 'compra') totalCompra += m.valor;
  });

  const filas = pagMovs.map(m => {
    const cat     = (m.categoria || '').toLowerCase();
    const prov    = m.proveedor ? toSentenceCase(m.proveedor) : '<span style="color:var(--text-3)">—</span>';
    const factura = m.factura   || '<span style="color:var(--text-3)">—</span>';
    return `<tr data-id="${m.id}" data-cat="${cat}" data-valor="${m.valor}">
      <td>${m.fecha}</td>
      <td><span class="badge badge-${cat}">${toSentenceCase(m.categoria)}</span></td>
      <td>${prov}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${factura}</td>
      <td class="amount ${cat}">${formatCOP(m.valor)}</td>
      <td style="width:32px;text-align:center">
        <button class="btn-del" title="Eliminar" onclick="window.__delMov('${m.id}')">&#x2715;</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Categoría</th><th>Proveedor</th>
            <th>N° Factura</th><th style="text-align:right">Valor</th><th></th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  // Paginación — solo si hay más de una página
  if (totalPags > 1) {
    wrap.innerHTML += `
      <div class="pagination">
        <button class="pag-arrow" id="pag-prev" ${pagActual === 1 ? 'disabled' : ''}>&#8249;</button>
        <span class="pag-info">Pág. ${pagActual} de ${totalPags}</span>
        <button class="pag-arrow" id="pag-next" ${pagActual === totalPags ? 'disabled' : ''}>&#8250;</button>
      </div>`;

    document.getElementById('pag-prev').onclick = () => { pagActual--; renderPagina(); };
    document.getElementById('pag-next').onclick = () => { pagActual++; renderPagina(); };
  }

  renderFooterTotales(totalVenta, totalGasto, totalCompra);
  window.__delMov = (id) => confirmarEliminar(id);
}

function renderFooterTotales(v, g, c) {
  document.getElementById('tabla-footer').innerHTML = `
    <div class="table-footer">
      <span style="color:var(--green)">Ventas: ${formatCOP(v)}</span>
      <span style="color:var(--red)">Gastos: ${formatCOP(g)}</span>
      <span style="color:var(--blue)">Compras: ${formatCOP(c)}</span>
    </div>`;
}

function actualizarFooter() {
  // Lee siempre del cache completo del mes, no solo la página visible
  let v = 0, g = 0, c = 0;
  movsCache.forEach(m => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  v += m.valor;
    if (cat === 'gasto')  g += m.valor;
    if (cat === 'compra') c += m.valor;
  });
  renderFooterTotales(v, g, c);
}

function confirmarEliminar(movId) {
  showConfirm({
    title: '¿Eliminar movimiento?',
    description: 'Esta acción no se puede deshacer.',
    confirmText: 'Sí, eliminar',
    danger: true,
    onConfirm: async () => {
      try {
        await eliminarMovimiento(empresaCodigo, movId);
        // Quitar del cache y redibujar página actual
        movsCache = movsCache.filter(m => m.id !== movId);
        // Si la página actual quedó vacía, retroceder una
        const totalPags = Math.ceil(movsCache.length / POR_PAGINA);
        if (pagActual > totalPags && pagActual > 1) pagActual--;
        renderPagina();
        toast('Movimiento eliminado.');
      } catch (err) {
        console.error(err);
        toast('Error al eliminar.', 'error');
      }
    }
  });
}

// Agregar fila al inicio de la tabla sin recargar todo
function prependarFilaTabla(m) {
  movsCache.unshift(m); // insertar al inicio (más reciente primero)
  pagActual = 1;        // volver a página 1 para ver el nuevo registro
  renderPagina();
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
