/* js/pages/designs.js */

const DESIGN_STAGES = [
  { key: 'idea',     label: 'Idé' },
  { key: 'artwork',  label: 'Grafik' },
  { key: 'printing', label: 'Skriv uting' },
  { key: 'active',   label: 'Aktiv' },
];

registerPage('designs', async (container) => {
  container.innerHTML = `
    <div class="page-header">
      <div><div class="page-title">Designplanering</div></div>
      <button class="btn btn-primary btn-sm" onclick="openAddDesign()">+ Ny design</button>
    </div>
    <div id="designs-content"></div>
  `;
  await renderDesigns();
});

async function renderDesigns() {
  const el = document.getElementById('designs-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);padding:20px">Loading…</div>';

  try {
    const designs = await fsGetAll('merch_designs');

    const cols = DESIGN_STAGES.map(stage => {
      const items = designs.filter(d => d.stage === stage.key);
      const cards = items.length
        ? items.map(d => designCard(d)).join('')
        : `<div style="font-size:11px;color:var(--text3);padding:8px 4px">Inget här</div>`;
      return `
        <div>
          <div class="pipeline-col-header" style="display:flex;align-items:center;justify-content:space-between">
            <span>${stage.label}</span>
            <span class="badge badge-${stage.key}" style="margin-left:6px">${items.length}</span>
          </div>
          <div id="col-${stage.key}">${cards}</div>
        </div>`;
    }).join('');

    el.innerHTML = `<div class="pipeline-cols">${cols}</div>`;
  } catch(err) {
    el.innerHTML = `<div style="color:var(--red);padding:20px">Fel: ${err.message}</div>`;
  }
}

function designCard(d) {
  return `<div class="pipeline-item" onclick="openDesignDetail('${d.id}')">
    <div class="pipeline-item-name">${d.name}</div>
    <div class="pipeline-item-meta">
      ${d.category ? `${d.category}` : ''}
      ${d.printer ? ` · ${d.printer}` : ''}
    </div>
    ${d.notes ? `<div style="font-size:10px;color:var(--text3);margin-top:6px;line-height:1.4">${d.notes.substring(0,80)}${d.notes.length>80?'…':''}</div>` : ''}
    <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
      ${DESIGN_STAGES.findIndex(s=>s.key===d.stage) < DESIGN_STAGES.length-1
        ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();advanceDesign('${d.id}','${d.stage}')">Flytta →</button>`
        : ''}
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openRedigeraDesign('${d.id}')">Redigera</button>
    </div>
  </div>`;
}

async function openDesignDetail(id) {
  const d = await fsGet('merch_designs', id);
  if (!d) return;

  const stageIdx = DESIGN_STAGES.findIndex(s => s.key === d.stage);
  const stepsHTML = DESIGN_STAGES.map((s, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <div style="width:18px;height:18px;border-radius:50%;
        background:${i<=stageIdx?'var(--gold)':'var(--bg3)'};
        border:1px solid ${i<=stageIdx?'var(--gold)':'var(--border)'};
        display:flex;align-items:center;justify-content:center;
        font-size:10px;color:${i<=stageIdx?'#16120A':'var(--text3)'}">
        ${i<stageIdx?'✓':i===stageIdx?'●':''}
      </div>
      <span style="font-size:12px;color:${i<=stageIdx?'var(--text)':'var(--text3)'}">${s.label}</span>
    </div>`).join('');

  openModal(d.name,
    `<div style="display:grid;gap:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="stat-card"><div class="stat-label">Steg</div><div class="stat-value"><span class="badge badge-${d.stage}">${d.stage}</span></div></div>
        <div class="stat-card"><div class="stat-label">Kategori</div><div class="stat-value" style="font-size:14px">${d.category||'—'}</div></div>
      </div>
      <div>${stepsHTML}</div>
      ${d.printer ? `<div style="font-size:12px;color:var(--text2)"><strong style="color:var(--text)">Skriv uter:</strong> ${d.printer}</div>` : ''}
      ${d.costEstimate ? `<div style="font-size:12px;color:var(--text2)"><strong style="color:var(--text)">Uppskattad kostnad:</strong> ${fmt(d.costEstimate)} per unit</div>` : ''}
      ${d.minOrder ? `<div style="font-size:12px;color:var(--text2)"><strong style="color:var(--text)">Minsta order:</strong> ${d.minOrder} enheter</div>` : ''}
      ${d.notes ? `<div style="font-size:12px;color:var(--text2);border-top:1px solid var(--border);padding-top:12px">${d.notes}</div>` : ''}
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Stäng</button>
     <button class="btn btn-ghost" onclick="closeModal();openRedigeraDesign('${id}')">Redigera</button>
     ${stageIdx < DESIGN_STAGES.length-1
       ? `<button class="btn btn-primary" onclick="closeModal();advanceDesign('${id}','${d.stage}')">Flytta till ${DESIGN_STAGES[stageIdx+1]?.label}</button>`
       : ''}`
  );
}

