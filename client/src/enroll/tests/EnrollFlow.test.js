// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PrimeVue from 'primevue/config'
import EnrollFlow from '../EnrollFlow.vue'
import { requestPin, verifyPin, resetPassword } from '../enrollApi.js'

vi.mock('../enrollApi.js', () => ({
  requestPin: vi.fn(),
  verifyPin: vi.fn(),
  resetPassword: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom has no matchMedia; PrimeVue components use it on mount
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
})

afterEach(cleanup)

function renderFlow() {
  return render(EnrollFlow, { global: { plugins: [PrimeVue] } })
}

async function submitEmailAndReachPinStep() {
  requestPin.mockResolvedValue({
    ok: true,
    status: 200,
    data: { message: "If your email is registered as a volunteer, we've sent you instructions." },
  })
  await fireEvent.update(screen.getByLabelText('Email address'), 'vol@example.com')
  await fireEvent.click(screen.getByRole('button', { name: 'Send me a PIN' }))
  await waitFor(() => expect(screen.getByLabelText('PIN')).toBeTruthy())
}

describe('EnrollFlow', () => {
  it('starts at the email step', () => {
    renderFlow()
    expect(screen.getByLabelText('Email address')).toBeTruthy()
  })

  it('advances to the PIN step and shows the uniform message', async () => {
    renderFlow()
    await submitEmailAndReachPinStep()
    expect(requestPin).toHaveBeenCalledWith('vol@example.com')
    expect(screen.getByText(/we've sent you instructions/i)).toBeTruthy()
  })

  it('shows the temp password once after a created verify', async () => {
    renderFlow()
    await submitEmailAndReachPinStep()
    verifyPin.mockResolvedValue({
      ok: true, status: 200,
      data: { status: 'created', tempPassword: 'abc123def456', loginUrl: '/' },
    })
    await fireEvent.update(screen.getByLabelText('PIN'), '123456')
    await fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    await waitFor(() => expect(screen.getByTestId('temp-password').textContent).toBe('abc123def456'))
  })

  it('offers sign-in and reset choices for an existing account; reset shows a temp password', async () => {
    renderFlow()
    await submitEmailAndReachPinStep()
    verifyPin.mockResolvedValue({
      ok: true, status: 200,
      data: { status: 'exists', loginUrl: '/' },
    })
    await fireEvent.update(screen.getByLabelText('PIN'), '123456')
    await fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Take me to sign in' })).toBeTruthy())

    resetPassword.mockResolvedValue({
      ok: true, status: 200,
      data: { status: 'reset', tempPassword: 'zzz999yyy888', loginUrl: '/' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'I need a new temporary password' }))
    await waitFor(() => expect(screen.getByTestId('temp-password').textContent).toBe('zzz999yyy888'))
    expect(resetPassword).toHaveBeenCalledWith('vol@example.com', '123456')
  })

  it('shows an error and stays on the PIN step for an invalid PIN', async () => {
    renderFlow()
    await submitEmailAndReachPinStep()
    verifyPin.mockResolvedValue({ ok: false, status: 400, data: { status: 'invalid' } })
    await fireEvent.update(screen.getByLabelText('PIN'), '000000')
    await fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    await waitFor(() => expect(screen.getByText(/not accepted/i)).toBeTruthy())
    expect(screen.getByLabelText('PIN')).toBeTruthy()
  })

  it('writes the email to sessionStorage and navigates same-tab on sign in', async () => {
    const assignSpy = vi.fn()
    // jsdom: window.location.assign is not implemented; replace it
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    })
    sessionStorage.clear()

    renderFlow()
    await submitEmailAndReachPinStep()
    verifyPin.mockResolvedValue({
      ok: true, status: 200,
      data: { status: 'exists', loginUrl: './' },
    })
    await fireEvent.update(screen.getByLabelText('PIN'), '123456')
    await fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Take me to sign in' })).toBeTruthy())

    await fireEvent.click(screen.getByRole('button', { name: 'Take me to sign in' }))

    expect(sessionStorage.getItem('vg-login-hint')).toBe('vol@example.com')
    expect(assignSpy).toHaveBeenCalledWith('./')
  })

  it('falls back to ./ when the API omits loginUrl', async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    })
    sessionStorage.clear()

    renderFlow()
    await submitEmailAndReachPinStep()
    verifyPin.mockResolvedValue({
      ok: true, status: 200,
      data: { status: 'exists' },   // no loginUrl
    })
    await fireEvent.update(screen.getByLabelText('PIN'), '123456')
    await fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Take me to sign in' })).toBeTruthy())

    await fireEvent.click(screen.getByRole('button', { name: 'Take me to sign in' }))
    expect(assignSpy).toHaveBeenCalledWith('./')
  })

  it('copies the temp password to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    renderFlow()
    await submitEmailAndReachPinStep()
    verifyPin.mockResolvedValue({
      ok: true, status: 200,
      data: { status: 'created', tempPassword: 'abc123def456', loginUrl: './' },
    })
    await fireEvent.update(screen.getByLabelText('PIN'), '123456')
    await fireEvent.click(screen.getByRole('button', { name: 'Verify PIN' }))
    await waitFor(() => expect(screen.getByTestId('temp-password').textContent).toBe('abc123def456'))

    await fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('abc123def456')
  })
})
