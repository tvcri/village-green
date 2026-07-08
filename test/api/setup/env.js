// Single source of truth for ports, the throwaway DB, and shared file paths.
// Imported by both the orchestrator (run.js) and the test files, so they always
// agree. Every value can be overridden via env vars (handy for pointing the test
// files at an already-running stack later).
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url)) // test/api/setup
const apiTestDir = path.resolve(dir, '..') // test/api
const repoRoot = path.resolve(apiTestDir, '..', '..') // repo root

const apiHost = process.env.VG_TEST_API_HOST || '127.0.0.1'
const apiPort = Number(process.env.VG_TEST_API_PORT || 54100)
const oidcPort = Number(process.env.VG_TEST_OIDC_PORT || 54180)

export const config = {
  repoRoot,
  apiSourceDir: path.join(repoRoot, 'api', 'source'),
  mockOidcPath: path.join(repoRoot, 'test', 'utils', 'mockOidc.js'),
  api: {
    host: apiHost,
    port: apiPort,
    // What the test files hit. Override to run against an external instance.
    baseUrl: process.env.VG_TEST_BASE_URL || `http://${apiHost}:${apiPort}`,
  },
  oidc: {
    port: oidcPort,
    // The issuer the API discovers; mockOidc derives jwks_uri from the request host.
    issuer: process.env.VG_TEST_OIDC_ISSUER || `http://127.0.0.1:${oidcPort}`,
    // Passed to the API as VG_JWT_AUD_VALUE so aud enforcement is exercised;
    // every token tokens.js mints carries this aud (except the special
    // wrong/missing-audience tokens, which assert the rejection path).
    audience: process.env.VG_TEST_OIDC_AUDIENCE || 'village-green-test',
  },
  db: {
    host: process.env.VG_TEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.VG_TEST_DB_PORT || 3307),
    user: process.env.VG_TEST_DB_USER || 'vg',
    password: process.env.VG_TEST_DB_PASSWORD || 'vg',
    schema: process.env.VG_TEST_DB_SCHEMA || 'vg_test',
  },
  paths: {
    apiTestDir,
    tokensFile: path.join(apiTestDir, '.tokens.json'),
    // The API's served OAS definition (GET /op/definition), captured by run.js
    // for the operationId-driven request helper (lib/ops.js).
    definitionFile: path.join(apiTestDir, '.definition.json'),
    composeFile: path.join(apiTestDir, 'docker-compose.yml'),
    apiLog: path.join(apiTestDir, '.api.log'),
    testReport: path.join(apiTestDir, '.test-report.tap'),
  },
}
