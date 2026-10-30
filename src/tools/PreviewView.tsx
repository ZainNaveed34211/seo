import { findById } from '../lib/derive'
import type { AuditResponse } from '../lib/types'
import type { PreviewData } from '../lib/derive'

export default function PreviewView(props: { report: AuditResponse; preview: PreviewData }) {
  const { report, preview } = props
  return (
    <div>
      <p className="muted">
        Previews use the real title, description, and Open Graph values found on the page.
        A missing value is shown as missing — nothing is invented.
      </p>
      <div className="preview-grid">
        <article className="card preview-card">
          <h3>Google Search</h3>
          <p className="google-url">{preview.url}</p>
          <p className="google-title">{preview.title ?? 'Missing page title'}</p>
          <p className="google-desc">{preview.description ?? 'No meta description found — Google would use page text instead.'}</p>
        </article>
        <article className="card preview-card">
          <h3>Facebook</h3>
          <p className="fb-title">{preview.ogTitle ?? preview.title ?? 'Missing sharing title'}</p>
          <p className="muted small">{preview.url}</p>
          <p>{preview.ogDescription ?? preview.description ?? 'No sharing description found.'}</p>
          {!preview.ogTitle && <p className="warn">og:title is missing — Facebook would fall back to the page title.</p>}
          {!preview.ogDescription && <p className="warn">og:description is missing — Facebook would fall back to the meta description or page text.</p>}
        </article>
        <article className="card preview-card">
          <h3>X (Twitter) card</h3>
          <p className="fb-title">{preview.ogTitle ?? preview.title ?? 'Missing card title'}</p>
          <p>{preview.ogDescription ?? preview.description ?? 'No card description found.'}</p>
          <p className="muted small">X summary cards use Open Graph values when present, otherwise the page title and description.</p>
        </article>
      </div>
      <div className="card">
        <h3>Metadata recommendations</h3>
        <ul className="plain-list">
          {(['title-present', 'description-present', 'open-graph'] as const).map((id) => {
            const f = findById(report, id)
            if (!f) return null
            return <li key={id}><strong>{f.title}:</strong> {f.recommendation}</li>
          })}
          {preview.canonical && <li><strong>Canonical:</strong> {preview.canonical}</li>}
        </ul>
      </div>
    </div>
  )
}
