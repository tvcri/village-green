// Mints JWTs for every canonical user plus a set of "special" tokens for the
// authentication/scope tests. Run in the orchestrator (where the mockOidc signing
// key lives) and serialized to .tokens.json for the test processes to read.
import { users, scopes } from './fixtures.js'

// Build a token payload by hand (for getCustomToken paths) matching VG's default
// claim layout: realm_access.roles (privileges), preferred_username, name, scope, jti.
function payloadFor (user, scope) {
  return {
    jti: Math.random().toString(16).slice(2), // varies per token; value is irrelevant
    realm_access: { roles: user.privileges },
    preferred_username: user.username,
    name: user.name,
    scope,
  }
}

export function buildTokens (oidc) {
  const tokens = { users: {}, special: {} }

  for (const [role, u] of Object.entries(users)) {
    tokens.users[role] = oidc.getToken({
      username: u.username,
      name: u.name,
      privileges: u.privileges, // MUST pass explicitly — getToken defaults to ['create_collection','admin']
      scope: scopes.full,
      expiresIn: '1h',
    })
  }

  const fv1 = users.full_v1

  // Expired (exp in the past) -> 401 TokenExpiredError.
  tokens.special.expired = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.full, expiresIn: -3600,
  })

  // Valid identity, read-only scope -> can GET, but POST/PATCH (write) -> 403.
  tokens.special.readOnly = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.readOnly, expiresIn: '1h',
  })

  // Valid identity, no service-request scope at all -> GET /service-requests -> 403.
  tokens.special.noServiceRequestScope = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.noServiceRequest, expiresIn: '1h',
  })

  // Tampered signature -> 401 (kid valid, signature verification fails).
  const valid = tokens.users.full_v1
  const last = valid.slice(-1)
  tokens.special.badSignature = valid.slice(0, -1) + (last === 'A' ? 'B' : 'A')

  // Token signed with the known-insecure kid -> rejected pre-verify by the kid blocklist.
  // The insecure key is NOT added to the served JWKS, so the API still boots.
  const insecure = oidc.createInsecureKey()
  tokens.special.insecureKid = oidc.getCustomToken({
    payload: payloadFor(fv1, scopes.full),
    privateKey: insecure.privateKey,
    options: { algorithm: 'RS256', keyid: insecure.kid, expiresIn: '1h', allowInsecureKeySizes: true },
  })

  // A clearly non-JWT bearer value -> 401.
  tokens.special.notAJwt = 'this-is-not-a-jwt'

  return tokens
}
