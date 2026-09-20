import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { setViewport } from '../../test/setup'
import { ConsoleLayout, type ConsolePane } from './ConsoleLayout'

const panes: ConsolePane[] = [
  { id: 'conversation', label: 'Conversation', content: <p>conversation body</p> },
  { id: 'intake', label: 'Intake', content: <p>intake body</p> },
  { id: 'activity', label: 'Activity', content: <p>activity body</p> },
]

describe('ConsoleLayout', () => {
  describe('at desktop width (1440px)', () => {
    it('shows all three panes at once', () => {
      setViewport(1440)
      render(<ConsoleLayout panes={panes} />)

      expect(screen.getByText('conversation body')).toBeInTheDocument()
      expect(screen.getByText('intake body')).toBeInTheDocument()
      expect(screen.getByText('activity body')).toBeInTheDocument()
    })

    it('uses no tabs, because nothing is hidden', () => {
      setViewport(1440)
      render(<ConsoleLayout panes={panes} />)

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    })
  })

  describe.each([
    ['phone', 375],
    ['tablet', 768],
  ])('at %s width (%ipx)', (_label, width) => {
    it('collapses to tabs showing one pane at a time', () => {
      setViewport(width)
      render(<ConsoleLayout panes={panes} />)

      expect(screen.getByRole('tablist')).toBeInTheDocument()
      expect(screen.getByText('conversation body')).toBeInTheDocument()
      expect(screen.queryByText('intake body')).not.toBeInTheDocument()
    })

    it('switches panes when a tab is chosen', async () => {
      setViewport(width)
      const user = userEvent.setup()
      render(<ConsoleLayout panes={panes} />)

      await user.click(screen.getByRole('tab', { name: 'Activity' }))

      expect(screen.getByText('activity body')).toBeInTheDocument()
      expect(screen.queryByText('conversation body')).not.toBeInTheDocument()
    })

    it('exposes selected state to assistive tech', async () => {
      setViewport(width)
      const user = userEvent.setup()
      render(<ConsoleLayout panes={panes} />)

      const intakeTab = screen.getByRole('tab', { name: 'Intake' })
      expect(intakeTab).toHaveAttribute('aria-selected', 'false')

      await user.click(intakeTab)

      expect(intakeTab).toHaveAttribute('aria-selected', 'true')
      // The panel must be associated with its tab, not just visually adjacent.
      expect(screen.getByRole('tabpanel')).toHaveAttribute(
        'aria-labelledby',
        intakeTab.id,
      )
    })

    it("moves between tabs with arrow keys, per the ARIA tabs pattern", async () => {
      setViewport(width)
      const user = userEvent.setup()
      render(<ConsoleLayout panes={panes} />)

      // One Tab stop lands on the selected tab (roving tabindex);
      // arrows move within the tablist from there.
      await user.tab()
      expect(screen.getByRole("tab", { name: "Conversation" })).toHaveFocus()

      await user.keyboard("{ArrowRight}")
      expect(screen.getByRole("tab", { name: "Intake" })).toHaveFocus()
      expect(screen.getByText("intake body")).toBeInTheDocument()

      await user.keyboard("{ArrowLeft}")
      expect(screen.getByText("conversation body")).toBeInTheDocument()
    })

    it("wraps around and supports Home/End", async () => {
      setViewport(width)
      const user = userEvent.setup()
      render(<ConsoleLayout panes={panes} />)

      await user.tab()
      await user.keyboard("{ArrowLeft}")
      expect(screen.getByText("activity body")).toBeInTheDocument()

      await user.keyboard("{Home}")
      expect(screen.getByText("conversation body")).toBeInTheDocument()

      await user.keyboard("{End}")
      expect(screen.getByText("activity body")).toBeInTheDocument()
    })

    it("keeps the tablist to a single Tab stop", async () => {
      setViewport(width)
      const user = userEvent.setup()
      render(<ConsoleLayout panes={panes} />)

      await user.tab()
      expect(screen.getByRole("tab", { name: "Conversation" })).toHaveFocus()
      expect(screen.getByRole("tab", { name: "Intake" })).toHaveAttribute(
        "tabindex",
        "-1",
      )
    })
  })
})
