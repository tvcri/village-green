'use strict'
// Pure rules for the /friends/sync/* endpoints (no DB). See migration 0037.
const { UnprocessableError } = require('../utils/error')

const HOLD_VALUES = [null, 'name', 'date', 'ignored', 'unreadable']
const MATCH_VALUES = [null, 'remembered', 'email', 'name-village', 'name-elsewhere']
const ID_COLUMNS = ['id', 'villageId', 'volunteerPersonId', 'memberPersonId']
// fcv_submission columns the sync's PUT writes: all but dateDecision, dateDecidedAt, dateDecidedUserId
const WRITABLE = [
  'id', 'villageId', 'villageName', 'volunteerPersonId', 'rawVolunteerName',
  'volunteerFirst', 'volunteerLast', 'volunteerEmail', 'memberPersonId',
  'rawMemberName', 'memberFirst', 'memberLast', 'visitDate', 'timeSpentMinutes',
  'contactType', 'activityTypes', 'activityOther', 'notes', 'reportingTag',
  'submittedAt', 'jotformUpdatedAt', 'volunteerMatch', 'memberMatch', 'held'
]

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const present = (v) => v !== undefined && v !== null && v !== ''

// The subjectKey rule of fcv_hold: one open hold per key.
function holdSubjectKey(hold) {
  if (!isObject(hold)) throw new UnprocessableError('hold must be an object')
  switch (hold.kind) {
    case 'name':
      if (!present(hold.role) || !present(hold.nameKey)) {
        throw new UnprocessableError('a name hold needs role and nameKey')
      }
      return `name:${hold.role}:${present(hold.villageId) ? hold.villageId : 0}:${hold.nameKey}`
    case 'date':
    case 'unreadable':
      if (!present(hold.submissionId)) throw new UnprocessableError(`a ${hold.kind} hold needs submissionId`)
      return `${hold.kind}:${hold.submissionId}`
    default:
      throw new UnprocessableError(`unknown hold kind: ${hold.kind}`)
  }
}

function validateSubmission(body, id) {
  if (!isObject(body)) throw new UnprocessableError('body must be an object')
  if (body.id !== undefined && body.id !== null && String(body.id) !== String(id)) {
    throw new UnprocessableError('body id does not match the path id')
  }
  const row = {}
  for (const col of WRITABLE) row[col] = body[col] === undefined ? null : body[col]
  row.id = id
  for (const col of ID_COLUMNS) {
    if (row[col] !== null && typeof row[col] !== 'string') throw new UnprocessableError(`${col} must be a string or null`)
  }
  if (!HOLD_VALUES.includes(row.held)) throw new UnprocessableError('invalid held')
  for (const col of ['volunteerMatch', 'memberMatch']) {
    if (!MATCH_VALUES.includes(row[col])) throw new UnprocessableError(`invalid ${col}`)
  }
  if (row.activityTypes !== null &&
      !(Array.isArray(row.activityTypes) && row.activityTypes.every(t => typeof t === 'string'))) {
    throw new UnprocessableError('activityTypes must be an array of strings or null')
  }
  if (row.held !== 'unreadable') {
    for (const col of ['visitDate', 'timeSpentMinutes', 'contactType']) {
      if (row[col] === null) throw new UnprocessableError(`${col} is required unless the report is held as unreadable`)
    }
  }
  if (row.timeSpentMinutes !== null && !(Number.isInteger(row.timeSpentMinutes) && row.timeSpentMinutes >= 0)) {
    throw new UnprocessableError('timeSpentMinutes must be a whole number of minutes, 0 or more')
  }
  return row
}

function validateResolution(hold, body) {
  const b = isObject(body) ? body : {}
  const keys = Object.keys(b)
  const only = (k, ok) => keys.length === 1 && keys[0] === k && ok
  switch (hold && hold.kind) {
    case 'name':
      if (only('personId', typeof b.personId === 'string' && b.personId !== '')) return { kind: 'match', personId: b.personId }
      if (only('ignore', b.ignore === true)) return { kind: 'ignore' }
      throw new UnprocessableError('a name hold takes { personId } or { ignore: true }')
    case 'date':
      if (only('accept', b.accept === true)) return { kind: 'accept' }
      if (only('ignore', b.ignore === true)) return { kind: 'ignore' }
      throw new UnprocessableError('a date hold takes { accept: true } or { ignore: true }')
    case 'unreadable':
      throw new UnprocessableError('an unreadable hold cannot be resolved')
    default:
      throw new UnprocessableError('unknown hold kind')
  }
}

module.exports = { holdSubjectKey, validateSubmission, validateResolution }
