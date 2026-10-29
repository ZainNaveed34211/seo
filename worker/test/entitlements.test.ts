import { describe, expect, it } from 'vitest'
import { isPremiumEntitled, PREMIUM_NOT_ENABLED } from '../src/entitlements'

describe('premium entitlements (v1)', () => {
  it('is never entitled in this release, even with a plausible token header', () => {
    const req = new Request('https://seo.kluzar.com/api/premium-audit', {
      method: 'POST',
      headers: { Authorization: 'Bearer demo-token-123' },
    })
    expect(isPremiumEntitled(req, {})).toBe(false)
    expect(isPremiumEntitled(req, { PREMIUM_ENABLED: 'true' })).toBe(false)
  })
  it('premium-not-enabled payload does not leak any entitlement detail', () => {
    expect(PREMIUM_NOT_ENABLED.code).toBe('PREMIUM_NOT_ENABLED')
    expect(JSON.stringify(PREMIUM_NOT_ENABLED)).not.toContain('token')
  })
})
