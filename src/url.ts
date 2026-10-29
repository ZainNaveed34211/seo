// URL NORMALIZATION — frontend mirror of worker/src/security.ts.
// Policy (must match the Worker; the Worker is authoritative, this is UX):
//   - Trim whitespace. Empty input -> helpful message, not a submission.
//   - Bare domain (example.com, www.example.com, example.com/about) ->
//     https:// is prepended. Bare domains prefer HTTPS.
//   - Explicit http:// is allowed; explicit https:// is never downgraded.
//   - Any other scheme (javascript:, file:, ftp:, data:) is rejected.
//   - Credentials, non-80/443 ports, localhost, private/internal hostnames,
//     and hostnames without a dot (and not an IP literal) are rejected.
//   - Plain text is never interpreted as a website.
//   - Path and query are preserved; the fragment is stripped.
//   - Internationalized domains are punycoded by the URL parser.
export type NormalizeResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; error: string }

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet']
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal'])

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const parts = m.slice(1).map(Number)
  if (m.slice(1).some((p) => p.length > 1 && p.startsWith('0'))) return true
  if (parts.some((n) => n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h.includes('%')) return true
  if (h === '::1' || h === '::') return true
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true
  if (h.startsWith('fc') || h.startsWith('fd')) return true
  if (h.startsWith('::ffff:')) return isPrivateIpv4(h.slice('::ffff:'.length))
  if (h.startsWith('2001:db8')) return true
  if (h.startsWith('64:ff9b:')) return true
  return false
}

export function normalizeUrl(raw: string): NormalizeResult {
  const value = raw.trim()
  if (!value) return { ok: false, error: 'Enter a website to analyze, for example example.com or https://example.com/about' }
  if (value.length > 2048) return { ok: false, error: 'That URL is too long (max 2048 characters).' }
  if (/\s/.test(value)) return { ok: false, error: 'That does not look like a valid URL. Check for spaces and try again.' }
  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      return { ok: false, error: 'Only http:// and https:// URLs can be analyzed.' }
    }
  }
  const withScheme = schemeMatch ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: 'That does not look like a valid URL. Try a domain like example.com or a full URL like https://example.com/about' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// URLs can be analyzed.' }
  }
  if (url.username || url.password) {
    return { ok: false, error: 'URLs with a username or password cannot be analyzed.' }
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { ok: false, error: 'That URL has no hostname.' }
  if (BLOCKED_HOSTS.has(host) || host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: 'Private and local addresses cannot be analyzed. Only public websites can be analyzed.' }
  }
  if (!host.includes('.') && !host.includes(':')) {
    return { ok: false, error: 'That does not look like a public website. Enter a domain like example.com.' }
  }
  if (isPrivateIpv4(host) || (host.includes(':') && isPrivateIpv6(host))) {
    return { ok: false, error: 'Private and local addresses cannot be analyzed. Only public websites can be analyzed.' }
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    return { ok: false, error: 'Only standard web ports (80 and 443) can be analyzed.' }
  }
  url.hash = ''
  return { ok: true, url: url.toString(), hostname: url.hostname }
}
