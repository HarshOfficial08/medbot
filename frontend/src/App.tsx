import { AppShell } from './components/layout/AppShell'
import { ConsoleLayout, type ConsolePane } from './components/layout/ConsoleLayout'
import { Panel } from './components/layout/Panel'

/**
 * Phase 0 shell only.
 *
 * The panes are intentionally empty: no placeholder patients, no fake
 * appointments. Real content arrives in Phase 3 from the seeded
 * database via the generated API client — nothing in this app renders
 * invented data.
 */
const panes: ConsolePane[] = [
  {
    id: 'conversation',
    label: 'Conversation',
    content: (
      <Panel title="Conversation">
        <p className="text-sm text-ink-muted">
          The voice conversation appears here once the agent is connected.
        </p>
      </Panel>
    ),
  },
  {
    id: 'intake',
    label: 'Intake',
    content: (
      <Panel title="Patient Intake">
        <p className="text-sm text-ink-muted">
          Intake fields populate themselves as the patient speaks.
        </p>
      </Panel>
    ),
  },
  {
    id: 'activity',
    label: 'Activity',
    content: (
      <Panel title="Agent Activity">
        <p className="text-sm text-ink-muted">
          Agent actions are listed here as they happen.
        </p>
      </Panel>
    ),
  },
]

export default function App() {
  return (
    <AppShell>
      <ConsoleLayout panes={panes} />
    </AppShell>
  )
}
