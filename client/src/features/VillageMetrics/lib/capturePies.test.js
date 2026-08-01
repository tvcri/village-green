import { describe, it, expect, vi } from 'vitest'
import { EXPORT_CHART_OPTIONS, chartConfig, capturePie, captureAll } from './capturePies.js'

const SLICES = [
  { label: 'Rides', value: 704, color: '#22c55e' },
  { label: 'Errands', value: 53, color: '#f59e0b' },
]

// Stand-ins for the DOM: jsdom has no canvas, so nothing real is rendered.
// `sizes` records the (w, h) each canvas was created at — the capture's aspect
// ratio has to match the box the PDF draws it into, or pdf-lib stretches it.
function fakeDeps () {
  const created = []
  const sizes = []
  return {
    created,
    sizes,
    createCanvas: (w, h = w) => {
      sizes.push({ w, h })
      return { toDataURL: () => 'data:image/png;base64,STUB' }
    },
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

  // ---- bar capture ----
  it('builds a horizontal bar config when asked for one', () => {
    const cfg = chartConfig(SLICES, 'bar')
    expect(cfg.type).toBe('bar')
    expect(cfg.options.indexAxis).toBe('y')
    // same data mapping as the pie — only the presentation differs
    expect(cfg.data.labels).toEqual(['Rides', 'Errands'])
    expect(cfg.data.datasets[0].backgroundColor).toEqual(['#22c55e', '#f59e0b'])
  })

  it('leaves a pie config free of bar-only options', () => {
    const cfg = chartConfig(SLICES)
    expect(cfg.options.indexAxis).toBeUndefined()
    expect(cfg.options.scales).toBeUndefined()
  })

  // The PDF prints on white; the on-screen chart inherits Chart.js defaults
  // tuned for the app's dark background, which come out near-invisible.
  it('styles bar axes for print', () => {
    const cfg = chartConfig(SLICES, 'bar')
    expect(cfg.options.scales.y.ticks.color).toBe('#111827')
    expect(cfg.options.scales.y.grid.display).toBe(false)
    expect(cfg.options.scales.x.ticks.color).toBe('#4b5563')
  })

  // Font sizes are canvas pixels against a 3x canvas, so they must be ~3x the
  // intended point size. Sized as if they were points, labels render at ~2.7pt.
  it('sizes bar tick fonts for the 3x canvas', () => {
    const cfg = chartConfig(SLICES, 'bar')
    expect(cfg.options.scales.y.ticks.font.size).toBe(24)
    expect(cfg.options.scales.x.ticks.font.size).toBe(24)
  })

  // A canvas whose proportions differ from the PDF's draw box gets stretched
  // by pdf-lib — this is what produced the first squashed bar export.
  it('honours an explicit non-square capture height', () => {
    const deps = fakeDeps()
    capturePie(SLICES, { ...deps, size: 750, height: 456 }, 'bar')
    expect(deps.sizes[0]).toEqual({ w: 750, h: 456 })
  })

  it('keeps the pie capture square', () => {
    const deps = fakeDeps()
    capturePie(SLICES, { ...deps, size: 560 })
    expect(deps.sizes[0]).toEqual({ w: 560, h: 560 })
  })
})
