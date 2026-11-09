'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const svc = require('../service/KeycloakService')

test('parseAuthority splits base URL and realm on /realms/', () => {
  assert.deepEqual(
    svc.parseAuthority('http://localhost:8080/realms/vg'),
    { baseUrl: 'http://localhost:8080', realm: 'vg' }
  )
})

test('parseAuthority handles the legacy /auth prefix variant', () => {
  assert.deepEqual(
    svc.parseAuthority('http://localhost:8080/auth/realms/vg'),
    { baseUrl: 'http://localhost:8080/auth', realm: 'vg' }
  )
})

test('parseAuthority handles a realm name containing no further slashes', () => {
  assert.deepEqual(
    svc.parseAuthority('https://id.example.org/realms/village-green'),
    { baseUrl: 'https://id.example.org', realm: 'village-green' }
  )
})

test('parseAuthority throws if authority has no /realms/ segment', () => {
  assert.throws(() => svc.parseAuthority('http://localhost:8080/nope/vg'))
})

test('buildCreateUserPayload sets required fields with emailVerified true, no requiredActions', () => {
  assert.deepEqual(
    svc.buildCreateUserPayload({ username: 'jane@example.com', email: 'jane@example.com' }),
    {
      username: 'jane@example.com',
      email: 'jane@example.com',
      enabled: true,
      emailVerified: true
    }
  )
})

test('buildCreateUserPayload includes firstName/lastName only when provided', () => {
  assert.deepEqual(
    svc.buildCreateUserPayload({ username: 'jane@example.com', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' }),
    {
      username: 'jane@example.com',
      email: 'jane@example.com',
      enabled: true,
      emailVerified: true,
      firstName: 'Jane',
      lastName: 'Doe'
    }
  )
})

test('buildCreateUserPayload omits firstName when only lastName is provided', () => {
  const payload = svc.buildCreateUserPayload({ username: 'jane@example.com', email: 'jane@example.com', lastName: 'Doe' })
  assert.equal('firstName' in payload, false)
  assert.equal(payload.lastName, 'Doe')
})

test('KeycloakService exports findUserByUsername, updateUsername, and deleteUser', () => {
  assert.equal(typeof svc.findUserByUsername, 'function')
  assert.equal(typeof svc.updateUsername, 'function')
  assert.equal(typeof svc.deleteUser, 'function')
})

test('buildResetPasswordPayload marks the password temporary', () => {
  assert.deepEqual(svc.buildResetPasswordPayload('s3cret'), {
    type: 'password',
    value: 's3cret',
    temporary: true
  })
})

// Keycloak's default user profile runs person-name-prohibited-characters and
// length max 255 on firstName/lastName (26.6.3 source). The names are display
// only, so buildCreateUserPayload cleans them rather than letting Keycloak
// reject the account (VG-202611-518: a parenthesized nickname blocked enrollment).
const payloadFor = (firstName, lastName) =>
  svc.buildCreateUserPayload({ username: 'v@example.com', email: 'v@example.com', firstName, lastName })

test('buildCreateUserPayload drops a parenthesized nickname', () => {
  assert.equal(payloadFor('Robert (Bob)', 'Example').firstName, 'Robert')
})

test('buildCreateUserPayload removes every Keycloak-prohibited character', () => {
  const prohibited = '<>&"$%!#?§;*~/\\|^=[]{}'
  assert.equal(payloadFor(`Jo${prohibited}an`).firstName, 'Joan')
})

test('buildCreateUserPayload removes control and line-break characters', () => {
  assert.equal(payloadFor('Ann\tMarie\n\u0085\u2028\u2029\u007F').firstName, 'Ann Marie')
})

test('buildCreateUserPayload leaves allowed punctuation and accents alone', () => {
  const p = payloadFor('José', "O'Brien-Smith Jr.")
  assert.equal(p.firstName, 'José')
  assert.equal(p.lastName, "O'Brien-Smith Jr.")
})

test('buildCreateUserPayload collapses and trims whitespace', () => {
  assert.equal(payloadFor('  Jane   (Janie)   Ann ').firstName, 'Jane Ann')
})

test('buildCreateUserPayload truncates to 255 characters', () => {
  assert.equal(payloadFor('A'.repeat(300)).firstName.length, 255)
})

test('buildCreateUserPayload does not split a surrogate pair when truncating', () => {
  const name = 'A'.repeat(254) + '\u{1F600}'
  const first = payloadFor(name).firstName
  assert.equal(first, 'A'.repeat(254))
})

test('buildCreateUserPayload omits a name that cleans to nothing', () => {
  const p = payloadFor('(Bob)', '   ')
  assert.equal('firstName' in p, false)
  assert.equal('lastName' in p, false)
})
