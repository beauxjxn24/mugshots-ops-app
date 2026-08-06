// The single staff roster for a location. Enter someone once here; other
// screens (Tipshare now, scheduling later) pull from this list — no re-adding.
import { load, save } from './store'
import { useScope } from './scope'

export interface Person {
  id: string
  name: string
  role: string
  phone: string
}

function key(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::staff:list`
}
export const getStaff = (): Person[] => load<Person[]>(key(), [])
export const setStaff = (p: Person[]): void => save(key(), p)

/** Add people to the roster, skipping names already present. Returns added count. */
export function addPeople(people: Omit<Person, 'id'>[]): number {
  const cur = getStaff()
  const have = new Set(cur.map((p) => p.name.toLowerCase()))
  const fresh = people
    .filter((p) => p.name && !have.has(p.name.toLowerCase()))
    .map((p) => ({ ...p, id: newId() }))
  setStaff([...cur, ...fresh])
  return fresh.length
}

/** Does this text look like an employee roster export (e.g. from Toast)? */
export function isRosterDoc(text: string): boolean {
  const h = text.split(/\r?\n/)[0]?.toLowerCase() ?? ''
  return (/first name/.test(h) && /last name/.test(h)) || /employee id|job description|job title/.test(h)
}

export const ROLES = ['Server', 'Bartender', 'Host', 'Cook', 'Expo', 'Dish', 'Manager']

export function newId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}

/** Parse a pasted list: one person per line, "Name" or "Name, Role". */
export function parseRoster(text: string): Omit<Person, 'id'>[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, role] = line.split(/[,\t]/).map((s) => s.trim())
      return { name, role: mapRole(role) || 'Server', phone: '' }
    })
    .filter((p) => p.name.length > 0)
}

/**
 * Smart import — accepts a Toast employee export (CSV) or a plain pasted list.
 * Detects a CSV header and maps First/Last/Name + Job Title columns; otherwise
 * falls back to one-per-line parsing.
 */
export function importPeople(text: string): Omit<Person, 'id'>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].toLowerCase()
  const looksCsv = header.includes(',') && /(name|employee|first|last|job|title|role|position)/.test(header)
  if (!looksCsv) return parseRoster(text)

  const cols = splitCsv(lines[0]).map((h) => h.toLowerCase())
  const find = (names: string[]) => cols.findIndex((h) => names.some((n) => h.includes(n)))
  const iFull = find(['employee name', 'full name'])
  const iFirst = find(['first'])
  const iLast = find(['last'])
  // Prefer the human-readable job column; never the "Job GUIDs" (UUID) column.
  const iRole = cols.findIndex(
    (h) =>
      !h.includes('guid') &&
      (h.includes('description') || h.includes('job title') || h.includes('title') || h.includes('position') || h.includes('role')),
  )
  const iPhone = find(['phone', 'mobile'])

  const iEmail = find(['email'])

  const out: Omit<Person, 'id'>[] = []
  const seen = new Set<string>()
  for (let r = 1; r < lines.length; r++) {
    const c = splitCsv(lines[r])
    let name = ''
    if (iFirst >= 0) name = [c[iFirst], iLast >= 0 ? c[iLast] : ''].filter(Boolean).join(' ').trim()
    if (!name && iFull >= 0) name = c[iFull] ?? ''
    if (!name) name = c[0] ?? ''
    // Toast pads the CSV with empty-ish cells (''), which must not become names.
    name = name.trim().replace(/^'+|'+$/g, '').trim()
    if (!name) continue
    const job = iRole >= 0 ? c[iRole] ?? '' : ''
    if (isSystemAccount(name, job, iEmail >= 0 ? c[iEmail] : '')) continue
    // A roster export lists a person once, but re-drops and multi-location
    // files repeat them — one row per person.
    const dedupe = name.toLowerCase()
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({ name, role: primaryRole(job), phone: (iPhone >= 0 ? c[iPhone] : '') || '' })
  }
  return out
}

/**
 * Toast rosters carry service accounts alongside real people — the default
 * till login, the online-ordering pseudo-user, delivery-service and reporting
 * integrations, generic station logins ("Expo Expo", "Party Party"). They're
 * not employees, and importing them makes the roster look broken on day one.
 */
function isSystemAccount(name: string, job: string, email?: string): boolean {
  const n = name.toLowerCase()
  const j = (job || '').toLowerCase()
  if (/do not delete|toast default|online ordering|test user/.test(n)) return true
  if (/delivery service driver|integrations?|reporting/.test(j)) return true
  if (/@toasttab\.com$/.test((email || '').trim().toLowerCase())) return true
  // "Expo Expo" / "Party Party" — a station login, not a person.
  const parts = n.split(/\s+/)
  if (parts.length === 2 && parts[0] === parts[1]) return true
  return false
}

/**
 * A Toast "Job Descriptions" cell can list several roles ("Bartender; General
 * Manager; Host; Server"). Take the first one that maps to a known role — so a
 * secondary GM job-code doesn't promote everyone to Manager.
 */
function primaryRole(cell?: string): string {
  if (!cell) return 'Server'
  for (const part of cell.split(/[;,]/)) {
    const r = mapRole(part.trim())
    if (r) return r
  }
  return 'Server'
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim().replace(/^"|"$/g, ''))
}

/** Map a free-text job title (e.g. Toast's) to one of our roles. */
function mapRole(raw?: string): string | '' {
  const s = (raw || '').toLowerCase()
  if (!s) return ''
  if (/gm|general manager|manager|mgr|owner|kitchen manager/.test(s)) return 'Manager'
  if (/bartender|bar\b/.test(s)) return 'Bartender'
  if (/host|hostess|busser|bus\b|to.?go|takeout/.test(s)) return 'Host'
  if (/expo|food runner|runner/.test(s)) return 'Expo'
  if (/dish|steward/.test(s)) return 'Dish'
  if (/cook|line|kitchen|grill|fry|prep|boh/.test(s)) return 'Cook'
  if (/server|wait|foh/.test(s)) return 'Server'
  return ROLES.find((r) => r.toLowerCase() === s) || ''
}

