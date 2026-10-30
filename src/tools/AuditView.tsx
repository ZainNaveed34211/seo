import { FindingCard } from '../components/components'
import { categoryScore } from '../lib/derive'
import type { Category } from '../lib/derive'

export default function AuditView(props: {
  groups: Category[]
  filter: string | null
  onClearFilter: () => void
}) {
  const { groups, filter, onClearFilter } = props
  const shown = filter ? groups.filter((g) => g.id === filter) : groups
  return (
    <div>
      {filter && (
        <p>
          Showing <strong>{groups.find((g) => g.id === filter)?.label}</strong>{' '}
          <button type="button" className="link-btn" onClick={onClearFilter}>Show all categories</button>
        </p>
      )}
      {shown.map((g) => {
        const s = categoryScore(g.findings)
        return (
          <section key={g.id} className="category-section">
            <h3>{g.label} <span className="muted small">— {s.earned}/{s.max} points</span></h3>
            <div className="findings-list">
              {g.findings.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
