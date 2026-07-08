import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../../setup/env.js'

// lib/vendor/ holds byte-identical copies of the Vue client's API-layer modules
// (the operationId->URL resolver vgCall is built on). They're vendored, not
// imported, because the client module's deps resolve from client/node_modules,
// which a test-only run never installs. This tripwire fails the moment the
// client copies change, so the vendored ones can't drift silently.
const CLIENT_API = path.join(config.repoRoot, 'client', 'src', 'shared', 'api')
const VENDOR = path.join(config.paths.apiTestDir, 'lib', 'vendor')

for (const file of ['openApiOps.js', 'queryString.js']) {
  test(`vendored ${file} is in sync with the client copy`, () => {
    const client = fs.readFileSync(path.join(CLIENT_API, file), 'utf8')
    const vendored = fs.readFileSync(path.join(VENDOR, file), 'utf8')
    assert.equal(vendored, client,
      `test/api/lib/vendor/${file} has drifted from client/src/shared/api/${file} — ` +
      're-copy the client file (cp client/src/shared/api/' + file + ' test/api/lib/vendor/)')
  })
}
