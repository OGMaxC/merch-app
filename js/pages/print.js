/* js/pages/print.js */

registerPage('print', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="page-title">Skriv ut</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px" id="print-cards"></div>
  `;
  renderPrintCards();
});

function renderPrintCards() {
  const cards = [
    {
      id: 'inventory',
      title: 'Lagerrapport',
      desc: 'Alla aktiva artiklar med lager per variant, kostnad och värde.',
      icon: '📦',
      filters: [],
    },
    {
      id: 'order',
      title: 'Beställningsrapport',
      desc: 'Artiklar med brist baserat på kommande spelningars packlistor.',
      icon: '⚠️',
      filters: [],
    },
    {
      id: 'financial',
      title: 'Finansiell rapport',
      desc: 'Alla transaktioner grupperade per person och projekt.',
      icon: '💰',
      filters: ['year', 'project'],
    },
    {
      id: 'sales',
      title: 'Försäljningsstatistik',
      desc: 'Bäst säljande produkter, intäkt per spelning, genomsnitt per show.',
      icon: '📈',
      filters: ['year'],
    },
    {
      id: 'skatbo',
      title: 'Skatbo-rapport',
      desc: 'Alla in- och utflöden kopplade till bandkassan.',
      icon: '🏦',
      filters: ['year'],
    },
    {
      id: 'tour',
      title: 'Turnérapport',
      desc: 'Kostnader och intäkter per spelning/turné. Gick det runt?',
      icon: '🎸',
      filters: ['project'],
    },
    {
      id: 'annual',
      title: 'Årssammanfattning',
      desc: 'Ekonomi, försäljning, lager och highlights för ett givet år.',
      icon: '📅',
      filters: ['year'],
    },
  ];

  const el = document.getElementById('print-cards');
  if (!el) return;
  el.innerHTML = cards.map(c => `
    <div class="card" style="cursor:pointer" onclick="openPrintOptions('${c.id}')">
      <div class="card-body">
        <div style="font-size:28px;margin-bottom:10px">${c.icon}</div>
        <div style="font-weight:600;font-size:14px;margin-bottom:6px">${c.title}</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">${c.desc}</div>
        <button class="btn btn-primary btn-sm" style="width:100%">Generera →</button>
      </div>
    </div>`).join('');
}

async function openPrintOptions(reportId) {
  const raw  = await fsGetAll('merch_transactions');
  const txns = raw.map(t => t.direction ? t : { ...t, direction: t.type === 'sale' ? 'in' : 'ut', project: t.project || t.itemNamn || t.showNamn || '' });
  const years    = [...new Set(txns.map(t => t.date?.slice(0,4)).filter(Boolean))].sort().reverse();
  const projects = [...new Set(txns.map(t => t.project).filter(Boolean))].sort();

  const needsYear    = ['financial','sales','skatbo','annual'].includes(reportId);
  const needsProject = ['financial','tour'].includes(reportId);

  const filterHTML = `
    ${needsYear ? `<div class="field"><label>År</label>
      <select id="pr-year">
        <option value="">Alla år</option>
        ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
      </select></div>` : ''}
    ${needsProject ? `<div class="field"><label>Projekt</label>
      <select id="pr-project">
        <option value="">Alla projekt</option>
        ${projects.map(p => `<option value="${p}">${p}</option>`).join('')}
      </select></div>` : ''}
    ${!needsYear && !needsProject ? '<div style="color:var(--text2);font-size:13px">Inga filter — rapporten genereras direkt.</div>' : ''}
  `;

  openModal('Generera rapport',
    filterHTML,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="generateReport('${reportId}')">Skriv ut</button>`
  );
}

async function generateReport(reportId) {
  const year    = document.getElementById('pr-year')?.value    || '';
  const project = document.getElementById('pr-project')?.value || '';
  closeModal();
  showToast('Genererar rapport…');

  try {
    const [items, shows, rawTxns] = await Promise.all([
      fsGetAll('merch_items'),
      fsGetAll('merch_shows'),
      fsGetAll('merch_transactions'),
    ]);
    const txns = rawTxns.map(t => t.direction ? t : {
      ...t,
      direction: t.type === 'sale' ? 'in' : 'ut',
      category:  t.category || (t.type === 'production' ? 'Övrigt' : 'Försäljning'),
      project:   t.project || t.itemNamn || t.showNamn || '',
    });

    let html = '';
    if      (reportId === 'inventory')  html = buildInventoryReport(items);
    else if (reportId === 'order')      html = buildOrderReport(items, shows);
    else if (reportId === 'financial')  html = buildFinancialReport(txns, year, project);
    else if (reportId === 'sales')      html = buildSalesReport(shows, items, year);
    else if (reportId === 'skatbo')     html = buildSkatboReport(txns, year);
    else if (reportId === 'tour')       html = buildTourReport(txns, shows, project);
    else if (reportId === 'annual')     html = buildAnnualReport(txns, shows, items, year);

    openPrintWindow(html);
  } catch(err) {
    handleFsError(err, 'Kunde inte generera rapport');
  }
}

