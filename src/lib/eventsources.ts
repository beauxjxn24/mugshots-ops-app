// What the local-events tracker watches.
//
// The events ticker on the Dashboard has always been a list somebody typed.
// That works exactly as well as somebody remembering to type it, which on a
// Friday is not at all — and the nights it misses are the nights it was for.
//
// This is the other half: the sources a backend reads on a schedule so the list
// fills itself. Nothing here fetches anything yet; there is no server to fetch
// from. What it does now is settle WHAT gets watched, per store, in a shape the
// fetcher can be built against instead of retrofitted onto.
//
// ── Why the list is editable, and seeded per metro ────────────────────────────
//
// The seed below is the Jackson metro, because that's where Flowood and Pearl
// are. A store in another state has different chambers, different venues and a
// different school district, and seven Mississippi chamber calendars would be
// noise on its screen. So the seed only lands for the concept it's for, and
// every store can add, remove and turn off whatever it likes.
import { load, save } from './store'
import { useScope } from './scope'

export type SourceKind = 'chamber' | 'venue' | 'sports' | 'schools' | 'weather' | 'inbox'

export const KIND_LABEL: Record<SourceKind, string> = {
  chamber: 'Chambers of commerce',
  venue: 'Venues',
  sports: 'Teams & schools',
  schools: 'School calendar',
  weather: 'Weather',
  inbox: 'Inbox',
}

/** Read order — nearest-and-loudest first, roughly how much each moves a night. */
export const KIND_ORDER: SourceKind[] = ['venue', 'chamber', 'sports', 'schools', 'weather', 'inbox']

export interface EventSource {
  id: string
  name: string
  kind: SourceKind
  /** The town it covers — the "surrounding cities" the list is grouped by. */
  city: string
  /** Where a fetcher would go. Blank on the ones that need a decision first. */
  url?: string
  /**
   * How it would actually be read. This is a build note, not a caption: most of
   * the chambers below run the same ChamberMaster portal software, which is the
   * difference between seven scrapers and one.
   */
  how?: string
  /** Rough miles from Flowood — a sell-out eight miles away is not a sell-out thirty. */
  miles?: number
  /** Turned off by this store. Kept rather than deleted so it can come back. */
  off?: boolean
  /** Added by a manager rather than shipped — never overwritten by a new seed. */
  own?: boolean
}

/**
 * The Jackson metro seed.
 *
 * Every URL here was checked rather than guessed. Two things worth knowing that
 * a guess would have got wrong: the chambers nearly all run ChamberMaster
 * portals on `business.` / `members.` subdomains, and Trustmark Park is the
 * Mississippi Mud Monsters (Frontier League) now — the Braves left.
 */
