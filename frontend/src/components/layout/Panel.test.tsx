import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Panel } from './Panel'

describe('Panel', () => {
  it('renders as a landmark region named by its heading', () => {
    render(<Panel title="Patient Intake">body</Panel>)

    // A named region, not an anonymous div — assistive tech can navigate to it.
    expect(
      screen.getByRole('region', { name: 'Patient Intake' }),
    ).toBeInTheDocument()
  })

  it('renders its heading and children', () => {
    render(<Panel title="Agent Activity">activity body</Panel>)

    expect(
      screen.getByRole('heading', { name: 'Agent Activity' }),
    ).toBeInTheDocument()
    expect(screen.getByText('activity body')).toBeInTheDocument()
  })

  it('renders an optional action beside the title', () => {
    render(
      <Panel title="Conversation" action={<button type="button">Mute</button>}>
        body
      </Panel>,
    )

    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
  })
})
