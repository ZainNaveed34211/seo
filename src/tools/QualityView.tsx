import PremiumUpsell from '../components/PremiumUpsell'
import { qualityItems } from '../lib/derive'
import type { AuditResponse } from '../lib/types'

export default function QualityView(props: { report: AuditResponse }) {
  const { report } = props
  const list = qualityItems(report)
  return (
    <div>
      <p className="muted">
        Quality here is derived from the same scan — accessibility basics, mobile readiness,
        connection security, and the bounded broken-link check. This scan does not measure
        load speed, so no speed score is claimed.
      </p>
      <div className="findings-list">
        {list.map((q) => (
          <article key={q.label} className="finding-card">
            <div className="finding-head">
              <h3>{q.label}</h3>
              <span className={`status-dot status-${q.state === 'pass' ? 'pass' : q.state === 'attention' ? 'attention' : 'not_checked'}`}>
                {q.state === 'pass' ? 'Good' : q.state === 'attention' ? 'Needs work' : 'Not checked'}
              </span>
            </div>
            <p className="finding-text">{q.detail}</p>
          </article>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <PremiumUpsell />
      </div>
    </div>
  )
}
