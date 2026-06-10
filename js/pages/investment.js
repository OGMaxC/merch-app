/* js/pages/investment.js */

registerPage('investment', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Investment</div></div>
      <button class="btn btn-primary btn-sm" onclick="openLogPayment()">+ Log payment</button>
    </div>
    <div id="invest-content"></div>
  `;
  await renderInvestment();
});

async function renderInvestment() {
  const el = document.getElementById('invest-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Loading…</div>';

  try {
    const transactions = await fsGetAll('merch_transactions');
    const productions  = transactions.filter(t => t.type === 'production');
    const sales        = transactions.filter(t => t.type === 'sale');

    const totalInvested = productions.reduce((s, t) => s + (t.amount || 0), 0);
    const totalRecouped = sales.reduce((s, t) => s + (t.amount || 0), 0);
    const profit        = Math.max(0, totalRecouped - totalInvested);
    const stillOwed     = Math.max(0, totalInvested - totalRecouped);

    /* per-person breakdown */
    const personData = {};
    for (const p of PERSONS) {
      const inv = productions.filter(t => t.person === p).reduce((s, t) => s + (t.amount||0), 0);
      personData[p] = { invested: inv };
    }

    /* distribute recouped proportionally */
    const totalInv = Object.values(personData).reduce((s, p) => s + p.invested, 0);
    for (const p of PERSONS) {
      const share = totalInv > 0 ? personData[p].invested / totalInv : 0;
      personData[p].recouped = Math.min(personData[p].invested, totalRecouped * share);
      personData[p].owed     = Math.max(0, personData[p].invested - personData[p].recouped);
    }

    const pct = totalInvested > 0 ? Math.min(100, Math.round(totalRecouped / totalInvested * 100)) : 0;

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total invested</div><div class="stat-value">${fmt(totalInvested)}</div></div>
        <div class="stat-card"><div class="stat-label">Recouped</div><div class="stat-value gold">${fmt(totalRecouped)}</div></div>
        <div class="stat-card"><div class="stat-label">Still to recoup</div><div class="stat-value amber">${fmt(stillOwed)}</div></div>
        <div class="stat-card"><div class="stat-label">Profit (after recoup)</div><div class="stat-value green">${fmt(profit)}</div></div>
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
                    ${d.owed > 0 ? `${fmt(d.owed)} owed` : 'Recouped'}
                  </span>
                </div>
                <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
                  Paid ${fmt(d.invested)} · Recouped ${fmt(d.recouped)}
                </div>
                <div class="progress-bar">
                  <div class="progress-fill${pPct>=100?' full':''}" style="width:${pPct}%"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="section">
          <div class="section-header"><div class="section-title">Overall progress</div></div>
          <div class="card">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px">
                <span style="color:var(--text2)">Total recoup progress</span>
                <span style="color:var(--gold)">${pct}%</span>
              </div>
              <div class="progress-bar" style="height:10px">
                <div class="progress-fill${pct>=100?' full':''}" style="width:${pct}%"></div>
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:8px">
                ${fmt(totalRecouped)} of ${fmt(totalInvested)} recovered
              </div>
              ${profit > 0 ? `<div style="margin-top:12px;padding:10px;background:var(--green-bg);border-radius:6px;font-size:12px;color:var(--green)">
                Investments fully recouped. Profit to split: ${fmt(profit)} (${fmt(profit/3)} each)
              </div>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">All transactions</div>
          <button class="btn btn-ghost btn-sm" onclick="openLogPayment()">+ Log payment</button>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Person</th><th>Item / Show</th><th>Type</th><th style="text-align:right">Amount</th><th></th></tr></thead>
              <tbody>
                ${transactions.length
                  ? [...transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(t => `<tr>
                    <td style="color:var(--text2)">${fmtShortDate(t.date)}</td>
                    <td>${t.person||'All'}</td>
                    <td style="color:var(--text2)">${t.itemName||t.showName||t.notes||'—'}</td>
                    <td><span class="badge ${t.type==='production'?'badge-artwork':'badge-done'}">${t.type}</span></td>
                    <td style="text-align:right;color:${t.type==='production'?'var(--amber)':'var(--green)'}">
                      ${t.type==='production'?'−':'+'} ${fmt(t.amount||0)}
                    </td>
                    <td><button class="btn btn-danger btn-sm" onclick="deleteTransaction('${t.id}')">Delete</button></td>
                  </tr>`).join('')
                  : '<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:24px">No transactions yet</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Error: ${err.message}</div>`;
  }
}

function openLogPayment() {
  openModal('Log payment',
    `<div class="field"><label>Type</label>
      <select id="tp-type">
        <option value="production">Production (investment)</option>
        <option value="sale">Sale / income</option>
      </select>
    </div>
    <div class="field"><label>Person</label>
      <select id="tp-person">
        ${PERSONS.map(p => `<option value="${p}">${p}</option>`).join('')}
        <option value="All">All (split equally)</option>
      </select>
    </div>
    <div class="field-row">
      <div class="field"><label>Amount (kr)</label><input id="tp-amount" type="number" placeholder="0"/></div>
      <div class="field"><label>Date</label><input id="tp-date" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
    </div>
    <div class="field"><label>Item / note</label><input id="tp-note" type="text" placeholder="e.g. Plaguelords shirt run, printing costs"/></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="savePayment()">Log payment</button>`
  );
}

async function savePayment() {
  const amount = parseFloat(document.getElementById('tp-amount')?.value) || 0;
  if (!amount) { showToast('Amount is required', 'error'); return; }

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
    showToast('Payment logged');
    closeModal();
    await renderInvestment();
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function deleteTransaction(id) {
  confirmAction('Delete this transaction?', async () => {
    await fsDelete('merch_transactions', id);
    showToast('Transaction deleted');
    await renderInvestment();
  });
}
