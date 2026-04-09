// js/informes.js
// Renderizar pantalla de informes y exportar CSV / Excel

import { getMovimientosRango, getMesesConDatos } from './movimientos.js';
import { formatCOP, labelMes, claveMes, toSentenceCase } from './ui.js';
import { empresaActual } from './empresa.js';

// ── Inicializar pantalla de informes ───────────────────────
export async function initInformes(empresaCodigo) {
  const meses = await getMesesConDatos(empresaCodigo);
  llenarSelectoresMes(meses);
  renderVistaPreviaVacia();
  bindEventos(empresaCodigo, meses);
}

// ── Llenar selectores de mes ───────────────────────────────
function llenarSelectoresMes(meses) {
  const selDesde = document.getElementById('inf-mes-desde');
  const selHasta = document.getElementById('inf-mes-hasta');
  if (!selDesde || !selHasta) return;

  const options = meses.map(c => {
    const [anio, mes] = c.split('-');
    return `<option value="${c}">${labelMes(parseInt(mes), parseInt(anio))}</option>`;
  }).join('');

  selDesde.innerHTML = options;
  selHasta.innerHTML = options;
  // Desde = más antiguo, Hasta = más reciente (meses ya está desc)
  selDesde.value = meses[meses.length - 1] || '';
  selHasta.value = meses[0] || '';
}

// ── Bind de eventos ────────────────────────────────────────
// Usamos cloneNode para limpiar listeners previos antes de reasignar
function bindEventos(empresaCodigo, meses) {
  ['inf-btn-previa', 'inf-btn-csv', 'inf-btn-excel'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    // Reemplazar el nodo elimina todos los listeners acumulados
    const nuevo = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevo, btn);
  });

  document.getElementById('inf-btn-previa')?.addEventListener('click', () => cargarPrevia(empresaCodigo));
  document.getElementById('inf-btn-csv')?.addEventListener('click',    () => exportarCSV(empresaCodigo));
  document.getElementById('inf-btn-excel')?.addEventListener('click',  () => exportarExcel(empresaCodigo));
}

// ── Obtener filtros actuales ───────────────────────────────
function getFiltros() {
  return {
    desde:     document.getElementById('inf-mes-desde')?.value || '',
    hasta:     document.getElementById('inf-mes-hasta')?.value || '',
    categoria: document.getElementById('inf-cat')?.value || 'todas',
    subcat:    document.getElementById('inf-subcat')?.value || 'todas'
  };
}

// ── Filtrar movimientos según selección ────────────────────
async function getMovsFiltrados(empresaCodigo) {
  const { desde, hasta, categoria, subcat } = getFiltros();
  if (!desde || !hasta) return [];

  const claveDesde = desde <= hasta ? desde : hasta;
  const claveHasta = desde <= hasta ? hasta : desde;

  let movs = await getMovimientosRango(empresaCodigo, claveDesde, claveHasta);

  if (categoria !== 'todas') {
    movs = movs.filter(m => m.categoria === categoria.toUpperCase());
  }
  if (subcat !== 'todas') {
    movs = movs.filter(m => m.subcategoria === subcat.toUpperCase());
  }
  return movs;
}

// ── Vista previa en pantalla ───────────────────────────────
async function cargarPrevia(empresaCodigo) {
  const movs = await getMovsFiltrados(empresaCodigo);
  renderVistaPrevia(movs);
}

function renderVistaPreviaVacia() {
  const el = document.getElementById('inf-tabla-wrap');
  if (el) el.innerHTML = `<p style="font-size:12px;color:var(--text-3);padding:16px 0">Selecciona un rango y haz clic en <strong>Ver vista previa</strong>.</p>`;
}

