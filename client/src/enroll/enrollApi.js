// Unauthenticated enrollment calls. VG.Env.apiBase is set by main.js before
// the app mounts (enroll-env.js + dev/prod resolution).
async function postJson(path, body) {
  const res = await fetch(`${VG.Env.apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export const requestPin = (email) => postJson('/enrollment/request', { email })
export const verifyPin = (email, pin) => postJson('/enrollment/verify', { email, pin })
export const resetPassword = (email, pin) => postJson('/enrollment/reset-password', { email, pin })
