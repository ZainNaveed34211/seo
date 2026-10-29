import { describe, expect, it } from 'vitest'
import { normalizeTargetUrl, validateTargetUrl } from '../src/security'

describe('URL normalization (bare domain -> https, same policy as frontend)', () => {
  it('normalizes a bare domain to https with a trailing slash', () => {
    const r = validateTargetUrl('example.com')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.toString()).toBe('https://example.com/')
  })
  it('preserves www and a page path', () => {
    const r = validateTargetUrl('www.example.com')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.toString()).toBe('https://www.example.com/')
    const p = validateTargetUrl('https://example.com/about')
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.url.toString()).toBe('https://example.com/about')
    const q = validateTargetUrl('example.com/about?ref=1#section')
    expect(q.ok).toBe(true)
    if (q.ok) expect(q.url.toString()).toBe('https://example.com/about?ref=1')
  })
  it('keeps an explicit http URL and never downgrades https', () => {
    const h = validateTargetUrl('http://example.com/')
    expect(h.ok).toBe(true)
    if (h.ok) expect(h.url.protocol).toBe('http:')
    const s = validateTargetUrl('https://example.com/')
    expect(s.ok).toBe(true)
    if (s.ok) expect(s.url.protocol).toBe('https:')
  })
  it('rejects empty, plain text, no-dot, and malformed input', () => {
    expect(validateTargetUrl('').ok).toBe(false)
    expect(validateTargetUrl('   ').ok).toBe(false)
    expect(validateTargetUrl('hello world').ok).toBe(false)
    expect(validateTargetUrl('example').ok).toBe(false)
    expect(validateTargetUrl('https://').ok).toBe(false)
  })
  it('rejects unsupported schemes, credentials, and non-standard ports', () => {
    expect(validateTargetUrl('javascript:alert(1)').ok).toBe(false)
    expect(validateTargetUrl('file:///etc/passwd').ok).toBe(false)
    expect(validateTargetUrl('ftp://example.com/').ok).toBe(false)
    expect(validateTargetUrl('https://user:pass@example.com/').ok).toBe(false)
    expect(validateTargetUrl('https://example.com:8080/').ok).toBe(false)
    expect(validateTargetUrl('example.com:8080/').ok).toBe(false)
  })
  it('rejects localhost, private IPs, and internal suffixes', () => {
    expect(validateTargetUrl('localhost').ok).toBe(false)
    expect(validateTargetUrl('http://127.0.0.1/').ok).toBe(false)
    expect(validateTargetUrl('http://10.0.0.5/').ok).toBe(false)
    expect(validateTargetUrl('http://192.168.1.1/').ok).toBe(false)
    expect(validateTargetUrl('http://[::1]/').ok).toBe(false)
    expect(validateTargetUrl('https://internal.example.local/').ok).toBe(false)
    expect(validateTargetUrl('https://metadata.google.internal/').ok).toBe(false)
  })
  it('punycodes internationalized domains instead of rejecting them', () => {
    const r = normalizeTargetUrl('münchen.de')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.hostname).toContain('xn--')
  })
  it('accepts a public IP literal on a standard port', () => {
    const r = validateTargetUrl('https://93.184.215.14/')
    expect(r.ok).toBe(true)
  })
})
