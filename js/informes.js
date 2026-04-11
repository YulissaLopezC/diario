// js/informes.js
// Informes con rango de fechas libre, filtro subcategoría y libro fiscal

import { getMovimientosRango } from './movimientos.js';
import { formatCOP, toSentenceCase, hoyISO, isoADisplay, toast } from './ui.js';
import { empresaActual } from './empresa.js';
import { getSubcategorias } from './subcategorias.js';

// ── Inicializar pantalla ───────────────────────────────────
export async function initInformes(empresaCodigo) {
  const hoy  = hoyISO();
  // Por defecto: primer día del mes actual hasta hoy
  const primerDia = hoy.slice(0, 7) + '-01';

  const elDesde = document.getElementById('inf-fecha-desde');
  const elHasta = document.getElementById('inf-fecha-hasta');
  if (elDesde && !elDesde.value) elDesde.value = primerDia;
  if (elHasta && !elHasta.value) elHasta.value = hoy;

  bindFiltroSubcat();
  bindEventos(empresaCodigo);
}

// ── Sincronizar subcategorías con la categoría seleccionada ─
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

// ── Bind eventos botones ───────────────────────────────────
function bindEventos(empresaCodigo) {
  // Limpiar listeners previos
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

// ── Obtener filtros actuales ───────────────────────────────
function getFiltros() {
  return {
    desde:    document.getElementById('inf-fecha-desde')?.value || '',
    hasta:    document.getElementById('inf-fecha-hasta')?.value || '',
    categoria: document.getElementById('inf-cat')?.value || 'todas',
    subcat:   document.getElementById('inf-subcat')?.value || 'todas',
  };
}

// ── Convertir fechas ISO a claves de mes para la query ─────
function fechasAClaves(desde, hasta) {
  // claveMes formato "YYYY-MM"
  const claveDesde = desde.slice(0, 7);
  const claveHasta = hasta.slice(0, 7);
  return { claveDesde, claveHasta };
}

// ── Filtrar movimientos por rango y filtros ────────────────
async function getMovsFiltrados(empresaCodigo) {
  const { desde, hasta, categoria, subcat } = getFiltros();
  if (!desde || !hasta) return [];

  const { claveDesde, claveHasta } = fechasAClaves(desde, hasta);
  let movs = await getMovimientosRango(empresaCodigo, claveDesde, claveHasta);

  // Filtrar por rango de fechas exacto (día a día)
  movs = movs.filter(m => {
    const parts = m.fecha.split('/');
    if (parts.length !== 3) return false;
    const fechaISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return fechaISO >= desde && fechaISO <= hasta;
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
  let v = 0, g = 0, c = 0;
  movs.forEach(m => {
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  v += m.valor;
    if (cat === 'gasto')  g += m.valor;
    if (cat === 'compra') c += m.valor;
  });
  const balance  = v - g - c;
  const balColor = balance >= 0 ? 'var(--green)' : 'var(--red)';

  const set = (id, val, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent  = val;
    if (color) el.style.color = color;
  };

  set('inf-total-ventas',  formatCOP(v), 'var(--green)');
  set('inf-total-compras', formatCOP(c), 'var(--blue)');
  set('inf-total-gastos',  formatCOP(g), 'var(--red)');
  set('inf-balance',       formatCOP(balance), balColor);

  // Badge período
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
  if (!desde || !hasta) {
    toast('Selecciona un rango de fechas.', 'error'); return;
  }
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

  let totalDebito = 0, totalCredito = 0;
  const filas = movs.map(m => {
    const esCreditoCat = m.categoria === 'VENTA';
    const valor = m.valor || 0;
    if (esCreditoCat) totalCredito += valor;
    else              totalDebito  += valor;

    const debito  = esCreditoCat ? '—' : `<span class="amount gasto">${formatCOP(valor)}</span>`;
    const credito = esCreditoCat ? `<span class="amount venta">${formatCOP(valor)}</span>` : '—';

    return `<tr>
      <td>${m.fecha}</td>
      <td><span class="badge badge-${m.categoria.toLowerCase()}">${toSentenceCase(m.categoria)}</span></td>
      <td>${m.subcategoria ? toSentenceCase(m.subcategoria) : '<span style="color:var(--text-3)">—</span>'}</td>
      <td>${m.proveedor ? toSentenceCase(m.proveedor) : '<span style="color:var(--text-3)">—</span>'}</td>
      <td><span class="cuenta-tag">${toSentenceCase(m.cuenta || 'EFECTIVO')}</span></td>
      <td style="font-family:var(--font-mono);font-size:12px">${m.factura || '—'}</td>
      <td style="text-align:right">${debito}</td>
      <td style="text-align:right">${credito}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Categoría</th><th>Subcategoría</th><th>Proveedor</th>
            <th>Cuenta</th><th>N° Factura</th>
            <th style="text-align:right">Débito</th>
            <th style="text-align:right">Crédito</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="table-footer" style="margin-top:10px">
        <span style="color:var(--red)">Débito: ${formatCOP(totalDebito)}</span>
        <span style="color:var(--green)">Crédito: ${formatCOP(totalCredito)}</span>
      </div>
    </div>`;
}

// ── Libro Fiscal — agrupar por día ─────────────────────────
async function cargarLibroFiscal(empresaCodigo) {
  // El libro fiscal solo usa rango de fechas, ignora filtros de categoría
  const { desde, hasta } = getFiltros();
  if (!desde || !hasta) {
    toast('Selecciona un rango de fechas.', 'error'); return;
  }

  const { claveDesde, claveHasta } = fechasAClaves(desde, hasta);
  let movs = await getMovimientosRango(empresaCodigo, claveDesde, claveHasta);

  // Filtrar por rango exacto y excluir movimientos bancarios
  movs = movs.filter(m => {
    const parts = m.fecha.split('/');
    if (parts.length !== 3) return false;
    const fechaISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return fechaISO >= desde && fechaISO <= hasta && m.categoria !== 'MOVIMIENTO';
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
    // Ordenar fechas DD/MM/YYYY
    const toISO = f => { const p = f.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; };
    return toISO(a).localeCompare(toISO(b));
  });

  let totVenta = 0, totCompra = 0, totGasto = 0;

  const filas = diasOrdenados.map(fecha => {
    const { venta, compra, gasto } = agrupado[fecha];
    totVenta  += venta;
    totCompra += compra;
    totGasto  += gasto;
    const balance = venta - compra - gasto;

    return `<tr>
      <td><strong>${fecha}</strong></td>
      <td class="amount venta">${venta  > 0 ? formatCOP(venta)  : '—'}</td>
      <td class="amount compra">${compra > 0 ? formatCOP(compra) : '—'}</td>
      <td class="amount gasto">${gasto  > 0 ? formatCOP(gasto)  : '—'}</td>
      <td class="amount" style="color:${balance >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${formatCOP(balance)}</td>
    </tr>`;
  }).join('');

  const balTotal = totVenta - totCompra - totGasto;

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th style="text-align:right">Ventas</th>
            <th style="text-align:right">Compras</th>
            <th style="text-align:right">Gastos</th>
            <th style="text-align:right">Balance</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="table-footer" style="margin-top:10px">
        <span style="color:var(--green)">Ventas: ${formatCOP(totVenta)}</span>
        <span style="color:var(--blue)">Compras: ${formatCOP(totCompra)}</span>
        <span style="color:var(--red)">Gastos: ${formatCOP(totGasto)}</span>
        <span style="color:${balTotal >= 0 ? 'var(--green)' : 'var(--red)'}">Balance: ${formatCOP(balTotal)}</span>
      </div>
    </div>`;
}

function agruparPorDia(movs) {
  return movs.reduce((acc, m) => {
    const fecha = m.fecha;
    if (!acc[fecha]) acc[fecha] = { venta: 0, compra: 0, gasto: 0 };
    const cat = (m.categoria || '').toLowerCase();
    if (cat === 'venta')  acc[fecha].venta  += m.valor;
    if (cat === 'compra') acc[fecha].compra += m.valor;
    if (cat === 'gasto')  acc[fecha].gasto  += m.valor;
    return acc;
  }, {});
}

// ── Exportar CSV general ───────────────────────────────────
async function exportarCSV(empresaCodigo) {
  const movs = await getMovsFiltrados(empresaCodigo);
  if (!movs.length) { toast('No hay datos para exportar.', 'error'); return; }

  const cabecera = ['Fecha','Categoria','Subcategoria','Cuenta','Valor','Proveedor','Factura'];
  const filas = movs.map(m => [
    m.fecha,
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

  descargar(csv, 'text/csv', nombreArchivo('csv'));
}

// ── Exportar Excel general ─────────────────────────────────
async function exportarExcel(empresaCodigo) {
  const movs = await getMovsFiltrados(empresaCodigo);
  if (!movs.length) { toast('No hay datos para exportar.', 'error'); return; }

  const bom = '\uFEFF';
  const cabecera = ['Fecha','Categoria','Subcategoria','Cuenta','Valor','Proveedor','Factura'];
  const filas = movs.map(m => [
    m.fecha,
    toSentenceCase(m.categoria),
    toSentenceCase(m.subcategoria || ''),
    toSentenceCase(m.cuenta || 'EFECTIVO'),
    m.valor,
    m.proveedor ? toSentenceCase(m.proveedor) : '',
    m.factura || ''
  ]);

  const csv = bom + [cabecera, ...filas].map(row => row.join(';')).join('\n');
  descargar(csv, 'text/csv;charset=utf-8', nombreArchivo('excel.csv'));
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
    const fechaISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return fechaISO >= desde && fechaISO <= hasta && m.categoria !== 'MOVIMIENTO';
  });

  if (!movs.length) { toast('No hay datos para exportar.', 'error'); return; }

  const agrupado = agruparPorDia(movs);
  const diasOrdenados = Object.keys(agrupado).sort((a, b) => {
    const toISO = f => { const p = f.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; };
    return toISO(a).localeCompare(toISO(b));
  });

  let totV = 0, totC = 0, totG = 0;
  diasOrdenados.forEach(fecha => {
    totV += agrupado[fecha].venta;
    totC += agrupado[fecha].compra;
    totG += agrupado[fecha].gasto;
  });

  const bom = '\uFEFF';

  // Cabecera
  const lineas = ['Fecha;Ventas;Compras;Gastos;Balance'];

  // Filas por día
  diasOrdenados.forEach(fecha => {
    const { venta, compra, gasto } = agrupado[fecha];
    const balance = venta - compra - gasto;
    lineas.push([
      fecha,
      venta   > 0 ? venta   : 0,
      compra  > 0 ? compra  : 0,
      gasto   > 0 ? gasto   : 0,
      balance
    ].join(';'));
  });

  // Fila de totales
  lineas.push(['TOTAL', totV, totC, totG, totV - totC - totG].join(';'));

  // Línea en blanco + resumen
  lineas.push('');
  lineas.push(`Período;${isoADisplay(desde)} al ${isoADisplay(hasta)}`);
  lineas.push(`Total ventas;${totV}`);
  lineas.push(`Total compras;${totC}`);
  lineas.push(`Total gastos;${totG}`);
  lineas.push(`Balance neto;${totV - totC - totG}`);

  const csv = bom + lineas.join('\n');
  descargar(csv, 'text/csv;charset=utf-8', nombreArchivo('libro_fiscal.csv'));
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

function nombreArchivo(ext) {
  const { desde, hasta } = getFiltros();
  const empresa = empresaActual?.nombre?.slice(0, 10).replace(/\s/g, '_') || 'empresa';
  return `DiarIO_${empresa}_${desde}_${hasta}.${ext}`;
}
