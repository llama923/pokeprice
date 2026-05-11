// app.js — Main application controller

const App = (() => {
  // State
  let uploadedFiles = [];
  let identifiedCards = []; // [{name, set, confidence}]
  let pricedResults  = []; // [{name, set, condition, price, url, source}]

  // ─── DOM refs ───
  const $ = id => document.getElementById(id);
  const uploadZone       = $('uploadZone');
  const fileInput        = $('fileInput');
  const previewGrid      = $('previewGrid');
  const btnAnalyze       = $('btnAnalyze');
  const stepUpload       = $('stepUpload');
  const stepReview       = $('stepReview');
  const stepResults      = $('stepResults');
  const cardsTableBody   = $('cardsTableBody');
  const cardCount        = $('cardCount');
  const btnFetchPrices   = $('btnFetchPrices');
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

  // ─── UTILS ───
  function toast(msg, type = 'ok') {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast show toast-${type}`;
    setTimeout(() => el.className = 'toast', 3000);
  }

  function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type === 'ok' ? 'ok' : type === 'error' ? 'err' : type === 'warn' ? 'warn' : ''}`;
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${msg}</span>`;
    logBody.appendChild(entry);
    logBody.scrollTop = logBody.scrollHeight;

    // Auto-open log panel on errors
    if (type === 'error' && !logPanel.classList.contains('open')) {
      logPanel.classList.add('open');
    }
  }

  function setButtonLoading(btn, loading) {
    const text    = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    if (loading) {
      text?.setAttribute('hidden', '');
      spinner?.removeAttribute('hidden');
      btn.disabled = true;
    } else {
      text?.removeAttribute('hidden');
      spinner?.setAttribute('hidden', '');
      btn.disabled = false;
    }
  }

  function conditionBadge(cond) {
    return `<span class="condition-badge cond-${cond}">${cond}</span>`;
  }

  function conditionSelect(value = 'NM', rowId) {
    const opts = ['NM','LP','MP','HP','DMG'].map(c =>
      `<option value="${c}" ${c === value ? 'selected' : ''}>${c}</option>`
    ).join('');
    return `<select class="card-condition" data-row="${rowId}">${opts}</select>`;
  }

  // ─── UPLOAD ───
  function setupUpload() {
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));

    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', e => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
    });

    const link = uploadZone.querySelector('.upload-link');
    link?.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  }

  function addFiles(files) {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      uploadedFiles.push(file);
      const idx = uploadedFiles.length - 1;
      const thumb = document.createElement('div');
      thumb.className = 'preview-thumb';
      thumb.dataset.idx = idx;
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      const btn = document.createElement('button');
      btn.className = 'thumb-remove';
      btn.textContent = '×';
      btn.title = 'Remove';
      btn.addEventListener('click', e => { e.stopPropagation(); removeFile(idx, thumb); });
      thumb.appendChild(img);
      thumb.appendChild(btn);
      previewGrid.appendChild(thumb);
    });
    updateAnalyzeButton();
  }

  function removeFile(idx, thumbEl) {
    uploadedFiles[idx] = null;
    thumbEl.remove();
    updateAnalyzeButton();
  }

  function updateAnalyzeButton() {
    const hasFiles = uploadedFiles.some(f => f !== null);
    btnAnalyze.disabled = !hasFiles;
  }

  // ─── STEP 1: ANALYZE ───
  async function analyzeImages() {
    const files = uploadedFiles.filter(Boolean);
    if (!files.length) return;

    if (!Settings.get('gemini')) {
      toast('Add your Gemini API key in Settings first', 'err');
      $('btnOpenSettings').click();
      return;
    }

    setButtonLoading(btnAnalyze, true);
    identifiedCards = [];
    log(`Sending ${files.length} image(s) to Gemini for analysis...`, 'info');

    let totalFound = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      log(`Analyzing image ${i + 1}/${files.length}: ${file.name}`);
      try {
        const cards = await Gemini.identifyCards(file, (msg) => log(`  → ${msg}`));
        log(`  → Found ${cards.length} card(s)`, 'ok');
        cards.forEach(c => {
          const key = `${c.name}||${c.set}`;
          if (!identifiedCards.find(x => `${x.name}||${x.set}` === key)) {
            identifiedCards.push({
              name: c.name || c.card_name || '',
              set: c.set || c.set_name || '',
              rarity: c.rarity_variant || '',
              tcgplayer_search: c.tcgplayer_search || '',
              confidence: c.confidence || 'medium',
              rowId: crypto.randomUUID(),
              condition: 'NM'
            });
            totalFound++;
          }
        });
      } catch (err) {
        log(`  → Error: ${err.message}`, 'error');
        toast(`Image ${i + 1} failed: ${err.message}`, 'err');
      }
    }

    setButtonLoading(btnAnalyze, false);

    if (identifiedCards.length === 0) {
      toast('No cards identified. Try clearer photos.', 'err');
      return;
    }

    log(`Total identified: ${totalFound} unique card(s)`, 'ok');
    toast(`Found ${totalFound} cards! Review and set conditions.`, 'ok');
    showReviewStep();
  }

  // ─── STEP 2: REVIEW ───
  function showReviewStep() {
    stepReview.removeAttribute('hidden');
    stepReview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderCardsTable();
  }

  function renderCardsTable() {
    cardCount.textContent = `${identifiedCards.length} card${identifiedCards.length !== 1 ? 's' : ''} identified`;
    cardsTableBody.innerHTML = '';
    identifiedCards.forEach((card, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.rowid = card.rowId;
      tr.innerHTML = `
        <td class="cell-name">
          <input type="text" value="${escHtml(card.name)}" data-field="name" data-rowid="${card.rowId}" placeholder="Card name" />
        </td>
        <td class="cell-set">
          <input type="text" value="${escHtml(card.set || '')}" data-field="set" data-rowid="${card.rowId}" placeholder="Set / number" />
        </td>
        <td class="cell-condition">
          ${conditionSelect(card.condition || 'NM', card.rowId)}
        </td>
        <td>
          <button class="btn-row-delete" data-rowid="${card.rowId}" title="Remove card">✕</button>
        </td>
      `;
      cardsTableBody.appendChild(tr);
    });

    // Bind inline editing
    cardsTableBody.querySelectorAll('input[data-field]').forEach(input => {
      input.addEventListener('change', e => {
        const card = identifiedCards.find(c => c.rowId === e.target.dataset.rowid);
        if (card) card[e.target.dataset.field] = e.target.value;
      });
    });

    // Bind condition changes
    cardsTableBody.querySelectorAll('.card-condition').forEach(sel => {
      sel.addEventListener('change', e => {
        const card = identifiedCards.find(c => c.rowId === e.target.dataset.row);
        if (card) card.condition = e.target.value;
      });
    });

    // Bind delete buttons
    cardsTableBody.querySelectorAll('.btn-row-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        const rowid = e.target.dataset.rowid;
        identifiedCards = identifiedCards.filter(c => c.rowId !== rowid);
        renderCardsTable();
      });
    });
  }

  // ─── BULK CONDITION ───
  function setupBulkCondition() {
    bulkCondition.addEventListener('change', e => {
      const val = e.target.value;
      if (!val) return;
      identifiedCards.forEach(c => c.condition = val);
      cardsTableBody.querySelectorAll('.card-condition').forEach(sel => sel.value = val);
      bulkCondition.value = '';
    });
  }

  // ─── ADD CARD MANUALLY ───
  function setupAddCard() {
    btnAddCard.addEventListener('click', () => {
      $('manualCardName').value = '';
      $('manualCardSet').value = '';
      $('manualCondition').value = 'NM';
      addCardModal.classList.add('open');
    });
    btnCloseAddCard.addEventListener('click', () => addCardModal.classList.remove('open'));
    addCardModal.addEventListener('click', e => { if (e.target === addCardModal) addCardModal.classList.remove('open'); });

    btnConfirmAdd.addEventListener('click', () => {
      const name = $('manualCardName').value.trim();
      if (!name) { toast('Enter a card name', 'err'); return; }
      identifiedCards.push({
        name,
        set: $('manualCardSet').value.trim(),
        condition: $('manualCondition').value,
        confidence: 'manual',
        rowId: crypto.randomUUID()
      });
      renderCardsTable();
      addCardModal.classList.remove('open');
      if (stepReview.hasAttribute('hidden')) showReviewStep();
      toast(`Added: ${name}`, 'ok');
    });
  }

  // ─── STEP 2: FETCH PRICES ───
  async function fetchPrices() {
    if (!Settings.get('justTCG')) {
      toast('Add your JustTCG API key in Settings first', 'err');
      $('btnOpenSettings').click();
      return;
    }

    // Sync current values from table inputs before fetching
    cardsTableBody.querySelectorAll('input[data-field]').forEach(input => {
      const card = identifiedCards.find(c => c.rowId === input.dataset.rowid);
      if (card) card[input.dataset.field] = input.value;
    });

    if (identifiedCards.length === 0) {
      toast('No cards to price', 'err');
      return;
    }

    setButtonLoading(btnFetchPrices, true);
    log(`Fetching prices for ${identifiedCards.length} card(s)...`);

    pricedResults = await JustTCG.getPriceBatch(
      identifiedCards.map(c => ({ name: c.name, set: c.set || '', condition: c.condition }))
    );

    const priced   = pricedResults.filter(r => r.price != null).length;
    const unpriced = pricedResults.length - priced;

    log(`Prices fetched: ${priced} found, ${unpriced} not found`, priced > 0 ? 'ok' : 'warn');

    setButtonLoading(btnFetchPrices, false);

    if (priced === 0) {
      toast('No prices found. Check card names and API key.', 'err');
    } else {
      toast(`Priced ${priced}/${pricedResults.length} cards!`, 'ok');
    }

    showResultsStep();
  }

  // ─── STEP 3: RESULTS ───
  function showResultsStep() {
    stepResults.removeAttribute('hidden');
    stepResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderResults();
  }

  function renderResults() {
    const total = pricedResults.length;
    const priced = pricedResults.filter(r => r.price != null);
    const totalValue = priced.reduce((sum, r) => sum + Number(r.price), 0);

    resultsSummary.innerHTML = `
      <div class="summary-stat">
        <div class="stat-value">${total}</div>
        <div class="stat-label">Total Cards</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value">${priced.length}</div>
        <div class="stat-label">Cards Priced</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value">$${totalValue.toFixed(2)}</div>
        <div class="stat-label">Collection Value</div>
      </div>
    `;

    resultsTableBody.innerHTML = '';
    pricedResults.forEach(r => {
      const tr = document.createElement('tr');
      const priceDisplay = r.price != null
        ? `<span class="price-cell has-price">$${Number(r.price).toFixed(2)}</span>`
        : `<span class="price-cell no-price">Not found</span>`;
      const sourceDisplay = r.url
        ? `<a href="${r.url}" target="_blank" class="source-link" rel="noopener">${r.source || 'View'} ↗</a>`
        : `<span style="color:var(--text-faint);font-size:12px">${r.source || '—'}</span>`;

      tr.innerHTML = `
        <td><strong>${escHtml(r.name)}</strong></td>
        <td style="color:var(--text-dim);font-size:13px">${escHtml(r.set || '—')}</td>
        <td>${conditionBadge(r.condition)}</td>
        <td>${priceDisplay}</td>
        <td>${sourceDisplay}</td>
      `;
      resultsTableBody.appendChild(tr);
    });
  }

  // ─── EXPORT: GOOGLE SHEETS ───
  async function exportToSheets() {
    if (!Settings.get('googleClient') || !Settings.get('sheetId')) {
      toast('Set Google Client ID and Sheet ID in Settings first', 'err');
      $('btnOpenSettings').click();
      return;
    }
    btnExportSheets.disabled = true;
    btnExportSheets.textContent = 'Authorizing...';
    log('Initiating Google Sheets export...');
    try {
      const { updatedRange, rowsWritten } = await Sheets.exportToSheet(pricedResults);
      log(`Exported ${rowsWritten} rows to ${updatedRange}`, 'ok');
      toast('Exported to Google Sheets! ✓', 'ok');
      btnExportSheets.innerHTML = '✓ Exported!';
      btnExportSheets.style.background = 'var(--success)';
    } catch (err) {
      log(`Sheets export failed: ${err.message}`, 'error');
      toast(`Export failed: ${err.message}`, 'err');
      btnExportSheets.disabled = false;
      btnExportSheets.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Export to Google Sheets`;
    }
  }

  // ─── EXPORT: CSV ───
  function exportCSV() {
    const header = ['Card Name','Set / Number','Condition','Market Price (USD)','TCGPlayer URL','Source'];
    const rows = pricedResults.map(r => [
      r.name, r.set || '', r.condition,
      r.price != null ? Number(r.price).toFixed(2) : 'N/A',
      r.url || '', r.source || ''
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pokeprice_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log('CSV downloaded', 'ok');
    toast('CSV downloaded!', 'ok');
  }

  // ─── START OVER ───
  function startOver() {
    uploadedFiles = [];
    identifiedCards = [];
    pricedResults = [];
    previewGrid.innerHTML = '';
    cardsTableBody.innerHTML = '';
    resultsTableBody.innerHTML = '';
    fileInput.value = '';
    btnAnalyze.disabled = true;
    stepReview.setAttribute('hidden', '');
    stepResults.setAttribute('hidden', '');
    btnExportSheets.disabled = false;
    btnExportSheets.style.background = '';
    btnExportSheets.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> Export to Google Sheets`;
    stepUpload.scrollIntoView({ behavior: 'smooth' });
    log('--- New session started ---');
  }

  // ─── LOG TOGGLE ───
  function setupLog() {
    logToggle.addEventListener('click', () => logPanel.classList.toggle('open'));
  }

  // ─── HELPERS ───
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── INIT ───
  function init() {
    setupUpload();
    setupBulkCondition();
    setupAddCard();
    setupLog();

    btnAnalyze.addEventListener('click', analyzeImages);
    btnFetchPrices.addEventListener('click', fetchPrices);
    btnExportSheets.addEventListener('click', exportToSheets);
    btnExportCSV.addEventListener('click', exportCSV);
    btnStartOver.addEventListener('click', startOver);

    log('PokePrice ready. Upload images to begin.', 'ok');

    // Hint if settings not configured
    const settingsMissing = !Settings.get('gemini') || !Settings.get('justTCG');
    if (settingsMissing) {
      setTimeout(() => toast('👋 Click Settings to add your API keys before starting', 'ok'), 800);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
