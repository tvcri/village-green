#!/usr/bin/env node
// CSS audit scanner core (css-audit charter, scratch/superpowers/specs/2026-08-01-css-audit-charter.md).
//
// scanSfc(source, filename) parses a single Vue SFC's `<style scoped>` block,
// enumerates selectors, splits them into class/id parts, and checks each part
// for usage in the SAME file's <template> (static class=, :class bindings,
// pt/*-class props) and <script> block (string literals). A selector with any
// unmatched required part becomes a `candidate`. Selectors matching one of the
// charter's declared false-positive zones are classified into that zone
// instead of left as a plain `candidate` (zones are classifications, not
// verdicts — a human still checks them against the charter's method).
//
// CLI: node scan.js <file.vue|dir> — prints candidates per file.

import { readFileSync, statSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import postcss from 'postcss'

// ---- SFC block extraction -------------------------------------------------

// Vue templates commonly contain nested named `<template #slot>...</template>`
// blocks (PrimeVue #title/#content/#body slots are everywhere in this
// codebase). A naive non-greedy regex for the outer <template> stops at the
// FIRST </template> it sees — usually one of those inner slot blocks — and
// silently truncates the scan to a few lines. Track nesting depth instead so
// the whole SFC template (including every nested named slot) is captured.
function extractOuterTemplate (source) {
  const openMatch = source.match(/<template(?:\s[^>]*)?>/)
  if (!openMatch) return ''
  const tagRe = /<template(?:\s[^>]*)?>|<\/template>/g
  tagRe.lastIndex = openMatch.index + openMatch[0].length
  const contentStart = tagRe.lastIndex
  let depth = 1
  let m
  while ((m = tagRe.exec(source))) {
    if (m[0] === '</template>') {
      depth--
      if (depth === 0) return source.slice(contentStart, m.index)
    } else {
      depth++
    }
  }
  return source.slice(contentStart) // unterminated — best effort
}

function extractBlocks (source) {
  const styleMatches = [...source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)]
  const scriptMatches = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  return {
    template: extractOuterTemplate(source),
    // Only scoped style blocks are in-scope for this audit (charter's surface
    // is `<style scoped>`); non-scoped blocks are skipped entirely.
    styles: styleMatches
      .filter(m => /\bscoped\b/.test(m[1]))
      .map(m => m[2]),
    scripts: scriptMatches.map(m => m[2]).join('\n'),
  }
}

// ---- Template usage extraction ---------------------------------------------

// Collect every class/id "name" (without leading . or #) that the template
// could plausibly render, from all the sources the charter's method §2 lists.
function collectTemplateUsedNames (template) {
  const used = new Set()

  // Static class="..." attributes (also :class="'literal literal2'").
  for (const m of template.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c))
  }
  for (const m of template.matchAll(/\bclass\s*=\s*'([^']*)'/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c))
  }

  // :class bindings — object / array / ternary / computed forms. We don't
  // evaluate expressions; we grep every quoted string literal that appears
  // inside a :class="..." (or v-bind:class="...") binding, since object keys,
  // array entries, and ternary branches are all quoted string literals in
  // every common authoring style.
  for (const m of template.matchAll(/:class\s*=\s*"([^"]*)"/g)) {
    extractQuotedLiterals(m[1]).forEach(n => n.split(/\s+/).filter(Boolean).forEach(c => used.add(c)))
  }
  for (const m of template.matchAll(/v-bind:class\s*=\s*"([^"]*)"/g)) {
    extractQuotedLiterals(m[1]).forEach(n => n.split(/\s+/).filter(Boolean).forEach(c => used.add(c)))
  }

  // PrimeVue pt/passthrough props and *-class style props: pt="{ root: { class: 'x' } }",
  // input-class="foo", panelClass="foo bar", etc. Treat any attribute literal
  // whose name ends in -class/Class, or any `class:` key inside a pt object,
  // as a usage source — grep quoted literals from the whole template for
  // these attribute values specifically.
  for (const m of template.matchAll(/\b[\w-]*[Cc]lass\s*=\s*"([^"]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c))
  }
  for (const m of template.matchAll(/\bpt\s*=\s*"([^"]*)"/g)) {
    extractQuotedLiterals(m[1]).forEach(n => n.split(/\s+/).filter(Boolean).forEach(c => used.add(c)))
  }

  // id="..." / :id="..."
  for (const m of template.matchAll(/\bid\s*=\s*"([^"]*)"/g)) {
    used.add(m[1])
  }
  for (const m of template.matchAll(/:id\s*=\s*"([^"]*)"/g)) {
    extractQuotedLiterals(m[1]).forEach(n => used.add(n))
  }

  return used
}

function extractQuotedLiterals (expr) {
  const out = []
  for (const m of expr.matchAll(/'([^']*)'/g)) out.push(m[1])
  for (const m of expr.matchAll(/"([^"]*)"/g)) out.push(m[1])
  return out
}

// Script-block usage: classList.add/remove/toggle/contains('x'), querySelector
// forms, and generic string composition — grep every candidate name as a
// substring hit against the raw script text (conservative: over-matches to
// avoid false "dead" verdicts, per the charter's "never automatic deletion").
function scriptMayReference (script, name) {
  if (!script) return false
  // Any quoted occurrence of the exact class/id name anywhere in the script
  // block counts as a possible reference (classList, querySelector, template
  // strings, computed pt objects defined in <script setup>, etc.).
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`['"\`]${escaped}['"\`]|['"\`][^'"\`]*\\b${escaped}\\b[^'"\`]*['"\`]`)
  return re.test(script)
}

