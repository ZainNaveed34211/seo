import { describe, expect, it } from 'vitest'
import { RateLimiter, isPrivateIpv4, isPrivateIpv6, resolveRedirect, validateTargetUrl } from '../src/security'

describe('validateTargetUrl', () => {
  it('accepts a normal public https URL', () => {
    const r = validateTargetUrl('https://example.com/page')
    expect(r.ok).toBe(true)
  })
  it('rejects non-http schemes', () => {
    expect(validateTargetUrl('file:///etc/passwd').ok).toBe(false)
    expect(validateTargetUrl('javascript:alert(1)').ok).toBe(false)
    expect(validateTargetUrl('data:text/html,hi').ok).toBe(false)
  })
  it('rejects credentials in the URL', () => {
    expect(validateTargetUrl('https://user:pass@example.com/').ok).toBe(false)
  })
  it('rejects localhost and private hostnames', () => {
    for (const u of ['http://localhost/', 'http://localhost:3000/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.0.9/', 'http://169.254.169.254/latest/meta-data/', 'http://internal/', 'http://app.local/', 'http://[::1]/']) {
      expect(validateTargetUrl(u).ok, u).toBe(false)
    }
  })
  it('rejects non-standard ports (port-scanning defence)', () => {
    expect(validateTargetUrl('https://example.com:8443/').ok).toBe(false)
    expect(validateTargetUrl('https://example.com:8080/').ok).toBe(false)
  })
  it('rejects malformed and overlong input', () => {
    expect(validateTargetUrl('not a url').ok).toBe(false)
    expect(validateTargetUrl('').ok).toBe(false)
    expect(validateTargetUrl('x'.repeat(3000)).ok).toBe(false)
    expect(validateTargetUrl(123 as unknown as string).ok).toBe(false)
  })
  it('rejects octal-style IPv4 tricks', () => {
    expect(isPrivateIpv4('0177.0.0.1')).toBe(false) // not a clean decimal IP at all
    expect(validateTargetUrl('http://0177.0.0.1/').ok).toBe(false)
  })
})

describe('private IP ranges', () => {
  it('flags CGNAT, link-local, multicast and reserved', () => {
    expect(isPrivateIpv4('100.64.0.1')).toBe(true)
    expect(isPrivateIpv4('224.0.0.1')).toBe(true)
    expect(isPrivateIpv4('0.0.0.0')).toBe(true)
    expect(isPrivateIpv4('8.8.8.8')).toBe(false)
    expect(isPrivateIpv4('93.184.216.34')).toBe(false)
  })
  it('flags IPv6 private ranges and mapped IPv4', () => {
    expect(isPrivateIpv6('fe80::1')).toBe(true)
    expect(isPrivateIpv6('fd00::1')).toBe(true)
    expect(isPrivateIpv6('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIpv6('::ffff:8.8.8.8')).toBe(false)
  })
})

describe('redirect validation', () => {
  it('blocks redirects to private targets', () => {
    const from = new URL('https://example.com/')
    expect(resolveRedirect(from, 'http://127.0.0.1/admin').ok).toBe(false)
    expect(resolveRedirect(from, 'http://169.254.169.254/').ok).toBe(false)
    expect(resolveRedirect(from, '/next').ok).toBe(true)
    expect(resolveRedirect(from, 'https://other.example/page').ok).toBe(true)
  })
})

describe('rate limiter', () => {
  it('allows up to the limit, then blocks', () => {
    const limiter = new RateLimiter(3, 60_000)
    expect(limiter.check('1.2.3.4').allowed).toBe(true)
    expect(limiter.check('1.2.3.4').allowed).toBe(true)
    expect(limiter.check('1.2.3.4').allowed).toBe(true)
    const blocked = limiter.check('1.2.3.4')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
    expect(limiter.check('5.6.7.8').allowed).toBe(true)
  })
})
