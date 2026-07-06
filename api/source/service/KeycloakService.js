'use strict'

const config = require('../utils/config')

function parseAuthority(authority) {
  const marker = '/realms/'
  const index = authority.indexOf(marker)
  if (index === -1) {
    throw new Error(`Cannot parse Keycloak base URL/realm from authority: ${authority}`)
  }
  return {
    baseUrl: authority.slice(0, index),
    realm: authority.slice(index + marker.length)
  }
}

function buildCreateUserPayload({ username, email, firstName, lastName }) {
  const payload = {
    username,
    email,
    enabled: true,
    emailVerified: true
  }
  if (firstName) payload.firstName = firstName
  if (lastName) payload.lastName = lastName
  return payload
}

module.exports = {
  parseAuthority,
  buildCreateUserPayload
}
