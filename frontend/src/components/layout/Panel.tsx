import { useId, type ReactNode } from 'react'

interface PanelProps {
  title: string
  /** Rendered next to the title — status pills, counts, actions. */
  action?: ReactNode
  children: ReactNode
}

/**
 * One column of the console. A real <section> with an accessible name,
 * not a styled div — the checklist requires landmark regions use the
 * platform's own primitives.
 */
export function Panel({ title, action, children }: PanelProps) {
  // useId, not a slug of `title`: two panels sharing a title would
  // otherwise emit duplicate ids and break aria-labelledby on both.
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 flex-col overflow-hidden rounded-(--radius-panel) border border-line bg-surface-raised"
    >
      {/* A div, not a <header>: the panel title bar is not a landmark.
          The section+aria-labelledby+h2 already name this region, and a
          nested <header> can resolve to a second `banner`. */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id={headingId} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  )
}
