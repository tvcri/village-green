import { VILLAGES, ROLE } from '../constants.js'

// The dev login you type into the mock OIDC form (its `preferred_username`).
// This user is granted OWNER of every village below. Change it if you log in
// as someone else.
const ADMIN_LOGIN = 'admin'

// Themed fill logins per village, consumed in order by the coverage pass in
// buildVillagesAndUsers (earlier names land the senior roles). Values are the
// `name` claim — the display name the app shows for request attribution.
const FILL_LOGINS = {
  Arkham: {
    'george.angell@miskatonic.test': 'George Gammell Angell',
    'william.dyer@miskatonic.test': 'William Dyer',
    'herbert.west@miskatonic.test': 'Herbert West',
    'francis.thurston@miskatonic.test': 'Francis Thurston',
    'nathaniel.peaslee@miskatonic.test': 'Nathaniel Peaslee',
    'walter.gilman@miskatonic.test': 'Walter Gilman',
    'charles.ward@miskatonic.test': 'Charles Dexter Ward',
    'joseph.curwen@miskatonic.test': 'Joseph Curwen',
    'keziah.mason@miskatonic.test': 'Keziah Mason',
    'asenath.waite@miskatonic.test': 'Asenath Waite',
  },
  Quahog: {
    'mayor.west@quahog.test': 'Mayor Adam West',
    'carter.pewterschmidt@quahog.test': 'Carter Pewterschmidt',
    'lois.griffin@quahog.test': 'Lois Griffin',
    'joe.swanson@quahog.test': 'Joe Swanson',
    'cleveland.brown@quahog.test': 'Cleveland Brown',
    'bonnie.swanson@quahog.test': 'Bonnie Swanson',
    'tom.tucker@quahog.test': 'Tom Tucker',
    'brian.griffin@quahog.test': 'Brian Griffin',
    'glenn.quagmire@quahog.test': 'Glenn Quagmire',
    'mort.goldman@quahog.test': 'Mort Goldman',
  },
  'New York System': {
    'buddy.cianci@providence.test': 'Buddy Cianci',
    'george.cohan@providence.test': 'George M. Cohan',
    'sissieretta.jones@providence.test': 'Sissieretta Jones',
    'nap.lajoie@providence.test': 'Nap Lajoie',
  },
  Oldport: {
    'alva.vanderbilt@newport.test': 'Alva Vanderbilt',
    'mamie.fish@newport.test': 'Mamie Fish',
    'doris.duke@newport.test': 'Doris Duke',
  },
  Innsmouth: {
    'barnabas.marsh@innsmouth.test': 'Barnabas Marsh',
    'robert.olmstead@innsmouth.test': 'Robert Olmstead',
    'zadok.allen@innsmouth.test': 'Zadok Allen',
  },
  Kingsport: {
    'basil.elton@kingsport.test': 'Basil Elton',
    'randolph.carter@kingsport.test': 'Randolph Carter',
    'thomas.olney@kingsport.test': 'Thomas Olney',
  },
  Dunwich: {
    'henry.armitage@dunwich.test': 'Henry Armitage',
    'zebulon.whateley@dunwich.test': 'Zebulon Whateley',
    'earl.sawyer@dunwich.test': 'Earl Sawyer',
  },
  Chipwhich: {
    'thomas.dorr@chepachet.test': 'Thomas Wilson Dorr',
    'jemima.wilkinson@chepachet.test': 'Jemima Wilkinson',
    'elleanor.eldridge@chepachet.test': 'Elleanor Eldridge',
  },
  Pawstuxnet: {
    'john.mawney@pawtuxet.test': 'John Mawney',
    'benjamin.page@pawtuxet.test': 'Benjamin Page',
    'joseph.bucklin@pawtuxet.test': 'Joseph Bucklin',
  },
  Cabinet: {
    'welcome.arnold@cabinet.test': 'Welcome Arnold',
    'dutee.arnold@cabinet.test': 'Dutee Arnold',
    'pardon.tillinghast@cabinet.test': 'Pardon Tillinghast',
  },
}

