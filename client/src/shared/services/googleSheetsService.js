// Track if we're currently authenticating
let isAuthenticating = false;
let authPromise = null;

// Listen for AUTH_COMPLETE broadcast from worker
function setupAuthListener() {
  if (!VG.googleWorker || !VG.googleWorker.port) return;

  const port = VG.googleWorker.port;

  if (!port.__googleServiceAuthListenerAttached) {
    const originalOnMessage = port.onmessage;

    port.onmessage = (event) => {
      // Handle auth-complete broadcast (sent to all ports)
      if (event.data.requestId === 'auth-complete' && event.data.response?.authComplete) {
        console.log('[googleSheetsService] AUTH_COMPLETE received');
        isAuthenticating = false;
        if (authPromise) {
          authPromise.resolve();
          authPromise = null;
        }
      }
    };

    port.__googleServiceAuthListenerAttached = true;
  }
}

/**
 * Ensure the user is authenticated with Google
 * Opens an OAuth popup if needed
 */
async function ensureAuthenticated() {
  if (isAuthenticating) {
    // Wait for existing auth to complete
    return new Promise((resolve, reject) => {
      authPromise = { resolve, reject };
    });
  }

  // Check if we already have a valid token
  if (!VG.googleWorker) {
    throw new Error('Google Sheets worker not initialized');
  }

  try {
    const status = await VG.googleWorker.sendWorkerRequest({ request: 'getStatus' });
    if (status.hasAccessToken) {
      console.log('[googleSheetsService] Already authenticated, skipping OAuth');
      return;
    }
  } catch (err) {
    console.error('[googleSheetsService] Failed to check auth status:', err.message);
  }

  // Open the auth popup
  console.log('[googleSheetsService] Opening auth popup for first-time authentication');
  return openAuthPopup();
}

/**
 * Request the OAuth URL from the worker and open the auth popup
 */
async function openAuthPopup() {
  if (!VG.googleWorker) {
    throw new Error('Google Sheets worker not initialized');
  }

  setupAuthListener();

  return new Promise((resolve, reject) => {
    isAuthenticating = true;
    authPromise = { resolve, reject };

    (async () => {
      try {
        console.log('[googleSheetsService] Requesting auth URL from worker');
        const response = await VG.googleWorker.sendWorkerRequest({ request: 'getAuthUrl' });
        const { authUrl } = response;

        console.log('[googleSheetsService] Got auth URL, opening popup');

        // Store code_verifier in sessionStorage so callback page can access it
        // The worker generates this during getAuthUrl
        sessionStorage.setItem('google_code_verifier', response.codeVerifier || '');

        // Open the popup
        const width = 500;
        const height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          authUrl,
          'google-auth',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (!popup) {
          isAuthenticating = false;
          authPromise = null;
          sessionStorage.removeItem('google_code_verifier');
          reject(new Error('Popup was blocked'));
        } else {
          console.log('[googleSheetsService] Popup opened, waiting for auth completion');
        }
      } catch (err) {
        console.error('[googleSheetsService] Failed to get auth URL:', err.message);
        isAuthenticating = false;
        authPromise = null;
        sessionStorage.removeItem('google_code_verifier');
        reject(err);
      }
    })();
  });
}

/**
 * Create a Google Sheet with the given data
 * @param {Array} rows - Array of data objects
 * @param {Array} columns - Array of { header, key } definitions
 * @param {string} sheetName - Title for the new Sheet
 * @returns {Promise<string>} - URL of the created Sheet
 */
export function createSheet(rows, columns, sheetName) {
  return (async () => {
    try {
      console.log('[googleSheetsService] createSheet called', { sheetName });

      if (!VG.googleWorker) {
        throw new Error('Google Sheets worker not initialized');
      }

      setupAuthListener();

      // Ensure user is authenticated (opens popup if needed)
      console.log('[googleSheetsService] Ensuring authenticated...');
      try {
        await ensureAuthenticated();
      } catch (err) {
        console.error('[googleSheetsService] Authentication failed:', err.message);
        throw err;
      }

      console.log('[googleSheetsService] User authenticated, creating sheet');

      // Convert reactive data to plain objects for serialization
      const plainRows = JSON.parse(JSON.stringify(rows));
      const plainColumns = JSON.parse(JSON.stringify(columns));

      console.log('[googleSheetsService] Sending CREATE_SHEET request to worker', {
        rows: plainRows.length,
        columns: plainColumns.length,
      });

      const response = await VG.googleWorker.sendWorkerRequest({
        request: 'createSheet',
        rows: plainRows,
        columns: plainColumns,
        sheetName,
      });

      console.log('[googleSheetsService] Sheet created:', response.url);

      // Try to open in new tab, but handle popup blocking
      const popup = window.open(response.url, '_blank');
      if (!popup) {
        console.warn('[googleSheetsService] Popup was blocked, sheet URL:', response.url);
        // Return URL with special marker so caller can handle it
        response.popupBlocked = true;
      }

      return response;
    } catch (err) {
      console.error('[googleSheetsService] Error creating sheet:', err.message);
      throw err;
    }
  })();
}

export default {
  createSheet,
};
