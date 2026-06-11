/* js/pages/investment.js */

const EXPENSE_CATEGORIES = [
  'Repetitionslokal',
  'Inspelning / Studio',
  'Mastering',
  'Turné / Transport',
  'Bokning',
  'Marknadsföring',
  'Trycksaker',
  'Övrigt',
];

const ALBUMS = ['Bonegoat', 'Plaguelords', 'Ingen koppling'];

registerPage('investment', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Ekonomi</div></div>
      <div style="display:flex;gap:8px" id="invest-header-actions"></div>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:24px">
      <button id="tab-investering" class="tab-btn tab-active" onclick="switchInvestTab('investering')">Investering</button>
      <button id="tab-utgifter"    class="tab-btn"            onclick="switchInvestTab('utgifter')">Utgifter</button>
    </div>
    <div id="invest-content"></div>
  `;
  switchInvestTab('investering');
});

function switchInvestTab(tab) {
  document.getElementById('tab-investering').className = 'tab-btn' + (tab === 'investering' ? ' tab-active' : '');
  document.getElementById('tab-utgifter').className    = 'tab-btn' + (tab === 'utgifter'    ? ' tab-active' : '');
  const actions = document.getElementById('invest-header-actions');
  if (tab === 'investering') {
    actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openLogPayment()">+ Logga betalning</button>`;
    renderInvestering();
  } else {
    actions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openLogExpense()">+ Lägg till utgift</button>`;
    renderUtgifter();
  }
}

/* ── INVESTERING TAB ── */

