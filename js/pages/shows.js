/* js/pages/shows.js */

registerPage('shows', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Spelningar</div></div>
      <button class="btn btn-primary btn-sm" onclick="openAddShow()">+ Lägg till spelning</button>
    </div>
    <div id="shows-content"></div>
  `;
  await renderSpelningar();
});

async function renderSpelningar() {
  const el = document.getElementById('shows-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Loading…</div>';

  try {
    const shows = await fsGetAll('merch_shows');
    shows.sort((a, b) => (b.date||'').localeCompare(a.date||''));

    if (!shows.length) {
      el.innerHTML = emptyState('🎸', 'Inga spelningar ännu.', '<button class="btn btn-primary" onclick="openAddShow()" style="margin-top:12px">Lägg till spelning</button>');
      return;
    }

    const kommande = shows.filter(s => s.status === 'upcoming');
    const done     = shows.filter(s => s.status !== 'upcoming');

    let html = '';
    if (kommande.length) {
      html += `<div class="section"><div class="section-header"><div class="section-title">Kommande</div></div>
        <div class="card">${kommande.map(s => showRow(s)).join('')}</div></div>`;
    }
    if (done.length) {
      html += `<div class="section"><div class="section-header"><div class="section-title">Tidigare spelningar</div></div>
        <div class="card">${done.map(s => showRow(s)).join('')}</div></div>`;
    }
    el.innerHTML = html;

  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Fel: ${err.message}</div>`;
  }
}

function showRow(s) {
  const earned = (s.sales || []).reduce((sum, sale) => sum + (sale.amount || 0), 0);
  return `<div class="card-row clickable" onclick="openShowDetail('${s.id}')">
    <div>
      <div style="font-weight:500">${s.name}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">${fmtDate(s.date)} · ${s.venue||''} · ${s.city||''}</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      ${earned > 0 ? `<span style="color:var(--gold);font-size:13px">${fmt(earned)}</span>` : ''}
      <span class="badge badge-${s.status==='upcoming'?'upcoming':'complete'}">${s.status === 'upcoming' ? 'Kommande' : 'Avslutad'}</span>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openRedigeraShow('${s.id}')">Redigera</button>
    </div>
  </div>`;
}

/* ── ADD / EDIT SHOW ── */
function openAddShow() {
  openModal('Lägg till spelning', buildShowForm(null),
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveShow(null)">Lägg till spelning</button>`
  );
}

async function openRedigeraShow(id) {
  const show = await fsGet('merch_shows', id);
  openModal('Redigera show', buildShowForm(show),
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveShow('${id}')">Save</button>`
  );
}

function buildShowForm(s) {
  return `
    <div class="field"><label>Spelningsnamn</label><input id="sf-name" type="text" value="${s?.name||''}"/></div>
    <div class="field-row">
      <div class="field"><label>Datum</label><input id="sf-date" type="date" value="${s?.date||''}"/></div>
      <div class="field"><label>Status</label>
        <select id="sf-status">
          <option value="upcoming" ${(s?.status||'upcoming')==='upcoming'?'selected':''}>Kommande</option>
          <option value="complete" ${s?.status==='complete'?'selected':''}>Avslutad</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Plats</label><input id="sf-venue" type="text" value="${s?.venue||''}"/></div>
    <div class="field"><label>Stad</label><input id="sf-city" type="text" value="${s?.city||''}"/></div>
    <div class="field"><label>Anteckningar (e.g. support acts)</label><textarea id="sf-notes">${s?.notes||''}</textarea></div>
  `;
}

async function saveShow(id) {
  const name = document.getElementById('sf-name')?.value?.trim();
  if (!name) { showToast('Namn krävs', 'error'); return; }
  const data = {
    name,
    date:   document.getElementById('sf-date').value,
    status: document.getElementById('sf-status').value,
    venue:  document.getElementById('sf-venue').value.trim(),
    city:   document.getElementById('sf-city').value.trim(),
    notes:  document.getElementById('sf-notes').value.trim(),
    updatedAt: now(),
  };
  // Only initialise pack/sales on creation — never overwrite them on edit
  if (!id) {
    data.pack     = [];
    data.sales    = [];
    data.createdAt = now();
  }

  try {
    if (id) {
      await fsSet('merch_shows', id, { ...(await fsGet('merch_shows', id)), ...data });
    } else {
      await fsAdd('merch_shows', data);
    }
    showToast(id ? 'Spelning uppdaterad' : 'Spelning tillagd');
    closeModal();
    await renderSpelningar();
  } catch(err) {
    showToast('Sparningen misslyckades: ' + err.message, 'error');
  }
}

