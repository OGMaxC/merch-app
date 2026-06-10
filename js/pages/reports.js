/* js/pages/reports.js */

registerPage('reports', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Reports</div></div>
    </div>
    <div id="reports-content"></div>
  `;
  await renderReports();
});

async function renderReports() {
  const el = document.getElementById('reports-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Loading…</div>';

  try {
    const [items, shows, transactions] = await Promise.all([
      fsGetAll('merch_items'),
      fsGetAll('merch_shows'),
      fsGetAll('merch_transactions'),
    ]);

    const saleTxns     = transactions.filter(t => t.type === 'sale');
    const prodTxns     = transactions.filter(t => t.type === 'production');
    const totalRevenue = saleTxns.reduce((s, t) => s + (t.amount||0), 0);
    const totalCost    = prodTxns.reduce((s, t) => s + (t.amount||0), 0);
    const profit       = totalRevenue - totalCost;
    const doneShows    = shows.filter(s => s.status === 'complete');
    const showRevenue  = doneShows.reduce((s, sh) => s + (sh.sales||[]).reduce((a,x)=>a+(x.amount||0),0), 0);
    const onlineRev    = totalRevenue - showRevenue;

    /* revenue by item — derive from show sales lines */
    const itemRevMap = {};
    for (const sh of doneShows) {
      for (const sale of (sh.sales||[])) {
        for (const line of (sale.lines||[])) {
          const item = items.find(i => i.id === line.itemId);
          if (!item) continue;
          if (!itemRevMap[item.name]) itemRevMap[item.name] = 0;
          itemRevMap[item.name] += (line.qty||0) * (line.price||0);
        }
      }
    }
    const itemRevData = Object.entries(itemRevMap)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 8);

    /* size sell-through for clothing */
    const sizeSold   = {};
    const sizeStock  = {};
    for (const item of items.filter(i => i.category === 'clothing')) {
      for (const color of (item.colors||[])) {
        for (const sz of ALL_SIZES) {
          const v = item.variants?.[color]?.[sz];
          if (!v) continue;
          sizeSold[sz]  = (sizeSold[sz]||0)  + (v.sold||0);
          sizeStock[sz] = (sizeStock[sz]||0) + (v.stock||0);
        }
      }
    }

    /* per-show earnings */
    const showData = doneShows
      .map(sh => ({
        name: sh.name,
        earned: (sh.sales||[]).reduce((s,x)=>s+(x.amount||0),0)
      }))
      .filter(s => s.earned > 0)
      .sort((a,b) => b.earned - a.earned)
      .slice(0,6);

    const maxItem = itemRevData.length ? Math.max(...itemRevData.map(x=>x[1])) : 1;
    const maxShow = showData.length   ? Math.max(...showData.map(x=>x.earned)) : 1;

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:24px">
        <div class="stat-card"><div class="stat-label">Total revenue</div><div class="stat-value gold">${fmt(totalRevenue)}</div></div>
        <div class="stat-card"><div class="stat-label">Production costs</div><div class="stat-value">${fmt(totalCost)}</div></div>
        <div class="stat-card"><div class="stat-label">Net profit</div><div class="stat-value ${profit>=0?'green':'red'}">${fmt(profit)}</div></div>
        <div class="stat-card"><div class="stat-label">Shows completed</div><div class="stat-value">${doneShows.length}</div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">

        <div class="section">
          <div class="section-header"><div class="section-title">Revenue by item</div></div>
          <div class="card">
            <div class="card-body">
              ${itemRevData.length ? itemRevData.map(([name, val]) => `
                <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:10px">
                  <div>
                    <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${name}</div>
                    <div style="background:var(--bg3);border-radius:3px;height:7px;overflow:hidden">
                      <div style="background:var(--gold);height:100%;width:${Math.round(val/maxItem*100)}%;border-radius:3px"></div>
                    </div>
                  </div>
                  <div style="font-size:12px;color:var(--gold);white-space:nowrap">${fmt(val)}</div>
                </div>`).join('')
              : `<div style="color:var(--text3);font-size:13px">No sales data yet.</div>`}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-header"><div class="section-title">Revenue by show</div></div>
          <div class="card">
            <div class="card-body">
              ${showData.length ? showData.map(s => `
                <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:10px">
                  <div>
                    <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${s.name}</div>
                    <div style="background:var(--bg3);border-radius:3px;height:7px;overflow:hidden">
                      <div style="background:var(--gold-dim);height:100%;width:${Math.round(s.earned/maxShow*100)}%;border-radius:3px"></div>
                    </div>
                  </div>
                  <div style="font-size:12px;color:var(--gold);white-space:nowrap">${fmt(s.earned)}</div>
                </div>`).join('')
              : `<div style="color:var(--text3);font-size:13px">No completed shows yet.</div>`}
            </div>
          </div>
        </div>

      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

        <div class="section">
          <div class="section-header"><div class="section-title">Sales by channel</div></div>
          <div class="card">
            <div class="card-body">
              ${totalRevenue > 0 ? [
                { label: 'Shows',  val: showRevenue, color: 'var(--gold)' },
                { label: 'Online', val: onlineRev,   color: 'var(--gold-dim)' },
              ].map(c => {
                const pct = totalRevenue > 0 ? Math.round(c.val/totalRevenue*100) : 0;
                return `<div style="margin-bottom:12px">
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                    <span style="color:var(--text2)">${c.label}</span>
                    <span style="color:${c.color}">${pct}% — ${fmt(c.val)}</span>
                  </div>
                  <div style="background:var(--bg3);border-radius:3px;height:7px;overflow:hidden">
                    <div style="background:${c.color};height:100%;width:${pct}%;border-radius:3px"></div>
                  </div>
                </div>`;
              }).join('')
              : `<div style="color:var(--text3);font-size:13px">No sales data yet.</div>`}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-header"><div class="section-title">Size sell-through (clothing)</div></div>
          <div class="card">
            <div class="card-body">
              ${ALL_SIZES.filter(sz => (sizeStock[sz]||0) > 0).map(sz => {
                const total = (sizeStock[sz]||0) + (sizeSold[sz]||0);
                const pct   = total > 0 ? Math.round((sizeSold[sz]||0)/total*100) : 0;
                return `<div style="display:grid;grid-template-columns:36px 1fr 36px;gap:8px;align-items:center;margin-bottom:8px">
                  <span style="font-size:12px;font-weight:500;color:var(--text)">${sz}</span>
                  <div style="background:var(--bg3);border-radius:3px;height:7px;overflow:hidden">
                    <div style="background:var(--gold);height:100%;width:${pct}%;border-radius:3px"></div>
                  </div>
                  <span style="font-size:11px;color:var(--text2);text-align:right">${pct}%</span>
                </div>`;
              }).join('') || `<div style="color:var(--text3);font-size:13px">No clothing data yet.</div>`}
            </div>
          </div>
        </div>

      </div>
    `;
  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Error: ${err.message}</div>`;
  }
}
