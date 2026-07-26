import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A `pi pi-*` class that does not exist in PrimeIcons renders an empty box:
 * no console warning, no test failure, just a blank space where a glyph should
 * be. `pi-terminal` shipped that way here — it is not in PrimeIcons 7 — and
 * only became visible once it sat in a menu beside an icon that DID render,
 * misaligning the label.
 *
 * This reads the real stylesheet rather than hardcoding a name list, so it
 * covers every icon the feature uses today and any added later.
 */
const CSS_PATH = fileURLToPath(
  new URL('../../../../node_modules/primeicons/primeicons.css', import.meta.url),
)
const SOURCE_FILES = [
  '../components/TryItPanel.vue',
  '../components/ResponsePanel.vue',
  '../components/JsonTree.vue',
  '../components/JsonTreeToolbar.vue',
  '../components/OperationTable.vue',
  '../components/ApiBrowser.vue',
  '../components/ParamField.vue',
]

function definedIcons() {
  const css = readFileSync(CSS_PATH, 'utf8')
  return new Set(Array.from(css.matchAll(/\.(pi-[a-z0-9-]+):before/g), m => m[1]))
}

function usedIcons() {
  const found = new Map()
  for (const rel of SOURCE_FILES) {
    const path = fileURLToPath(new URL(rel, import.meta.url))
    const src = readFileSync(path, 'utf8')
    // Only real usages: `icon="pi pi-x"` / `icon: 'pi pi-x'` / :class bindings.
    for (const m of src.matchAll(/["'`]pi pi-([a-z0-9-]+)["'`]/g)) {
      found.set(`pi-${m[1]}`, rel)
    }
  }
  return found
}

describe('ApiBrowser PrimeIcons', () => {
  it('uses only icon classes that exist in the installed PrimeIcons', () => {
    const defined = definedIcons()
    // Guard the guard: if the regex ever stops matching the stylesheet, an
    // empty set would make every assertion below pass vacuously.
    expect(defined.size).toBeGreaterThan(100)
    expect(defined.has('pi-copy')).toBe(true)

    const used = usedIcons()
    expect(used.size).toBeGreaterThan(0)

    const missing = [...used].filter(([name]) => !defined.has(name))
    expect(missing).toEqual([])
  })

  it('rejects the specific class that regressed (pi-terminal is not real)', () => {
    expect(definedIcons().has('pi-terminal')).toBe(false)
  })
})
