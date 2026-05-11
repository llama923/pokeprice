// app.js — Main application controller with card version picker

const App = (() => {
  let uploadedFiles = [];
  let identifiedCards = [];
  let pricedResults  = [];

  const $ = id => document.getElementById(id);
  const uploadZone     = $('uploadZone');
  const fileInput      = $('fileInput');
  const previewGrid    = $('previewGrid');
  const btnAnalyze     = $('btnAnalyze');
  const stepUpload     = $('stepUpload');
  const stepReview     = $('stepReview');
  const stepResults    = $('stepResults');
  const cardsTableBody = $('cardsTableBody');
  const cardCount      = $('cardCount');
  const btnFetchPrices = $('btnFetchPrices');
  const resultsTableBody = $('resultsTableBody');
  const resultsSummary   = $('resultsSummary');
  const btnExportSheets  = $('btnExportSheets');
  const btnExportCSV     = $('btnExportCSV');
  const btnStartOver     = $('btnStartOver');
  const bulkCondition    = $('bulkCondition');
  const btnAddCard       = $('btnAddCard');
  const addCardModal     = $('addCardModal');
  const btnCloseAddCard  = $('btnCloseAddCard');
  const btnConfirmAdd    = $('btnConfirmAddCard');
  const logPanel         = $('logPanel');
  const logToggle        = $('logToggle');
  const logBody          = $('logBody');

  function toast(msg, type = 'ok') {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast show toast-${type}`;
    setTimeout(() => el.className = 'toast', 3500);
  }

  function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type === 'ok' ? 'ok' : type === 'error' ? 'err' : type === 'warn' ? 'warn' : ''}`;
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${msg}</span>`;
    logBody.appendChild(entry);
    logBody.scrollTop = logBody.scrollHeight;
    if (type === 'error' && !logPanel.classList.contains('open')) logPanel.classList.add('open');
  }

  function setButtonLoading(btn, loading) {
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    if (loading) { text?.setAttribute('hidden',''); spinner?.removeAttribute('hidden'); btn.disabled = true; }
    else { text?.removeAttribute('hidden'); spinner?.setAttribute('hidden',''); btn.disabled = false; }
  }

  function conditionBadge(cond) { return `<span class="condition-badge cond-${cond}">${cond}</span>`; }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── UPLOAD ───
  function setupUpload() {
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', e => {
      e.preventDefault(); uploadZone.classList.remove('drag-over');
      addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
    });
    uploadZone.querySelector('.upload-link')?.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  }

  function addFiles(files) {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      uploadedFiles.push(file);
      const idx = uploadedFiles.length - 1;
      const thumb = document.createElement('div');
      thumb.className = 'preview-thumb';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      const btn = document.createElement('button');
      btn.className = 'thumb-remove'; btn.textContent = '×';
      btn.addEventListener('click', e => { e.stopPropagation(); uploadedFiles[idx] = null; thumb.remove(); updateAnalyzeButton(); });
      thumb.appendChild(img); thumb.appendChild(btn);
      previewGrid.appendChild(thumb);
    });
    updateAnalyzeButton();
  }

  function updateAnalyzeButton() { btnAnalyze.disabled = !uploadedFiles.some(Boolean); }

  // ─── ANALYZE ───
  async function analyzeImages() {
    const files = uploadedFiles.filter(Boolean);
    if (!files.length) return;
    if (!Settings.get('gemini')) { toast('Add your Gemini API key in Settings first', 'err'); $('btnOpenSettings').click(); return; }

    setButtonLoading(btnAnalyze, true);
    identifiedCards = [];
    log(`Sending ${files.length} image(s) to Gemini...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      log(`Analyzing image ${i + 1}/${files.length}: ${file.name}`);
      try {
        const cards = await Gemini.identifyCards(file, msg => log(`  → ${msg}`));
        log(`  → Found ${cards.length} card(s)`, 'ok');
        cards.forEach(c => {
          identifiedCards.push({ ...c, rowId: crypto.randomUUID(), condition: 'NM', sourceFile: file, pickedCard: null });
        });
      } catch (err) {
        log(`  → Error: ${err.message}`, 'error');
        toast(`Image ${i + 1} failed: ${err.message}`, 'err');
      }
    }

    setButtonLoading(btnAnalyze, false);
    if (!identifiedCards.length) { toast('No cards identified. Try clearer photos.', 'err'); return; }
    log(`Total: ${identifiedCards.length} card(s) identified`, 'ok');
    toast(`Found ${identifiedCards.length} cards! Pick the correct version for each.`, 'ok');
    showReviewStep();
  }

  // ─── REVIEW TABLE ───
  function showReviewStep() {
    stepReview.removeAttribute('hidden');
    stepReview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderCardsTable();
  }

  function renderCardsTable() {
    cardCount.textContent = `${identifiedCards.length} card${identifiedCards.length !== 1 ? 's' : ''} identified`;
    cardsTableBody.innerHTML = '';
    identifiedCards.forEach(card => {
      const tr = document.createElement('tr');
      tr.dataset.rowid = card.rowId;
      const picked = card.pickedCard;
      const setDisplay = picked
        ? `<span style="color:var(--success);font-size:13px">${escHtml(picked.setName)} ${escHtml(picked.number)}</span>`
        : `<span style="color:var(--text-faint);font-size:12px;font-style:italic">Not picked</span>`;
      const pickStyle = picked
        ? 'background:transparent;border:1px solid var(--success);color:var(--success);'
        : 'background:var(--accent);border:none;color:#0d0f14;';

      tr.innerHTML = `
        <td>
          <div style="font-weight:500;font-size:14px">${escHtml(card.name)}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:2px">${escHtml(card.art_style || '')}</div>
        </td>
        <td>${setDisplay}</td>
        <td>
          <select class="card-condition" data-rowid="${card.rowId}">
            ${['NM','LP','MP','HP','DMG'].map(c => `<option value="${c}" ${c === card.condition ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </td>
        <td>
          <button class="btn-pick" data-rowid="${card.rowId}"
            style="${pickStyle}font-family:var(--font-body);font-size:12px;font-weight:600;padding:6px 14px;border-radius:6px;cursor:pointer;white-space:nowrap;transition:all 0.2s">
            ${picked ? '✓ Change' : 'Pick Version'}
          </button>
        </td>
        <td><button class="btn-row-delete" data-rowid="${card.rowId}" title="Remove">✕</button></td>
      `;
      cardsTableBody.appendChild(tr);
    });

    cardsTableBody.querySelectorAll('.card-condition').forEach(sel => {
      sel.addEventListener('change', e => {
        const c = identifiedCards.find(c => c.rowId === e.target.dataset.rowid);
        if (c) c.condition = e.target.value;
      });
    });
    cardsTableBody.querySelectorAll('.btn-pick').forEach(btn => {
      btn.addEventListener('click', () => openPicker(btn.dataset.rowid));
    });
    cardsTableBody.querySelectorAll('.btn-row-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        identifiedCards = identifiedCards.filter(c => c.rowId !== btn.dataset.rowid);
        renderCardsTable();
      });
    });
  }

  // ─── PICKER ───
  let currentPickerRowId = null;

  function openPicker(rowId) {
    currentPickerRowId = rowId;
    const card = identifiedCards.find(c => c.rowId === rowId);
    if (!card) return;

    $('pickerTitle').textContent = `Pick version: ${card.name}`;
    $('pickerSearch').value = card.name;

    const photo = $('pickerPhoto');
    const highlight = $('pickerHighlight');

    if (card.sourceFile) {
      const oldUrl = photo.src;
      photo.src = URL.createObjectURL(card.sourceFile);
      photo.onload = () => {
        if (oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
        if (card.x != null && card.width) {
          highlight.style.cssText = `display:block;left:${card.x*100}%;top:${card.y*100}%;width:${card.width*100}%;height:${card.height*100}%`;
        } else {
          highlight.style.display = 'none';
        }
      };
    } else {
      photo.src = '';
      highlight.style.display = 'none';
    }

    const grid = $('pickerGrid');
    grid.innerHTML = '<div class="picker-loading">Searching TCG database...</div>';
    $('pickerModal').classList.add('open');
    loadPickerCards(card.name, card.search_hint, grid);

    let t;
    $('pickerSearch').oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        grid.innerHTML = '<div class="picker-loading">Searching...</div>';
        loadPickerCards($('pickerSearch').value, null, grid);
      }, 500);
    };
  }

  async function loadPickerCards(name, hint, grid) {
    if (!name.trim()) return;
    try {
      const results = await TCGDB.searchWithHint(name.trim(), hint);
      if (!results.length) {
        grid.innerHTML = `<div class="picker-loading">No results for "${escHtml(name)}" — try editing the search above.</div>`;
        return;
      }
      grid.innerHTML = '';
      results.map(TCGDB.formatCard).forEach(card => {
        const item = document.createElement('div');
        item.className = 'picker-card';
        item.innerHTML = `
          <img src="${escHtml(card.image)}" alt="${escHtml(card.name)}" loading="lazy"
            onerror="this.style.background='var(--bg3)';this.style.minHeight='88px'" />
          <div class="picker-card-label">${escHtml(card.setName)}</div>
          <div class="picker-card-number">${escHtml(card.number)}</div>
          ${card.rarity ? `<div class="picker-card-rarity">${escHtml(card.rarity)}</div>` : ''}
        `;
        item.addEventListener('click', () => selectCard(card));
        grid.appendChild(item);
      });
    } catch (err) {
      grid.innerHTML = `<div class="picker-loading" style="color:var(--error)">Error: ${escHtml(err.message)}</div>`;
    }
  }

  function selectCard(pickedCard) {
    const card = identifiedCards.find(c => c.rowId === currentPickerRowId);
    if (card) { card.pickedCard = pickedCard; card.name = pickedCard.name; renderCardsTable(); }
    $('pickerModal').classList.remove('open');
    toast(`✓ ${pickedCard.name} — ${pickedCard.setName} ${pickedCard.number}`, 'ok');
  }

  // ─── BULK CONDITION ───
  function setupBulkCondition() {
    bulkCondition.addEventListener('change', e => {
      const val = e.target.value; if (!val) return;
      identifiedCards.forEach(c => c.condition = val);
      cardsTableBody.querySelectorAll('.card-condition').forEach(sel => sel.value = val);
      bulkCondition.value = '';
    });
  }

  // ─── ADD CARD MANUALLY ───
  function setupAddCard() {
    btnAddCard.addEventListener('click', () => {
      $('manualCardName').value = ''; $('manualCardSet').value = ''; $('manualCondition').value = 'NM';
      addCardModal.classList.add('open');
    });
    btnCloseAddCard.addEventListener('click', () => addCardModal.classList.remove('open'));
    addCardModal.addEventListener('click', e => { if (e.target === addCardModal) addCardModal.classList.remove('open'); });
    btnConfirmAdd.addEventListener('click', () => {
      const name = $('manualCardName').value.trim();
      if (!name) { toast('Enter a card name', 'err'); return; }
      identifiedCards.push({ name, art_style: '', search_hint: name, condition: $('manualCondition').value, rowId: crypto.randomUUID(), sourceFile: null, pickedCard: null });
      renderCardsTable();
      addCardModal.classList.remove('open');
      if (stepReview.hasAttribute('hidden')) showReviewStep();
      toast(`Added: ${name}`, 'ok');
    });
  }

  // ─── FETCH PRICES ───
  async function fetchPrices() {
    if (!Settings.get('justTCG')) { toast('Add your JustTCG API key in Settings first', 'err'); $('btnOpenSettings').click(); return; }
    if (!identifiedCards.length) { toast('No cards to price', 'err'); return; }

    const unpicked = identifiedCards.filter(c => !c.pickedCard).length;
    if (unpicked > 0) toast(`Note: ${unpicked} card(s) have no version picked — using Gemini's name`, 'warn');

    setButtonLoading(btnFetchPrices, true);
    log(`Fetching prices for ${identifiedCards.length} card(s)...`);

    const cardsToPrice = identifiedCards.map(c => ({
      name: c.pickedCard ? c.pickedCard.name : c.name,
      set: c.pickedCard ? `${c.pickedCard.setName} ${c.pickedCard.number}` : '',
      condition: c.condition
    }));

    pricedResults = await JustTCG.getPriceBatch(cardsToPrice);
    const priced = pricedResults.filter(r => r.price != null).length;
    log(`Prices: ${priced} found, ${pricedResults.length - priced} not found`, priced > 0 ? 'ok' : 'warn');
    setButtonLoading(btnFetchPrices, false);

    if (priced === 0) toast('No prices found. Check card names and API key.', 'err');
    else toast(`Priced ${priced}/${pricedResults.length} cards!`, 'ok');
    showResultsStep();
  }

  // ─── RESULTS ───
  function showResultsStep() {
    stepResults.removeAttribute('hidden');
    stepResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const total = pricedResults.length;
    const priced = pricedResults.filter(r => r.price != null);
    const totalValue = priced.reduce((sum, r) => sum + Number(r.price), 0);
    resultsSummary.innerHTML = `
      <div class="summary-stat"><div class="stat-value">${total}</div><div class="stat-label">Total Cards</div></div>
      <div class="summary-stat"><div class="stat-value">${priced.length}</div><div class="stat-label">Cards Priced</div></div>
      <div class="summary-stat"><div class="stat-value">$${totalValue.toFixed(2)}</div><div class="stat-label">Collection Value</div></div>`;
    resultsTableBody.innerHTML = '';
    pricedResults.forEach(r => {
      const tr = document.createElement('tr');
      const priceDisplay = r.price != null ? `<span class="price-cell has-price">$${Number(r.price).toFixed(2)}</span>` : `<span class="price-cell no-price">Not found</span>`;
      const src = r.url ? `<a href="${r.url}" target="_blank" class="source-link" rel="noopener">${r.source || 'View'} ↗</a>` : `<span style="color:var(--text-faint);font-size:12px">${r.source||'—'}</span>`;
      tr.innerHTML = `<td><strong>${escHtml(r.name)}</strong></td><td style="color:var(--text-dim);font-size:13px">${escHtml(r.set||'—')}</td><td>${conditionBadge(r.condition)}</td><td>${priceDisplay}</td><td>${src}</td>`;
      resultsTableBody.appendChild(tr);
    });
  }

  // ─── EXPORT ───
  async function exportToSheets() {
    if (!Settings.get('googleClient') || !Settings.get('sheetId')) { toast('Set Google Client ID and Sheet ID in Settings first', 'err'); $('btnOpenSettings').click(); return; }
    btnExportSheets.disabled = true; btnExportSheets.textContent = 'Authorizing...';
    try {
      const { updatedRange, rowsWritten } = await Sheets.exportToSheet(pricedResults);
      log(`Exported ${rowsWritten} rows to ${updatedRange}`, 'ok');
      toast('Exported to Google Sheets! ✓', 'ok');
      btnExportSheets.innerHTML = '✓ Exported!'; btnExportSheets.style.background = 'var(--success)';
    } catch (err) {
      log(`Sheets export failed: ${err.message}`, 'error'); toast(`Export failed: ${err.message}`, 'err');
      btnExportSheets.disabled = false;
      btnExportSheets.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Export to Google Sheets`;
    }
  }

  function exportCSV() {
    const header = ['Card Name','Set / Number','Condition','Market Price (USD)','TCGPlayer URL','Source'];
    const rows = pricedResults.map(r => [r.name, r.set||'', r.condition, r.price != null ? Number(r.price).toFixed(2) : 'N/A', r.url||'', r.source||'']);
    const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pokeprice_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast('CSV downloaded!', 'ok');
  }

  function startOver() {
    uploadedFiles = []; identifiedCards = []; pricedResults = [];
    previewGrid.innerHTML = ''; cardsTableBody.innerHTML = ''; resultsTableBody.innerHTML = '';
    fileInput.value = ''; btnAnalyze.disabled = true;
    stepReview.setAttribute('hidden',''); stepResults.setAttribute('hidden','');
    btnExportSheets.disabled = false; btnExportSheets.style.background = '';
    stepUpload.scrollIntoView({ behavior: 'smooth' });
    log('--- New session started ---');
  }

  function setupLog() { logToggle.addEventListener('click', () => logPanel.classList.toggle('open')); }

  function setupPicker() {
    const modal = $('pickerModal');
    $('btnClosePicker').addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }

  function init() {
    setupUpload(); setupBulkCondition(); setupAddCard(); setupLog(); setupPicker();
    btnAnalyze.addEventListener('click', analyzeImages);
    btnFetchPrices.addEventListener('click', fetchPrices);
    btnExportSheets.addEventListener('click', exportToSheets);
    btnExportCSV.addEventListener('click', exportCSV);
    btnStartOver.addEventListener('click', startOver);
    log('PokePrice ready. Upload images to begin.', 'ok');
    if (!Settings.get('gemini') || !Settings.get('justTCG')) setTimeout(() => toast('👋 Click Settings to add your API keys before starting', 'ok'), 800);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
