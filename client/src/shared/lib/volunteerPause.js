// Volunteer pause rules. Dates are civil 'YYYY-MM-DD' strings: compared
// lexicographically, formatted by splitting, never parsed into a Date.
// pauseCovers and pauseSentence mirror api/source/service/volunteerPause.js;
// keep the wording identical.

// User-facing pause wording lives here and nowhere else in the client, so a
// copy change is one edit. The sentence must stay identical to PAUSE_WORDING
// in api/source/service/volunteerPause.js (one pinned test on each side).
export const PAUSE_WORDING = {
  tag: 'Email paused',
  sentence: (displayName) => `Service email for ${displayName} is paused`,
}

// The zone the server computes "today" in for pause rules.
export const PAUSE_TIME_ZONE = 'America/New_York'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Inclusive on both ends; a null bound is open.
export function pauseCovers (pause, date) {
  if (!pause) return false
  return (pause.startDate == null || pause.startDate <= date) &&
    (pause.endDate == null || pause.endDate >= date)
}

export function pauseState (pause, today) {
  if (!pause) return 'none'
  if (pause.endDate != null && pause.endDate < today) return 'expired'
  if (pause.startDate != null && pause.startDate > today) return 'scheduled'
  return 'active'
}

// 'Mon D' in the current year (today's), 'Mon D, YYYY' otherwise.
export function formatPauseDate (date, today) {
  const [y, m, d] = date.split('-')
  const base = `${MONTHS[Number(m) - 1]} ${Number(d)}`
  return y === today.slice(0, 4) ? base : `${base}, ${y}`
}

// 'Mar 1–15' within one month and year, else 'Mar 25 – Apr 3'.
function formatRange (start, end, today) {
  const [sy, sm] = start.split('-')
  const [ey, em, ed] = end.split('-')
  if (sy === ey && sm === em) {
    const first = formatPauseDate(start, today).replace(/, \d{4}$/, '')
    return `${first}–${Number(ed)}${ey === today.slice(0, 4) ? '' : `, ${ey}`}`
  }
  return `${formatPauseDate(start, today)} – ${formatPauseDate(end, today)}`
}

export function pauseTag (pause, today) {
  const state = pauseState(pause, today)
  if (state === 'none' || state === 'expired') return null
  const { startDate, endDate, scope } = pause
  if (scope === 'window' && startDate && endDate) return `${PAUSE_WORDING.tag} ${formatRange(startDate, endDate, today)}`
  if (state === 'scheduled') {
    return endDate ? `${PAUSE_WORDING.tag} ${formatRange(startDate, endDate, today)}` : `${PAUSE_WORDING.tag} from ${formatPauseDate(startDate, today)}`
  }
  return endDate ? `${PAUSE_WORDING.tag} until ${formatPauseDate(endDate, today)}` : PAUSE_WORDING.tag
}

export function pauseSentence (displayName, pause, today) {
  const { startDate, endDate } = pause
  if (startDate && endDate) return `${PAUSE_WORDING.sentence(displayName)} ${formatPauseDate(startDate, today)} – ${formatPauseDate(endDate, today)}.`
  if (startDate) return `${PAUSE_WORDING.sentence(displayName)} from ${formatPauseDate(startDate, today)}.`
  if (endDate) return `${PAUSE_WORDING.sentence(displayName)} until ${formatPauseDate(endDate, today)}.`
  return `${PAUSE_WORDING.sentence(displayName)}.`
}
