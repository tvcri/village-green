// Tiny HTTP helper for the test files. Wraps fetch, injects the bearer token,
// builds query strings (repeats array params), and returns a parsed result.
import { config } from '../setup/env.js'

const API_BASE = `${config.api.baseUrl}/api`

/**
 * @param {string} path  e.g. '/service-requests' or '/service-requests/2'
 * @param {object} opts  { token, query, body, method }
 *   - token: raw JWT string (omit for an unauthenticated request)
 *   - query: object; array values are appended as repeated params
 *   - body: JS value; presence implies a JSON body and defaults method to POST
 *   - method: explicit HTTP method override
 * @returns {Promise<{status:number, json:any, text:string, res:Response}>}
 */
export async function vgFetch (path, { token, query, body, method } = {}) {
  const url = new URL(API_BASE + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val))
      else url.searchParams.set(k, v)
    }
  }
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  const res = await fetch(url, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : undefined } catch { json = undefined }
  return { status: res.status, json, text, res }
}
