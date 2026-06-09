const config = require('../utils/config');
const logger = require('../utils/logger');

exports.postOAuthToken = async (req, res, next) => {
  try {
    const { code, code_verifier } = req.query;

    if (!code) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing authorization code' });
      return;
    }

    if (!config.google?.clientId || !config.google?.clientSecret || !config.google?.redirectUri) {
      logger.writeError('google-oauth', 'config-error', { message: 'Google OAuth config missing' });
      res.status(500).json({ error: 'server_error', error_description: 'OAuth not configured' });
      return;
    }

    // Exchange code for tokens with Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        ...(code_verifier && { code_verifier }),
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      logger.writeError('google-oauth', 'token-exchange-error', {
        status: tokenResponse.status,
        error: errorData.error,
        error_description: errorData.error_description,
      });
      res.status(tokenResponse.status).json(errorData);
      return;
    }

    const tokenData = await tokenResponse.json();
    logger.writeInfo('google-oauth', 'token-exchange-success', {
      has_access_token: !!tokenData.access_token,
      has_refresh_token: !!tokenData.refresh_token,
      expires_in: tokenData.expires_in,
    });

    // Return tokens to client (same response structure as Google's)
    res.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type || 'Bearer',
    });
  } catch (error) {
    logger.writeError('google-oauth', 'unexpected-error', { error: error.message });
    next(error);
  }
};
