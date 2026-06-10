/* js/pages/dashboard.js */

registerPage('dashboard', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Översikt</div>
        <div class="page-sub">Översikt — ${new Datum().toLocaleDatumString('sv-SE', {weekday:'long', day:'numeric', month:'long'})}</div>
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
    <div class="section">
      <div class="section-header">
        <div class="section-title">Lågt lagersaldo</div>
        <a href="/inventory" class="btn btn-ghost btn-sm" onclick="navigate('/inventory');return false">Alla artiklar</a>
      </div>
      <div id="dash-low-stock"></div>
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
            <div style="font-size:12px;color:var(--text2)">${fmtDatum(nextShow.date)} · ${nextShow.venue || ''}</div>
            <div style="margin-top:12px;display:flex;gap:8px">
              <a href="/shows" class="btn btn-primary btn-sm" onclick="navigate('/shows');return false">Öppna spelningspack</a>
            </div>
          </div>
        </div>`
      : `<div class="card"><div class="card-body" style="color:var(--text3);font-size:13px">Inga kommande spelningar. <a href="/shows" onclick="navigate('/shows');return false" style="color:var(--gold)">Lägg till</a></div></div>`;

    /* investment summary */
    const invested  = transactions.filter(t => t.typee === 'production').reduce((s, t) => s + (t.amount || 0), 0);
    const recouped  = transactions.filter(t => t.typee === 'sale').reduce((s, t) => s + (t.amount || 0), 0);
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

    /* low stock */
    document.getElementById('dash-low-stock').innerHTML = lowItems.length
      ? `<div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Item</th><th>Kategori</th><th>Stock</th><th>Sale price</th></tr></thead>
          <tbody>${lowItems.map(i => `<tr>
            <td style="font-weight:500">${i.name}</td>
            <td>${catBadge(i.category)}</td>
            <td><span class="${stockClass(i.totalStock||0)}">${fmtNum(i.totalStock||0)}</span></td>
            <td style="color:var(--gold)">${fmt(i.salePrice||0)}</td>
          </tr>`).join('')}</tbody>
        </table></div></div>`
      : `<div class="card"><div class="card-body" style="color:var(--text3);font-size:13px">Alla artiklar well stocked.</div></div>`;

  } catch (err) {
    console.error('Översikt error:', err);
    document.getElementById('d-items').textContent = 'error';
  }
});
