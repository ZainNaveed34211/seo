import { describe, expect, it } from 'vitest'
import { checkBrokenLinks, classifyBrokenStatus } from '../src/links'

describe('classifyBrokenStatus', () => {
  it('treats 2xx/3xx as ok, 404/500 as broken, 403/429/405 as unknown (not broken)', () => {
    expect(classifyBrokenStatus(200)).toBe('ok')
    expect(classifyBrokenStatus(301)).toBe('ok')
    expect(classifyBrokenStatus(404)).toBe('broken')
    expect(classifyBrokenStatus(500)).toBe('broken')
    expect(classifyBrokenStatus(403)).toBe('unknown')
    expect(classifyBrokenStatus(429)).toBe('unknown')
    expect(classifyBrokenStatus(405)).toBe('unknown')
  })
})

describe('checkBrokenLinks', () => {
  it('checks only up to the limit and never labels unknown statuses as broken', async () => {
    const fetchFn = async (url: string) => {
      const status = url.includes('gone') ? 404 : url.includes('forbidden') ? 403 : 200
      return new Response(null, { status })
    }
    const result = await checkBrokenLinks(
      ['https://example.com/ok', 'https://example.com/gone', 'https://example.com/forbidden', 'https://example.com/extra'],
      3,
      fetchFn as never,
    )
    expect(result.checked).toBe(3)
    expect(result.unchecked).toBe(1)
    expect(result.broken.map((b) => b.url)).toEqual(['https://example.com/gone'])
    expect(result.couldNotVerify.map((b) => b.url)).toEqual(['https://example.com/forbidden'])
  })

  it('refuses to fetch private targets and counts them as could-not-verify', async () => {
    const fetchFn = async () => new Response(null, { status: 200 })
    const result = await checkBrokenLinks(['http://127.0.0.1/secret'], 5, fetchFn as never)
    expect(result.broken).toEqual([])
    expect(result.couldNotVerify).toHaveLength(1)
  })

  it('treats a fetch throw as could-not-verify, not broken', async () => {
    const fetchFn = async () => { throw new Error('network down') }
    const result = await checkBrokenLinks(['https://example.com/down'], 5, fetchFn as never)
    expect(result.broken).toEqual([])
    expect(result.couldNotVerify).toHaveLength(1)
  })
})
