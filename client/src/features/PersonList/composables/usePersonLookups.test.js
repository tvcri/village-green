import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/personApi.js', () => ({
  getGenders: vi.fn(),
  getEthnicities: vi.fn(),
  getRaces: vi.fn(),
  getContactMethods: vi.fn(),
  getLanguages: vi.fn(),
}))

import * as api from '../api/personApi.js'
import { usePersonLookups, _resetPersonLookups } from './usePersonLookups.js'

function resolveAll () {
  api.getGenders.mockResolvedValue([{ genderId: '1', name: 'Female' }])
  api.getEthnicities.mockResolvedValue([{ ethnicityId: '1', name: 'Hispanic or Latino' }])
  api.getRaces.mockResolvedValue([{ raceId: '1', name: 'Asian' }])
  api.getContactMethods.mockResolvedValue([{ contactMethodId: '1', name: 'Phone' }])
  api.getLanguages.mockResolvedValue([{ languageId: '1', name: 'English', tag: 'en' }])
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetPersonLookups()
})

describe('usePersonLookups', () => {
  it('fetches the five catalogs once and shares them between callers', async () => {
    resolveAll()
    const a = usePersonLookups()
    const b = usePersonLookups()
    await a.ready
    await b.ready
    expect(api.getGenders).toHaveBeenCalledTimes(1)
    expect(api.getLanguages).toHaveBeenCalledTimes(1)
    expect(a.lookups).toBe(b.lookups)
    expect(a.lookups.genders).toEqual([{ genderId: '1', name: 'Female' }])
    expect(a.lookups.contactMethods[0].name).toBe('Phone')
    expect(a.lookups.loaded).toBe(true)
  })

  it('retries on the next call after a failed fetch', async () => {
    resolveAll()
    api.getRaces.mockRejectedValueOnce(new Error('down'))
    await expect(usePersonLookups().ready).rejects.toThrow('down')
    await usePersonLookups().ready
    expect(api.getRaces).toHaveBeenCalledTimes(2)
    expect(usePersonLookups().lookups.races).toEqual([{ raceId: '1', name: 'Asian' }])
  })
})
