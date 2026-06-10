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

    const kommande = shows.filter(s => s.status === 'kommande');
    const done     = shows.filter(s => s.status !== 'kommande');

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
      <div style="font-size:11px;color:var(--text2);margin-top:2px">${fmtDatum(s.date)} · ${s.venue||''} · ${s.city||''}</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      ${earned > 0 ? `<span style="color:var(--gold);font-size:13px">${fmt(earned)}</span>` : ''}
      <span class="badge badge-${s.status==='kommande'?'kommande':'avslutad'}">${s.status}</span>
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
          <option value="kommande" ${(s?.status||'kommande')==='kommande'?'selected':''}>Kommande</option>
          <option value="avslutad" ${s?.status==='avslutad'?'selected':''}>Complete</option>
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
  if (!name) { showToast('Namn is required', 'error'); return; }
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
    showToast(id ? 'Spelning uppdaterad' : 'Spelning tillagd');
    closeModal();
    await renderSpelningar();
  } catch(err) {
    showToast('Sparningen misslyckades: ' + err.message, 'error');
  }
}

/* ── SHOW DETAIL / TALLY ── */
async function openShowDetail(id) {
  const [show, allArtikels] = await Promise.all([
    fsGet('merch_shows', id),
    fsGetAll('merch_items'),
  ]);

  window._currentShow = show;
  window._currentArtikels = allArtikels;

  // Restore tally from localStorage if available
  const saved = localStorage.getArtikel(`tally-${id}`);
  window._tallySales = saved ? JSON.parse(saved) : {};

  const container = document.getElementById('page-content');
  renderShowDetail(show, allArtikels, container);
}