function renderVistaPrevia(movs) {
  // Actualizar badge período
  const desde = document.getElementById('inf-mes-desde')?.value;
  const hasta  = document.getElementById('inf-mes-hasta')?.value;
  if (desde && hasta) {
    const [da, dm] = desde.split('-');
    const [ha, hm] = hasta.split('-');
    const badge = document.getElementById('inf-periodo-badge');
    if (badge) {
      badge.textContent = desde === hasta
        ? labelMes(parseInt(dm), parseInt(da))
        : `${labelMes(parseInt(dm),parseInt(da)).slice(0,3)} ${da} — ${labelMes(parseInt(hm),parseInt(ha)).slice(0,3)} ${ha}`;
    }
  }

  const el = document.getElementById('inf-tabla-wrap');
  if (!el) return;

  if (!movs.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-3);padding:16px 0">No hay movimientos para los filtros seleccionados.</p>`;
    ['inf-total-ventas','inf-total-gastos','inf-balance'].forEach(id => {
      const e = document.getElementById(id); if (e) e.textContent = '—';
    });
    return;
  }

  let totalVentas = 0, totalGastos = 0, totalCompras = 0, totalDebito = 0, totalCredito = 0;

  const filas = movs.map(m => {
    const esCreditoCat = m.categoria === 'VENTA';
    const valor = m.valor || 0;
    if (m.categoria === 'VENTA')  totalVentas  += valor;
    if (m.categoria === 'GASTO')  totalGastos  += valor;
    if (m.categoria === 'COMPRA') totalCompras += valor;
    if (esCreditoCat) totalCredito += valor;
    else              totalDebito  += valor;

    const debito  = esCreditoCat ? '—' : `<span class="amount gasto">${formatCOP(valor)}</span>`;
    const credito = esCreditoCat ? `<span class="amount venta">${formatCOP(valor)}</span>` : '—';

    return `<tr>
      <td>${m.fecha}</td>
      <td><span class="badge badge-${m.categoria.toLowerCase()}">${toSentenceCase(m.categoria)}</span></td>
      <td>${m.proveedor ? toSentenceCase(m.proveedor) : '<span style="color:var(--text-3)">—</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${m.factura || '<span style="color:var(--text-3)">—</span>'}</td>
      <td style="text-align:right">${debito}</td>
      <td style="text-align:right">${credito}</td>
    </tr>`;
  }).join('');

  // Actualizar métricas resumen
  const balance = totalVentas - totalGastos - totalCompras;
  const elV = document.getElementById('inf-total-ventas');
  const elG = document.getElementById('inf-total-gastos');
  const elB = document.getElementById('inf-balance');
  if (elV) elV.textContent = formatCOP(totalVentas);
  if (elG) elG.textContent = formatCOP(totalGastos);
  if (elB) { elB.textContent = formatCOP(balance); elB.style.color = balance >= 0 ? 'var(--green)' : 'var(--red)'; }

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Categoría</th><th>Proveedor</th>
            <th>N° Factura</th>
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

// ── Exportar CSV ───────────────────────────────────────────
async function exportarCSV(empresaCodigo) {
  const movs = await getMovsFiltrados(empresaCodigo);
  if (!movs.length) { alert('No hay datos para exportar.'); return; }

  const cabecera = ['Fecha','Categoria','Subcategoria','Valor','Proveedor','Factura'];
  const filas = movs.map(m => [
    m.fecha,
    toSentenceCase(m.categoria),
    toSentenceCase(m.subcategoria),
    m.valor,
    m.proveedor ? toSentenceCase(m.proveedor) : '',
    m.factura || ''
  ]);

  const csv = [cabecera, ...filas]
    .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
    .join('\n');

  descargar(csv, 'text/csv', nombreArchivo('csv'));
}

// ── Exportar Excel (CSV compatible con Excel) ─────────────
async function exportarExcel(empresaCodigo) {
  const movs = await getMovsFiltrados(empresaCodigo);
  if (!movs.length) { alert('No hay datos para exportar.'); return; }

  // BOM para que Excel abra UTF-8 correctamente
  const bom = '\uFEFF';
  const cabecera = ['Fecha','Categoria','Subcategoria','Valor','Proveedor','Factura'];
  const filas = movs.map(m => [
    m.fecha,
    toSentenceCase(m.categoria),
    toSentenceCase(m.subcategoria),
    m.valor,
    m.proveedor ? toSentenceCase(m.proveedor) : '',
    m.factura || ''
  ]);

  const csv = bom + [cabecera, ...filas]
    .map(row => row.join(';'))  // punto y coma para Excel español
    .join('\n');

  descargar(csv, 'text/csv;charset=utf-8', nombreArchivo('excel.csv'));
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
  const empresa = empresaActual?.nombre?.slice(0,10).replace(/\s/g,'_') || 'empresa';
  return `DiarIO_${empresa}_${desde}_${hasta}.${ext}`;
}
