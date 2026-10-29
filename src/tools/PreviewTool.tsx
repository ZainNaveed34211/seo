import { useEffect, useMemo, useState } from 'react'
import type { AuditResponse } from '../types'

// Search & Social Preview — an INDEPENDENT tool, not a section of the audit.
// Everything here is local: editing preview text never changes the audited
// page, and the previews are SIMULATIONS. They are not Google's final
// result and not any social platform's exact rendering.
export default function PreviewTool({ report }: { report: AuditResponse | null }) {
  const metaTitle = report?.findings.find((f) => f.id === 'title-present')?.evidence ?? ''
  const metaDesc = report?.findings.find((f) => f.id === 'description-present')?.evidence ?? ''
  const fetchedTitle = extractQuoted(metaTitle)
  const fetchedDesc = extractQuoted(metaDesc)
  const [url, setUrl] = useState(report?.finalUrl ?? 'https://example.com/')
  const [title, setTitle] = useState(fetchedTitle)
  const [description, setDescription] = useState(fetchedDesc)
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (report) {
      setUrl(report.finalUrl)
      setTitle(fetchedTitle)
      setDescription(fetchedDesc)
      setEdited(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.finalUrl])
  const shownTitle = title
  const shownDesc = description

  const titleLen = [...shownTitle].length
  const descLen = [...shownDesc].length

  const warnings = useMemo(() => {
    const w: string[] = []
    if (!shownTitle) w.push('Title is empty — a search result with no title is not useful.')
    if (titleLen > 60) w.push(`Title is ${titleLen} characters. Google often truncates titles around 60 characters.`)
    if (titleLen > 0 && titleLen < 30) w.push('Title is short. Consider describing the page more fully (30–60 characters is a useful guide).')
    if (!shownDesc) w.push('Description is empty — search engines will choose snippet text for you.')
    if (descLen > 160) w.push(`Description is ${descLen} characters. Search snippets often truncate around 160 characters.`)
    if (descLen > 0 && descLen < 50) w.push('Description is short. Aim for roughly 50–160 characters.')
    return w
  }, [shownTitle, shownDesc, titleLen, descLen])

  function loadFromAudit() {
    if (!report) return
    setUrl(report.finalUrl)
    setTitle(fetchedTitle)
    setDescription(fetchedDesc)
    setEdited(false)
  }

  return (
    <div className="tool">
      <p className="tool-kicker">TOOL 3 · <span className="tier free">FREE</span></p>
      <h3>Search &amp; Social Preview</h3>
      <p className="tool-intro">
        Edit a title and description locally and see how they <em>might</em> look in a search
        result and a social share. This is a simulation, not Google's final result and not
        any platform's exact rendering. Nothing you type here changes a real website.
      </p>

      <div className="preview-grid">
        <form className="card" onSubmit={(e) => e.preventDefault()}>
          <h3>Preview content</h3>
          <label htmlFor="preview-url">Page URL (display only)</label>
          <input id="preview-url" type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <label htmlFor="preview-title">Title</label>
          <input id="preview-title" type="text" value={title} onChange={(e) => { setTitle(e.target.value); setEdited(true) }} placeholder="Your page title" />
          <p className="count">{titleLen} / 60 characters (guide)</p>
          <label htmlFor="preview-desc">Description</label>
          <textarea id="preview-desc" rows={4} value={description} onChange={(e) => { setDescription(e.target.value); setEdited(true) }} placeholder="A short description of the page" />
          <p className="count">{descLen} / 160 characters (guide)</p>
          {report && (
            <button type="button" onClick={loadFromAudit}>Reset to fetched metadata</button>
          )}
          {report && !edited && <p className="help">Showing fetched metadata from the audited page. Edit a field to see an edited preview — the live page does not change.</p>}
          {edited && <p className="help"><strong>Edited preview:</strong> this text is your local edit only, not the live page's metadata. Use "Reset to fetched metadata" to go back to the audited values.</p>}
          {warnings.length > 0 && (
            <div className="warnings" role="status">
              <strong>Warnings</strong>
              <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
        </form>

        <div>
          <div className="card preview-card">
            <p className="preview-label">Search result preview (simulated)</p>
            <p className="search-url">{displayUrl(url)}</p>
            <p className="search-title">{shownTitle || 'Untitled page'}</p>
            <p className="search-desc">{shownDesc || 'No description provided.'}</p>
          </div>
          <div className="card preview-card">
            <p className="preview-label">Social share preview (simulated)</p>
            <div className="social-box">
              <p className="social-title">{shownTitle || 'Untitled page'}</p>
              <p className="social-desc">{shownDesc || 'No description provided.'}</p>
              <p className="social-url">{displayUrl(url)}</p>
            </div>
            <p className="help">Open Graph image is not previewed here because this tool does not fetch or invent an image for the page. If the audited page has og:image, the audit's Open Graph finding reports it.</p>
          </div>
          <p className="help">Actual page metadata vs edited preview: when "Using audited page metadata" is shown, the text above is the page's real title/description as found by the audit. Otherwise it is your local edit only.</p>
        </div>
      </div>
    </div>
  )
}

function displayUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return raw || 'example.com'
  }
}

function extractQuoted(evidence: string): string {
  const m = evidence.match(/“([^”]+)”/)
  return m ? m[1] : ''
}
