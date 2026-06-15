/* js/pages/deliveries.js */

registerPage('deliveries', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="page-title">Utleveranser</div>
        <button class="btn-help" onclick="openHelp('deliveries')" title="Hjälp">?</button>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openNewDelivery()">+ Ny utleverans</button>
    </div>
    <div id="deliveries-content"></div>
  `;
  await renderDeliveries();
});

async function renderDeliveries() {
  const el = document.getElementById('deliveries-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Laddar…</div>';

  try {
    const deliveries = await fsGetAll('merch_deliveries');
    const sorted     = [...deliveries].sort((a, b) => (b.date||'').localeCompare(a.date||''));

    // Summary stats
    const totalValue    = deliveries.reduce((s, d) => s + (d.totalValue || 0), 0);
    const totalPaid     = deliveries.reduce((s, d) => s + (d.totalPaid  || 0), 0);
    const totalOutstanding = totalValue - totalPaid;
    const active        = deliveries.filter(d => d.status !== 'settled');

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:24px">
        <div class="stat-card"><div class="stat-label">Aktiva utleveranser</div><div class="stat-value">${active.length}</div></div>
        <div class="stat-card"><div class="stat-label">Totalt fakturerat</div><div class="stat-value gold">${fmt(totalValue)}</div></div>
        <div class="stat-card"><div class="stat-label">Totalt betalt</div><div class="stat-value green">${fmt(totalPaid)}</div></div>
        <div class="stat-card"><div class="stat-label">Utestående</div><div class="stat-value ${totalOutstanding > 0 ? 'amber' : 'green'}">${fmt(totalOutstanding)}</div></div>
      </div>

      ${active.length ? `
      <div class="section" style="margin-bottom:24px">
        <div class="section-header"><div class="section-title">Utestående</div></div>
        ${active.map(d => deliveryCard(d)).join('')}
      </div>` : ''}

      <div class="section">
        <div class="section-header">
          <div class="section-title">Alla utleveranser</div>
        </div>
        ${sorted.length
          ? sorted.map(d => deliveryCard(d, true)).join('')
          : `<div class="card"><div class="card-body" style="color:var(--text3);font-size:13px">Inga utleveranser loggade ännu.</div></div>`}
      </div>
    `;
  } catch(err) {
    handleFsError(err, 'Kunde inte ladda utleveranser');
  }
}

