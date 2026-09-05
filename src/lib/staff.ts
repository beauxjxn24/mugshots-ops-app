// The single staff roster for a location. Enter someone once here; other
// screens (Tipshare now, scheduling later) pull from this list — no re-adding.
import { load, save } from './store'
import { useScope } from './scope'

export interface Person {
  id: string
  name: string
  /**
   * Toast's GUID for this person — the only identifier that survives a name
   * change, and what a weekly re-import matches on first. Two people really
   * can share a name, and one person really can change theirs; matching on
   * the name alone gets both of those wrong, which is how a roster ends up
   * with the same server on it twice.
   */
  extId?: string
  /** Toast's "Employee ID" (1001, 1004…) — the store's own number. */
  empNo?: string
  /** ISO date of the most recent export this person appeared in. */
  lastSeen?: string
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
 * How many rows the last parse skipped because they belong to another store.
 * Read straight after importPeople() — the import panel says so on screen,
 * because "nothing imported" needs a reason attached to it.
 */
let lastSkipped = 0
export const rowsSkippedForOtherStores = (): number => lastSkipped

/**
 * One person's identity, normalized for matching: case, punctuation, accents
 * and spacing all go, and "Bartholomew, Beau" reads the same as "Beau
 * Bartholomew" — payroll exports print names both ways.
 */
export function personKey(name: string): string {
  const n = (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  const flipped = /^[^,]+,\s*[^,]+$/.test(n)
    ? n.split(',').map((s) => s.trim()).reverse().join(' ')
    : n
  return flipped.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface RosterMerge {
  added: number
  updated: number
  unchanged: number
  /** On the roster but not in this export. Kept — never deleted. */
  absent: Person[]
}

/**
 * Merge an export into the roster. Nobody is ever removed.
 *
 * This import runs every week, so identity is the whole job: match on Toast's
 * GUID first, then the store's employee number, then the normalized name. A
 * marriage (new surname, same GUID) updates the person instead of adding a
 * second one, and two real people who share a name stay two people.
 *
 * Toast owns job codes, so a re-drop refreshes them and fills in a phone or
 * employee number that was blank; anything typed in by hand is left alone.
 * People missing from the export are reported, not deleted — somebody on leave
 * still has to be on next week's schedule.
 */
export function addPeople(people: Omit<Person, 'id'>[]): RosterMerge {
  const cur = getStaff()
  const today = isoToday()

  const byExt = new Map<string, Person>()
  const byNo = new Map<string, Person>()
  const byName = new Map<string, Person>()
  for (const p of cur) {
    if (p.extId) byExt.set(p.extId, p)
    if (p.empNo) byNo.set(p.empNo, p)
    const k = personKey(p.name)
    if (k && !byName.has(k)) byName.set(k, p)
  }

  const patch = new Map<string, Person>() // roster id → the updated person
  const fresh: Person[] = []
  const seen = new Set<string>()
  let added = 0
  let updated = 0
  let unchanged = 0

  for (const inc of people) {
    if (!inc.name) continue
    const hit =
      (inc.extId ? byExt.get(inc.extId) : undefined) ??
      (inc.empNo ? byNo.get(inc.empNo) : undefined) ??
      byName.get(personKey(inc.name))
    if (!hit) {
      const person: Person = { ...inc, id: newId(), lastSeen: today }
      fresh.push(person)
      // So the same new person appearing twice in one file can't land twice.
      if (person.extId) byExt.set(person.extId, person)
      if (person.empNo) byNo.set(person.empNo, person)
      byName.set(personKey(person.name), person)
      seen.add(person.id)
      added++
      continue
    }
    seen.add(hit.id)
    const before = patch.get(hit.id) ?? hit
    const next: Person = {
      ...before,
      role: inc.role || before.role,
      roles: inc.roles?.length ? inc.roles : before.roles,
      // A new spelling is the person's real name now — but only when the match
      // was on something stronger than the name itself.
      name: inc.extId && before.extId === inc.extId && inc.name ? inc.name : before.name,
      phone: before.phone || inc.phone || '',
      extId: before.extId || inc.extId,
      empNo: before.empNo || inc.empNo,
      lastSeen: today,
    }
    const changed =
      next.name !== hit.name ||
      next.role !== hit.role ||
      rolesOf(next).join('|') !== rolesOf(hit).join('|') ||
      next.phone !== hit.phone ||
      next.extId !== hit.extId ||
      next.empNo !== hit.empNo
    if (!patch.has(hit.id)) {
      if (changed) updated++
      else unchanged++
    }
    patch.set(hit.id, next)
  }

  const merged = cur.map((p) => patch.get(p.id) ?? p)
  setStaff([...merged, ...fresh])
  return { added, updated, unchanged, absent: merged.filter((p) => !seen.has(p.id)) }
}

/**
 * Fold duplicate roster rows into one — for rosters that picked up doubles
 * before identity matching existed. Rows that share a GUID, an employee number
 * or a normalized name merge into the first, keeping whatever each row knew: a
 * phone typed on one, job codes imported onto the other.
 */
export function dedupeRoster(): { merged: number } {
  const cur = getStaff()
  const keep: Person[] = []
  const at = new Map<string, number>()
  let merged = 0
  for (const p of cur) {
    const keys = [p.extId && `g:${p.extId}`, p.empNo && `n:${p.empNo}`, `k:${personKey(p.name)}`].filter(
      Boolean,
    ) as string[]
    const hitIdx = keys.map((k) => at.get(k)).find((i) => i != null)
    if (hitIdx == null) {
      keep.push(p)
      for (const k of keys) at.set(k, keep.length - 1)
      continue
    }
    const a = keep[hitIdx]
    keep[hitIdx] = {
      ...a,
      name: a.name || p.name,
      role: a.role || p.role,
      roles: rolesOf(a).length >= rolesOf(p).length ? a.roles : p.roles,
      phone: a.phone || p.phone,
      extId: a.extId || p.extId,
      empNo: a.empNo || p.empNo,
      lastSeen: [a.lastSeen, p.lastSeen].filter(Boolean).sort().pop(),
    }
    for (const k of keys) at.set(k, hitIdx)
    merged++
  }
  if (merged) setStaff(keep)
  return { merged }
}

/** How many roster rows would fold together right now. */
export function duplicateCount(list: Person[] = getStaff()): number {
  const at = new Set<string>()
  let dupes = 0
  for (const p of list) {
    const keys = [p.extId && `g:${p.extId}`, p.empNo && `n:${p.empNo}`, `k:${personKey(p.name)}`].filter(
      Boolean,
    ) as string[]
    if (keys.some((k) => at.has(k))) dupes++
    for (const k of keys) at.add(k)
  }
  return dupes
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
  // Toast's GUID column is the stable identity; "Employee ID" is the store's
  // own number. Either beats matching on a name that can change.
  const iGuid = cols.findIndex((h) => h.trim() === 'guid' || h.includes('employee guid'))
  const iEmpNo = cols.findIndex((h) => h.includes('employee id') || h.trim() === 'employee #')
  const iLoc = cols.findIndex((h) => h.includes('location') || h.includes('restaurant'))

  // A Toast export can cover every store on the account, and dropping one
  // whole puts Flowood's team on Pearl's roster — a duplicate of somebody who
  // works somewhere else. Keep the rows for the store that's open. A row whose
  // location clearly belongs to a DIFFERENT store of this concept is skipped
  // and counted; a label we don't recognise at all (a single-store export
  // named something else) is kept, because importing nobody is worse.
  const { here, others } = locationWords()
  const belongs = (loc: string) => {
    const l = loc.toLowerCase()
    if (!l || here.some((w) => l.includes(w))) return 'here'
    return others.some((w) => l.includes(w)) ? 'elsewhere' : 'unknown'
  }
  let skipped = 0
  const body =
    iLoc >= 0 && here.length
      ? lines.slice(1).filter((l) => {
          const where = belongs(splitCsv(l)[iLoc] ?? '')
          if (where === 'elsewhere') {
            skipped++
            return false
          }
          return true
        })
      : lines.slice(1)
  lastSkipped = skipped

  const out: Omit<Person, 'id'>[] = []
  const seen = new Set<string>()
  for (const line of body) {
    const c = splitCsv(line)
    let name = ''
    if (iFirst >= 0) name = [c[iFirst], iLast >= 0 ? c[iLast] : ''].filter(Boolean).join(' ').trim()
    if (!name && iFull >= 0) name = c[iFull] ?? ''
    if (!name) name = c[0] ?? ''
    // Toast pads the CSV with empty-ish cells (''), which must not become names.
    name = name.trim().replace(/^'+|'+$/g, '').trim()
    if (!name) continue
    const job = iRole >= 0 ? c[iRole] ?? '' : ''
    if (isSystemAccount(name, job, iEmail >= 0 ? c[iEmail] : '')) continue
    const extId = iGuid >= 0 ? (c[iGuid] || '').trim() : ''
    const empNo = iEmpNo >= 0 ? (c[iEmpNo] || '').trim() : ''
    // A roster export lists a person once, but re-drops and multi-location
    // files repeat them — one row per person, keyed the same way the merge is.
    const dedupe = extId ? `g:${extId}` : empNo ? `n:${empNo}` : `k:${personKey(name)}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({
      name,
      role: primaryRole(job),
      roles: allRoles(job),
      phone: (iPhone >= 0 ? c[iPhone] : '') || '',
      ...(extId ? { extId } : {}),
      ...(empNo ? { empNo } : {}),
    })
  }
  return out
}

/**
 * Words that identify the store that's open, and the ones that identify the
 * concept's other stores, for reading a Location column:
 * "Mugshots Grill & Bar - Flowood, MS" → matched by "flowood".
 */
function locationWords(): { here: string[]; others: string[] } {
  const s = useScope.getState()
  const concept = s.concepts.find((c) => c.id === s.currentConcept)
  const noise = ['mugshots', 'grill', 'store', 'location', 'restaurant']
  const wordsFor = (id: string, name: string) =>
    [id, name]
      .join(' ')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !noise.includes(w))
  const here = new Set(
    wordsFor(
      s.currentLocation,
      concept?.locations.find((l) => l.id === s.currentLocation)?.name ?? '',
    ),
  )
  const others = new Set<string>()
  for (const l of concept?.locations ?? []) {
    if (l.id === s.currentLocation) continue
    for (const w of wordsFor(l.id, l.name)) if (!here.has(w)) others.add(w)
  }
  return { here: [...here], others: [...others] }
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