/* ── SHOW DETAIL / TALLY ── */
async function openShowDetail(id) {
  const [show, allItems] = await Promise.all([
    fsGet('merch_shows', id),
    fsGetAll('merch_items'),
  ]);

  window._currentShow = show;
  window._currentItems = allItems;

  // Restore tally from localStorage if available (in-progress show)
  const saved = localStorage.getItem(`tally-${id}`);
  if (saved) {
    window._tallySales = JSON.parse(saved);
  } else {
    // For completed shows (or shows with no localStorage draft),
    // seed tallySales from the reconciled sales lines so remaining
    // quantities reflect actual sold units, not original pack quantities.
    const seededSales = {};
    for (const saleEntry of (show.sales || [])) {
      for (const line of (saleEntry.lines || [])) {
        const key = `${line.itemId}-${line.color}-${line.sz}`;
        if (!seededSales[key]) {
          seededSales[key] = { itemId: line.itemId, color: line.color, sz: line.sz, qty: 0, price: line.price || 0 };
        }
        seededSales[key].qty += line.qty || 0;
      }
    }
    window._tallySales = seededSales;
  }

  const container = document.getElementById('page-content');
  renderShowDetail(show, allItems, container);
  restoreTallyUI();
}

const CATEGORY_ORDER = { clothing: 0, records: 1 };
function categoryRank(item) {
  const cat = (item.category || '').toLowerCase();
  return CATEGORY_ORDER[cat] ?? 2;
}
function sortByCategory(items) {
  return [...items].sort((a, b) => categoryRank(a) - categoryRank(b));
}

