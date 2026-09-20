import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { setViewport } from './test/setup'

describe('App', () => {
  it('renders the application shell', () => {
    setViewport(1440)
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /Medbot/ })).toBeInTheDocument()
  })

  it('renders all three console panels at desktop width', () => {
    setViewport(1440)
    render(<App />)

    expect(screen.getByRole('region', { name: 'Conversation' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Patient Intake' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Agent Activity' })).toBeInTheDocument()
  })

  it('exposes exactly one banner landmark', () => {
    setViewport(1440)
    render(<App />)

    // Regression: panel title bars used to be <header> elements, which
    // resolved to additional banner landmarks and made the page
    // confusing to navigate with assistive tech.
    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })

  it('renders no invented patient data in the shell', () => {
    setViewport(1440)
    const { container } = render(<App />)

    // Guards the "no dummy data" rule: the shell must not ship with
    // placeholder names/appointments that look like real records.
    expect(container.textContent).not.toMatch(/Rahul|Dr\.\s|PAT\d|APT-/)
  })
})
