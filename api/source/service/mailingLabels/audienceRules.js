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
const AUDIENCE_RULES = {
  'roster': { memberOnly: false, requiresMonth: false },
  'printed-newsletter': { memberOnly: true, requiresMonth: false },
  'birthday-month': { memberOnly: false, requiresMonth: true },
  'join-month': { memberOnly: true, requiresMonth: true },
}

module.exports = { AUDIENCE_RULES }
