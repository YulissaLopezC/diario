// js/router.js
// Orquesta el flujo: login → empresa → app

import { initAuth, loginConGoogle, logout, getInitials } from './auth.js';
import { cargarEmpresasDelUsuario, crearEmpresa, unirseAEmpresa, empresaActual, misEmpresas, setEmpresaActual, exposeAdminTools } from './empresa.js';
import { cargarSubcategorias, getSubcategorias, agregarSubcategoria } from './subcategorias.js';
import { agregarMovimiento, getMovimientosMes, getMesesConDatos, eliminarMovimiento, editarMovimiento, getMovimientosDia } from './movimientos.js';
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
let mesSelIdx     = 0;

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
    if (empresas.length > 1) {
      hideLoader();
      mostrarSelectorEmpresa(empresas, user);
      return;
    }
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

// ── Iniciar la app ─────────────────────────────────────────
async function iniciarApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('app').classList.remove('hidden');
  exposeAdminTools(userActual.uid, userActual.email, userActual.displayName || '');
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
  chip.querySelector('.user-avatar').innerHTML = foto
    ? `<img src="${foto}" alt="foto" />`
    : getInitials(userActual.displayName || userActual.email);
  chip.querySelector('.user-name').textContent =
    (userActual.displayName || userActual.email).split(' ')[0];
}

// ── Menú usuario ───────────────────────────────────────────
function abrirUserMenu(e) {
  e.stopPropagation();

  // Si ya está abierto, cerrarlo
  const existente = document.getElementById('user-menu');
  if (existente) { existente.remove(); return; }

  const empresa     = empresaActual;
  const tieneVarias = misEmpresas.length > 1;

  const otrasEmpresas = misEmpresas
    .filter(em => em.codigo !== empresa?.codigo)
    .map(em => `
      <button class="user-menu-btn" data-codigo="${em.codigo}">
        Cambiar a <strong>${toSentenceCase(em.nombre)}</strong>
      </button>`).join('');

  const menu = document.createElement('div');
  menu.id        = 'user-menu';
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

  // Evitar que clics dentro del menú lo cierren
  menu.addEventListener('click', ev => ev.stopPropagation());

  document.body.appendChild(menu);

  menu.querySelector('#btn-logout').addEventListener('click', () => {
    menu.remove();
    logout();
  });

  menu.querySelector('#btn-unirse-nueva').addEventListener('click', () => {
    menu.remove();
    mostrarModalUnirse();
  });

  menu.querySelectorAll('[data-codigo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const codigo = btn.dataset.codigo;
      menu.remove();
      showLoader();
      setEmpresaActual(codigo);
      empresaCodigo = codigo;
      await cargarSubcategorias(codigo);
      renderTopbar();
      await goToDashboard();
      hideLoader();
      toast(`Cambiado a ${toSentenceCase(empresaActual?.nombre || '')}.`);
    });
  });

  // Cerrar al clic fuera — registrar en el siguiente tick para no capturar el clic actual
  requestAnimationFrame(() => {
    document.addEventListener('click', function cerrar() {
      menu.remove();
      document.removeEventListener('click', cerrar);
    });
  });
}

