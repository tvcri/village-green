/**
 * Is this form value "not supplied"?
 *
 * Critical: `false` and `0` are REAL values (elevate=false, after-seq=0), so a
 * truthiness check is wrong here. And an empty text input must OMIT the param
 * rather than send `?x=` — buildQueryString faithfully serializes '' and the
 * server's strict validator may treat empty differently from absent.
 *
 * @param {any} value
 * @returns {boolean}
 */
export function isOmitted(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/**
 * Reduce form values to the params object apiCall should receive.
 *
 * @param {Array<{name: string}>} descriptors
 * @param {object} values
 * @returns {object}
 */
export function toParams(descriptors, values) {
  const out = {}
  for (const descriptor of descriptors) {
    const value = values[descriptor.name]
    if (!isOmitted(value)) out[descriptor.name] = value
  }
  return out
}

/**
 * Blank form state. Defaults are shown as placeholders, never pre-filled —
 * pre-filling would send e.g. elevate=false on every request and misrepresent
 * the API's actual default behavior.
 *
 * @param {Array<{name: string}>} descriptors
 * @returns {object}
 */
export function initialValues(descriptors) {
  const out = {}
  for (const descriptor of descriptors) out[descriptor.name] = null
  return out
}
