'use strict'

const config = require('../utils/config')
const retry = require('async-retry')
const { fetch } = require('undici')

function parseAuthority(authority) {
  const marker = '/realms/'
  const index = authority.indexOf(marker)
  if (index === -1) {
    throw new Error(`Cannot parse Keycloak base URL/realm from authority: ${authority}`)
  }
  return {
    baseUrl: authority.slice(0, index),
    realm: authority.slice(index + marker.length)
  }
}

function buildCreateUserPayload({ username, email, firstName, lastName }) {
  const payload = {
    username,
    email,
    enabled: true,
    emailVerified: true
  }
  if (firstName) payload.firstName = firstName
  if (lastName) payload.lastName = lastName
  return payload
}

const tokenState = {
  accessToken: null,
  expiresAt: 0
}
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000

async function safeReadBody(res) {
  try {
    const text = await res.text()
    return text || '<empty body>'
  }
  catch (err) {
    return `<failed to read body: ${err.message}>`
  }
}

async function fetchToken() {
  const { baseUrl, realm } = parseAuthority(config.oauth.authority)
  const url = `${baseUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.keycloak.adminClientId,
    client_secret: config.keycloak.adminClientSecret
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!res.ok) {
    const text = await safeReadBody(res)
    const error = new Error(`Failed to obtain Keycloak admin token (${res.status}): ${text}`)
    error.status = res.status
    error.body = text
    throw error
  }

  const json = await res.json()
  tokenState.accessToken = json.access_token
  tokenState.expiresAt = Date.now() + json.expires_in * 1000
  return tokenState.accessToken
}

async function ensureFreshToken() {
  if (!tokenState.accessToken || Date.now() >= tokenState.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    await retry(fetchToken, {
      retries: config.settings.dependencyRetries,
      factor: 1,
      minTimeout: 5 * 1000,
      maxTimeout: 5 * 1000
    })
  }
  return tokenState.accessToken
}

async function createUser({ username, email, firstName, lastName }) {
  const token = await ensureFreshToken()
  const { baseUrl, realm } = parseAuthority(config.oauth.authority)
  const url = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users`
  const payload = buildCreateUserPayload({ username, email, firstName, lastName })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await safeReadBody(res)
    const error = new Error(`Keycloak create-user failed (${res.status}): ${text}`)
    error.status = res.status
    error.body = text
    throw error
  }

  const location = res.headers.get('Location') || ''
  const keycloakUserId = location.split('/').pop()
  if (!keycloakUserId) {
    throw new Error('Keycloak create-user succeeded but no user id could be determined from the Location header')
  }
  return keycloakUserId
}

module.exports = {
  parseAuthority,
  buildCreateUserPayload,
  ensureFreshToken,
  createUser
}
