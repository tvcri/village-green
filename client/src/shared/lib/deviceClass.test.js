// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { deriveDeviceClass } from './deviceClass.js'

// The project has no global vitest environment setting, so the pragma above
// is required — the deviceClass constant test needs a real navigator.

const VALID = ['mobile', 'tablet', 'desktop', 'unknown']

// Representative navigator shapes. userAgentData is present only on
// Chromium browsers; Safari and Firefox leave it undefined.
const NAVIGATORS = {
  androidPhoneChrome: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    userAgentData: { mobile: true },
    platform: 'Linux armv81',
    maxTouchPoints: 5,
  },
  androidTabletChrome: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    userAgentData: { mobile: false },
    platform: 'Linux aarch64',
    maxTouchPoints: 5,
  },
  iPhoneSafari: {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
  },
  // iPadOS Safari in its default desktop-site mode: the UA says Macintosh
  // and contains no "iPad". maxTouchPoints is the only tell.
  iPadOSSafariDesktopMode: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  },
  // iPad requesting the mobile site, or older iPadOS: UA does contain "iPad".
  iPadLegacyUA: {
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPad',
    maxTouchPoints: 5,
  },
  // A genuine Mac. Same platform string as iPadOS above; maxTouchPoints 0.
  macSafari: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  },
  windowsChrome: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    userAgentData: { mobile: false },
    platform: 'Win32',
    maxTouchPoints: 0,
  },
  // A Windows laptop with a touchscreen. Must NOT be called a tablet:
  // the MacIntel guard in step 4 is what prevents it.
  windowsTouchLaptop: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    userAgentData: { mobile: false },
    platform: 'Win32',
    maxTouchPoints: 10,
  },
  linuxFirefox: {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
  },
}

describe('deriveDeviceClass', () => {
  it('classifies an Android phone as mobile', () => {
    expect(deriveDeviceClass(NAVIGATORS.androidPhoneChrome)).toBe('mobile')
  })

  it('classifies an iPhone as mobile', () => {
    expect(deriveDeviceClass(NAVIGATORS.iPhoneSafari)).toBe('mobile')
  })

  it('classifies an Android tablet as tablet', () => {
    expect(deriveDeviceClass(NAVIGATORS.androidTabletChrome)).toBe('tablet')
  })

  it('classifies an iPad with a legacy UA as tablet', () => {
    expect(deriveDeviceClass(NAVIGATORS.iPadLegacyUA)).toBe('tablet')
  })

  it('classifies iPadOS Safari in desktop mode as tablet', () => {
    expect(deriveDeviceClass(NAVIGATORS.iPadOSSafariDesktopMode)).toBe('tablet')
  })

  // The counterpart to the test above: same platform string, no touch.
  it('classifies a genuine Mac as desktop', () => {
    expect(deriveDeviceClass(NAVIGATORS.macSafari)).toBe('desktop')
  })

  it('classifies Windows Chrome as desktop', () => {
    expect(deriveDeviceClass(NAVIGATORS.windowsChrome)).toBe('desktop')
  })

  it('classifies a Windows touchscreen laptop as desktop, not tablet', () => {
    expect(deriveDeviceClass(NAVIGATORS.windowsTouchLaptop)).toBe('desktop')
  })

  it('classifies Linux Firefox as desktop', () => {
    expect(deriveDeviceClass(NAVIGATORS.linuxFirefox)).toBe('desktop')
  })

  it('returns unknown when navigator is undefined', () => {
    expect(deriveDeviceClass(undefined)).toBe('unknown')
  })

  it('returns unknown for an empty navigator', () => {
    expect(deriveDeviceClass({})).toBe('unknown')
  })

  it('does not throw on a partial navigator missing userAgent', () => {
    expect(() => deriveDeviceClass({ maxTouchPoints: 5 })).not.toThrow()
  })

  // Guards the global constraint: an out-of-enum value would 400 the whole
  // event batch, and the failure would be silent.
  it('always returns a value in the closed set', () => {
    for (const nav of Object.values(NAVIGATORS)) {
      expect(VALID).toContain(deriveDeviceClass(nav))
    }
    expect(VALID).toContain(deriveDeviceClass(undefined))
    expect(VALID).toContain(deriveDeviceClass({}))
    expect(VALID).toContain(deriveDeviceClass({ userAgent: 'nonsense' }))
  })
})

describe('deviceClass constant', () => {
  it('is a valid class under jsdom', async () => {
    const { deviceClass } = await import('./deviceClass.js')
    expect(VALID).toContain(deviceClass)
  })
})