function deliveryCard(d, compact = false) {
  const outstanding = (d.totalValue||0) - (d.totalPaid||0);
  const pct         = d.totalValue > 0 ? Math.round(d.totalPaid / d.totalValue * 100) : 0;
  const settled     = d.status === 'settled';

  const payments = (d.payments || []);

  return `<div class="card" style="margin-bottom:12px">
    <div class="card-body">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
        <div>
          <div style="font-weight:600;font-size:14px">${d.recipient || '—'}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">
            ${fmtDate(d.date)} · ${d.itemName || '—'} · ${d.qty || 0} st · ${fmt(d.unitPrice||0)}/st
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:600;color:${settled?'var(--green)':'var(--amber)'}">
            ${settled ? 'Reglerad' : `${fmt(outstanding)} kvar`}
          </div>
          <div style="font-size:11px;color:var(--text3)">${fmt(d.totalPaid||0)} av ${fmt(d.totalValue||0)}</div>
        </div>
      </div>

      ${!settled ? `
      <div style="background:var(--bg3);border-radius:4px;height:6px;margin-bottom:10px;overflow:hidden">
        <div style="background:var(--green);height:100%;width:${pct}%;border-radius:4px;transition:width .3s"></div>
      </div>` : ''}

      ${d.notes ? `<div style="font-size:11px;color:var(--text3);margin-bottom:10px">${d.notes}</div>` : ''}

      ${payments.length ? `
      <div style="margin-bottom:10px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3);margin-bottom:6px">Betalningar</div>
        ${payments.map((p, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;
               padding:5px 0;border-bottom:1px solid var(--bg3)">
            <span style="color:var(--text2)">${fmtDate(p.date)} ${p.notes ? `· ${p.notes}` : ''}</span>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="color:var(--green)">+${fmt(p.amount)}</span>
              <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 6px"
                onclick="deletePaymentFromDelivery('${d.id}',${i})">×</button>
            </div>
          </div>`).join('')}
      </div>` : ''}

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${!settled ? `<button class="btn btn-primary btn-sm" onclick="openLogPaymentForDelivery('${d.id}')">+ Logga betalning</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openEditDelivery('${d.id}')">Redigera</button>
        ${!settled && outstanding <= 0 ? `<button class="btn btn-ghost btn-sm" onclick="settleDelivery('${d.id}')">Markera reglerad</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteDelivery('${d.id}')">Ta bort</button>
      </div>
    </div>
  </div>`;
}

/* ── NEW DELIVERY ── */
async function openNewDelivery() {
  const items = await fsGetAll('merch_items');
  const active = sortByCategory(items.filter(i => i.status === 'active'));

  openModal('Ny utleverans',
    `<div class="field"><label>Mottagare</label>
      <input id="del-recipient" type="text" list="del-recipients" placeholder="t.ex. Sound Pollution"/>
      <datalist id="del-recipients">
        <option value="Sound Pollution">
        <option value="Bandcamp">
        <option value="Bengans">
      </datalist>
    </div>
    <div class="field-row">
      <div class="field"><label>Artikel</label>
        <select id="del-item">
          <option value="">Välj artikel…</option>
          ${active.map(i => `<option value="${i.id}" data-name="${i.name}" data-price="${i.salePrice||0}">${i.name}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Antal</label>
        <input id="del-qty" type="number" min="1" placeholder="0" oninput="updateDeliveryTotal()"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Inpris per enhet (kr)</label>
        <input id="del-price" type="number" min="0" placeholder="0" oninput="updateDeliveryTotal()"/>
      </div>
      <div class="field"><label>Datum</label>
        <input id="del-date" type="date" value="${new Date().toISOString().split('T')[0]}"/>
      </div>
    </div>
    <div style="background:var(--bg3);border-radius:6px;padding:10px 14px;font-size:13px;margin-bottom:12px">
      Totalt värde: <span id="del-total" style="color:var(--gold);font-weight:600">0 kr</span>
    </div>
    <div class="field"><label>Anteckning</label>
      <input id="del-notes" type="text" placeholder="Valfritt"/>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveNewDelivery()">Spara och dra av lager</button>`
  );

  // Auto-fill price when item selected
  document.getElementById('del-item')?.addEventListener('change', function() {
    const opt = this.options[this.selectedIndex];
    const price = opt.dataset.price || 0;
    document.getElementById('del-price').value = Math.round(price * 0.5); // suggest 50% of sale price
    updateDeliveryTotal();
  });
}

function updateDeliveryTotal() {
  const qty   = parseInt(document.getElementById('del-qty')?.value) || 0;
  const price = parseFloat(document.getElementById('del-price')?.value) || 0;
  const el    = document.getElementById('del-total');
  if (el) el.textContent = fmt(qty * price);
}

async function saveNewDelivery() {
  const itemId    = document.getElementById('del-item')?.value;
  const itemName  = document.getElementById('del-item')?.options[document.getElementById('del-item').selectedIndex]?.dataset.name;
  const qty       = parseInt(document.getElementById('del-qty')?.value) || 0;
  const unitPrice = parseFloat(document.getElementById('del-price')?.value) || 0;
  const date      = document.getElementById('del-date')?.value;
  const recipient = document.getElementById('del-recipient')?.value.trim();
  const notes     = document.getElementById('del-notes')?.value.trim();

  if (!recipient) { showToast('Mottagare krävs', 'error'); return; }
  if (!itemId)    { showToast('Välj en artikel', 'error'); return; }
  if (!qty)       { showToast('Antal krävs', 'error'); return; }
  if (!unitPrice) { showToast('Inpris krävs', 'error'); return; }

  try {
    // Deduct from inventory immediately
    const item = await fsGet('merch_items', itemId);
    if (!item) { showToast('Artikel hittades inte', 'error'); return; }

    const currentStock = item.variants?.['_']?.stock || 0;
    if (currentStock < qty) {
      showToast(`Bara ${currentStock} i lager — kan inte leverera ${qty}`, 'error');
      return;
    }

    // Deduct stock
    if (!item.variants) item.variants = {};
    if (!item.variants['_']) item.variants['_'] = { stock: 0, sålda: 0 };
    item.variants['_'].stock     = Math.max(0, currentStock - qty);
    item.variants['_'].sålda     = (item.variants['_'].sålda || 0) + qty;
    item.totalStock               = Math.max(0, (item.totalStock || 0) - qty);
    await fsSet('merch_items', itemId, item);

    // Save delivery record
    const delivery = {
      recipient, itemId, itemName, qty, unitPrice,
      totalValue: qty * unitPrice,
      totalPaid:  0,
      date, notes,
      status:   'active',
      payments: [],
      createdAt: now(),
    };
    await fsAdd('merch_deliveries', delivery);

    showToast('Utleverans sparad — lager uppdaterat');
    closeModal();
    await renderDeliveries();
  } catch(err) {
    handleFsError(err, 'Kunde inte spara utleverans');
  }
}

/* ── LOG PAYMENT ── */
function openLogPaymentForDelivery(deliveryId) {
  openModal('Logga betalning',
    `<div class="field-row">
      <div class="field"><label>Belopp (kr)</label>
        <input id="pay-amount" type="number" min="0" placeholder="0"/>
      </div>
      <div class="field"><label>Datum</label>
        <input id="pay-date" type="date" value="${new Date().toISOString().split('T')[0]}"/>
      </div>
    </div>
    <div class="field"><label>Anteckning</label>
      <input id="pay-notes" type="text" placeholder="t.ex. Avräkning Q1 2026"/>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveDeliveryPayment('${deliveryId}')">Logga</button>`
  );
}

async function saveDeliveryPayment(deliveryId) {
  const amount = parseFloat(document.getElementById('pay-amount')?.value) || 0;
  const date   = document.getElementById('pay-date')?.value;
  const notes  = document.getElementById('pay-notes')?.value.trim();

  if (!amount) { showToast('Belopp krävs', 'error'); return; }

  try {
    const delivery = await fsGet('merch_deliveries', deliveryId);
    if (!delivery) { showToast('Utleverans hittades inte', 'error'); return; }

    const payments   = [...(delivery.payments || []), { amount, date, notes }];
    const totalPaid  = payments.reduce((s, p) => s + p.amount, 0);
    const status     = totalPaid >= delivery.totalValue ? 'settled' : 'active';

    await fsSet('merch_deliveries', deliveryId, { ...delivery, payments, totalPaid, status });

    // Log as income to Skatbo
    await fsAdd('merch_transactions', {
      direction:   'in',
      person:      'Skatbo',
      category:    'Försäljning',
      project:     delivery.itemName || '',
      description: `Avräkning — ${delivery.recipient}`,
      amount, date,
      deliveryId,
      createdAt:   now(),
    });

    showToast(status === 'settled' ? 'Betalning loggad — utleverans reglerad!' : 'Betalning loggad');
    closeModal();
    await renderDeliveries();
  } catch(err) {
    handleFsError(err, 'Kunde inte logga betalning');
  }
}

/* ── DELETE PAYMENT ── */
async function deletePaymentFromDelivery(deliveryId, index) {
  const delivery = await fsGet('merch_deliveries', deliveryId);
  if (!delivery) return;
  const payments  = (delivery.payments || []).filter((_, i) => i !== index);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const status    = totalPaid >= delivery.totalValue ? 'settled' : 'active';
  await fsSet('merch_deliveries', deliveryId, { ...delivery, payments, totalPaid, status });
  showToast('Betalning borttagen');
  await renderDeliveries();
}

/* ── SETTLE ── */
async function settleDelivery(deliveryId) {
  const delivery = await fsGet('merch_deliveries', deliveryId);
  if (!delivery) return;
  await fsSet('merch_deliveries', deliveryId, { ...delivery, status: 'settled' });
  showToast('Utleverans markerad som reglerad');
  await renderDeliveries();
}

/* ── EDIT ── */
async function openEditDelivery(deliveryId) {
  const d = await fsGet('merch_deliveries', deliveryId);
  if (!d) return;

  openModal('Redigera utleverans',
    `<div class="field"><label>Mottagare</label>
      <input id="del-recipient" type="text" value="${d.recipient||''}"/>
    </div>
    <div class="field-row">
      <div class="field"><label>Antal</label>
        <input id="del-qty" type="number" value="${d.qty||0}"/>
      </div>
      <div class="field"><label>Inpris per enhet (kr)</label>
        <input id="del-price" type="number" value="${d.unitPrice||0}" oninput="updateDeliveryTotal()"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Datum</label>
        <input id="del-date" type="date" value="${d.date||''}"/>
      </div>
    </div>
    <div class="field"><label>Anteckning</label>
      <input id="del-notes" type="text" value="${d.notes||''}"/>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="updateDelivery('${deliveryId}')">Spara</button>`
  );
}

async function updateDelivery(deliveryId) {
  const d         = await fsGet('merch_deliveries', deliveryId);
  const qty       = parseInt(document.getElementById('del-qty')?.value) || d.qty;
  const unitPrice = parseFloat(document.getElementById('del-price')?.value) || d.unitPrice;

  const updated = {
    ...d,
    recipient:  document.getElementById('del-recipient')?.value.trim(),
    qty,
    unitPrice,
    totalValue: qty * unitPrice,
    date:       document.getElementById('del-date')?.value,
    notes:      document.getElementById('del-notes')?.value.trim(),
  };

  await fsSet('merch_deliveries', deliveryId, updated);
  showToast('Utleverans uppdaterad');
  closeModal();
  await renderDeliveries();
}

/* ── DELETE DELIVERY ── */
function confirmDeleteDelivery(deliveryId) {
  confirmAction(
    'Ta bort utleveransen? Lagret återställs INTE automatiskt — gör det manuellt om det behövs.',
    async () => {
      await fsDelete('merch_deliveries', deliveryId);
      showToast('Utleverans borttagen');
      await renderDeliveries();
    }
  );
}
