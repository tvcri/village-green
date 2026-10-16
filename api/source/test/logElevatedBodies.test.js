const { test, describe } = require('node:test')
const assert = require('node:assert')
const express = require('express')

// Elevated (?elevate=true) requests used to log the full request body and the
// full response body — a STIG Manager audit requirement Village Green does not
// share. The captured bodies put user emails and grant lists into a permanent
// log archive, and the response bodies pushed console lines past the container
// runtime's 16 KB split. Only a deliberate debug level (4) logs a request body;
// no level logs a response body.

const logger = require('../utils/logger.js')
const config = require('../utils/config.js')

const SENTINEL_REQ = 'request-body-sentinel'
const SENTINEL_RES = 'response-body-sentinel'

async function captureTransaction (path) {
  const app = express()
  app.use(express.json())
  app.use(logger.requestLogger)
  app.post('/api/echo', (req, res) => res.json({ payload: SENTINEL_RES }))
  const server = app.listen(0)
  try {
    const logged = new Promise(resolve => {
      const onLog = (obj) => {
        if (obj.type === 'transaction') {
          logger.loggerEvents.off('log', onLog)
          resolve(obj)
        }
      }
      logger.loggerEvents.on('log', onLog)
    })
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: SENTINEL_REQ })
    })
    assert.ok((await res.text()).includes(SENTINEL_RES), 'the response itself is unaffected')
    return await logged
  } finally {
    server.close()
  }
}

describe('elevated request body logging', () => {
  test('an elevated transaction at level 3 logs neither body', async () => {
    assert.strictEqual(config.log.level, 3)
    assert.strictEqual(config.log.mode, 'combined')
    const record = await captureTransaction('/api/echo?elevate=true')
    assert.strictEqual(record.data.request.body, undefined)
    assert.ok(!('responseBody' in record.data.response))
    const line = JSON.stringify(record)
    assert.ok(!line.includes(SENTINEL_REQ), 'request body leaked into the log')
    assert.ok(!line.includes(SENTINEL_RES), 'response body leaked into the log')
  })

  test('level 4 still logs the request body, never the response body', async () => {
    const saved = config.log.level
    config.log.level = 4
    try {
      const record = await captureTransaction('/api/echo')
      assert.deepStrictEqual(record.data.request.body, { payload: SENTINEL_REQ })
      assert.ok(!JSON.stringify(record).includes(SENTINEL_RES))
    } finally {
      config.log.level = saved
    }
  })
})
