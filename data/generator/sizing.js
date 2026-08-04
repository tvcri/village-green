import { VILLAGES, CLASS_TOTALS } from './constants.js'

// Resolve the run's village list and per-village member/volunteer targets from
// the sizing knobs (env.js config.sizing). Deterministic — no RNG here.
export function resolveVillages (sizing = {}) {
  let list = VILLAGES
  if (sizing.villages) {
    const v = String(sizing.villages).trim()
    if (/^\d+$/.test(v)) list = VILLAGES.slice(0, Number(v))
    else {
      const names = v.split(',').map(s => s.trim())
      const unknown = names.filter(n => !VILLAGES.some(x => x.name === n))
      if (unknown.length) throw new Error(`unknown village(s) in VG_DEMO_VILLAGES: ${unknown.join(', ')}`)
      list = VILLAGES.filter(x => names.includes(x.name))
    }
    if (!list.length) throw new Error('VG_DEMO_VILLAGES selected no villages')
  }
  return list.map(v => {
    const total = CLASS_TOTALS[v.size]
    const m = Math.round(total * (v.mix === 'memberHeavy' ? 0.6 : 0.4))
    return { ...v, members: sizing.members ?? m, volunteers: sizing.volunteers ?? (total - m) }
  })
}