function renderShowDetail(show, allItems, container) {
  const pack = show.pack || [];
  const packedItems = sortByCategory(pack.map(p => {
    const item = allItems.find(i => i.id === p.itemId);
    return item ? { ...item, packQty: p.qty, packVariants: p.variants || {} } : null;
  }).filter(Boolean));

  const sales    = show.sales || [];
  const earnedTotal = sales.reduce((s, x) => s + (x.amount || 0), 0);
  const mode     = show.status === 'upcoming' ? 'tally' : 'summary';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">
          <a href="/shows" style="color:var(--gold);cursor:pointer" onclick="navigate('/shows');return false">Spelningar</a>
          &nbsp;/&nbsp; ${show.name}
        </div>
        <div class="page-title">${show.name}</div>
        <div class="page-sub">${fmtDate(show.date)} · ${show.venue||''} · ${show.city||''}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${show.status==='upcoming' ? `<button class="btn btn-ghost btn-sm" onclick="showPrintSheet()">Skriv ut packlista</button>` : ''}
        ${show.status==='complete' ? `<button class="btn btn-danger btn-sm" onclick="confirmResetShowStock('${show.id}')">Återställ lager</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openPackRedigeraor('${show.id}')">Redigera pack</button>
        <button class="btn btn-ghost btn-sm" onclick="navigate('/shows')">Tillbaka</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Packade artiklar</div><div class="stat-value" id="sh-items">${packedItems.length}</div></div>
      <div class="stat-card"><div class="stat-label">Enheter totalt</div><div class="stat-value" id="sh-enheter">${packedItems.reduce((s,i)=>s+(i.packQty||0),0)}</div></div>
      <div class="stat-card"><div class="stat-label">Sålda</div><div class="stat-value green" id="sh-sålda">${sales.reduce((s,x)=>s+(x.qty||0),0)}</div></div>
      <div class="stat-card"><div class="stat-label">Intäkter</div><div class="stat-value gold" id="sh-cash">${fmt(earnedTotal)}</div></div>
    </div>

    ${!packedItems.length ? `
      <div class="card"><div class="card-body">
        ${emptyState('🎒', 'Inga artiklar packade för denna spelning.', `<button class="btn btn-primary" onclick="openPackRedigeraor('${show.id}')" style="margin-top:12px">Bygg pack</button>`)}
      </div></div>` : `
      <div id="tally-blocks">${packedItems.map(item => tallyBlock(item, show)).join('')}</div>
      <div class="card" style="margin-top:16px">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="stat-label">Total kassa</div>
            <div style="font-size:24px;font-weight:500;color:var(--gold)" id="tally-cash-big">${fmt(earnedTotal)}</div>
          </div>
          <div style="text-align:right">
            <div class="stat-label">Potential om slutsålt</div>
            <div style="font-size:14px;color:var(--text2);margin-top:3px">${fmt(packedItems.reduce((s,i)=>s+(i.packQty||0)*(i.salePrice||0),0))}</div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="card-body">
          <div class="field"><label>Anteckningar</label><input type="text" id="show-notes" value="${show.notes||''}" placeholder="Gratisexemplar, noter, övrigt…"/></div>
          <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap">
            <span id="tally-save-indicator" style="font-size:0.7rem;color:var(--text3)">
              ${Object.keys(window._tallySales).length > 0 ? 'Återställd från senaste session' : 'Sparas automatiskt vid varje tryck'}
            </span>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost" onclick="navigate('/shows')">Tillbaka</button>
              <button class="btn btn-primary" onclick="reconcileShow('${show.id}')">Stäng spelning</button>
            </div>
          </div>
        </div>
      </div>
    `}

  `;
}

function tallyBlock(item, show) {
  const isClothing = item.category === 'clothing';
  const colors     = item.colors || [];

  const sizeRows = isClothing
    ? colors.map(color => {
        const varStocks = item.variants?.[color] || {};
        // Show sizes that have stock OR have previously sold units (for reopened shows).
        // originalQty = stock + sålda reconstructs what was in the pack before reconcile.
        return ALL_SIZES.filter(sz => {
          const v = varStocks[sz] || {};
          return (v.stock || 0) + (v.sålda || 0) > 0;
        }).map(sz => {
          const v   = varStocks[sz] || { stock: 0, sålda: 0 };
          const originalQty = (v.stock || 0) + (v.sålda || 0);
          // Use per-variant pack quantity if set, otherwise fall back to originalQty
          const packVariantQty = item.packVariants?.[color]?.[sz];
          const packRem = packVariantQty !== undefined ? packVariantQty : originalQty;
          return `<div class="size-row" id="sr-${item.id}-${color}-${sz}"
            style="display:grid;grid-template-columns:52px 1fr auto;align-items:center;
            background:var(--bg3);border-radius:8px;border:1px solid var(--border);
            min-height:56px;overflow:hidden;${packRem===0?'opacity:0.4':''}">
            <div style="text-align:center;font-size:15px;font-weight:500;color:var(--text2);
              padding:0 6px;border-right:1px solid var(--border);align-self:stretch;
              display:flex;align-items:center;justify-content:center">${sz}</div>
            <div style="padding:10px 14px">
              <div id="rem-${item.id}-${color}-${sz}" style="font-size:20px;font-weight:500;line-height:1"
                class="${stockClass(packRem)}">${packRem}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:2px">i packen</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
              border-left:1px solid var(--border);align-self:stretch">
              <button class="tally-btn" onclick="tallyAdj('${item.id}','${color}','${sz}',-1,'${item.salePrice}')">−</button>
              <span class="tally-num" id="sålda-${item.id}-${color}-${sz}">0</span>
              <button class="tally-btn plus" onclick="tallyAdj('${item.id}','${color}','${sz}',1,'${item.salePrice}')">+</button>
            </div>
          </div>`;
        }).join('');
      }).join('')
    : (() => {
        const packRem = item.packQty || 0;
        return `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;
          background:var(--bg3);border-radius:8px;border:1px solid var(--border);min-height:56px;overflow:hidden">
          <div style="padding:10px 16px">
            <div id="rem-${item.id}-_-_" class="${stockClass(packRem)}" style="font-size:20px;font-weight:500">${packRem}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">i packen</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-left:1px solid var(--border)">
            <button class="tally-btn" onclick="tallyAdj('${item.id}','_','_',-1,'${item.salePrice}')">−</button>
            <span class="tally-num" id="sålda-${item.id}-_-_">0</span>
            <button class="tally-btn plus" onclick="tallyAdj('${item.id}','_','_',1,'${item.salePrice}')">+</button>
          </div>
        </div>`;
      })();

  const itemSålda = Object.values(window._tallySales || {})
    .filter(s => s.itemId === item.id)
    .reduce((sum, s) => sum + s.qty, 0);

  return `<div class="card" style="margin-bottom:10px">
    <div class="card-body" style="cursor:pointer" onclick="toggleTallyBlock('${item.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:500">${item.name}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${item.colors?.join(' / ')||''} · ${fmt(item.salePrice||0)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span id="item-sålda-label-${item.id}" style="font-size:12px;color:${itemSålda>0?'var(--gold)':'var(--text3)'}">
            ${itemSålda > 0 ? `${itemSålda} sålda · ${fmt(itemSålda*(item.salePrice||0))}` : 'ingen försäljning ännu'}
          </span>
          <span id="chevron-${item.id}" style="color:var(--text3);font-size:16px">&#8964;</span>
        </div>
      </div>
    </div>
    <div id="tally-sizes-${item.id}" style="padding:0 12px 12px;display:grid;gap:6px">
      ${sizeRows}
    </div>
  </div>`;
}

/* ── RESTORE TALLY UI AFTER RE-RENDER ── */
function restoreTallyUI() {
  const sales = window._tallySales || {};
  if (!Object.keys(sales).length) return;

  for (const [key, s] of Object.entries(sales)) {
    if (s.qty === 0) continue;

    const item = window._currentItems?.find(i => i.id === s.itemId);
    if (!item) continue;

    // Use pack quantity as the ceiling — NOT current inventory stock.
    // After reconcile, inventory stock has already been decremented, so
    // using it would give wrong (or negative) remainders for sold-out items.
    const packEntry = (window._currentShow?.pack || []).find(p => p.itemId === s.itemId);
    const packMax = (() => {
      if (!packEntry) return s.qty;
      if (s.color === '_') return packEntry.qty ?? s.qty;
      const perVariant = packEntry.variants?.[s.color]?.[s.sz];
      return perVariant !== undefined ? perVariant : (packEntry.qty ?? s.qty);
    })();
    const rem = Math.max(0, packMax - s.qty);

    // Update sold counter
    const såldaEl = document.getElementById(`sålda-${s.itemId}-${s.color}-${s.sz}`);
    if (såldaEl) såldaEl.textContent = s.qty;

    // Update remaining counter
    const remEl = document.getElementById(`rem-${s.itemId}-${s.color}-${s.sz}`);
    if (remEl) { remEl.textContent = rem; remEl.className = stockClass(rem); }

    // Fade out if exhausted
    const rowEl = document.getElementById(`sr-${s.itemId}-${s.color}-${s.sz}`);
    if (rowEl) rowEl.style.opacity = rem === 0 ? '0.4' : '1';
  }

  // Restore item-level sold labels and totals
  const itemTotals = {};
  for (const s of Object.values(sales)) {
    if (!itemTotals[s.itemId]) itemTotals[s.itemId] = { qty: 0, earned: 0 };
    itemTotals[s.itemId].qty    += s.qty;
    itemTotals[s.itemId].earned += s.qty * s.price;
  }
  for (const [itemId, totals] of Object.entries(itemTotals)) {
    const label = document.getElementById(`item-sålda-label-${itemId}`);
    if (label) {
      label.textContent = totals.qty > 0
        ? `${totals.qty} sålda · ${fmt(totals.earned)}`
        : 'ingen försäljning ännu';
      label.style.color = totals.qty > 0 ? 'var(--gold)' : 'var(--text3)';
    }
  }

  // Restore grand totals
  const totalQty    = Object.values(sales).reduce((s, x) => s + x.qty, 0);
  const totalKassa  = Object.values(sales).reduce((s, x) => s + x.qty * x.price, 0);
  const shSålda = document.getElementById('sh-sålda');
  const shKassa = document.getElementById('sh-cash');
  const cashBig = document.getElementById('tally-cash-big');
  if (shSålda) shSålda.textContent  = totalQty;
  if (shKassa) shKassa.textContent  = fmt(totalKassa);
  if (cashBig) cashBig.textContent  = fmt(totalKassa);
}

function toggleTallyBlock(id) {
  const el = document.getElementById(`tally-sizes-${id}`);
  const ch = document.getElementById(`chevron-${id}`);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'grid';
  if (ch) ch.style.transform = isOpen ? 'rotate(-90deg)' : '';
}

function tallyAdj(itemId, color, sz, delta, price) {
  const key   = `${itemId}-${color}-${sz}`;
  const item  = window._currentItems?.find(i => i.id === itemId);
  if (!item) return;

  // Non-clothing items store variants at ['_'] with no size key;
  // clothing stores at [color][sz]. Handle both.
  const v = (color === '_')
    ? (item.variants?.['_'] || { stock: 0, sålda: 0 })
    : ((item.variants?.[color] || {})?.[sz] || { stock: 0, sålda: 0 });
  // originalQty = stock + sålda reconstructs pre-reconcile pack quantity.
  // Using v.stock alone would be 0 for sold-out items after reconcile.
  const originalQty = (v.stock || 0) + (v.sålda || 0);
  const packMax = (() => {
    const show      = window._currentShow;
    const packEntry = (show?.pack || []).find(p => p.itemId === itemId);
    if (!packEntry) return originalQty;
    if (color === '_') return packEntry.qty ?? originalQty;
    // For clothing, use per-variant pack qty if recorded, else fall back
    const perVariant = packEntry.variants?.[color]?.[sz];
    return perVariant !== undefined ? perVariant : originalQty;
  })();
  const max = packMax;

  if (!window._tallySales[key]) window._tallySales[key] = { itemId, color, sz, qty: 0, price: parseFloat(price) || 0 };
  const s     = window._tallySales[key];
  s.qty       = Math.max(0, Math.min(max, s.qty + delta));

  const såldaEl = document.getElementById(`sålda-${itemId}-${color}-${sz}`);
  const remEl  = document.getElementById(`rem-${itemId}-${color}-${sz}`);
  const rowEl  = document.getElementById(`sr-${itemId}-${color}-${sz}`);
  const rem    = max - s.qty;

  if (såldaEl) såldaEl.textContent = s.qty;
  if (remEl)  { remEl.textContent = rem; remEl.className = stockClass(rem); }
  if (rowEl)  rowEl.style.opacity = rem === 0 ? '0.4' : '1';

  const itemSålda = Object.values(window._tallySales).filter(x => x.itemId === itemId).reduce((sum, x) => sum + x.qty, 0);
  const itemEarned = Object.values(window._tallySales).filter(x => x.itemId === itemId).reduce((sum, x) => sum + x.qty * x.price, 0);
  const label = document.getElementById(`item-sålda-label-${itemId}`);
  if (label) {
    label.textContent = itemSålda > 0 ? `${itemSålda} sålda · ${fmt(itemEarned)}` : 'ingen försäljning ännu';
    label.style.color = itemSålda > 0 ? 'var(--gold)' : 'var(--text3)';
  }

  const totalSålda  = Object.values(window._tallySales).reduce((s, x) => s + x.qty, 0);
  const totalKassa  = Object.values(window._tallySales).reduce((s, x) => s + x.qty * x.price, 0);
  const shSålda = document.getElementById('sh-sålda');
  const shKassa = document.getElementById('sh-cash');
  const cashBig = document.getElementById('tally-cash-big');
  if (shSålda)  shSålda.textContent  = totalSålda;
  if (shKassa)  shKassa.textContent  = fmt(totalKassa);
  if (cashBig) cashBig.textContent = fmt(totalKassa);

  tallyLocalSave();
  scheduleFirestoreSave();
}

// ── AUTOSAVE ──────────────────────────────────────────────────
function tallyStorageKey() {
  return window._currentShow ? `tally-${window._currentShow.id}` : null;
}

function tallyLocalSave() {
  const key = tallyStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(window._tallySales));
  const el = document.getElementById('tally-save-indicator');
  if (el) {
    el.textContent = 'Sparat ' + new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.style.color = 'var(--green)';
  }
}

