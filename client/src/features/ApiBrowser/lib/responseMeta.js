/** Bodies larger than this skip the tree entirely (Raw/Download only). */
export const MAX_TREE_BYTES = 2 * 1024 * 1024

function byteLength(text) {
  return new TextEncoder().encode(text ?? '').length
}

function looksJson(contentType) {
  return /\bjson\b/i.test(contentType ?? '')
}

/**
 * Success path. apiCall was given responseType:'response', so we own the body
 * read and can capture status, content-type and size — all of which
 * responseType:'json' would discard.
 *
 * `bytes` measures the DECODED body, not transfer size: content-length is the
 * compressed figure and is often absent under chunked encoding.
 */
export function metaFromResponse(res, text, ms, forOperationId = null) {
  const contentType = res.headers.get('content-type') ?? ''
  let body = null
  let isJson = false
  if (looksJson(contentType)) {
    try {
      body = JSON.parse(text)
      isJson = true
    }
    catch {
      isJson = false
    }
  }
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    statusText: res.statusText ?? '',
    ms,
    bytes: byteLength(text),
    contentType,
    body,
    isJson,
    raw: text,
    forOperationId,
  }
}

/**
 * Failure path. doFetch throws ApiError BEFORE the responseType branch, so a
 * non-2xx arrives as an ApiError (already carrying status and a parsed body),
 * never as a Response. A 403/404 is a RESULT here, not an error.
 */
export function metaFromError(err, ms, forOperationId = null) {
  const isApiError = err?.name === 'ApiError' || err?.name === 'PrivacyAckError'
  if (isApiError) {
    const isJson = err.body !== null && typeof err.body === 'object'
    const raw = isJson ? JSON.stringify(err.body, null, 2) : String(err.body ?? '')
    return {
      ok: false,
      status: err.status ?? null,
      statusText: err.message ?? '',
      ms,
      bytes: byteLength(raw),
      contentType: 'application/json',
      body: isJson ? err.body : null,
      isJson,
      raw,
      forOperationId,
    }
  }
  return {
    ok: false,
    status: null,
    statusText: String(err?.message ?? err),
    ms,
    bytes: 0,
    contentType: '',
    body: null,
    isJson: false,
    raw: '',
    transport: true,
    forOperationId,
  }
}
