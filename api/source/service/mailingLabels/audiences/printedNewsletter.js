'use strict'
const dbUtils = require('../../utils')

// Active members who explicitly opted into the printed newsletter.
//
// printedNewsletter is bit(1) NULL — three-valued. Only an explicit 1
// qualifies: NULL means "never recorded", not "yes" (dev snapshot: 166 NULL,
// 469 zero among 818 active members — this predicate excludes 635 real rows).
//
// person.fullName is generated "Last, First" — NOT label order; select the
// name parts. person.zip is stored unpadded and 95% of audience zips are
// short Vermont zips — LPAD is load-bearing.

async function query () {
  const sql = `
    SELECT
      p.firstName,
      p.lastName,
      p.street,
      p.unit,
      p.city,
      p.state,
      LPAD(p.zip, 5, '0') AS zip
    FROM person p
    INNER JOIN active_member m ON m.personId = p.id
    WHERE m.printedNewsletter = 1
  `
  const [rows] = await dbUtils.pool.query(sql)
  return rows
}

module.exports = {
  id: 'printed-newsletter',
  label: 'Members — printed newsletter',
  description: 'Active members who have opted into the printed newsletter',
  params: [],
  permission: 'person:read',
  scope: 'federation',
  query,
}
