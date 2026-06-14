/* js/pages/dashboard.js */

registerPage('dashboard', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Översikt</div>
        <button class="btn-help" onclick="openHelp('dashboard')" title="Hjälp">?</button>
        <div class="page-sub">Översikt — ${new Date().toLocaleDateString('sv-SE', {weekday:'long', day:'numeric', month:'long'})}</div>
      </div>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:10px">
      <div class="stat-card"><div class="stat-label">Antal artiklar</div><div class="stat-value" id="d-items">—</div></div>
      <div class="stat-card"><div class="stat-label">Enheter i lager</div><div class="stat-value" id="d-enheter">—</div></div>
    </div>
    <div style="font-size:0.7rem;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Lagervärdering</div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">
      <div class="stat-card"><div class="stat-label">Inköpskostnad</div><div class="stat-value" id="d-cost">—</div></div>
      <div class="stat-card"><div class="stat-label">Försäljningsvärde</div><div class="stat-value gold" id="d-value">—</div></div>
      <div class="stat-card"><div class="stat-label">Potentiell vinst</div><div class="stat-value green" id="d-margin">—</div></div>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(1,1fr);margin-bottom:24px">
      <div class="stat-card"><div class="stat-label">Lågt lagersaldo</div><div class="stat-value amber" id="d-low">—</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="section">
        <div class="section-header">
          <div class="section-title">Nästa spelning</div>
          <a href="/shows" class="btn btn-ghost btn-sm" onclick="navigate('/shows');return false">Alla spelningar</a>
        </div>
        <div id="dash-next-show"></div>
      </div>
      <div class="section">
        <div class="section-header">
          <div class="section-title">Investeringsstatus</div>
          <a href="/investment" class="btn btn-ghost btn-sm" onclick="navigate('/investment');return false">Detaljer</a>
        </div>
        <div id="dash-invest"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px">
      <div class="section">
        <div class="section-header">
          <div class="section-title">Lågt lagersaldo</div>
          <a href="/inventory" class="btn btn-ghost btn-sm" onclick="navigate('/inventory');return false">Lager</a>
        </div>
        <div id="dash-low-stock"></div>
      </div>
      <div class="section">
        <div class="section-header">
          <div class="section-title" style="color:var(--red)">⚠ Bör beställas</div>
          <a href="/inventory" class="btn btn-ghost btn-sm" onclick="navigate('/inventory');return false">Lager</a>
        </div>
        <div id="dash-order"></div>
      </div>
    </div>
  `;

  try {
    const [items, shows, transactions] = await Promise.all([
      fsGetAll('merch_items'),
      fsGetAll('merch_shows'),
      fsGetAll('merch_transactions'),
    ]);

    /* stats */
    const totalUnits = items.reduce((s, i) => s + (i.totalStock || 0), 0);
    const totalCost   = items.reduce((s, i) => s + (i.totalStock || 0) * (i.costPerUnit || 0), 0);
    const totalValue  = items.reduce((s, i) => s + (i.totalStock || 0) * (i.salePrice || 0), 0);
    const totalMargin = totalValue - totalCost;
    const lowItems   = items.filter(i => (i.totalStock || 0) > 0 && (i.totalStock || 0) <= 5);
    document.getElementById('d-items').textContent  = fmtNum(items.length);
    document.getElementById('d-enheter').textContent  = fmtNum(totalUnits);
    document.getElementById('d-cost').textContent   = fmt(totalCost);
    document.getElementById('d-value').textContent  = fmt(totalValue);
    document.getElementById('d-margin').textContent = fmt(totalMargin);
    document.getElementById('d-low').textContent    = fmtNum(lowItems.length);

    /* next show */
    const kommande = shows
      .filter(s => s.status === 'upcoming')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const nextShow = kommande[0];
    document.getElementById('dash-next-show').innerHTML = nextShow
      ? `<div class="card">
          <div class="card-body">
            <div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px">${nextShow.name}</div>
            <div style="font-size:12px;color:var(--text2)">${fmtDate(nextShow.date)} · ${nextShow.venue || ''}</div>
            <div style="margin-top:12px;display:flex;gap:8px">
              <a href="/shows" class="btn btn-primary btn-sm" onclick="navigate('/shows');return false">Öppna spelningspack</a>
            </div>
          </div>
        </div>`
      : `<div class="card"><div class="card-body" style="color:var(--text3);font-size:13px">Inga kommande spelningar. <a href="/shows" onclick="navigate('/shows');return false" style="color:var(--gold)">Lägg till</a></div></div>`;

    /* investment summary */
    const invested  = transactions.filter(t => t.type === 'production').reduce((s, t) => s + (t.amount || 0), 0);
    const recouped  = transactions.filter(t => t.type === 'sale').reduce((s, t) => s + (t.amount || 0), 0);
    const pct       = invested > 0 ? Math.min(100, Math.round(recouped / invested * 100)) : 0;
    document.getElementById('dash-invest').innerHTML = invested > 0
      ? `<div class="card"><div class="card-body">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
            <span style="color:var(--text2)">Återvunnet</span>
            <span style="color:var(--gold)">${fmt(recouped)} / ${fmt(invested)}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill${pct>=100?' full':''}" style="width:${pct}%"></div></div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px">${pct}% of produktionskostnader återvunna</div>
        </div></div>`
      : `<div class="card"><div class="card-body" style="color:var(--text3);font-size:13px">Inga investeringar registrerade. <a href="/investment" onclick="navigate('/investment');return false" style="color:var(--gold)">Logga en</a></div></div>`;

    /* ── low stock — per variant, grouped by item ── */
    const LOW_THRESHOLD = 4;
    const lowVariants = []; // { name, color, sz, stock }
    for (const item of items) {
      if (item.category === 'clothing') {
        const colors = Object.keys(item.variants || {}).filter(c => c !== '_');
        for (const color of colors) {
          for (const sz of ALL_SIZES) {
            const stock = item.variants[color]?.[sz]?.stock ?? null;
            if (stock !== null && stock < LOW_THRESHOLD) {
              lowVariants.push({ name: item.name, color, sz, stock });
            }
          }
        }
      } else {
        const stock = item.variants?.['_']?.stock ?? item.totalStock ?? 0;
        if (stock < LOW_THRESHOLD) {
          lowVariants.push({ name: item.name, color: null, sz: null, stock });
        }
      }
    }

    // Group by name
    const lowGroups = {};
    for (const v of lowVariants) {
      if (!lowGroups[v.name]) lowGroups[v.name] = [];
      lowGroups[v.name].push(v);
    }

    document.getElementById('d-low').textContent = fmtNum(Object.keys(lowGroups).length);

    document.getElementById('dash-low-stock').innerHTML = Object.keys(lowGroups).length
      ? `<div class="card">
          ${Object.entries(lowGroups).map(([name, variants], i, arr) => `
            <div style="padding:12px 16px;${i < arr.length-1 ? 'border-bottom:2px solid var(--border)' : ''}">
              <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:8px">${name}</div>
              <div style="display:flex;flex-direction:column;gap:4px">
                ${variants.map(v => `
                  <div style="display:flex;justify-content:space-between;align-items:center;
                       padding:4px 8px;background:var(--bg3);border-radius:5px;font-size:12px">
                    <span style="color:var(--text2)">${v.color ? `${v.color} / ${v.sz}` : 'Enhet'}</span>
                    <span class="${stockClass(v.stock)}">${v.stock} i lager</span>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>`
      : `<div class="card"><div class="card-body" style="color:var(--text3);font-size:13px">Alla varianter har tillräckligt lager.</div></div>`;

    /* ── bör beställas — from pack shortages ── */
    const upcoming2   = shows.filter(s => s.status === 'upcoming');
    const totalPack2  = {};
    for (const show of upcoming2) {
      for (const p of (show.pack || [])) {
        if (!totalPack2[p.itemId]) totalPack2[p.itemId] = {};
        if (p.variants && Object.keys(p.variants).length) {
          for (const [color, sizes] of Object.entries(p.variants)) {
            if (!totalPack2[p.itemId][color]) totalPack2[p.itemId][color] = {};
            for (const [sz, qty] of Object.entries(sizes)) {
              totalPack2[p.itemId][color][sz] = (totalPack2[p.itemId][color][sz] || 0) + qty;
            }
          }
        } else {
          totalPack2[p.itemId]['_'] = (totalPack2[p.itemId]['_'] || 0) + (p.qty || 0);
        }
      }
    }

    const orderGroups = {};
    for (const item of items) {
      const pack = totalPack2[item.id];
      if (!pack) continue;
      if (item.category === 'clothing') {
        for (const [color, sizes] of Object.entries(pack)) {
          for (const [sz, packedQty] of Object.entries(sizes)) {
            const inStock  = item.variants?.[color]?.[sz]?.stock || 0;
            const shortage = packedQty - inStock;
            if (shortage > 0) {
              if (!orderGroups[item.name]) orderGroups[item.name] = [];
              orderGroups[item.name].push({ color, sz, inStock, packedQty, shortage });
            }
          }
        }
      } else {
        const packedQty = pack['_'] || 0;
        const inStock   = item.variants?.['_']?.stock || 0;
        const shortage  = packedQty - inStock;
        if (shortage > 0) {
          if (!orderGroups[item.name]) orderGroups[item.name] = [];
          orderGroups[item.name].push({ color: null, sz: null, inStock, packedQty, shortage });
        }
      }
    }

    document.getElementById('dash-order').innerHTML = Object.keys(orderGroups).length
      ? `<div class="card">
          ${Object.entries(orderGroups).map(([name, variants], i, arr) => `
            <div style="padding:12px 16px;${i < arr.length-1 ? 'border-bottom:2px solid var(--border)' : ''}">
              <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:8px">${name}</div>
              <div style="display:flex;flex-direction:column;gap:4px">
                ${variants.map(v => `
                  <div style="display:flex;justify-content:space-between;align-items:center;
                       padding:4px 8px;background:var(--bg3);border-radius:5px;font-size:12px">
                    <span style="color:var(--text2)">${v.color ? `${v.color} / ${v.sz}` : 'Enhet'}</span>
                    <div style="display:flex;gap:12px;align-items:center">
                      <span style="color:var(--text3)">${v.inStock} i lager · ${v.packedQty} packat</span>
                      <span style="color:var(--red);font-weight:600">+${v.shortage} saknas</span>
                    </div>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>`
      : `<div class="card"><div class="card-body" style="color:var(--text3);font-size:13px">Inga packlistor kräver beställning.</div></div>`;

  } catch (err) {
    console.error('Översikt error:', err);
    document.getElementById('d-items').textContent = 'error';
  }
});
