/* js/pages/shows.js */

registerPage('shows', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Shows</div></div>
      <button class="btn btn-primary btn-sm" onclick="openAddShow()">+ Add show</button>
    </div>
    <div id="shows-content"></div>
  `;
  await renderShows();
});

async function renderShows() {
  const el = document.getElementById('shows-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Loading…</div>';

  try {
    const shows = await fsGetAll('merch_shows');
    shows.sort((a, b) => (b.date||'').localeCompare(a.date||''));

    if (!shows.length) {
      el.innerHTML = emptyState('🎸', 'No shows yet.', '<button class="btn btn-primary" onclick="openAddShow()" style="margin-top:12px">Add first show</button>');
      return;
    }

    const upcoming = shows.filter(s => s.status === 'upcoming');
    const done     = shows.filter(s => s.status !== 'upcoming');

    let html = '';
    if (upcoming.length) {
      html += `<div class="section"><div class="section-header"><div class="section-title">Upcoming</div></div>
        <div class="card">${upcoming.map(s => showRow(s)).join('')}</div></div>`;
    }
    if (done.length) {
      html += `<div class="section"><div class="section-header"><div class="section-title">Past shows</div></div>
        <div class="card">${done.map(s => showRow(s)).join('')}</div></div>`;
    }
    el.innerHTML = html;

  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Error: ${err.message}</div>`;
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
      <span class="badge badge-${s.status==='upcoming'?'upcoming':'complete'}">${s.status}</span>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openEditShow('${s.id}')">Edit</button>
    </div>
  </div>`;
}

/* ── ADD / EDIT SHOW ── */
function openAddShow() {
  openModal('Add show', buildShowForm(null),
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveShow(null)">Add show</button>`
  );
}

async function openEditShow(id) {
  const show = await fsGet('merch_shows', id);
  openModal('Edit show', buildShowForm(show),
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveShow('${id}')">Save</button>`
  );
}

function buildShowForm(s) {
  return `
    <div class="field"><label>Show name</label><input id="sf-name" type="text" value="${s?.name||''}"/></div>
    <div class="field-row">
      <div class="field"><label>Date</label><input id="sf-date" type="date" value="${s?.date||''}"/></div>
      <div class="field"><label>Status</label>
        <select id="sf-status">
          <option value="upcoming" ${(s?.status||'upcoming')==='upcoming'?'selected':''}>Upcoming</option>
          <option value="complete" ${s?.status==='complete'?'selected':''}>Complete</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Venue</label><input id="sf-venue" type="text" value="${s?.venue||''}"/></div>
    <div class="field"><label>City</label><input id="sf-city" type="text" value="${s?.city||''}"/></div>
    <div class="field"><label>Notes (e.g. support acts)</label><textarea id="sf-notes">${s?.notes||''}</textarea></div>
  `;
}

