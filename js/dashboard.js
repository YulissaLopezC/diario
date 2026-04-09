// js/dashboard.js
// Calcular métricas y renderizar el dashboard

import { getTodosMovimientos } from './movimientos.js';
import { formatCOP, labelMes, claveMes, toSentenceCase } from './ui.js';

// ── Renderizar dashboard completo ──────────────────────────
export async function renderDashboard(empresaCodigo) {
  const todos = await getTodosMovimientos(empresaCodigo);
  if (!todos.length) {
    document.getElementById('dashboard-content').innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <rect x="3" y="4" width="18" height="16" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="4" x2="9" y2="9"/>
        </svg>
        <p>Aún no hay movimientos registrados.</p>
        <p style="margin-top:4px">Ve a <strong>Registro</strong> para agregar el primer movimiento.</p>
      </div>`;
    return;
  }

  const hoy   = new Date();
  const mesAct = hoy.getMonth() + 1;
  const anioAct = hoy.getFullYear();
  const claveAct = claveMes(mesAct, anioAct);

  const mesPrev = mesAct === 1 ? 12 : mesAct - 1;
  const anioPrev = mesAct === 1 ? anioAct - 1 : anioAct;
  const clavePrev = claveMes(mesPrev, anioPrev);

  // Agrupar por mes
  const porMes = agruparPorMes(todos);

  const act  = porMes[claveAct]  || [];
  const prev = porMes[clavePrev] || [];

  // Totales mes actual
  const totAct  = totales(act);
  const totPrev = totales(prev);

  // Utilidad bruta
  const utilidad = totAct.venta - totAct.gasto - totAct.compra;

  // Meses con datos ordenados para la gráfica
  const mesesOrdenados = Object.keys(porMes).sort().slice(-6);

  document.getElementById('dashboard-content').innerHTML = `
    <div class="metrics-grid">
      ${metricCard('Ventas del mes', totAct.venta, 'green', delta(totAct.venta, totPrev.venta))}
      ${metricCard('Gastos del mes', totAct.gasto, 'red',   delta(totAct.gasto, totPrev.gasto, true))}
      ${metricCard('Compras del mes', totAct.compra, 'blue', delta(totAct.compra, totPrev.compra, true))}
      ${metricCard('Utilidad bruta', utilidad, utilidad >= 0 ? 'green' : 'red', '')}
    </div>

    <div class="charts-row">
      ${chartEvolución(porMes, mesesOrdenados)}
      ${chartSubcats(act)}
    </div>

    ${tablaProveedores(act)}
  `;
}

// ── Helpers internos ───────────────────────────────────────

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
    return acc;
  }, { venta: 0, gasto: 0, compra: 0 });
}

function delta(actual, anterior, invertido = false) {
  if (!anterior) return '';
  const pct = ((actual - anterior) / anterior * 100).toFixed(0);
  const sube = actual >= anterior;
  const bueno = invertido ? !sube : sube;
  const cls = bueno ? 'delta-up' : 'delta-down';
  const signo = sube ? '+' : '';
  return `<span class="metric-delta ${cls}">${signo}${pct}% vs mes anterior</span>`;
}

function metricCard(label, valor, color, deltaHtml) {
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value ${color}">${formatCOP(valor)}</div>
      ${deltaHtml}
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
      <div class="spark-col" title="${formatCOP(valor)}">
        <div class="spark-bar" style="height:${Math.max(pct, 3)}%;background:var(--green)"></div>
        <span class="spark-lbl">${lbl}</span>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title">Evolución de ventas</div>
      <div class="spark-wrap">${bars}</div>
    </div>`;
}

function chartSubcats(movs) {
  // Top gastos por subcategoría del mes actual
  const gastos = movs.filter(m => m.categoria === 'GASTO');
  const agrup  = gastos.reduce((acc, m) => {
    const k = m.subcategoria || 'SIN SUBCATEGORÍA';
    acc[k] = (acc[k] || 0) + m.valor;
    return acc;
  }, {});
  const sorted = Object.entries(agrup).sort((a,b) => b[1]-a[1]).slice(0,5);
  const max = sorted[0]?.[1] || 1;

  if (!sorted.length) {
    return `<div class="card"><div class="card-title">Gastos por subcategoría</div>
      <p style="font-size:12px;color:var(--text-3);margin-top:8px">Sin gastos este mes.</p></div>`;
  }

  const bars = sorted.map(([sub, val]) => {
    const pct = Math.round((val / max) * 100);
    return `
      <div class="mini-bar-row">
        <span class="mini-bar-label">${toSentenceCase(sub)}</span>
        <div class="mini-bar-track">
          <div class="mini-bar-fill" style="width:${pct}%;background:var(--red)"></div>
        </div>
        <span class="mini-bar-val" style="color:var(--red)">${formatCOP(val)}</span>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-title">Gastos por subcategoría — mes actual</div>
      <div class="mini-bar-wrap">${bars}</div>
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
  const sorted = Object.entries(agrup).sort((a,b) => b[1].total - a[1].total).slice(0,5);

  if (!sorted.length) return '';

  const filas = sorted.map(([prov, { total, count }]) => `
    <tr>
      <td>${toSentenceCase(prov)}</td>
      <td>${count}</td>
      <td class="amount compra">${formatCOP(total)}</td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="card-title">Top proveedores — compras del mes</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Proveedor</th><th>Movimientos</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>`;
}
