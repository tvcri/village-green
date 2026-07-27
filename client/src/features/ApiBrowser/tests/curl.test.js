import { describe, expect, it } from 'vitest'
import { toCurl } from '../lib/curl.js'

describe('toCurl', () => {
  it('emits the placeholder, never a real token', () => {
    // The function never receives a token — this asserts that property by
    // checking a sentinel that was never passed in cannot appear.
    const out = toCurl('https://example.test/api/villages')
    expect(out).toContain('$TOKEN')
    expect(out).not.toContain('eyJhbGciOi')
  })

  it('single-quotes the URL so & is not backgrounded by the shell', () => {
    const out = toCurl('https://example.test/api/users?a=1&b=2')
    expect(out).toContain(`'https://example.test/api/users?a=1&b=2'`)
  })

  it('double-quotes the auth header so the shell expands $TOKEN', () => {
    expect(toCurl('https://x.test/a')).toContain('"Authorization: Bearer $TOKEN"')
  })

  it('escapes a single quote inside the URL', () => {
    const out = toCurl(`https://x.test/a?q=o'brien`)
    expect(out).toContain(`'\\''`)
  })

  it('defaults to GET and honors an override', () => {
    expect(toCurl('https://x.test/a')).toContain('curl -X GET')
    expect(toCurl('https://x.test/a', { method: 'POST' })).toContain('curl -X POST')
  })
})
