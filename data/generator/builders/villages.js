import { VILLAGES, ROLE } from '../constants.js'

// The dev login you type into the mock OIDC form (its `preferred_username`).
// This user is granted OWNER of every village below. Change it if you log in
// as someone else.
const ADMIN_LOGIN = 'admin'

// Build villages, demo login users, and their grants from content.people.loginPersonas
// plus a few synthesized per-village coordinators. Deterministic given rng.
export function buildVillagesAndUsers (content, rng) {
  const village = VILLAGES.map((v, i) => ({ id: i + 1, name: v.name }))
  const villageIdByName = Object.fromEntries(village.map(v => [v.name, v.id]))

  const user_data = []
  const village_grant = []
  let userId = 0
  const addUser = (username, claims) => {
    userId += 1
    user_data.push({ userId, username, lastClaims: JSON.stringify(claims || {}) })
    return userId
  }
  const grant = (uid, villageName, roleId) =>
    village_grant.push({ villageId: villageIdByName[villageName], userId: uid, roleId })

  // 1) System admin — admin privilege, NO grants (sees all via elevate).
  addUser('samuel.slater@millworks.test', { realm_access: { roles: ['admin'] } })

  // 1b) The dev login (the "admin" user you enter in the mock OIDC form) —
  // granted OWNER of every village so it shows up as an owner everywhere, not
  // just via admin/elevate.
  const adminUid = addUser(ADMIN_LOGIN, { realm_access: { roles: ['admin'] } })
  for (const v of village) grant(adminUid, v.name, ROLE.owner)

  // 2) An owner for each of the two big villages.
  grant(addUser('roger.williams@providence.test'), 'Arkham', ROLE.owner)
  grant(addUser('hp.lovecraft@miskatonic.test'), 'Arkham', ROLE.full)
  grant(addUser('peter.griffin@quahog.test'), 'Quahog', ROLE.owner)

  // 3) A multi-village regional coordinator (>= 3 villages -> meta roll-up).
  const coord = addUser('john.brown@brownbros.test')
  for (const v of ['Quahog', 'Innsmouth', 'Arkham']) grant(coord, v, ROLE.full)

  // 4) One of each remaining role somewhere.
  grant(addUser('nathanael.greene@newport.test'), 'Oldport', ROLE.manage)
  grant(addUser('gilbert.stuart@gmail.test'), 'Quahog', ROLE.restricted)

  // 5) A coordinator (full) for every other village so each has a steward.
  const stewards = {
    'New York System': 'ann.franklin@providence.test', Oldport: 'ida.lewis@lighthouse.test',
    Innsmouth: 'obed.marsh@innsmouth.test', Kingsport: 'richard.pickman@kingsport.test',
    Dunwich: 'wilbur.whateley@dunwich.test', Chipwhich: 'betty.bett@chepachet.test',
    Pawstuxnet: 'abraham.whipple@pawtuxet.test', Cabinet: 'roger.mowry@cabinet.test',
  }
  for (const [vname, username] of Object.entries(stewards)) grant(addUser(username), vname, ROLE.full)

  // 6) A zero-grants user (valid login, sees nothing).
  addUser('mr.calimari@quahog.test')

  return { village, user_data, village_grant, villageIdByName }
}
