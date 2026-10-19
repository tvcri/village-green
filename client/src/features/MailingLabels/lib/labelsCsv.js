// CSV/Sheets shape for the Mailing Labels export: one row per envelope, in the
// preview's order, so a mail-merged letter stack pairs one-to-one with the
// printed label sheets. The salutation columns lead because they are what a
// letter merge uses; they hold names only ("Barbara and Robert"), and the
// greeting wording ("Dear …,") lives in the Word template. Headers avoid
// punctuation, which Word turns into underscores in merge-field names. The
// address columns let staff check rows against the labels or merge envelopes.
//
// Zip stays a string end to end (the API LPADs it, the Sheets worker writes
// strings as stringValue), but Excel re-reads a CSV's 02840 as the number
// 2840 — merge Word straight from the file rather than through an Excel save.
export const labelCsvColumns = [
  { header: 'Salutation', key: 'salutation' },
  { header: 'Salutation Nickname', key: 'salutationNickname' },
  { header: 'Salutation Full Name', key: 'salutationFullName' },
  { header: 'Name', key: 'name' },
  { header: 'Street', key: 'street' },
  { header: 'Unit', key: 'unit' },
  { header: 'City', key: 'city' },
  { header: 'State', key: 'state' },
  { header: 'Zip', key: 'zip' },
]

export function labelRowsForCsv (labels) {
  return (labels ?? []).map(({ salutations, ...label }) => ({
    ...label,
    salutation: salutations?.firstName ?? '',
    salutationNickname: salutations?.nickname ?? '',
    salutationFullName: salutations?.fullName ?? '',
  }))
}
