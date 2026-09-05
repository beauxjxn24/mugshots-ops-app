import { load, save } from './store'
import { useScope } from './scope'

/**
 * Vendor delivery calendar — the two halves of an order's life: the days it
 * has to be PLACED, and the days the truck ARRIVES. They are rarely the same
 * day and they matter to different people (a manager places, whoever's on
 * receives), so the Dashboard carries a pill for each. Every store runs a
 * different calendar and reps change them, so this is editable per store in
 * Stores & Concepts.
 */
/**
 * How often the pattern repeats.
 *
 * Every schedule used to be weekly by definition, so a vendor delivering every
 * OTHER Thursday had to be entered as every Thursday — the dashboard then
 * called for that order on the wrong week, and a manager either ordered twice
 * or learned to ignore the pill. Ignoring it is the expensive outcome, because
 * the pill then means nothing for the vendors that really are weekly.
 */
export type Cadence = 'weekly' | 'biweekly' | 'monthly'

export const CADENCES: { id: Cadence; label: string; short: string }[] = [
  { id: 'weekly', label: 'Weekly', short: 'wk' },
  { id: 'biweekly', label: 'Every other week', short: '2wk' },
  { id: 'monthly', label: 'Monthly', short: 'mo' },
]

export interface OrderSchedule {
  vendor: string
  /** Weekday numbers to place this order on. 0 = Sunday … 6 = Saturday. */
  days: number[]
  /** Weekday numbers this vendor delivers on. Same numbering. */
  deliveryDays?: number[]
  /** Optional cutoff time shown on the reminder, e.g. "10:00 AM". */
  cutoff?: string
  /** How often the pattern repeats. Absent = weekly, which is what every
   *  schedule saved before this field existed already meant. */
  cadence?: Cadence
  /** Biweekly only: an ISO date in a week this DOES run, so "every other"
   *  has a fixed point to alternate from rather than drifting. */
  anchor?: string
}

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const key = () => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::ordering:schedule`
}

export const getOrderSchedules = (): OrderSchedule[] => {
  const r = load<OrderSchedule[]>(key(), [])
  return Array.isArray(r)
    ? r.filter((x) => x && typeof x.vendor === 'string' && Array.isArray(x.days))
    : []
}
export const setOrderSchedules = (v: OrderSchedule[]): void => save(key(), v)

/** Weekday number for an ISO date, or null if it isn't a real date. */
function dowOf(isoDate: string): number | null {
  const [y, m, d] = (isoDate ?? '').split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).getDay()
}

/** Midnight-local Date for an ISO date, or null. */
function dateOf(isoDate: string): Date | null {
  const [y, m, d] = (isoDate ?? '').split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Whole weeks between two dates, counted from each one's Sunday. */
function weeksBetween(a: Date, b: Date): number {
  const sunday = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    x.setDate(x.getDate() - x.getDay())
    return x
  }
  // Round rather than floor: DST shifts an interval by an hour, which would
  // otherwise turn a clean 2-week gap into 1.96 and flip the alternation.
  return Math.round((sunday(b).getTime() - sunday(a).getTime()) / 604_800_000)
}

/**
 * Does a schedule's cadence land on this date, given the weekday already matches?
 *
 * weekly    — always.
 * biweekly  — every second week counting from the anchor week.
 * monthly   — the FIRST time that weekday comes round in the month, so a
 *             "monthly, Thursday" order lands on the first Thursday and not on
 *             all four or five of them.
 */
function cadenceHits(s: OrderSchedule, iso: string): boolean {
  const cadence = s.cadence ?? 'weekly'
  if (cadence === 'weekly') return true
  const d = dateOf(iso)
  if (!d) return false
  if (cadence === 'monthly') return d.getDate() <= 7
  const anchor = dateOf(s.anchor ?? '') ?? new Date(1970, 0, 4) // a Sunday
  return weeksBetween(anchor, d) % 2 === 0
}

/**
 * The next date this order has to be placed, on or after `from`.
 *
 * So a schedule can say "every other Thursday — next one Sep 11" instead of
 * leaving the reader to work out which Thursday the anchor makes the "on" one.
 * Looks a season ahead, then gives up rather than looping.
 */
export function nextPlacement(s: OrderSchedule, from: string): string | null {
  const start = dateOf(from)
  if (!start || !s.days.length) return null
  for (let i = 0; i < 120; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (s.days.includes(d.getDay()) && cadenceHits(s, iso)) return iso
  }
  return null
}

/** Which orders have to be PLACED on the given date. */
export function ordersDueOn(isoDate: string): OrderSchedule[] {
  const dow = dowOf(isoDate)
  if (dow == null) return []
  return getOrderSchedules().filter(
    (s) => s.days.includes(dow) && s.vendor.trim() && cadenceHits(s, isoDate),
  )
}

/** Which vendors DELIVER on the given date — what there is to receive. */
export function deliveriesOn(isoDate: string): OrderSchedule[] {
  const dow = dowOf(isoDate)
  if (dow == null) return []
  return getOrderSchedules().filter(
    (s) => (s.deliveryDays ?? []).includes(dow) && s.vendor.trim() && cadenceHits(s, isoDate),
  )
}
