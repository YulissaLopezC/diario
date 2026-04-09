// js/router.js
// Orquesta el flujo: login → empresa → app
// Es el punto de entrada principal que conecta todos los módulos

import { initAuth, loginConGoogle, logout, getInitials } from './auth.js';
import { cargarEmpresasDelUsuario, crearEmpresa, unirseAEmpresa, empresaActual, misEmpresas, setEmpresaActual } from './empresa.js';
import { cargarSubcategorias } from './subcategorias.js';
import { agregarMovimiento, getMovimientosMes, getMesesConDatos, eliminarMovimiento, getMovimientosDia } from './movimientos.js';
import { renderDashboard } from './dashboard.js';
import { initInformes } from './informes.js';
import {
  showPage, toast, showLoader, hideLoader,
  showModal, showConfirm, formatCOP, labelMes,
  claveMes, parseFecha, hoy, hoyISO, toSentenceCase, emptyState
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
    const empresas = await cargarEmpresasDelUsuario(user.uid);

    if (!empresas.length) {
      hideLoader();
      mostrarFlujoEmpresa(user);
      return;
    }

    // Si tiene varias empresas mostrar selector, si tiene una entrar directo
    if (empresas.length > 1) {
      hideLoader();
      mostrarSelectorEmpresa(empresas, user);
      return;
    }

    // Una sola empresa — entrar directo
    empresaCodigo = empresas[0].codigo;
    setEmpresaActual(empresaCodigo);
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

  const empresa = empresaActual;
  const tieneVarias = misEmpresas.length > 1;

  // Generar opciones de cambio de empresa si tiene varias
  const otrasEmpresas = misEmpresas
    .filter(e => e.codigo !== empresa?.codigo)
    .map(e => `
      <button class="user-menu-btn" data-codigo="${e.codigo}">
        Cambiar a <strong>${toSentenceCase(e.nombre)}</strong>
      </button>`).join('');

  menu = document.createElement('div');
  menu.id = 'user-menu';
  menu.className = 'user-menu';
  menu.innerHTML = `
    <div class="user-menu-header">
      <div class="user-menu-name">${userActual.displayName || 'Usuario'}</div>
      <div class="user-menu-email">${userActual.email}</div>
    </div>
    <div class="user-menu-empresa">
      <div class="user-menu-empresa-label">Empresa activa</div>
      <div class="user-menu-empresa-nombre">${toSentenceCase(empresa?.nombre || '')}</div>
      <div class="user-menu-empresa-codigo">Código: ${empresa?.codigo || ''}</div>
    </div>
    ${tieneVarias ? `<div class="user-menu-section">${otrasEmpresas}</div>` : ''}
    <button class="user-menu-btn" id="btn-unirse-nueva">+ Unirme a otro local</button>
    <button class="user-menu-btn danger" id="btn-logout">Cerrar sesión</button>
  `;
  document.body.appendChild(menu);

  document.getElementById('btn-logout').addEventListener('click', logout);

  // Botón unirse a otra empresa
  document.getElementById('btn-unirse-nueva')?.addEventListener('click', () => {
    menu.remove();
    mostrarModalUnirse();
  });

  // Botones de cambio de empresa
  menu.querySelectorAll('[data-codigo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const codigo = btn.dataset.codigo;
      menu.remove();
      showLoader();
      setEmpresaActual(codigo);
      empresaCodigo = codigo;
      await cargarSubcategorias(codigo);
      await goToDashboard();
      hideLoader();
      toast(`Cambiado a ${toSentenceCase(empresaActual?.nombre || '')}.`);
    });
  });

  setTimeout(() => document.addEventListener('click', cerrarMenuUsuario), 10);
}