function renderShowDetail(show, allArtikels, container) {
  const pack = show.pack || [];
  const packedArtikels = pack.map(p => {
    const item = allArtikels.find(i => i.id === p.itemId);
    return item ? { ...item, packQty: p.qty, packVariants: p.variants || {} } : null;
  }).filter(Boolean);

  const sales    = show.sales || [];
  const earnedTotal = sales.reduce((s, x) => s + (x.amount || 0), 0);
  const mode     = show.status === 'kommande' ? 'tally' : 'summary';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">
          <a href="/shows" style="color:var(--gold);cursor:pointer" onclick="navigate('/shows');return false">Spelningar</a>
          &nbsp;/&nbsp; ${show.name}
        </div>
        <div class="page-title">${show.name}</div>
        <div class="page-sub">${fmtDatum(show.date)} · ${show.venue||''} · ${show.city||''}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${show.status==='kommande' ? `<button class="btn btn-ghost btn-sm" onclick="showSkriv utSheet()">Skriv ut ark</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openPackRedigeraor('${show.id}')">Redigera pack</button>
        <button class="btn btn-ghost btn-sm" onclick="navigate('/shows')">Tillbaka</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Packade artiklar</div><div class="stat-value" id="sh-items">${packedArtikels.length}</div></div>
      <div class="stat-card"><div class="stat-label">Enheter totalt</div><div class="stat-value" id="sh-enheter">${packedArtikels.reduce((s,i)=>s+(i.packQty||0),0)}</div></div>
      <div class="stat-card"><div class="stat-label">Sålda</div><div class="stat-value green" id="sh-sålda">${sales.reduce((s,x)=>s+(x.qty||0),0)}</div></div>
      <div class="stat-card"><div class="stat-label">Intäkter</div><div class="stat-value gold" id="sh-cash">${fmt(earnedTotal)}</div></div>
    </div>

    ${!packedArtikels.length ? `
      <div class="card"><div class="card-body">
        ${emptyState('🎒', 'Inga artiklar packade för denna spelning.', `<button class="btn btn-primary" onclick="openPackRedigeraor('${show.id}')" style="margin-top:12px">Bygg pack</button>`)}
      </div></div>` : `
      <div id="tally-blocks">${packedArtikels.map(item => tallyBlock(item, show)).join('')}</div>
      <div class="card" style="margin-top:16px">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="stat-label">Total kassa</div>
            <div style="font-size:24px;font-weight:500;color:var(--gold)" id="tally-cash-big">${fmt(earnedTotal)}</div>
          </div>
          <div style="text-align:right">
            <div class="stat-label">Potential if sålda out</div>
            <div style="font-size:14px;color:var(--text2);margin-top:3px">${fmt(packedArtikels.reduce((s,i)=>s+(i.packQty||0)*(i.salePris||0),0))}</div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="card-body">
          <div class="field"><label>Anteckningar</label><input type="text" id="show-notes" value="${show.notes||''}" placeholder="Freebies, issues, anything odd…"/></div>
          <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap">
            <span id="tally-save-indicator" style="font-size:0.7rem;color:var(--text3)">
              ${Object.keys(window._tallySales).length > 0 ? 'Återställd från senaste session' : 'Sparas automatiskt vid varje tryck'}
            </span>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost" onclick="navigate('/shows')">Tillbaka</button>
              <button class="btn btn-primary" onclick="reconcileShow('${show.id}')">Stäng show</button>
            </div>
          </div>
        </div>
      </div>
    `}

  `;
}

function tallyBlock(item, show) {
  const isKläder = item.category === 'clothing';
  const colors     = item.colors || [];

  const sizeRows = isKläder
    ? colors.map(color => {
        const varStocks = item.variants?.[color] || {};
        return ALL_SIZES.filter(sz => (varStocks[sz]?.stock || 0) > 0).map(sz => {
          const v   = varStocks[sz] || { stock: 0, sålda: 0 };
          const rem = v.stock - (v.sålda || 0);
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
              <div style="font-size:10px;color:var(--text3);margin-top:2px">i lager</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
              border-left:1px solid var(--border);align-self:stretch">
              <button class="tally-btn" onclick="tallyAdj('${item.id}','${color}','${sz}',-1,'${item.salePris}')">−</button>
              <span class="tally-num" id="sålda-${item.id}-${color}-${sz}">0</span>
              <button class="tally-btn plus" onclick="tallyAdj('${item.id}','${color}','${sz}',1,'${item.salePris}')">+</button>
            </div>
          </div>`;
        }).join('');
      }).join('')
    : (() => {
        const v   = item.variants?.['_'] || { stock: 0, sålda: 0 };
        const rem = v.stock - (v.sålda || 0);
        return `<div style="display:grid;grid-template-columns:1fr auto;align-items:center;
          background:var(--bg3);border-radius:8px;border:1px solid var(--border);min-height:56px;overflow:hidden">
          <div style="padding:10px 16px">
            <div class="${stockClass(rem)}" style="font-size:20px;font-weight:500">${rem}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">i lager</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-left:1px solid var(--border)">
            <button class="tally-btn" onclick="tallyAdj('${item.id}','_','_',-1,'${item.salePris}')">−</button>
            <span class="tally-num" id="sålda-${item.id}-_-_">0</span>
            <button class="tally-btn plus" onclick="tallyAdj('${item.id}','_','_',1,'${item.salePris}')">+</button>
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
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${item.colors?.join(' / ')||''} · ${fmt(item.salePris||0)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span id="item-sålda-label-${item.id}" style="font-size:12px;color:${itemSålda>0?'var(--gold)':'var(--text3)'}">
            ${itemSålda > 0 ? `${itemSålda} sålda · ${fmt(itemSålda*(item.salePris||0))}` : 'ingen försäljning ännu'}
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
  const item  = window._currentArtikels?.find(i => i.id === itemId);
  if (!item) return;

  const v     = (item.variants?.[color] || {})?.[sz] || { stock: 0, sålda: 0 };
  const max   = v.stock || 0;

  if (!window._tallySales[key]) window._tallySales[key] = { itemId, color, sz, qty: 0, price: parseFloat(price) || 0 };
  const s     = window._tallySales[key];
  s.qty       = Math.max(0, Math.min(max, s.qty + delta));

  const såldaEl = document.getElementById(`sålda-${itemId}-${color}-${sz}`);
  const remEl  = document.getElementById(`rem-${itemId}-${color}-${sz}`);
  const rowEl  = document.getElementById(`sr-${itemId}-${color}-${sz}`);
  const rem    = max - s.qty;

  if (såldaEl) såldaEl.textContent = s.qty;
  if (remEl)  { remEl.textContent = rem; remEl.classNamn = stockClass(rem); }
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
  localStorage.setArtikel(key, JSON.stringify(window._tallySales));
  const el = document.getElementById('tally-save-indicator');
  if (el) {
    el.textContent = 'Saved ' + new Datum().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

  try {
    const show = await fsGet('merch_shows', id);

    const updatedSales = [...(show.sales || []), {
      date: now(), amount: total, qty: sales.reduce((s,x) => s+x.qty, 0), notes,
      lines: sales.map(s => ({ itemId: s.itemId, color: s.color, sz: s.sz, qty: s.qty, price: s.price }))
    }];

    await fsSet('merch_shows', id, { ...show, status: 'avslutad', sales: updatedSales, notes });

    for (const s av sales) {
      const item = window._currentArtikels?.find(i => i.id === s.itemId);
      if (!item) continue;
      const v = (item.variants?.[s.color] || {})?.[s.sz] || {};
      if (v) {
        v.sålda = (v.sålda || 0) + s.qty;
        item.totalStock = Math.max(0, (item.totalStock || 0) - s.qty);
        await fsSet('merch_items', s.itemId, item);
      }
    }

    if (total > 0) {
      await fsAdd('merch_transactions', {
        type: 'sale', amount: total, date: now(),
        showId: id, showNamn: show.name, notes,
        person: 'All'
      });
    }

    localStorage.removeArtikel(tallyStorageKey());
    showToast(`Spelning avslutad — ${fmt(total)} loggad`);
    navigate('/shows');
  } catch(err) {
    showToast('Avslutning misslyckades: ' + err.message, 'error');
  }
}

/* ── PACK EDITOR ── */
async function openPackRedigeraor(showId) {
  const [show, items] = await Promise.all([fsGet('merch_shows', showId), fsGetAll('merch_items')]);
  const active = items.filter(i => i.status === 'active' && (i.totalStock||0) > 0);
  const pack   = show.pack || [];

  openModal('Bygg spelningspack',
    `<div style="display:grid;gap:10px">
      ${active.map(item => {
        const packEntry = pack.find(p => p.itemId === item.id);
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:6px">
          <div>
            <div style="font-size:13px;font-weight:500">${item.name}</div>
            <div style="font-size:11px;color:var(--text2)">${catBadge(item.category)} ${fmtNum(item.totalStock||0)} i lager</div>
          </div>
          <input type="number" id="pack-${item.id}" min="0" max="${item.totalStock||0}"
            value="${packEntry?.qty||0}" placeholder="0"
            style="width:70px;padding:6px;background:var(--bg2);border:1px solid var(--border);color:var(--text);border-radius:4px;text-align:center"/>
        </div>`;
      }).join('')}
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="savePack('${showId}')">Spara pack</button>`
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
function buildSkriv utSheet(show, packedArtikels) {
  const box = '<div style="width:16px;height:16px;border:1px solid #999;border-radius:1px;display:inline-block;margin:2px;vertical-align:middle"></div>';

  const rows = packedArtikels.map(item => {
    const isKläder = item.category === 'clothing';
    const tdStyle = 'border:1px solid #ccc;padding:8px;vertical-align:top;';
    const thStyle = 'border:1px solid #ccc;padding:6px 8px;background:#f0f0f0;font-size:11px;font-weight:700;';

    if (isKläder) {
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
          <td style="${tdStyle}font-size:12px;text-align:center;white-space:nowrap;min-width:56px">${item.salePris} kr</td>
          <td style="${tdStyle}">${sizeHTML}</td>
          <td style="${tdStyle}min-width:70px">&nbsp;</td>
        </tr>`;
      }).join('');
    } else {
      const n = item.variants?.['_']?.stock || 0;
      return `<tr>
        <td style="${tdStyle}font-size:12px;font-weight:600;min-width:140px">${item.name}</td>
        <td style="${tdStyle}font-size:12px;text-align:center;white-space:nowrap;min-width:56px">${item.salePris} kr</td>
        <td style="${tdStyle}">${Array(Math.min(n,20)).fill(box).join('')}</td>
        <td style="${tdStyle}min-width:70px">&nbsp;</td>
      </tr>`;
    }
  }).join('');

  const thStyle = 'border:1px solid #ccc;padding:7px 8px;background:#f0f0f0;font-size:11px;font-weight:700;';
  return `<div style="font-family:Georgia,serif;color:#111;padding:20px">
    <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px">
      <div style="font-size:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Doomherre — merch-ark</div>
      <div style="font-size:11px;color:#555;margin-top:3px">${show.name} &nbsp;·&nbsp; ${fmtDatum(show.date)} &nbsp;·&nbsp; ${show.venue||''}</div>
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

function showSkriv utSheet() {
  const show = window._currentShow;
  const allArtikels = window._currentArtikels;
  if (!show || !allArtikels) return;

  const pack = show.pack || [];
  const packedArtikels = pack.map(p => {
    const item = allArtikels.find(i => i.id === p.itemId);
    return item ? { ...item, packQty: p.qty } : null;
  }).filter(Boolean);

  const sheetHTML = buildSkriv utSheet(show, packedArtikels);

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
