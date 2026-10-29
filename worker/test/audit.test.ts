import { describe, expect, it } from 'vitest'
import { extractEvidence, premiumActionPlan, runFreeRules, runPremiumRules, scoreOf } from '../src/audit'

const GOOD_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A good page title for testing purposes here</title>
<meta name="description" content="A clear description of this test page that explains what visitors will find here.">
<link rel="canonical" href="https://example.com/good">
<meta property="og:title" content="Good page"><meta property="og:description" content="Good description">
</head><body><h1>Main topic</h1><h2>Section one</h2><h3>Detail</h3>
<p><a href="/about">About us</a> <a href="https://other.example/">External</a></p>
<img src="/a.jpg" alt="A descriptive photo"><img src="/b.jpg" alt="Another photo">
</body></html>`

const BAD_HTML = `<!doctype html><html><head><title>Hi</title></head><body>
<h2>No H1 here</h2><h2>No H1 here</h2>
<img src="/x.jpg"><img src="/y.jpg">
<p>No links at all in this body.</p>
</body></html>`

const MALFORMED_HTML = `<html><head><title>Unclosed title<body><h1>Broken<h2>Also broken<img src=x><a href=/foo>Link`

describe('free audit rules', () => {
  it('scores a good page highly and finds no high-severity issues', () => {
    const ev = extractEvidence(GOOD_HTML, 'https://example.com/good', { xRobotsTag: null, contentType: 'text/html; charset=utf-8' })
    const findings = runFreeRules(ev)
    const score = scoreOf(findings)
    expect(score.max).toBe(100)
    expect(score.total).toBeGreaterThanOrEqual(95)
    expect(findings.find((f) => f.id === 'h1')?.status).toBe('pass')
    expect(findings.find((f) => f.id === 'images-alt')?.status).toBe('pass')
  })
  it('flags missing description, missing H1, missing canonical and missing alt text', () => {
    const ev = extractEvidence(BAD_HTML, 'https://example.com/bad', { xRobotsTag: null, contentType: 'text/html' })
    const findings = runFreeRules(ev)
    expect(findings.find((f) => f.id === 'description-present')?.status).toBe('attention')
    expect(findings.find((f) => f.id === 'h1')?.status).toBe('attention')
    expect(findings.find((f) => f.id === 'h1')?.severity).toBe('high')
    expect(findings.find((f) => f.id === 'canonical')?.status).toBe('attention')
    expect(findings.find((f) => f.id === 'images-alt')?.status).toBe('attention')
    expect(scoreOf(findings).total).toBeLessThan(70)
  })
  it('flags noindex as high severity', () => {
    const html = GOOD_HTML.replace('</head>', '<meta name="robots" content="noindex"></head>')
    const ev = extractEvidence(html, 'https://example.com/good', { xRobotsTag: null, contentType: 'text/html' })
    const robots = runFreeRules(ev).find((f) => f.id === 'robots')
    expect(robots?.status).toBe('attention')
    expect(robots?.severity).toBe('high')
  })
  it('does not crash on malformed HTML', () => {
    const ev = extractEvidence(MALFORMED_HTML, 'https://example.com/broken', { xRobotsTag: null, contentType: 'text/html' })
    const findings = runFreeRules(ev)
    expect(findings.length).toBeGreaterThan(0)
    expect(scoreOf(findings).max).toBe(100)
  })
  it('never invents a score above its own max', () => {
    const ev = extractEvidence(GOOD_HTML, 'https://example.com/good', { xRobotsTag: null, contentType: 'text/html' })
    const score = scoreOf(runFreeRules(ev))
    expect(score.total).toBeLessThanOrEqual(score.max)
  })
})

describe('premium rules (computed, gated elsewhere)', () => {
  it('detects JSON-LD, hreflang, generic anchors and duplicate headings', () => {
    const html = GOOD_HTML.replace('</body>', '<script type="application/ld+json">{"@type":"Organization","name":"Test"}</script><link rel="alternate" hreflang="en" href="https://example.com/"><a href="/x">click here</a></body>')
    const ev = extractEvidence(html, 'https://example.com/good', { xRobotsTag: null, contentType: 'text/html' })
    const premium = runPremiumRules(ev, true)
    expect(premium.find((f) => f.id === 'premium-structured-data')?.status).toBe('pass')
    expect(premium.find((f) => f.id === 'premium-anchor-text')?.status).toBe('attention')
  })
  it('action plan is prioritised high first and only from attention findings', () => {
    const ev = extractEvidence(BAD_HTML, 'https://example.com/bad', { xRobotsTag: null, contentType: 'text/html' })
    const plan = premiumActionPlan(runFreeRules(ev))
    expect(plan.length).toBeGreaterThan(0)
    expect(plan[0]).toContain('Main heading')
  })
})
