export type FindingStatus = 'pass' | 'attention' | 'not_checked'
export type Severity = 'high' | 'medium' | 'low' | 'info'

// Priority wording for the new five-tool UI. The Worker still uses
// Severity internally; the UI maps: high -> High, medium -> Medium,
// low -> Low, info -> Low, and a missing/noindex-style finding is shown
// as Critical only when the finding itself says so in its title/evidence.
// No priority is invented for a check that was not run.
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

export interface Finding {
  id: string
  title: string
  status: FindingStatus
  severity: Severity
  points: number
  maxPoints: number
  explanation: string
  whyItMatters: string
  evidence: string
  recommendation: string
}

export interface Score {
  total: number
  max: number
  grade: string
  gradeNote: string
}

export interface BrokenLink {
  url: string
  status: number | null
  reason: string
}

export interface BrokenLinksResult {
  /** Internal links actually attempted (bounded, see LIMITS). */
  checked: number
  broken: BrokenLink[]
  /** Attempted but could not be verified (network, 403, 429, timeout). NOT broken. */
  couldNotVerify: BrokenLink[]
  /** Internal links not attempted because of the Starter bound. */
  unchecked: number
  note: string
}

export interface LaunchChecks {
  version: string
  auditedUrl: string
  origin: string
  https: boolean
  robotsTxt: { found: boolean; status: number | null; sitemapUrls: string[] }
  sitemap: { found: boolean; url: string | null; status: number | null }
  checkedAt: string
  note: string
}

export interface AuditResponse {
  version: string
  auditedUrl: string
  finalUrl: string
  status: number
  fetchedAt: string
  redirectChain: { status: number; url: string }[]
  headers: {
    server: string | null
    contentType: string | null
    xRobotsTag: string | null
    // Optional: present only when the Worker returns them (v2 API).
    // Absence means "not checked", never "failed".
    strictTransportSecurity?: string | null
    xContentTypeOptions?: string | null
    xFrameOptions?: string | null
    referrerPolicy?: string | null
    hasContentSecurityPolicy?: boolean
  }
  findings: Finding[]
  score: Score
  premium: { available: boolean; reason: string }
  sample: boolean
  /** Optional: absent on a v1 Worker or a sample report. */
  brokenLinks?: BrokenLinksResult
  /** Internal link count from the audited page, when the Worker reports it. */
  internalLinkCount?: number
  /** External _blank links missing rel=noopener, when reported. */
  blankWithoutNoopener?: number
}

export interface ApiError {
  error: string
  code: string
}
