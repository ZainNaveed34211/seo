export type FindingStatus = 'pass' | 'attention' | 'not_checked'
export type Severity = 'high' | 'medium' | 'low' | 'info'

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
  checked: number
  broken: BrokenLink[]
  couldNotVerify: BrokenLink[]
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
  brokenLinks?: BrokenLinksResult
  internalLinkCount?: number
  blankWithoutNoopener?: number
}

export interface ApiError {
  error: string
  code: string
}
