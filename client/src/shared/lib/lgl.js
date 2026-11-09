// Little Green Light constituent page for a donor. The id is opaque text from
// LGL, so it is encoded rather than trusted into the path.
export function lglConstituentUrl (id) {
  return 'https://pvri.littlegreenlight.com/constituents/' + encodeURIComponent(id)
}
