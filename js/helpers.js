/* js/helpers.js */

/* ── TOAST ── */
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

/* ── MODAL ── */
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML || '';
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-body').innerHTML = '';
  document.getElementById('modal-footer').innerHTML = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── FORMATTING ── */
function fmt(n) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function fmtNum(n) { return Math.round(n).toLocaleString('sv-SE'); }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtShortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

/* ── LAGER STATUS ── */
function stockClass(rem) {
  if (rem === 0) return 'stock-out';
  if (rem <= 3)  return 'stock-low';
  return 'stock-ok';
}

/* ── KATEGORI BADGE ── */
function catBadge(cat) {
  return `<span class="badge badge-${cat||'other'}">${cat||'other'}</span>`;
}

/* ── FÄRGER MAP ── */
const COLOR_HEX = {
  black:   '#111111',
  white:   '#EEEEEE',
  burgundy:'#6B1C2A',
  forest:  '#1A3A22',
  navy:    '#1A2240',
  grey:    '#555555',
};
function colorDot(c) {
  const hex = COLOR_HEX[c] || '#888';
  const border = c === 'white' ? 'border:1px solid #555;' : '';
  return `<span class="color-dot" style="background:${hex};${border}"></span>`;
}

/* ── SIZES ── */
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/* ── PERSONS ── */
const PERSONS = ['Max', 'Daniel', 'Victor', 'Skatbo', 'Alla'];

/* ── EMPTY STATE ── */
function emptyState(icon, msg, action = '') {
  return `<div class="empty-state">
    <div style="font-size:32px;margin-bottom:8px">${icon}</div>
    <p>${msg}</p>
    ${action}
  </div>`;
}

/* ── CONFIRM ── */
function confirmAction(msg, onBekräfta) {
  window._confirmCallback = onBekräfta;
  openModal('Bekräfta', `<p style="color:var(--text2);font-size:13px">${msg}</p>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Avbryt</button>
     <button class="btn btn-danger" onclick="closeModal();window._confirmCallback()">Bekräfta</button>`
  );
}

/* ── NETWORK STATUS ── */
function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  if (navigator.onLine) {
    banner.style.display = 'none';
    document.querySelector('.main-area') && (document.querySelector('.main-area').style.paddingTop = '');
  } else {
    banner.style.display = 'block';
    document.querySelector('.main-area') && (document.querySelector('.main-area').style.paddingTop = '40px');
  }
}

window.addEventListener('online',  () => {
  updateOfflineBanner();
  showToast('Uppkoppling återställd', 'success');
});
window.addEventListener('offline', () => {
  updateOfflineBanner();
});

document.addEventListener('DOMContentLoaded', updateOfflineBanner);

/* ── FIRESTORE ERROR HELPER ── */
function handleFsError(err, context) {
  const offline = !navigator.onLine;
  if (offline) {
    showToast('Ingen uppkoppling — kunde inte spara', 'error');
  } else if (err?.message?.includes('401') || err?.message?.includes('403')) {
    showToast('Behörighetsfel — kontrollera Firebase-nyckeln', 'error');
  } else if (err?.message?.includes('404')) {
    showToast('Dokumentet hittades inte', 'error');
  } else if (err?.message?.includes('429')) {
    showToast('För många förfrågningar — vänta en stund och försök igen', 'error');
  } else {
    showToast(`${context || 'Fel'}: ${err?.message || 'okänt fel'}`, 'error');
  }
  console.error(context, err);
}

