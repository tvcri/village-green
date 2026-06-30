import { config } from './env.js'

// Mint an admin token from the mock OIDC's get-token endpoint (RS256, JWKS-verifiable).
export async function mintToken (oidcBase = config.oidc.base) {
  if (config.token) return config.token // allow a pre-supplied bearer token
  const url = new URL('/api/get-token', oidcBase)
  url.searchParams.set('privileges', 'admin')
  url.searchParams.set('scope', 'vg:op')
  url.searchParams.set('username', 'demo-loader@villagegreen.test')
  url.searchParams.set('audience', 'village-green')
  url.searchParams.set('expiresIn', '300s')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`mock OIDC token mint failed: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

// POST the JSONL to /op/appdata. Returns the progress/result body (JSONL lines).
export async function importAppData (apiBase, token, jsonl) {
  const url = new URL('/op/appdata', apiBase)
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
