// sheets.js — Google Sheets API export via OAuth 2.0 (implicit flow)

const Sheets = (() => {
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
  const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

  let tokenClient = null;
  let gapiInited = false;
  let gisInited = false;
  let accessToken = null;

  // Load Google API client library
  function loadGapi() {
    return new Promise((resolve, reject) => {
      if (window.gapi) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.head.appendChild(script);
    });
  }

  // Load Google Identity Services
  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  async function init() {
    const clientId = Settings.get('googleClient');
    if (!clientId) throw new Error('Google OAuth Client ID not set in Settings.');

    await Promise.all([loadGapi(), loadGis()]);

    // Initialize gapi client
    await new Promise((resolve, reject) => {
      gapi.load('client', { callback: resolve, onerror: reject });
    });

    await gapi.client.init({
      discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;

    // Initialize token client
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: '', // will be set at auth time
    });
    gisInited = true;
  }

  async function getToken() {
    if (!gapiInited || !gisInited) await init();

    return new Promise((resolve, reject) => {
      tokenClient.callback = (resp) => {
        if (resp.error) {
          reject(new Error(`OAuth error: ${resp.error}`));
        } else {
          accessToken = resp.access_token;
          resolve(resp.access_token);
        }
      };
      // If we already have a token, try silently; otherwise prompt
      if (accessToken && gapi.client.getToken()?.access_token) {
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        tokenClient.requestAccessToken({ prompt: 'consent' });
      }
    });
  }

  async function exportToSheet(results) {
    const sheetId = Settings.get('sheetId');
    if (!sheetId) throw new Error('Google Sheet ID not set in Settings.');

    // Ensure we have a token
    await getToken();

    const now = new Date().toLocaleString();

    // Build rows
    const headerRow = [
      'Card Name',
      'Set / Number',
      'Condition',
      'Market Price (USD)',
      'TCGPlayer URL',
      'Source',
      'Scanned At'
    ];

    const dataRows = results.map(r => [
      r.name || '',
      r.set || '',
      r.condition || '',
      r.price != null ? Number(r.price).toFixed(2) : 'N/A',
      r.url || '',
      r.source || '',
      now
    ]);

    const totalPriced = results.filter(r => r.price != null);
    const totalValue = totalPriced.reduce((sum, r) => sum + Number(r.price), 0);

    const summaryRows = [
      [],
      ['Summary', '', '', '', '', '', ''],
      ['Total Cards', results.length],
      ['Cards Priced', totalPriced.length],
      ['Total Collection Value (USD)', totalValue.toFixed(2)],
      ['Export Date', now]
    ];

    const allRows = [headerRow, ...dataRows, ...summaryRows];

    // Append to sheet
    const response = await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: allRows }
    });

    // Apply header formatting
    try {
      await applyFormatting(sheetId, results.length);
    } catch {
      // Formatting is nice-to-have; don't fail export if it errors
    }

    const updatedRange = response?.result?.updates?.updatedRange || 'Sheet1';
    return { updatedRange, rowsWritten: allRows.length };
  }

  async function applyFormatting(sheetId) {
    // Bold header row, color it
    const requests = [
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.098, green: 0.098, blue: 0.125 },
              textFormat: {
                bold: true,
                foregroundColor: { red: 0.969, green: 0.792, blue: 0.282 }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)'
        }
      },
      {
        autoResizeDimensions: {
          dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 7 }
        }
      }
    ];

    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      resource: { requests }
    });
  }

  return { exportToSheet };
})();
