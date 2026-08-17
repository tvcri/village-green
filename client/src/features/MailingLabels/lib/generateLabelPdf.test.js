import { describe, it, expect } from 'vitest'
import { generateLabelPdf } from './generateLabelPdf.js'

// Real-shape data from the truncation report: merged couple names are the
// dominant overflow case.
const base = { street: '44 Bridge Street', city: 'Warren', state: 'RI', zip: '02885' }
const coupleName = "Anne McAuliffe-O'Donnell and Paul O'Donnell"

describe('generateLabelPdf name wrapping', () => {
  it('wraps a long couple name onto a second line instead of truncating', async () => {
    const { truncated, blob } = await generateLabelPdf([
      { ...base, name: coupleName, unit: null },
    ])
    expect(truncated).toEqual([])
    expect(blob.size).toBeGreaterThan(0)
  })

  it('falls back to ellipsis + report when a unit line leaves no room to wrap', async () => {
    const { truncated } = await generateLabelPdf([
      { ...base, name: coupleName, unit: 'Apt. 314' },
    ])
    expect(truncated).toHaveLength(1)
    expect(truncated[0].name).toBe(coupleName)
    expect(truncated[0].printed.endsWith('…')).toBe(true)
  })
})
