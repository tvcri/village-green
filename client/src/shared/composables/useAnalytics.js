import { postAnalyticsEvents } from '../api/analyticsApi.js'

const queue = []
let flushTimer = null
const FLUSH_INTERVAL_MS = 5000
const FLUSH_BATCH_SIZE = 10

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!queue.length) return
  const batch = queue.splice(0, queue.length)
  try {
    await postAnalyticsEvents(batch)
  }
  catch {
    // silently swallow — analytics must never interrupt the user
  }
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
}

function enqueue(event) {
  queue.push(event)
  if (queue.length >= FLUSH_BATCH_SIZE) {
    flush()
  }
  else {
    scheduleFlush()
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (queue.length && navigator.sendBeacon) {
        const batch = queue.splice(0, queue.length)
        const blob = new Blob([JSON.stringify(batch)], { type: 'application/json' })
        const base = typeof VG !== 'undefined' && VG.Env?.pathPrefix
          ? `${window.location.origin}${VG.Env.pathPrefix}api`
          : `${window.location.origin}/api`
        navigator.sendBeacon(`${base}/op/analytics/events`, blob)
      }
      else {
        flush()
      }
    }
  })
}

export function useAnalytics() {
  function trackPageView(route) {
    enqueue({
      eventType: 'page_view',
      routeName: route.name ?? null,
      path: route.path ?? null,
      eventName: null,
      metadata: null,
    })
  }

  function trackEvent(eventName, metadata = null) {
    enqueue({
      eventType: 'interaction',
      routeName: null,
      path: null,
      eventName,
      metadata,
    })
  }

  return { trackPageView, trackEvent }
}
