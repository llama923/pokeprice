// settings.js — API key storage via localStorage

const Settings = (() => {
  const KEYS = {
    gemini:       'pokeprice_gemini_key',
    justTCG:      'pokeprice_justtcg_key',
    googleClient: 'pokeprice_google_client',
    sheetId:      'pokeprice_sheet_id',
  };

  function get(name) {
    return localStorage.getItem(KEYS[name]) || '';
  }

  function set(name, value) {
    localStorage.setItem(KEYS[name], value.trim());
  }

  function load() {
    document.getElementById('keyGemini').value       = get('gemini');
    document.getElementById('keyJustTCG').value      = get('justTCG');
    document.getElementById('keyGoogleClient').value = get('googleClient');
    document.getElementById('keySheetId').value      = get('sheetId');
  }

  function save() {
    set('gemini',       document.getElementById('keyGemini').value);
    set('justTCG',      document.getElementById('keyJustTCG').value);
    set('googleClient', document.getElementById('keyGoogleClient').value);
    set('sheetId',      document.getElementById('keySheetId').value);

    const confirm = document.getElementById('saveConfirm');
    confirm.classList.add('visible');
    setTimeout(() => confirm.classList.remove('visible'), 2000);
  }

  function allSet() {
    return get('gemini') && get('justTCG') && get('googleClient') && get('sheetId');
  }

  return { get, set, load, save, allSet };
})();

// Wire up settings modal
document.addEventListener('DOMContentLoaded', () => {
  const modal       = document.getElementById('settingsModal');
  const btnOpen     = document.getElementById('btnOpenSettings');
  const btnClose    = document.getElementById('btnCloseSettings');
  const btnSave     = document.getElementById('btnSaveSettings');

  Settings.load();

  btnOpen.addEventListener('click', () => {
    Settings.load();
    modal.classList.add('open');
  });
  btnClose.addEventListener('click', () => { Settings.save(); modal.classList.remove('open'); });
  modal.addEventListener('click', e => { if (e.target === modal) { Settings.save(); modal.classList.remove('open'); } });
  btnSave.addEventListener('click', () => Settings.save());

  // Autosave on every keystroke so keys are never lost
  ['keyGemini','keyJustTCG','keyGoogleClient','keySheetId'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => Settings.save());
  });
});
