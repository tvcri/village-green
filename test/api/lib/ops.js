// Spec-driven request helper: resolve path + method from the live OAS
// definition by operationId — the same contract the Vue client consumes
// (client/src/shared/api/apiClient.js resolves every call this way). Built on
// byte-identical vendored copies of the client's modules (see vendor/, kept in
// sync by tests/smoke/vendor-sync.test.js).
//
// When to use which helper:
//   - vgCall:  green/characterization tests. A path rename on main follows the
//     spec automatically; a removed operationId fails loudly.
//   - vgFetch: RED security probes (pin the literal URL so a spec rename can't
//     silently retarget a finding) and anything the spec can't express —
//     wrong-method probes, raw bodies (appdata JSONL), unencoded path segments.
import fs from 'node:fs'
import { config } from '../setup/env.js'
import { OpenApiOps } from './vendor/openApiOps.js'
import { vgFetch } from './client.js'

const API_BASE = `${config.api.baseUrl}/api`

let ops
try {
  const definition = JSON.parse(fs.readFileSync(config.paths.definitionFile, 'utf8'))
  ops = new OpenApiOps({ definition, apiBase: API_BASE })
} catch (e) {
  throw new Error(
    `Could not read ${config.paths.definitionFile}. Run the suite with \`npm test\` ` +
    `(node run.js), which captures the API's served definition. (${e.message})`,
  )
}

// The raw OpenApiOps instance, for spec introspection in tests:
// ops.operationMap, ops.getOperationIds(), ops.getProjectedUrls().
export { ops }

/**
 * Perform the request for an operationId. Path and query params go in ONE
 * `params` object; getUrl() substitutes path params and query-encodes the rest.
 *
 * @param {string} operationId  e.g. 'getVillage'
 * @param {object} params       path + query params, e.g. { villageId: 1, projection: ['owners'] }
 * @param {object} opts         vgFetch opts (token, body, rawBody, contentType);
 *                              `method` overrides the spec's (for negative probes)
 * @returns {Promise<{status:number, json:any, text:string, res:Response}>}
 */
export async function vgCall (operationId, params = {}, { method, ...opts } = {}) {
  const op = ops.operationMap.get(operationId)
  if (!op) throw new Error(`unknown operationId: ${operationId}`)
  // STRICT, unlike the client: getUrl() silently drops params the operation
  // doesn't declare — in a test, a typo'd param name would silently weaken the
  // assertion (e.g. an authz probe becomes an unfiltered request). Throw instead.
  const undeclared = Object.keys(params).filter(k => !op.params[k])
  if (undeclared.length) {
    throw new Error(`params not declared for ${operationId}: ${undeclared.join(', ')}`)
  }
  const path = ops.getUrl(operationId, params).slice(API_BASE.length)
  return vgFetch(path, { ...opts, method: method ?? op.method.toUpperCase() })
}
