// The person fields 0027 added, kept apart from each host's flat `form` so the
// three person forms (PersonEditForm, the wizard's PersonStep and
// VolunteerStep) load and save them the same way.

export function emptyPersonFields () {
  return {
    suffix: '', pronouns: '', deceased: false, deceasedDate: '', dateUnknown: false, preferredContactMethodId: null,
    genderId: null, ethnicityId: null, isVeteran: null, raceIds: [],
    languageIds: [], preferredLanguageId: null,
  }
}

// getPerson returns lookups as objects ({ genderId, name }); the form holds
// ids. Demographic keys are absent for a caller without
// person:read_demographics and load as empty.
export function personFormFromApi (p) {
  const languages = p.languages ?? []
  return {
    suffix: p.suffix ?? '',
    pronouns: p.pronouns ?? '',
    deceased: p.deceased ?? false,
    deceasedDate: p.deceasedDate ?? '',
    dateUnknown: (p.deceased ?? false) && !p.deceasedDate,
    preferredContactMethodId: p.preferredContactMethod?.contactMethodId ?? null,
    genderId: p.gender?.genderId ?? null,
    ethnicityId: p.ethnicity?.ethnicityId ?? null,
    isVeteran: p.isVeteran ?? null,
    raceIds: (p.races ?? []).map(r => r.raceId),
    languageIds: languages.map(l => l.languageId),
    preferredLanguageId: languages.find(l => l.isPreferred)?.languageId ?? null,
  }
}

const SCALARS = ['suffix', 'pronouns', 'preferredContactMethodId']
const DEMOGRAPHIC_SCALARS = ['genderId', 'ethnicityId', 'isVeteran']

// Blank on edit sends null so a cleared field is cleared server-side; blank on
// create is omitted. `false` is a value (isVeteran = No), never a blank.
function putScalar (payload, key, value, isEdit) {
  if (value === '' || value === null || value === undefined) {
    if (isEdit) payload[key] = null
  }
  else payload[key] = value
}

export function addPersonFields (payload, fields, { isEdit, showDemographics }) {
  for (const k of SCALARS) putScalar(payload, k, fields[k], isEdit)
  // deceased and deceasedDate travel together: the API 422s a date left behind
  // on deceased:false, so unticking sends deceasedDate null explicitly.
  const deceased = !!fields.deceased
  const date = deceased && !fields.dateUnknown && fields.deceasedDate ? fields.deceasedDate : null
  if (isEdit || deceased) {
    payload.deceased = deceased
    payload.deceasedDate = date
  }
  // Omitted, never nulled, without person:read_demographics — like birthDate,
  // a coordinator who cannot see the values must not clear them.
  if (showDemographics) {
    for (const k of DEMOGRAPHIC_SCALARS) putScalar(payload, k, fields[k], isEdit)
    payload.races = [...fields.raceIds]
  }
  payload.languages = fields.languageIds.map(id => ({
    languageId: id,
    isPreferred: id === fields.preferredLanguageId,
  }))
  return payload
}
