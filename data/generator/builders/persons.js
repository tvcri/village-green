import { VILLAGES, RI_STREETS } from '../constants.js'

// Target member/volunteer counts per village size. Members and volunteers are
// mostly DISTINCT people (members receive services; volunteers provide them).
// Dataset-wide the mix lands near 60/40 members:volunteers, while the big
// villages still honor the >=50 members AND >=50 volunteers requirement.
const SIZE = {
  big: { members: 63, volunteers: 50 },
  medium: { members: 13, volunteers: 7 },
  small: { members: 6, volunteers: 3 },
  tiny: { members: 3, volunteers: 2 },
}

const RI_TOWNS = { Arkham: 'Arkham', Quahog: 'Quahog', 'New York System': 'Providence',
  Oldport: 'Newport', Innsmouth: 'Innsmouth', Kingsport: 'Kingsport', Dunwich: 'Dunwich',
  Chipwhich: 'Chepachet', Pawstuxnet: 'Warwick', Cabinet: 'Glocester' }

// Which figure buckets/villageHints belong to which village theme.
function poolForVillage (vName, theme, figures, used, rng) {
  const avail = figures.filter(f => !used.has(f.name))
  const hinted = avail.filter(f => f.villageHint === vName)
  // themed: only include figures NOT hinted for a DIFFERENT village — so a
  // figure reserved for Innsmouth isn't consumed by Arkham's themed pass
  const themeAvail = avail.filter(f => !f.villageHint || f.villageHint === vName)
  let themed = []
  if (theme === 'family-guy') themed = themeAvail.filter(f => f.bucket === 'fictional-ri' && /quahog|griffin|family guy/i.test(f.realBlurb || ''))
  else if (theme.startsWith('lovecraft')) themed = themeAvail.filter(f => /lovecraft|innsmouth|arkham|dunwich|kingsport|cthulhu|miskatonic/i.test((f.realBlurb || '') + f.bucket))
  else if (theme === 'gilded-age') themed = themeAvail.filter(f => f.bucket === 'gilded-age-newport')
  // Bias gag-tagged figures toward member slots so their bespoke Easter-egg
  // service requests surface.  Apply AFTER the seeded shuffles (deterministic):
  //   tier 1 (hinted): gag-hinted for this village, then bg-hinted
  //   tier 2 (themed): gag-themed, then bg-themed  [other-hinted excluded above]
  //   tier 3 (avail):  gag-avail with NO villageHint (general pool, spread
  //                    evenly across villages), then bg-avail, then gag figures
  //                    hinted for OTHER villages (de-dupe keeps them out of the
  //                    wrong village's member slots; they serve as overflow only)
  // De-dupe by name so the same figure can't appear in multiple sub-arrays.
  const shHinted  = rng.shuffle(hinted)
  const shThemed  = rng.shuffle(themed)
  const shAvail   = rng.shuffle(avail)

  const gagSort   = (arr) => [...arr.filter(f => f.tag === 'gag'), ...arr.filter(f => f.tag !== 'gag')]
  const availGagUnhinted = shAvail.filter(f => f.tag === 'gag' && !f.villageHint)
  const availBg          = shAvail.filter(f => f.tag !== 'gag')
  const availGagOther    = shAvail.filter(f => f.tag === 'gag' && f.villageHint && f.villageHint !== vName)

  const seen = new Set()
  const out = []
  for (const f of [...gagSort(shHinted), ...gagSort(shThemed), ...availGagUnhinted, ...availBg, ...availGagOther]) {
    if (!seen.has(f.name)) { seen.add(f.name); out.push(f) }
  }
  return out
}

export function buildPersons (content, villageIdByName, rng) {
  const figures = content.people.figures
  const used = new Set()
  const person = []
  const byVillage = {}
  const fillerIds = new Set() // invented-descendant filler persons — least-examined rows
  let pid = 0

  const splitName = (name) => {
    const parts = name.replace(/[^A-Za-z .'-]/g, '').split(/\s+/).filter(Boolean)
    return { first: parts[0] || name, last: parts.length > 1 ? parts[parts.length - 1] : '' }
  }
  const emailFor = (name) => name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@residents.test'

  const makePerson = (fig, villageId, vName) => {
    pid += 1
    const { first, last } = splitName(fig.name)
    used.add(fig.name)
    if (fig.bucket === 'invented-descendants') fillerIds.add(pid)
    person.push({
      id: pid, villageId: villageId, fullName: fig.name,
      firstName: first, lastName: last, nickname: null,
      middleInitial: rng.bool(0.5) ? rng.pick('ABCDEFGHJLMPRSTW'.split('')) : null,
      salutation: rng.bool(0.1) ? rng.pick(['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Rev.', 'Capt.']) : null,
      street: `${rng.int(1, 400)} ${rng.pick(RI_STREETS)}`, unit: rng.bool(0.15) ? `Apt ${rng.int(1, 30)}` : null,
      city: RI_TOWNS[vName] || vName, state: 'RI', zip: String(rng.int(2801, 2920)).padStart(5, '0'),
      email: emailFor(fig.name), phone: `401-555-${String(rng.int(100, 999))}`, cell: `401-555-${String(rng.int(100, 999))}`,
      computerUse: rng.bool(0.6) ? 1 : 0, smartphone: rng.bool(0.7) ? 1 : 0,
      birthDate: `19${rng.int(30, 60)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
      emergencyContactName: null, emergencyContactRelationship: null,
      emergencyContactPhone: null, emergencyContactEmail: null,
      comments: fig.realBlurb || null,
    })
    return pid
  }

  for (const v of VILLAGES) {
    const villageId = villageIdByName[v.name]
    const target = SIZE[v.size]
    const pool = poolForVillage(v.name, v.theme, figures, used, rng)
    const members = []
    const volunteers = []
    let i = 0
    // members
    for (let k = 0; k < target.members && i < pool.length; k++, i++) members.push(makePerson(pool[i], villageId, v.name))
    // volunteers — mostly new people; ~6% reuse a member person (keeps the
    // member/volunteer overlap comfortably under the 10% ceiling despite
    // variance). Never reuse the same member twice — volunteer rows de-dupe
    // per person, and a duplicate would shave the village's volunteer count.
    for (let k = 0; k < target.volunteers; k++) {
      const reusable = members.filter(id => !volunteers.includes(id))
      if (rng.bool(0.06) && reusable.length) { volunteers.push(rng.pick(reusable)); continue }
      if (i >= pool.length) break
      volunteers.push(makePerson(pool[i++], villageId, v.name))
    }
    // every village must field at least one volunteer — if the name pool ran
    // dry (the last villages get the leftovers), reuse a member
    if (!volunteers.length && members.length) volunteers.push(rng.pick(members))
    byVillage[villageId] = { members, volunteers }
  }
  return { person, byVillage, fillerIds }
}
