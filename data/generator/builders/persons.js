import { VILLAGES } from '../constants.js'

// Target member/volunteer counts per village size. Members and volunteers are
// mostly DISTINCT people (members receive services; volunteers provide them).
const SIZE = {
  big: { members: 55, volunteers: 52 },
  medium: { members: 11, volunteers: 7 },
  small: { members: 5, volunteers: 4 },
  tiny: { members: 3, volunteers: 2 },
}

const RI_STREETS = ['Benefit St', 'Thayer St', 'Hope St', 'Wickenden St', 'Atwells Ave',
  'Westminster St', 'Spooner St', 'Water St', 'Bellevue Ave', 'Ocean Dr', 'Federal Hill',
  'Angell St', 'Power St', 'College St', 'Elmgrove Ave', 'Broadway', 'Smith St']
const RI_TOWNS = { Arkham: 'Arkham', Quahog: 'Quahog', Providence: 'Providence',
  Newport: 'Newport', Innsmouth: 'Innsmouth', Kingsport: 'Kingsport', Dunwich: 'Dunwich',
  Chepachet: 'Chepachet', Pawtuxet: 'Warwick', 'Cabinet, RI': 'Glocester' }

// Which figure buckets/villageHints belong to which village theme.
function poolForVillage (vName, theme, figures, used, rng) {
  const avail = figures.filter(f => !used.has(f.name))
  const hinted = avail.filter(f => f.villageHint === vName)
  let themed = []
  if (theme === 'family-guy') themed = avail.filter(f => f.bucket === 'fictional-ri' && /quahog|griffin|family guy/i.test(f.realBlurb || ''))
  else if (theme.startsWith('lovecraft')) themed = avail.filter(f => /lovecraft|innsmouth|arkham|dunwich|kingsport|cthulhu|miskatonic/i.test((f.realBlurb || '') + f.bucket))
  else if (theme === 'gilded-age') themed = avail.filter(f => f.bucket === 'gilded-age-newport')
  // hinted first, then themed, then anyone — caller slices what it needs
  // de-dupe by name so the same figure can't appear in multiple sub-arrays
  const seen = new Set()
  const out = []
  for (const f of [...rng.shuffle(hinted), ...rng.shuffle(themed), ...rng.shuffle(avail)]) {
    if (!seen.has(f.name)) { seen.add(f.name); out.push(f) }
  }
  return out
}

export function buildPersons (content, villageIdByName, rng) {
  const figures = content.people.figures
  const used = new Set()
  const person = []
  const byVillage = {}
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
    person.push({
      id: pid, village_id: villageId, full_name: fig.name,
      first_name: first, last_name: last, nickname: null,
      street: `${rng.int(1, 400)} ${rng.pick(RI_STREETS)}`, unit: rng.bool(0.15) ? `Apt ${rng.int(1, 30)}` : null,
      city: RI_TOWNS[vName] || vName, state: 'RI', zip: String(rng.int(2801, 2920)).padStart(5, '0'),
      email: emailFor(fig.name), phone: `401-555-${String(rng.int(100, 999))}`, cell: `401-555-${String(rng.int(100, 999))}`,
      computer_use: rng.bool(0.6) ? 1 : 0, smartphone: rng.bool(0.7) ? 1 : 0,
      birth_date: `19${rng.int(30, 60)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
      emergency_contact_name: null, emergency_contact_relationship: null,
      emergency_contact_phone: null, emergency_contact_email: null,
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
    // member/volunteer overlap comfortably under the 10% ceiling despite variance)
    for (let k = 0; k < target.volunteers; k++) {
      if (rng.bool(0.06) && members.length) { volunteers.push(rng.pick(members)); continue }
      if (i >= pool.length) break
      volunteers.push(makePerson(pool[i++], villageId, v.name))
    }
    byVillage[villageId] = { members, volunteers }
  }
  return { person, byVillage }
}
