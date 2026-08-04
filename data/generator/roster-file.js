// The playground mock-OIDC server (~/dev/tvcri/vg-mock-oidc) reads
// demo-logins.json as its login droplist. The shape below is a CONTRACT with
// that server: it validates every key and refuses to start on a mismatch.
//
// ROSTER_VERSION is duplicated as a constant in that repo's roster.js. Bump
// both together when the shape changes — they ship as a pair.
export const ROSTER_VERSION = 1

export function wrapRoster (logins, { seed, sizing }) {
  return {
    rosterVersion: ROSTER_VERSION,
    // Dataset fingerprint: which seed/sizing produced these logins, so the
    // server can log what it is actually serving.
    seed,
    sizing,
    // Wall-clock, deliberately NOT a builder value. This file is gitignored
    // build output that is never diffed, so it does not participate in the
    // byte-identical guarantee that emit's demo-appdata.jsonl carries.
    generatedAt: new Date().toISOString(),
    logins,
  }
}
