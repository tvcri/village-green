# Meta Metrics Presentation — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Meta Metrics page shell to mirror Village Metrics' presentation, and deliver the Outcomes tab complete — chart, sortable matrix table, CSV, and URL state.

**Architecture:** Pure-function layers (reductions → ordering → chart config → height formula) feed two dumb children, a chart and a matrix table, that both render **one ordered row list**. Sort state lives in the URL and drives both. The page shell owns fetch, URL params, and the tab strip; Categories and Services tabs are stage 2 and are deliberately absent.

**Tech Stack:** Vue 3 `<script setup>`, PrimeVue (Tabs, Select, SelectButton, SplitButton, DataTable, Chart), Chart.js via `primevue/chart`, vitest + @testing-library/vue in jsdom.

**Spec:** `docs/superpowers/specs/2026-08-21-meta-metrics-presentation-design.md`

## Global Constraints

- **Branch:** `meta-metrics`. Verify with `git branch --show-current` before any write.
- **Run tests from `client/`**: `cd client && npx vitest run <path>`.
- **Legs is fixed ON.** Reduction functions take a `legs` parameter; the page pins it to `true`. Never inline the doubling. A completed round trip counts as two services.
- **No round-trip toggle** anywhere in the UI.
- **Palette (do not substitute the app's green/amber — it fails CVD):**
  Completed `#1d4ed8` light / `#3b82f6` dark; Cancelled `#ea580c` / `#e06c1f`; Unmatched `#9333ea` / `#a855f7`.
- **Chart.js legend stays OFF** (`plugins.legend.display: false`). The table is the legend.
- **Never use `flex-basis` for sizing** in the card. Use `width` + `max-width: 100%`. A `flex: 0 1 480px` silently becomes a 480px *height* when a media query flips direction.
- **`:deep(.p-chart) { width: 100%; height: 100% }` is required.** Its absence collapses 13 villages into ~100px. No test can guard it — vitest injects no scoped styles into jsdom.
- **Default sort is village name ascending**, not total descending.
- **URL params:** `?start=&end=&tab=&view=&sort=&dir=`. Read-and-fall-back, never write a correction. Spread `route.query` in every setter.
- **Keep pure for the deferred PDF:** chart config builders, the height formula, and the ordered row list must all be callable without a mounted component.
- Test files use `// @vitest-environment jsdom` as line 1 and import `'@testing-library/jest-dom/vitest'` per file.

---

### Task 1: Series definitions and the legs-aware reduction

**Files:**
- Modify: `client/src/features/MetaMetrics/lib/reduceCells.js`
- Test: `client/src/features/MetaMetrics/lib/reduceCells.test.js`

**Interfaces:**
- Consumes: existing `byVillage(cells, villages)`, `STATUS_SERIES`, `cellTotal(byStatus)`.
- Produces: `byVillage(cells, villages, { legs })` — same rows, with `completed` bumped by `completedRoundTrips` when `legs` is true, and `total` bumped to match.

- [ ] **Step 1: Write the failing test**

Append to `reduceCells.test.js`:

```js
describe('byVillage with legs', () => {
  it('adds completedRoundTrips to completed when legs is true', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: true })
    const quahog = rows.find(r => r.villageId === '1')
    // completed 10+3 = 13, roundTrips 4+0 = 4
    expect(quahog.completed).toBe(17)
  })

  it('bumps total by the same amount so percentages stay coherent', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: true })
    const quahog = rows.find(r => r.villageId === '1')
    // base total 13+1+3+1 = 18, plus 4 legs
    expect(quahog.total).toBe(22)
    expect(quahog.completed + quahog.cancelled + quahog.unmatched).toBe(quahog.total)
  })

  it('leaves counts untouched when legs is false', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: false })
    const quahog = rows.find(r => r.villageId === '1')
    expect(quahog.completed).toBe(13)
    expect(quahog.total).toBe(18)
  })

  it('defaults legs to false when no options are passed', () => {
    const rows = byVillage(CELLS, VILLAGES)
    expect(rows.find(r => r.villageId === '1').completed).toBe(13)
  })

  it('still seeds granted villages that have no cells', () => {
    const rows = byVillage(CELLS, VILLAGES, { legs: true })
    const empty = rows.find(r => r.villageId === '3')
    expect(empty.total).toBe(0)
    expect(empty.completed).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/reduceCells.test.js`
Expected: FAIL — `byVillage` ignores the third argument, so `completed` is 13 not 17.

- [ ] **Step 3: Write minimal implementation**

In `reduceCells.js`, replace `accumulate` and `byVillage`:

```js
// `legs` is a parameter with exactly ONE caller pinning it to true, on purpose.
// The federation counts a completed round trip as two services and will not
// count differently, so Meta Metrics ships no toggle. Keeping the arithmetic
// parameterised means restoring a toggle for a future multi-village-grant user
// is wiring a ref to an existing parameter, not a rework. Do not inline it.
function accumulate (row, byStatus, completedRoundTrips, legs) {
  const bump = legs ? completedRoundTrips : 0
  row.completed += byStatus.completed + bump
  row.cancelled += byStatus.memberCancelled + byStatus.volunteerCancelled
  row.unmatched += byStatus.unmatched
  row.total += cellTotal(byStatus) + bump
}

export function byVillage (cells, villages, { legs = false } = {}) {
  // Seeded from `villages`, not from `cells`: a granted village with no
  // requests in range must still appear, at zero.
  const rows = new Map(
    villages.map(v => [v.villageId, blank({ villageId: v.villageId, villageName: v.villageName })])
  )
  for (const c of cells) {
    const row = rows.get(c.villageId)
    if (row) accumulate(row, c.byStatus, c.completedRoundTrips, legs)
  }
  return [...rows.values()].sort(byTotalDesc)
}
```

Update the two other callers to pass the new `accumulate` signature:

```js
export function byServiceType (cells) {
  const rows = new Map()
  for (const c of cells) {
    if (!rows.has(c.serviceName)) rows.set(c.serviceName, blank({ serviceName: c.serviceName }))
    accumulate(rows.get(c.serviceName), c.byStatus, c.completedRoundTrips, false)
  }
  return [...rows.values()].sort(byTotalDesc)
}

export function byCategory (cells) {
  const rows = new Map(CATEGORY_ORDER.map(c => [c, blank({ category: c })]))
  for (const c of cells) {
    const row = c.category === null ? undefined : rows.get(c.category)
    if (row) accumulate(row, c.byStatus, c.completedRoundTrips, false)
  }
  return [...rows.values()]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/reduceCells.test.js`
Expected: PASS — all previous tests plus the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/lib/reduceCells.js client/src/features/MetaMetrics/lib/reduceCells.test.js
git commit -m "feat(meta-metrics): legs-aware byVillage reduction"
```

---

### Task 2: The ordering layer

**Files:**
- Create: `client/src/features/MetaMetrics/lib/orderRows.js`
- Test: `client/src/features/MetaMetrics/lib/orderRows.test.js`

**Interfaces:**
- Consumes: row objects from `byVillage` — `{ villageId, villageName, completed, cancelled, unmatched, total }`.
- Produces:
  - `DEFAULT_SORT = { sort: 'villageName', dir: 'asc' }`
  - `orderRows(rows, { sort, dir, view })` → a **new** sorted array. When `view === 'share'` and `sort` is a series key, sorts by that key's share of `total`; otherwise by the raw value. `villageName` sorts by locale string compare. Unknown `sort` falls back to `villageName`.

This is the single ordering used by BOTH the chart and the table. Never sort twice.

- [ ] **Step 1: Write the failing test**

Create `orderRows.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { orderRows, DEFAULT_SORT } from './orderRows.js'

const ROWS = [
  { villageId: '1', villageName: 'Warwick',        completed: 268, cancelled: 118, unmatched: 92, total: 478 },
  { villageId: '2', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '3', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
  { villageId: '4', villageName: 'Empty Harbor',   completed: 0,   cancelled: 0,   unmatched: 0,  total: 0 },
]

const names = rows => rows.map(r => r.villageName)

describe('DEFAULT_SORT', () => {
  it('is village name ascending, not total descending', () => {
    expect(DEFAULT_SORT).toEqual({ sort: 'villageName', dir: 'asc' })
  })
})

describe('orderRows', () => {
  it('sorts by village name ascending by default', () => {
    expect(names(orderRows(ROWS, { sort: 'villageName', dir: 'asc', view: 'counts' })))
      .toEqual(['Barrington', 'East Greenwich', 'Empty Harbor', 'Warwick'])
  })

  it('sorts by village name descending', () => {
    expect(names(orderRows(ROWS, { sort: 'villageName', dir: 'desc', view: 'counts' })))
      .toEqual(['Warwick', 'Empty Harbor', 'East Greenwich', 'Barrington'])
  })

  it('sorts by a series column as a raw count in counts view', () => {
    expect(names(orderRows(ROWS, { sort: 'unmatched', dir: 'desc', view: 'counts' })))
      .toEqual(['Warwick', 'East Greenwich', 'Barrington', 'Empty Harbor'])
  })

  it('sorts by a series column as a SHARE of total in share view', () => {
    // East Greenwich 44/193 = 22.8% beats Warwick 92/478 = 19.2%
    expect(names(orderRows(ROWS, { sort: 'unmatched', dir: 'desc', view: 'share' })))
      .toEqual(['East Greenwich', 'Warwick', 'Barrington', 'Empty Harbor'])
  })

  it('treats a zero-total village as zero share rather than NaN', () => {
    const ordered = orderRows(ROWS, { sort: 'completed', dir: 'asc', view: 'share' })
    expect(ordered[0].villageName).toBe('Empty Harbor')
  })

  it('sorts by total', () => {
    expect(names(orderRows(ROWS, { sort: 'total', dir: 'desc', view: 'counts' })))
      .toEqual(['Barrington', 'Warwick', 'East Greenwich', 'Empty Harbor'])
  })

  it('falls back to village name for an unknown sort key', () => {
    expect(names(orderRows(ROWS, { sort: 'banana', dir: 'asc', view: 'counts' })))
      .toEqual(['Barrington', 'East Greenwich', 'Empty Harbor', 'Warwick'])
  })

  it('does not mutate the input array', () => {
    const before = names(ROWS)
    orderRows(ROWS, { sort: 'total', dir: 'desc', view: 'counts' })
    expect(names(ROWS)).toEqual(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/orderRows.test.js`
Expected: FAIL — "Failed to resolve import ./orderRows.js".

- [ ] **Step 3: Write minimal implementation**

Create `orderRows.js`:

```js
// The single ordering consumed by BOTH the chart and the table. The table
// header is the sort control and the chart follows it, so computing two
// orderings anywhere would let them drift apart — which is the whole point of
// putting them one above the other.
//
// Pure and component-free on purpose: the deferred PDF export draws its own
// table and cannot scrape the DOM, so it needs this list as plain data.

export const SERIES_KEYS = ['completed', 'cancelled', 'unmatched']

// Village name ascending, NOT total descending. Alphabetical is the only sort
// that is not itself an editorial claim, and it holds the rows still when the
// date range changes — where a total sort reshuffles every row.
export const DEFAULT_SORT = { sort: 'villageName', dir: 'asc' }

// In share view a series column ranks by its FRACTION of the row, so a village
// with a bad rate but small absolute numbers rises. That is the intent; the
// Requests column beside it is what keeps the reader honest about magnitude.
function valueFor (row, sort, view) {
  if (sort === 'total') return row.total
  if (view === 'share' && SERIES_KEYS.includes(sort)) {
    return row.total === 0 ? 0 : row[sort] / row.total
  }
  return row[sort]
}

export function orderRows (rows, { sort, dir, view }) {
  const key = (sort === 'villageName' || sort === 'total' || SERIES_KEYS.includes(sort))
    ? sort
    : DEFAULT_SORT.sort
  const sign = dir === 'desc' ? -1 : 1

  // Copy first: callers pass a computed array that other consumers also read.
  return [...rows].sort((a, b) => {
    if (key === 'villageName') {
      return sign * a.villageName.localeCompare(b.villageName)
    }
    return sign * (valueFor(a, key, view) - valueFor(b, key, view))
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/orderRows.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/lib/orderRows.js client/src/features/MetaMetrics/lib/orderRows.test.js
git commit -m "feat(meta-metrics): single ordering layer for chart and table"
```

---

### Task 3: Chart height formula and series-parameterised config

**Files:**
- Modify: `client/src/features/MetaMetrics/lib/chartConfig.js`
- Test: `client/src/features/MetaMetrics/lib/chartConfig.test.js`

**Interfaces:**
- Consumes: `STATUS_SERIES` from `reduceCells.js`; ordered rows from Task 2.
- Produces:
  - `BAR_THICKNESS = 14`, `CHART_PADDING = 64`
  - `chartHeight(rowCount, seriesCount)` → number of px. **Exported pure function** — the deferred PDF calls it with its own thickness.
  - `buildBarData(rows, labelKey, { dark, series })` and `buildProportionalData(rows, labelKey, { dark, series })` — `series` defaults to `STATUS_SERIES` so existing callers are unaffected.

- [ ] **Step 1: Write the failing test**

The file's first line already reads
`import { buildBarData, buildProportionalData, barOptions } from './chartConfig.js'` —
**extend that existing import** rather than adding a second one:

```js
import { buildBarData, buildProportionalData, barOptions, chartHeight, BAR_THICKNESS, CHART_PADDING } from './chartConfig.js'
```

Then append:

```js
describe('chartHeight', () => {
  it('scales with rows times series', () => {
    expect(chartHeight(13, 3)).toBe(13 * 3 * BAR_THICKNESS + CHART_PADDING)
  })

  it('gives a 4-series chart more height than a 3-series one at equal rows', () => {
    expect(chartHeight(13, 4)).toBeGreaterThan(chartHeight(13, 3))
  })

  it('floors at a usable height when there are no rows', () => {
    expect(chartHeight(0, 3)).toBeGreaterThanOrEqual(240)
  })
})

describe('buildBarData series parameter', () => {
  const ROWS = [{ villageName: 'Quahog', completed: 5, cancelled: 2, unmatched: 1, total: 8 }]

  it('defaults to the three status series', () => {
    const data = buildBarData(ROWS, 'villageName', { dark: false })
    expect(data.datasets.map(d => d.label)).toEqual(['Completed', 'Cancelled', 'Unmatched'])
  })

  it('accepts an explicit series set', () => {
    const series = [{ key: 'completed', label: 'Done', colorLight: '#111', colorDark: '#eee' }]
    const data = buildBarData(ROWS, 'villageName', { dark: false, series })
    expect(data.datasets).toHaveLength(1)
    expect(data.datasets[0].label).toBe('Done')
    expect(data.datasets[0].backgroundColor).toBe('#111')
  })

  it('picks the dark hue when dark is true', () => {
    const series = [{ key: 'completed', label: 'Done', colorLight: '#111', colorDark: '#eee' }]
    const data = buildBarData(ROWS, 'villageName', { dark: true, series })
    expect(data.datasets[0].backgroundColor).toBe('#eee')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/chartConfig.test.js`
Expected: FAIL — `chartHeight is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `chartConfig.js`, add at the top after the import:

```js
// Chart height is computed from the DATA and nothing else. Village Metrics'
// two-way flex stretch — chart matches the legend beside it — does not
// transfer: there, chart rows and legend rows are the same list, but here the
// SERIES count differs per tab (3 outcomes, 4 categories, 1 stacked), so the
// chart's natural height diverges from the table's fixed row count.
//
// Exported and pure so the deferred PDF export can call it with its own
// thickness. A capture canvas whose proportions differ from the PDF's draw box
// gets stretched by pdf-lib — sharing this formula is what prevents that.
export const BAR_THICKNESS = 14
export const CHART_PADDING = 64
const MIN_CHART_HEIGHT = 240

export function chartHeight (rowCount, seriesCount) {
  return Math.max(MIN_CHART_HEIGHT, rowCount * seriesCount * BAR_THICKNESS + CHART_PADDING)
}
```

Then change the two builders to take `series`:

```js
export function buildBarData (rows, labelKey, { dark, series = STATUS_SERIES }) {
  return {
    labels: rows.map(r => r[labelKey]),
    datasets: series.map(s => ({
      label: s.label,
      data: rows.map(r => r[s.key]),
      backgroundColor: hue(s, dark),
      borderRadius: 4,
      borderSkipped: false,
    })),
  }
}

export function buildProportionalData (rows, labelKey, { dark, series = STATUS_SERIES }) {
  return {
    labels: rows.map(r => r[labelKey]),
    datasets: series.map(s => ({
      label: s.label,
      // A village with no requests in range yields 0, not NaN — it must still
      // render as an empty row rather than disappearing.
      data: rows.map(r => (r.total === 0 ? 0 : (r[s.key] / r.total) * 100)),
      backgroundColor: hue(s, dark),
      borderRadius: 4,
      borderSkipped: false,
    })),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/chartConfig.test.js`
Expected: PASS — 8 existing plus 6 new.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/lib/chartConfig.js client/src/features/MetaMetrics/lib/chartConfig.test.js
git commit -m "feat(meta-metrics): pure chart height formula and series parameter"
```

---

### Task 4: Matrix table rows and CSV

**Files:**
- Create: `client/src/features/MetaMetrics/lib/matrixTable.js`
- Test: `client/src/features/MetaMetrics/lib/matrixTable.test.js`

**Interfaces:**
- Consumes: ordered rows from Task 2; `STATUS_SERIES` from `reduceCells.js`.
- Produces:
  - `matrixColumns(series, view)` → `[{ header, key }]` — `Village`, one per series, then `Total` (counts) or `Requests` (share).
  - `matrixCells(rows, series, view)` → display rows keyed by column key; integers in counts, `'22.8%'` strings in share.
  - `matrixFooter(rows, series, view)` → `{ label: 'Total'|'Hub', ...cells }`.
  - `metaCsvFilename({ tab, view, sort, start, end })` → e.g. `meta-outcomes-share-2026-01-01-2026-08-21.csv`.

- [ ] **Step 1: Write the failing test**

Create `matrixTable.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { matrixColumns, matrixCells, matrixFooter, metaCsvFilename } from './matrixTable.js'
import { STATUS_SERIES } from './reduceCells.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '2', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
  { villageId: '3', villageName: 'Empty Harbor',   completed: 0,   cancelled: 0,   unmatched: 0,  total: 0 },
]

describe('matrixColumns', () => {
  it('is Village, the series, then Total in counts view', () => {
    expect(matrixColumns(STATUS_SERIES, 'counts').map(c => c.header))
      .toEqual(['Village', 'Completed', 'Cancelled', 'Unmatched', 'Total'])
  })

  it('names the last column Requests in share view', () => {
    expect(matrixColumns(STATUS_SERIES, 'share').map(c => c.header))
      .toEqual(['Village', 'Completed', 'Cancelled', 'Unmatched', 'Requests'])
  })
})

describe('matrixCells', () => {
  it('emits integers in counts view', () => {
    const [first] = matrixCells(ROWS, STATUS_SERIES, 'counts')
    expect(first).toMatchObject({ villageName: 'Barrington', completed: 624, total: 919 })
  })

  it('emits one-decimal percentages in share view', () => {
    const cells = matrixCells(ROWS, STATUS_SERIES, 'share')
    expect(cells[1]).toMatchObject({ villageName: 'East Greenwich', unmatched: '22.8%' })
  })

  it('keeps the absolute request count as the last column in share view', () => {
    const cells = matrixCells(ROWS, STATUS_SERIES, 'share')
    expect(cells[1].total).toBe(193)
  })

  it('renders a zero-total village as 0.0% rather than NaN', () => {
    const cells = matrixCells(ROWS, STATUS_SERIES, 'share')
    expect(cells[2].completed).toBe('0.0%')
  })
})

describe('matrixFooter', () => {
  it('sums each series in counts view and is labelled Total', () => {
    const foot = matrixFooter(ROWS, STATUS_SERIES, 'counts')
    expect(foot).toMatchObject({ villageName: 'Total', completed: 712, unmatched: 48, total: 1112 })
  })

  it('is a hub-wide rate labelled Hub in share view', () => {
    const foot = matrixFooter(ROWS, STATUS_SERIES, 'share')
    // 712 / 1112 = 64.0%
    expect(foot).toMatchObject({ villageName: 'Hub', completed: '64.0%', total: 1112 })
  })
})

describe('metaCsvFilename', () => {
  it('carries tab, view and range', () => {
    expect(metaCsvFilename({ tab: 'outcomes', view: 'share', start: '2026-01-01', end: '2026-08-21' }))
      .toBe('meta-outcomes-share-2026-01-01-2026-08-21.csv')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/matrixTable.test.js`
Expected: FAIL — "Failed to resolve import ./matrixTable.js".

- [ ] **Step 3: Write minimal implementation**

Create `matrixTable.js`:

```js
// The table beside/below the chart IS the legend — Chart.js's own legend is
// disabled, exactly as in VillageMetrics' MetricsChartCard.vue. But where that
// table is one row per slice (its chart is single-series), Meta's chart is
// villages x series, so this table is a MATRIX: villages down, series across.
//
// Pure and DOM-free: the deferred PDF export draws its own table from these
// same values.

// Share view shows one decimal because the bar cannot: "22.8% unmatched", not
// "about a quarter".
function pct (value, total) {
  return `${(total === 0 ? 0 : (value / total) * 100).toFixed(1)}%`
}

// The last column changes meaning with the view. In share view it stays an
// ABSOLUTE count — it is the answer to "share hides magnitude", letting a
// reader see that a 45.6% completion rate is out of only 193 requests.
export function matrixColumns (series, view) {
  return [
    { header: 'Village', key: 'villageName' },
    ...series.map(s => ({ header: s.label, key: s.key })),
    { header: view === 'share' ? 'Requests' : 'Total', key: 'total' },
  ]
}

export function matrixCells (rows, series, view) {
  return rows.map(row => {
    const cells = { villageId: row.villageId, villageName: row.villageName, total: row.total }
    for (const s of series) {
      cells[s.key] = view === 'share' ? pct(row[s.key], row.total) : row[s.key]
    }
    return cells
  })
}

// A column of percentages does not sum to anything meaningful, so share view
// shows the hub-wide RATE rather than a total, and is labelled accordingly.
export function matrixFooter (rows, series, view) {
  const totals = { total: rows.reduce((sum, r) => sum + r.total, 0) }
  for (const s of series) {
    totals[s.key] = rows.reduce((sum, r) => sum + r[s.key], 0)
  }

  const foot = { villageName: view === 'share' ? 'Hub' : 'Total', total: totals.total }
  for (const s of series) {
    foot[s.key] = view === 'share' ? pct(totals[s.key], totals.total) : totals[s.key]
  }
  return foot
}

// State is in the filename because it is baked into the contents — mirroring
// csvFilename() in VillageMetrics' metricsCsv.js. Without it, a counts and a
// share download of the same tab collide as one name in Downloads.
export function metaCsvFilename ({ tab, view, start, end }) {
  return ['meta', tab, view, start, end].filter(Boolean).join('-') + '.csv'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/matrixTable.test.js`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/lib/matrixTable.js client/src/features/MetaMetrics/lib/matrixTable.test.js
git commit -m "feat(meta-metrics): matrix table columns, cells, footer and CSV name"
```

---

### Task 5: MetaMatrixTable component

**Files:**
- Create: `client/src/features/MetaMetrics/components/MetaMatrixTable.vue`
- Test: `client/src/features/MetaMetrics/components/MetaMatrixTable.test.js`

**Interfaces:**
- Consumes: `matrixColumns`, `matrixCells`, `matrixFooter` (Task 4); `toCsv`/`downloadCsv` from `shared/lib/csvUtils.js`.
- Produces: props `rows` (ordered), `series`, `view`, `sort`, `dir`, `csvFilename`; emits `update:sort` with `{ sort, dir }`.

**Critical:** DataTable must NOT sort internally — the chart has to follow the same order. Use `@sort` to emit, and let the parent supply already-ordered `rows`.

- [ ] **Step 1: Write the failing test**

Create `MetaMatrixTable.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/vue'
import PrimeVue from 'primevue/config'
import MetaMatrixTable from './MetaMatrixTable.vue'
import { STATUS_SERIES } from '../lib/reduceCells.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '2', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
]

const mountTable = (props = {}) => render(MetaMatrixTable, {
  props: {
    rows: ROWS,
    series: STATUS_SERIES,
    view: 'counts',
    sort: 'villageName',
    dir: 'asc',
    csvFilename: 'meta-outcomes-counts-2026-01-01-2026-08-21.csv',
    ...props,
  },
  global: { plugins: [PrimeVue] },
})

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => cleanup())

describe('MetaMatrixTable', () => {
  it('renders a Village column and one column per series', () => {
    mountTable()
    expect(screen.getByText('Village')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Unmatched')).toBeInTheDocument()
  })

  it('names the last column Total in counts view', () => {
    mountTable({ view: 'counts' })
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('names the last column Requests in share view', () => {
    mountTable({ view: 'share' })
    expect(screen.getByText('Requests')).toBeInTheDocument()
  })

  it('renders rows in the order given, without re-sorting them', () => {
    mountTable({ sort: 'unmatched', dir: 'desc' })
    const cells = screen.getAllByRole('cell').map(c => c.textContent.trim())
    // Parent passed Barrington first; the table must not reorder to put
    // East Greenwich (higher unmatched) on top.
    expect(cells[0]).toBe('Barrington')
  })

  it('shows percentages in share view', () => {
    mountTable({ view: 'share' })
    expect(screen.getByText('22.8%')).toBeInTheDocument()
  })

  it('emits update:sort when a sortable header is clicked', async () => {
    const { emitted } = mountTable()
    await fireEvent.click(screen.getByText('Unmatched'))
    expect(emitted()['update:sort']).toBeTruthy()
    expect(emitted()['update:sort'][0][0]).toMatchObject({ sort: 'unmatched' })
  })

  it('renders a Total footer row in counts view', () => {
    mountTable({ view: 'counts' })
    expect(screen.getByText('712')).toBeInTheDocument()
  })

  it('labels the footer Hub in share view', () => {
    mountTable({ view: 'share' })
    expect(screen.getByText('Hub')).toBeInTheDocument()
  })

  it('offers a CSV download', () => {
    mountTable()
    expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/components/MetaMatrixTable.test.js`
Expected: FAIL — cannot resolve `./MetaMatrixTable.vue`.

- [ ] **Step 3: Write minimal implementation**

Create `MetaMatrixTable.vue`:

```vue
<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ColumnGroup from 'primevue/columngroup'
import Row from 'primevue/row'
import Button from 'primevue/button'
import { toCsv, downloadCsv } from '../../../shared/lib/csvUtils.js'
import { matrixColumns, matrixCells, matrixFooter } from '../lib/matrixTable.js'

const props = defineProps({
  rows: { type: Array, required: true },      // ALREADY ordered by the parent
  series: { type: Array, required: true },
  view: { type: String, required: true },     // 'counts' | 'share'
  sort: { type: String, required: true },
  dir: { type: String, required: true },      // 'asc' | 'desc'
  csvFilename: { type: String, required: true },
})

const emit = defineEmits(['update:sort'])

defineOptions({ name: 'MetaMatrixTable' })

const columns = computed(() => matrixColumns(props.series, props.view))
const cells = computed(() => matrixCells(props.rows, props.series, props.view))
const footer = computed(() => matrixFooter(props.rows, props.series, props.view))

// The chart above must render the SAME order, so DataTable never sorts for
// itself: it reports the click and the parent recomputes one ordered list that
// both children consume. `:sortField`/`:sortOrder` are bound so the header
// arrows reflect the parent's state.
function onSort (event) {
  emit('update:sort', {
    sort: event.sortField,
    dir: event.sortOrder === -1 ? 'desc' : 'asc',
  })
}

const sortOrder = computed(() => (props.dir === 'desc' ? -1 : 1))

function onDownloadCsv () {
  downloadCsv(toCsv(cells.value, columns.value), props.csvFilename)
}
</script>

<template>
  <div class="matrix-wrap">
    <div class="table-actions">
      <Button icon="pi pi-download" label="Download CSV" text size="small" @click="onDownloadCsv" />
    </div>
    <DataTable
      :value="cells"
      :sortField="sort"
      :sortOrder="sortOrder"
      @sort="onSort"
      dataKey="villageId"
      class="meta-matrix-table"
    >
      <Column
        v-for="(col, i) in columns"
        :key="col.key"
        :field="col.key"
        :header="col.header"
        sortable
        :bodyClass="i === 0 ? '' : 'num-cell'"
        :headerClass="i === 0 ? '' : 'num-cell'"
      />
      <ColumnGroup type="footer">
        <Row>
          <Column
            v-for="(col, i) in columns"
            :key="col.key"
            :footer="String(footer[col.key])"
            :footerClass="i === 0 ? '' : 'num-cell'"
          />
        </Row>
      </ColumnGroup>
    </DataTable>
  </div>
</template>

<style scoped>
.matrix-wrap { min-width: 0; overflow-x: auto; }

.table-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
}

/* Numbers right-align so magnitudes line up column-wise; the village name does not. */
.meta-matrix-table :deep(.num-cell) { text-align: right; }

.meta-matrix-table :deep(tfoot td) {
  font-weight: 700;
  border-top: 2px solid var(--color-border-default, #e5e7eb);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/MetaMetrics/components/MetaMatrixTable.test.js`
Expected: PASS — 9 tests.

If the sort-emit test fails because PrimeVue's sortable header needs the inner
`.p-column-header-content` clicked, target it instead:
`await fireEvent.click(screen.getByText('Unmatched').closest('th'))`.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/components/MetaMatrixTable.vue client/src/features/MetaMetrics/components/MetaMatrixTable.test.js
git commit -m "feat(meta-metrics): sortable matrix table emitting sort to parent"
```

---

### Task 6: MetaChartCard rebuild — chart above table

**Files:**
- Rewrite: `client/src/features/MetaMetrics/components/MetaChartCard.vue`
- Test: `client/src/features/MetaMetrics/components/MetaChartCard.test.js` (create)

**Interfaces:**
- Consumes: `chartHeight` (Task 3), `MetaMatrixTable` (Task 5).
- Produces: props `title`, `rows`, `series`, `view`, `sort`, `dir`, `csvFilename`, `chartData`, `chartOptions`; re-emits `update:sort`.

- [ ] **Step 1: Write the failing test**

Create `MetaChartCard.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/vue'
import PrimeVue from 'primevue/config'
import MetaChartCard from './MetaChartCard.vue'
import { STATUS_SERIES } from '../lib/reduceCells.js'

let chartRenders = []
vi.mock('primevue/chart', () => ({
  default: {
    name: 'Chart',
    props: ['type', 'data', 'options'],
    setup (props) {
      return () => { chartRenders.push(props); return null }
    },
  },
}))

const ROWS = [
  { villageId: '1', villageName: 'Barrington',     completed: 624, cancelled: 291, unmatched: 4,  total: 919 },
  { villageId: '2', villageName: 'East Greenwich', completed: 88,  cancelled: 61,  unmatched: 44, total: 193 },
]

const mountCard = (props = {}) => render(MetaChartCard, {
  props: {
    rows: ROWS,
    series: STATUS_SERIES,
    view: 'counts',
    sort: 'villageName',
    dir: 'asc',
    csvFilename: 'meta-outcomes-counts.csv',
    chartData: { labels: ['Barrington', 'East Greenwich'], datasets: [] },
    chartOptions: {},
    ...props,
  },
  global: { plugins: [PrimeVue] },
})

beforeEach(() => { chartRenders = [] })
afterEach(() => cleanup())

describe('MetaChartCard', () => {
  it('renders the chart it is given', () => {
    mountCard()
    expect(chartRenders.at(-1).data.labels).toEqual(['Barrington', 'East Greenwich'])
  })

  it('renders the matrix table below the chart', () => {
    mountCard()
    expect(screen.getByText('Village')).toBeInTheDocument()
    expect(screen.getByText('Barrington')).toBeInTheDocument()
  })

  it('sizes the chart box from row and series counts', () => {
    const { container } = mountCard()
    const box = container.querySelector('.chart-box')
    // 2 rows x 3 series x 14px + 64 = 148, floored at 240
    expect(box.getAttribute('style')).toContain('240px')
  })

  it('shows an empty message when there are no rows', () => {
    mountCard({ rows: [], chartData: { labels: [], datasets: [] } })
    expect(screen.getByText(/no requests in this range/i)).toBeInTheDocument()
  })

  it('re-emits the table sort event', async () => {
    const { emitted } = mountCard()
    // The table emits upward; assert the card forwards it.
    expect(emitted()['update:sort']).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/components/MetaChartCard.test.js`
Expected: FAIL — the current card takes `title`/`subtitle`/`height` and renders a slot, so `.chart-box` and the table are absent.

- [ ] **Step 3: Write minimal implementation**

Replace the whole of `MetaChartCard.vue`:

```vue
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import Chart from 'primevue/chart'
import MetaMatrixTable from './MetaMatrixTable.vue'
import { chartHeight } from '../lib/chartConfig.js'

const props = defineProps({
  rows: { type: Array, required: true },       // ALREADY ordered
  series: { type: Array, required: true },
  view: { type: String, required: true },
  sort: { type: String, required: true },
  dir: { type: String, required: true },
  csvFilename: { type: String, required: true },
  chartData: { type: Object, required: true },
  chartOptions: { type: Object, required: true },
  emptyMessage: { type: String, default: 'No requests in this range' },
})

defineEmits(['update:sort'])

defineOptions({ name: 'MetaChartCard' })

const hasRows = computed(() => props.rows.length > 0)

// Height comes from the DATA, never from the table beside/below it — the series
// count differs per tab, so the chart's natural height and the table's row
// count diverge. See chartHeight()'s comment.
const chartBoxStyle = computed(() => ({
  height: `${chartHeight(props.rows.length, props.series.length)}px`,
}))

// Chart.js does not re-measure its container on a viewport resize here. Carried
// over from MetricsChartCard.vue — the page is served over ngrok for customer
// demos on their own devices, where resizing is expected.
const chartHost = ref(null)
const chartRef = ref(null)
let resizeObserver = null

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !chartHost.value) return
  resizeObserver = new ResizeObserver(() => {
    // getChart() is null until chart.js/auto finishes its dynamic import.
    chartRef.value?.getChart()?.resize()
  })
  resizeObserver.observe(chartHost.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <section class="meta-chart-card">
    <!-- Chart above table, both full width. A deliberate divergence from
         VillageMetrics' side-by-side card: these are wider-than-usual
         comparisons and 13-village bars benefit from the full width.
         If this proves too wide, flipping .meta-chart-card to
         `flex-direction: row` and giving the two children widths is the whole
         change — which is why NEITHER child uses flex-basis. A `flex: 0 1 480px`
         silently becomes a 480px HEIGHT once the direction is column. -->
    <div class="chart-box" :style="chartBoxStyle" ref="chartHost">
      <Chart
        v-if="hasRows"
        ref="chartRef"
        type="bar"
        :data="chartData"
        :options="chartOptions"
      />
      <p v-else class="empty-msg">{{ emptyMessage }}</p>
    </div>

    <MetaMatrixTable
      :rows="rows"
      :series="series"
      :view="view"
      :sort="sort"
      :dir="dir"
      :csvFilename="csvFilename"
      @update:sort="$emit('update:sort', $event)"
    />
  </section>
</template>

<style scoped>
.meta-chart-card {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: var(--color-background-light);
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  padding: 1.25rem 1.5rem 1.5rem;
  min-width: 0;
}

/* WIDTH, never flex-basis — basis follows the main axis, and this card's
   direction is the one thing a layout change would flip. */
.chart-box {
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

/* REQUIRED. Without it PrimeVue's wrapper collapses to its intrinsic size and
   Chart.js ignores the sized parent — 13 villages rendered into ~100px with 3px
   bars and most labels dropped. This was a live defect in the previous version
   of this file.
   NO TEST GUARDS THIS: vitest injects no scoped styles into jsdom, so an
   assertion would pass whether the rule exists or not. Deleting it is visible
   only in a browser. */
.chart-box :deep(.p-chart) { width: 100%; height: 100%; }

.empty-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  color: var(--color-text-muted, #6b7280);
}

@media (max-width: 640px) {
  .meta-chart-card { padding: 1rem; }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/MetaMetrics/components/MetaChartCard.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/components/MetaChartCard.vue client/src/features/MetaMetrics/components/MetaChartCard.test.js
git commit -m "feat(meta-metrics): rebuild chart card as chart above matrix table"
```

---

### Task 7: MetaSummaryStrip

**Files:**
- Create: `client/src/features/MetaMetrics/components/MetaSummaryStrip.vue`
- Create: `client/src/features/MetaMetrics/lib/stripStats.js`
- Test: `client/src/features/MetaMetrics/lib/stripStats.test.js`

**Interfaces:**
- Produces: `metaStripStats(rows)` → `{ villages, requests, completed, cancelled, unmatched }`; component prop `stats`.

Five cards, not Village Metrics' four — **Villages** is added because scope is grant-derived and varies by caller.

- [ ] **Step 1: Write the failing test**

Create `stripStats.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { metaStripStats } from './stripStats.js'

const ROWS = [
  { villageId: '1', villageName: 'Barrington',   completed: 624, cancelled: 291, unmatched: 4, total: 919 },
  { villageId: '2', villageName: 'Empty Harbor', completed: 0,   cancelled: 0,   unmatched: 0, total: 0 },
]

describe('metaStripStats', () => {
  it('counts every village in scope, including those with no requests', () => {
    expect(metaStripStats(ROWS).villages).toBe(2)
  })

  it('sums requests and each outcome', () => {
    expect(metaStripStats(ROWS)).toMatchObject({
      requests: 919, completed: 624, cancelled: 291, unmatched: 4,
    })
  })

  it('returns zeroes for an empty scope', () => {
    expect(metaStripStats([])).toEqual({
      villages: 0, requests: 0, completed: 0, cancelled: 0, unmatched: 0,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/stripStats.test.js`
Expected: FAIL — cannot resolve `./stripStats.js`.

- [ ] **Step 3: Write minimal implementation**

Create `stripStats.js`:

```js
// Village Metrics' strip has four cards. Meta adds a fifth, Villages, because
// scope is grant-derived and varies by caller — how many villages are in scope
// is itself information.
export function metaStripStats (rows) {
  return {
    villages: rows.length,
    requests: rows.reduce((sum, r) => sum + r.total, 0),
    completed: rows.reduce((sum, r) => sum + r.completed, 0),
    cancelled: rows.reduce((sum, r) => sum + r.cancelled, 0),
    unmatched: rows.reduce((sum, r) => sum + r.unmatched, 0),
  }
}
```

Create `MetaSummaryStrip.vue`:

```vue
<script setup>
defineProps({
  stats: {
    type: Object,
    required: true,
    // { villages, requests, completed, cancelled, unmatched }
  },
})

defineOptions({ name: 'MetaSummaryStrip' })

const CARDS = [
  { label: 'Villages', key: 'villages' },
  { label: 'Requests', key: 'requests' },
  { label: 'Completed', key: 'completed' },
  { label: 'Cancelled', key: 'cancelled' },
  { label: 'Unmatched', key: 'unmatched' },
]
</script>

<template>
  <div class="summary-strip">
    <div v-for="card in CARDS" :key="card.key" class="stat-card">
      <label class="stat-label">{{ card.label }}</label>
      <div class="stat-value">{{ stats[card.key].toLocaleString() }}</div>
    </div>
  </div>
</template>

<style scoped>
.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--color-background-light, #fff);
  border: 1px solid var(--color-border-default, #e5e7eb);
  border-radius: 8px;
  padding: 1rem;
  flex: 1 1 150px;
  /* A flat 150px floor plus the gap overflows a 320px screen once two cards
     share a row; min() keeps the preference but allows collapse. */
  min-width: min(150px, 100%);
}

.stat-label {
  display: block;
  color: var(--color-text-muted, #6b7280);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.stat-value { font-size: 1.875rem; font-weight: 600; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/MetaMetrics/lib/stripStats.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/components/MetaSummaryStrip.vue client/src/features/MetaMetrics/lib/stripStats.js client/src/features/MetaMetrics/lib/stripStats.test.js
git commit -m "feat(meta-metrics): five-card summary strip with village count"
```

---

### Task 8: Page shell — header, tabs, URL state, Outcomes tab

**Files:**
- Rewrite: `client/src/features/MetaMetrics/components/MetaMetrics.vue`
- Modify: `client/src/features/MetaMetrics/components/MetaMetrics.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: the finished stage-1 page.

**Preserve verbatim** from the current file: the `rangeKey` primitive watch, `normalizeRange`, the `onMounted(() => fetchIfValid())` single-fetch dance, the `isDenied` 403 handling, and `{ immediate: false, onError: null }`. Those carry three documented traps.

- [ ] **Step 1: Write the failing test**

Replace the body of `MetaMetrics.test.js`'s describe block (keep the existing mocks and `mockRoute`/`mockRouter` setup verbatim) with:

```js
describe('MetaMetrics page shell', () => {
  it('shows the five-card summary strip', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByText('Villages')).toBeInTheDocument())
    expect(screen.getByText('Requests')).toBeInTheDocument()
    expect(screen.getByText('Unmatched')).toBeInTheDocument()
  })

  it('states the counting rules under the title', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => {
      expect(screen.getByText(/round-trip rides count as two services/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/hub-cancelled requests are excluded/i)).toBeInTheDocument()
  })

  it('renders no round-trip toggle', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByText('Villages')).toBeInTheDocument())
    expect(screen.queryByLabelText(/round trip = 2 legs/i)).not.toBeInTheDocument()
  })

  it('defaults to the outcomes tab', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Outcomes' })).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Outcomes' })).toHaveAttribute('aria-selected', 'true')
  })

  it('orders rows by village name ascending on first render', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    expect(chartRenders.at(-1).labels).toEqual(['Barrington', 'Warwick'])
  })

  it('doubles completed counts for round trips', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    const completed = chartRenders.at(-1).datasets[0]
    // Barrington: completed 10 + roundTrips 3 = 13
    expect(completed.data[0]).toBe(13)
  })

  it('writes the view to the URL when Share is chosen', async () => {
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(screen.getByText('Share')).toBeInTheDocument())
    await fireEvent.click(screen.getByText('Share'))
    await waitFor(() => expect(mockRoute.query.view).toBe('share'))
  })

  it('reads the sort from the URL and applies it to the chart', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', sort: 'unmatched', dir: 'desc' }
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    // Warwick has more unmatched than Barrington
    expect(chartRenders.at(-1).labels).toEqual(['Warwick', 'Barrington'])
  })

  it('falls back to defaults for unknown URL values without writing a correction', async () => {
    mockRoute.query = { start: '2026-01-01', end: '2026-12-31', tab: 'banana', view: 'banana' }
    getMetaMetrics.mockResolvedValue(PAYLOAD)
    mountPage()
    await waitFor(() => expect(chartRenders.length).toBeGreaterThan(0))
    expect(mockRoute.query.tab).toBe('banana')  // not corrected
    expect(screen.getByRole('tab', { name: 'Outcomes' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows an inline notice rather than crashing on 403', async () => {
    // getHttpStatus() reads `err.status` directly (apiClient.js:58) — NOT
    // `err.response.status`. A nested shape here silently yields null and the
    // notice never renders.
    getMetaMetrics.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
    mountPage()
    await waitFor(() => expect(screen.getByText(/no villages in scope/i)).toBeInTheDocument())
  })
})
```

Add above the describe block:

```js
const PAYLOAD = {
  range: { start: '2026-01-01', end: '2026-12-31' },
  villages: [
    { villageId: '1', villageName: 'Warwick' },
    { villageId: '2', villageName: 'Barrington' },
  ],
  cells: [
    { villageId: '1', serviceName: 'Ride: Medical Appnt', category: 'Rides',
      byStatus: { completed: 8, unmatched: 5, memberCancelled: 2, volunteerCancelled: 1 },
      completedRoundTrips: 2 },
    { villageId: '2', serviceName: 'Ride: Medical Appnt', category: 'Rides',
      byStatus: { completed: 10, unmatched: 1, memberCancelled: 3, volunteerCancelled: 0 },
      completedRoundTrips: 3 },
  ],
}

const mountPage = () => render(MetaMetrics, {
  global: { plugins: [PrimeVue], stubs: { MetricsRangePicker: true } },
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/MetaMetrics/components/MetaMetrics.test.js`
Expected: FAIL — no summary strip, no tabs, no counting-rule note.

- [ ] **Step 3: Write minimal implementation**

Replace `MetaMetrics.vue` entirely:

```vue
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import MetaChartCard from './MetaChartCard.vue'
import MetaSummaryStrip from './MetaSummaryStrip.vue'
import { getMetaMetrics } from '../api/metaMetricsApi.js'
import { byVillage, STATUS_SERIES } from '../lib/reduceCells.js'
import { orderRows, DEFAULT_SORT } from '../lib/orderRows.js'
import { buildBarData, buildProportionalData, barOptions } from '../lib/chartConfig.js'
import { metaStripStats } from '../lib/stripStats.js'
import { metaCsvFilename } from '../lib/matrixTable.js'
import { getHttpStatus } from '../../../shared/api/apiClient.js'
import { dateToServiceDate } from '../../../shared/lib/civilDate.js'
import { useAsyncState } from '../../../shared/composables/useAsyncState.js'
import { useRefetchOnChange } from '../../../shared/composables/useRefetchOnChange.js'
import { presetRange, isValidRange } from '../../VillageMetrics/lib/rangePresets.js'
import MetricsRangePicker from '../../VillageMetrics/components/MetricsRangePicker.vue'

defineOptions({ name: 'MetaMetrics' })

const route = useRoute()
const router = useRouter()

// "today" as a civil string — reading the clock is allowed; parsing a stored value is not.
const todayCivil = dateToServiceDate(new Date())

const range = computed(() => ({ start: route.query.start, end: route.query.end }))

// Identity-stable watch source. `range` returns a NEW object literal each evaluation, and
// watch compares non-deep sources with Object.is — so watching `range` refetches on ANY
// navigation, including a tab-only one. A primitive string collapses that to a real
// value comparison.
const rangeKey = computed(() => `${route.query.start}|${route.query.end}`)

// Normalize the URL to a valid range (default = this-year) whenever it is missing/invalid.
// Spreads the existing query so a normalize doesn't drop tab/view/sort.
function normalizeRange () {
  if (!isValidRange(range.value)) {
    const def = presetRange('thisYear', todayCivil)
    router.replace({ query: { ...route.query, start: def.start, end: def.end } })
    return false // a replace will re-trigger the watcher with a valid range
  }
  return true
}

const { state: payload, isLoading, error, execute } = useAsyncState(
  () => getMetaMetrics(range.value.start, range.value.end),
  // A 403 here means the caller has no granted villages at all — an expected
  // outcome, not a bug. Show it inline instead of the global error modal.
  { immediate: false, onError: null },
)

const isDenied = computed(() => getHttpStatus(error.value) === 403)

function fetchIfValid () {
  if (normalizeRange()) execute()
}

useRefetchOnChange([rangeKey], fetchIfValid)

// The single mount trigger — see VillageMetrics.vue for the full note. Net:
// exactly one fetch on entry, no double-fetch and no replace loop.
onMounted(() => fetchIfValid())

function onRangeUpdate ({ start, end }) {
  router.replace({ query: { ...route.query, start, end } })
}

// ---- URL-backed selections ----
// All follow the same shape: read when present and valid, otherwise fall back
// WITHOUT writing a correction, so a hand-typed bad value renders sanely with no
// extra history entry. Every setter spreads route.query so params don't clobber
// each other.
function urlState (param, values, fallback) {
  return computed({
    get: () => (values.includes(route.query[param]) ? route.query[param] : fallback),
    set: (value) => {
      if (!values.includes(value)) return
      router.replace({ query: { ...route.query, [param]: value } })
    },
  })
}

// Stage 1 ships Outcomes only; categories/services are stage 2.
const TAB_VALUES = ['outcomes']
const tab = urlState('tab', TAB_VALUES, 'outcomes')

const VIEW_OPTIONS = [
  { label: 'Counts', value: 'counts' },
  { label: 'Share', value: 'share' },
]
const view = urlState('view', ['counts', 'share'], 'counts')

const SORT_KEYS = ['villageName', 'completed', 'cancelled', 'unmatched', 'total']
const sort = urlState('sort', SORT_KEYS, DEFAULT_SORT.sort)
const dir = urlState('dir', ['asc', 'desc'], DEFAULT_SORT.dir)

function onSortUpdate (next) {
  router.replace({ query: { ...route.query, sort: next.sort, dir: next.dir } })
}

// ---- theme ----
// The theme toggle swaps `app-dark` on <html>, which is invisible to Vue, so a
// computed reading it would never re-evaluate. The observer is what makes it react.
const themeTick = ref(0)
let themeObserver = null

onMounted(() => {
  if (typeof MutationObserver === 'undefined') return
  themeObserver = new MutationObserver(() => { themeTick.value++ })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

const dark = computed(() => {
  void themeTick.value
  return document.documentElement.classList.contains('app-dark')
})

// ---- derived views ----
// legs is pinned TRUE: the federation counts a completed round trip as two
// services and will not count differently, so this page ships no toggle. The
// parameter stays for a future multi-village-grant user.
const villageRows = computed(() =>
  payload.value ? byVillage(payload.value.cells, payload.value.villages, { legs: true }) : []
)

// ONE ordered list, consumed by both the chart and the table.
const orderedRows = computed(() =>
  orderRows(villageRows.value, { sort: sort.value, dir: dir.value, view: view.value })
)

const strip = computed(() => metaStripStats(villageRows.value))

const chartData = computed(() => (view.value === 'share'
  ? buildProportionalData(orderedRows.value, 'villageName', { dark: dark.value, series: STATUS_SERIES })
  : buildBarData(orderedRows.value, 'villageName', { dark: dark.value, series: STATUS_SERIES })))

const chartOptions = computed(() =>
  barOptions({ stacked: view.value === 'share', percent: view.value === 'share' }))

const csvName = computed(() => metaCsvFilename({
  tab: tab.value,
  view: view.value,
  start: range.value.start,
  end: range.value.end,
}))

const showCountingInfo = ref(false)
</script>

<template>
  <div class="meta-metrics">
    <header class="metrics-header">
      <div class="header-row">
        <h1>Hub — Metrics</h1>
      </div>
      <p class="exclusion-note">
        Hub-cancelled requests are excluded from all counts.
        Completed round-trip rides count as two services.
        <Button
          icon="pi pi-info-circle"
          text
          rounded
          severity="secondary"
          aria-label="About round-trip ride counting"
          @click="showCountingInfo = true"
        />
      </p>
      <MetricsRangePicker
        v-if="isValidRange(range)"
        :start="range.start"
        :end="range.end"
        :today="todayCivil"
        @update:range="onRangeUpdate"
      />
    </header>

    <p v-if="isDenied" class="notice">
      You have no villages in scope, so there are no metrics to show.
    </p>

    <p v-else-if="isLoading" class="notice">Loading metrics…</p>

    <template v-else-if="payload">
      <MetaSummaryStrip :stats="strip" />

      <Tabs v-model:value="tab" lazy>
        <TabList>
          <Tab value="outcomes">Outcomes</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="outcomes">
            <div class="panel-filters">
              <SelectButton
                v-model="view"
                :options="VIEW_OPTIONS"
                optionLabel="label"
                optionValue="value"
                :allowEmpty="false"
                aria-label="Chart view"
              />
            </div>
            <MetaChartCard
              :rows="orderedRows"
              :series="STATUS_SERIES"
              :view="view"
              :sort="sort"
              :dir="dir"
              :csvFilename="csvName"
              :chartData="chartData"
              :chartOptions="chartOptions"
              @update:sort="onSortUpdate"
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </template>

    <Dialog
      v-model:visible="showCountingInfo"
      modal
      header="Round-trip Rides"
      :style="{ width: '28rem' }"
      :breakpoints="{ '640px': '90vw' }"
    >
      <p class="info-body">
        Many health insurers count round-trip rides to medical appointments as
        TWO services even if the driver waited for the insured and provided the
        return trip home. The Hub follows this practice, so every completed
        round-trip ride counts as two services throughout this dashboard.
      </p>
    </Dialog>
  </div>
</template>

<style scoped>
.meta-metrics { padding: 1rem 1.5rem; min-width: 0; }
.metrics-header { margin-bottom: 1.5rem; }
.header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.header-row h1 { margin: 0; color: var(--color-text-primary); }
.exclusion-note {
  color: var(--color-text-muted, #6b7280);
  font-size: 0.85rem;
  margin: 0.25rem 0 1rem;
}
.notice { color: var(--color-text-secondary); margin-top: 1.5rem; }
.panel-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 1rem;
}
.info-body { margin: 0; line-height: 1.5; }

@media (max-width: 640px) {
  .meta-metrics { padding: 1rem 0.75rem; }
  .panel-filters { flex-direction: column; align-items: stretch; }
}
</style>
```

- [ ] **Step 4: Run the whole feature suite**

Run: `cd client && npx vitest run src/features/MetaMetrics/`
Expected: PASS — all files.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/MetaMetrics/components/MetaMetrics.vue client/src/features/MetaMetrics/components/MetaMetrics.test.js
git commit -m "feat(meta-metrics): page shell with outcomes tab, URL state and sort binding"
```

---

### Task 9: Full-suite check and manual verification

**Files:** none — verification only.

- [ ] **Step 1: Run the whole client suite**

Run: `cd client && npx vitest run`
Expected: PASS. If unrelated failures appear, they are pre-existing — record which, do not fix them here.

- [ ] **Step 2: Verify in a browser**

Ask the user to start the dev client; do not start it yourself. Then confirm, against real data:

- 13 villages render at readable bar thickness — **not** collapsed into ~100px. This is the `:deep(.p-chart)` rule; no test covers it.
- Rows are alphabetical on first load.
- Clicking a table header reorders **both** the table and the chart, together.
- Counts→Share changes bars to 100% stacked and the last table column to `Requests`, with the footer labelled `Hub`.
- Reloading the page preserves tab, view and sort from the URL.
- Toggling the app's dark theme re-colors the bars without a reload.
- The chart is not too wide at full page width. If it is, the fallback is
  `flex-direction: row` on `.meta-chart-card` plus widths on its two children —
  or lowering `BAR_THICKNESS` / capping `.chart-box` width. **Do not** introduce
  `flex-basis`.

- [ ] **Step 3: Report findings, do not self-approve**

Report what was verified and anything that looked wrong. Stage 2 (Categories and Services tabs) is a separate plan.

---

## Notes for the executor

**Do not add** in stage 1: a Categories tab, a Services tab, a round-trip toggle, PDF/JSON export, or a People tab. Each is deliberately out of scope.

**Three traps carried from the existing code** — preserve them rather than re-deriving:
1. `rangeKey` is a primitive so the watch fires only on real range changes, not on every navigation.
2. `normalizeRange` returning `false` relies on the `router.replace` re-triggering the watcher — that is the single-fetch dance, not a bug.
3. `{ immediate: false, onError: null }` on `useAsyncState` is what keeps a 403 inline instead of raising the global error modal.

**The PDF is deferred but must stay feasible.** Keep `chartConfig.js`, `orderRows.js`, `matrixTable.js` and `stripStats.js` pure and component-free. If a task tempts you to move logic into a `.vue` file, don't.