function mostrarModalUnirse() {
  showModal({
    title: 'Unirme a otro local',
    description: 'Ingresa el código del local:',
    placeholder: 'Ej: CAFET-1234',
    confirmText: 'Unirme',
    onConfirm: async (codigo) => {
      showLoader();
      try {
        const empresa = await unirseAEmpresa(codigo, userActual.uid, userActual.email, userActual.displayName || '');
        if (!empresa) { hideLoader(); return; }
        await cargarSubcategorias(empresa.codigo);
        empresaCodigo = empresa.codigo;
        renderTopbar();
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

// ── Navegación ─────────────────────────────────────────────
function bindNav() {
  document.getElementById('logo-btn').addEventListener('click', goToDashboard);
  document.getElementById('nav-dashboard').addEventListener('click', goToDashboard);
  document.getElementById('nav-registro').addEventListener('click', goToRegistro);
  document.getElementById('nav-informes').addEventListener('click', goToInformes);

  // Chip: registrar una sola vez con data-bound
  const chip = document.getElementById('user-chip');
  if (chip && !chip.dataset.bound) {
    chip.addEventListener('click', abrirUserMenu);
    chip.dataset.bound = 'true';
  }

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

// ── Banner resumen del día ─────────────────────────────────
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
    // movimiento excluido intencionalmente
  });
  const balance  = v - g - c;
  const balColor = balance >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('rd-ventas').textContent  = formatCOP(v);
  document.getElementById('rd-gastos').textContent  = formatCOP(g);
  document.getElementById('rd-compras').textContent = formatCOP(c);
  const elB = document.getElementById('rd-balance');
  elB.textContent = formatCOP(balance);
  elB.style.color = balColor;
  banner.style.display = 'flex';
}

// ── Pantalla de Registro ───────────────────────────────────
async function initRegistro() {
  const inpFecha = document.getElementById('inp-fecha');
  inpFecha.value = hoyISO();

  // Limpiar listeners acumulados reemplazando los nodos
  const inpValor   = reemplazar('inp-valor');
  const inpFactura = reemplazar('inp-factura');
  const btnAgregar = reemplazar('btn-agregar');
  const selCat     = reemplazar('inp-categoria');
  const selSub     = reemplazar('inp-subcategoria');

  // Cargar subcategorías según categoría inicial
  actualizarSubcats(selCat.value, selSub);

  // Cambiar subcategorías al cambiar categoría
  selCat.addEventListener('change', () => {
    actualizarSubcats(selCat.value, document.getElementById('inp-subcategoria'));
  });

  // Formato de número con puntos
  inpValor.addEventListener('input', () => {
    const raw = inpValor.value.replace(/\./g, '').replace(/[^0-9]/g, '');
    inpValor.value = raw ? parseInt(raw, 10).toLocaleString('es-CO') : '';
  });

  inpValor.addEventListener('keydown',   e => { if (e.key === 'Enter') agregarMovimientoUI(); });
  inpFactura.addEventListener('keydown', e => { if (e.key === 'Enter') agregarMovimientoUI(); });
  btnAgregar.addEventListener('click', agregarMovimientoUI);

  await recargarMeses();
  await actualizarBannerDia();
}

function actualizarSubcats(categoria, selSub) {
  if (!selSub) return;
  const subs = getSubcategorias(categoria);
  selSub.innerHTML =
    '<option value="">— Sin subcategoría —</option>' +
    subs.map(s => `<option value="${s}">${s}</option>`).join('') +
    '<option value="__nueva__">+ Nueva subcategoría...</option>';
}

// Reemplaza un nodo por su clon limpio (sin listeners) y lo devuelve
function reemplazar(id) {
  const el    = document.getElementById(id);
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  return clone;
}

async function agregarMovimientoUI() {
  const fechaISO = document.getElementById('inp-fecha').value;
  const cat      = document.getElementById('inp-categoria').value;
  const selSub   = document.getElementById('inp-subcategoria');
  const sub      = selSub?.value || '';
  const valorRaw = document.getElementById('inp-valor').value.replace(/\./g, '').trim();
  const prov     = document.getElementById('inp-proveedor').value.trim();
  const factura  = document.getElementById('inp-factura').value.trim();

  // Si eligió crear nueva subcategoría, mostrar modal primero
  if (sub === '__nueva__') {
    showModal({
      title: 'Nueva subcategoría',
      description: `Nombre para la subcategoría de "${cat}":`,
      placeholder: 'Ej: Domicilio, Nómina...',
      confirmText: 'Crear',
      onConfirm: async (nombre) => {
        const ok = await agregarSubcategoria(empresaCodigo, cat, nombre);
        if (ok) {
          toast(`Subcategoría "${nombre}" creada.`);
          actualizarSubcats(cat, document.getElementById('inp-subcategoria'));
          document.getElementById('inp-subcategoria').value = nombre;
        } else {
          toast('Esa subcategoría ya existe.', 'info');
          document.getElementById('inp-subcategoria').value = nombre;
        }
      }
    });
    return;
  }

  if (!fechaISO) { toast('Selecciona una fecha.', 'error'); return; }
  if (!valorRaw || isNaN(parseFloat(valorRaw))) {
    toast('Ingresa un valor válido.', 'error'); return;
  }

  const [anio, mes, dia] = fechaISO.split('-');
  const fechaDisplay = `${dia}/${mes}/${anio}`;

  try {
    const mov = await agregarMovimiento(empresaCodigo, userActual.uid, {
      fecha: fechaDisplay, categoria: cat,
      subcategoria: sub === '' ? '' : sub,
      valor: valorRaw, proveedor: prov, factura
    });
    toast('Movimiento guardado.');
    limpiarFormulario();
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
  // Resetear subcategoría al valor vacío
  const selSub = document.getElementById('inp-subcategoria');
  if (selSub) selSub.value = '';
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
  sel.value    = String(mesSelIdx);
  sel.onchange = async () => { mesSelIdx = parseInt(sel.value); await renderTabla(); };
  document.getElementById('btn-mes-prev').onclick = async () => {
    if (mesSelIdx < mesesConDatos.length - 1) { mesSelIdx++; sel.value = String(mesSelIdx); await renderTabla(); }
  };
  document.getElementById('btn-mes-next').onclick = async () => {
    if (mesSelIdx > 0) { mesSelIdx--; sel.value = String(mesSelIdx); await renderTabla(); }
  };
}

const POR_PAGINA = 15;
let pagActual    = 1;
let movsCache    = [];

async function renderTabla(resetPag = true) {
  const wrap = document.getElementById('tabla-movimientos');
  if (!wrap) return;
  if (!mesesConDatos.length) {
    wrap.innerHTML = emptyState('No hay movimientos aún. ¡Registra el primero!');
    document.getElementById('tabla-footer').innerHTML = '';
    return;
  }
  const clave      = mesesConDatos[mesSelIdx];
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
  const inicio  = (pagActual - 1) * POR_PAGINA;
  const pagMovs = movsCache.slice(inicio, inicio + POR_PAGINA);

  let totalVenta = 0, totalGasto = 0, totalCompra = 0;
  movsCache.forEach(m => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  totalVenta  += m.valor;
    if (cat === 'gasto')  totalGasto  += m.valor;
    if (cat === 'compra') totalCompra += m.valor;
    // 'movimiento' se excluye intencionalmente de los totales
  });

  const filas = pagMovs.map(m => {
    const cat     = (m.categoria || '').toLowerCase();
    const prov    = m.proveedor ? toSentenceCase(m.proveedor) : '<span style="color:var(--text-3)">—</span>';
    const factura = m.factura   || '<span style="color:var(--text-3)">—</span>';
    const subcat  = m.subcategoria ? `<span style="font-size:11px;color:var(--text-3)">${toSentenceCase(m.subcategoria)}</span>` : '';
    return `<tr data-id="${m.id}" data-cat="${cat}" data-valor="${m.valor}">
      <td>${m.fecha}</td>
      <td>
        <span class="badge badge-${cat}">${toSentenceCase(m.categoria)}</span>
        ${subcat}
      </td>
      <td>${prov}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${factura}</td>
      <td class="amount ${cat}">${formatCOP(m.valor)}</td>
      <td style="width:56px;text-align:center;display:flex;gap:4px;justify-content:center">
        <button class="btn-edit" title="Editar"  onclick="window.__editMov('${m.id}')">&#9998;</button>
        <button class="btn-del"  title="Eliminar" onclick="window.__delMov('${m.id}')">&#x2715;</button>
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
  window.__delMov  = (id) => confirmarEliminar(id);
  window.__editMov = (id) => abrirModalEdicion(id);
}

function abrirModalEdicion(movId) {
  const mov = movsCache.find(m => m.id === movId);
  if (!mov) return;

  // Convertir fecha DD/MM/YYYY → YYYY-MM-DD para input type=date
  const parts    = mov.fecha.split('/');
  const fechaISO = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';

  // Construir opciones de categoría
  const categorias = ['Venta','Gasto','Compra','Movimiento'];
  const opsCat = categorias.map(c =>
    `<option value="${c}" ${c.toUpperCase() === mov.categoria ? 'selected' : ''}>${c}</option>`
  ).join('');

  // Construir opciones de subcategoría
  const catActual = toSentenceCase(mov.categoria);
  const subs      = getSubcategorias(catActual);
  const opsSub =
    '<option value="">— Sin subcategoría —</option>' +
    subs.map(s => `<option value="${s}" ${s.toUpperCase() === mov.subcategoria ? 'selected' : ''}>${s}</option>`).join('') +
    '<option value="__nueva__">+ Nueva subcategoría...</option>';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:440px">
      <h3>Editar movimiento</h3>
      <p>Modifica los campos y guarda los cambios.</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="field">
          <label>Fecha</label>
          <input type="date" id="edit-fecha" value="${fechaISO}" />
        </div>
        <div class="field">
          <label>Categoría</label>
          <select id="edit-cat">${opsCat}</select>
        </div>
        <div class="field">
          <label>Subcategoría</label>
          <select id="edit-sub">${opsSub}</select>
        </div>
        <div class="field">
          <label>Valor</label>
          <input type="text" id="edit-valor" value="${(mov.valor || 0).toLocaleString('es-CO')}" inputmode="numeric" />
        </div>
        <div class="field">
          <label>Proveedor</label>
          <input type="text" id="edit-prov" value="${mov.proveedor ? toSentenceCase(mov.proveedor) : ''}" placeholder="Opcional" />
        </div>
        <div class="field">
          <label>N° Factura</label>
          <input type="text" id="edit-fact" value="${mov.factura || ''}" placeholder="Opcional" />
        </div>
      </div>

      <div class="modal-btns">
        <button class="btn-secondary" id="edit-cancelar">Cancelar</button>
        <button class="btn-primary"   id="edit-guardar">Guardar cambios</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Actualizar subcategorías al cambiar categoría
  const selCat = backdrop.querySelector('#edit-cat');
  const selSub = backdrop.querySelector('#edit-sub');
  selCat.addEventListener('change', () => actualizarSubcats(selCat.value, selSub));

  // Formato de número
  const inpValor = backdrop.querySelector('#edit-valor');
  inpValor.addEventListener('input', () => {
    const raw = inpValor.value.replace(/\./g, '').replace(/[^0-9]/g, '');
    inpValor.value = raw ? parseInt(raw, 10).toLocaleString('es-CO') : '';
  });

  const close = () => backdrop.remove();
  backdrop.querySelector('#edit-cancelar').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#edit-guardar').addEventListener('click', async () => {
    const fechaISO2 = backdrop.querySelector('#edit-fecha').value;
    if (!fechaISO2) { toast('Selecciona una fecha.', 'error'); return; }

    const [y, mo, d] = fechaISO2.split('-');
    const fechaDisplay = `${d}/${mo}/${y}`;
    const valorRaw = inpValor.value.replace(/\./g, '').trim();

    if (!valorRaw || isNaN(parseFloat(valorRaw))) {
      toast('Ingresa un valor válido.', 'error'); return;
    }

    let subVal = selSub.value;
    if (subVal === '__nueva__') {
      toast('Crea la subcategoría desde el formulario principal.', 'info');
      return;
    }

    try {
      const actualizado = await editarMovimiento(empresaCodigo, movId, {
        fecha:        fechaDisplay,
        categoria:    selCat.value,
        subcategoria: subVal,
        valor:        valorRaw,
        proveedor:    backdrop.querySelector('#edit-prov').value.trim(),
        factura:      backdrop.querySelector('#edit-fact').value.trim(),
      });

      // Actualizar en el cache local
      const idx = movsCache.findIndex(m => m.id === movId);
      if (idx !== -1) movsCache[idx] = actualizado;

      close();
      renderPagina();
      await actualizarBannerDia();
      toast('Movimiento actualizado.');
    } catch (err) {
      console.error(err);
      toast('Error al guardar. Intenta de nuevo.', 'error');
    }
  });
}

function renderFooterTotales(v, g, c) {
  const balance  = v - g - c;
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
        movsCache = movsCache.filter(m => m.id !== movId);
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

function prependarFilaTabla(m) {
  movsCache.unshift(m);
  pagActual = 1;
  renderPagina();
}

// ── Selector de empresa (varias al iniciar) ────────────────
function mostrarSelectorEmpresa(empresas, user) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('topbar').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  const screen = document.getElementById('empresa-screen');
  screen.classList.remove('hidden');
  const card = screen.querySelector('.login-card');
  card.innerHTML = `
    <div class="login-logo">Diar<span>IO</span></div>
    <p class="login-sub" style="margin-bottom:20px">¿A cuál local quieres entrar?</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
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
  card.querySelectorAll('.btn-empresa-sel').forEach(btn => {
    btn.addEventListener('click', async () => {
      showLoader();
      setEmpresaActual(btn.dataset.codigo);
      empresaCodigo = btn.dataset.codigo;
      await cargarSubcategorias(empresaCodigo);
      screen.classList.add('hidden');
      await iniciarApp();
    });
  });
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
  const btn     = document.getElementById('btn-unirse-empresa');
  const btnNuevo = btn.cloneNode(true);
  btn.parentNode.replaceChild(btnNuevo, btn);
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
  document.getElementById('inp-codigo-empresa').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-unirse-empresa').click();
  });
  document.getElementById('btn-logout-empresa')?.addEventListener('click', async () => {
    screen.classList.add('hidden');
    await logout();
  });
}

// ── Bind login ─────────────────────────────────────────────
function bindLogin() {
  document.getElementById('btn-google-login')?.addEventListener('click', loginConGoogle);
}
