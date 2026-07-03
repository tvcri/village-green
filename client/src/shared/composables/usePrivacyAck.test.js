import { describe, expect, it } from 'vitest'

describe('usePrivacyAck', () => {
  it('defaults to unblocked before bootstrap seeds it', async () => {
    const { usePrivacyAck } = await import('./usePrivacyAck.js')
    const { needsAck } = usePrivacyAck()
    expect(needsAck.value).toBe(false)
  })

  it('clearAck() sets needsAck false', async () => {
    const { usePrivacyAck } = await import('./usePrivacyAck.js')
    const { needsAck, clearAck } = usePrivacyAck()
    clearAck()
    expect(needsAck.value).toBe(false)
  })

  it('requireAck() sets needsAck true; shared across calls (singleton)', async () => {
    const { usePrivacyAck } = await import('./usePrivacyAck.js')
    const a = usePrivacyAck()
    a.clearAck()
    const b = usePrivacyAck()
    b.requireAck()
    // same singleton ref → a sees b's change
    expect(a.needsAck.value).toBe(true)
  })
})
