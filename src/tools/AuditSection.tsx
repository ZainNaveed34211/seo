import { useMemo, useState } from 'react'
import { LIMITS } from '../limits'
import { downloadHtmlReport, downloadJson } from '../api'
import type { AuditResponse, FindingStatus } from '../types'

// Basic SEO Audit — report section only (no URL form here; the single
// analyzer on the main page owns the one URL input and the one submission).
const STATUS_LABEL: Record<FindingStatus, string> = {
  pass: 'Passed',
  attention: 'Needs attention',
  not_checked: 'Not checked',
}

export default function AuditSection({ report }: { report: AuditResponse }) {
  const [filter, setFilter] = useState<'all' | FindingStatus>('all')
  const filtered = useMemo(() => {
    return filter === 'all' ? report.findings : report.findings.filter((f) => f.status === filter)
  }, [report, filter])
  const counts = useMemo(() => ({
    pass: report.findings.filter((f) => f.status === 'pass').length,
    attention: report.findings.filter((f) => f.status === 'attention').length,
    not_checked: report.findings.filter((f) => f.status === 'not_checked').length,
  }), [report])

  return (
    <div>
      <div className="summary-meta">
        <dl>
          <div><dt>Page audited</dt><dd>{report.auditedUrl}</dd></div>
          <div><dt>Final URL</dt><dd>{report.finalUrl}</dd></div>
          <div><dt>HTTP status</dt><dd>{report.status}</dd></div>
          <div><dt>Checked at</dt><dd>{new Date(report.fetchedAt).toLocaleString()}</dd></div>
          {report.redirectChain.length > 0 && (
            <div><dt>Redirects</dt><dd>{report.redirectChain.map((r) => `${r.status} → ${r.url}`).join(' · ')} → final: {report.finalUrl}</dd></div>
          )}
        </dl>
        <div className="mobile-check">
          <strong>Mobile basics (from this audit only):</strong>{' '}
          {report.findings.find((f) => f.id === 'technical-basics')?.evidence.includes('viewport present')
            ? 'Viewport tag is present, so the page can scale on phones. '
            : 'Viewport tag is missing — the page may not scale properly on phones. '}
          Real tap-target sizes and Core Web Vitals are NOT measured by this HTML audit; they need a real browser/device test.
        </div>
        <div className="counts">
          <span>{counts.pass} passed</span>
          <span>{counts.attention} need attention</span>
          <span>{counts.not_checked} not checked</span>
        </div>
        <div className="export-row">
          <button type="button" onClick={() => downloadJson(report)}>Download JSON</button>
          <button type="button" onClick={() => downloadHtmlReport(report)}>Download HTML report</button>
        </div>
      </div>

      {report.brokenLinks && (
        <div className="broken-links">
          <h3>Broken links — only links actually checked <span className="tier free">FREE</span></h3>
          <p>{report.brokenLinks.checked} internal link(s) checked (Starter limit: {LIMITS.auditBrokenLinksChecked}). {report.brokenLinks.unchecked} unchecked. {report.brokenLinks.note}</p>
          {report.brokenLinks.broken.length > 0 ? (
            <ul>{report.brokenLinks.broken.map((b) => <li key={b.url}><code>{b.url}</code> — HTTP {b.status} — {b.reason}</li>)}</ul>
          ) : <p>No broken links found among the checked links.</p>}
          {report.brokenLinks.couldNotVerify.length > 0 && <p>Could not be verified (NOT labelled broken): {report.brokenLinks.couldNotVerify.map((b) => b.url).join(', ')}</p>}
          <p className="help">Full broken-link scan of every link is a planned Premium feature and is LOCKED in this release — it is not operational, and no payment is taken here.</p>
        </div>
      )}

      <div className="filters" role="group" aria-label="Filter findings">
        {(['all', 'attention', 'pass', 'not_checked'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All findings' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="findings">
        {filtered.map((f) => (
          <article key={f.id} className={`finding finding-${f.status}`}>
            <div className="finding-top">
              <h3>{f.title}</h3>
              <span className="badge">{STATUS_LABEL[f.status]}</span>
              <span className="badge muted">{f.severity} severity</span>
              <span className="points">{f.points}/{f.maxPoints} pts</span>
            </div>
            <p><strong>What we found:</strong> {f.explanation}</p>
            <p><strong>Why it matters:</strong> {f.whyItMatters}</p>
            <p><strong>Evidence:</strong> <code>{f.evidence}</code></p>
            <p><strong>Next step:</strong> {f.recommendation}</p>
          </article>
        ))}
        {filtered.length === 0 && <p>No findings match this filter.</p>}
      </div>
    </div>
  )
}
