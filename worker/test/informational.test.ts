import { describe, expect, it } from 'vitest'
import { extractEvidence, runFreeRules, runInformationalRules, scoreOf } from '../src/audit'

const HTML = `<!doctype html><html lang="en"><head><title>A good page title for testing purposes here</title>
<meta name="description" content="A clear description of this test page that explains what visitors will find here.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://example.com/good">
</head><body><h1>Main topic</h1>
<p><a href="https://other.example/" target="_blank">External without noopener</a></p>
</body></html>`

const FULL_HEADERS = {
  strictTransportSecurity: 'max-age=31536000',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  hasContentSecurityPolicy: true,
}

describe('informational rules (v2, 0 points)', () => {
  it('do not change the /100 score and report HTTPS + headers + blank links', () => {
    const ev = extractEvidence(HTML, 'https://example.com/good', { xRobotsTag: null, contentType: 'text/html' })
    expect(ev.blankWithoutNoopener).toBe(1)
    expect(ev.internalLinkUrls).toEqual([])
    const findings = [...runFreeRules(ev), ...runInformationalRules(ev, 'https://example.com/good', FULL_HEADERS)]
    expect(scoreOf(findings).max).toBe(100)
    expect(findings.find((f) => f.id === 'https')?.status).toBe('pass')
    expect(findings.find((f) => f.id === 'security-headers')?.status).toBe('pass')
    expect(findings.find((f) => f.id === 'link-blank-noopener')?.status).toBe('attention')
    expect(findings.filter((f) => f.id === 'https' || f.id === 'security-headers' || f.id === 'link-blank-noopener').every((f) => f.maxPoints === 0)).toBe(true)
  })

  it('flags plain HTTP and missing headers without touching the score', () => {
    const ev = extractEvidence(HTML, 'https://example.com/good', { xRobotsTag: null, contentType: 'text/html' })
    const findings = [...runFreeRules(ev), ...runInformationalRules(ev, 'http://example.com/good', {
      strictTransportSecurity: null, xContentTypeOptions: null, xFrameOptions: null, referrerPolicy: null, hasContentSecurityPolicy: false,
    })]
    expect(scoreOf(findings).max).toBe(100)
    expect(findings.find((f) => f.id === 'https')?.status).toBe('attention')
    expect(findings.find((f) => f.id === 'security-headers')?.status).toBe('attention')
  })
})
