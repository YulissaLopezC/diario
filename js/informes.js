// js/informes.js
// Informes con rango de fechas libre, filtro subcategoría, libro fiscal y columna Tipo

import { getMovimientosRango } from './movimientos.js';
import { formatCOP, toSentenceCase, hoyISO, isoADisplay, toast } from './ui.js';
import { empresaActual } from './empresa.js';
import { getSubcategorias } from './subcategorias.js';

// ── Tipo según categoría ───────────────────────────────────
function getTipo(categoria) {
  const cat = (categoria || '').toUpperCase();
  if (cat === 'VENTA')      return 'Entrada';
  if (cat === 'GASTO')      return 'Salida';
  if (cat === 'COMPRA')     return 'Salida';
  if (cat === 'MOVIMIENTO') return 'Neutro';
  return 'Sin clasificar';
}

function getTipoColor(tipo) {
  if (tipo === 'Entrada') return 'var(--green)';
  if (tipo === 'Salida')  return 'var(--red)';
  return 'var(--text-3)';
}

function getTipoBadgeClass(tipo) {
  if (tipo === 'Entrada') return 'tipo-entrada';
  if (tipo === 'Salida')  return 'tipo-salida';
  return 'tipo-neutro';
}

// ── Inicializar pantalla ───────────────────────────────────
export async function initInformes(empresaCodigo) {
  const hoy       = hoyISO();
  const primerDia = hoy.slice(0, 7) + '-01';

  const elDesde = document.getElementById('inf-fecha-desde');
  const elHasta = document.getElementById('inf-fecha-hasta');
  if (elDesde && !elDesde.value) elDesde.value = primerDia;
  if (elHasta && !elHasta.value) elHasta.value = hoy;

  bindFiltroSubcat();
  bindEventos(empresaCodigo);
}

// ── Subcategorías según categoría seleccionada ─────────────
function bindFiltroSubcat() {
  const selCat = document.getElementById('inf-cat');
  const selSub = document.getElementById('inf-subcat');
  if (!selCat || !selSub) return;

  selCat.addEventListener('change', () => {
    const cat = selCat.value;
    if (cat === 'todas' || cat === 'movimiento') {
      selSub.innerHTML = '<option value="todas">Todas</option>';
      return;
    }
    const subs = getSubcategorias(toSentenceCase(cat));
    selSub.innerHTML = '<option value="todas">Todas</option>' +
      subs.map(s => `<option value="${s.toUpperCase()}">${s}</option>`).join('');
  });
}

// ── Bind eventos ───────────────────────────────────────────
function bindEventos(empresaCodigo) {
  ['inf-btn-previa','inf-btn-csv','inf-btn-excel','inf-btn-libro-previa','inf-btn-libro-excel'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const nuevo = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevo, btn);
  });

  document.getElementById('inf-btn-previa')?.addEventListener('click',       () => cargarVistaGeneral(empresaCodigo));
  document.getElementById('inf-btn-csv')?.addEventListener('click',          () => exportarCSV(empresaCodigo));
  document.getElementById('inf-btn-excel')?.addEventListener('click',        () => exportarExcel(empresaCodigo));
  document.getElementById('inf-btn-libro-previa')?.addEventListener('click', () => cargarLibroFiscal(empresaCodigo));
  document.getElementById('inf-btn-libro-excel')?.addEventListener('click',  () => exportarLibroFiscal(empresaCodigo));
}

// ── Filtros actuales ───────────────────────────────────────
function getFiltros() {
  return {
    desde:     document.getElementById('inf-fecha-desde')?.value || '',
    hasta:     document.getElementById('inf-fecha-hasta')?.value || '',
    categoria: document.getElementById('inf-cat')?.value || 'todas',
    subcat:    document.getElementById('inf-subcat')?.value || 'todas',
  };
}

function fechasAClaves(desde, hasta) {
  return { claveDesde: desde.slice(0, 7), claveHasta: hasta.slice(0, 7) };
}

