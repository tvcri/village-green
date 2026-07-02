import { beforeEach, describe, expect, it } from 'vitest'

describe('usePrivacyAck', () => {
  beforeEach(() => {
    globalThis.VG = { curUser: { privacyStatus: { needsAck: true, pendingRulesId: 7 } } }
  })

  it('seeds needsAck and pendingRulesId from VG.curUser on first import', async () => {
    const { usePrivacyAck } = await import('./usePrivacyAck.js')
    const { needsAck, pendingRulesId } = usePrivacyAck()
    expect(needsAck.value).toBe(true)
    expect(pendingRulesId.value).toBe(7)
  })

  it('clearAck() sets needsAck false', async () => {
    const { usePrivacyAck } = await import('./usePrivacyAck.js')
    const { needsAck, clearAck } = usePrivacyAck()
    clearAck()
    expect(needsAck.value).toBe(false)
  })

  it('requireAck(rulesId) sets needsAck true and updates pendingRulesId; shared across calls', async () => {
    const { usePrivacyAck } = await import('./usePrivacyAck.js')
    const a = usePrivacyAck()
    a.clearAck()
    const b = usePrivacyAck()
    b.requireAck(42)
    // same singleton refs → a sees b's change
    expect(a.needsAck.value).toBe(true)
    expect(a.pendingRulesId.value).toBe(42)
  })
})
