/**
 * Device classification for analytics.
 *
 * Derived once per page load and stamped on every analytics event, so the
 * admin summary can report device mix per route.
 *
 * Only the derived class is stored — raw signals are deliberately not
 * persisted. See the design spec: the signal that would need correcting
 * (maxTouchPoints) is identical on an iPad and a touchscreen laptop, so
 * retaining it would not distinguish the rows it was meant to insure.
 */

const CLASSES = Object.freeze({
  mobile: 'mobile',
  tablet: 'tablet',
  desktop: 'desktop',
  unknown: 'unknown',
})

/**
 * Classify a navigator-like object.
 *
 * Order matters: authoritative signals are checked before inferential ones,
 * so the fragile MacIntel test only runs when nothing better resolved.
 *
 * MUST always return a member of CLASSES. An out-of-enum value fails API
 * request validation and rejects the entire event batch.
 *
 * @param {object|undefined} nav
 * @returns {'mobile'|'tablet'|'desktop'|'unknown'}
 */
export function deriveDeviceClass(nav) {
  if (!nav || typeof nav !== 'object') return CLASSES.unknown

  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : ''
  const uaMobile = nav.userAgentData?.mobile
  const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0
  const platform = typeof nav.platform === 'string' ? nav.platform : ''

  // 1. Client Hints, where implemented (Chromium). The browser telling us
  //    directly — not an inference.
  if (uaMobile === true) return CLASSES.mobile

  // 2. Phone user agents.
  if (/iPhone|iPod/.test(ua)) return CLASSES.mobile
  if (/Android/.test(ua) && /Mobile/.test(ua)) return CLASSES.mobile

  // 3. Tablet user agents. Android tablets omit the "Mobile" token.
  if (/iPad/.test(ua)) return CLASSES.tablet
  if (/Android/.test(ua)) return CLASSES.tablet

  // 4. iPadOS Safari reports as a desktop Macintosh and its UA contains no
  //    "iPad". A genuine Mac reports maxTouchPoints 0. The platform guard
  //    keeps touchscreen Windows laptops out of the tablet bucket.
  if (platform === 'MacIntel' && touchPoints > 1) return CLASSES.tablet

  // 5. Desktop, either by Client Hints or by a recognized desktop UA.
  if (uaMobile === false) return CLASSES.desktop
  if (/Macintosh|Windows|Linux|CrOS|X11/.test(ua)) return CLASSES.desktop

  // 6. Nothing resolved. Deliberately named rather than silently bucketed.
  return CLASSES.unknown
}

/**
 * Computed once at module load. Device class cannot change within a page
 * load, so there is no reason to recompute per event.
 *
 * Guarded for environments without a navigator (SSR, bare test runners) —
 * this runs at import time and a throw would break every module that
 * transitively imports the analytics chain.
 */
export const deviceClass = deriveDeviceClass(
  typeof navigator !== 'undefined' ? navigator : undefined
)
