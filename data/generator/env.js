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
}

// Fixed clock for deterministic data. NEVER use Date.now() in builders.
export const BASE_DATE = new Date('2026-06-30T12:00:00Z')
