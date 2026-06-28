// Orchestrator for the Village Green black-box API test suite.
//
//   node run.js          full run: MySQL up -> mockOidc -> API -> seed -> tests -> teardown
//   node run.js --keep   same, but leave the MySQL container up for fast re-runs
//
// Nothing in production code is modified; the real `node index.js` server is run
// against a throwaway MySQL schema and the existing test/utils/mockOidc.js.
//
// NOTE: modules that depend on installed packages (mysql2, seed.js) are imported
// DYNAMICALLY, after ensureDeps() installs them — static imports would resolve
// before any code runs and fail on a fresh checkout.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from './setup/env.js'
import { buildTokens } from './setup/tokens.js'

const KEEP = process.argv.includes('--keep')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function log (msg) { process.stdout.write(`\x1b[36m[run]\x1b[0m ${msg}\n`) }
function compose (...args) {
  execFileSync('docker', ['compose', '-f', config.paths.composeFile, ...args], { stdio: 'inherit' })
}

function ensureDeps () {
  for (const dir of [config.apiSourceDir, path.dirname(config.mockOidcPath), config.paths.apiTestDir]) {
    if (!existsSync(path.join(dir, 'node_modules'))) {
      log(`installing deps in ${path.relative(config.repoRoot, dir) || '.'} ...`)
      execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' })
    }
  }
}

async function waitForMysql (mysql) {
  for (let i = 0; i < 60; i++) {
    try {
      const c = await mysql.createConnection({
        host: config.db.host, port: config.db.port,
        user: config.db.user, password: config.db.password, database: config.db.schema,
      })
      await c.end()
      return
    } catch {
      await sleep(1000)
    }
  }
  throw new Error('MySQL did not become ready in time')
}

function startApi () {
  const env = {
    ...process.env,
    VG_DB_HOST: config.db.host,
    VG_DB_PORT: String(config.db.port),
    VG_DB_SCHEMA: config.db.schema,
    VG_DB_USER: config.db.user,
    VG_DB_PASSWORD: config.db.password,
    VG_OIDC_PROVIDER: config.oidc.issuer,
    VG_API_PORT: String(config.api.port),
    VG_API_ADDRESS: config.api.host,
    VG_DEV_RESPONSE_VALIDATION: 'logOnly',
    VG_CLIENT_DISABLED: 'true',
    VG_DOCS_DISABLED: 'true',
  }
  const child = spawn('node', ['index.js'], { cwd: config.apiSourceDir, env })
  // Route the (very chatty) API logs to a file so the test reporter output stays
  // readable. Surfaced only if the API fails to come up. See config.paths.apiLog.
  const out = createWriteStream(config.paths.apiLog)
  child.stdout.pipe(out)
  child.stderr.pipe(out)
  child.exited = false
  child.on('exit', (code) => { child.exited = true; child.exitCode_ = code })
  return child
}

async function waitForApiReady (apiChild) {
  // /api/op/definition is public AND gated by the 503 state check, so it returns
  // 503 until the app is `available`, then 200 — a perfect unauthenticated probe.
  const url = `${config.api.baseUrl}/api/op/definition`
  const fail = async (why) => {
    let tail = ''
    try { tail = (await fs.readFile(config.paths.apiLog, 'utf8')).split('\n').slice(-25).join('\n') } catch { /* ignore */ }
    throw new Error(`${why}\n--- last API log lines (${config.paths.apiLog}) ---\n${tail}`)
  }
  for (let i = 0; i < 90; i++) {
    if (apiChild.exited) return fail(`API exited during startup (code ${apiChild.exitCode_})`)
    try {
      const res = await fetch(url)
      if (res.status === 200) return
    } catch { /* not listening yet */ }
    await sleep(1000)
  }
  return fail('API did not reach `available` state in time')
}

async function stopApi (apiChild) {
  if (!apiChild || apiChild.exited) return
  apiChild.kill('SIGTERM')
  for (let i = 0; i < 10 && !apiChild.exited; i++) await sleep(200)
  if (!apiChild.exited) apiChild.kill('SIGKILL')
}

function runTests () {
  return new Promise((resolve) => {
    const child = spawn('node', ['--test', '--test-concurrency=1'], {
      cwd: config.paths.apiTestDir,
      env: { ...process.env },
      stdio: 'inherit',
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

async function main () {
  let apiChild, oidc, exitCode = 1
  try {
    ensureDeps()

    // Safe to load now that deps are installed.
    const { default: mysql } = await import('mysql2/promise')
    const { seed } = await import('./setup/seed.js')

    log('starting MySQL (docker compose up -d) ...')
    compose('up', '-d')
    await waitForMysql(mysql)
    log('MySQL ready.')

    const { default: MockOidc } = await import(pathToFileURL(config.mockOidcPath).href)
    oidc = new MockOidc()
    await oidc.start({ port: config.oidc.port })
    log(`mockOidc listening on ${config.oidc.issuer}`)

    log('starting API (node index.js) ...')
    apiChild = startApi()
    await waitForApiReady(apiChild)
    log('API is available.')

    log('seeding fixtures ...')
    await seed()

    log('minting tokens ...')
    await fs.writeFile(config.paths.tokensFile, JSON.stringify(buildTokens(oidc), null, 2))

    log('running tests ...\n')
    exitCode = await runTests()
  } catch (e) {
    log(`\x1b[31mERROR:\x1b[0m ${e.message}`)
    exitCode = 1
  } finally {
    log('\ntearing down ...')
    await stopApi(apiChild)
    if (oidc) { try { await oidc.stop() } catch { /* ignore */ } }
    try {
      if (KEEP) log('--keep: leaving MySQL container running.')
      else compose('down', '-v')
    } catch (e) { log(`teardown warning: ${e.message}`) }
  }
  process.exit(exitCode)
}

main()