/* ── HELP MODAL ── */
const HELP_CONTENT = {
  dashboard: {
    title: 'Översikt — hjälp',
    items: [
      ['Intäkter', 'Total försäljning från alla stängda spelningar.'],
      ['Lågt lager', 'Artiklar med färre än 5 enheter kvar i lager. Klicka för att gå till lagersidan.'],
      ['Kommande spelningar', 'Spelningar med status "Kommande". Klicka på en spelning för att öppna tallyvyn.'],
      ['Netto (Ekonomi)', 'Totala intäkter minus totala utgifter. Negativt värde betyder att bandet ännu inte gått ihop.'],
    ]
  },
  inventory: {
    title: 'Lager — hjälp',
    items: [
      ['Lägga till artikel', 'Klicka "+ Ny artikel". Välj typ: Kläder (har storlekar/färger) eller Skivor/Övrigt (enkel kvantitet).'],
      ['Aktiv / Inaktiv', 'Aktiva artiklar syns i packlistan. Sätt en artikel inaktiv om den inte längre säljs — den försvinner från packlistan men data bevaras.'],
      ['Behöver beställas', 'Visas automatiskt när en packlista kräver fler enheter än vad som finns i lager. Baseras på alla kommande spelningars packlistor.'],
      ['Redigera artikel', 'Befintliga försäljningssiffror (sålda) bevaras när du redigerar ett lagersaldo — bara stocken uppdateras.'],
    ]
  },
  shows: {
    title: 'Spelningar — hjälp',
    items: [
      ['Flödet', '1. Skapa spelning  2. Bygg pack (vilka artiklar tar du med)  3. Tally under showen (tryck +/− när du säljer)  4. Stäng spelning (drar av från lagret och loggar intäkt).'],
      ['Reserverat i packlistan', 'Antal enheter som redan är packade i andra kommande spelningar. Du kan packa mer än tillgängligt — röda siffror visar vad som saknas.'],
      ['Återöppna spelning', 'En stängd spelning kan återöppnas genom att sätta status till "Kommande". Tally och pack bevaras. Du kan justera siffror och stänga igen — lagret uppdateras med differensen.'],
      ['Återställ lager', 'Ångrar allt — lager återställs, försäljning raderas, spelningen sätts till kommande. Kan inte ångras.'],
      ['Spara-knappen', 'Tally sparas automatiskt till enheten (localStorage) var 30:e sekund och när du navigerar bort. Du behöver inte trycka spara manuellt.'],
    ]
  },
  investment: {
    title: 'Ekonomi — hjälp',
    items: [
      ['Utgift vs Intäkt', 'Utgift = pengar som lämnar bandet. Intäkt = pengar som kommer in (försäljning, bidrag, mm). Spelningsintäkter loggas automatiskt som intäkt till Skatbo.'],
      ['Projekt', 'Fritext — skriv vad du vill (Bonegoat, Plaguelords, Sommarturné 2026). Används för att gruppera kostnader och jämföra projekt mot varandra.'],
      ['Skatbo', 'Bandkassan. Kostnader betalda ur kassan loggas på Skatbo. Alla spelningsintäkter går automatiskt hit.'],
      ['Alla', 'Kostnad delad av hela bandet gemensamt utan att tillhöra en specifik person.'],
      ['Jämför projekt', 'Visar en kategoriuppdelad tabell med kostnader för två projekt sida vid sida, med differens i kr och procent.'],
    ]
  },
};

function openHelp(page) {
  const data = HELP_CONTENT[page];
  if (!data) return;
  const body = data.items.map(([term, desc]) =>
    `<div style="margin-bottom:14px">
      <div style="font-weight:600;font-size:13px;color:var(--gold);margin-bottom:3px">${term}</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6">${desc}</div>
    </div>`
  ).join('');
  openModal(data.title, body,
    `<button class="btn btn-ghost" onclick="closeModal()">Stäng</button>`
  );
}

// Add reports to HELP_CONTENT
HELP_CONTENT.reports = {
  title: 'Rapporter — hjälp',
  items: [
    ['Filter (Allt/Kläder/Skivor)', 'Filtrerar intäkter och prisgranskning efter artikelkategori. Kostnader per projekt påverkas inte av filtret.'],
    ['Produktionskostnad', 'Summan av kategorierna: Inspelning/Studio, Mixning/Mastering, Pressning och Artwork/Foto/Video.'],
    ['Driftkostnad', 'Allt annat — Marknadsföring, Turné, Transport, mm.'],
    ['Kostnad per projekt', 'Utgifter grupperade per projekt (t.ex. Bonegoat, Plaguelords). Loggas via Ekonomi-sidan.'],
    ['Prisgranskning (2×-regeln)', 'Jämför kostnad per enhet mot försäljningspris. Målet är att priset ska vara minst dubbelt kostnaden. Kostnad per enhet sätts när du redigerar en artikel i Lager.'],
  ]
};

HELP_CONTENT.deliveries = {
  title: 'Utleveranser — hjälp',
  items: [
    ['Ny utleverans', 'Logga när ni skickar artiklar till en distributör eller butik. Lagret minskar direkt med det antal ni levererar.'],
    ['Inpris per enhet', 'Det pris distributören köper in för — ofta lägre än ert säljpris. Används för att beräkna utestående fordran.'],
    ['Logga betalning', 'När ni får en avräkning loggar ni beloppet här. Betalningen går automatiskt till Skatbo som intäkt. Ni kan logga flera delbetalningar.'],
    ['Reglerad', 'Markeras automatiskt när totalbetalningen täcker hela leveransvärdet. Kan också markeras manuellt.'],
    ['Ta bort utleverans', 'Lagret återställs INTE automatiskt vid borttagning — justera manuellt under Lager om det behövs.'],
  ]
};
