import { FindingCard } from '../components/components'
import type { Finding } from '../lib/types'

export default function ChecklistView(props: { issues: Finding[]; isPremium: boolean }) {
  const { issues, isPremium } = props
  return (
    <div>
      <p className="muted">
        Every issue below explains what needs improvement, why it matters, and what to do.
        {issues.length > 0 && ` ${issues.length} task(s) in total.`}
      </p>
      {issues.length === 0 ? (
        <p>No action items — everything checked passed.</p>
      ) : (
        <div className="findings-list">
          {issues.map((f) => (
            <FindingCard key={f.id} finding={f} showWhy isPremium={isPremium} />
          ))}
        </div>
      )}
    </div>
  )
}
