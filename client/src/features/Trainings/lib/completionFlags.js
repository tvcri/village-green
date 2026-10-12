// Per-person flags for the record-completions panel (UI spec §4). Pure.
import { formatCivilDate } from '../../../shared/lib/civilDate.js'
import { plural } from '../../../shared/lib.js'

export function trainingFlag (personId, completions, date) {
  const mine = completions.filter(c => c.person.personId === personId)
  if (date && mine.some(c => c.completedDate === date)) {
    return { kind: 'skip', text: 'Already recorded for this date. Will be skipped.' }
  }
  const dated = mine.map(c => c.completedDate).filter(Boolean).sort().reverse()
  if (dated.length) return { kind: 'prior', text: `Last completed ${formatCivilDate(dated[0])}` }
  if (mine.length) return { kind: 'prior', text: 'Has an undated record' }
  return { kind: 'first', text: 'First completion' }
}

// volunteer: a roster row; holders: GET holders rows for `position`.
export function positionFlag (volunteer, position, holders) {
  if (!position) return null
  if (position.scope === 'village') {
    const home = volunteer.village
    if (!home) return { kind: 'skip', assign: false, text: 'Not assigned: no home village' }
    if (holders.some(h => h.person.personId === volunteer.personId && h.village?.villageId === home.villageId)) {
      return { kind: 'prior', assign: false, text: `Already holds it in ${home.name}` }
    }
    return { kind: 'first', assign: true, text: `Will be assigned · ${home.name}` }
  }
  if (holders.some(h => h.person.personId === volunteer.personId)) return { kind: 'prior', assign: false, text: 'Already holds it' }
  return { kind: 'first', assign: true, text: 'Will be assigned · Hub' }
}

// flags: [{ training: trainingFlag, position: positionFlag | null }]
export function batchSummary (flags) {
  const skipped = flags.filter(f => f.training.kind === 'skip').length
  return { toSave: flags.length - skipped, skipped, toAssign: flags.filter(f => f.position?.assign).length }
}

export function resultMessage ({ trainingName, date, positionName, result }) {
  let msg = `Recorded ${trainingName} on ${formatCivilDate(date)} for ${plural(result.recorded.length, 'volunteer')}.`
  const n = result.skipped.length
  if (n) msg += ` ${n} already had it for that date and ${n === 1 ? 'was' : 'were'} skipped.`
  if (positionName) msg += ` Assigned ${positionName} to ${plural(result.assigned.length, 'volunteer')}.`
  // The server has the last word on who was assigned: say who wasn't, and why.
  const why = (reason) => (result.notAssigned ?? []).filter(n => n.reason === reason).length
  const reasons = [
    why('alreadyHolds') && `${why('alreadyHolds')} already ${why('alreadyHolds') === 1 ? 'holds' : 'hold'} it`,
    why('noHomeVillage') && `${why('noHomeVillage')} ${why('noHomeVillage') === 1 ? 'has' : 'have'} no home village`,
  ].filter(Boolean)
  if (positionName && reasons.length) msg += ` Not assigned: ${reasons.join(', ')}.`
  return msg
}
