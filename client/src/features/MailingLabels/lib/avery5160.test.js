// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { AVERY_5160, LABELS_PER_SHEET, cellOrigin, usableTextWidth } from './avery5160'

describe('avery5160 geometry', () => {
  it('has 30 labels per sheet', () => {
    expect(LABELS_PER_SHEET).toBe(30)
    expect(AVERY_5160.columns * AVERY_5160.rows).toBe(30)
  })

  it('places label 0 at the top-left cell plus inset', () => {
    const { x, y } = cellOrigin(0)
    expect(x).toBeCloseTo(13.5 + 11)
    // PDF origin is bottom-left: pageHeight - topMargin - inset
    expect(y).toBeCloseTo(792 - 36 - 11)
  })

  it('advances x by the horizontal pitch across a row', () => {
    expect(cellOrigin(1).x - cellOrigin(0).x).toBeCloseTo(198)
    expect(cellOrigin(2).x - cellOrigin(1).x).toBeCloseTo(198)
  })

  it('wraps to the next row after the third column', () => {
    expect(cellOrigin(3).x).toBeCloseTo(cellOrigin(0).x)
    expect(cellOrigin(0).y - cellOrigin(3).y).toBeCloseTo(72)
  })

  it('places the last label at the bottom-right cell', () => {
    const { x, y } = cellOrigin(29)
    expect(x).toBeCloseTo(13.5 + 11 + 2 * 198)
    expect(y).toBeCloseTo(792 - 36 - 11 - 9 * 72)
  })

  it('applies nudge offsets, y-inverted', () => {
    const base = cellOrigin(0)
    const nudged = cellOrigin(0, { nudgeX: 5, nudgeY: -3 })
    expect(nudged.x - base.x).toBeCloseTo(5)
    // Positive nudgeY moves DOWN the page = -y in PDF space
    expect(nudged.y - base.y).toBeCloseTo(3)
  })

  it('reports usable text width as label width minus both insets', () => {
    expect(usableTextWidth()).toBeCloseTo(189 - 22)
  })
})
