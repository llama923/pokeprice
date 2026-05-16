// Global HTML escape function used by picker
function esc(str){return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// app.js — Visual card verification, full photo shown per card

const App = (() => {
  let uploadedFiles = [];
  let identifiedCards = [];
  let pricedResults = [];
  // Cache object URLs per file to avoid recreating them
  const photoUrls = new Map();

  const $ = id => document.getElementById(id);
  const uploadZone      = $('uploadZone');
  const fileInput       = $('fileInput');
  const previewGrid     = $('previewGrid');
  const btnAnalyze      = $('btnAnalyze');
  const stepUpload      = $('stepUpload');
  const stepReview      = $('stepReview');
  const stepResults     = $('stepResults');
  const cardsList       = $('cardsList');
  const cardCount       = $('cardCount');
  const btnFetchPrices  = $('btnFetchPrices');
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

  function toast(msg, type='ok') {
    const el=$('toast'); el.textContent=msg; el.className=`toast show toast-${type}`;
    setTimeout(()=>el.className='toast',3500);
  }
  function log(msg, type='info') {
    const time=new Date().toLocaleTimeString();
    const e=document.createElement('div');
    e.className=`log-entry log-${type==='ok'?'ok':type==='error'?'err':type==='warn'?'warn':''}`;
    e.innerHTML=`<span class="log-time">${time}</span><span class="log-msg">${msg}</span>`;
    logBody.appendChild(e); logBody.scrollTop=logBody.scrollHeight;
    if(type==='error'&&!logPanel.classList.contains('open'))logPanel.classList.add('open');
  }
  function setButtonLoading(btn, loading) {
    const t=btn.querySelector('.btn-text'), s=btn.querySelector('.btn-spinner');
    if(loading){t?.setAttribute('hidden','');s?.removeAttribute('hidden');btn.disabled=true;}
    else{t?.removeAttribute('hidden');s?.setAttribute('hidden','');btn.disabled=false;}
  }
  function conditionBadge(c){return`<span class="condition-badge cond-${c}">${c}</span>`;}
  function esc(str){return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function getPhotoUrl(file) {
    if (!file) return '';
    if (!photoUrls.has(file)) photoUrls.set(file, URL.createObjectURL(file));
    return photoUrls.get(file);
  }

  // ─── UPLOAD ───
  function setupUpload() {
    uploadZone.addEventListener('click', ()=>fileInput.click());
    fileInput.addEventListener('change', e=>addFiles(Array.from(e.target.files)));
    uploadZone.addEventListener('dragover', e=>{e.preventDefault();uploadZone.classList.add('drag-over');});
    uploadZone.addEventListener('dragleave', ()=>uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', e=>{
      e.preventDefault();uploadZone.classList.remove('drag-over');
      addFiles(Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/')));
    });
    uploadZone.querySelector('.upload-link')?.addEventListener('click', e=>{e.stopPropagation();fileInput.click();});
  }

  function addFiles(files) {
    files.forEach(file=>{
      if(!file.type.startsWith('image/'))return;
      uploadedFiles.push(file);
      const idx=uploadedFiles.length-1;
      const thumb=document.createElement('div'); thumb.className='preview-thumb';
      const img=document.createElement('img'); img.src=getPhotoUrl(file);
      const btn=document.createElement('button'); btn.className='thumb-remove'; btn.textContent='×';
      btn.addEventListener('click', e=>{e.stopPropagation();uploadedFiles[idx]=null;thumb.remove();updateAnalyzeButton();});
      thumb.appendChild(img); thumb.appendChild(btn); previewGrid.appendChild(thumb);
    });
    updateAnalyzeButton();
  }

  function updateAnalyzeButton(){btnAnalyze.disabled=!uploadedFiles.some(Boolean);}

  // ─── ANALYZE ───
  async function analyzeImages() {
    const files=uploadedFiles.filter(Boolean);
    if(!files.length)return;
    if(!Settings.get('gemini')){toast('Add your Gemini API key in Settings first','err');$('btnOpenSettings').click();return;}

    setButtonLoading(btnAnalyze,true);
    identifiedCards=[];
    log(`Sending ${files.length} image(s) to Gemini...`);

    for(let i=0;i<files.length;i++){
      const file=files[i];
      log(`Analyzing image ${i+1}/${files.length}: ${file.name}`);
      try{
        const cards=await Gemini.identifyCards(file, msg=>log(`  → ${msg}`));
        log(`  → Found ${cards.length} card(s)`,'ok');
        cards.forEach(c=>{
          identifiedCards.push({
            ...c,
            rowId: crypto.randomUUID(),
            condition: 'NM',
            sourceFile: file,      // keep reference to source photo
            pickedCard: null,
            allMatches: null,
            loaded: false
          });
        });
      }catch(err){
        log(`  → Error: ${err.message}`,'error');
        toast(`Image ${i+1} failed: ${err.message}`,'err');
      }
    }

    setButtonLoading(btnAnalyze,false);
    if(!identifiedCards.length){toast('No cards identified. Try clearer photos.','err');return;}

    log(`Total: ${identifiedCards.length} card(s) — loading TCGPlayer matches...`,'ok');
    toast(`Found ${identifiedCards.length} cards! Loading TCGPlayer matches...`,'ok');
    showReviewStep();
    loadAllMatches();
  }

  // ─── LOAD TCG MATCHES ───
  async function loadAllMatches() {
    for(const card of identifiedCards){
      await JustTCG.searchForPicker(card.name).then(results=>{ card.allMatches=results; if(results.length&&!card.pickedCard)card.pickedCard=results[0]; updateCardRow(card.rowId); card.loaded=true; });
      await new Promise(r=>setTimeout(r,120));
    }
    log('All TCGPlayer matches loaded','ok');
  }

  async function loadCardMatches(card) {
    try{
      const results=await JustTCG.searchForPicker(card.name);
      card.allMatches=results;
      if(card.allMatches.length && !card.pickedCard) card.pickedCard=card.allMatches[0];
    }catch{
      card.allMatches=[];
    }
    card.loaded=true;
    updateCardRow(card.rowId);
  }

  // ─── REVIEW ───
  function showReviewStep() {
    stepReview.removeAttribute('hidden');
    stepReview.scrollIntoView({behavior:'smooth',block:'start'});
    renderCardsList();
  }

  function renderCardsList() {
    cardCount.textContent=`${identifiedCards.length} card${identifiedCards.length!==1?'s':''} identified`;
    cardsList.innerHTML='';
    identifiedCards.forEach(card=>{
      const row=document.createElement('div');
      row.className='verify-row'; row.dataset.rowid=card.rowId;
      row.innerHTML=buildRowHTML(card);
      bindRowEvents(row,card);
      cardsList.appendChild(row);
    });
    bulkCondition.onchange=e=>{
      const val=e.target.value; if(!val)return;
      identifiedCards.forEach(c=>c.condition=val);
      cardsList.querySelectorAll('.card-condition-sel').forEach(sel=>sel.value=val);
      bulkCondition.value='';
    };
  }

  function buildRowHTML(card) {
    const p = card.pickedCard;

    // Left: full source photo (correct photo for this card's source file)
    const photoUrl = getPhotoUrl(card.sourceFile);
    const photoHtml = photoUrl
      ? `<img src="${esc(photoUrl)}" alt="Source photo" class="verify-photo-img" />`
      : `<div class="verify-photo-placeholder">No photo</div>`;

    // Right: TCGPlayer match
    let tcgHtml;
    if(!card.loaded){
      tcgHtml=`
        <div class="verify-tcg-card">
          <div class="verify-tcg-img-wrap">
            <div class="verify-tcg-placeholder"><span class="loading-dots">Loading</span></div>
          </div>
          <div class="verify-tcg-info">
            <div class="verify-tcg-name">${esc(card.name)}</div>
            <div class="verify-tcg-set" style="color:var(--text-faint)">Searching TCGPlayer...</div>
          </div>
        </div>`;
    } else if(p){
      tcgHtml=`
        <div class="verify-tcg-card clickable" data-action="pick" title="Click to change version">
          <div class="verify-tcg-img-wrap">
            <img src="${esc(p.image)}" alt="${esc(p.name)}" class="verify-tcg-img"
              onerror="this.style.display='none'" />
          </div>
          <div class="verify-tcg-info">
            <div class="verify-tcg-name">${esc(p.name)}</div>
            <div class="verify-tcg-set">${esc(p.setName)} ${esc(p.number)}</div>
            ${p.rarity?`<div class="verify-tcg-rarity">${esc(p.rarity)}</div>`:''}
          </div>
          <div class="verify-change-hint">click to change</div>
        </div>`;
    } else {
      tcgHtml=`
        <div class="verify-tcg-card clickable not-found" data-action="pick" title="Click to search">
          <div class="verify-tcg-img-wrap">
            <div class="verify-tcg-placeholder">?</div>
          </div>
          <div class="verify-tcg-info">
            <div class="verify-tcg-name">${esc(card.name)}</div>
            <div class="verify-tcg-set" style="color:var(--text-faint)">Not found — click to search</div>
          </div>
        </div>`;
    }

    return `
      <div class="verify-left">
        <div class="verify-photo-wrap">${photoHtml}</div>
        <div class="verify-label">Your photo</div>
      </div>
      <div class="verify-arrow">→</div>
      <div class="verify-right">${tcgHtml}</div>
      <div class="verify-controls">
        <select class="card-condition-sel" data-rowid="${card.rowId}">
          ${['NM','LP','MP','HP','DMG'].map(c=>`<option value="${c}"${c===card.condition?' selected':''}>${c}</option>`).join('')}
        </select>
        <button class="btn-row-delete" data-rowid="${card.rowId}" title="Remove">✕</button>
      </div>
    `;
  }

  function bindRowEvents(row, card) {
    row.querySelector('.card-condition-sel')?.addEventListener('change', e=>{
      const c=identifiedCards.find(c=>c.rowId===e.target.dataset.rowid);
      if(c) c.condition=e.target.value;
    });
    row.querySelector('[data-action="pick"]')?.addEventListener('click', ()=>openPicker(card.rowId));
    row.querySelector('.btn-row-delete')?.addEventListener('click', ()=>{
      identifiedCards=identifiedCards.filter(c=>c.rowId!==card.rowId);
      row.remove();
      cardCount.textContent=`${identifiedCards.length} card${identifiedCards.length!==1?'s':''} identified`;
    });
  }

  function updateCardRow(rowId) {
    const card=identifiedCards.find(c=>c.rowId===rowId); if(!card)return;
    const row=cardsList.querySelector(`[data-rowid="${rowId}"]`); if(!row)return;
    row.innerHTML=buildRowHTML(card);
    bindRowEvents(row,card);
  }

  // ─── PICKER ───
  let currentPickerRowId=null;

  async function openPicker(rowId) {
    currentPickerRowId=rowId;
    const card=identifiedCards.find(c=>c.rowId===rowId); if(!card)return;
    $('pickerTitle').textContent=card.name;
    $('pickerSearch').value=card.name;
    $('pickerModal').classList.add('open');

    const grid=$('pickerGrid');
    if(card.allMatches?.length){
      renderPickerCards(card.allMatches, grid);
    } else {
      grid.innerHTML='<div class="picker-loading">Loading candidates...</div>';
      try{
        const results=await JustTCG.searchForPicker(card.name);
        card.allMatches=results;
        renderPickerCards(card.allMatches, grid);
      }catch(err){
        grid.innerHTML=`<div class="picker-loading" style="color:var(--error)">${esc(err.message)}</div>`;
      }
    }

    let t;
    $('pickerSearch').oninput=()=>{
      clearTimeout(t);
      t=setTimeout(async()=>{
        const q=$('pickerSearch').value.trim(); if(!q)return;
        grid.innerHTML='<div class="picker-loading">Searching...</div>';
        try{
          const r=await JustTCG.searchForPicker(q);
          renderPickerCards(r, grid);
        }catch(err){
          grid.innerHTML=`<div class="picker-loading" style="color:var(--error)">${esc(err.message)}</div>`;
        }
      },400);
    };
  }

  function renderPickerCards(cards, grid) {
    if(!cards.length){
      grid.innerHTML='<div class="picker-loading">No results — try editing the search above.</div>';
      return;
    }
    grid.innerHTML='';
    const current=identifiedCards.find(c=>c.rowId===currentPickerRowId);
    cards.forEach(card=>{
      const item=document.createElement('div');
      item.className='picker-card';
      if(current?.pickedCard?.id===card.id) item.classList.add('picker-card-active');
      item.innerHTML=`
        <img src="${esc(card.image)}" alt="${esc(card.name)}" loading="lazy"
          onerror="this.style.background='var(--bg3)';this.style.minHeight='88px'" />
        <div class="picker-card-label">${esc(card.setName)}</div>
        <div class="picker-card-number">${esc(card.number)}</div>
        ${card.rarity?`<div class="picker-card-rarity">${esc(card.rarity)}</div>`:''}
      `;
      item.addEventListener('click', ()=>{
        const c=identifiedCards.find(c=>c.rowId===currentPickerRowId);
        if(c){c.pickedCard=card; c.name=card.name; updateCardRow(c.rowId);}
        $('pickerModal').classList.remove('open');
        toast(`✓ ${card.name} — ${card.setName} ${card.number}`,'ok');
      });
      grid.appendChild(item);
    });
  }

  // ─── ADD CARD MANUALLY ───
  function setupAddCard() {
    btnAddCard.addEventListener('click', ()=>{
      $('manualCardName').value=''; $('manualCardSet').value=''; $('manualCondition').value='NM';
      addCardModal.classList.add('open');
    });
    btnCloseAddCard.addEventListener('click', ()=>addCardModal.classList.remove('open'));
    addCardModal.addEventListener('click', e=>{if(e.target===addCardModal)addCardModal.classList.remove('open');});
    btnConfirmAdd.addEventListener('click', ()=>{
      const name=$('manualCardName').value.trim();
      if(!name){toast('Enter a card name','err');return;}
      const card={name,art_style:'',search_hint:name,condition:$('manualCondition').value,rowId:crypto.randomUUID(),sourceFile:null,pickedCard:null,allMatches:null,loaded:false};
      identifiedCards.push(card);
      const row=document.createElement('div');
      row.className='verify-row'; row.dataset.rowid=card.rowId;
      row.innerHTML=buildRowHTML(card); bindRowEvents(row,card);
      cardsList.appendChild(row);
      JustTCG.searchForPicker(card.name).then(results=>{ card.allMatches=results; if(results.length&&!card.pickedCard)card.pickedCard=results[0]; updateCardRow(card.rowId); card.loaded=true; });
      addCardModal.classList.remove('open');
      if(stepReview.hasAttribute('hidden'))showReviewStep();
      toast(`Added: ${name}`,'ok');
    });
  }

  // ─── FETCH PRICES ───
  async function fetchPrices() {
    if(!Settings.get('justTCG')){toast('Add your JustTCG API key in Settings first','err');$('btnOpenSettings').click();return;}
    if(!identifiedCards.length){toast('No cards to price','err');return;}
    setButtonLoading(btnFetchPrices,true);
    log(`Fetching prices for ${identifiedCards.length} card(s)...`);
    const cardsToPrice=identifiedCards.map(c=>({
      name: c.pickedCard?c.pickedCard.name:c.name,
      set:  c.pickedCard?`${c.pickedCard.setName} ${c.pickedCard.number}`:'',
      condition: c.condition,
      tcgplayerId: c.pickedCard?.tcgplayerId || null
    }));
    pricedResults=await JustTCG.getPriceBatch(cardsToPrice);
    const priced=pricedResults.filter(r=>r.price!=null).length;
    log(`Prices: ${priced} found, ${pricedResults.length-priced} not found`,priced>0?'ok':'warn');
    setButtonLoading(btnFetchPrices,false);
    if(priced===0)toast('No prices found. Check card names and API key.','err');
    else toast(`Priced ${priced}/${pricedResults.length} cards!`,'ok');
    showResultsStep();
  }

  // ─── RESULTS ───
  function showResultsStep() {
    stepResults.removeAttribute('hidden');
    stepResults.scrollIntoView({behavior:'smooth',block:'start'});
    const total=pricedResults.length;
    const priced=pricedResults.filter(r=>r.price!=null);
    const totalValue=priced.reduce((sum,r)=>sum+Number(r.price),0);
    resultsSummary.innerHTML=`
      <div class="summary-stat"><div class="stat-value">${total}</div><div class="stat-label">Total Cards</div></div>
      <div class="summary-stat"><div class="stat-value">${priced.length}</div><div class="stat-label">Cards Priced</div></div>
      <div class="summary-stat"><div class="stat-value">$${totalValue.toFixed(2)}</div><div class="stat-label">Collection Value</div></div>`;
    resultsTableBody.innerHTML='';
    pricedResults.forEach(r=>{
      const tr=document.createElement('tr');
      const pd=r.price!=null?`<span class="price-cell has-price">$${Number(r.price).toFixed(2)}</span>`:`<span class="price-cell no-price">Not found</span>`;
      const src=r.url?`<a href="${r.url}" target="_blank" class="source-link" rel="noopener">${r.source||'View'} ↗</a>`:`<span style="color:var(--text-faint);font-size:12px">${r.source||'—'}</span>`;
      tr.innerHTML=`<td><strong>${esc(r.name)}</strong></td><td style="color:var(--text-dim);font-size:13px">${esc(r.set||'—')}</td><td>${conditionBadge(r.condition)}</td><td>${pd}</td><td>${src}</td>`;
      resultsTableBody.appendChild(tr);
    });
  }

  // ─── EXPORT ───
  async function exportToSheets() {
    if(!Settings.get('googleClient')||!Settings.get('sheetId')){toast('Set Google Client ID and Sheet ID in Settings first','err');$('btnOpenSettings').click();return;}
    btnExportSheets.disabled=true; btnExportSheets.textContent='Authorizing...';
    try{
      const{updatedRange,rowsWritten}=await Sheets.exportToSheet(pricedResults);
      log(`Exported ${rowsWritten} rows to ${updatedRange}`,'ok');
      toast('Exported to Google Sheets! ✓','ok');
      btnExportSheets.innerHTML='✓ Exported!'; btnExportSheets.style.background='var(--success)';
    }catch(err){
      log(`Sheets export failed: ${err.message}`,'error');
      toast(`Export failed: ${err.message}`,'err');
      btnExportSheets.disabled=false;
      btnExportSheets.innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Export to Google Sheets`;
    }
  }

  function exportCSV() {
    const header=['Card Name','Set / Number','Condition','Market Price (USD)','TCGPlayer URL','Source'];
    const rows=pricedResults.map(r=>[r.name,r.set||'',r.condition,r.price!=null?Number(r.price).toFixed(2):'N/A',r.url||'',r.source||'']);
    const csv=[header,...rows].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`pokeprice_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast('CSV downloaded!','ok');
  }

  function startOver() {
    // Revoke all cached photo URLs
    photoUrls.forEach(url=>URL.revokeObjectURL(url));
    photoUrls.clear();
    uploadedFiles=[]; identifiedCards=[]; pricedResults=[];
    previewGrid.innerHTML=''; cardsList.innerHTML=''; resultsTableBody.innerHTML='';
    fileInput.value=''; btnAnalyze.disabled=true;
    stepReview.setAttribute('hidden',''); stepResults.setAttribute('hidden','');
    btnExportSheets.disabled=false; btnExportSheets.style.background='';
    stepUpload.scrollIntoView({behavior:'smooth'});
    log('--- New session started ---');
  }

  function setupLog(){logToggle.addEventListener('click',()=>logPanel.classList.toggle('open'));}

  function setupPicker(){
    const modal=$('pickerModal');
    $('btnClosePicker').addEventListener('click',()=>modal.classList.remove('open'));
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');});
  }

  function init() {
    setupUpload(); setupAddCard(); setupLog(); setupPicker();
    btnAnalyze.addEventListener('click', analyzeImages);
    btnFetchPrices.addEventListener('click', fetchPrices);
    btnExportSheets.addEventListener('click', exportToSheets);
    btnExportCSV.addEventListener('click', exportCSV);
    btnStartOver.addEventListener('click', startOver);
    log('PokePrice ready. Upload images to begin.','ok');
    if(!Settings.get('gemini')||!Settings.get('justTCG'))
      setTimeout(()=>toast('👋 Click Settings to add your API keys before starting','ok'),800);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
