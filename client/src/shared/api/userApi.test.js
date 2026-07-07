import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./apiClient.js', () => ({
  apiCall: vi.fn(),
}))

import { apiCall } from './apiClient.js'
import { createUser, updateUser, deleteUser } from './userApi.js'

describe('userApi', () => {
  beforeEach(() => {
    apiCall.mockReset()
  })

  it('createUser calls createUser op with elevate and body', async () => {
    apiCall.mockResolvedValue({ userId: 1 })
    const body = { username: 'a@b.com', villageGrants: [] }
    const result = await createUser(body)
    expect(apiCall).toHaveBeenCalledWith('createUser', { elevate: true }, body)
    expect(result).toEqual({ userId: 1 })
  })

  it('updateUser calls updateUser op with userId, elevate, and body', async () => {
    apiCall.mockResolvedValue({ userId: 5, username: 'new@b.com' })
    const result = await updateUser(5, { username: 'new@b.com' })
    expect(apiCall).toHaveBeenCalledWith('updateUser', { userId: 5, elevate: true }, { username: 'new@b.com' })
    expect(result).toEqual({ userId: 5, username: 'new@b.com' })
  })

  it('deleteUser calls deleteUser op with userId and elevate, no body', async () => {
    apiCall.mockResolvedValue({ userId: 5, status: 'unavailable' })
    const result = await deleteUser(5)
    expect(apiCall).toHaveBeenCalledWith('deleteUser', { userId: 5, elevate: true })
    expect(result).toEqual({ userId: 5, status: 'unavailable' })
  })
})