function tallyFirestoreSave() {
  const show = window._currentShow;
  if (!show) return;
  const sales = Object.values(window._tallySales || {}).filter(s => s.qty > 0);
  const total = sales.reduce((sum, s) => sum + s.qty * s.price, 0);
  fsGet('merch_shows', show.id).then(s => {
    if (!s) return;
    fsSet('merch_shows', show.id, {
      ...s,
      draftTally: { sales, total, savedAt: now() }
    });
  }).catch(() => {});
}

let _firestoreSaveTimer = null;
function scheduleFirestoreSave() {
  clearTimeout(_firestoreSaveTimer);
  _firestoreSaveTimer = setTimeout(tallyFirestoreSave, 10000);
}

async function reconcileShow(id) {
  const sales = Object.values(window._tallySales || {}).filter(s => s.qty > 0);
  const total = sales.reduce((sum, s) => sum + s.qty * s.price, 0);
  const notes = document.getElementById('show-notes')?.value || '';
  const isReopened = (window._currentShow?.status === 'complete');

  // Build preview lines
  const previewLines = sales.map(s => {
    const item = window._currentItems?.find(i => i.id === s.itemId);
    const name = item?.name || s.itemId;
    const variant = s.color !== '_' ? ` ${s.color}/${s.sz}` : '';
    return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--bg3)">
      <span style="color:var(--text2)">${name}${variant}</span>
      <span style="color:var(--text)">${s.qty} st &nbsp;·&nbsp; <span style="color:var(--gold)">${fmt(s.qty * s.price)}</span></span>
    </div>`;
  }).join('');

  const noSales = sales.length === 0;
  const description = isReopened
    ? 'Försäljningen uppdateras till nedanstående. Lagret justeras med differensen mot föregående.'
    : 'Följande avdras permanent från lagret och loggas som försäljning.';

  openModal('Stäng spelning — bekräfta',
    `<div style="margin-bottom:12px;font-size:13px;color:var(--text2)">${description}</div>
    ${noSales
      ? `<div style="font-size:13px;color:var(--text3);padding:12px 0">Ingen försäljning registrerad.</div>`
      : `<div style="margin-bottom:12px">${previewLines}</div>
         <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;padding-top:8px">
           <span>Totalt</span>
           <span style="color:var(--gold)">${fmt(total)}</span>
         </div>`}
    ${notes ? `<div style="font-size:11px;color:var(--text3);margin-top:10px">Anteckning: ${notes}</div>` : ''}`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="closeModal();_doReconcile('${id}')">Bekräfta och stäng show</button>`
  );
}

