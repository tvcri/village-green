'use strict'

// Single source of truth for the per-audience parameter rules, shared by the
// 422 validator (validateLabelParams) and the query builder's
// defense-in-depth throws (buildQuery) so the two layers cannot drift.
// Adding an audience means adding one row here plus its predicate in
// buildQuery's switch — nothing else.
//
// memberOnly: the audience reads member columns through the m alias, so it
// exists only for role=member. requiresMonth: the audience filters on a
// month and is meaningless without one (and month is rejected without it).
// allowsDonors: the audience accepts role=donor and role=all. Only the full
// roster does; the other audiences filter on member or person columns that a
// donor-only recipient may not have a meaningful value for.
const AUDIENCE_RULES = {
  'roster': { memberOnly: false, requiresMonth: false, allowsDonors: true },
  'printed-newsletter': { memberOnly: true, requiresMonth: false, allowsDonors: false },
  'birthday-month': { memberOnly: false, requiresMonth: true, allowsDonors: false },
  'join-month': { memberOnly: true, requiresMonth: true, allowsDonors: false },
}

// Roles that bring donors into the recipient set (and so accept a last-gift
// window).
const DONOR_ROLES = new Set(['donor', 'all'])

module.exports = { AUDIENCE_RULES, DONOR_ROLES }
