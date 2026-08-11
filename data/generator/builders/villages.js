import { ROLE } from '../constants.js'

// The dev login you type into the mock OIDC form (its `preferred_username`).
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

// Village Leads for villages without a bespoke lead persona below.
const LEADS = {
  'New York System': ['ann.franklin@providence.test', 'Ann Franklin'],
  Oldport: ['ida.lewis@lighthouse.test', 'Ida Lewis'],
  Innsmouth: ['obed.marsh@innsmouth.test', 'Obed Marsh'],
  Kingsport: ['richard.pickman@kingsport.test', 'Richard Pickman'],
  Dunwich: ['wilbur.whateley@dunwich.test', 'Wilbur Whateley'],
  Chipwhich: ['betty.bett@chepachet.test', 'Betty Bett'],
  Pawstuxnet: ['abraham.whipple@pawtuxet.test', 'Abraham Whipple'],
  Cabinet: ['roger.mowry@cabinet.test', 'Roger Mowry'],
}

// Build villages, demo login users, and their role grants (spec §1).
// villagesList comes from resolveVillages() — personas referencing an
// unselected village are skipped by grant(), not errors.
export function buildVillagesAndUsers (content, rng, villagesList) {
  const village = villagesList.map((v, i) => ({ id: i + 1, name: v.name }))
  const villageIdByName = Object.fromEntries(village.map(v => [v.name, v.id]))

  const user_data = []
  const role_grant = []
  let userId = 0
  const addUser = (username, displayName, claims) => {
    userId += 1
    user_data.push({ userId, username, lastClaims: JSON.stringify({ preferred_username: username, name: displayName, ...claims }) })
    return userId
  }
  // grantId omitted — auto-increment. villageName null = federation-scoped.
  const grant = (uid, roleId, villageName = null) => {
    if (villageName !== null && !(villageName in villageIdByName)) return
    role_grant.push({ userId: uid, roleId, villageId: villageName === null ? null : villageIdByName[villageName] })
  }

  // 1) Federation personas. Admin claims are kept alongside the roleId-4 grant
  // so the elevate escalation path still demos.
  grant(addUser('samuel.slater@millworks.test', 'Samuel Slater', { realm_access: { roles: ['admin'] } }), ROLE.admin)
  const adminUid = addUser(ADMIN_LOGIN, 'Demo Admin', { realm_access: { roles: ['admin'] } })
  grant(adminUid, ROLE.admin)
  // Staff + Service Coordinator hold sr:write — they are the SR creator pool.
  const staffUid = addUser('samuel.gorton@hub.test', 'Samuel Gorton')
  grant(staffUid, ROLE.staff)
  const scUid = addUser('elizabeth.chace@hub.test', 'Elizabeth Buffum Chace')
  grant(scUid, ROLE.serviceCoordinator)
  grant(addUser('moses.brown@board.test', 'Moses Brown'), ROLE.board)

  // 2) Bespoke village personas.
  grant(addUser('roger.williams@providence.test', 'Roger Williams'), ROLE.lead, 'Arkham')
  grant(addUser('hp.lovecraft@miskatonic.test', 'H.P. Lovecraft'), ROLE.steering, 'Arkham')
  grant(addUser('peter.griffin@quahog.test', 'Peter Griffin'), ROLE.lead, 'Quahog')
  // multi-village regional coordinator (>= 3 villages -> meta roll-up)
  const coord = addUser('john.brown@brownbros.test', 'John Brown')
  for (const v of ['Quahog', 'Innsmouth', 'Arkham']) grant(coord, ROLE.lead, v)
  grant(addUser('nathanael.greene@newport.test', 'Nathanael Greene'), ROLE.lsc, 'Oldport')
  grant(addUser('gilbert.stuart@gmail.test', 'Gilbert Stuart'), ROLE.steering, 'Quahog')
  for (const [vname, [username, display]] of Object.entries(LEADS)) {
    if (vname in villageIdByName) grant(addUser(username, display), ROLE.lead, vname)
  }

  // 3) Zero-grants user (valid login, sees nothing) + the loader machine account.
  addUser('mr.calimari@quahog.test', 'Mr. Calimari')
  grant(addUser('demo-loader@villagegreen.test', 'demo-loader@villagegreen.test',
    { scope: 'vg:op', realm_access: { roles: ['admin'] } }), ROLE.admin)

  // 4) Coverage fill — every selected village fields all three village roles
  // among its own themed users (big villages 2-3 of each).
  const roleCount = {}
  for (const g of role_grant) {
    if (g.villageId === null) continue
    const k = `${g.villageId}:${g.roleId}`
    roleCount[k] = (roleCount[k] || 0) + 1
  }
  for (const v of villagesList) {
    const pool = Object.entries(FILL_LOGINS[v.name])
    for (const roleId of [ROLE.lead, ROLE.steering, ROLE.lsc]) {
      const target = v.size === 'big' ? rng.int(2, 3) : 1
      for (let have = roleCount[`${villageIdByName[v.name]}:${roleId}`] || 0; have < target; have++) {
        const next = pool.shift()
        if (!next) throw new Error(`grant fill pool exhausted for ${v.name}`)
        grant(addUser(next[0], next[1]), roleId, v.name)
      }
    }
  }

  return { village, user_data, role_grant, villageIdByName, adminUserId: adminUid, creatorUserIds: [staffUid, scUid] }
}
