/* js/pages/investment.js */

const EXPENSE_CATEGORIES = [
  'Inspelning / Studio',
  'Mixning / Mastering',
  'Pressning (vinyl, CD, kassett)',
  'Merch-produktion',
  'Artwork / Foto / Video',
  'Marknadsföring / PR',
  'Trycksaker',
  'Turné / Bokning',
  'Transport / Logi',
  'Övrigt',
];

/* Normalize legacy transactions (type:'production'/'sale') to new direction model */
function normalizeTxn(t) {
  if (t.direction) return t;
  return {
    ...t,
    direction: t.type === 'sale' ? 'in' : 'ut',
    category:  t.category || (t.type === 'sale' ? 'Försäljning' : 'Övrigt'),
    project:   t.project  || t.itemNamn || t.showNamn || '',
  };
}

registerPage('investment', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Ekonomi</div></div>
      <button class="btn btn-primary btn-sm" onclick="openLogTxn()">+ Logga</button>
    </div>
    <div id="invest-content"></div>
  `;
  await renderEkonomi();
});

async function renderEkonomi() {
  const el = document.getElementById('invest-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Laddar…</div>';

  try {
    const raw      = await fsGetAll('merch_transactions');
    const txns     = raw.map(normalizeTxn);
    const utgifter = txns.filter(t => t.direction === 'ut');
    const intakter = txns.filter(t => t.direction === 'in');

    const totalUt  = utgifter.reduce((s, t) => s + (t.amount || 0), 0);
    const totalIn  = intakter.reduce((s, t) => s + (t.amount || 0), 0);
    const netto    = totalIn - totalUt;

    /* ── Per-person summaries ── */
    const personSummary = {};
    for (const p of PERSONS) personSummary[p] = { ut: 0, in: 0 };
    for (const t of txns) {
      if (!personSummary[t.person]) personSummary[t.person] = { ut: 0, in: 0 };
      if (t.direction === 'ut') personSummary[t.person].ut += (t.amount || 0);
      else                       personSummary[t.person].in += (t.amount || 0);
    }

    /* ── Pie data ── */
    const personPie   = PERSONS.map(p => ({ label: p, value: personSummary[p]?.ut || 0 }))
                               .filter(d => d.value > 0);

    const catMap = {};
    for (const t of utgifter) catMap[t.category] = (catMap[t.category] || 0) + (t.amount || 0);
    const catPie = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));

    const projMap = {};
    for (const t of utgifter) {
      const key = t.project || 'Övrigt';
      projMap[key] = (projMap[key] || 0) + (t.amount || 0);
    }
    const projPie = Object.entries(projMap).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));

    /* ── All unique projects for autocomplete ── */
    const allProjects = [...new Set(txns.map(t => t.project).filter(Boolean))];

    /* ── Per-person detail rows ── */
    const personRows = PERSONS.map(p => {
      const mine = [...txns].filter(t => t.person === p)
                            .sort((a,b) => (b.date||'').localeCompare(a.date||''));
      if (!mine.length) return '';
      const myUt = mine.filter(t=>t.direction==='ut').reduce((s,t)=>s+(t.amount||0),0);
      const myIn = mine.filter(t=>t.direction==='in').reduce((s,t)=>s+(t.amount||0),0);
      const myNetto = myIn - myUt;
      return `
        <div class="card" style="margin-bottom:12px">
          <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;
               cursor:pointer;user-select:none" onclick="togglePersonRows('${p}')">
            <div style="font-weight:500">${p}</div>
            <div style="display:flex;gap:20px;align-items:center;font-size:12px">
              <span style="color:var(--amber)">− ${fmt(myUt)}</span>
              ${myIn > 0 ? `<span style="color:var(--green)">+ ${fmt(myIn)}</span>` : ''}
              <span style="color:${myNetto>=0?'var(--green)':'var(--red)'}">
                Netto: ${myNetto>=0?'+':''}${fmt(myNetto)}
              </span>
              <span style="color:var(--text3);font-size:16px" id="chevron-${p}">▸</span>
            </div>
          </div>
          <div id="person-rows-${p}" style="display:none;border-top:1px solid var(--border)">
            <div class="table-wrap">
              <table>
                <thead><tr><th>Datum</th><th>Kategori</th><th>Projekt</th><th>Beskrivning</th>
                  <th style="text-align:right">Belopp</th><th></th></tr></thead>
                <tbody>
                  ${mine.map(t => `<tr>
                    <td style="color:var(--text2);font-size:12px">${fmtShortDate(t.date)}</td>
                    <td><span class="badge badge-artwork" style="font-size:10px">${t.category||'—'}</span></td>
                    <td style="font-size:12px;color:var(--text2)">${t.project||'—'}</td>
                    <td style="font-size:12px;color:var(--text3)">${t.description||t.notes||'—'}</td>
                    <td style="text-align:right;color:${t.direction==='in'?'var(--green)':'var(--amber)'}">
                      ${t.direction==='in'?'+':'−'} ${fmt(t.amount||0)}
                    </td>
                    <td style="display:flex;gap:4px">
                      <button class="btn btn-ghost btn-sm" onclick="openEditTxn('${t.id}')">Redigera</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteTxn('${t.id}')">Ta bort</button>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <!-- PIE CHARTS -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
        <div class="card"><div class="card-body">
          <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:12px">Per person</div>
          ${renderPie(personPie, totalUt)}
        </div></div>
        <div class="card"><div class="card-body">
          <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:12px">Per kategori</div>
          ${renderPie(catPie, totalUt)}
        </div></div>
        <div class="card"><div class="card-body">
          <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:12px">Per projekt</div>
          ${renderPie(projPie, totalUt, true)}
        </div></div>
      </div>

      <!-- SUMMARY CARDS -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">
        <div class="stat-card"><div class="stat-label">Totalt ut</div><div class="stat-value amber">${fmt(totalUt)}</div></div>
        <div class="stat-card"><div class="stat-label">Totalt in</div><div class="stat-value green">${fmt(totalIn)}</div></div>
        <div class="stat-card"><div class="stat-label">Netto</div>
          <div class="stat-value" style="color:${netto>=0?'var(--green)':'var(--red)'}">${netto>=0?'+':''}${fmt(netto)}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${PERSONS.length},1fr);gap:12px;margin-bottom:24px">
        ${PERSONS.map(p => {
          const d = personSummary[p] || {ut:0,in:0};
          const n = d.in - d.ut;
          return `<div class="stat-card">
            <div class="stat-label">${p}</div>
            <div class="stat-value" style="font-size:16px;color:${n>=0?'var(--green)':'var(--red)'}">
              ${n>=0?'+':''}${fmt(n)}
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">
              − ${fmt(d.ut)}${d.in>0?` · + ${fmt(d.in)}`:''}
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- PER PERSON DETAIL -->
      <div class="section" style="margin-bottom:24px">
        <div class="section-header"><div class="section-title">Per person</div></div>
        ${personRows || '<div style="color:var(--text3);padding:12px">Inga transaktioner ännu</div>'}
      </div>

      <!-- ALL TRANSACTIONS -->
      <div class="section">
        <div class="section-header">
          <div class="section-title">Alla transaktioner</div>
          <button class="btn btn-ghost btn-sm" onclick="openLogTxn()">+ Logga</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Datum</th><th>Person</th><th>Kategori</th><th>Projekt</th>
                <th>Beskrivning</th><th style="text-align:right">Belopp</th><th></th></tr></thead>
              <tbody>
                ${txns.length
                  ? [...txns].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(t=>`<tr>
                      <td style="color:var(--text2);font-size:12px">${fmtShortDate(t.date)}</td>
                      <td style="font-size:12px">${t.person||'—'}</td>
                      <td><span class="badge badge-artwork" style="font-size:10px">${t.category||'—'}</span></td>
                      <td style="font-size:12px;color:var(--text2)">${t.project||'—'}</td>
                      <td style="font-size:12px;color:var(--text3)">${t.description||t.notes||'—'}</td>
                      <td style="text-align:right;color:${t.direction==='in'?'var(--green)':'var(--amber)'}">
                        ${t.direction==='in'?'+':'−'} ${fmt(t.amount||0)}
                      </td>
                      <td style="display:flex;gap:4px">
                        <button class="btn btn-ghost btn-sm" onclick="openEditTxn('${t.id}')">Redigera</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteTxn('${t.id}')">Ta bort</button>
                      </td>
                    </tr>`).join('')
                  : '<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:24px">Inga transaktioner ännu</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- hidden project list for datalist -->
      <datalist id="project-suggestions">
        ${allProjects.map(p=>`<option value="${p}">`).join('')}
      </datalist>
    `;
  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Fel: ${err.message}</div>`;
  }
}

/* ── PIE CHART (SVG) ── */
const PIE_COLORS = [
  '#D4B040','#C87941','#8B5E3C','#6B8E6B','#5B7A8B',
  '#9B6B9B','#8B8B4A','#6B9B8B','#A05050','#7B7B7B',
];

function renderPie(data, total, showAmounts = false) {
  if (!data.length || total === 0) {
    return `<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">Ingen data</div>`;
  }

  const size  = 130;
  const cx    = size / 2;
  const cy    = size / 2;
  const r     = 52;
  const inner = 28;

  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const frac  = d.value / total;
    const start = angle;
    angle      += frac * 2 * Math.PI;
    return { ...d, frac, start, end: angle, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  function arc(s, e, outerR, innerR) {
    const x1 = cx + outerR * Math.cos(s), y1 = cy + outerR * Math.sin(s);
    const x2 = cx + outerR * Math.cos(e), y2 = cy + outerR * Math.sin(e);
    const x3 = cx + innerR * Math.cos(e), y3 = cy + innerR * Math.sin(e);
    const x4 = cx + innerR * Math.cos(s), y4 = cy + innerR * Math.sin(s);
    const large = (e - s) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}
            L ${x3} ${y3} A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4} Z`;
  }

  const paths = slices.map(s =>
    `<path d="${arc(s.start, s.end, r, inner)}" fill="${s.color}" opacity="0.9"/>`
  ).join('');

  const legend = slices.map(s => `
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:4px;min-width:0">
      <div style="width:8px;height:8px;border-radius:2px;background:${s.color};flex-shrink:0"></div>
      <span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1"
            title="${s.label}">${s.label}</span>
      ${showAmounts
        ? `<span style="color:var(--text3);flex-shrink:0">${fmt(s.value)} · ${Math.round(s.frac*100)}%</span>`
        : `<span style="color:var(--text3);flex-shrink:0">${Math.round(s.frac*100)}%</span>`
      }
    </div>`).join('');

  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${paths}
        <text x="${cx}" y="${cy+1}" text-anchor="middle" dominant-baseline="middle"
              fill="var(--text)" font-size="11" font-weight="500">${fmt(total)}</text>
      </svg>
      <div style="width:100%">${legend}</div>
    </div>`;
}

/* ── TOGGLE PERSON ROWS ── */
function togglePersonRows(person) {
  const el  = document.getElementById(`person-rows-${person}`);
  const chv = document.getElementById(`chevron-${person}`);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display  = open ? 'block' : 'none';
  chv.textContent   = open ? '▾' : '▸';
}

/* ── LOG MODAL ── */
function openLogTxn() {
  openModal('Logga transaktion',
    `<div class="field-row">
      <div class="field"><label>Riktning</label>
        <select id="txn-direction">
          <option value="ut">Utgift (−)</option>
          <option value="in">Intäkt / återbetalning (+)</option>
        </select>
      </div>
      <div class="field"><label>Person</label>
        <select id="txn-person">
          ${PERSONS.map(p=>`<option value="${p}">${p}</option>`).join('')}
          <option value="Alla">Alla</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Kategori</label>
        <select id="txn-category">
          ${EXPENSE_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
          <option value="Försäljning">Försäljning</option>
        </select>
      </div>
      <div class="field"><label>Projekt</label>
        <input id="txn-project" type="text" list="project-suggestions"
               placeholder="t.ex. Plaguelords, Sommarturné 2026"/>
      </div>
    </div>
    <div class="field"><label>Beskrivning</label>
      <input id="txn-description" type="text" placeholder="Valfri fritext"/>
    </div>
    <div class="field-row">
      <div class="field"><label>Belopp (kr)</label>
        <input id="txn-amount" type="number" placeholder="0"/>
      </div>
      <div class="field"><label>Datum</label>
        <input id="txn-date" type="date" value="${new Date().toISOString().split('T')[0]}"/>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveTxn()">Spara</button>`
  );
}

async function openEditTxn(id) {
  // Load all transactions and find the one to edit
  const raw  = await fsGetAll('merch_transactions');
  const txns = raw.map(normalizeTxn);
  const t    = txns.find(x => x.id === id);
  if (!t) { showToast('Transaktion hittades inte', 'error'); return; }

  openModal('Redigera transaktion',
    `<div class="field-row">
      <div class="field"><label>Riktning</label>
        <select id="txn-direction">
          <option value="ut"  ${t.direction==='ut' ?'selected':''}>Utgift (−)</option>
          <option value="in"  ${t.direction==='in' ?'selected':''}>Intäkt / återbetalning (+)</option>
        </select>
      </div>
      <div class="field"><label>Person</label>
        <select id="txn-person">
          ${PERSONS.map(p=>`<option value="${p}" ${t.person===p?'selected':''}>${p}</option>`).join('')}
          <option value="Alla" ${t.person==='Alla'?'selected':''}>Alla</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Kategori</label>
        <select id="txn-category">
          ${EXPENSE_CATEGORIES.map(c=>`<option value="${c}" ${t.category===c?'selected':''}>${c}</option>`).join('')}
          <option value="Försäljning" ${t.category==='Försäljning'?'selected':''}>Försäljning</option>
        </select>
      </div>
      <div class="field"><label>Projekt</label>
        <input id="txn-project" type="text" list="project-suggestions"
               value="${t.project||''}" placeholder="t.ex. Plaguelords, Sommarturné 2026"/>
      </div>
    </div>
    <div class="field"><label>Beskrivning</label>
      <input id="txn-description" type="text" value="${t.description||t.notes||''}" placeholder="Valfri fritext"/>
    </div>
    <div class="field-row">
      <div class="field"><label>Belopp (kr)</label>
        <input id="txn-amount" type="number" value="${t.amount||''}"/>
      </div>
      <div class="field"><label>Datum</label>
        <input id="txn-date" type="date" value="${t.date||''}"/>
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="updateTxn('${id}')">Spara ändringar</button>`
  );
}

async function updateTxn(id) {
  const amount = parseFloat(document.getElementById('txn-amount')?.value) || 0;
  if (!amount) { showToast('Belopp krävs', 'error'); return; }

  const data = {
    direction:   document.getElementById('txn-direction').value,
    person:      document.getElementById('txn-person').value,
    category:    document.getElementById('txn-category').value,
    project:     document.getElementById('txn-project').value.trim(),
    description: document.getElementById('txn-description').value.trim(),
    amount,
    date:        document.getElementById('txn-date').value,
  };

  try {
    const existing = await fsGet('merch_transactions', id);
    await fsSet('merch_transactions', id, { ...existing, ...data });
    showToast('Transaktion uppdaterad');
    closeModal();
    await renderEkonomi();
  } catch(err) {
    showToast('Uppdatering misslyckades: ' + err.message, 'error');
  }
}

async function saveTxn() {
  const amount = parseFloat(document.getElementById('txn-amount')?.value) || 0;
  if (!amount) { showToast('Belopp krävs', 'error'); return; }

  const data = {
    direction:   document.getElementById('txn-direction').value,
    person:      document.getElementById('txn-person').value,
    category:    document.getElementById('txn-category').value,
    project:     document.getElementById('txn-project').value.trim(),
    description: document.getElementById('txn-description').value.trim(),
    amount,
    date:        document.getElementById('txn-date').value,
    createdAt:   now(),
  };

  try {
    await fsAdd('merch_transactions', data);
    showToast('Transaktion sparad');
    closeModal();
    await renderEkonomi();
  } catch(err) {
    showToast('Sparningen misslyckades: ' + err.message, 'error');
  }
}

async function deleteTxn(id) {
  confirmAction('Ta bort den här transaktionen?', async () => {
    await fsDelete('merch_transactions', id);
    showToast('Transaktion borttagen');
    await renderEkonomi();
  });
}

/* Keep old function names alive so any cached calls don't 404 */
const openLogPayment  = openLogTxn;
const deleteTransaction = deleteTxn;