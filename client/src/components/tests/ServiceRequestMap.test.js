// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/vue'
import ServiceRequestMap from '../ServiceRequestMap.vue'

vi.stubGlobal('VG', { Env: { google: { googleMapsKey: 'test-key' } } })

afterEach(() => cleanup())

describe('ServiceRequestMap', () => {
  it('renders directions mode', () => {
    const { container } = render(ServiceRequestMap, { props: { origin: 'A', destination: 'B' } })
    expect(container.querySelector('iframe').getAttribute('src')).toContain('/directions?')
  })
})
