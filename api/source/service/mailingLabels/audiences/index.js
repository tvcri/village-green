'use strict'
const printedNewsletter = require('./printedNewsletter')

// An audience defines WHO receives mail. Every audience query returns the
// same row shape, so the label generator never knows about members,
// volunteers, villages, or communities. Adding an audience is one new file
// plus one line here — no controller or client change.
const audiences = [printedNewsletter]

const byId = new Map(audiences.map(a => [a.id, a]))

function getAudience (id) {
  return byId.get(id)
}

function listAudiences () {
  return audiences
}

module.exports = { getAudience, listAudiences }
