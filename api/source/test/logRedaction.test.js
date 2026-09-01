const { test, describe } = require('node:test')
const assert = require('node:assert')

// Startup logging must never print a credential's VALUE. logAppConfig() writes
// two records — the environment dump (logger.serializeEnvironment) and the
// whole config object — and both reach `docker compose logs`, Azure log
// storage, and the CI api-test-artifacts upload.
//
// Before this suite, serializeEnvironment masked the single literal name
// 'VG_DB_PASSWORD', so every credential added later printed in the clear.
// These tests fail if that regression returns for any known secret, and the
// suffix cases fail for a not-yet-written one.

const SECRET_ENV = {
  VG_DB_PASSWORD: 'db-pw-sentinel',
  VG_ANTHROPIC_API_KEY: 'sk-ant-sentinel',
  VG_GOOGLE_CLIENT_SECRET: 'GOCSPX-sentinel',
  VG_KC_ADMIN_CLIENT_SECRET: 'kc-sentinel',
  VG_ENROLL_SIDECAR_KEY: 'sidecar-sentinel',
  VG_SYNC_WEBHOOK_KEY: 'webhook-sentinel',
  VG_API_TLS_KEY_PASSPHRASE: 'passphrase-sentinel',
}

function withEnv (vars, fn) {
  const saved = {}
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v }
  try { return fn() } finally {
    for (const [k] of Object.entries(vars)) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]
    }
  }
}

describe('startup log redaction', () => {
  test('serializeEnvironment masks every known secret value', () => {
    const logger = require('../utils/logger.js')
    withEnv(SECRET_ENV, () => {
      const env = logger.serializeEnvironment()
      for (const [name, value] of Object.entries(SECRET_ENV)) {
        assert.strictEqual(env[name], '*', `${name} was not masked`)
        assert.ok(!JSON.stringify(env).includes(value), `${name}'s value leaked`)
      }
    })
  })

  test('serializeEnvironment keeps non-secret vars readable', () => {
    const logger = require('../utils/logger.js')
    withEnv({ VG_DB_HOST: 'db.example', VG_KC_ADMIN_CLIENT_ID: 'svc-1', VG_API_TLS_KEY_FILE: '/etc/tls/api.key' }, () => {
      const env = logger.serializeEnvironment()
      assert.strictEqual(env.VG_DB_HOST, 'db.example')
      // an identifier, not a credential
      assert.strictEqual(env.VG_KC_ADMIN_CLIENT_ID, 'svc-1')
      // a PATH to a key, not the key — masking it would lose real diagnostics
      assert.strictEqual(env.VG_API_TLS_KEY_FILE, '/etc/tls/api.key')
    })
  })

  test('isSecretEnvName covers names nobody has written yet', () => {
    const { isSecretEnvName } = require('../utils/logger.js')
    for (const n of ['VG_FUTURE_PASSWORD', 'VG_FUTURE_SECRET', 'VG_FUTURE_TOKEN', 'VG_X_PASSPHRASE']) {
      assert.ok(isSecretEnvName(n), `${n} should be treated as a secret`)
    }
    for (const n of ['VG_DB_HOST', 'VG_API_TLS_KEY_FILE', 'VG_GOOGLE_REDIRECT_URI', 'VG_GOOGLE_MAPS_KEY']) {
      assert.ok(!isSecretEnvName(n), `${n} should not be masked`)
    }
  })

  test('the logged config object reports secret presence, never the value', () => {
    withEnv(SECRET_ENV, () => {
      delete require.cache[require.resolve('../utils/config.js')]
      const config = require('../utils/config.js')
      const serialized = JSON.stringify(config)
      for (const value of Object.values(SECRET_ENV)) {
        assert.ok(!serialized.includes(value), `a secret value leaked into the logged config: ${value}`)
      }
      const j = JSON.parse(serialized)
      assert.strictEqual(j.database.password, true)
      assert.strictEqual(j.anthropic.apiKey, true)
      assert.strictEqual(j.google.clientSecret, true)
      assert.strictEqual(j.keycloak.adminClientSecret, true)
      assert.strictEqual(j.enrollment.sidecarKey, true)
      assert.strictEqual(j.http.tls.key_passphrase, true)
      // non-secret neighbours survive
      assert.strictEqual(j.google.mapsKey, process.env.VG_GOOGLE_MAPS_KEY ?? '')
      delete require.cache[require.resolve('../utils/config.js')]
    })
  })
})
