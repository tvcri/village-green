'use strict'

// Volunteer pause rule helpers. Dates are civil 'YYYY-MM-DD' strings end to
// end: compared lexicographically, formatted by splitting, never hydrated
// into a JS Date.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Inclusive on both ends; a null bound is open.
function pauseCovers (pause, date) {
  if (!pause) return false
  return (pause.startDate == null || pause.startDate <= date) &&
    (pause.endDate == null || pause.endDate >= date)
}

// "Mon D" in the current Eastern year, "Mon D, YYYY" otherwise.
function formatPauseDate (date, today) {
  const [y, m, d] = date.split('-')
  const base = `${MONTHS[Number(m) - 1]} ${Number(d)}`
  return y === today.slice(0, 4) ? base : `${base}, ${y}`
}

function pauseSentence (displayName, pause, today) {
  const { startDate, endDate } = pause
  if (startDate && endDate) return `${displayName} is paused ${formatPauseDate(startDate, today)} – ${formatPauseDate(endDate, today)}.`
  if (startDate) return `${displayName} is paused from ${formatPauseDate(startDate, today)}.`
  if (endDate) return `${displayName} is paused until ${formatPauseDate(endDate, today)}.`
  return `${displayName} is paused.`
}

// Scalar subquery for a volunteer read: the pause object, or NULL.
function pauseJsonSql (volunteerAlias) {
  return `(SELECT JSON_OBJECT(
      'startDate', DATE_FORMAT(vpz.startDate, '%Y-%m-%d'),
      'endDate', DATE_FORMAT(vpz.endDate, '%Y-%m-%d'),
      'scope', vpz.scope)
    FROM volunteer_pause vpz WHERE vpz.volunteerId = ${volunteerAlias}.id)`
}

// The pause (with the volunteer's displayName) covering `date`, or null.
// `date` is bound as a string; no database clock is involved.
async function findCoveringPause (connection, volunteerPersonId, date) {
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(vp.startDate, '%Y-%m-%d') AS startDate,
            DATE_FORMAT(vp.endDate, '%Y-%m-%d') AS endDate,
            vp.scope, p.displayName
     FROM volunteer v
     JOIN volunteer_pause vp ON vp.volunteerId = v.id
     JOIN person p ON p.id = v.personId
     WHERE v.personId = ?
       AND (vp.startDate IS NULL OR vp.startDate <= ?)
       AND (vp.endDate IS NULL OR vp.endDate >= ?)`,
    [volunteerPersonId, date, date])
  return rows[0] ?? null
}

module.exports = { pauseCovers, pauseSentence, pauseJsonSql, findCoveringPause }
