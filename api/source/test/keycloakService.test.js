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

test('KeycloakService exports findUserByUsername and updateUsername', () => {
  assert.equal(typeof svc.findUserByUsername, 'function')
  assert.equal(typeof svc.updateUsername, 'function')
})
