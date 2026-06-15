/* js/pages/shows.js */

registerPage('shows', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="page-title">Spelningar</div>
        <button class="btn-help" onclick="openHelp('shows')" title="Hjälp">?</button>
      </div>
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
    handleFsError(err, 'Sparningen misslyckades');
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
        ${show.status==='complete' ? `<button class="btn btn-danger btn-sm" data-tooltip="Ångrar all försäljning och återställer lagret. Kan inte ångras." onclick="confirmResetShowStock('${show.id}')">Återställ lager</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openPackRedigeraor('${show.id}')">Redigera pack</button>
        ${packedItems.length === 0 && (show.pack||[]).length > 0 ? `<button class="btn btn-danger btn-sm" onclick="confirmDeletePack('${show.id}')">Ta bort pack</button>` : ''}
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
      <!-- Swish bar -->
      <div class="card" style="margin-bottom:12px;background:var(--bg3)">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px">
          <div>
            <div class="stat-label">Swish</div>
            <div style="font-size:22px;font-weight:600;color:var(--text);letter-spacing:0.04em">123-195 82 89</div>
          </div>
          <button class="btn btn-ghost" onclick="openSwishQR()" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 14px">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <path d="M14 14h2v2h-2zM18 14h3v3h-3zM14 18h3v3h-3zM19 19h2v2h-2z"/>
            </svg>
            <span style="font-size:11px;color:var(--text2)">Visa QR</span>
          </button>
        </div>
      </div>

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
    handleFsError(err, 'Avslutning misslyckades');
  }
}

/* ── SWISH QR ── */
const SWISH_QR_B64 = 'data:image/jpeg;base64,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';

function openSwishQR() {
  openModal('Swish — skanna för att betala',
    `<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0">
      <img src="${SWISH_QR_B64}" alt="Swish QR" style="width:100%;max-width:320px;border-radius:8px;display:block"/>
      <div style="font-size:28px;font-weight:700;letter-spacing:0.05em;color:var(--text)">123-195 82 89</div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Stäng</button>`
  );
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
    handleFsError(err, 'Återställning misslyckades');
  }
}

/* ── DELETE PACK ── */
function confirmDeletePack(showId) {
  confirmAction('Ta bort spelningspacket? Det går inte att ångra.', async () => {
    const show = await fsGet('merch_shows', showId);
    if (!show) return;
    await fsSet('merch_shows', showId, { ...show, pack: [] });
    showToast('Pack borttaget');
    navigate('/shows/' + showId);
    await openShowDetail(showId);
  });
}

/* ── RESERVATION HELPER ── */
// Returns a map of reserved quantities across all upcoming shows EXCEPT the current one.
// Structure: { itemId: { '_': qty } } for non-clothing, { itemId: { color: { sz: qty } } } for clothing
async function getReservedQty(excludeShowId) {
  const shows    = await fsGetAll('merch_shows');
  const upcoming = shows.filter(s => s.status === 'upcoming' && s.id !== excludeShowId);
  const reserved = {};

  for (const show of upcoming) {
    for (const p of (show.pack || [])) {
      if (!reserved[p.itemId]) reserved[p.itemId] = {};
      if (p.variants && Object.keys(p.variants).length) {
        // clothing with per-variant pack
        for (const [color, sizes] of Object.entries(p.variants)) {
          if (!reserved[p.itemId][color]) reserved[p.itemId][color] = {};
          for (const [sz, qty] of Object.entries(sizes)) {
            reserved[p.itemId][color][sz] = (reserved[p.itemId][color][sz] || 0) + qty;
          }
        }
      } else {
        // non-clothing or old-style pack without variants
        reserved[p.itemId]['_'] = (reserved[p.itemId]['_'] || 0) + (p.qty || 0);
      }
    }
  }
  return reserved;
}

/* ── PACK EDITOR ── */
async function openPackRedigeraor(showId) {
  const [show, items, reserved] = await Promise.all([
    fsGet('merch_shows', showId),
    fsGetAll('merch_items'),
    getReservedQty(showId),
  ]);
  const active = sortByCategory(items.filter(i => i.status === 'active'));
  const pack   = show.pack || [];

  function availInfo(inStock, reservedQty, packQty) {
    const available = inStock - reservedQty;
    const shortage  = packQty - available;
    const availCol  = available <= 0 ? 'var(--red)' : available < 3 ? 'var(--amber)' : 'var(--text3)';
    let html = `<span style="color:${availCol};font-size:11px">
      ${fmtNum(inStock)} i lager · ${reservedQty > 0 ? fmtNum(reservedQty)+' res · ' : ''}${fmtNum(Math.max(0,available))} ledig
    </span>`;
    if (shortage > 0) html += `<span style="color:var(--red);font-size:11px;font-weight:500;margin-left:4px">⚠ ${fmtNum(shortage)} saknas</span>`;
    return html;
  }

  const rows = active.map(item => {
    const packEntry  = pack.find(p => p.itemId === item.id);
    const isClothing = item.category === 'clothing';
    const itemRes    = reserved[item.id] || {};

    if (isClothing) {
      const colors = item.colors || Object.keys(item.variants || {}).filter(c => c !== '_');
      const colorRows = colors.map(color => {
        const varStocks   = item.variants?.[color] || {};
        const activeSizes = ALL_SIZES; // always show all sizes so you can overpack/plan orders
        const sizeInputs = activeSizes.map(sz => {
          const inStock    = varStocks[sz]?.stock || 0;
          const resQty     = itemRes[color]?.[sz] || 0;
          const packQty    = packEntry?.variants?.[color]?.[sz] || 0;
          const available  = inStock - resQty;
          const shortage   = packQty > available ? packQty - available : 0;
          const borderCol  = shortage > 0 ? '1px solid var(--red)' : '1px solid var(--border)';
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;padding:4px 0">
            <span style="color:var(--text2);width:32px;flex-shrink:0">${sz}</span>
            <div style="font-size:11px;line-height:1.5;flex:1">
              ${availInfo(inStock, resQty, packQty)}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
              <input type="number" id="pack-${item.id}-${color}-${sz}"
                min="0" value="${packQty}" placeholder="0"
                oninput="liveCheckShortage('${item.id}','${color}','${sz}',${inStock},${resQty})"
                style="width:72px;padding:6px;background:var(--bg2);border:${borderCol};
                       color:var(--text);border-radius:4px;text-align:center;font-size:13px"/>
              ${shortage > 0 ? `<span id="short-${item.id}-${color}-${sz}" style="font-size:11px;color:var(--red)">−${fmtNum(shortage)} saknas</span>` : `<span id="short-${item.id}-${color}-${sz}" style="font-size:11px;color:var(--red);display:none"></span>`}
            </div>
          </div>`;
        }).join('');
        return `<div style="margin-top:6px;padding:8px;background:var(--bg2);border-radius:4px;border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text2);margin-bottom:8px;font-weight:500">${color}</div>
          <div style="display:flex;flex-direction:column;gap:6px">${sizeInputs}</div>
        </div>`;
      }).join('');

      return `<div style="padding:10px;background:var(--bg3);border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <div style="font-size:13px;font-weight:500">${item.name}</div>
          <div style="font-size:11px;color:var(--text2)">${catBadge(item.category)}</div>
        </div>
        ${colorRows}
      </div>`;
    } else {
      const inStock   = item.variants?.['_']?.stock || 0;
      const resQty    = itemRes['_'] || 0;
      const packQty   = packEntry?.qty || 0;
      const available = inStock - resQty;
      const shortage  = packQty > available ? packQty - available : 0;
      const borderCol = shortage > 0 ? '1px solid var(--red)' : '1px solid var(--border)';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:6px">
        <div>
          <div style="font-size:13px;font-weight:500">${item.name}</div>
          <div style="margin-top:2px">${availInfo(inStock, resQty, packQty)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <input type="number" id="pack-${item.id}"
            min="0" value="${packQty}" placeholder="0"
            oninput="liveCheckShortageSimple('${item.id}',${inStock},${resQty})"
            style="width:70px;padding:6px;background:var(--bg2);border:${borderCol};
                   color:var(--text);border-radius:4px;text-align:center"/>
          ${shortage > 0 ? `<span id="short-${item.id}" style="font-size:10px;color:var(--red)">−${fmtNum(shortage)}</span>` : `<span id="short-${item.id}" style="font-size:10px;color:var(--red);display:none"></span>`}
        </div>
      </div>`;
    }
  }).join('');

  openModal('Bygg spelningspack',
    `<div style="margin-bottom:10px;font-size:11px;color:var(--text3)">
      <span style="color:var(--amber)">Reserverat</span> = packat i andra kommande spelningar.
      Du kan packa mer än tillgängligt — <span style="color:var(--red)">röda siffror</span> visar vad som behöver beställas.
    </div>
    <div style="display:grid;gap:10px">${rows}</div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="savePack('${showId}')">Spara pack</button>`
  );
}

function liveCheckShortage(itemId, color, sz, inStock, resQty) {
  const input    = document.getElementById(`pack-${itemId}-${color}-${sz}`);
  const shortEl  = document.getElementById(`short-${itemId}-${color}-${sz}`);
  if (!input || !shortEl) return;
  const packQty  = parseInt(input.value) || 0;
  const shortage = packQty - (inStock - resQty);
  input.style.borderColor = shortage > 0 ? 'var(--red)' : 'var(--border)';
  shortEl.textContent     = shortage > 0 ? `−${fmtNum(shortage)} saknas` : '';
  shortEl.style.display   = shortage > 0 ? 'inline' : 'none';
}

function liveCheckShortageSimple(itemId, inStock, resQty) {
  const input   = document.getElementById(`pack-${itemId}`);
  const shortEl = document.getElementById(`short-${itemId}`);
  if (!input || !shortEl) return;
  const packQty  = parseInt(input.value) || 0;
  const shortage = packQty - (inStock - resQty);
  input.style.borderColor = shortage > 0 ? 'var(--red)' : 'var(--border)';
  shortEl.textContent     = shortage > 0 ? `−${fmtNum(shortage)} saknas` : '';
  shortEl.style.display   = shortage > 0 ? 'inline' : 'none';
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
  const packedItems = sortByCategory(pack.map(p => {
    const item = allItems.find(i => i.id === p.itemId);
    return item ? { ...item, packQty: p.qty, packVariants: p.variants || {} } : null;
  }).filter(Boolean));

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
