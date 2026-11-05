// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/vue'
import ServiceRequestMap from '../ServiceRequestMap.vue'

vi.stubGlobal('VG', { Env: { google: { googleMapsKey: 'test-key' } } })

afterEach(() => cleanup())

describe('ServiceRequestMap', () => {
  it('renders place mode when place is set', () => {
    const { container } = render(ServiceRequestMap, { props: { place: '1 Main St, Wakefield, RI' } })
    const iframe = container.querySelector('iframe')
    expect(iframe.getAttribute('src')).toContain('/maps/embed/v1/place?')
    expect(iframe.getAttribute('src')).toContain('q=')
    expect(iframe.getAttribute('title')).toBe('Map of destination')
  })
  it('still renders directions mode', () => {
    const { container } = render(ServiceRequestMap, { props: { origin: 'A', destination: 'B' } })
    expect(container.querySelector('iframe').getAttribute('src')).toContain('/directions?')
  })
})