const JACKSON_METRO: EventSource[] = [
  // ── Venues ────────────────────────────────────────────────────────────────
  {
    id: 'brandon-amp',
    name: 'Brandon Amphitheater',
    kind: 'venue',
    city: 'Brandon',
    miles: 8,
    url: 'https://www.livenation.com/venue/KovZ917AQ6V/brandon-amphitheater-events',
    how: 'Live Nation venue page. A 8,500-seat shed eight miles out — the single biggest swing on this list.',
  },
  {
    id: 'trustmark-park',
    name: 'Trustmark Park — Mississippi Mud Monsters',
    kind: 'venue',
    city: 'Pearl',
    miles: 4,
    url: 'https://www.ticketmaster.com/trustmark-park-tickets-pearl/venue/222132',
    how: 'Frontier League home schedule. Published as a full season at once, so it only needs reading a few times a year.',
  },
  {
    id: 'ms-coliseum',
    name: 'Mississippi Coliseum',
    kind: 'venue',
    city: 'Jackson',
    miles: 7,
    url: 'https://fairgrounds.mdac.ms.gov/mississippi-fairgrounds/upcoming-events/',
    how: 'State Fairgrounds "upcoming events" — covers the Coliseum and the Equine Center.',
  },
  {
    id: 'ms-trade-mart',
    name: 'Mississippi Trade Mart',
    kind: 'venue',
    city: 'Jackson',
    miles: 7,
    url: 'https://fairgrounds.mdac.ms.gov/mississippi-fairgrounds/trade-mart/',
    how: 'Same fairgrounds feed. Consignment sales, gun shows, comic con — daytime crowds, so lunch rather than dinner.',
  },

  // ── Chambers of commerce, nearest out ─────────────────────────────────────
  {
    id: 'chamber-flowood',
    name: 'Chamber of Flowood & Visitor Center',
    kind: 'chamber',
    city: 'Flowood',
    miles: 0,
    url: 'https://members.flowoodchamber.com/events/calendar',
    how: 'ChamberMaster portal. Our own town — ribbon cuttings, the Mudbug Bash, the food festival.',
  },
  {
    id: 'chamber-rankin',
    name: 'Rankin County Chamber of Commerce',
    kind: 'chamber',
    city: 'Brandon',
    miles: 8,
    url: 'https://business.rankinchamber.com/events/calendar',
    how: 'ChamberMaster portal — same reader as Flowood. Covers Brandon, Pearl, Richland, Florence.',
  },
  {
    id: 'chamber-pearl',
    name: 'Pearl Chamber of Commerce',
    kind: 'chamber',
    city: 'Pearl',
    miles: 4,
    url: 'https://www.pearlms.org/events',
    how: 'Their own site rather than a portal, so this one needs its own reading.',
  },
  {
    id: 'chamber-ridgeland',
    name: 'Ridgeland Chamber of Commerce',
    kind: 'chamber',
    city: 'Ridgeland',
    miles: 9,
    url: 'https://ridgelandchamber.com/events/',
    how: 'Township Jazz Festival and the rest of the Renaissance-side calendar.',
  },
  {
    id: 'chamber-madison',
    name: 'Madison County Chamber of Commerce',
    kind: 'chamber',
    city: 'Madison',
    miles: 12,
    url: 'https://business.madisoncounty.com/events',
    how: 'ChamberMaster portal. Canton, Flora, Gluckstadt, Madison, Ridgeland — the Canton Flea Market is the big one.',
  },
  {
    id: 'chamber-jackson',
    name: 'Greater Jackson Chamber Partnership',
    kind: 'chamber',
    city: 'Jackson',
    miles: 7,
    url: 'https://members.greaterjacksonms.com/events',
    how: 'ChamberMaster portal. Metro-wide, so expect the most volume and the least relevance per line.',
  },
  {
    id: 'chamber-clinton',
    name: 'Clinton Chamber of Commerce',
    kind: 'chamber',
    city: 'Clinton',
    miles: 18,
    url: 'https://clintonchamber.chambermaster.com/events',
    how: 'ChamberMaster portal. Far enough out that it is worth watching for the big ones only.',
  },

  // ── Teams ─────────────────────────────────────────────────────────────────
  {
    id: 'jsu-football',
    name: 'Jackson State home games',
    kind: 'sports',
    city: 'Jackson',
    miles: 7,
    how: 'Veterans Memorial Stadium. A home Saturday is the closest thing to a second New Year’s Eve.',
  },
  {
    id: 'msu-olemiss',
    name: 'Mississippi State / Ole Miss / Southern Miss',
    kind: 'sports',
    city: 'Statewide',
    how: 'Not local, but a noon kick-off empties a dining room and a night game fills the bar. Watch the times, not just the dates.',
  },
  {
    id: 'hs-football',
    name: 'Rankin County high school football',
    kind: 'sports',
    city: 'Rankin County',
    miles: 8,
    how: 'Friday nights, August to November. Northwest Rankin, Brandon, Pearl, Florence — a home game is a late rush, an away game is an early one.',
  },

  // ── The rest ──────────────────────────────────────────────────────────────
  {
    id: 'rcsd-calendar',
    name: 'Rankin County School District calendar',
    kind: 'schools',
    city: 'Rankin County',
    miles: 8,
    url: 'https://www.rcsd.ms/calendars',
    how: 'Breaks and early releases move lunch hard and they are published a year ahead — the cheapest source on this list to keep right.',
  },
  {
    id: 'nws-jackson',
    name: 'Weather — NWS Jackson',
    kind: 'weather',
    city: 'Flowood',
    miles: 0,
    url: 'https://api.weather.gov/',
    how: 'Not an event, but it moves a night more than most of the above. Free, no key, and the only source here with a real API.',
  },
  {
    id: 'ops-inbox',
    name: 'The ops mailbox',
    kind: 'inbox',
    city: 'Flowood',
    how: 'Reads ezCater confirmations and the “we’ve got 40 coming Thursday” emails and files them. Needs a mailbox to watch and a granted mail scope — the one source here that touches private data, so it is last.',
  },
]

/** Which seed a concept gets. Anything not listed starts empty, on purpose. */
const SEED_FOR: Record<string, EventSource[]> = { mugshots: JACKSON_METRO }

const key = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::events:sources`
}

/**
 * This store's sources, with anything newly shipped merged in.
 *
 * Merge, never replace — same rule as the sidework sheets and the training
 * programmes, for the same reason: the copy is seeded once per device and
 * belongs to that device from then on, so a source added to the app later would
 * otherwise never reach the tablet that matters.
 */
export function getSources(): EventSource[] {
  const seed = SEED_FOR[useScope.getState().currentConcept] ?? []
  const raw = load<EventSource[] | null>(key(), null)
  const mine = Array.isArray(raw) ? raw.filter((s) => s && typeof s.id === 'string') : null
  if (!mine) {
    // First run for this store. Nothing saved until something is changed, so a
    // store that never touches this keeps picking up new shipped sources.
    return seed
  }
  const have = new Set(mine.map((s) => s.id))
  const missing = seed.filter((s) => !have.has(s.id))
  return missing.length === 0 ? mine : [...mine, ...missing]
}

export const setSources = (list: EventSource[]): void => save(key(), list)

export function toggleSource(id: string): EventSource[] {
  const next = getSources().map((s) => (s.id === id ? { ...s, off: !s.off } : s))
  setSources(next)
  return next
}

export function addSource(name: string, kind: SourceKind, city: string, url = ''): EventSource[] {
  const n = name.trim()
  if (!n) return getSources()
  const next = [
    ...getSources(),
    {
      id: `src${Date.now().toString(36)}`,
      name: n,
      kind,
      city: city.trim() || '—',
      url: url.trim() || undefined,
      own: true,
    },
  ]
  setSources(next)
  return next
}

export function removeSource(id: string): EventSource[] {
  const next = getSources().filter((s) => s.id !== id)
  setSources(next)
  return next
}

/** Grouped the way the panel reads, empty kinds dropped. */
export function byKind(list: EventSource[]): Array<{ kind: SourceKind; items: EventSource[] }> {
  const seen = [...new Set(list.map((s) => s.kind))]
  const order = [...KIND_ORDER.filter((k) => seen.includes(k)), ...seen.filter((k) => !KIND_ORDER.includes(k))]
  return order.map((kind) => ({ kind, items: list.filter((s) => s.kind === kind) }))
}

export const KINDS: SourceKind[] = ['chamber', 'venue', 'sports', 'schools', 'weather', 'inbox']
