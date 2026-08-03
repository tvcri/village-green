// @vitest-environment node
import { it, expect } from 'vitest'
import { scanSfc } from './scan.js'

const FIXTURE = `
<template>
  <div class="used-class"><span :class="{ 'toggled-class': isOn }">x</span></div>
</template>
<style scoped>
.used-class { color: red; }
.toggled-class { font-weight: bold; }
.dead-class { color: blue; }
.used-class .also-dead { margin: 0; }
</style>`

it('flags selectors whose class parts never appear in the template', () => {
  const result = scanSfc(FIXTURE, 'Fixture.vue')
  const dead = result.candidates.map(c => c.selector)
  expect(dead).toContain('.dead-class')
  expect(dead).toContain('.used-class .also-dead')
  expect(dead).not.toContain('.used-class')
  expect(dead).not.toContain('.toggled-class') // object :class binding counts as usage
})

const DEEP_FIXTURE = `
<template>
  <div class="wrapper"><input /></div>
</template>
<style scoped>
.wrapper { padding: 1rem; }
.wrapper :deep(.p-inputtext) { width: 100%; }
:deep(.p-dialog) { max-width: 40rem; }
</style>`

it('classifies :deep() selectors as the deep zone, not a plain candidate', () => {
  const result = scanSfc(DEEP_FIXTURE, 'Deep.vue')
  const deepEntry = result.candidates.find(c => c.selector === '.wrapper :deep(.p-inputtext)')
  expect(deepEntry).toBeDefined()
  expect(deepEntry.classification).toBe('deep')
})

it('classifies :deep() selectors targeting teleported PrimeVue overlay content as the teleport zone', () => {
  const result = scanSfc(DEEP_FIXTURE, 'Deep.vue')
  const teleportEntry = result.candidates.find(c => c.selector === ':deep(.p-dialog)')
  expect(teleportEntry).toBeDefined()
  expect(teleportEntry.classification).toBe('teleport')
})