async function _doReconcile(id) {
  const newSales = Object.values(window._tallySales || {}).filter(s => s.qty > 0);
  const newTotal = newSales.reduce((sum, s) => sum + s.qty * s.price, 0);
  const notes = document.getElementById('show-notes')?.value || '';

  try {
    const show = await fsGet('merch_shows', id);

    // Build a map of what was previously recorded across all sale entries.
    // This lets us diff old vs new and only adjust inventory by the delta.
    const prevQtyMap = {};  // key -> qty
    for (const entry of (show.sales || [])) {
      for (const line of (entry.lines || [])) {
        const key = `${line.itemId}-${line.color}-${line.sz}`;
        prevQtyMap[key] = (prevQtyMap[key] || 0) + (line.qty || 0);
      }
    }

    // Build new qty map from current tally
    const newQtyMap = {};
    for (const s of newSales) {
      const key = `${s.itemId}-${s.color}-${s.sz}`;
      newQtyMap[key] = s.qty;
    }

    // Collect all keys that appear in either map
    const allKeys = new Set([...Object.keys(prevQtyMap), ...Object.keys(newQtyMap)]);

    // Replace show.sales with a single canonical entry representing the full tally.
    // We don't append — we replace — so reopening and re-closing stays idempotent.
    const canonicalSales = [{
      date: show.sales?.[0]?.date || now(),
      amount: newTotal,
      qty: newSales.reduce((s, x) => s + x.qty, 0),
      notes,
      lines: newSales.map(s => ({ itemId: s.itemId, color: s.color, sz: s.sz, qty: s.qty, price: s.price }))
    }];

    await fsSet('merch_shows', id, { ...show, status: 'complete', sales: canonicalSales, notes });

    // Apply inventory deltas: only adjust by the difference between old and new qty.
    // Group by itemId so we fetch/write each item once.
    const itemDeltas = {};  // itemId -> { [color-sz]: delta }
    for (const key of allKeys) {
      const [itemId, color, sz] = key.split('-');
      const prev = prevQtyMap[key] || 0;
      const next = newQtyMap[key] || 0;
      const delta = next - prev;  // positive = more sold, negative = fewer sold
      if (delta === 0) continue;
      if (!itemDeltas[itemId]) itemDeltas[itemId] = [];
      itemDeltas[itemId].push({ color, sz, delta });
    }

    for (const [itemId, deltas] of Object.entries(itemDeltas)) {
      const item = window._currentItems?.find(i => i.id === itemId);
      if (!item) continue;
      for (const { color, sz, delta } of deltas) {
        const v = color === '_'
          ? (item.variants?.['_'] || {})
          : ((item.variants?.[color] || {})?.[sz] || {});
        if (!v) continue;
        v.sålda = Math.max(0, (v.sålda || 0) + delta);
        item.totalStock = Math.max(0, (item.totalStock || 0) - delta);
      }
      await fsSet('merch_items', itemId, item);
    }

    // Replace the transaction for this show rather than appending.
    // Find existing sale transaction(s) for this show and delete them first.
    const existingTxns = await fsQuery('merch_transactions', [
      { field: 'type',   value: 'sale' },
      { field: 'showId', value: id },
    ]);
    await Promise.all(existingTxns.map(t => fsDelete('merch_transactions', t.id)));

    if (newTotal > 0) {
      await fsAdd('merch_transactions', {
        type: 'sale', amount: newTotal, date: now(),
        showId: id, showNamn: show.name, notes,
        person: 'Skatbo'
      });
    }

    localStorage.removeItem(tallyStorageKey());
    showToast(`Spelning avslutad — ${fmt(newTotal)} loggad`);
    navigate('/shows');
  } catch(err) {
    showToast('Avslutning misslyckades: ' + err.message, 'error');
  }
}

