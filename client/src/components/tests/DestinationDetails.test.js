// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/vue'
import DestinationDetails from '../DestinationDetails.vue'

afterEach(() => cleanup())

const cvs = { destination: 'CVS Pharmacy', address: '1 Main St', city: 'Wakefield', state: 'RI', zip: '02879', phone: '401-555-0100' }
const clinic = { destination: 'Clinic', address: '2 Oak Ave', city: 'Kingston', state: 'RI', zip: '02881', phone: '401-555-0199' }

describe('DestinationDetails', () => {
  it("one destination renders today's labels: Destination, Address, City/State", () => {
    const { getByText, queryByText } = render(DestinationDetails, { props: { destinations: [cvs], showPhone: true } })
    expect(getByText('Destination:')).toBeTruthy()
    expect(getByText('CVS Pharmacy')).toBeTruthy()
    expect(getByText('Address:')).toBeTruthy()
    expect(getByText('1 Main St')).toBeTruthy()
    expect(getByText('City/State:')).toBeTruthy()
    expect(getByText('Wakefield, RI')).toBeTruthy()
    expect(queryByText('Destination 1')).toBeNull()
  })

  it('two destinations render "Destination 1" and "Destination 2" groups', () => {
    const { getByText } = render(DestinationDetails, { props: { destinations: [cvs, clinic] } })
    expect(getByText('Destination 1')).toBeTruthy()
    expect(getByText('Destination 2')).toBeTruthy()
    expect(getByText('CVS Pharmacy')).toBeTruthy()
    expect(getByText('Clinic')).toBeTruthy()
    expect(getByText('Kingston, RI')).toBeTruthy()
  })

  it('showPhone renders a tel: link per destination; default renders no phone', () => {
    const on = render(DestinationDetails, { props: { destinations: [cvs, clinic], showPhone: true } })
    const hrefs = [...on.container.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(['tel:401-555-0100', 'tel:401-555-0199'])
    cleanup()
    const off = render(DestinationDetails, { props: { destinations: [cvs] } })
    expect(off.queryByText('Phone:')).toBeNull()
    expect(off.container.querySelector('a')).toBeNull()
  })

  it('renders nothing for no destinations', () => {
    const { container } = render(DestinationDetails, { props: { destinations: [] } })
    expect(container.textContent.trim()).toBe('')
  })
})
