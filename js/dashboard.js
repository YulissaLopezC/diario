// js/dashboard.js
// Calcular métricas y renderizar el dashboard con nuevo diseño

import { getTodosMovimientos, getMovimientosDia } from './movimientos.js';
import { formatCOP, labelMes, claveMes, toSentenceCase, hoy, hoyISO, isoADisplay, labelFecha } from './ui.js';

// empresaCodigo guardado para usarlo en el listener del selector de fecha
let _empresaCodigo = '';

export async function renderDashboard(empresaCodigo, nombreEmpresa) {
  _empresaCodigo = empresaCodigo;
  const contenedor = document.getElementById('dashboard-content');
  const todos = await getTodosMovimientos(empresaCodigo);
  const nombre = nombreEmpresa ? toSentenceCase(nombreEmpresa) : 'tu local';

  if (!todos.length) {
    contenedor.innerHTML = `
      <div class="dash-header">
        <div>
          <div class="dash-label">Resumen</div>
          <div class="dash-title">${nombre}</div>
        </div>
      </div>
      <div class="dash-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="3" y="4" width="18" height="16" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="4" x2="9" y2="9"/>
        </svg>
        <p>Aún no hay movimientos registrados.</p>
        <p>Ve a <strong>Registro</strong> para agregar el primero.</p>
      </div>`;
    contenedor.querySelector('strong')?.addEventListener('click', () => window.__navTo?.('registro'));
    return;
  }

  const hoyStr    = new Date();
  const mesAct    = hoyStr.getMonth() + 1;
  const anioAct   = hoyStr.getFullYear();
  const claveAct  = claveMes(mesAct, anioAct);
  const mesPrev   = mesAct === 1 ? 12 : mesAct - 1;
  const anioPrev  = mesAct === 1 ? anioAct - 1 : anioAct;
  const clavePrev = claveMes(mesPrev, anioPrev);

  const porMes        = agruparPorMes(todos);
  const act           = porMes[claveAct]  || [];
  const prev          = porMes[clavePrev] || [];
  const totAct        = totales(act);
  const totPrev       = totales(prev);
  const utilidad      = totAct.venta - totAct.gasto - totAct.compra;
  const mesesOrdenados = Object.keys(porMes).sort().slice(-6);

  contenedor.innerHTML = `
    <div class="dash-header">
      <div>
        <div class="dash-label">Resumen</div>
        <div class="dash-title">${nombre}</div>
      </div>
      <div class="dash-header-actions">
        <button class="dash-btn-outline" id="dash-btn-exportar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar informe
        </button>
        <button class="dash-btn-solid" id="dash-btn-registro">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo registro
        </button>
      </div>
    </div>

    <div class="dash-metrics">
      ${cardMetrica('Ventas del mes',  totAct.venta,  'green', deltaHtml(totAct.venta,  totPrev.venta,  false))}
      ${cardMetrica('Gastos del mes',  totAct.gasto,  'red',   deltaHtml(totAct.gasto,  totPrev.gasto,  true))}
      ${cardMetrica('Compras del mes', totAct.compra, 'blue',  deltaHtml(totAct.compra, totPrev.compra, true))}
      ${cardUtilidad(utilidad)}
    </div>

    <div class="dash-bottom">
      ${chartEvolución(porMes, mesesOrdenados)}
      ${chartCategorias(totAct)}
    </div>

    ${tablaProveedores(act)}

    ${htmlResumenDiario()}

    <div class="dash-quick-links">
      <div class="dash-quick-card" id="ql-informes">
        <div class="dash-quick-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div>
          <div class="dash-quick-title">Informe del mes</div>
          <div class="dash-quick-sub">Descargar CSV o Excel</div>
        </div>
      </div>
      <div class="dash-quick-card" id="ql-registro">
        <div class="dash-quick-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" stroke-width="1.8"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div>
          <div class="dash-quick-title">Nuevo registro</div>
          <div class="dash-quick-sub">Agregar movimiento</div>
        </div>
      </div>
      <div class="dash-quick-card" id="ql-historial">
        <div class="dash-quick-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div>
          <div class="dash-quick-title">Historial</div>
          <div class="dash-quick-sub">Ver meses anteriores</div>
        </div>
      </div>
    </div>
  `;

  // Conectar navegación
  contenedor.querySelector('#dash-btn-exportar')?.addEventListener('click', () => window.__navTo?.('informes'));
  contenedor.querySelector('#dash-btn-registro')?.addEventListener('click', () => window.__navTo?.('registro'));
  contenedor.querySelector('#ql-informes')?.addEventListener('click',  () => window.__navTo?.('informes'));
  contenedor.querySelector('#ql-registro')?.addEventListener('click',  () => window.__navTo?.('registro'));
  contenedor.querySelector('#ql-historial')?.addEventListener('click', () => window.__navTo?.('registro'));

  // Resumen diario: cargar hoy y conectar selector
  await cargarResumenDia(hoy());
  document.getElementById('dash-fecha-dia')?.addEventListener('change', async (e) => {
    if (e.target.value) await cargarResumenDia(isoADisplay(e.target.value));
  });
}

