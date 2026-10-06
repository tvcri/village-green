// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { render, cleanup } from '@testing-library/vue'

let leaveGuard
const confirmRequire = vi.fn()
vi.mock('vue-router', () => ({ onBeforeRouteLeave: (fn) => { leaveGuard = fn } }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))

import { useUnsavedChangesGuard } from './useUnsavedChangesGuard.js'

function mountWith (isDirty) {
  return render(defineComponent({ setup () { useUnsavedChangesGuard(isDirty); return () => h('div') } }))
}

beforeEach(() => { confirmRequire.mockReset(); globalThis.VG = {} })
afterEach(() => cleanup())

describe('useUnsavedChangesGuard', () => {
  it('lets a clean page leave without asking', async () => {
    mountWith(() => false)
    expect(await leaveGuard()).toBe(true)
    expect(confirmRequire).not.toHaveBeenCalled()
  })

  it('asks before leaving a dirty page and honours the answer', async () => {
    mountWith(() => true)
    const pending = leaveGuard()
    expect(confirmRequire).toHaveBeenCalledTimes(1)
    confirmRequire.mock.calls[0][0].reject()
    expect(await pending).toBe(false)
  })

  it('prompts on unload only while dirty and not navigating away for logout', () => {
    let dirty = true
    const w = mountWith(() => dirty)
    const ev = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    globalThis.VG.navigatingAway = true
    const ev2 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev2)
    expect(ev2.defaultPrevented).toBe(false)
    dirty = false
    globalThis.VG.navigatingAway = false
    const ev3 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev3)
    expect(ev3.defaultPrevented).toBe(false)
    w.unmount()
  })
})
