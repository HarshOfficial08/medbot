import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
}

/**
 * Outermost frame: header + main region, full viewport height, safe on
 * phones (dvh rather than vh so mobile browser chrome doesn't clip it).
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col bg-surface">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
        <h1 className="text-sm font-semibold tracking-tight text-ink">
          Medbot
          <span className="ml-2 font-normal text-ink-muted">
            Healthcare Front Desk
          </span>
        </h1>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