// ---- Selector parsing -------------------------------------------------------

// False-positive zone detection, syntactic only (charter's "Declared
// false-positive zones" section).
function classifySelector (selector) {
  if (/:deep\(/.test(selector)) return 'deep'
  if (/-enter-active|-leave-active|-enter-from|-enter-to|-leave-from|-leave-to|^\.v-enter|^\.v-leave/.test(selector)) {
    return 'transition'
  }
  return null // not a syntactic zone; caller may still classify via context (keyframe/teleport/media-only)
}

// Split a selector into simple parts across combinators, then pull class/id
// tokens out of each part. :deep(...) contents are extracted as their own
// part (still checked, but the whole selector is already zone-classified).
function splitSelectorParts (selector) {
  const parts = []
  // Extract :deep(...) inner selectors separately.
  const deepInner = [...selector.matchAll(/:deep\(([^)]*)\)/g)].map(m => m[1])
  const withoutDeep = selector.replace(/:deep\([^)]*\)/g, ' ')
  for (const piece of withoutDeep.split(/\s+/).filter(Boolean)) {
    parts.push(piece)
  }
  for (const piece of deepInner) {
    for (const sub of piece.split(/\s+/).filter(Boolean)) parts.push(sub)
  }
  return parts
}

// Pull class (.foo) and id (#foo) tokens out of one compound simple-selector
// piece (e.g. ".foo.bar:hover" -> ['foo','bar'] as class tokens).
function tokensFromPart (part) {
  const classes = [...part.matchAll(/\.([\w-]+)/g)].map(m => m[1])
  const ids = [...part.matchAll(/#([\w-]+)/g)].map(m => m[1])
  return { classes, ids }
}

// ---- Core scan ---------------------------------------------------------------

export function scanSfc (source, filename) {
  const { template, styles, scripts } = extractBlocks(source)
  const usedNames = collectTemplateUsedNames(template)
  const candidates = []

  for (const styleSrc of styles) {
    let root
    try {
      root = postcss.parse(styleSrc)
    } catch {
      continue // unparseable block (e.g. SCSS-only syntax) — skip, don't guess
    }

    root.walkRules(rule => {
      // @keyframes blocks parse as at-rules, not plain rules — walkRules
      // does not descend into them by selector text the same way, but guard
      // anyway in case of nested @media > rule.
      const parentAtRule = rule.parent && rule.parent.type === 'atrule' ? rule.parent.name : null
      const isMediaOnly = parentAtRule === 'media'

      for (const selector of rule.selector.split(',').map(s => s.trim()).filter(Boolean)) {
        const zone = classifySelector(selector)
        if (zone) {
          candidates.push({ selector, parts: [], reason: `zone:${zone}`, classification: zone })
          continue
        }

        const parts = splitSelectorParts(selector)
        const unmatched = []
        for (const part of parts) {
          const { classes, ids } = tokensFromPart(part)
          for (const c of classes) {
            if (!usedNames.has(c) && !scriptMayReference(scripts, c)) unmatched.push(`.${c}`)
          }
          for (const id of ids) {
            if (!usedNames.has(id) && !scriptMayReference(scripts, id)) unmatched.push(`#${id}`)
          }
        }

        if (unmatched.length === 0) continue // fully matched — not a candidate

        candidates.push({
          selector,
          parts: unmatched,
          reason: `unmatched: ${unmatched.join(', ')}`,
          classification: isMediaOnly ? 'media-only' : 'candidate',
        })
      }
    })

    // @keyframes names — classification only, not selector-shaped; recorded
    // separately so the report can cross-check `animation:` usage by hand.
    root.walkAtRules('keyframes', atRule => {
      candidates.push({
        selector: `@keyframes ${atRule.params}`,
        parts: [],
        reason: 'keyframe name — verify against animation: shorthand / JS',
        classification: 'keyframe',
      })
    })
  }

  return { file: filename, candidates }
}

// ---- CLI ---------------------------------------------------------------------

function walkVueFiles (target) {
  const st = statSync(target)
  if (st.isFile()) return extname(target) === '.vue' ? [target] : []
  const out = []
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = join(target, entry.name)
    if (entry.isDirectory()) out.push(...walkVueFiles(full))
    else if (entry.isFile() && extname(entry.name) === '.vue') out.push(full)
  }
  return out
}

function main () {
  const target = process.argv[2]
  if (!target) {
    console.error('usage: node scan.js <file.vue|dir>')
    process.exit(1)
  }
  const files = walkVueFiles(target)
  let totalCandidates = 0
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const { candidates } = scanSfc(source, file)
    if (candidates.length === 0) continue
    totalCandidates += candidates.length
    console.log(`\n${file}`)
    for (const c of candidates) {
      console.log(`  [${c.classification}] ${c.selector}  (${c.reason})`)
    }
  }
  console.log(`\n${files.length} file(s) scanned, ${totalCandidates} candidate(s) total.`)
}

// Only run the CLI when invoked directly (not when imported by the test file).
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