/* ── RESET SHOW STOCK ── */
function confirmResetShowStock(id) {
  openModal('Återställ lager — bekräfta',
    `<div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:8px">
      Detta återställer lagret för alla artiklar i det här spelningspacket till värdena
      innan spelningen stängdes — som om försäljningen aldrig skett.
     </div>
     <div style="font-size:13px;color:var(--text2);line-height:1.6">
      Spelningens försäljningsdata och transaktioner raderas också.
      Det går inte att ångra.
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-danger" onclick="closeModal();resetShowStock('${id}')">Återställ lager</button>`
  );
}

async function resetShowStock(id) {
  try {
    const show = await fsGet('merch_shows', id);
    if (!show) { showToast('Spelning hittades inte', 'error'); return; }

    // Reverse all sales lines: add qty back to stock, subtract from sålda
    for (const entry of (show.sales || [])) {
      for (const line of (entry.lines || [])) {
        const item = await fsGet('merch_items', line.itemId);
        if (!item) continue;

        const v = (line.color === '_')
          ? (item.variants?.['_'] || {})
          : ((item.variants?.[line.color] || {})?.[line.sz] || {});

        v.sålda      = Math.max(0, (v.sålda || 0) - (line.qty || 0));
        item.totalStock = (item.totalStock || 0) + (line.qty || 0);
        await fsSet('merch_items', line.itemId, item);
      }
    }

    // Clear sales from the show and reset status to upcoming
    await fsSet('merch_shows', id, { ...show, status: 'upcoming', sales: [], draftTally: null });

    // Delete all sale transactions tied to this show
    const existingTxns = await fsQuery('merch_transactions', [
      { field: 'type',   value: 'sale' },
      { field: 'showId', value: id },
    ]);
    await Promise.all(existingTxns.map(t => fsDelete('merch_transactions', t.id)));

    // Clear any localStorage draft
    localStorage.removeItem(`tally-${id}`);

    showToast('Lager återställt');
    navigate('/shows');
  } catch(err) {
    showToast('Återställning misslyckades: ' + err.message, 'error');
  }
}

