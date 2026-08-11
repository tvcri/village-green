export function tokenExpired(bufferMs = 5000) {
  const exp = VG.oidcWorker?.tokenParsed?.exp
  if (!exp) return true
  return Date.now() >= exp * 1000 - bufferMs
}

export function reloadIfExpired() {
  if (!tokenExpired()) return false
  if (VG.oidcWorker?.isLoggingOut) {
    // During logout an absent token is the intended state, not staleness.
    // A reload issued here would race the pending end-session navigation.
    // Tripwire: if this warning ever coincides with logout bouncing back to
    // the app, it confirms the fetch-during-logout branch of the 2026-08-11
    // logout-bounce investigation. Keep the stack.
    console.warn('[auth] reload suppressed: token absent because logout is in progress\n',
      new Error('caller').stack)
    return true // page is going away; caller should not proceed
  }
  window.location.reload()
  return true
}
