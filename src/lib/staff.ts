// The single staff roster for a location. Enter someone once here; other
// screens (Tipshare now, scheduling later) pull from this list — no re-adding.
import { load, save } from './store'
import { useScope } from './scope'

export interface Person {
  id: string
  name: string
  /** Primary job code — the first one that mapped. Tipshare still reads this. */
  role: string
  /**
   * Every job code this person holds. Most of the roster carries several
   * ("Expo; Host; Server; ToGo"), and collapsing that to one hid who could
   * actually cover a station. Absent on anyone added before this existed, so
   * read it through rolesOf(), which falls back to `role`.
   */
  roles?: string[]
  phone: string
}

/** Every role a person should be listed under. */
export function rolesOf(p: Pick<Person, 'role' | 'roles'>): string[] {
  if (p.roles?.length) return p.roles
  return p.role ? [p.role] : []
}

function key(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::staff:list`
}
export const getStaff = (): Person[] => load<Person[]>(key(), [])
export const setStaff = (p: Person[]): void => save(key(), p)

/**
 * Add people to the roster, and refresh the job codes of anyone already on it.
 *
 * A re-dropped export used to skip known names outright, which meant a roster
 * already imported could never pick up a new job code — someone cross-trained
 * onto the bar stayed a Host forever. Toast owns job codes, so a re-drop
 * updates them; everything entered by hand here (the person, their phone) is
 * left alone.
 */
export function addPeople(people: Omit<Person, 'id'>[]): { added: number; updated: number } {
  const cur = getStaff()
  const incoming = new Map(people.filter((p) => p.name).map((p) => [p.name.toLowerCase(), p]))

  let updated = 0
  const merged = cur.map((p) => {
    const inc = incoming.get(p.name.toLowerCase())
    if (!inc) return p
    const sameRoles = rolesOf(p).join('|') === rolesOf(inc).join('|')
    if (sameRoles && p.role === inc.role) return p
    updated++
    return { ...p, role: inc.role, roles: inc.roles }
  })

  const have = new Set(cur.map((p) => p.name.toLowerCase()))
  const fresh = people
    .filter((p) => p.name && !have.has(p.name.toLowerCase()))
    .map((p) => ({ ...p, id: newId() }))

  setStaff([...merged, ...fresh])
  return { added: fresh.length, updated }
}

/** Does this text look like an employee roster export (e.g. from Toast)? */
export function isRosterDoc(text: string): boolean {
  const h = text.split(/\r?\n/)[0]?.toLowerCase() ?? ''
  return (/first name/.test(h) && /last name/.test(h)) || /employee id|job description|job title/.test(h)
}

// Front of house first, then the line, then who runs the place — the order the
// roster groups read in. ToGo and Corporate are their own codes in Toast and are
// their own groups here.
//
// Key and Shift Lead are hourly responsibilities rather than salaried
// management, so they sit between the floor codes and Manager: the people who
// hold them almost always hold a floor code too, which is the whole reason a
// person needs more than one.
export const ROLES = [
  'Server',
  'Bartender',
  'Host',
  'ToGo',
  'Expo',
  'Cook',
  'Dish',
  'Key',
  'Shift Lead',
  'Manager',
  'Corporate',
]

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
    out.push({
      name,
      role: primaryRole(job),
      roles: allRoles(job),
      phone: (iPhone >= 0 ? c[iPhone] : '') || '',
    })
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
  // Before the manager test: office staff carry a "Corporate" code and belong
  // on the roster labelled as such, not mixed in with the store's team.
  if (/corporate|corp\b/.test(s)) return 'Corporate'
  // Before the manager test: these are hourly codes of their own, and folding
  // them into Manager hid who actually carries keys or leads a shift.
  if (/shift lead|shift.?leader|lead\b/.test(s)) return 'Shift Lead'
  if (/\bkey\b|keyholder|key holder/.test(s)) return 'Key'
  if (/gm|general manager|manager|mgr|owner|kitchen manager/.test(s)) return 'Manager'
  if (/bartender|bar\b/.test(s)) return 'Bartender'
  // Before the host test: ToGo is its own job code in Toast, and folding it into
  // Host hid who can actually run the to-go station.
  if (/to.?go|take.?out|curbside/.test(s)) return 'ToGo'
  if (/host|hostess|busser|bus\b/.test(s)) return 'Host'
  if (/expo|food runner|runner/.test(s)) return 'Expo'
  if (/dish|steward/.test(s)) return 'Dish'
  if (/cook|line|kitchen|grill|fry|prep|boh/.test(s)) return 'Cook'
  if (/server|wait|foh/.test(s)) return 'Server'
  return ROLES.find((r) => r.toLowerCase() === s) || ''
}

/**
 * Every role a Toast "Job Descriptions" cell maps to, in the cell's own order.
 * Codes that aren't roles — Training, Catering — simply don't map and drop out.
 */
export function allRoles(cell?: string): string[] {
  const out: string[] = []
  for (const part of (cell || '').split(/[;,]/)) {
    const r = mapRole(part.trim())
    if (r && !out.includes(r)) out.push(r)
  }
  return out
}