async function saveShow(id) {
  const name = document.getElementById('sf-name')?.value?.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  const data = {
    name,
    date:   document.getElementById('sf-date').value,
    status: document.getElementById('sf-status').value,
    venue:  document.getElementById('sf-venue').value.trim(),
    city:   document.getElementById('sf-city').value.trim(),
    notes:  document.getElementById('sf-notes').value.trim(),
    pack:   id ? undefined : [],
    sales:  id ? undefined : [],
    updatedAt: now(),
  };
  if (!id) data.createdAt = now();

  try {
    if (id) {
      await fsSet('merch_shows', id, { ...(await fsGet('merch_shows', id)), ...data });
    } else {
      await fsAdd('merch_shows', data);
    }
    showToast(id ? 'Show updated' : 'Show added');
    closeModal();
    await renderShows();
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
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
  window._tallySales = {};

  const container = document.getElementById('page-content');
  renderShowDetail(show, allItems, container);
}

function renderShowDetail(show, allItems, container) {
  const pack = show.pack || [];
  const packedItems = pack.map(p => {
    const item = allItems.find(i => i.id === p.itemId);
    return item ? { ...item, packQty: p.qty, packVariants: p.variants || {} } : null;
  }).filter(Boolean);

  const sales    = show.sales || [];
  const earnedTotal = sales.reduce((s, x) => s + (x.amount || 0), 0);
  const mode     = show.status === 'upcoming' ? 'tally' : 'summary';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">
          <a href="/shows" style="color:var(--gold);cursor:pointer" onclick="navigate('/shows');return false">Shows</a>
          &nbsp;/&nbsp; ${show.name}
        </div>
        <div class="page-title">${show.name}</div>
        <div class="page-sub">${fmtDate(show.date)} · ${show.venue||''} · ${show.city||''}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${show.status==='upcoming' ? `<button class="btn btn-ghost btn-sm" onclick="showPrintSheet()">Print sheet</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openPackEditor('${show.id}')">Edit pack</button>
        <button class="btn btn-ghost btn-sm" onclick="navigate('/shows')">Back</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Items packed</div><div class="stat-value" id="sh-items">${packedItems.length}</div></div>
      <div class="stat-card"><div class="stat-label">Units total</div><div class="stat-value" id="sh-units">${packedItems.reduce((s,i)=>s+(i.packQty||0),0)}</div></div>
      <div class="stat-card"><div class="stat-label">Sold</div><div class="stat-value green" id="sh-sold">${sales.reduce((s,x)=>s+(x.qty||0),0)}</div></div>
      <div class="stat-card"><div class="stat-label">Cash in</div><div class="stat-value gold" id="sh-cash">${fmt(earnedTotal)}</div></div>
    </div>

    ${!packedItems.length ? `
      <div class="card"><div class="card-body">
        ${emptyState('🎒', 'No items packed for this show.', `<button class="btn btn-primary" onclick="openPackEditor('${show.id}')" style="margin-top:12px">Build pack</button>`)}
      </div></div>` : `
      <div id="tally-blocks">${packedItems.map(item => tallyBlock(item, show)).join('')}</div>
      <div class="card" style="margin-top:16px">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="stat-label">Total cash</div>
            <div style="font-size:24px;font-weight:500;color:var(--gold)" id="tally-cash-big">${fmt(earnedTotal)}</div>
          </div>
          <div style="text-align:right">
            <div class="stat-label">Potential if sold out</div>
            <div style="font-size:14px;color:var(--text2);margin-top:3px">${fmt(packedItems.reduce((s,i)=>s+(i.packQty||0)*(i.salePrice||0),0))}</div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="card-body">
          <div class="field"><label>Notes</label><input type="text" id="show-notes" value="${show.notes||''}" placeholder="Freebies, issues, anything odd…"/></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost" onclick="navigate('/shows')">Back</button>
            <button class="btn btn-primary" onclick="reconcileShow('${show.id}')">Reconcile & close show</button>
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
        return ALL_SIZES.filter(sz => (varStocks[sz]?.stock || 0) > 0).map(sz => {
          const v   = varStocks[sz] || { stock: 0, sold: 0 };
          const rem = v.stock - (v.sold || 0);
          return `<div class="size-row" id="sr-${item.id}-${color}-${sz}"
            style="display:grid;grid-template-columns:52px 1fr auto;align-items:center;
            background:var(--bg3);border-radius:8px;border:1px solid var(--border);
            min-height:56px;overflow:hidden;${rem===0?'opacity:0.4':''}">
            <div style="text-align:center;font-size:15px;font-weight:500;color:var(--text2);
              padding:0 6px;border-right:1px solid var(--border);align-self:stretch;
              display:flex;align-items:center;justify-content:center">${sz}</div>
            <div style="padding:10px 14px">
              <div id="rem-${item.id}-${color}-${sz}" style="font-size:20px;font-weight:500;line-height:1"
                class="${stockClass(rem)}">${rem}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:2px">in stock</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
              border-left:1px solid var(--border);align-self:stretch">
              <button class="tally-btn" onclick="tallyAdj('${item.id}','${color}','${sz}',-1,'${item.salePrice}')">−</button>
              <span class="tally-num" id="sold-${item.id}-${color}-${sz}">0</span>
              <button class="tally-btn plus" onclick="tallyAdj('${item.id}','${color}','${sz}',1,'${item.salePrice}')">+</button>
            </div>
          </div>`;
        }).join('');
      }).join('')
    : (() => {
        const v   = item.variants?.['_'] || { stock: 0, sold: 0 };
        const rem = v.stock - (v.sold || 0);
        return `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;
          background:var(--bg3);border-radius:8px;border:1px solid var(--border);min-height:56px;overflow:hidden">
          <div style="padding:10px 16px">
            <div class="${stockClass(rem)}" style="font-size:20px;font-weight:500">${rem}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">in stock</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-left:1px solid var(--border)">
            <button class="tally-btn" onclick="tallyAdj('${item.id}','_','_',-1,'${item.salePrice}')">−</button>
            <span class="tally-num" id="sold-${item.id}-_-_">0</span>
            <button class="tally-btn plus" onclick="tallyAdj('${item.id}','_','_',1,'${item.salePrice}')">+</button>
          </div>
        </div>`;
      })();

  const itemSold = Object.values(window._tallySales || {})
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
          <span id="item-sold-label-${item.id}" style="font-size:12px;color:${itemSold>0?'var(--gold)':'var(--text3)'}">
            ${itemSold > 0 ? `${itemSold} sold · ${fmt(itemSold*(item.salePrice||0))}` : 'no sales yet'}
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

function toggleTallyBlock(id) {
  const el = document.getElementById(`tally-sizes-${id}`);
  const ch = document.getElementById(`chevron-${id}`);
  if (!el) return;
  const isOpen = el.style.paddingBottom !== '0px';
  el.style.display = isOpen ? 'none' : 'grid';
  if (ch) ch.style.transform = isOpen ? 'rotate(-90deg)' : '';
}

function tallyAdj(itemId, color, sz, delta, price) {
  const key   = `${itemId}-${color}-${sz}`;
  const item  = window._currentItems?.find(i => i.id === itemId);
  if (!item) return;

  const v     = (item.variants?.[color] || {})?.[sz] || { stock: 0, sold: 0 };
  const max   = v.stock || 0;

  if (!window._tallySales[key]) window._tallySales[key] = { itemId, color, sz, qty: 0, price: parseFloat(price) || 0 };
  const s     = window._tallySales[key];
  s.qty       = Math.max(0, Math.min(max, s.qty + delta));

  const soldEl = document.getElementById(`sold-${itemId}-${color}-${sz}`);
  const remEl  = document.getElementById(`rem-${itemId}-${color}-${sz}`);
  const rowEl  = document.getElementById(`sr-${itemId}-${color}-${sz}`);
  const rem    = max - s.qty;

  if (soldEl) soldEl.textContent = s.qty;
  if (remEl)  { remEl.textContent = rem; remEl.className = stockClass(rem); }
  if (rowEl)  rowEl.style.opacity = rem === 0 ? '0.4' : '1';

  const itemSold = Object.values(window._tallySales).filter(x => x.itemId === itemId).reduce((sum, x) => sum + x.qty, 0);
  const itemEarned = Object.values(window._tallySales).filter(x => x.itemId === itemId).reduce((sum, x) => sum + x.qty * x.price, 0);
  const label = document.getElementById(`item-sold-label-${itemId}`);
  if (label) {
    label.textContent = itemSold > 0 ? `${itemSold} sold · ${fmt(itemEarned)}` : 'no sales yet';
    label.style.color = itemSold > 0 ? 'var(--gold)' : 'var(--text3)';
  }

  const totalSold  = Object.values(window._tallySales).reduce((s, x) => s + x.qty, 0);
  const totalCash  = Object.values(window._tallySales).reduce((s, x) => s + x.qty * x.price, 0);
  const shSold = document.getElementById('sh-sold');
  const shCash = document.getElementById('sh-cash');
  const cashBig = document.getElementById('tally-cash-big');
  if (shSold)  shSold.textContent  = totalSold;
  if (shCash)  shCash.textContent  = fmt(totalCash);
  if (cashBig) cashBig.textContent = fmt(totalCash);
}

async function reconcileShow(id) {
  const sales = Object.values(window._tallySales || {}).filter(s => s.qty > 0);
  const total = sales.reduce((sum, s) => sum + s.qty * s.price, 0);
  const notes = document.getElementById('show-notes')?.value || '';

  try {
    const show = await fsGet('merch_shows', id);

    const updatedSales = [...(show.sales || []), {
      date: now(), amount: total, qty: sales.reduce((s,x) => s+x.qty, 0), notes,
      lines: sales.map(s => ({ itemId: s.itemId, color: s.color, sz: s.sz, qty: s.qty, price: s.price }))
    }];

    await fsSet('merch_shows', id, { ...show, status: 'complete', sales: updatedSales, notes });

    for (const s of sales) {
      const item = window._currentItems?.find(i => i.id === s.itemId);
      if (!item) continue;
      const v = (item.variants?.[s.color] || {})?.[s.sz] || {};
      if (v) {
        v.sold = (v.sold || 0) + s.qty;
        item.totalStock = Math.max(0, (item.totalStock || 0) - s.qty);
        await fsSet('merch_items', s.itemId, item);
      }
    }

    if (total > 0) {
      await fsAdd('merch_transactions', {
        type: 'sale', amount: total, date: now(),
        showId: id, showName: show.name, notes,
        person: 'All'
      });
    }

    showToast(`Show reconciled — ${fmt(total)} logged`);
    navigate('/shows');
  } catch(err) {
    showToast('Reconcile failed: ' + err.message, 'error');
  }
}

/* ── PACK EDITOR ── */
async function openPackEditor(showId) {
  const [show, items] = await Promise.all([fsGet('merch_shows', showId), fsGetAll('merch_items')]);
  const active = items.filter(i => i.status === 'active' && (i.totalStock||0) > 0);
  const pack   = show.pack || [];

  openModal('Build show pack',
    `<div style="display:grid;gap:10px">
      ${active.map(item => {
        const packEntry = pack.find(p => p.itemId === item.id);
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:6px">
          <div>
            <div style="font-size:13px;font-weight:500">${item.name}</div>
            <div style="font-size:11px;color:var(--text2)">${catBadge(item.category)} ${fmtNum(item.totalStock||0)} in stock</div>
          </div>
          <input type="number" id="pack-${item.id}" min="0" max="${item.totalStock||0}"
            value="${packEntry?.qty||0}" placeholder="0"
            style="width:70px;padding:6px;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:4px;text-align:center"/>
        </div>`;
      }).join('')}
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="savePack('${showId}')">Save pack</button>`
  );
}

async function savePack(showId) {
  const show  = await fsGet('merch_shows', showId);
  const items = await fsGetAll('merch_items');
  const pack  = items.map(item => {
    const qty = parseInt(document.getElementById(`pack-${item.id}`)?.value) || 0;
    return qty > 0 ? { itemId: item.id, qty } : null;
  }).filter(Boolean);

  await fsSet('merch_shows', showId, { ...show, pack });
  showToast('Pack saved');
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
      <div style="font-size:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Doomherre — merch sheet</div>
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
        <th style="${thStyle}text-align:left">Item</th>
        <th style="${thStyle}text-align:center">Price</th>
        <th style="${thStyle}text-align:left">Sizes / tally boxes</th>
        <th style="${thStyle}text-align:center">Cash</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;border-top:1px solid #ccc;padding-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px">
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Total cash: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Float out: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Notes: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      <div style="border-bottom:1px solid #999;padding-bottom:2px;color:#555">Signed: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
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
  <title>Merch sheet — ${show.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; color: #111; background: #fff; padding: 24px; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:20px">
    <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#111;color:#fff;border:none;border-radius:4px">Print</button>
    <button onclick="window.close()" style="padding:8px 20px;font-size:14px;cursor:pointer;margin-left:8px;background:none;border:1px solid #ccc;border-radius:4px">Close</button>
  </div>
  ${sheetHTML}
</body>
</html>`);
  win.document.close();
}