function openAddDesign() {
  openModal('Ny design', buildDesignForm(null),
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-primary" onclick="saveDesign(null)">Add design</button>`
  );
}

async function openRedigeraDesign(id) {
  const d = await fsGet('merch_designs', id);
  openModal('Redigera design', buildDesignForm(d),
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-danger" onclick="closeModal();deleteDesign('${id}','${d.name}')">Ta bort</button>
     <button class="btn btn-primary" onclick="saveDesign('${id}')">Save</button>`
  );
}

function buildDesignForm(d) {
  return `
    <div class="field"><label>Designnamn</label><input id="df-name" type="text" value="${d?.name||''}"/></div>
    <div class="field-row">
      <div class="field"><label>Kategori</label>
        <select id="df-cat">
          <option value="clothing" ${(d?.category||'clothing')==='clothing'?'selected':''}>Kläder</option>
          <option value="records"  ${d?.category==='records'?'selected':''}>Skivor</option>
          <option value="other"    ${d?.category==='other'?'selected':''}>Övrigt</option>
        </select>
      </div>
      <div class="field"><label>Steg</label>
        <select id="df-stage">
          ${DESIGN_STAGES.map(s =>
            `<option value="${s.key}" ${(d?.stage||'idea')===s.key?'selected':''}>${s.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Skriv uter</label><input id="df-printer" type="text" value="${d?.printer||''}" placeholder="e.g. Spreadshirt, local shop"/></div>
      <div class="field"><label>Minsta orderantal</label><input id="df-min" type="number" value="${d?.minOrder||''}"/></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Uppskattad kostnad / enhet (kr)</label><input id="df-cost" type="number" value="${d?.costEstimate||''}"/></div>
      <div class="field"><label>Målpris (kr)</label><input id="df-price" type="number" value="${d?.targetPrice||''}"/></div>
    </div>
    <div class="field"><label>Anteckningar / references</label><textarea id="df-notes">${d?.notes||''}</textarea></div>
  `;
}

async function saveDesign(id) {
  const name = document.getElementById('df-name')?.value?.trim();
  if (!name) { showToast('Namn is required', 'error'); return; }

  const data = {
    name,
    category:    document.getElementById('df-cat').value,
    stage:       document.getElementById('df-stage').value,
    printer:     document.getElementById('df-printer').value.trim(),
    minOrder:    parseInt(document.getElementById('df-min').value) || null,
    costEstimate:parseFloat(document.getElementById('df-cost').value) || null,
    targetPrice: parseFloat(document.getElementById('df-price').value) || null,
    notes:       document.getElementById('df-notes').value.trim(),
    updatedAt:   now(),
  };
  if (!id) data.createdAt = now();

  try {
    if (id) {
      await fsSet('merch_designs', id, data);
    } else {
      await fsAdd('merch_designs', data);
    }
    showToast(id ? 'Design uppdaterad' : 'Design tillagd');
    closeModal();
    await renderDesigns();
  } catch(err) {
    showToast('Sparningen misslyckades: ' + err.message, 'error');
  }
}

async function advanceDesign(id, currentSteg) {
  const idx  = DESIGN_STAGES.findIndex(s => s.key === currentSteg);
  const next = DESIGN_STAGES[idx + 1];
  if (!next) return;
  const d = await fsGet('merch_designs', id);
  await fsSet('merch_designs', id, { ...d, stage: next.key, updatedAt: now() });
  showToast(`Flyttad till ${next.label}`);
  await renderDesigns();
}

async function deleteDesign(id, name) {
  confirmAction(`Ta bort design "${name}"?`, async () => {
    await fsTa bort('merch_designs', id);
    showToast('Design borttagen');
    await renderDesigns();
  });
}
