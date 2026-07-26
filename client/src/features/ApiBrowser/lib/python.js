/**
 * Build a copy-pasteable Python snippet for a resolved URL.
 *
 * `requests`, not httpx or stdlib urllib: every Jupyter distribution ships it
 * preinstalled, and it is what tutorials, Stack Overflow and LLM assistants
 * all produce — so the snippet matches everything else the reader encounters.
 *
 * Redaction is structural, exactly as in toCurl: this function never receives
 * the bearer token, so no code path can emit one. The snippet reads it from
 * the environment at runtime instead. Any future generator must keep this
 * shape — building with the real token and substituting it out afterward
 * fails if the token is absent, is a substring of something else, or a
 * refactor reorders the steps.
 *
 * @param {string} url
 * @param {{method?: string}} [options]
 * @returns {string}
 */
export function toPython(url, { method = 'GET' } = {}) {
  // The URL lands inside a double-quoted Python string. getUrlForOperation
  // percent-encodes, so neither character can reach us today — but this module
  // must not depend on a guarantee it cannot enforce itself.
  const safeUrl = String(url).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  // requests.get/.post read better than requests.request(method, ...), and
  // this browser is overwhelmingly GET.
  const fn = String(method).toLowerCase()
  return `import os
import requests

url = "${safeUrl}"
r = requests.${fn}(
    url,
    headers={
        "Accept": "application/json",
        "Authorization": f"Bearer {os.environ['VG_TOKEN']}",
    },
)
r.raise_for_status()
data = r.json()
# df = pd.json_normalize(data)  # if the response is a list of records
`
}
