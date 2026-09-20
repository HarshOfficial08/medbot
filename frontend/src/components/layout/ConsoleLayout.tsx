import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useIsCompact } from '../../hooks/useMediaQuery'

export interface ConsolePane {
  id: string
  label: string
  content: ReactNode
}

interface ConsoleLayoutProps {
  panes: ConsolePane[]
}

/**
 * The three-panel console from plan section 21.
 *
 * Wide screens get all panes side by side. Below `lg` there isn't room
 * for three columns at a readable width, so they collapse into a tab
 * set — responsive is a requirement here, not a polish pass.
 */
export function ConsoleLayout({ panes }: ConsoleLayoutProps) {
  const isCompact = useIsCompact()
  const [activeId, setActiveId] = useState(panes[0]?.id)
  const tablistId = useId()
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  if (!isCompact) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        {panes.map((pane) => (
          <div key={pane.id} className="flex min-h-0 flex-col">
            {pane.content}
          </div>
        ))}
      </div>
    )
  }

  const active = panes.find((pane) => pane.id === activeId) ?? panes[0]

  /**
   * Keyboard support required by the ARIA tabs pattern. Declaring
   * role="tablist" promises this behaviour to assistive tech: arrows
   * move between tabs, Home/End jump to the ends. Without it the roles
   * describe an interaction the component does not actually support.
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const currentIndex = panes.findIndex((pane) => pane.id === active?.id)
    if (currentIndex === -1) return

    const lastIndex = panes.length - 1
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = lastIndex
        break
      default:
        return
    }

    event.preventDefault()
    const nextPane = panes[nextIndex]
    setActiveId(nextPane.id)
    // Focus follows selection in an automatic-activation tablist.
    tabRefs.current.get(nextPane.id)?.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div
        role="tablist"
        aria-label="Console sections"
        id={tablistId}
        onKeyDown={onKeyDown}
        className="flex gap-1 rounded-(--radius-panel) bg-surface-sunken p-1"
      >
        {panes.map((pane) => {
          const selected = pane.id === active?.id
          return (
            <button
              key={pane.id}
              ref={(node) => {
                if (node) tabRefs.current.set(pane.id, node)
                else tabRefs.current.delete(pane.id)
              }}
              type="button"
              role="tab"
              id={`${tablistId}-tab-${pane.id}`}
              aria-selected={selected}
              aria-controls={`${tablistId}-panel-${pane.id}`}
              // Roving tabindex: the tablist is one Tab stop, and arrows
              // move within it — per the ARIA tabs pattern.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(pane.id)}
              className={[
                // 44px min touch target, per the checklist.
                'min-h-11 flex-1 rounded-md px-3 text-sm font-medium transition-colors',
                selected
                  ? 'bg-surface-raised text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {pane.label}
            </button>
          )
        })}
      </div>

      {active && (
        <div
          role="tabpanel"
          id={`${tablistId}-panel-${active.id}`}
          aria-labelledby={`${tablistId}-tab-${active.id}`}
          tabIndex={0}
          className="flex min-h-0 flex-1 flex-col"
        >
          {active.content}
        </div>
      )}
    </div>
  )
}
