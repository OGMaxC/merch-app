/* js/pages/inventory.js */

registerPage('inventory', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Lager</div></div>
      <div style="display:flex;gap:8px">
        <select id="inv-filter-cat" class="btn btn-ghost btn-sm" style="padding:5px 10px">
          <option value="">Alla kategorier</option>
          <option value="clothing">Kläder</option>
          <option value="records">Skivor</option>
          <option value="other">Övrigt</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="openAddItem()">+ Lägg till artikel</button>
      </div>
    </div>
    <div id="inv-content"></div>
  `;

  document.getElementById('inv-filter-cat').addEventListener('change', () => renderLager());
  await renderLager();
});

async function renderLager() {
  const cat = document.getElementById('inv-filter-cat')?.value || '';
  const el  = document.getElementById('inv-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Laddar…</div>';

  try {
    let items = await fsGetAll('merch_items');

    // ── Behöver beställas ──────────────────────────────────────────────────
    // Build shortage list from all upcoming shows
    const allShows  = await fsGetAll('merch_shows');
    const upcoming  = allShows.filter(s => s.status === 'upcoming');
    const totalPack = {}; // itemId -> { color -> { sz -> qty } } or { '_' -> qty }

    for (const show of upcoming) {
      for (const p of (show.pack || [])) {
        if (!totalPack[p.itemId]) totalPack[p.itemId] = {};
        if (p.variants && Object.keys(p.variants).length) {
          for (const [color, sizes] of Object.entries(p.variants)) {
            if (!totalPack[p.itemId][color]) totalPack[p.itemId][color] = {};
            for (const [sz, qty] of Object.entries(sizes)) {
              totalPack[p.itemId][color][sz] = (totalPack[p.itemId][color][sz] || 0) + qty;
            }
          }
        } else {
          totalPack[p.itemId]['_'] = (totalPack[p.itemId]['_'] || 0) + (p.qty || 0);
        }
      }
    }

    const shortages = [];
    for (const item of items) {
      const pack = totalPack[item.id];
      if (!pack) continue;
      if (item.category === 'clothing') {
        for (const [color, sizes] of Object.entries(pack)) {
          for (const [sz, packedQty] of Object.entries(sizes)) {
            const inStock  = item.variants?.[color]?.[sz]?.stock || 0;
            const shortage = packedQty - inStock;
            if (shortage > 0) shortages.push({ name: item.name, color, sz, inStock, packedQty, shortage });
          }
        }
      } else {
        const packedQty = pack['_'] || 0;
        const inStock   = item.variants?.['_']?.stock || 0;
        const shortage  = packedQty - inStock;
        if (shortage > 0) shortages.push({ name: item.name, color: null, sz: null, inStock, packedQty, shortage });
      }
    }

    const shortageHTML = shortages.length ? `
      <div class="section" style="margin-bottom:24px">
        <div class="section-header">
          <div class="section-title" style="color:var(--red)">⚠ Behöver beställas</div>
          <div style="font-size:12px;color:var(--text3)">${shortages.length} variant${shortages.length > 1 ? 'er' : ''} underpackad${shortages.length > 1 ? 'e' : ''}</div>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Artikel</th><th>Variant</th>
              <th style="text-align:center">I lager</th>
              <th style="text-align:center">Packat totalt</th>
              <th style="text-align:center;color:var(--red)">Saknas</th>
            </tr></thead>
            <tbody>
              ${shortages.map(s => `<tr>
                <td style="font-weight:500">${s.name}</td>
                <td style="color:var(--text2);font-size:12px">${s.color ? `${s.color} / ${s.sz}` : '—'}</td>
                <td style="text-align:center;color:var(--text2)">${s.inStock}</td>
                <td style="text-align:center;color:var(--amber)">${s.packedQty}</td>
                <td style="text-align:center;color:var(--red);font-weight:600">+${s.shortage}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </div>` : '';

    if (shortageHTML && !cat) {
      el.innerHTML = shortageHTML;
    } else {
      el.innerHTML = '';
    }
    // ── end shortage section ───────────────────────────────────────────────
    if (cat) items = items.filter(i => i.category === cat);
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (!items.length) {
      el.innerHTML = shortageHTML + emptyState('📦', 'Inga artiklar ännu.', '<button class="btn btn-primary" onclick="openAddItem()" style="margin-top:12px">Lägg till din första artikel</button>');
      return;
    }

    el.innerHTML = `<div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th style="width:35%">Artikel</th>
        <th>Kategori</th>
        <th>Färger</th>
        <th style="text-align:center">Lager</th>
        <th style="text-align:right">Kostnad</th>
        <th style="text-align:right">Pris</th>
        <th style="text-align:right">Marginal</th>
        <th></th>
      </tr></thead>
      <tbody id="inv-tbody"></tbody>
    </table></div></div>`;

    document.getElementById('inv-tbody').innerHTML = items.map(item => {
      const margin   = (item.salePrice || 0) - (item.costPerUnit || 0);
      const marginPct = item.costPerUnit ? Math.round(margin / item.salePrice * 100) : 0;
      const stock    = item.totalStock || 0;
      const colors   = (item.colors || []).map(c => colorDot(c)).join('');
      return `<tr class="clickable" onclick="openItemDetail('${item.id}')">
        <td>
          <div style="font-weight:500">${item.name}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${item.description||''}</div>
        </td>
        <td>${catBadge(item.category)}</td>
        <td>${colors || '<span style="color:var(--text3)">—</span>'}</td>
        <td style="text-align:center">
          <span class="${stockClass(stock)}">${fmtNum(stock)}</span>
        </td>
        <td style="text-align:right;color:var(--text2)">${fmt(item.costPerUnit||0)}</td>
        <td style="text-align:right;color:var(--gold)">${fmt(item.salePrice||0)}</td>
        <td style="text-align:right;color:${margin>0?'var(--green)':'var(--red)'}">
          ${fmt(margin)} <span style="font-size:10px;color:var(--text3)">${marginPct}%</span>
        </td>
        <td>
          <div style="display:flex;gap:6px;justify-content:flex-end" onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-sm" onclick="openRedigeraItem('${item.id}')">Redigera</button>
            <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}','${item.name}')">Ta bort</button>
          </div>
        </td>
      </tr>`;
    }).join('');

  } catch (err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Fel: ${err.message}</div>`;
  }
}

/* ── ARTIKEL DETAIL (sizes/colours breakdown) ── */
async function openItemDetail(id) {
  const item = await fsGet('merch_items', id);
  if (!item) return;

  const variants = item.variants || {};
  const colors   = item.colors || [];
  const hasSizes = item.category === 'clothing';

  let varHTML = '';
  if (hasSizes && colors.length) {
    varHTML = colors.map(color => {
      const rows = ALL_SIZES.map(sz => {
        const v   = (variants[color] || {})[sz] || { stock: 0 };
        const rem = v.stock || 0;
        return `<tr>
          <td style="color:var(--text2)">${sz}</td>
          <td><span class="${stockClass(rem)}">${rem}</span></td>
          <td style="color:var(--text2)">${v.sålda || 0}</td>
        </tr>`;
      }).join('');
      return `<div style="margin-bottom:16px">
        <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          ${colorDot(color)} ${color}
        </div>
        <table style="width:200px">
          <thead><tr><th>Storlek</th><th>Lager</th><th>Sålda</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');
  } else {
    const v   = variants['_'] || { stock: 0, sålda: 0 };
    varHTML   = `<div style="font-size:13px">Stock: <strong>${v.stock || 0}</strong> &nbsp; Sålda: <strong>${v.sålda || 0}</strong></div>`;
  }

  openModal(item.name,
    `<div style="display:grid;gap:16px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="stat-card"><div class="stat-label">Stock</div><div class="stat-value">${item.totalStock||0}</div></div>
        <div class="stat-card"><div class="stat-label">Cost / unit</div><div class="stat-value">${fmt(item.costPerUnit||0)}</div></div>
        <div class="stat-card"><div class="stat-label">Sale price</div><div class="stat-value gold">${fmt(item.salePrice||0)}</div></div>
      </div>
      <div>${varHTML}</div>
      ${item.notes ? `<div style="font-size:12px;color:var(--text2);border-top:1px solid var(--border);padding-top:12px">${item.notes}</div>` : ''}
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Stäng</button>
     <button class="btn btn-primary" onclick="closeModal();openRedigeraItem('${id}')">Redigera</button>`
  );
}

/* ── ADD ARTIKEL MODAL ── */
function openAddItem() {
  openModal('Lägg till artikel', buildItemForm(null),
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveItem(null)">Lägg till artikel</button>`
  );
  setupItemFormListeners();
}

async function openRedigeraItem(id) {
  const item = await fsGet('merch_items', id);
  openModal('Redigera artikel', buildItemForm(item),
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveItem('${id}')">Spara ändringar</button>`
  );
  setupItemFormListeners(item);
}

function buildItemForm(item) {
  const isClothing = !item || item.category === 'clothing';
  return `
    <div class="field">
      <label>Namn</label>
      <input id="f-name" type="text" value="${item?.name||''}"/>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Kategori</label>
        <select id="f-cat">
          <option value="clothing" ${item?.category==='clothing'?'selected':''}>Kläder</option>
          <option value="records"  ${item?.category==='records'?'selected':''}>Skivor</option>
          <option value="other"    ${item?.category==='other'?'selected':''}>Övrigt</option>
        </select>
      </div>
      <div class="field">
        <label>Status</label>
        <select id="f-status">
          <option value="active"   ${(item?.status||'active')==='active'?'selected':''}>Aktiv</option>
          <option value="inactive" ${item?.status==='inactive'?'selected':''}>Inaktiv</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Kostnad per enhet (kr)</label>
        <input id="f-cost" type="number" value="${item?.costPerUnit||''}"/>
      </div>
      <div class="field">
        <label>Försäljningspris (kr)</label>
        <input id="f-price" type="number" value="${item?.salePrice||''}"/>
      </div>
    </div>
    <div class="field" id="f-colors-wrap" style="${!isClothing?'display:none':''}">
      <label>Grundfärger (välj alla som stämmer)</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        ${['black','white','burgundy','forest','navy','grey'].map(c =>
          `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="fc-${c}" value="${c}" ${(item?.colors||[]).includes(c)?'checked':''}/>
            ${colorDot(c)} ${c}
          </label>`
        ).join('')}
      </div>
    </div>
    <div class="field" id="f-stock-wrap" style="${isClothing?'display:none':''}">
      <label>Initialt lagersaldo</label>
      <input id="f-stock" type="number" value="${item?.variants?.['_']?.stock||''}"/>
    </div>
    <div id="f-size-grid" style="${!isClothing?'display:none':''}">
      <!-- populated by JS -->
    </div>
    <div class="field">
      <label>Anteckningar</label>
      <textarea id="f-notes">${item?.notes||''}</textarea>
    </div>
  `;
}

function setupItemFormListeners(item) {
  const catEl = document.getElementById('f-cat');
  if (!catEl) return;
  catEl.addEventListener('change', () => {
    const isC = catEl.value === 'clothing';
    document.getElementById('f-colors-wrap').style.display = isC ? '' : 'none';
    document.getElementById('f-size-grid').style.display   = isC ? '' : 'none';
    document.getElementById('f-stock-wrap').style.display  = isC ? 'none' : '';
    if (isC) buildSizeGrid(item);
  });

  const colorChecks = document.querySelectorAll('[id^="fc-"]');
  colorChecks.forEach(cb => cb.addEventListener('change', () => buildSizeGrid(item)));

  if (catEl.value === 'clothing') buildSizeGrid(item);
}

function buildSizeGrid(item) {
  const colors = [...document.querySelectorAll('[id^="fc-"]:checked')].map(el => el.value);
  const el = document.getElementById('f-size-grid');
  if (!el) return;
  if (!colors.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="field"><label>Lager per storlek</label>
    ${colors.map(color => `
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px;display:flex;align-items:center;gap:5px">
          ${colorDot(color)} ${color}
        </div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">
          ${ALL_SIZES.map(sz => `
            <div>
              <div style="font-size:10px;color:var(--text3);margin-bottom:3px">${sz}</div>
              <input type="number" id="fs-${color}-${sz}" min="0" value="${item?.variants?.[color]?.[sz]?.stock||0}" style="width:100%;padding:5px 6px;font-size:12px;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:4px"/>
            </div>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

async function saveItem(id) {
  const name = document.getElementById('f-name')?.value?.trim();
  if (!name) { showToast('Namn krävs', 'error'); return; }

  const category   = document.getElementById('f-cat').value;
  const status     = document.getElementById('f-status').value;
  const costPerUnit= parseFloat(document.getElementById('f-cost').value) || 0;
  const salePrice  = parseFloat(document.getElementById('f-price').value) || 0;
  const notes      = document.getElementById('f-notes').value.trim();

  let variants = {};
  let totalStock = 0;

  if (category === 'clothing') {
    // Load existing item from Firestore to preserve sålda counts when editing
    const existingItem = id ? await fsGet('merch_items', id) : null;
    const existingVariants = existingItem?.variants || {};

    const colors = [...document.querySelectorAll('[id^="fc-"]:checked')].map(el => el.value);
    for (const color of colors) {
      variants[color] = {};
      for (const sz of ALL_SIZES) {
        const n = parseInt(document.getElementById(`fs-${color}-${sz}`)?.value) || 0;
        const existingSålda = existingVariants?.[color]?.[sz]?.sålda || 0;
        variants[color][sz] = { stock: n, sålda: existingSålda };
        totalStock += n;
      }
    }
  } else {
    const n = parseInt(document.getElementById('f-stock')?.value) || 0;
    const existingItem = id ? await fsGet('merch_items', id) : null;
    const existingSålda = existingItem?.variants?.['_']?.sålda || 0;
    variants['_'] = { stock: n, sålda: existingSålda };
    totalStock = n;
  }

  const colors = category === 'clothing'
    ? [...document.querySelectorAll('[id^="fc-"]:checked')].map(el => el.value)
    : [];

  const data = { name, category, status, costPerUnit, salePrice, notes, variants, colors, totalStock, updatedAt: now() };
  if (!id) data.createdAt = now();

  try {
    if (id) {
      await fsSet('merch_items', id, data);
      showToast('Artikel uppdaterad');
    } else {
      await fsAdd('merch_items', data);
      showToast('Artikel tillagd');
    }
    closeModal();
    await renderLager();
  } catch (err) {
    handleFsError(err, 'Sparningen misslyckades');
  }
}

async function deleteItem(id, name) {
  confirmAction(`Ta bort "${name}"? Det går inte att ångra.`, async () => {
    await fsDelete('merch_items', id);
    showToast('Artikel borttagen');
    await renderLager();
  });
}
