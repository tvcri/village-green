// The phone column may arrive as an object or a JSON string.
export function parsePhoneObj (val) {
  if (val && typeof val === 'object') return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return {} }
  }
  return {}
}
