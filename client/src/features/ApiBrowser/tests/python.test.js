import { describe, expect, it } from 'vitest'
import { toPython } from '../lib/python.js'

describe('toPython', () => {
  it('never emits a real token; auth comes from the environment', () => {
    // Mirrors the toCurl test: the function is never given a token, so this
    // asserts the structural property by checking a sentinel that was never
    // passed in cannot appear.
    const out = toPython('https://example.test/api/villages')
    expect(out).toContain(`f"Bearer {os.environ['VG_TOKEN']}"`)
    expect(out).not.toContain('eyJhbGciOi')
  })

  it('defaults to the idiomatic per-verb helper and lowercases an override', () => {
    expect(toPython('https://x.test/a')).toContain('r = requests.get(')
    expect(toPython('https://x.test/a', { method: 'POST' })).toContain('r = requests.post(')
  })

  it('binds the URL to a variable so it can be edited in a notebook cell', () => {
    expect(toPython('https://x.test/a?b=1&c=2')).toContain('url = "https://x.test/a?b=1&c=2"')
  })

  it('escapes double quotes and backslashes inside the URL', () => {
    // Unreachable via getUrlForOperation (which percent-encodes), but the
    // module must not rely on a caller's guarantee.
    expect(toPython('https://x.test/a?q="hi"')).toContain('url = "https://x.test/a?q=\\"hi\\""')
    expect(toPython('https://x.test/a\\b')).toContain('url = "https://x.test/a\\\\b"')
  })

  it('raises on error status rather than failing silently', () => {
    expect(toPython('https://x.test/a')).toContain('r.raise_for_status()')
  })

  it('points at pandas in a comment without asserting the response shape', () => {
    const out = toPython('https://x.test/a')
    expect(out).toContain('# df = pd.json_normalize(data)')
    // Commented, NOT executable: json_normalize is only correct for a list of
    // records, and the generator cannot know the shape in advance.
    expect(out).not.toMatch(/^df = /m)
    expect(out).not.toContain('import pandas')
  })
})
