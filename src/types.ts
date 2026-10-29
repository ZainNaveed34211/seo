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

export interface AuditResponse {
  version: string
  auditedUrl: string
  finalUrl: string
  status: number
  fetchedAt: string
  redirectChain: { status: number; url: string }[]
  headers: { server: string | null; contentType: string | null; xRobotsTag: string | null }
  findings: Finding[]
  score: Score
  premium: { available: boolean; reason: string }
  sample: boolean
}

export interface ApiError {
  error: string
  code: string
}
