import { describe, it, expect, vi } from 'vitest'
import { EXPORT_CHART_OPTIONS, chartConfig, capturePie, captureAll } from './capturePies.js'

const SLICES = [
  { label: 'Rides', value: 704, color: '#22c55e' },
  { label: 'Errands', value: 53, color: '#f59e0b' },
]

// Stand-ins for the DOM: jsdom has no canvas, so nothing real is rendered.
function fakeDeps () {
  const created = []
  return {
    created,
    createCanvas: () => ({ toDataURL: () => 'data:image/png;base64,STUB' }),
    createChart: (canvas, cfg) => { created.push(cfg); return { destroy () {} } },
  }
}

describe('capturePies', () => {
  // Load-bearing: with animation:false Chart.js draws during construction, so
  // toDataURL() needs no await. Any other value yields half-swept pies.
  it('disables animation', () => {
    expect(EXPORT_CHART_OPTIONS.animation).toBe(false)
  })

  it('hides the legend, since the PDF draws its own legend table', () => {
    expect(EXPORT_CHART_OPTIONS.plugins.legend.display).toBe(false)
  })

  it('maps slices to Chart.js pie data', () => {
    const cfg = chartConfig(SLICES)
    expect(cfg.type).toBe('pie')
    expect(cfg.data.labels).toEqual(['Rides', 'Errands'])
    expect(cfg.data.datasets[0].data).toEqual([704, 53])
    expect(cfg.data.datasets[0].backgroundColor).toEqual(['#22c55e', '#f59e0b'])
  })

  it('returns a PNG data URL', () => {
    expect(capturePie(SLICES, fakeDeps())).toBe('data:image/png;base64,STUB')
  })

  it('constructs the chart with animation disabled', () => {
    const deps = fakeDeps()
    capturePie(SLICES, deps)
    expect(deps.created[0].options.animation).toBe(false)
  })

  // Chart.js's initOptions writes options.plugins and options.scales during
  // construction. A frozen options object makes that write throw in strict mode,
  // which killed every PDF export before this was fixed.
  it('hands Chart.js a mutable options object', () => {
    const cfg = chartConfig(SLICES)
    expect(Object.isFrozen(cfg.options)).toBe(false)
    expect(() => { cfg.options.plugins = {}; cfg.options.scales = {} }).not.toThrow()
    expect(cfg.options.animation).toBe(false) // still load-bearing after the clone
  })

  it('destroys the chart so repeated exports do not leak', () => {
    const destroy = vi.fn()
    capturePie(SLICES, {
      createCanvas: () => ({ toDataURL: () => 'data:image/png;base64,STUB' }),
      createChart: () => ({ destroy }),
    })
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('returns null for an empty pie rather than a blank image', () => {
    expect(capturePie([], fakeDeps())).toBeNull()
  })

  it('captures every named pie', () => {
    const out = captureAll(
      { categories: SLICES, outcomes: SLICES, services: [] },
      fakeDeps(),
    )
    expect(out.categories).toBe('data:image/png;base64,STUB')
    expect(out.outcomes).toBe('data:image/png;base64,STUB')
    expect(out.services).toBeNull()
  })
})
