// Mints JWTs for every canonical user plus a set of "special" tokens for the
// authentication/scope tests. Run in the orchestrator (where the mockOidc signing
// key lives) and serialized to .tokens.json for the test processes to read.
//
// The harness sets VG_JWT_AUD_VALUE (see setup/env.js), so every token here
// carries the matching aud claim — except the wrong/missing-audience specials,
// which exist to assert the rejection path.
import { users, scopes } from './fixtures.js'
import { config } from './env.js'

const AUD = config.oidc.audience

// Build a token payload by hand (for getCustomToken paths) matching VG's default
// claim layout: realm_access.roles (privileges), preferred_username, name, scope,
// jti — plus the enforced aud.
function payloadFor (user, scope) {
  return {
    jti: Math.random().toString(16).slice(2), // varies per token; value is irrelevant
    realm_access: { roles: user.privileges },
    preferred_username: user.username,
    name: user.name,
    scope,
    aud: AUD,
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
      audience: AUD,
      expiresIn: '1h',
    })
  }

  const fv1 = users.full_v1

  // Expired (exp in the past) -> 401 TokenExpiredError.
  tokens.special.expired = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.full, audience: AUD, expiresIn: -3600,
  })

  // Valid identity, read-only scope -> can GET, but POST/PATCH (write) -> 403.
  tokens.special.readOnly = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.readOnly, audience: AUD, expiresIn: '1h',
  })

  // Valid identity, no service-request scope at all -> GET /service-requests -> 403.
  tokens.special.noServiceRequestScope = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.noServiceRequest, audience: AUD, expiresIn: '1h',
  })

  // aud claim not matching VG_JWT_AUD_VALUE -> 401 JsonWebTokenError.
  tokens.special.wrongAudience = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.full,
    audience: 'not-village-green', expiresIn: '1h',
  })

  // No aud claim at all -> 401 under audience enforcement.
  tokens.special.missingAudience = oidc.getToken({
    username: fv1.username, name: fv1.name, privileges: [], scope: scopes.full, expiresIn: '1h',
  })

  // Foreign `iss` claim signed by the TRUSTED key. The API never validates iss
  // (jwt.verify gets no `issuer` option), so this token is accepted —
  // characterized in tests/auth/authentication.test.js.
  const [kid, { privateKey }] = oidc.keys.entries().next().value
  tokens.special.foreignIssuer = oidc.getCustomToken({
    payload: { ...payloadFor(fv1, scopes.full), iss: 'https://idp.evil.example' },
    privateKey,
    options: { algorithm: 'RS256', keyid: kid, expiresIn: '1h', allowInsecureKeySizes: true },
  })

  // Tampered signature -> 401 (kid valid, signature verification fails).
  // Flip the FIRST signature char, not the last: the first base64url char of the
  // signature always maps to significant bytes, so the decode reliably changes.
  // Flipping the LAST char is flaky — its trailing padding bits can decode to the
  // same bytes, leaving the signature valid (~1/16 of random signatures).
  const [h, p, s] = tokens.users.full_v1.split('.')
  tokens.special.badSignature = `${h}.${p}.${(s[0] === 'A' ? 'B' : 'A')}${s.slice(1)}`

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
