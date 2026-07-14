import { BASE_DATE } from '../env.js'

const dt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
const addDays = (d, n) => new Date(d.getTime() + n * 86400000)

// One published privacy-rules version, acknowledged by EVERY user. The API
// gates nearly every endpoint (privacyAckRequired) on having acknowledged the
// current rules within VG_PRIVACY_ACK_INTERVAL_DAYS (default 365) — a user
// without an acknowledgement gets the ack modal in the client and 403s from
// the API, including the loader's own /op/appdata calls.
const RULES_CONTENT = `# Village Green Privacy Agreement — Demo Playground

**This is the demo playground.** Every village, member, volunteer, and service
request in it is fictional. Any resemblance to actual Rhode Islanders — living,
dead, or eldritch — is intentional and affectionate.

By continuing you agree to:

1. **Practice like it's real.** Treat member records as confidential even
   here — the habits transfer to production.
2. **Keep real data out.** Never enter a real member's name, address, or
   health details into the playground.
3. **Expect resets.** The dataset is reseeded routinely; anything you add can
   vanish without notice.
4. **Report the weird stuff.** If something looks broken (or a resident of
   Innsmouth looks *too* realistic), tell the Village Green team.
`

export function buildPrivacy (userData, rng) {
  const publishedAt = addDays(BASE_DATE, -90)
  // publisher: the first admin-privileged user (samuel.slater)
  const publisher = userData.find(u => JSON.parse(u.lastClaims).realm_access?.roles?.includes('admin'))
  const privacy_rules = [{
    id: 1,
    content: RULES_CONTENT,
    publishedAt: dt(publishedAt),
    publishedByUserId: publisher.userId,
    // the admin corrected a typo a few days after publishing — populates the
    // modified* columns the way PATCH /privacy/rules/current does
    modifiedAt: dt(addDays(publishedAt, 3)),
    modifiedByUserId: publisher.userId,
  }]
  // the publisher auto-acknowledges at publish time (as POST /privacy/rules
  // does); everyone else trickles in over the following weeks
  const privacy_acknowledgement = userData.map((u, i) => ({
    id: i + 1,
    userId: u.userId,
    rulesId: 1,
    acknowledgedAt: u.userId === publisher.userId ? dt(publishedAt) : dt(addDays(publishedAt, rng.int(1, 45))),
    tokenClaims: u.lastClaims,
  }))
  return { privacy_rules, privacy_acknowledgement }
}
