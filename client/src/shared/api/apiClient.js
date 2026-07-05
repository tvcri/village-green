import { OpenApiOps } from './openApiOps.js'
import { reloadIfExpired } from '../../auth/tokenExpiry.js'
import { usePrivacyAck } from '../composables/usePrivacyAck.js'
/*
 * See docs/architecture/fetching-asyncDataOperations-ErrorHandling.md
 */

let getAccessToken = () => VG.oidcWorker.token
let apiSpecObj = null


export function configureApiSpec(definition) {
  apiSpecObj = new OpenApiOps({ definition })
}

export class ApiError extends Error {
  constructor(message, status, url, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.body = body
  }
}

/**
 * Thrown when a request is rejected by the privacy-acknowledgement gate
 * (403 privacy_ack_required). The gate is already handled by the time this
 * throws — usePrivacyAck().requireAck() has flipped the reactive block and the
 * ack modal (re)opens. It is thrown (rather than returning null) so callers
 * never dereference a poisoned result; callers should let it propagate and use
 * isPrivacyAckError() to skip their own generic error UX.
 */
export class PrivacyAckError extends ApiError {
  constructor(url, body) {
    super('privacy_ack_required', 403, url, body)
    this.name = 'PrivacyAckError'
  }
}

/**
 * True when an error is the privacy-ack gate (handled globally by the ack
 * modal). Callers use this in their catch blocks to suppress their own
 * "failed to…" toast/UI for a request that was intercepted, not truly failed.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isPrivacyAckError(err) {
  return err instanceof PrivacyAckError
}

/**
 * Extracts the HTTP status code from an error, regardless of its shape.
 * Works with ApiError (err.status) and any other error that carries a status.
 * @param {unknown} err
 * @returns {number|null} HTTP status code, or null if not available
 */
export function getHttpStatus(err) {
  return err?.status ?? null
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

/**
 * THis eventually does the fetch request
 */
async function doFetch(url, opts) {
  const { responseType = 'json', ...fetchOpts } = opts
  const res = await fetch(url, fetchOpts)

  if (!res.ok) {
    // For non-OK responses, try to parse body as JSON or text for error message
    let errorBody
    try {
      const text = await res.text()
      errorBody = text ? safeJson(text) : null
    }
    catch {
      errorBody = null
    }
    // Privacy acknowledgement gate: flip the reactive block so the router-view
    // unmounts and the ack modal (re)opens. Idempotent across concurrent 403s.
    // Throw a distinct PrivacyAckError (rather than returning null) so callers
    // never dereference a poisoned result; the global error modal and per-caller
    // "failed" UX suppress it via isPrivacyAckError() (the ack modal is the UX).
    if (res.status === 403 && errorBody && errorBody.error === 'privacy_ack_required') {
      usePrivacyAck().requireAck()
      throw new PrivacyAckError(url, errorBody)
    }
    // dev note: if not using useAsyncState you are responsible for handling the error
    throw new ApiError(`HTTP ${res.status}`, res.status, url, errorBody)
  }

  if (responseType === 'response') {
    return res
  }
  if (responseType === 'blob') {
    return res.blob()
  }
  if (responseType === 'text') {
    return res.text()
  }

  // Default 'json'
  const text = await res.text()
  return text ? safeJson(text) : null
}
// to be edited
function getBaseUrl() {
  try {
    return VG.Env.apiBase
  }
  catch {
    return import.meta.env.VITE_API_BASE_URL ?? '/api'
  }
}

// this is regular fetch by path
/**
 * opts:
 *  - method, headers, signal, etc (RequestInit)
 *  - json: object (json data)
 *  - rawBody: FormData/Blob/etc
 *  - responseType: 'json' | 'blob' | 'text'
 * EXAMPLE CALL:
 * apiFetch('/stigs', { method: 'GET' })
 * api.get('/stigs')
 * api.post('/stigs', { name: 'test' })
 */
export async function apiFetch(path, opts = {}) {
  if (reloadIfExpired()) {
    return new Promise(() => {}) // reload in flight; page is unloading, never resolve
  }

  let url
  // to be edited
  if (path.startsWith('http')) {
    url = path
  }
  else {
    url = `${getBaseUrl()}${path}`
  }

  // Extract non-fetch options to prevent leaking them to fetch()
  const {
    rawBody,
    json: jsonBody,
    responseType,
    headers: optsHeaders,
    ...fetchOpts
  } = opts

  const headers = new Headers(optsHeaders)
  headers.set('Accept', 'application/json')

  const token = getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let finalBody
  if (rawBody !== undefined) {
    finalBody = rawBody // FormData etc
  }
  else if (jsonBody !== undefined) {
    headers.set('Content-Type', 'application/json')
    finalBody = JSON.stringify(jsonBody)
  }

  return await doFetch(url, {
    ...fetchOpts,
    headers,
    body: finalBody,
    responseType,
  })
}

// this is for opId fetching (use this)
/**
 * opts:
 *  - method, headers, signal, etc (RequestInit)
 *  - json: object (json data)
 *  - rawBody: FormData/Blob/etc
 *  - responseType: 'json' | 'blob' | 'text'
 */

/**
 * EXAMPLE CALL:
 * apiCall('getStigById', { id: 1 })
 * apiCall('createStig', { id: 1 }, { name: 'test' })
 * apiCall('updateStig', { id: 1 }, { name: 'test' })
 * apiCall('deleteStig', { id: 1 })
 */
export async function apiCall(operationId, params = {}, body = undefined, opts = {}) {
  if (!apiSpecObj) {
    throw new Error('API spec not configured. Call configureApiSpecObj first.')
  }

  // to be edited
  apiSpecObj.apiBase = getBaseUrl()
  // if (base.startsWith('http')) {
  //   apiSpecObj.apiBase = base
  // }
  // else {
  //   apiSpecObj.apiBase = new URL(base, window.location.origin).toString()
  // }

  const url = apiSpecObj.getUrl(operationId, params)
  const method = apiSpecObj.operationMap.get(operationId)?.method.toUpperCase()

  if (!method) {
    throw new Error(`Operation ${operationId} not found in spec`)
  }

  return apiFetch(url, { ...opts, method, json: body })
}

export const api = {
  get(path, opts) {
    return apiFetch(path, { ...opts, method: 'GET' })
  },
  post(path, body, opts) {
    return apiFetch(path, { ...opts, method: 'POST', json: body })
  },
  put(path, body, opts) {
    return apiFetch(path, { ...opts, method: 'PUT', json: body })
  },
  patch(path, body, opts) {
    return apiFetch(path, { ...opts, method: 'PATCH', json: body })
  },
  del(path, opts) {
    return apiFetch(path, { ...opts, method: 'DELETE' })
  },
}
