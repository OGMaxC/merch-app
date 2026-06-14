/* js/pages/reports.js */

const PROD_CATEGORIES = new Set([
  'Inspelning / Studio',
  'Mixning / Mastering',
  'Pressning (vinyl, CD, kassett)',
  'Artwork / Foto / Video',
  'Merch-produktion',
  'Trycksaker',
]);

registerPage('reports', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="page-title">Rapporter</div>
        <button class="btn-help" onclick="openHelp('reports')" title="Hjälp">?</button>
      </div>
      <div style="display:flex;gap:6px" id="report-filters">
        <button class="btn btn-ghost btn-sm report-filter-btn active" onclick="setReportFilter('all',this)">Allt</button>
        <button class="btn btn-ghost btn-sm report-filter-btn" onclick="setReportFilter('clothing',this)">Kläder</button>
        <button class="btn btn-ghost btn-sm report-filter-btn" onclick="setReportFilter('records',this)">Skivor</button>
      </div>
    </div>
    <div id="reports-content"></div>
  `;
  window._reportFilter = 'all';
  await renderRapporter();
});

function setReportFilter(filter, btn) {
  window._reportFilter = filter;
  document.querySelectorAll('.report-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRapporter();
}

async function renderRapporter() {
  const el = document.getElementById('reports-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Laddar…</div>';

  try {
    const [items, shows, transactions] = await Promise.all([
      fsGetAll('merch_items'),
      fsGetAll('merch_shows'),
      fsGetAll('merch_transactions'),
    ]);

    const filter    = window._reportFilter || 'all';
    const doneShows = shows.filter(s => s.status === 'complete');
    const txnsNorm  = transactions.map(t => t.direction ? t : {
      ...t,
      direction: t.type === 'sale' ? 'in' : 'ut',
      category:  t.category || (t.type === 'production' ? 'Övrigt' : 'Försäljning'),
      project:   t.project || t.itemNamn || t.showNamn || '',
    });

    /* ── filter items by category ── */
    function matchesFilter(item) {
      if (filter === 'all') return true;
      return item?.category === filter;
    }

    /* ── revenue from closed shows ── */
    let totalRevenue = 0;
    const itemRevMap  = {};
    const showRevMap  = {};

    for (const sh of doneShows) {
      let showEarned = 0;
      for (const sale of (sh.sales || [])) {
        for (const line of (sale.lines || [])) {
          const item = items.find(i => i.id === line.itemId);
          if (!matchesFilter(item)) continue;
          const earned = (line.qty || 0) * (line.price || 0);
          totalRevenue += earned;
          showEarned   += earned;
          const name = item?.name || line.itemId;
          if (!itemRevMap[name]) itemRevMap[name] = { revenue: 0, qty: 0, category: item?.category };
          itemRevMap[name].revenue += earned;
          itemRevMap[name].qty     += (line.qty || 0);
        }
      }
      if (showEarned > 0) showRevMap[sh.name] = (showRevMap[sh.name] || 0) + showEarned;
    }

    /* ── costs from transactions ── */
    const outTxns = txnsNorm.filter(t => t.direction === 'ut');

    // Group by project
    const projects = [...new Set(outTxns.map(t => t.project).filter(Boolean))].sort();

    // Per-project cost breakdown
    const projCosts = {};
    for (const t of outTxns) {
      const proj = t.project || 'Ej kopplat';
      if (!projCosts[proj]) projCosts[proj] = { prod: 0, drift: 0, total: 0, cats: {} };
      const isProd = PROD_CATEGORIES.has(t.category);
      if (isProd) projCosts[proj].prod  += (t.amount || 0);
      else        projCosts[proj].drift += (t.amount || 0);
      projCosts[proj].total += (t.amount || 0);
      projCosts[proj].cats[t.category] = (projCosts[proj].cats[t.category] || 0) + (t.amount || 0);
    }

    const totalCost   = outTxns.reduce((s, t) => s + (t.amount || 0), 0);
    const totalProd   = outTxns.filter(t => PROD_CATEGORIES.has(t.category)).reduce((s,t)=>s+(t.amount||0),0);
    const totalDrift  = totalCost - totalProd;
    const nettoAll    = totalRevenue - totalCost;
    const nettoProd   = totalRevenue - totalProd;

    /* ── size sell-through ── */
    const sizeSålda = {}, sizeStock = {};
    for (const item of items.filter(i => i.category === 'clothing')) {
      const colors = Object.keys(item.variants || {}).filter(c => c !== '_');
      for (const color of colors) {
        for (const sz of ALL_SIZES) {
          const v = item.variants[color]?.[sz];
          if (!v) continue;
          sizeSålda[sz]  = (sizeSålda[sz]  || 0) + (v.sålda || 0);
          sizeStock[sz]  = (sizeStock[sz]  || 0) + (v.stock || 0);
        }
      }
    }

    /* ── price health (2x rule) ── */
    const priceHealth = items
      .filter(i => matchesFilter(i) && i.status === 'active')
      .map(i => {
        const cost  = i.costPerUnit || 0;
        const price = i.salePrice   || 0;
        const ratio = cost > 0 ? price / cost : null;
        const ok    = ratio === null ? null : ratio >= 2;
        return { name: i.name, cost, price, ratio, ok };
      })
      .filter(i => i.cost > 0 || i.price > 0)
      .sort((a, b) => (a.ratio ?? 999) - (b.ratio ?? 999));

    /* ── top items ── */
    const itemRevData = Object.entries(itemRevMap)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 8);

    const showData = Object.entries(showRevMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const maxItem = itemRevData.length ? Math.max(...itemRevData.map(x => x[1].revenue)) : 1;
    const maxShow = showData.length    ? Math.max(...showData.map(x => x[1])) : 1;

    /* ── bar helper ── */
    function bar(val, max, color = 'var(--gold)') {
      const pct = max > 0 ? Math.round(val / max * 100) : 0;
      return `<div style="background:var(--bg3);border-radius:3px;height:7px;overflow:hidden;flex:1">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:3px"></div>
      </div>`;
    }

    el.innerHTML = `
      <!-- SUMMARY CARDS -->
      <div class="stat-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-label">Total intäkt</div>
          <div class="stat-value gold">${fmt(totalRevenue)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label" data-tooltip="Inspelning, Mastering, Pressning, Artwork">Produktionskostnad</div>
          <div class="stat-value amber">${fmt(totalProd)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label" data-tooltip="Marknadsföring, Turné, Transport, mm">Driftkostnad</div>
          <div class="stat-value amber">${fmt(totalDrift)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label" data-tooltip="Intäkt minus produktionskostnad">Netto (prod)</div>
          <div class="stat-value ${nettoProd>=0?'green':'red'}">${nettoProd>=0?'+':''}${fmt(nettoProd)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label" data-tooltip="Intäkt minus alla kostnader">Netto (totalt)</div>
          <div class="stat-value ${nettoAll>=0?'green':'red'}">${nettoAll>=0?'+':''}${fmt(nettoAll)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avslutade spelningar</div>
          <div class="stat-value">${doneShows.length}</div>
        </div>
      </div>

      <!-- INTÄKT PER ARTIKEL + SPELNING -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div class="section">
          <div class="section-header"><div class="section-title">Intäkt per artikel</div></div>
          <div class="card"><div class="card-body">
            ${itemRevData.length ? itemRevData.map(([name, d]) => `
              <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:10px">
                <div>
                  <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${name}
                    <span style="color:var(--text3);font-size:11px"> · ${d.qty} st</span>
                  </div>
                  ${bar(d.revenue, maxItem)}
                </div>
                <div style="font-size:12px;color:var(--gold);white-space:nowrap">${fmt(d.revenue)}</div>
              </div>`).join('')
            : `<div style="color:var(--text3);font-size:13px">Ingen försäljningsdata ännu.</div>`}
          </div></div>
        </div>

        <div class="section">
          <div class="section-header"><div class="section-title">Intäkt per spelning</div></div>
          <div class="card"><div class="card-body">
            ${showData.length ? showData.map(([name, earned]) => `
              <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:10px">
                <div>
                  <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${name}</div>
                  ${bar(earned, maxShow, 'var(--gold)')}
                </div>
                <div style="font-size:12px;color:var(--gold);white-space:nowrap">${fmt(earned)}</div>
              </div>`).join('')
            : `<div style="color:var(--text3);font-size:13px">Inga avslutade spelningar ännu.</div>`}
          </div></div>
        </div>
      </div>

      <!-- KOSTNAD PER PROJEKT + PIE -->
      <div style="display:grid;grid-template-columns:1fr 280px;gap:20px;margin-bottom:20px;align-items:start">

        <div class="section">
          <div class="section-header"><div class="section-title">Kostnad per projekt</div></div>
          <div class="card">
            ${Object.keys(projCosts).length ? Object.entries(projCosts)
              .sort((a,b) => b[1].total - a[1].total)
              .map(([proj, d], pi, arr) => `
              <div style="padding:16px 18px;${pi < arr.length-1 ? 'border-bottom:2px solid var(--border)' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
                  <div style="font-weight:600;font-size:14px">${proj}</div>
                  <div style="display:flex;gap:16px;font-size:12px">
                    <span style="color:var(--text3)">Prod: <span style="color:var(--amber)">${fmt(d.prod)}</span></span>
                    <span style="color:var(--text3)">Drift: <span style="color:var(--amber)">${fmt(d.drift)}</span></span>
                    <span style="font-weight:600;color:var(--amber)">Totalt: ${fmt(d.total)}</span>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  ${Object.entries(d.cats).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => {
                    const isProd = PROD_CATEGORIES.has(cat);
                    const pct    = d.total > 0 ? Math.round(amt/d.total*100) : 0;
                    return `<div style="display:grid;grid-template-columns:1fr 80px 44px;gap:8px;align-items:center">
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;
                          background:${isProd ? 'var(--gold)' : 'var(--text3)'}"></span>
                        <span style="font-size:12px;color:var(--text2)">${cat}</span>
                      </div>
                      <span style="font-size:12px;color:var(--amber);text-align:right">${fmt(amt)}</span>
                      <span style="font-size:11px;color:var(--text3);text-align:right">${pct}%</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>`).join('')
            : `<div class="card-body" style="color:var(--text3);font-size:13px">Inga projektutgifter loggade.</div>`}
          </div>
        </div>

        <div class="section">
          <div class="section-header"><div class="section-title">Prod vs Drift</div></div>
          <div class="card"><div class="card-body">
            ${totalCost > 0 ? (() => {
              const pie = renderPie(
                [
                  { label: 'Produktion', value: totalProd  },
                  { label: 'Drift',      value: totalDrift },
                ].filter(d => d.value > 0),
                totalCost
              );
              return pie;
            })()
            : `<div style="color:var(--text3);font-size:13px">Inga kostnader ännu.</div>`}
          </div></div>
        </div>

      </div>

      <!-- PRISGRANSKNING + STORLEKSFÖRSÄLJNING -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

        <div class="section">
          <div class="section-header">
            <div class="section-title" data-tooltip="Priset bör vara minst 2× produktionskostnaden per enhet.">Prisgranskning (2×-regeln)</div>
          </div>
          <div class="card">
            ${priceHealth.length ? `
              <div style="padding:8px 14px;border-bottom:1px solid var(--border);display:grid;
                   grid-template-columns:1fr 72px 72px 72px 60px;gap:6px;font-size:10px;
                   color:var(--text3);text-transform:uppercase;letter-spacing:0.06em">
                <span>Artikel</span>
                <span style="text-align:right">Kostnad</span>
                <span style="text-align:right">Pris</span>
                <span style="text-align:right">Rek. pris</span>
                <span style="text-align:right">Faktor</span>
              </div>
              ${priceHealth.map(i => {
                const col      = i.ok === null ? 'var(--text3)' : i.ok ? 'var(--green)' : 'var(--red)';
                const label    = i.ratio === null ? '—' : \`\${i.ratio.toFixed(1)}×\`;
                const recPrice = i.cost > 0 ? fmt(i.cost * 2) : '—';
                return \`<div style="padding:8px 14px;border-bottom:1px solid var(--bg3);display:grid;
                              grid-template-columns:1fr 72px 72px 72px 60px;gap:6px;align-items:center;font-size:12px">
                  <span style="color:var(--text)">\${i.name}</span>
                  <span style="text-align:right;color:var(--text2)">\${i.cost > 0 ? fmt(i.cost) : '—'}</span>
                  <span style="text-align:right;color:var(--text2)">\${i.price > 0 ? fmt(i.price) : '—'}</span>
                  <span style="text-align:right;color:var(--text3)">\${recPrice}</span>
                  <span style="text-align:right;font-weight:600;color:\${col}">\${label}</span>
                </div>\`;
              }).join('')}`
            : `<div class="card-body" style="color:var(--text3);font-size:13px">Lägg till kostnad per enhet på artiklarna för att se prisgranskning.</div>`}
          </div>
        </div>

        <div class="section">
          <div class="section-header"><div class="section-title">Storleksförsäljning (kläder)</div></div>
          <div class="card"><div class="card-body">
            ${ALL_SIZES.filter(sz => (sizeStock[sz]||0)+(sizeSålda[sz]||0) > 0).map(sz => {
              const total = (sizeStock[sz]||0) + (sizeSålda[sz]||0);
              const pct   = total > 0 ? Math.round((sizeSålda[sz]||0) / total * 100) : 0;
              return `<div style="display:grid;grid-template-columns:36px 1fr 60px;gap:8px;align-items:center;margin-bottom:8px">
                <span style="font-size:13px;font-weight:500;color:var(--text)">${sz}</span>
                ${bar(sizeSålda[sz]||0, total)}
                <span style="font-size:11px;color:var(--text2);text-align:right">${pct}% · ${sizeSålda[sz]||0} st</span>
              </div>`;
            }).join('') || `<div style="color:var(--text3);font-size:13px">Ingen kläddata ännu.</div>`}
          </div></div>
        </div>

      </div>
    `;
  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Fel: ${err.message}</div>`;
  }
}
