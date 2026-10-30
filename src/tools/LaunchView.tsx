import { launchItems, MANUAL_LAUNCH_ITEMS } from '../lib/derive'
import type { AuditResponse, LaunchChecks } from '../lib/types'

export default function LaunchView(props: {
  report: AuditResponse
  launch: LaunchChecks | null
  launchLoading: boolean
  launchError: string
  onRunLaunch: () => void
  manualDone: Set<number>
  onToggleManual: (i: number) => void
}) {
  const { report, launch, launchLoading, launchError, onRunLaunch, manualDone, onToggleManual } = props
  const list = launchItems(report, launch)
  return (
    <div>
      {!launch ? (
        <div className="card">
          <p>Launch checks fetch the site&apos;s robots.txt and sitemap in addition to the audit.</p>
          <button type="button" className="btn-primary" onClick={onRunLaunch} disabled={launchLoading}>
            {launchLoading ? 'Checking…' : 'Run launch checks'}
          </button>
          {launchError && <p className="form-error" role="alert">{launchError}</p>}
        </div>
      ) : (
        <div className="card">
          <h3>Automatic checks</h3>
          <ul className="plain-list">
            {list.map((item) => (
              <li key={item.label}>
                <strong>{item.label}:</strong> {item.detail}
              </li>
            ))}
          </ul>
          <p className="muted small">{launch.note}</p>
        </div>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Manual checks — verify these yourself before launch</h3>
        <ul className="check-list">
          {MANUAL_LAUNCH_ITEMS.map((item, i) => (
            <li key={item}>
              <label>
                <input type="checkbox" checked={manualDone.has(i)} onChange={() => onToggleManual(i)} />
                {item}
              </label>
            </li>
          ))}
        </ul>
        <p className="muted small">{manualDone.size} of {MANUAL_LAUNCH_ITEMS.length} manual checks ticked. These are stored only in this browser.</p>
      </div>
    </div>
  )
}
