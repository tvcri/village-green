// Builds the tooltip text for a field's "uncertain" marker (the amber
// warning icon shown next to extraction-derived form fields). `uncertain`
// is a map of field name -> { reason, alternative? }; entries are absent
// for fields the extraction was confident about, hence the optional
// chaining below.
export function uncertainText (uncertain, field) {
  const u = uncertain[field]
  return u?.alternative ? `${u.reason} — alternative: ${u.alternative}` : u?.reason
}
