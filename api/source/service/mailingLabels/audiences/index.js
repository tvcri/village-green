'use strict'
const { queryRecipients } = require('./buildQuery')

// An audience defines WHO receives mail. Every audience query returns the
// same row shape, so the label generator never knows about members,
// volunteers, villages, or communities.
//
// Adding an audience is one row in the table below — no new file, no
// controller change, no client change, no OpenAPI change (the `audience`
// query parameter is a free-form string).
//
// Labels follow "Category - Qualifier" with a plain hyphen, and the array
// order is the order of the client's Select.
//
// printedNewsletter is bit(1) NULL — three-valued. Only an explicit 1
// qualifies: NULL means "never recorded", not "yes" (dev snapshot: 166 NULL,
// 469 zero among 818 active members).
const DEFINITIONS = [
  {
    id: 'printed-newsletter',
    label: 'Printed newsletter - All',
    description: 'Active members who have opted into the printed newsletter',
    role: 'member',
    predicates: ['m.printedNewsletter = 1'],
  },
  {
    id: 'barrington-newsletter-members',
    label: 'Printed newsletter - Barrington',
    description: 'Active members of Village Barrington who have opted into the printed newsletter',
    role: 'member',
    village: 'Barrington',
    predicates: ['m.printedNewsletter = 1'],
  },
  {
    id: 'bristol-warren-members',
    label: 'Members - Bristol-Warren',
    description: 'Active members of Village Bristol-Warren',
    role: 'member',
    village: 'Bristol-Warren',
  },
  {
    id: 'providence-members',
    label: 'Members - Providence',
    description: 'Active members of Village Providence',
    role: 'member',
    village: 'Providence',
  },
  {
    id: 'providence-volunteers',
    label: 'Volunteers - Providence',
    description: 'Active volunteers of Village Providence',
    role: 'volunteer',
    village: 'Providence',
  },
]

// Mailing labels are a federation-wide feature; no audience is village-scoped
// in the RBAC sense, so these constants are written once rather than per row.
const FEDERATION_DEFAULTS = { params: [], permission: 'person:read', scope: 'federation' }

// A definition supplying its own `query` keeps it — the escape hatch for a
// future audience that does not fit the village/role/predicate axes.
function buildAudience (definition) {
  const { role, village = null, predicates = [], query, ...rest } = definition
  return {
    ...FEDERATION_DEFAULTS,
    ...rest,
    query: query ?? (() => queryRecipients({ role, village, predicates })),
  }
}

const audiences = DEFINITIONS.map(buildAudience)
const byId = new Map(audiences.map(a => [a.id, a]))

function getAudience (id) {
  return byId.get(id)
}

function listAudiences () {
  return audiences
}

module.exports = { getAudience, listAudiences, buildAudience }