// ── Filtrar movimientos ────────────────────────────────────
async function getMovsFiltrados(empresaCodigo) {
  const { desde, hasta, categoria, subcat } = getFiltros();
  if (!desde || !hasta) return [];

  const { claveDesde, claveHasta } = fechasAClaves(desde, hasta);
  let movs = await getMovimientosRango(empresaCodigo, claveDesde, claveHasta);

  // Filtro por rango exacto de días
  movs = movs.filter(m => {
    const parts = m.fecha.split('/');
    if (parts.length !== 3) return false;
    const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return iso >= desde && iso <= hasta;
  });

  if (categoria !== 'todas') {
    movs = movs.filter(m => m.categoria === categoria.toUpperCase());
  }
  if (subcat !== 'todas') {
    movs = movs.filter(m => m.subcategoria === subcat.toUpperCase());
  }
  return movs;
}

// ── Actualizar métricas resumen ────────────────────────────
function actualizarMetricas(movs) {
  let entradas = 0, salidas = 0;
  movs.forEach(m => {
    const tipo = getTipo(m.categoria);
    if (tipo === 'Entrada') entradas += m.valor;
    if (tipo === 'Salida')  salidas  += m.valor;
  });
  const balance  = entradas - salidas;
  const balColor = balance >= 0 ? 'var(--green)' : 'var(--red)';

  // Totales por categoría para las cards
  let v = 0, g = 0, c = 0;
  movs.forEach(m => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  v += m.valor;
    if (cat === 'gasto')  g += m.valor;
    if (cat === 'compra') c += m.valor;
  });

  const set = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (color) el.style.color = color;
  };

  set('inf-total-ventas',  formatCOP(v), 'var(--green)');
  set('inf-total-compras', formatCOP(c), 'var(--blue)');
  set('inf-total-gastos',  formatCOP(g), 'var(--red)');
  set('inf-balance',       formatCOP(balance), balColor);

  const { desde, hasta } = getFiltros();
  const badge = document.getElementById('inf-periodo-badge');
  if (badge && desde && hasta) {
    badge.textContent = desde === hasta
      ? isoADisplay(desde)
      : `${isoADisplay(desde)} — ${isoADisplay(hasta)}`;
  }
}

// ── Vista previa general ───────────────────────────────────
async function cargarVistaGeneral(empresaCodigo) {
  const { desde, hasta } = getFiltros();
  if (!desde || !hasta) { toast('Selecciona un rango de fechas.', 'error'); return; }

  const movs = await getMovsFiltrados(empresaCodigo);
  actualizarMetricas(movs);

  const titulo = document.getElementById('inf-tabla-titulo');
  if (titulo) titulo.textContent = 'Movimientos del período';

  const el = document.getElementById('inf-tabla-wrap');
  if (!el) return;

  if (!movs.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-3);padding:16px 0">No hay movimientos para los filtros seleccionados.</p>`;
    return;
  }

  let totalEntradas = 0, totalSalidas = 0;

  const filas = movs.map(m => {
    const tipo    = getTipo(m.categoria);
    const color   = getTipoColor(tipo);
    const badgeCls = getTipoBadgeClass(tipo);
    const valor   = m.valor || 0;
    if (tipo === 'Entrada') totalEntradas += valor;
    if (tipo === 'Salida')  totalSalidas  += valor;

    const cat    = (m.categoria || '').toLowerCase();
    const subcat = m.subcategoria ? toSentenceCase(m.subcategoria) : '<span style="color:var(--text-3)">—</span>';
    const prov   = m.proveedor ? toSentenceCase(m.proveedor) : '<span style="color:var(--text-3)">—</span>';
    const fact   = m.factura || '<span style="color:var(--text-3)">—</span>';

    return `<tr>
      <td>${m.fecha}</td>
      <td><span class="inf-tipo-badge ${badgeCls}">${tipo}</span></td>
      <td><span class="badge badge-${cat}">${toSentenceCase(m.categoria)}</span></td>
      <td>${subcat}</td>
      <td>${prov}</td>
      <td><span class="cuenta-tag">${toSentenceCase(m.cuenta || 'EFECTIVO')}</span></td>
      <td style="font-family:var(--font-mono);font-size:12px">${fact}</td>
      <td class="amount" style="color:${color}">${formatCOP(valor)}</td>
    </tr>`;
  }).join('');

  const balance  = totalEntradas - totalSalidas;
  const balColor = balance >= 0 ? 'var(--green)' : 'var(--red)';

  el.innerHTML = `
    <div class="inf-leyenda">
      <span class="inf-ley-item"><span class="inf-dot dot-entrada"></span>Entrada — ingresa dinero</span>
      <span class="inf-ley-item"><span class="inf-dot dot-salida"></span>Salida — egresa dinero</span>
      <span class="inf-ley-item"><span class="inf-dot dot-neutro"></span>Neutro — transferencia interna</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Subcategoría</th>
            <th>Proveedor</th><th>Cuenta</th><th>N° Factura</th>
            <th style="text-align:right">Valor</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="table-footer" style="margin-top:10px">
      <span style="color:var(--green)">Entradas: ${formatCOP(totalEntradas)}</span>
      <span style="color:var(--red)">Salidas: ${formatCOP(totalSalidas)}</span>
      <span style="color:${balColor}">Balance: ${formatCOP(balance)}</span>
    </div>`;
}

