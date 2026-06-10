/* js/app.js — initialise app */

document.addEventListener('DOMContentLoaded', () => {
  navigate(location.pathname || '/');
});

// ── NUCLEAR RESET (/?reset=doom) ─────────────────────────────
async function checkÅterställTrigger() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') !== 'doom') return;

  // Clean URL immediately so a refresh doesn't re-trigger
  history.replaceState({}, '', window.location.pathname);

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);
    display:flex;align-items:center;justify-content:center;z-index:9999
  `;

  overlay.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--red);border-radius:12px;
      padding:32px;width:400px;max-width:90vw;font-family:'DM Sans',sans-serif">
      <div style="font-size:1rem;font-weight:500;color:var(--red);margin-bottom:8px">
        Återställ databas
      </div>
      <div style="font-size:0.85rem;color:var(--text2);margin-bottom:20px;line-height:1.6">
        Detta raderar permanent alla artiklar, spelningar, transaktioner och designer från Firestore.
        Det går inte att ångra.<br><br>
        Typ <strong style="color:var(--text)">doomherre</strong> för att bekräfta.
      </div>
      <input id="reset-confirm-input" type="text" placeholder="Typ doomherre…"
        style="width:100%;background:var(--bg3);border:1px solid var(--border);
        color:var(--text);border-radius:8px;padding:10px 13px;
        font-size:0.9rem;font-family:'DM Sans',sans-serif;margin-bottom:16px"/>
      <div id="reset-error" style="font-size:0.75rem;color:var(--red);margin-bottom:12px;display:none">
        Fel — skriv exakt: doomherre
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="reset-cancel-btn"
          style="background:none;border:1px solid var(--border);color:var(--text2);
          padding:8px 18px;border-radius:8px;font-size:0.85rem;cursor:pointer;font-family:'DM Sans',sans-serif">
          Avbryt
        </button>
        <button id="reset-confirm-btn"
          style="background:var(--red);border:none;color:#fff;
          padding:8px 18px;border-radius:8px;font-size:0.85rem;cursor:pointer;font-family:'DM Sans',sans-serif">
          Ta bort everything
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('reset-cancel-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  document.getElementById('reset-confirm-btn').addEventListener('click', async () => {
    const input = document.getElementById('reset-confirm-input').value.trim();
    if (input !== 'doomherre') {
      document.getElementById('reset-error').style.display = 'block';
      return;
    }

    document.getElementById('reset-confirm-btn').textContent = 'Raderar…';
    document.getElementById('reset-confirm-btn').disabled = true;

    try {
      const collections = ['merch_items', 'merch_shows', 'merch_transactions', 'merch_designs'];
      for (const col av collections) {
        const docs = await fsGetAll(col);
        await Promise.all(docs.map(d => fsTa bort(col, d.id)));
      }
      // Clear any localStorage tally drafts
      Object.keys(localStorage)
        .filter(k => k.startsWith('tally-'))
        .forEach(k => localStorage.removeItem(k));

      document.body.removeChild(overlay);
      showToast('Databasen rensad', 'success');
      navigate('/');
    } catch (err) {
      document.getElementById('reset-confirm-btn').textContent = 'Ta bort everything';
      document.getElementById('reset-confirm-btn').disabled = false;
      document.getElementById('reset-error').textContent = 'Fel: ' + err.message;
      document.getElementById('reset-error').style.display = 'block';
    }
  });

  // Also close on Enter key
  document.getElementById('reset-confirm-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('reset-confirm-btn').click();
  });
}

checkÅterställTrigger();
