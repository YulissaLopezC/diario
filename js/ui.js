// js/ui.js
// Helpers de interfaz: toasts, modales, navegación, formateo

// ── Formateo ──────────────────────────────────────────────
export function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(value);
}

export function toSentenceCase(str) {
  if (!str) return '';
  const lower = str.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function toUpperStorage(str) {
  return str ? str.trim().toUpperCase() : '';
}

// Devuelve "Abril 2025" dado un Date o {mes:4, anio:2025}
export function labelMes(mes, anio) {
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${nombres[mes - 1]} ${anio}`;
}

// Clave de mes: "2025-04"
export function claveMes(mes, anio) {
  return `${anio}-${String(mes).padStart(2,'0')}`;
}

// Extrae mes y año de una fecha "DD/MM/YYYY"
export function parseFecha(str) {
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  return { dia: d, mes: m, anio: y };
}

// Fecha de hoy en "DD/MM/YYYY"
export function hoy() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth() + 1).padStart(2,'0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ── Toasts ────────────────────────────────────────────────
export function toast(msg, tipo = 'success') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Loader ────────────────────────────────────────────────
export function showLoader()  { document.getElementById('loader').classList.remove('hidden'); }
export function hideLoader()  { document.getElementById('loader').classList.add('hidden'); }

// ── Navegación entre páginas ───────────────────────────────
const PAGES = ['dashboard', 'registro', 'informes'];

export function showPage(name) {
  PAGES.forEach(p => {
    document.getElementById(`page-${p}`)?.classList.toggle('active', p === name);
    document.getElementById(`nav-${p}`)?.classList.toggle('active', p === name);
  });
}

// ── Modal genérico (una sola entrada de texto) ─────────────
export function showModal({ title, description, placeholder, confirmText = 'Confirmar', onConfirm }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <p>${description}</p>
      <input type="text" placeholder="${placeholder}" id="modal-input" />
      <div class="modal-btns">
        <button class="btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn-primary"   id="modal-confirm">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const input   = backdrop.querySelector('#modal-input');
  const confirm = backdrop.querySelector('#modal-confirm');
  const cancel  = backdrop.querySelector('#modal-cancel');

  input.focus();

  const close = () => backdrop.remove();

  cancel.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  confirm.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) { input.focus(); return; }
    onConfirm(val);
    close();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm.click();
    if (e.key === 'Escape') close();
  });
}

// ── Modal de confirmación (sin input) ─────────────────────
export function showConfirm({ title, description, confirmText = 'Confirmar', danger = false, onConfirm }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${title}</h3>
      <p>${description}</p>
      <div class="modal-btns">
        <button class="btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn-primary ${danger ? 'btn-danger' : ''}" id="modal-confirm">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  if (danger) {
    backdrop.querySelector('#modal-confirm').style.background = 'var(--red)';
  }
  const close = () => backdrop.remove();
  backdrop.querySelector('#modal-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#modal-confirm').addEventListener('click', () => { onConfirm(); close(); });
}

// ── Empty state ───────────────────────────────────────────
export function emptyState(mensaje) {
  return `
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="9" y1="4" x2="9" y2="9"/>
      </svg>
      <p>${mensaje}</p>
    </div>`;
}