// ── Libro Fiscal — agrupar por día ─────────────────────────
async function cargarLibroFiscal(empresaCodigo) {
  const { desde, hasta } = getFiltros();
  if (!desde || !hasta) { toast('Selecciona un rango de fechas.', 'error'); return; }

  const { claveDesde, claveHasta } = fechasAClaves(desde, hasta);
  let movs = await getMovimientosRango(empresaCodigo, claveDesde, claveHasta);

  movs = movs.filter(m => {
    const parts = m.fecha.split('/');
    if (parts.length !== 3) return false;
    const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return iso >= desde && iso <= hasta && m.categoria !== 'MOVIMIENTO';
  });

  actualizarMetricas(movs);

  const titulo = document.getElementById('inf-tabla-titulo');
  if (titulo) titulo.textContent = 'Libro fiscal — resumen por día';

  const el = document.getElementById('inf-tabla-wrap');
  if (!el) return;

  if (!movs.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-3);padding:16px 0">No hay movimientos para el período seleccionado.</p>`;
    return;
  }

  const agrupado = agruparPorDia(movs);
  const diasOrdenados = Object.keys(agrupado).sort((a, b) => {
    const toISO = f => { const p = f.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; };
    return toISO(a).localeCompare(toISO(b));
  });

  let totV = 0, totC = 0, totG = 0;

  const filas = diasOrdenados.map(fecha => {
    const { venta, compra, gasto } = agrupado[fecha];
    totV += venta; totC += compra; totG += gasto;
    const balance = venta - compra - gasto;
    return `<tr>
      <td><strong>${fecha}</strong></td>
      <td class="amount" style="color:var(--green)">${venta  > 0 ? formatCOP(venta)  : '—'}</td>
      <td class="amount" style="color:var(--blue)">${compra > 0 ? formatCOP(compra) : '—'}</td>
      <td class="amount" style="color:var(--red)">${gasto  > 0 ? formatCOP(gasto)  : '—'}</td>
      <td class="amount" style="color:${balance >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${formatCOP(balance)}</td>
    </tr>`;
  }).join('');

  const balTotal = totV - totC - totG;

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th style="text-align:right">Ventas (Entrada)</th>
            <th style="text-align:right">Compras (Salida)</th>
            <th style="text-align:right">Gastos (Salida)</th>
            <th style="text-align:right">Balance</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="table-footer" style="margin-top:10px">
      <span style="color:var(--green)">Ventas: ${formatCOP(totV)}</span>
      <span style="color:var(--blue)">Compras: ${formatCOP(totC)}</span>
      <span style="color:var(--red)">Gastos: ${formatCOP(totG)}</span>
      <span style="color:${balTotal >= 0 ? 'var(--green)' : 'var(--red)'}">Balance: ${formatCOP(balTotal)}</span>
    </div>`;
}

function agruparPorDia(movs) {
  return movs.reduce((acc, m) => {
    if (!acc[m.fecha]) acc[m.fecha] = { venta: 0, compra: 0, gasto: 0 };
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  acc[m.fecha].venta  += m.valor;
    if (cat === 'compra') acc[m.fecha].compra += m.valor;
    if (cat === 'gasto')  acc[m.fecha].gasto  += m.valor;
    return acc;
  }, {});
}

// ── Exportar CSV general ───────────────────────────────────
async function exportarCSV(empresaCodigo) {
  const movs = await getMovsFiltrados(empresaCodigo);
  if (!movs.length) { toast('No hay datos para exportar.', 'error'); return; }

  const cabecera = ['Fecha','Tipo','Categoria','Subcategoria','Cuenta','Valor','Proveedor','Factura'];
  const filas = movs.map(m => [
    m.fecha,
    getTipo(m.categoria),
    toSentenceCase(m.categoria),
    toSentenceCase(m.subcategoria || ''),
    toSentenceCase(m.cuenta || 'EFECTIVO'),
    m.valor,
    m.proveedor ? toSentenceCase(m.proveedor) : '',
    m.factura || ''
  ]);

  const csv = [cabecera, ...filas]
    .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
    .join('\n');

  descargar(csv, 'text/csv', nombreArchivo('', 'csv'));
}

// ── Exportar Excel general ─────────────────────────────────
async function exportarExcel(empresaCodigo) {
  const movs = await getMovsFiltrados(empresaCodigo);
  if (!movs.length) { toast('No hay datos para exportar.', 'error'); return; }

  const bom = '\uFEFF';
  const cabecera = ['Fecha','Tipo','Categoria','Subcategoria','Cuenta','Valor','Proveedor','Factura'];
  const filas = movs.map(m => [
    m.fecha,
    getTipo(m.categoria),
    toSentenceCase(m.categoria),
    toSentenceCase(m.subcategoria || ''),
    toSentenceCase(m.cuenta || 'EFECTIVO'),
    m.valor,
    m.proveedor ? toSentenceCase(m.proveedor) : '',
    m.factura || ''
  ]);

  const csv = bom + [cabecera, ...filas].map(row => row.join(';')).join('\n');
  descargar(csv, 'text/csv;charset=utf-8', nombreArchivo('', 'csv'));
}

// ── Exportar Libro Fiscal Excel ────────────────────────────
async function exportarLibroFiscal(empresaCodigo) {
  const { desde, hasta } = getFiltros();
  if (!desde || !hasta) { toast('Selecciona un rango de fechas.', 'error'); return; }

  const { claveDesde, claveHasta } = fechasAClaves(desde, hasta);
  let movs = await getMovimientosRango(empresaCodigo, claveDesde, claveHasta);

  movs = movs.filter(m => {
    const parts = m.fecha.split('/');
    if (parts.length !== 3) return false;
    const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return iso >= desde && iso <= hasta && m.categoria !== 'MOVIMIENTO';
  });

  if (!movs.length) { toast('No hay datos para exportar.', 'error'); return; }

  const agrupado = agruparPorDia(movs);
  const diasOrdenados = Object.keys(agrupado).sort((a, b) => {
    const toISO = f => { const p = f.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; };
    return toISO(a).localeCompare(toISO(b));
  });

  let totV = 0, totC = 0, totG = 0;
  const lineas = ['Fecha;Ventas (Entrada);Compras (Salida);Gastos (Salida);Balance'];

  diasOrdenados.forEach(fecha => {
    const { venta, compra, gasto } = agrupado[fecha];
    totV += venta; totC += compra; totG += gasto;
    lineas.push([fecha, venta, compra, gasto, venta - compra - gasto].join(';'));
  });

  lineas.push(['TOTAL', totV, totC, totG, totV - totC - totG].join(';'));
  lineas.push('');
  lineas.push(`Período;${isoADisplay(desde)} al ${isoADisplay(hasta)}`);
  lineas.push(`Total entradas (ventas);${totV}`);
  lineas.push(`Total salidas (compras);${totC}`);
  lineas.push(`Total salidas (gastos);${totG}`);
  lineas.push(`Balance neto;${totV - totC - totG}`);

  const csv = '\uFEFF' + lineas.join('\n');
  descargar(csv, 'text/csv;charset=utf-8', nombreArchivo('libro_fiscal', 'csv'));
}

// ── Helpers ────────────────────────────────────────────────
function descargar(contenido, tipo, nombre) {
  const blob = new Blob([contenido], { type: tipo });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function nombreArchivo(sufijo, ext) {
  const { desde, hasta } = getFiltros();
  const empresa = empresaActual?.nombre?.slice(0, 10).replace(/\s/g, '_') || 'empresa';
  const base    = `DiarIO_${empresa}_${desde}_${hasta}`;
  return sufijo ? `${base}_${sufijo}.${ext}` : `${base}.${ext}`;
}
