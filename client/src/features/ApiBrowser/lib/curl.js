/**
 * Build a copy-pasteable curl command for a resolved URL.
 *
 * Redaction is structural, not substitutive: this function never receives the
 * bearer token, so no code path can emit one. (The fragile alternative — build
 * with the real token then .replace(token, '$TOKEN') — fails if the token is
 * absent, is a substring of something else, or a refactor reorders the steps.)
 *
 * Quoting: $TOKEN sits in double quotes so the user's shell expands it, while
 * the URL is single-quoted so `&` between query params isn't backgrounded.
 *
 * @param {string} url
 * @param {{method?: string}} [options]
 * @returns {string}
 */
export function toCurl(url, { method = 'GET' } = {}) {
  const safeUrl = String(url).replace(/'/g, `'\\''`)
  return [
    `curl -X ${method}`,
    `  -H 'Accept: application/json'`,
    `  -H "Authorization: Bearer $TOKEN"`,
    `  '${safeUrl}'`,
  ].join(' \\\n')
}
