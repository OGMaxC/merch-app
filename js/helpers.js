/* js/helpers.js */

/* ── TOAST ── */
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

/* ── MODAL ── */
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML || '';
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-body').innerHTML = '';
  document.getElementById('modal-footer').innerHTML = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── FORMATTING ── */
function fmt(n) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtNum(n) { return Math.round(n).toLocaleString('sv-SE'); }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtShortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

/* ── STOCK STATUS ── */
function stockClass(rem) {
  if (rem === 0) return 'stock-out';
  if (rem <= 3)  return 'stock-low';
  return 'stock-ok';
}

/* ── CATEGORY BADGE ── */
function catBadge(cat) {
  return `<span class="badge badge-${cat||'other'}">${cat||'other'}</span>`;
}

/* ── COLOURS MAP ── */
const COLOR_HEX = {
  black:   '#111111',
  white:   '#EEEEEE',
  burgundy:'#6B1C2A',
  forest:  '#1A3A22',
  navy:    '#1A2240',
  grey:    '#555555',
};
function colorDot(c) {
  const hex = COLOR_HEX[c] || '#888';
  const border = c === 'white' ? 'border:1px solid #555;' : '';
  return `<span class="color-dot" style="background:${hex};${border}"></span>`;
}

/* ── SIZES ── */
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/* ── PERSONS ── */
const PERSONS = ['Max', 'Daniel', 'Victor'];

/* ── EMPTY STATE ── */
function emptyState(icon, msg, action = '') {
  return `<div class="empty-state">
    <div style="font-size:32px;margin-bottom:8px">${icon}</div>
    <p>${msg}</p>
    ${action}
  </div>`;
}

/* ── CONFIRM ── */
function confirmAction(msg, onConfirm) {
  window._confirmCallback = onConfirm;
  openModal('Confirm', `<p style="color:var(--text2);font-size:13px">${msg}</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal();window._confirmCallback()">Confirm</button>`
  );
}
