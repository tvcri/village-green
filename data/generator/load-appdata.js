import { config } from './env.js'

// Mint an admin token from the mock OIDC's get-token endpoint (RS256, JWKS-verifiable).
export async function mintToken (oidcBase = config.oidc.base) {
  if (config.token) return config.token // allow a pre-supplied bearer token
  const url = new URL('/api/get-token', oidcBase)
  url.searchParams.set('privileges', 'admin')
  // scopes are hierarchical (prefix-matched): vg:op covers vg:op:read, so this
  // one scope satisfies both import (POST, vg:op) and export (GET, vg:op:read)
  url.searchParams.set('scope', 'vg:op')
  url.searchParams.set('username', 'demo-loader@villagegreen.test')
  url.searchParams.set('audience', 'village-green')
  url.searchParams.set('expiresIn', '300s')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`mock OIDC token mint failed: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

// GET /op/appdata — the app's OWN exporter. Unlike the generator's emit
// (which synthesizes JSONL locally from the builders), this exercises the
// app's serializer and reflects whatever is actually in the DB right now.
export async function exportAppData (apiBase, token) {
  const url = new URL('/api/op/appdata', apiBase)
  url.searchParams.set('format', 'jsonl')
  url.searchParams.set('elevate', 'true')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  if (!res.ok) throw new Error(`/op/appdata export failed: ${res.status}\n${text}`)
  return text
}

// POST the JSONL to /op/appdata. Returns the progress/result body (JSONL lines).
export async function importAppData (apiBase, token, jsonl) {
  const url = new URL('/api/op/appdata', apiBase)
  url.searchParams.set('elevate', 'true')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/jsonl' },
    body: jsonl,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`/op/appdata import failed: ${res.status}\n${text}`)
  return text
}
