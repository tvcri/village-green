// Contact-field variety for the person rows: the fields the LGL sync compares
// (names, address, email, phones) should not be uniform. Production has many
// people with no landline, some with no cell or email, a share with a
// nickname or a unit, and a few living out of state. Every number and email
// here is invented: phones use the 555 exchange, emails the .test TLD.
//
// Runs on its own RNG stream (see data.js), so adding it did not reshuffle
// the figures, villages or requests that the main stream produces.

const NICKNAMES = {
  Abigail: ['Abby'], Albert: ['Al', 'Bert'], Ann: ['Annie'], Anne: ['Annie', 'Nan'],
  Benjamin: ['Ben'], Catherine: ['Kate', 'Kitty'], Charles: ['Charlie', 'Chuck'],
  Christopher: ['Chris', 'Kit'], Daniel: ['Dan'], Dorothy: ['Dot', 'Dottie'],
  Edward: ['Ed', 'Ned'], Elizabeth: ['Betsy', 'Liz', 'Beth'], Ezekiel: ['Zeke'],
  Frederick: ['Fred'], Gilbert: ['Gil'], Henry: ['Hank', 'Harry'], James: ['Jim', 'Jimmy'],
  John: ['Jack'], Jonathan: ['Jon'], Joseph: ['Joe'], Katherine: ['Kate'],
  Margaret: ['Peggy', 'Maggie'], Mary: ['Molly', 'Polly'], Matthew: ['Matt'],
  Michael: ['Mike'], Moses: ['Mo'], Nathanael: ['Nate'], Nathaniel: ['Nate'],
  Oliver: ['Ollie'], Patricia: ['Pat'], Peter: ['Pete'], Richard: ['Dick', 'Rick'],
  Robert: ['Bob', 'Rob'], Samuel: ['Sam'], Sarah: ['Sally'], Stephen: ['Steve'],
  Susan: ['Sue'], Theodore: ['Ted'], Thomas: ['Tom'], William: ['Bill', 'Will'],
}

// Neighboring towns just over the line, for the few people who live out of
// state. town (the municipality) follows the mailing city, as it does for RI.
const OUT_OF_STATE = [
  { city: 'Seekonk', state: 'MA', zip: '02771' },
  { city: 'Attleboro', state: 'MA', zip: '02703' },
  { city: 'Fall River', state: 'MA', zip: '02720' },
  { city: 'Stonington', state: 'CT', zip: '06378' },
  { city: 'Putnam', state: 'CT', zip: '06260' },
]

// Phones, nicknames, units and out-of-state addresses. Runs right after the
// persons builder so service requests copy the final home phone and address.
// Out-of-state addresses go only to people who are not members: a member's
// home address is a request's pickup point, and the request builder writes
// RI as its state.
export function applyContactVariety (plan, rng) {
  const memberIds = new Set(Object.values(plan.byVillage).flatMap(v => v.members))
  const phoneNo = (area) => `${area}-555-${String(rng.int(1000, 9999))}`
  for (const p of plan.person) {
    const kind = rng.weighted([['cell', 40], ['both', 35], ['landline', 20], ['none', 5]])
    p.phone = kind === 'both' || kind === 'landline' ? phoneNo('401') : null
    p.cell = kind === 'both' || kind === 'cell' ? phoneNo(rng.bool(0.9) ? '401' : rng.pick(['508', '774', '860'])) : null

    if (!p.nickname && NICKNAMES[p.firstName] && rng.bool(0.35)) p.nickname = rng.pick(NICKNAMES[p.firstName])

    if (p.unit) p.unit = rng.pick([p.unit, `Unit ${rng.int(1, 40)}`, `#${rng.int(1, 12)}`, `Apt ${rng.int(1, 6)}${rng.pick(['A', 'B', 'C'])}`])
    else if (rng.bool(0.06)) p.unit = `Unit ${rng.int(1, 40)}`

    if (!memberIds.has(p.id) && rng.bool(0.08)) {
      const t = rng.pick(OUT_OF_STATE)
      p.city = t.city; p.town = t.city; p.state = t.state; p.zip = t.zip
    }
  }
}

// About 15% of people have no email. Runs after logins and plants exist, and
// leaves alone every address a login or a planted scenario depends on: a VSS
// login's username is its volunteer's email, and the duplicate-email plant is
// two people sharing one.
export function applyEmailGaps (ds, rng) {
  const keep = new Set(ds.user_data.map(u => u.username))
  if (ds.__meta?.plants?.duplicateEmail) keep.add(ds.__meta.plants.duplicateEmail.email)
  for (const p of ds.person) {
    if (p.email && !keep.has(p.email) && rng.bool(0.15)) p.email = null
  }
}
