// Port management and message routing
let port;

self.onconnect = (event) => {
  port = event.ports[0];
  port.onmessage = handleMessage;
  port.start();
};

// OAuth state
let accessToken = null;
let refreshToken = null;
let tokenExpiry = null;
let authState = null; // for PKCE state validation
let pendingRequests = new Map(); // requestId -> resolve/reject

// Configuration
let config = {
  clientId: '',
  redirectUri: '',
};

// Initialize config from Env.js
async function initializeConfig() {
  // Fetch and eval Env.js to get window.VG.Env
  try {
    const envResponse = await fetch('./Env.js');
    const envScript = await envResponse.text();
    // Create a scope to eval Env.js
    const scope = {};
    eval(envScript); // This sets window.VG (we access scope.VG after eval)

    // Since eval in worker context sets globals, we access VG directly
    if (self.VG && self.VG.Env && self.VG.Env.google) {
      config = {
        clientId: self.VG.Env.google.clientId,
        redirectUri: self.VG.Env.google.redirectUri,
      };
    }
  } catch (err) {
    console.error('Failed to initialize Google config:', err);
  }
}

// Message handler
async function handleMessage(event) {
  const { type, payload } = event.data;

  if (type === 'CREATE_SHEET') {
    handleCreateSheet(payload);
  } else if (type === 'OAUTH_CODE') {
    handleOAuthCode(payload);
  }
}

// Create Google Sheet
async function handleCreateSheet({ rows, columns, sheetName, requestId }) {
  try {
    // If no access token, request auth
    if (!accessToken) {
      const authUrl = buildAuthUrl();
      authState = generateRandomString(32);
      port.postMessage({
        type: 'GOOGLE_AUTH_REQUIRED',
        payload: { authUrl, requestId },
      });
      pendingRequests.set(requestId, { rows, columns, sheetName });
      return;
    }

    // If token expired, refresh
    if (tokenExpiry && Date.now() > tokenExpiry) {
      await refreshAccessToken();
    }

    // Create the Sheet
    const sheetUrl = await createSheet(rows, columns, sheetName);
    port.postMessage({
      type: 'SHEET_CREATED',
      payload: { url: sheetUrl, requestId },
    });
  } catch (err) {
    port.postMessage({
      type: 'SHEET_ERROR',
      payload: { message: err.message, requestId },
    });
  }
}

// Handle OAuth code from callback
async function handleOAuthCode({ code, state }) {
  try {
    if (state !== authState) {
      throw new Error('State mismatch in OAuth callback');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code_verifier: self.codeVerifier, // stored during auth URL generation
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }

    const tokenData = await tokenResponse.json();
    accessToken = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
    tokenExpiry = Date.now() + (tokenData.expires_in * 1000);

    // Resume any pending CREATE_SHEET requests
    for (const [requestId, { rows, columns, sheetName }] of pendingRequests) {
      handleCreateSheet({ rows, columns, sheetName, requestId });
      pendingRequests.delete(requestId);
    }
  } catch (err) {
    console.error('OAuth code exchange failed:', err);
  }
}

// Refresh access token
async function refreshAccessToken() {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
      }),
    });

    if (!response.ok) {
      accessToken = null; // Clear token, will need re-auth
      throw new Error('Token refresh failed');
    }

    const tokenData = await response.json();
    accessToken = tokenData.access_token;
    tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
  } catch (err) {
    console.error('Token refresh error:', err);
    throw err;
  }
}

// Build PKCE authorization URL
function buildAuthUrl() {
  const codeChallenge = generateCodeChallenge();
  self.codeVerifier = codeChallenge.verifier; // Store for later exchange

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    state: authState,
    code_challenge: codeChallenge.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline', // Request refresh token
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// PKCE helper: generate code verifier and challenge
function generateCodeChallenge() {
  const verifier = generateRandomString(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  return crypto.subtle.digest('SHA-256', data).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashString = hashArray.map(b => String.fromCharCode(b)).join('');
    const challenge = btoa(hashString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return { verifier, challenge };
  });
}

// Generate random string for PKCE
function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

// Create Sheet via Google Sheets API
async function createSheet(rows, columns, sheetName) {
  const sheetData = buildSheetData(rows, columns);

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: sheetName },
      sheets: [{
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: sheetData,
        }],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Failed to create Sheet');
  }

  const result = await response.json();
  return `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`;
}

// Build rowData for Sheet API
function buildSheetData(rows, columns) {
  const rowData = [];

  // Header row (bold)
  const headerValues = columns.map(col => ({
    userEnteredValue: { stringValue: col.header },
    userEnteredFormat: { textFormat: { bold: true } },
  }));
  rowData.push({ values: headerValues });

  // Data rows
  for (const row of rows) {
    const values = columns.map(col => {
      const value = row[col.key];
      return {
        userEnteredValue: formatCellValue(value),
      };
    });
    rowData.push({ values });
  }

  return rowData;
}

// Format cell value for Sheets API
function formatCellValue(value) {
  if (value === null || value === undefined) {
    return { stringValue: '' };
  }
  if (typeof value === 'number') {
    return { numberValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  return { stringValue: String(value) };
}

// Initialize on load
initializeConfig();