/* ── PRINT WINDOW ── */
function openPrintWindow(bodyHTML) {
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="sv"><head>
    <meta charset="UTF-8"/>
    <title>Doomherre — rapport</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family: Georgia, serif; color: #111; padding: 24px; font-size: 12px; }
      h1 { font-size: 20px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      h2 { font-size: 14px; font-weight: 700; margin: 18px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      h3 { font-size: 12px; font-weight: 700; margin: 12px 0 4px; }
      .header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end; }
      .meta { font-size: 10px; color: #555; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
      th { background: #f0f0f0; border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; }
      .right { text-align: right; }
      .bold { font-weight: 700; }
      .muted { color: #777; }
      .total-row td { background: #f8f8f8; font-weight: 700; border-top: 2px solid #999; }
      .section-divider { border-top: 2px solid #111; margin: 20px 0 12px; }
      .badge { display:inline-block; background:#eee; border-radius:3px; padding:1px 5px; font-size:10px; }
      .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
      .stat-box { border: 1px solid #ddd; border-radius:4px; padding:10px 14px; }
      .stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#777; margin-bottom:4px; }
      .stat-value { font-size:18px; font-weight:700; }
      @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
        @page { margin: 15mm; }
      }
    </style>
  </head><body>
    <div class="no-print" style="background:#f5f5f5;border-bottom:1px solid #ddd;padding:10px 24px;display:flex;justify-content:space-between;align-items:center;margin:-24px -24px 24px">
      <span style="font-size:13px;color:#555">Förhandsvisning — klicka Skriv ut för att skriva ut</span>
      <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:13px">🖨 Skriv ut</button>
    </div>
    ${bodyHTML}
  </body></html>`);
  win.document.close();
}

/* ── FMT HELPERS (print context) ── */
function pfmt(n) { return new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK',maximumFractionDigits:0}).format(n||0); }
function pdate(d) { return d ? new Date(d).toLocaleDateString('sv-SE') : '—'; }
function pheader(title, subtitle) {
  return `<div class="header">
    <div>
      <div class="meta">DOOMHERRE MERCH</div>
      <h1>${title}</h1>
      ${subtitle ? `<div class="meta" style="margin-top:4px">${subtitle}</div>` : ''}
    </div>
    <div class="meta" style="text-align:right">Genererad: ${new Date().toLocaleDateString('sv-SE', {year:'numeric',month:'long',day:'numeric'})}</div>
  </div>`;
}

/* ── 1. LAGERRAPPORT ── */
function buildInventoryReport(items) {
  const active = sortByCategory(items.filter(i => i.status === 'active'));
  let totalValue = 0, totalCost = 0;

  const rows = active.map(item => {
    if (item.category === 'clothing') {
      const colors = Object.keys(item.variants||{}).filter(c=>c!=='_');
      return colors.map(color => {
        const varStocks = item.variants[color] || {};
        const sizeRows = ALL_SIZES.filter(sz => (varStocks[sz]?.stock||0) > 0).map(sz => {
          const v = varStocks[sz];
          return `<tr><td style="padding-left:24px;color:#555">${item.name} — ${color} / ${sz}</td>
            <td class="right">${v.stock}</td><td class="right">${v.sålda||0}</td>
            <td class="right">${item.costPerUnit ? pfmt(item.costPerUnit) : '—'}</td>
            <td class="right">${item.salePrice ? pfmt(item.salePrice) : '—'}</td>
            <td class="right">${item.costPerUnit ? pfmt(v.stock * item.costPerUnit) : '—'}</td></tr>`;
        }).join('');
        return sizeRows;
      }).join('');
    } else {
      const stock = item.variants?.['_']?.stock || 0;
      const sold  = item.variants?.['_']?.sålda || 0;
      const val   = item.costPerUnit ? stock * item.costPerUnit : 0;
      totalValue += item.salePrice ? stock * item.salePrice : 0;
      totalCost  += val;
      return `<tr><td class="bold">${item.name}</td>
        <td class="right">${stock}</td><td class="right">${sold}</td>
        <td class="right">${item.costPerUnit ? pfmt(item.costPerUnit) : '—'}</td>
        <td class="right">${item.salePrice ? pfmt(item.salePrice) : '—'}</td>
        <td class="right">${val ? pfmt(val) : '—'}</td></tr>`;
    }
  }).join('');

  return pheader('Lagerrapport', `Per ${new Date().toLocaleDateString('sv-SE')}`) + `
    <table>
      <thead><tr><th>Artikel / variant</th><th class="right">I lager</th><th class="right">Sålda</th>
        <th class="right">Kost/enhet</th><th class="right">Säljpris</th><th class="right">Lagervärde</th></tr></thead>
      <tbody>${rows}
        <tr class="total-row"><td colspan="5">Totalt lagervärde (inköpskostnad)</td><td class="right">${pfmt(totalCost)}</td></tr>
      </tbody>
    </table>`;
}

/* ── 2. BESTÄLLNINGSRAPPORT ── */
function buildOrderReport(items, shows) {
  const upcoming = shows.filter(s => s.status === 'upcoming');
  const totalPack = {};
  for (const show of upcoming) {
    for (const p of (show.pack||[])) {
      if (!totalPack[p.itemId]) totalPack[p.itemId] = {};
      if (p.variants && Object.keys(p.variants).length) {
        for (const [color, sizes] of Object.entries(p.variants)) {
          if (!totalPack[p.itemId][color]) totalPack[p.itemId][color] = {};
          for (const [sz, qty] of Object.entries(sizes)) {
            totalPack[p.itemId][color][sz] = (totalPack[p.itemId][color][sz]||0) + qty;
          }
        }
      } else {
        totalPack[p.itemId]['_'] = (totalPack[p.itemId]['_']||0) + (p.qty||0);
      }
    }
  }

  const shortages = [];
  for (const item of items) {
    const pack = totalPack[item.id];
    if (!pack) continue;
    if (item.category === 'clothing') {
      for (const [color, sizes] of Object.entries(pack)) {
        for (const [sz, packed] of Object.entries(sizes)) {
          const stock = item.variants?.[color]?.[sz]?.stock || 0;
          if (packed > stock) shortages.push({ name:item.name, variant:`${color} / ${sz}`, stock, packed, shortage: packed-stock });
        }
      }
    } else {
      const stock = item.variants?.['_']?.stock || 0;
      const packed = pack['_'] || 0;
      if (packed > stock) shortages.push({ name:item.name, variant:'—', stock, packed, shortage: packed-stock });
    }
  }

  if (!shortages.length) return pheader('Beställningsrapport') + '<p style="color:#777;margin-top:16px">Inga brister — allt är täckt av nuvarande lager.</p>';

  const rows = shortages.map(s => `<tr>
    <td class="bold">${s.name}</td><td>${s.variant}</td>
    <td class="right">${s.stock}</td><td class="right">${s.packed}</td>
    <td class="right bold" style="color:#c00">+${s.shortage}</td></tr>`).join('');

  return pheader('Beställningsrapport', `Baserat på ${upcoming.length} kommande spelning${upcoming.length!==1?'ar':''}`) + `
    <table>
      <thead><tr><th>Artikel</th><th>Variant</th><th class="right">I lager</th>
        <th class="right">Packat totalt</th><th class="right">Att beställa</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── 3. FINANSIELL RAPPORT ── */
function buildFinancialReport(txns, year, project) {
  let filtered = txns;
  if (year)    filtered = filtered.filter(t => t.date?.startsWith(year));
  if (project) filtered = filtered.filter(t => t.project === project);

  const subtitle = [year, project].filter(Boolean).join(' · ') || 'Alla år och projekt';
  const persons  = [...new Set(filtered.map(t=>t.person).filter(Boolean))].sort();

  const personSection = persons.map(person => {
    const mine = filtered.filter(t=>t.person===person).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const totalUt = mine.filter(t=>t.direction==='ut').reduce((s,t)=>s+(t.amount||0),0);
    const totalIn = mine.filter(t=>t.direction==='in').reduce((s,t)=>s+(t.amount||0),0);
    const rows = mine.map(t=>`<tr>
      <td>${pdate(t.date)}</td><td>${t.direction==='ut'?'Utgift':'Intäkt'}</td>
      <td>${t.category||'—'}</td><td>${t.project||'—'}</td><td>${t.description||t.notes||'—'}</td>
      <td class="right" style="color:${t.direction==='in'?'#060':'#900'}">${t.direction==='in'?'+':'−'}${pfmt(t.amount)}</td></tr>`).join('');
    return `<h2>${person}</h2>
      <table><thead><tr><th>Datum</th><th>Typ</th><th>Kategori</th><th>Projekt</th><th>Beskrivning</th><th class="right">Belopp</th></tr></thead>
      <tbody>${rows}
        <tr class="total-row"><td colspan="5">Totalt ut / in</td><td class="right">−${pfmt(totalUt)} / +${pfmt(totalIn)}</td></tr>
      </tbody></table>`;
  }).join('');

  const grandUt = filtered.filter(t=>t.direction==='ut').reduce((s,t)=>s+(t.amount||0),0);
  const grandIn = filtered.filter(t=>t.direction==='in').reduce((s,t)=>s+(t.amount||0),0);

  return pheader('Finansiell rapport', subtitle) + `
    <div class="grid2" style="margin-bottom:20px">
      <div class="stat-box"><div class="stat-label">Totalt ut</div><div class="stat-value">−${pfmt(grandUt)}</div></div>
      <div class="stat-box"><div class="stat-label">Totalt in</div><div class="stat-value">+${pfmt(grandIn)}</div></div>
    </div>
    ${personSection}`;
}

/* ── 4. FÖRSÄLJNINGSSTATISTIK ── */
function buildSalesReport(shows, items, year) {
  let doneShows = shows.filter(s=>s.status==='complete');
  if (year) doneShows = doneShows.filter(s=>s.date?.startsWith(year));
  doneShows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));

  const itemMap = {};
  let grandTotal = 0;

  for (const show of doneShows) {
    for (const sale of (show.sales||[])) {
      for (const line of (sale.lines||[])) {
        const item = items.find(i=>i.id===line.itemId);
        const name = item?.name || line.itemId;
        const earned = (line.qty||0)*(line.price||0);
        grandTotal += earned;
        if (!itemMap[name]) itemMap[name] = { qty:0, revenue:0 };
        itemMap[name].qty     += (line.qty||0);
        itemMap[name].revenue += earned;
      }
    }
  }

  const showRows = doneShows.map(show => {
    const earned = (show.sales||[]).reduce((s,sale)=>s+sale.lines.reduce((ss,l)=>ss+(l.qty||0)*(l.price||0),0),0);
    const qty    = (show.sales||[]).reduce((s,sale)=>s+sale.lines.reduce((ss,l)=>ss+(l.qty||0),0),0);
    return `<tr><td>${show.name}</td><td>${pdate(show.date)}</td><td>${show.venue||'—'}</td>
      <td class="right">${qty}</td><td class="right">${pfmt(earned)}</td></tr>`;
  }).join('');

  const itemRows = Object.entries(itemMap).sort((a,b)=>b[1].revenue-a[1].revenue).map(([name,d])=>`
    <tr><td>${name}</td><td class="right">${d.qty}</td><td class="right">${pfmt(d.revenue)}</td></tr>`).join('');

  const avgPerShow = doneShows.length > 0 ? grandTotal / doneShows.length : 0;

  return pheader('Försäljningsstatistik', year || 'Alla år') + `
    <div class="grid2" style="margin-bottom:20px">
      <div class="stat-box"><div class="stat-label">Total intäkt</div><div class="stat-value">${pfmt(grandTotal)}</div></div>
      <div class="stat-box"><div class="stat-label">Snitt per spelning</div><div class="stat-value">${pfmt(avgPerShow)}</div></div>
    </div>
    <h2>Intäkt per spelning</h2>
    <table><thead><tr><th>Spelning</th><th>Datum</th><th>Plats</th><th class="right">Sålda</th><th class="right">Intäkt</th></tr></thead>
    <tbody>${showRows || '<tr><td colspan="5" style="color:#777">Inga avslutade spelningar.</td></tr>'}</tbody></table>
    <h2>Bäst säljande artiklar</h2>
    <table><thead><tr><th>Artikel</th><th class="right">Antal sålda</th><th class="right">Intäkt</th></tr></thead>
    <tbody>${itemRows || '<tr><td colspan="3" style="color:#777">Ingen försäljningsdata.</td></tr>'}</tbody></table>`;
}

/* ── 5. SKATBO-RAPPORT ── */
function buildSkatboReport(txns, year) {
  let filtered = txns.filter(t=>t.person==='Skatbo');
  if (year) filtered = filtered.filter(t=>t.date?.startsWith(year));
  filtered.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const totalIn  = filtered.filter(t=>t.direction==='in').reduce((s,t)=>s+(t.amount||0),0);
  const totalUt  = filtered.filter(t=>t.direction==='ut').reduce((s,t)=>s+(t.amount||0),0);
  const netto    = totalIn - totalUt;

  const rows = filtered.map(t=>`<tr>
    <td>${pdate(t.date)}</td><td>${t.direction==='ut'?'Utgift':'Intäkt'}</td>
    <td>${t.category||'—'}</td><td>${t.project||'—'}</td><td>${t.description||t.notes||'—'}</td>
    <td class="right" style="color:${t.direction==='in'?'#060':'#900'}">${t.direction==='in'?'+':'−'}${pfmt(t.amount)}</td></tr>`).join('');

  return pheader('Skatbo-rapport (bandkassa)', year||'Alla år') + `
    <div class="grid2" style="margin-bottom:20px">
      <div class="stat-box"><div class="stat-label">Totalt in</div><div class="stat-value">+${pfmt(totalIn)}</div></div>
      <div class="stat-box"><div class="stat-label">Totalt ut</div><div class="stat-value">−${pfmt(totalUt)}</div></div>
      <div class="stat-box" style="margin-top:12px"><div class="stat-label">Netto</div><div class="stat-value" style="color:${netto>=0?'#060':'#c00'}">${netto>=0?'+':''}${pfmt(netto)}</div></div>
    </div>
    <h2>Alla transaktioner</h2>
    <table><thead><tr><th>Datum</th><th>Typ</th><th>Kategori</th><th>Projekt</th><th>Beskrivning</th><th class="right">Belopp</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="color:#777">Inga transaktioner.</td></tr>'}
      <tr class="total-row"><td colspan="5">Netto</td><td class="right" style="color:${netto>=0?'#060':'#c00'}">${netto>=0?'+':''}${pfmt(netto)}</td></tr>
    </tbody></table>`;
}

/* ── 6. TURNÉRAPPORT ── */
function buildTourReport(txns, shows, project) {
  let filtTxns  = project ? txns.filter(t=>t.project===project) : txns;
  let filtShows = shows.filter(s=>s.status==='complete');

  const tourCosts = filtTxns.filter(t=>t.direction==='ut' && ['Turné / Bokning','Transport / Logi'].includes(t.category));
  const totalCost = tourCosts.reduce((s,t)=>s+(t.amount||0),0);

  let showRevenue = 0;
  for (const show of filtShows) {
    for (const sale of (show.sales||[])) {
      for (const line of (sale.lines||[])) showRevenue += (line.qty||0)*(line.price||0);
    }
  }
  const netto = showRevenue - totalCost;

  const costRows = tourCosts.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(t=>`<tr>
    <td>${pdate(t.date)}</td><td>${t.person}</td><td>${t.category}</td>
    <td>${t.description||t.notes||'—'}</td><td class="right">−${pfmt(t.amount)}</td></tr>`).join('');

  const showRows = filtShows.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(show=>{
    const earned = (show.sales||[]).reduce((s,sale)=>s+(sale.lines||[]).reduce((ss,l)=>ss+(l.qty||0)*(l.price||0),0),0);
    return `<tr><td>${show.name}</td><td>${pdate(show.date)}</td><td>${show.venue||'—'}</td>
      <td class="right">+${pfmt(earned)}</td></tr>`;
  }).join('');

  return pheader('Turnérapport', project||'Alla projekt') + `
    <div class="grid2" style="margin-bottom:20px">
      <div class="stat-box"><div class="stat-label">Turnékostnader</div><div class="stat-value">−${pfmt(totalCost)}</div></div>
      <div class="stat-box"><div class="stat-label">Spelningsintäkter</div><div class="stat-value">+${pfmt(showRevenue)}</div></div>
      <div class="stat-box" style="margin-top:12px"><div class="stat-label">Netto</div><div class="stat-value" style="color:${netto>=0?'#060':'#c00'}">${netto>=0?'+':''}${pfmt(netto)}</div></div>
    </div>
    <h2>Turnékostnader</h2>
    <table><thead><tr><th>Datum</th><th>Person</th><th>Kategori</th><th>Beskrivning</th><th class="right">Belopp</th></tr></thead>
    <tbody>${costRows||'<tr><td colspan="5" style="color:#777">Inga turnékostnader.</td></tr>'}</tbody></table>
    <h2>Spelningsintäkter</h2>
    <table><thead><tr><th>Spelning</th><th>Datum</th><th>Plats</th><th class="right">Intäkt</th></tr></thead>
    <tbody>${showRows||'<tr><td colspan="4" style="color:#777">Inga avslutade spelningar.</td></tr>'}</tbody></table>`;
}

/* ── 7. ÅRSSAMMANFATTNING ── */
function buildAnnualReport(txns, shows, items, year) {
  const y = year || new Date().getFullYear().toString();
  const yTxns  = txns.filter(t=>t.date?.startsWith(y));
  const yShows = shows.filter(s=>s.date?.startsWith(y) && s.status==='complete');

  const totalUt  = yTxns.filter(t=>t.direction==='ut').reduce((s,t)=>s+(t.amount||0),0);
  const totalIn  = yTxns.filter(t=>t.direction==='in').reduce((s,t)=>s+(t.amount||0),0);
  const netto    = totalIn - totalUt;

  let showRev = 0, showQty = 0;
  const itemSales = {};
  for (const show of yShows) {
    for (const sale of (show.sales||[])) {
      for (const line of (sale.lines||[])) {
        showRev += (line.qty||0)*(line.price||0);
        showQty += (line.qty||0);
        const item = items.find(i=>i.id===line.itemId);
        const name = item?.name||line.itemId;
        if (!itemSales[name]) itemSales[name]=0;
        itemSales[name]+=(line.qty||0)*(line.price||0);
      }
    }
  }
  const topItem = Object.entries(itemSales).sort((a,b)=>b[1]-a[1])[0];
  const lagervarde = items.filter(i=>i.status==='active').reduce((s,i)=>{
    if (i.category==='clothing') {
      for (const color of Object.keys(i.variants||{}).filter(c=>c!=='_'))
        for (const sz of ALL_SIZES) s += (i.variants[color]?.[sz]?.stock||0)*(i.costPerUnit||0);
    } else s += (i.variants?.['_']?.stock||0)*(i.costPerUnit||0);
    return s;
  },0);

  return pheader(`Årssammanfattning ${y}`) + `
    <div class="grid2" style="margin-bottom:20px">
      <div class="stat-box"><div class="stat-label">Totalt ut</div><div class="stat-value">−${pfmt(totalUt)}</div></div>
      <div class="stat-box"><div class="stat-label">Totalt in</div><div class="stat-value">+${pfmt(totalIn)}</div></div>
      <div class="stat-box"><div class="stat-label">Netto</div><div class="stat-value" style="color:${netto>=0?'#060':'#c00'}">${netto>=0?'+':''}${pfmt(netto)}</div></div>
      <div class="stat-box"><div class="stat-label">Spelningar (avslutade)</div><div class="stat-value">${yShows.length}</div></div>
      <div class="stat-box"><div class="stat-label">Merch-intäkt</div><div class="stat-value">${pfmt(showRev)}</div></div>
      <div class="stat-box"><div class="stat-label">Enheter sålda</div><div class="stat-value">${showQty}</div></div>
      <div class="stat-box"><div class="stat-label">Lagervärde (årets slut)</div><div class="stat-value">${pfmt(lagervarde)}</div></div>
      ${topItem ? `<div class="stat-box"><div class="stat-label">Bäst säljande</div><div class="stat-value" style="font-size:14px">${topItem[0]}</div><div style="font-size:11px;color:#555">${pfmt(topItem[1])}</div></div>` : ''}
    </div>
    <h2>Spelningar ${y}</h2>
    <table><thead><tr><th>Spelning</th><th>Datum</th><th>Plats</th></tr></thead>
    <tbody>${yShows.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(s=>`<tr><td>${s.name}</td><td>${pdate(s.date)}</td><td>${s.venue||'—'}</td></tr>`).join('')||'<tr><td colspan="3" style="color:#777">Inga spelningar detta år.</td></tr>'}</tbody></table>`;
}