// ── Resumen diario ─────────────────────────────────────────

function htmlResumenDiario() {
  return `
    <div class="dash-card dash-dia-card" style="margin-top:16px">
      <div class="dash-dia-head">
        <div>
          <div class="dash-label">Detalle</div>
          <div class="dash-card-title" style="margin:0">Resumen del día</div>
        </div>
        <input type="date" id="dash-fecha-dia" value="${hoyISO()}" class="dash-dia-input" />
      </div>
      <div id="dash-dia-contenido">
        <div class="dash-dia-loading">Cargando...</div>
      </div>
    </div>`;
}

async function cargarResumenDia(fechaDisplay) {
  const contenido = document.getElementById('dash-dia-contenido');
  if (!contenido) return;
  contenido.innerHTML = `<div class="dash-dia-loading">Cargando...</div>`;

  const movs = await getMovimientosDia(_empresaCodigo, fechaDisplay);

  if (!movs.length) {
    contenido.innerHTML = `
      <div class="dash-dia-empty">
        Sin movimientos el ${labelFecha(fechaDisplay)}.
      </div>`;
    return;
  }

  const tot = totales(movs);
  const balance = tot.venta - tot.gasto - tot.compra;
  const balColor = balance >= 0 ? 'var(--green)' : 'var(--red)';

  // Agrupar por categoría para mostrar detalle
  const porCat = movs.reduce((acc, m) => {
    const cat = m.categoria || 'OTRO';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  const filasCat = Object.entries(porCat).map(([cat, items]) => {
    const total = items.reduce((s, m) => s + m.valor, 0);
    const catLow = cat.toLowerCase();
    const color = catLow === 'venta' ? 'var(--green)' : catLow === 'gasto' ? 'var(--red)' : 'var(--blue)';
    const itemsHtml = items.map(m => `
      <div class="dash-dia-item">
        <span class="dash-dia-item-prov">${m.proveedor ? toSentenceCase(m.proveedor) : '—'}</span>
        <span class="dash-dia-item-val" style="color:${color}">${formatCOP(m.valor)}</span>
      </div>`).join('');
    return `
      <div class="dash-dia-cat">
        <div class="dash-dia-cat-head">
          <span class="badge badge-${catLow}">${toSentenceCase(cat)}</span>
          <span class="dash-dia-cat-total" style="color:${color}">${formatCOP(total)}</span>
        </div>
        <div class="dash-dia-items">${itemsHtml}</div>
      </div>`;
  }).join('');

  contenido.innerHTML = `
    <div class="dash-dia-metrics">
      <div class="dash-dia-metric">
        <div class="dash-dia-metric-label">Ventas</div>
        <div class="dash-dia-metric-val" style="color:var(--green)">${formatCOP(tot.venta)}</div>
      </div>
      <div class="dash-dia-metric">
        <div class="dash-dia-metric-label">Gastos</div>
        <div class="dash-dia-metric-val" style="color:var(--red)">${formatCOP(tot.gasto)}</div>
      </div>
      <div class="dash-dia-metric">
        <div class="dash-dia-metric-label">Compras</div>
        <div class="dash-dia-metric-val" style="color:var(--blue)">${formatCOP(tot.compra)}</div>
      </div>
      <div class="dash-dia-metric dash-dia-metric-balance">
        <div class="dash-dia-metric-label">Balance</div>
        <div class="dash-dia-metric-val" style="color:${balColor}">${formatCOP(balance)}</div>
      </div>
    </div>`;
}

// ── Helpers comunes ────────────────────────────────────────

function agruparPorMes(movs) {
  return movs.reduce((acc, m) => {
    if (!acc[m.claveMes]) acc[m.claveMes] = [];
    acc[m.claveMes].push(m);
    return acc;
  }, {});
}

function totales(movs) {
  return movs.reduce((acc, m) => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  acc.venta  += m.valor;
    if (cat === 'gasto')  acc.gasto  += m.valor;
    if (cat === 'compra') acc.compra += m.valor;
    // 'movimiento' excluido de los totales — no afecta utilidad
    return acc;
  }, { venta: 0, gasto: 0, compra: 0 });
}

function deltaHtml(actual, anterior, invertido) {
  if (!anterior) return '';
  const pct   = Math.round((actual - anterior) / anterior * 100);
  const sube  = actual >= anterior;
  const bueno = invertido ? !sube : sube;
  const cls   = bueno ? 'dash-delta-up' : 'dash-delta-down';
  const signo = sube ? '+' : '';
  return `<span class="${cls}">${signo}${pct}% vs mes anterior</span>`;
}

function cardMetrica(label, valor, color, delta) {
  const barColor = color === 'green' ? 'var(--green)' : color === 'red' ? 'var(--red)' : 'var(--blue)';
  return `
    <div class="dash-metric-card">
      <div class="dash-metric-label">${label}</div>
      <div class="dash-metric-value" style="color:${barColor}">${formatCOP(valor)}</div>
      <div class="dash-metric-delta">${delta}</div>
      <div class="dash-metric-bar"><div class="dash-metric-bar-fill" style="background:${barColor}"></div></div>
    </div>`;
}

function cardUtilidad(utilidad) {
  return `
    <div class="dash-metric-card dash-metric-highlight">
      <div class="dash-metric-label" style="color:rgba(255,255,255,0.65)">Utilidad bruta</div>
      <div class="dash-metric-value" style="color:#fff">${formatCOP(utilidad)}</div>
      <div class="dash-metric-delta" style="color:rgba(255,255,255,0.55)">Ventas − gastos − compras</div>
      <div class="dash-metric-bar"><div class="dash-metric-bar-fill" style="background:rgba(255,255,255,0.3);width:100%"></div></div>
    </div>`;
}

function chartEvolución(porMes, meses) {
  const ventas = meses.map(c => {
    const t = totales(porMes[c] || []);
    return { clave: c, valor: t.venta };
  });
  const max = Math.max(...ventas.map(v => v.valor), 1);
  const bars = ventas.map(({ clave, valor }) => {
    const pct = Math.round((valor / max) * 100);
    const [anio, mes] = clave.split('-');
    const lbl = labelMes(parseInt(mes), parseInt(anio)).slice(0, 3);
    return `
      <div class="dash-spark-col" title="${formatCOP(valor)}">
        <div class="dash-spark-bar" style="height:${Math.max(pct, 3)}%"></div>
        <span class="dash-spark-lbl">${lbl}</span>
      </div>`;
  }).join('');
  return `
    <div class="dash-card">
      <div class="dash-card-title">Evolución de ventas</div>
      <div class="dash-spark-wrap">${bars}</div>
    </div>`;
}

function chartCategorias(tot) {
  const max = Math.max(tot.venta, tot.gasto, tot.compra, 1);
  const fila = (label, valor, color) => `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:12px;color:var(--text-2)">${label}</span>
        <span style="font-size:13px;font-weight:600;font-family:var(--font-mono);color:${color}">${formatCOP(valor)}</span>
      </div>
      <div class="dash-cat-track">
        <div class="dash-cat-fill" style="width:${Math.round(valor/max*100)}%;background:${color}"></div>
      </div>
    </div>`;
  return `
    <div class="dash-card">
      <div class="dash-card-title">Movimientos del mes</div>
      ${fila('Ventas',  tot.venta,  'var(--green)')}
      ${fila('Gastos',  tot.gasto,  'var(--red)')}
      ${fila('Compras', tot.compra, 'var(--blue)')}
    </div>`;
}

function tablaProveedores(movs) {
  const compras = movs.filter(m => m.categoria === 'COMPRA' && m.proveedor);
  const agrup   = compras.reduce((acc, m) => {
    if (!acc[m.proveedor]) acc[m.proveedor] = { total: 0, count: 0 };
    acc[m.proveedor].total += m.valor;
    acc[m.proveedor].count++;
    return acc;
  }, {});
  const sorted = Object.entries(agrup).sort((a,b) => b[1].total - a[1].total).slice(0, 5);
  if (!sorted.length) return '';
  const filas = sorted.map(([prov, { total, count }]) => `
    <tr>
      <td>${toSentenceCase(prov)}</td>
      <td>${count}</td>
      <td class="amount compra">${formatCOP(total)}</td>
    </tr>`).join('');
  return `
    <div class="dash-card" style="margin-top:16px">
      <div class="dash-card-title">Top proveedores — compras del mes</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Proveedor</th><th>Movimientos</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>`;
}
