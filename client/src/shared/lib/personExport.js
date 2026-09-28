// The person columns every roster download shares — Persons, Members and
// Volunteers, CSV and Google Sheets alike — so the three files line up
// column for column. Each list puts its own columns (Member #, Capabilities…)
// in front of this block.
//
// Gated columns are dropped, not blanked, when the viewer lacks the
// permission: the API omits birthDate (person:read_birth_date) and
// gender/ethnicity/races/isVeteran (person:read_demographics) for them, so a
// kept column would be empty and read as "not recorded".

export const PERSON_EXPORT_COLUMNS = [
  { header: 'First Name', key: 'firstName' },
  { header: 'Middle Initial', key: 'middleInitial' },
  { header: 'Last Name', key: 'lastName' },
  { header: 'Suffix', key: 'suffix' },
  { header: 'Nickname', key: 'nickname' },
  { header: 'Pronouns', key: 'pronouns' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Cell', key: 'cell' },
  { header: 'Preferred Contact', key: 'preferredContact' },
  { header: 'Street', key: 'street' },
  { header: 'Unit', key: 'unit' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Zip', key: 'zip' },
  { header: 'Municipality', key: 'town' },
  { header: 'Birth Date', key: 'birthDate', gate: 'birthDate' },
  { header: 'Deceased Date', key: 'deceasedDate' },
  { header: 'Languages', key: 'languages' },
  { header: 'Gender', key: 'gender', gate: 'demographics' },
  { header: 'Ethnicity', key: 'ethnicity', gate: 'demographics' },
  { header: 'Race', key: 'races', gate: 'demographics' },
  { header: 'Veteran', key: 'isVeteran', gate: 'demographics' },
  { header: 'Circles', key: 'circles' },
  { header: 'Disabilities', key: 'disabilities' },
  { header: 'Emergency Contact Name', key: 'emergencyContactName' },
  { header: 'Emergency Contact Relationship', key: 'emergencyContactRelationship' },
  { header: 'Emergency Contact Phone', key: 'emergencyContactPhone' },
  { header: 'Emergency Contact Email', key: 'emergencyContactEmail' },
]

// `can` holds the viewer's gates: { birthDate, demographics }.
export function personExportColumns (can) {
  return PERSON_EXPORT_COLUMNS.filter(c => !c.gate || can[c.gate])
}

// "Spanish (preferred), English" — the detail card's wording too.
export function formatLanguages (languages) {
  return (languages ?? []).map(l => l.isPreferred ? `${l.name} (preferred)` : l.name).join(', ')
}

const names = list => (list ?? []).map(x => x.name).join(', ')

// A person (the API's Person shape, or a summary row merged with its
// `detail` object) → this block's cell values.
export function personExportValues (p) {
  return {
    firstName: p.firstName,
    middleInitial: p.middleInitial,
    lastName: p.lastName,
    suffix: p.suffix,
    nickname: p.nickname,
    pronouns: p.pronouns,
    email: p.email,
    phone: p.phone,
    cell: p.cell,
    preferredContact: p.preferredContactMethod?.name ?? '',
    street: p.street,
    unit: p.unit,
    city: p.city,
    state: p.state,
    zip: p.zip,
    town: p.town,
    birthDate: p.birthDate,
    deceasedDate: p.deceasedDate,
    languages: formatLanguages(p.languages),
    gender: p.gender?.name ?? '',
    ethnicity: p.ethnicity?.name ?? '',
    races: names(p.races),
    // Three-valued: unknown stays blank rather than reading as No.
    isVeteran: p.isVeteran == null ? '' : (p.isVeteran ? 'Yes' : 'No'),
    circles: names(p.circles),
    disabilities: (p.disabilities ?? []).map(d => d.note ? `${d.name} (${d.note})` : d.name).join('; '),
    emergencyContactName: p.emergencyContactName,
    emergencyContactRelationship: p.emergencyContactRelationship,
    emergencyContactPhone: p.emergencyContactPhone,
    emergencyContactEmail: p.emergencyContactEmail,
  }
}
