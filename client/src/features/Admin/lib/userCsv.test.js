import { describe, it, expect } from 'vitest'
import { columnsForCsv, userRowsForCsv } from './userCsv.js'
import { toCsv } from '../../../shared/lib/csvUtils.js'

const hubAdminStaff = {
  userId: '1',
  username: 'volunteer@villagecommonri.org',
  displayName: 'Gabriella Laurenzo',
  status: 'available',
  isVolunteer: false,
  federationGrants: [{ roleId: 4, name: 'Administrator' }, { roleId: 5, name: 'Staff' }],
  grants: {},
}

const villageLsc = {
  userId: '2',
  username: 'gpedagno2@gmail.com',
  displayName: 'Grace Pedagno',
  status: 'available',
  isVolunteer: true,
  federationGrants: [],
  grants: { 3: { villageId: 3, name: 'Warwick', roles: [{ roleId: 1, name: 'Local Steering Committee' }] } },
}

describe('userRowsForCsv', () => {
  it('joins hub and village access tags into one Access column', () => {
    const [hub, village] = userRowsForCsv([hubAdminStaff, villageLsc])
    expect(hub.access).toBe('Hub: Admin·Staff')
    expect(village.access).toBe('Warwick: LSC')
  })

  it('joins multiple scopes with a semicolon', () => {
    const [row] = userRowsForCsv([{ ...hubAdminStaff, grants: villageLsc.grants }])
    expect(row.access).toBe('Hub: Admin·Staff; Warwick: LSC')
  })

  it('emits an empty Access value for a user with no grants', () => {
    const [row] = userRowsForCsv([{ ...villageLsc, federationGrants: [], grants: {} }])
    expect(row.access).toBe('')
  })

  it('renders VSS eligibility as Yes/No', () => {
    const [hub, village] = userRowsForCsv([hubAdminStaff, villageLsc])
    expect(hub.vss).toBe('No')
    expect(village.vss).toBe('Yes')
  })

  it('includes soft-deleted users and marks their status', () => {
    const rows = userRowsForCsv([{ ...villageLsc, status: 'unavailable' }])
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('unavailable')
  })

  it('blanks displayName when it merely echoes the username', () => {
    const [row] = userRowsForCsv([{ ...villageLsc, displayName: villageLsc.username }])
    expect(row.displayName).toBe('')
  })

  it('formats lastAccess from epoch seconds and blanks a missing one', () => {
    const [withTs, without] = userRowsForCsv([
      { ...villageLsc, lastAccess: 1756132560 },
      { ...villageLsc, lastAccess: null },
    ])
    expect(withTs.lastAccess).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(without.lastAccess).toBe('')
  })

  it('tolerates a null user list', () => {
    expect(userRowsForCsv(null)).toEqual([])
  })

  it('produces a CSV whose header matches the declared columns', () => {
    const csv = toCsv(userRowsForCsv([villageLsc]), columnsForCsv)
    const [header] = csv.split('\n')
    expect(header).toBe('Username,Display Name,Access,VSS,Status,Last Access')
  })
})
