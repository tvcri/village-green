'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

// config.js reads process.env once, at load, so each case loads it fresh in
// its own process with only the variables under test set.
function anthropicConfig (env) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VG_ANTHROPIC_')))
  const out = execFileSync(process.execPath, ['-e',
    "const c = require('./utils/config'); process.stdout.write(JSON.stringify({ model: c.anthropic.model, thinking: c.anthropic.thinking ?? null, effort: c.anthropic.effort ?? null }))"],
  { cwd: path.join(__dirname, '..'), env: { ...clean, ...env } })
  return JSON.parse(out)
}

test('with nothing set, extraction runs Sonnet 5.5 with up-front thinking off', () => {
  assert.deepEqual(anthropicConfig({}), { model: 'claude-sonnet-5-5', thinking: 'between_tools', effort: null })
})

test('choosing another model drops the Sonnet-only thinking default, so e.g. Opus 4.8 is not sent between_tools', () => {
  assert.deepEqual(anthropicConfig({ VG_ANTHROPIC_MODEL: 'claude-opus-4-8' }), { model: 'claude-opus-4-8', thinking: null, effort: null })
})

test('explicit thinking and effort settings win', () => {
  assert.deepEqual(
    anthropicConfig({ VG_ANTHROPIC_MODEL: 'claude-sonnet-5-5', VG_ANTHROPIC_THINKING: 'adaptive', VG_ANTHROPIC_EFFORT: 'low' }),
    { model: 'claude-sonnet-5-5', thinking: 'adaptive', effort: 'low' })
})
