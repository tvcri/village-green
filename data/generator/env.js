// All runtime config from env, with defaults matching docker-compose.dev.yml +
// .vscode/launch.json. No secrets here.
const e = process.env

export const config = {
  db: {
    host: e.VG_DB_HOST || '127.0.0.1',
    port: Number(e.VG_DB_PORT || 3308),
    user: e.VG_DB_USER || 'vg',
    password: e.VG_DB_PASSWORD || 'vg',
    database: e.VG_DB_SCHEMA || 'vg',
  },
  api: { base: e.VG_DEMO_API_BASE || 'http://localhost:54000' },
  oidc: { base: e.VG_DEMO_OIDC_BASE || 'http://localhost:18080' },
  seed: Number(e.VG_DEMO_SEED || 20260630),
  token: e.VG_DEMO_TOKEN || null, // optional pre-minted bearer token for the app-data path
  // Sizing knobs (spec §5). Unset = the full default dataset.
  sizing: {
    villages: e.VG_DEMO_VILLAGES || null,          // count ('3') or names ('Arkham,Quahog')
    members: e.VG_DEMO_MEMBERS ? Number(e.VG_DEMO_MEMBERS) : null,
    volunteers: e.VG_DEMO_VOLUNTEERS ? Number(e.VG_DEMO_VOLUNTEERS) : null,
  },
}

// Fixed clock for deterministic data. NEVER use Date.now() in builders.
// Override with VG_DEMO_BASE_DATE=YYYY-MM-DD (or 'today') to re-anchor the
// dataset's window; unset keeps the pinned date so `emit` stays byte-identical.
const baseDateEnv = e.VG_DEMO_BASE_DATE
const resolveBaseDate = () => {
  if (!baseDateEnv) return '2026-06-30'
  if (baseDateEnv === 'today') return new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDateEnv)) {
    throw new Error(`VG_DEMO_BASE_DATE must be YYYY-MM-DD or 'today', got: ${baseDateEnv}`)
  }
  return baseDateEnv
}
export const BASE_DATE = new Date(`${resolveBaseDate()}T12:00:00Z`)