// ── Modal para unirse a otra empresa desde el menú ─────────
function mostrarModalUnirse() {
  showModal({
    title: 'Unirme a otro local',
    description: 'Ingresa el código del local al que quieres unirte:',
    placeholder: 'Ej: CAFET-1234',
    confirmText: 'Unirme',
    onConfirm: async (codigo) => {
      showLoader();
      try {
        const empresa = await unirseAEmpresa(
          codigo,
          userActual.uid,
          userActual.email,
          userActual.displayName || ''
        );
        if (!empresa) { hideLoader(); return; }
        await cargarSubcategorias(empresa.codigo);
        empresaCodigo = empresa.codigo;
        await goToDashboard();
        hideLoader();
        toast(`Bienvenido a ${toSentenceCase(empresa.nombre)}.`);
      } catch (err) {
        console.error(err);
        hideLoader();
        toast('Error al unirse. Verifica el código.', 'error');
      }
    }
  });
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

// ── Banner resumen del día en registro ─────────────────────
async function actualizarBannerDia() {
  const banner = document.getElementById('reg-dia-banner');
  if (!banner) return;

  const movs = await getMovimientosDia(empresaCodigo, hoy());
  if (!movs.length) { banner.style.display = 'none'; return; }

  let v = 0, g = 0, c = 0;
  movs.forEach(m => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  v += m.valor;
    if (cat === 'gasto')  g += m.valor;
    if (cat === 'compra') c += m.valor;
  });

  const balance = v - g - c;
  const balColor = balance >= 0 ? 'var(--green)' : 'var(--red)';

  document.getElementById('rd-ventas').textContent  = formatCOP(v);
  document.getElementById('rd-gastos').textContent  = formatCOP(g);
  document.getElementById('rd-compras').textContent = formatCOP(c);
  const elB = document.getElementById('rd-balance');
  elB.textContent   = formatCOP(balance);
  elB.style.color   = balColor;
  banner.style.display = 'flex';
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
  await actualizarBannerDia();
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
    await actualizarBannerDia();

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
  const balance = v - g - c;
  const balColor = balance >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('tabla-footer').innerHTML = `
    <div class="reg-footer">
      <div class="reg-footer-item">
        <div class="reg-footer-label">Total ventas</div>
        <div class="reg-footer-val" style="color:var(--green)">${formatCOP(v)}</div>
      </div>
      <div class="reg-footer-item">
        <div class="reg-footer-label">Total gastos</div>
        <div class="reg-footer-val" style="color:var(--red)">${formatCOP(g)}</div>
      </div>
      <div class="reg-footer-item">
        <div class="reg-footer-label">Balance neto</div>
        <div class="reg-footer-val" style="color:${balColor}">${formatCOP(balance)}</div>
      </div>
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
        await actualizarBannerDia();
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

// ── Selector de empresa (cuando tiene varias al iniciar) ───
function mostrarSelectorEmpresa(empresas, user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('topbar').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');

  // Reusar empresa-screen con contenido dinámico
  const screen = document.getElementById('empresa-screen');
  screen.classList.remove('hidden');

  // Reemplazar contenido del card
  const card = screen.querySelector('.login-card');
  card.innerHTML = `
    <div class="login-logo">Diar<span>IO</span></div>
    <p class="login-sub" style="margin-bottom:20px">¿A cuál local quieres entrar?</p>
    <div id="selector-empresas" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${empresas.map(e => `
        <button class="btn-empresa-sel" data-codigo="${e.codigo}">
          <span class="btn-empresa-nombre">${toSentenceCase(e.nombre)}</span>
          <span class="btn-empresa-codigo">${e.codigo}</span>
        </button>`).join('')}
    </div>
    <div class="divider"><hr /><span>o</span><hr /></div>
    <input type="text" id="inp-codigo-empresa" class="login-code-input" placeholder="Unirme a otro local con código" style="margin-bottom:6px"/>
    <button class="btn-secondary" id="btn-unirse-empresa" style="width:100%;height:36px">Unirme</button>
    <p class="login-note">Selecciona un local para continuar.</p>
  `;

  // Botones de selección
  card.querySelectorAll('.btn-empresa-sel').forEach(btn => {
    btn.addEventListener('click', async () => {
      showLoader();
      const codigo = btn.dataset.codigo;
      setEmpresaActual(codigo);
      empresaCodigo = codigo;
      await cargarSubcategorias(codigo);
      screen.classList.add('hidden');
      await iniciarApp();
    });
  });

  // Unirse a otra empresa
  card.querySelector('#btn-unirse-empresa')?.addEventListener('click', async () => {
    const codigo = card.querySelector('#inp-codigo-empresa').value.trim();
    if (!codigo) { toast('Ingresa el código del local.', 'error'); return; }
    showLoader();
    try {
      const empresa = await unirseAEmpresa(codigo, user.uid, user.email, user.displayName || '');
      if (!empresa) { hideLoader(); return; }
      await cargarSubcategorias(empresa.codigo);
      empresaCodigo = empresa.codigo;
      screen.classList.add('hidden');
      await iniciarApp();
    } catch (err) {
      console.error(err);
      hideLoader();
      toast('Error al unirse.', 'error');
    }
  });
}

// ── Flujo de empresa (primer login) ───────────────────────
function mostrarFlujoEmpresa(user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('topbar').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');

  const screen = document.getElementById('empresa-screen');
  screen.classList.remove('hidden');

  // Limpiar listeners previos clonando los botones
  ['btn-crear-empresa','btn-unirse-empresa'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.replaceWith(btn.cloneNode(true));
  });

  document.getElementById('btn-crear-empresa').addEventListener('click', async () => {
    const nombre = document.getElementById('inp-nombre-empresa').value.trim();
    if (!nombre) { toast('Ingresa el nombre de tu local.', 'error'); return; }
    showLoader();
    try {
      const empresa = await crearEmpresa(nombre, user.uid, user.email, user.displayName || '');
      empresaCodigo = empresa.codigo;
      await cargarSubcategorias(empresaCodigo);
      screen.classList.add('hidden');
      await iniciarApp();
    } catch (err) {
      console.error(err);
      hideLoader();
      toast('Error al crear el local.', 'error');
    }
  });

  document.getElementById('btn-unirse-empresa').addEventListener('click', async () => {
    const codigo = document.getElementById('inp-codigo-empresa').value.trim();
    if (!codigo) { toast('Ingresa el código del local.', 'error'); return; }
    showLoader();
    try {
      const empresa = await unirseAEmpresa(codigo, user.uid, user.email, user.displayName || '');
      if (!empresa) { hideLoader(); return; }
      empresaCodigo = empresa.codigo;
      await cargarSubcategorias(empresa.codigo);
      screen.classList.add('hidden');
      await iniciarApp();
    } catch (err) {
      console.error(err);
      hideLoader();
      toast('Error al unirse al local.', 'error');
    }
  });
}

// ── Bind login ─────────────────────────────────────────────
function bindLogin() {
  document.getElementById('btn-google-login')?.addEventListener('click', loginConGoogle);
}
