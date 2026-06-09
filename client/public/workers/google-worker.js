const logPrefix = '[GoogleWorker]:'

// Private state
let accessToken = null
let refreshToken = null
let tokenExpiry = null
let codeVerifier = null
let authState = null
let ENV = null
let initialized = false

// Configuration
let config = {
  clientId: '',
  redirectUri: '',
}

// Port management
let ports = []

// Worker entry point
self.onconnect = (event) => {
  const port = event.ports[0]
  ports.push(port)
  port.onmessage = onMessage
  port.start()
}

// Message handlers
const messageHandlers = {
  initialize,
  getStatus,
  getAuthUrl,
  oauthCallback,
  createSheet,
}

// Get current status (for client to check if authenticated)
function getStatus(options, port) {
  return {
    initialized,
    hasAccessToken: !!accessToken,
  }
}

async function onMessage(e) {
  const port = e.target
  const { requestId, request, ...options } = e.data

  const handler = messageHandlers[request]
  if (handler) {
    try {
      const response = await handler(options, port)
      port.postMessage({ requestId, response })
    }
    catch (error) {
      console.error(logPrefix, 'Error handling request:', request, error)
      port.postMessage({ requestId, error: error.message })
    }
  }
  else {
    port.postMessage({ requestId, error: 'Unknown request' })
  }
}

// Initialize with Google config from main thread
async function initialize(options, port) {
  if (!initialized) {
    initialized = true
    ENV = options.env || null

    if (!ENV || !ENV.google || !ENV.google.clientId || !ENV.google.redirectUri) {
      throw new Error('Missing google.clientId or google.redirectUri in Env')
    }

    config = {
      clientId: ENV.google.clientId,
      redirectUri: ENV.google.redirectUri,
    }

    console.log(logPrefix, 'Initialized with config:', {
      clientId: config.clientId.substring(0, 20) + '...',
      redirectUri: config.redirectUri,
    })
  }

  return { success: true, env: ENV }
}

// Get authorization URL (called by main app before opening popup)
async function getAuthUrl(options, port) {
  const { verifier, challenge } = await generatePKCE()
  codeVerifier = verifier
  authState = generateRandomString(32)

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: authState,
    access_type: 'offline',
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return { authUrl, codeVerifier: verifier }
}

// Handle OAuth callback from google-callback.html
async function oauthCallback(options, port) {
  console.log(logPrefix, 'oauthCallback called with payload:', options)

  const { tokens, state } = options

  if (!tokens || !tokens.access_token) {
    throw new Error('No access token received from callback')
  }

  console.log(logPrefix, 'Validating state:', { received: state, expected: authState })
  if (state !== authState) {
    throw new Error('State mismatch in OAuth callback')
  }

  console.log(logPrefix, 'State valid, storing tokens')

  // Store tokens (already exchanged by backend)
  accessToken = tokens.access_token
  refreshToken = tokens.refresh_token || null
  tokenExpiry = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null
  codeVerifier = null // consumed

  console.log(logPrefix, 'Tokens stored, broadcasting AUTH_COMPLETE')

  // Broadcast AUTH_COMPLETE to all ports
  broadcastToAllPorts({
    requestId: 'auth-complete',
    response: { authComplete: true },
  })

  console.log(logPrefix, 'AUTH_COMPLETE broadcast sent')
  return { success: true }
}

// Create Google Sheet (called by main app after auth)
async function createSheet(options, port) {
  const { rows, columns, sheetName } = options

  // Ensure we have a valid token
  if (!accessToken) {
    throw new Error('Not authenticated. Please authorize Google Sheets access first.')
  }

  // Refresh if expired
  if (tokenExpiry && Date.now() > tokenExpiry) {
    await refreshAccessToken()
  }

  const sheetUrl = await createSheetViaAPI(rows, columns, sheetName)
  return { url: sheetUrl }
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
    })

    if (!response.ok) {
      accessToken = null
      throw new Error('Token refresh failed')
    }

    const tokenData = await response.json()
    accessToken = tokenData.access_token
    tokenExpiry = Date.now() + tokenData.expires_in * 1000
  } catch (err) {
    console.error(logPrefix, 'Token refresh error:', err)
    throw err
  }
}

// Create Sheet via Google Sheets API
async function createSheetViaAPI(rows, columns, sheetName) {
  const sheetData = buildSheetData(rows, columns)

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
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || 'Failed to create Sheet')
  }

  const result = await response.json()
  return `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`
}

// Build rowData for Sheet API
function buildSheetData(rows, columns) {
  const rowData = []

  // Header row (bold)
  const headerValues = columns.map(col => ({
    userEnteredValue: { stringValue: col.header },
    userEnteredFormat: { textFormat: { bold: true } },
  }))
  rowData.push({ values: headerValues })

  // Data rows
  for (const row of rows) {
    const values = columns.map(col => {
      const value = row[col.key]
      return {
        userEnteredValue: formatCellValue(value),
      }
    })
    rowData.push({ values })
  }

  return rowData
}

// Format cell value for Sheets API
function formatCellValue(value) {
  if (value === null || value === undefined) {
    return { stringValue: '' }
  }
  if (typeof value === 'number') {
    return { numberValue: value }
  }
  if (typeof value === 'boolean') {
    return { boolValue: value }
  }
  return { stringValue: String(value) }
}

// PKCE: Generate code verifier and challenge
async function generatePKCE() {
  const verifier = generateRandomString(128)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashString = hashArray.map(b => String.fromCharCode(b)).join('')
  const challenge = btoa(hashString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return { verifier, challenge }
}

// Generate random string
function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  let result = ''
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length]
  }
  return result
}

// Broadcast message to all connected ports
function broadcastToAllPorts(message) {
  for (const port of ports) {
    port.postMessage(message)
  }
}