async function renderInvestering() {
  const el = document.getElementById('invest-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Laddar…</div>';

  try {
    const transactions = await fsGetAll('merch_transactions');
    const productions  = transactions.filter(t => t.type === 'production');
    const sales        = transactions.filter(t => t.type === 'sale');

    const totalInvested = productions.reduce((s, t) => s + (t.amount || 0), 0);
    const totalRecouped = sales.reduce((s, t) => s + (t.amount || 0), 0);
    const profit        = Math.max(0, totalRecouped - totalInvested);
    const stillOwed     = Math.max(0, totalInvested - totalRecouped);

    const personData = {};
    for (const p of PERSONS) {
      const inv = productions.filter(t => t.person === p).reduce((s, t) => s + (t.amount||0), 0);
      personData[p] = { invested: inv };
    }

    const totalInv = Object.values(personData).reduce((s, p) => s + p.invested, 0);
    for (const p of PERSONS) {
      const share = totalInv > 0 ? personData[p].invested / totalInv : 0;
      personData[p].recouped = Math.min(personData[p].invested, totalRecouped * share);
      personData[p].owed     = Math.max(0, personData[p].invested - personData[p].recouped);
    }

    const pct = totalInvested > 0 ? Math.min(100, Math.round(totalRecouped / totalInvested * 100)) : 0;

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Totalt investerat</div><div class="stat-value">${fmt(totalInvested)}</div></div>
        <div class="stat-card"><div class="stat-label">Återvunnet</div><div class="stat-value gold">${fmt(totalRecouped)}</div></div>
        <div class="stat-card"><div class="stat-label">Kvar att återvinna</div><div class="stat-value amber">${fmt(stillOwed)}</div></div>
        <div class="stat-card"><div class="stat-label">Vinst (efter återvinning)</div><div class="stat-value green">${fmt(profit)}</div></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <div class="section">
          <div class="section-header"><div class="section-title">Per person</div></div>
          <div class="card">
            ${PERSONS.map(p => {
              const d = personData[p];
              const pPct = d.invested > 0 ? Math.min(100, Math.round(d.recouped / d.invested * 100)) : 0;
              return `<div class="card-body" style="border-bottom:1px solid var(--bg3)">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
                  <span style="font-weight:500">${p}</span>
                  <span style="font-size:12px;color:${d.owed>0?'var(--amber)':'var(--green)'}">
                    ${d.owed > 0 ? `${fmt(d.owed)} skyldig` : 'Återvunnet'}
                  </span>
                </div>
                <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
                  Betalat ${fmt(d.invested)} · Återvunnet ${fmt(d.recouped)}
                </div>
                <div class="progress-bar">
                  <div class="progress-fill${pPct>=100?' full':''}" style="width:${pPct}%"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="section">
          <div class="section-header"><div class="section-title">Samlad progress</div></div>
          <div class="card">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px">
                <span style="color:var(--text2)">Total återvinningsprogress</span>
                <span style="color:var(--gold)">${pct}%</span>
              </div>
              <div class="progress-bar" style="height:10px">
                <div class="progress-fill${pct>=100?' full':''}" style="width:${pct}%"></div>
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:8px">
                ${fmt(totalRecouped)} av ${fmt(totalInvested)} återvunna
              </div>
              ${profit > 0 ? `<div style="margin-top:12px;padding:10px;background:var(--green-bg);border-radius:6px;font-size:12px;color:var(--green)">
                Investeringar återvunna. Vinst att dela: ${fmt(profit)} (${fmt(profit/3)} vardera)
              </div>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Alla transaktioner</div>
          <button class="btn btn-ghost btn-sm" onclick="openLogPayment()">+ Logga betalning</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Datum</th><th>Person</th><th>Artikel / Spelning</th><th>Typ</th><th style="text-align:right">Belopp</th><th></th></tr></thead>
              <tbody>
                ${transactions.length
                  ? [...transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(t => `<tr>
                    <td style="color:var(--text2)">${fmtShortDate(t.date)}</td>
                    <td>${t.person||'All'}</td>
                    <td style="color:var(--text2)">${t.itemNamn||t.showNamn||t.notes||'—'}</td>
                    <td><span class="badge ${t.type==='production'?'badge-artwork':'badge-done'}">${t.type}</span></td>
                    <td style="text-align:right;color:${t.type==='production'?'var(--amber)':'var(--green)'}">
                      ${t.type==='production'?'−':'+'} ${fmt(t.amount||0)}
                    </td>
                    <td><button class="btn btn-danger btn-sm" onclick="deleteTransaction('${t.id}')">Ta bort</button></td>
                  </tr>`).join('')
                  : '<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:24px">Inga transaktioner ännu</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Fel: ${err.message}</div>`;
  }
}

function openLogPayment() {
  openModal('Logga betalning',
    `<div class="field"><label>Typ</label>
      <select id="tp-type">
        <option value="production">Produktion (investering)</option>
        <option value="sale">Försäljning / intäkt</option>
      </select>
    </div>
    <div class="field"><label>Person</label>
      <select id="tp-person">
        ${PERSONS.map(p => `<option value="${p}">${p}</option>`).join('')}
        <option value="All">Alla (delas lika)</option>
      </select>
    </div>
    <div class="field-row">
      <div class="field"><label>Belopp (kr)</label><input id="tp-amount" type="number" placeholder="0"/></div>
      <div class="field"><label>Datum</label><input id="tp-date" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
    </div>
    <div class="field"><label>Artikel / anteckning</label><input id="tp-note" type="text" placeholder="t.ex. Plaguelords skjorta, tryckkostnader"/></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="savePayment()">Logga betalning</button>`
  );
}

async function savePayment() {
  const amount = parseFloat(document.getElementById('tp-amount')?.value) || 0;
  if (!amount) { showToast('Belopp krävs', 'error'); return; }

  const data = {
    type:   document.getElementById('tp-type').value,
    person: document.getElementById('tp-person').value,
    amount,
    date:   document.getElementById('tp-date').value,
    notes:  document.getElementById('tp-note').value.trim(),
    createdAt: now(),
  };

  try {
    await fsAdd('merch_transactions', data);
    showToast('Betalning loggad');
    closeModal();
    await renderInvestering();
  } catch(err) {
    showToast('Sparningen misslyckades: ' + err.message, 'error');
  }
}

async function deleteTransaction(id) {
  confirmAction('Ta bort den här transaktionen?', async () => {
    await fsDelete('merch_transactions', id);
    showToast('Transaktion borttagen');
    await renderInvestering();
  });
}

/* ── UTGIFTER TAB ── */

async function renderUtgifter() {
  const el = document.getElementById('invest-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Laddar…</div>';

  try {
    const expenses = await fsGetAll('merch_expenses');
    const sorted   = [...expenses].sort((a, b) => (b.date||'').localeCompare(a.date||''));
    const total    = expenses.reduce((s, e) => s + (e.amount || 0), 0);

    // Totals per album
    const albumTotals = {};
    for (const album of ALBUMS) albumTotals[album] = 0;
    for (const e of expenses) {
      const key = e.album || 'Ingen koppling';
      albumTotals[key] = (albumTotals[key] || 0) + (e.amount || 0);
    }

    // Totals per category
    const catTotals = {};
    for (const e of expenses) {
      catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
    }
    const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    el.innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat-card"><div class="stat-label">Totala utgifter</div><div class="stat-value amber">${fmt(total)}</div></div>
        ${ALBUMS.filter(a => a !== 'Ingen koppling').map(album => `
          <div class="stat-card">
            <div class="stat-label">${album}</div>
            <div class="stat-value" style="font-size:18px">${fmt(albumTotals[album] || 0)}</div>
          </div>`).join('')}
      </div>

      ${topCats.length ? `
      <div class="section" style="margin-bottom:24px">
        <div class="section-header"><div class="section-title">Per kategori</div></div>
        <div class="card">
          <div class="card-body" style="display:flex;flex-wrap:wrap;gap:10px">
            ${topCats.map(([cat, amt]) => `
              <div style="background:var(--bg3);border-radius:6px;padding:8px 14px;font-size:12px">
                <div style="color:var(--text2);margin-bottom:2px">${cat}</div>
                <div style="color:var(--amber);font-weight:500">${fmt(amt)}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>` : ''}

      <div class="section">
        <div class="section-header">
          <div class="section-title">Alla utgifter</div>
          <button class="btn btn-ghost btn-sm" onclick="openLogExpense()">+ Lägg till utgift</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Kategori</th>
                  <th>Beskrivning</th>
                  <th>Album</th>
                  <th>Betald av</th>
                  <th style="text-align:right">Belopp</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${sorted.length
                  ? sorted.map(e => `<tr>
                      <td style="color:var(--text2)">${fmtShortDate(e.date)}</td>
                      <td><span class="badge badge-artwork" style="font-size:10px">${e.category||'—'}</span></td>
                      <td style="color:var(--text2)">${e.description||'—'}</td>
                      <td style="color:var(--text3);font-size:12px">${e.album && e.album !== 'Ingen koppling' ? e.album : '—'}</td>
                      <td style="font-size:12px">${e.person||'—'}</td>
                      <td style="text-align:right;color:var(--amber)">− ${fmt(e.amount||0)}</td>
                      <td><button class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">Ta bort</button></td>
                    </tr>`).join('')
                  : '<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:24px">Inga utgifter loggade ännu</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Fel: ${err.message}</div>`;
  }
}

function openLogExpense(existingId) {
  openModal('Logga utgift',
    `<div class="field-row">
      <div class="field"><label>Kategori</label>
        <select id="ex-category">
          ${EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Album</label>
        <select id="ex-album">
          ${ALBUMS.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field"><label>Beskrivning</label>
      <input id="ex-description" type="text" placeholder="t.ex. Studio Cobra, 2 dagar"/>
    </div>
    <div class="field-row">
      <div class="field"><label>Belopp (kr)</label><input id="ex-amount" type="number" placeholder="0"/></div>
      <div class="field"><label>Datum</label><input id="ex-date" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
    </div>
    <div class="field"><label>Betald av</label>
      <select id="ex-person">
        ${PERSONS.map(p => `<option value="${p}">${p}</option>`).join('')}
        <option value="Alla">Alla (delas lika)</option>
      </select>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveExpense()">Spara utgift</button>`
  );
}

async function saveExpense() {
  const amount = parseFloat(document.getElementById('ex-amount')?.value) || 0;
  if (!amount) { showToast('Belopp krävs', 'error'); return; }
  const description = document.getElementById('ex-description').value.trim();
  if (!description) { showToast('Beskrivning krävs', 'error'); return; }

  const data = {
    category:    document.getElementById('ex-category').value,
    album:       document.getElementById('ex-album').value,
    description,
    amount,
    date:        document.getElementById('ex-date').value,
    person:      document.getElementById('ex-person').value,
    createdAt:   now(),
  };

  try {
    await fsAdd('merch_expenses', data);
    showToast('Utgift sparad');
    closeModal();
    await renderUtgifter();
  } catch(err) {
    showToast('Sparningen misslyckades: ' + err.message, 'error');
  }
}

async function deleteExpense(id) {
  confirmAction('Ta bort den här utgiften?', async () => {
    await fsDelete('merch_expenses', id);
    showToast('Utgift borttagen');
    await renderUtgifter();
  });
}