/* ── PACK EDITOR ── */
async function openPackRedigeraor(showId) {
  const [show, items] = await Promise.all([fsGet('merch_shows', showId), fsGetAll('merch_items')]);
  const active = sortByCategory(items.filter(i => i.status === 'active' && (i.totalStock||0) > 0));
  const pack   = show.pack || [];

  const rows = active.map(item => {
    const packEntry  = pack.find(p => p.itemId === item.id);
    const isClothing = item.category === 'clothing';

    if (isClothing) {
      const colors = item.colors || Object.keys(item.variants || {}).filter(c => c !== '_');
      const colorRows = colors.map(color => {
        const varStocks = item.variants?.[color] || {};
        const activeSizes = ALL_SIZES.filter(sz => (varStocks[sz]?.stock || 0) > 0);
        if (!activeSizes.length) return '';
        const sizeInputs = activeSizes.map(sz => {
          const inStock  = varStocks[sz]?.stock || 0;
          const packQty  = packEntry?.variants?.[color]?.[sz] || 0;
          return `<div style="display:flex;align-items:center;gap:6px;font-size:12px">
            <span style="color:var(--text2);width:28px">${sz}</span>
            <span style="color:var(--text3);font-size:11px;width:60px">${inStock} i lager</span>
            <input type="number" id="pack-${item.id}-${color}-${sz}"
              min="0" max="${inStock}" value="${packQty}" placeholder="0"
              style="width:60px;padding:5px;background:var(--bg2);border:1px solid var(--border);
                     color:var(--text);border-radius:4px;text-align:center;font-size:12px"/>
          </div>`;
        }).join('');
        return `<div style="margin-top:6px;padding:8px;background:var(--bg2);border-radius:4px;border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-weight:500">${color}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${sizeInputs}</div>
        </div>`;
      }).join('');

      return `<div style="padding:10px;background:var(--bg3);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <div style="font-size:13px;font-weight:500">${item.name}</div>
          <div style="font-size:11px;color:var(--text2)">${catBadge(item.category)} ${fmtNum(item.totalStock||0)} i lager</div>
        </div>
        ${colorRows}
      </div>`;
    } else {
      const inStock = item.variants?.['_']?.stock || 0;
      const packQty = packEntry?.qty || 0;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:6px">
        <div>
          <div style="font-size:13px;font-weight:500">${item.name}</div>
          <div style="font-size:11px;color:var(--text2)">${catBadge(item.category)} ${fmtNum(inStock)} i lager</div>
        </div>
        <input type="number" id="pack-${item.id}"
          min="0" max="${inStock}" value="${packQty}" placeholder="0"
          style="width:70px;padding:6px;background:var(--bg2);border:1px solid var(--border);
                 color:var(--text);border-radius:4px;text-align:center"/>
      </div>`;
    }
  }).join('');

  openModal('Bygg spelningspack',
    `<div style="display:grid;gap:10px">${rows}</div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="savePack('${showId}')">Spara pack</button>`
  );
}

async function savePack(showId) {
  const show  = await fsGet('merch_shows', showId);
  const items = await fsGetAll('merch_items');

  const pack = items.map(item => {
    const isClothing = item.category === 'clothing';

    if (isClothing) {
      const colors = item.colors || Object.keys(item.variants || {}).filter(c => c !== '_');
      const variants = {};
      let totalQty = 0;
      for (const color of colors) {
        const varStocks = item.variants?.[color] || {};
        const activeSizes = ALL_SIZES.filter(sz => (varStocks[sz]?.stock || 0) > 0);
        for (const sz of activeSizes) {
          const qty = parseInt(document.getElementById(`pack-${item.id}-${color}-${sz}`)?.value) || 0;
          if (qty > 0) {
            if (!variants[color]) variants[color] = {};
            variants[color][sz] = qty;
            totalQty += qty;
          }
        }
      }
      return totalQty > 0 ? { itemId: item.id, qty: totalQty, variants } : null;
    } else {
      const qty = parseInt(document.getElementById(`pack-${item.id}`)?.value) || 0;
      return qty > 0 ? { itemId: item.id, qty } : null;
    }
  }).filter(Boolean);

  await fsSet('merch_shows', showId, { ...show, pack });
  showToast('Pack sparat');
  closeModal();
  navigate('/shows');
}

/* ── PRINT SHEET ── */
function buildPrintSheet(show, packedItems) {
  const box = '<div style="width:16px;height:16px;border:1px solid #999;border-radius:1px;display:inline-block;margin:2px;vertical-align:middle"></div>';

  const rows = packedItems.map(item => {
    const isClothing = item.category === 'clothing';
    const tdStyle = 'border:1px solid #ccc;padding:8px;vertical-align:top;';
    const thStyle = 'border:1px solid #ccc;padding:6px 8px;background:#f0f0f0;font-size:11px;font-weight:700;';

    if (isClothing) {
      const colors = item.colors || [];
      return colors.map(color => {
        const varStocks = item.variants?.[color] || {};
        const activeSizes = ALL_SIZES.filter(sz => (varStocks[sz]?.stock||0) > 0);
        const sizeHTML = activeSizes.map(sz => {
          const n = varStocks[sz]?.stock || 0;
          return `<div style="display:inline-block;margin-right:10px;margin-bottom:4px;vertical-align:top">
            <div style="font-weight:700;font-size:11px;margin-bottom:3px">${sz} <span style="font-weight:400;color:#666">(${n})</span></div>
            <div>${Array(Math.min(n,12)).fill(box).join('')}</div>
          </div>`;
        }).join('');
        return `<tr>
          <td style="${tdStyle}font-size:12px;font-weight:600;min-width:140px">${item.name}<br><span style="font-size:10px;color:#666;font-weight:400">${color}</span></td>
          <td style="${tdStyle}font-size:12px;text-align:center;white-space:nowrap;min-width:56px">${item.salePrice} kr</td>
          <td style="${tdStyle}">${sizeHTML}</td>
          <td style="${tdStyle}min-width:70px">&nbsp;</td>
        </tr>`;
      }).join('');
    } else {
      const n = item.variants?.['_']?.stock || 0;
      return `<tr>
        <td style="${tdStyle}font-size:12px;font-weight:600;min-width:140px">${item.name}</td>
        <td style="${tdStyle}font-size:12px;text-align:center;white-space:nowrap;min-width:56px">${item.salePrice} kr</td>
        <td style="${tdStyle}">${Array(Math.min(n,20)).fill(box).join('')}</td>
        <td style="${tdStyle}min-width:70px">&nbsp;</td>
      </tr>`;
    }
  }).join('');

  const thStyle = 'border:1px solid #ccc;padding:7px 8px;background:#f0f0f0;font-size:11px;font-weight:700;';
  return `<div style="font-family:Georgia,serif;color:#111;padding:20px">
    <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px">
      <div style="font-size:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Doomherre — merch-ark</div>
      <div style="font-size:11px;color:#555;margin-top:3px">${show.name} &nbsp;·&nbsp; ${fmtDate(show.date)} &nbsp;·&nbsp; ${show.venue||''}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">
      <colgroup>
        <col style="width:160px"/>
        <col style="width:60px"/>
        <col/>
        <col style="width:70px"/>
      </colgroup>
      <thead><tr>
        <th style="${thStyle}text-align:left">Artikel</th>
        <th style="${thStyle}text-align:center">Pris</th>
        <th style="${thStyle}text-align:left">Storlekar / räkning</th>
        <th style="${thStyle}text-align:center">Kassa</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;border-top:1px solid #ccc;padding-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px">
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Total kassa: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Växel ut: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Anteckningar: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Signerat: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    </div>
  </div>`;
}

function showPrintSheet() {
  const show = window._currentShow;
  const allItems = window._currentItems;
  if (!show || !allItems) return;

  const pack = show.pack || [];
  const packedItems = pack.map(p => {
    const item = allItems.find(i => i.id === p.itemId);
    return item ? { ...item, packQty: p.qty } : null;
  }).filter(Boolean);

  const sheetHTML = buildPrintSheet(show, packedItems);

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Merch-ark — ${show.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; color: #111; background: #fff; padding: 24px; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:20px">
    <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#111;color:#fff;border:none;border-radius:4px">Skriv ut</button>
    <button onclick="window.close()" style="padding:8px 20px;font-size:14px;cursor:pointer;margin-left:8px;background:none;border:1px solid #ccc;border-radius:4px">Stäng</button>
  </div>
  ${sheetHTML}
</body>
</html>`);
  win.document.close();
}
