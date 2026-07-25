import { describe, expect, it } from 'vitest'
import { metaFromError, metaFromResponse } from '../lib/responseMeta.js'

function fakeResponse({ status = 200, contentType = 'application/json' } = {}) {
  return { status, statusText: 'OK', headers: { get: name => (name === 'content-type' ? contentType : null) } }
}

describe('metaFromResponse', () => {
  it('captures status, size, content-type and parses JSON', () => {
    const text = '{"a":1}'
    const meta = metaFromResponse(fakeResponse(), text, 12.4)
    expect(meta.ok).toBe(true)
    expect(meta.status).toBe(200)
    expect(meta.bytes).toBe(7)
    expect(meta.contentType).toBe('application/json')
    expect(meta.body).toEqual({ a: 1 })
    expect(meta.isJson).toBe(true)
    expect(meta.ms).toBe(12.4)
  })

  it('keeps non-JSON bodies as raw text', () => {
    const meta = metaFromResponse(fakeResponse({ contentType: 'application/gzip' }), 'binary-ish', 3)
    expect(meta.isJson).toBe(false)
    expect(meta.body).toBe(null)
    expect(meta.raw).toBe('binary-ish')
  })

  it('does not throw on malformed JSON', () => {
    const meta = metaFromResponse(fakeResponse(), '{not json', 1)
    expect(meta.isJson).toBe(false)
    expect(meta.raw).toBe('{not json')
  })
})

describe('metaFromError', () => {
  it('renders an ApiError as a normal result, preserving status and body', () => {
    const err = { name: 'ApiError', message: 'HTTP 403', status: 403, url: '/x', body: { error: 'forbidden' } }
    const meta = metaFromError(err, 8)
    expect(meta.ok).toBe(false)
    expect(meta.status).toBe(403)
    expect(meta.body).toEqual({ error: 'forbidden' })
    expect(meta.isJson).toBe(true)
    expect(meta.transport).toBeUndefined()
  })

  it('flags a transport failure with a null status', () => {
    const meta = metaFromError(new TypeError('Failed to fetch'), 5)
    expect(meta.ok).toBe(false)
    expect(meta.status).toBe(null)
    expect(meta.transport).toBe(true)
    expect(meta.statusText).toContain('Failed to fetch')
  })
})