// Build villages, demo login users, and their grants. Deterministic given rng.
export function buildVillagesAndUsers (content, rng) {
  const village = VILLAGES.map((v, i) => ({ id: i + 1, name: v.name }))
  const villageIdByName = Object.fromEntries(village.map(v => [v.name, v.id]))

  const user_data = []
  const village_grant = []
  let userId = 0
  // lastClaims carries the `name` claim: the app displays it (falling back to
  // username) for service-request creator attribution.
  const addUser = (username, displayName, claims) => {
    userId += 1
    user_data.push({ userId, username, lastClaims: JSON.stringify({ preferred_username: username, name: displayName, ...claims }) })
    return userId
  }
  const grant = (uid, villageName, roleId) =>
    village_grant.push({ villageId: villageIdByName[villageName], userId: uid, roleId })

  // 1) System admin — admin privilege, NO grants (sees all via elevate).
  addUser('samuel.slater@millworks.test', 'Samuel Slater', { realm_access: { roles: ['admin'] } })

  // 1b) The dev login (the "admin" user you enter in the mock OIDC form) —
  // granted OWNER of every village so it shows up as an owner everywhere, not
  // just via admin/elevate.
  const adminUid = addUser(ADMIN_LOGIN, 'Demo Admin', { realm_access: { roles: ['admin'] } })
  for (const v of village) grant(adminUid, v.name, ROLE.owner)

  // 2) An owner for each of the two big villages.
  grant(addUser('roger.williams@providence.test', 'Roger Williams'), 'Arkham', ROLE.owner)
  grant(addUser('hp.lovecraft@miskatonic.test', 'H.P. Lovecraft'), 'Arkham', ROLE.full)
  grant(addUser('peter.griffin@quahog.test', 'Peter Griffin'), 'Quahog', ROLE.owner)

  // 3) A multi-village regional coordinator (>= 3 villages -> meta roll-up).
  const coord = addUser('john.brown@brownbros.test', 'John Brown')
  for (const v of ['Quahog', 'Innsmouth', 'Arkham']) grant(coord, v, ROLE.full)

  // 4) One of each remaining role somewhere.
  grant(addUser('nathanael.greene@newport.test', 'Nathanael Greene'), 'Oldport', ROLE.manage)
  grant(addUser('gilbert.stuart@gmail.test', 'Gilbert Stuart'), 'Quahog', ROLE.restricted)

  // 5) A coordinator (full) for every other village so each has a steward.
  const stewards = {
    'New York System': ['ann.franklin@providence.test', 'Ann Franklin'],
    Oldport: ['ida.lewis@lighthouse.test', 'Ida Lewis'],
    Innsmouth: ['obed.marsh@innsmouth.test', 'Obed Marsh'],
    Kingsport: ['richard.pickman@kingsport.test', 'Richard Pickman'],
    Dunwich: ['wilbur.whateley@dunwich.test', 'Wilbur Whateley'],
    Chipwhich: ['betty.bett@chepachet.test', 'Betty Bett'],
    Pawstuxnet: ['abraham.whipple@pawtuxet.test', 'Abraham Whipple'],
    Cabinet: ['roger.mowry@cabinet.test', 'Roger Mowry'],
  }
  for (const [vname, [username, display]] of Object.entries(stewards)) grant(addUser(username, display), vname, ROLE.full)

  // 6) A zero-grants user (valid login, sees nothing).
  addUser('mr.calimari@quahog.test', 'Mr. Calimari')

  // 6b) The import/export loader's machine account (load-appdata.js mints its
  // token as this username). Pre-seeding it matters: the API creates a row for
  // any authenticated caller, and the privacy-ack gate blocks /op/appdata for
  // users who haven't acknowledged the current rules — without this row (and
  // its acknowledgement, see builders/privacy.js) the loader would 403 itself.
  addUser('demo-loader@villagegreen.test', 'demo-loader@villagegreen.test',
    { scope: 'vg:op', realm_access: { roles: ['admin'] } })

  // 7) Coverage fill — every village offers at least one user of each grant
  // role (big villages carry 2-3 of each), drawn from the themed pools above.
  // The admin's blanket owner grants don't count: coverage should hold among
  // the village's own themed users. Managers/owners double as the pool of
  // service-request creators (see data.js).
  const roleCount = {}
  for (const g of village_grant) {
    if (g.userId === adminUid) continue
    const k = `${g.villageId}:${g.roleId}`
    roleCount[k] = (roleCount[k] || 0) + 1
  }
  for (const v of VILLAGES) {
    const pool = Object.entries(FILL_LOGINS[v.name])
    for (const roleId of [ROLE.owner, ROLE.manage, ROLE.full, ROLE.restricted]) {
      const target = v.size === 'big' ? rng.int(2, 3) : 1
      for (let have = roleCount[`${villageIdByName[v.name]}:${roleId}`] || 0; have < target; have++) {
        const next = pool.shift()
        if (!next) throw new Error(`grant fill pool exhausted for ${v.name}`)
        grant(addUser(next[0], next[1]), v.name, roleId)
      }
    }
  }

  return { village, user_data, village_grant, villageIdByName, adminUserId: adminUid }
}
