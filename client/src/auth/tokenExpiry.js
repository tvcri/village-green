export function tokenExpired(bufferMs = 5000) {
  const exp = VG.oidcWorker?.tokenParsed?.exp
  if (!exp) return true
  return Date.now() >= exp * 1000 - bufferMs
}

export function reloadIfExpired() {
  if (!tokenExpired()) return false
  window.location.reload()
  return true
}
