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
export interface OrderSchedule {
  vendor: string
  /** Weekday numbers to place this order on. 0 = Sunday … 6 = Saturday. */
  days: number[]
  /** Weekday numbers this vendor delivers on. Same numbering. */
  deliveryDays?: number[]
  /** Optional cutoff time shown on the reminder, e.g. "10:00 AM". */
  cutoff?: string
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

/** Which orders have to be PLACED on the given date. */
export function ordersDueOn(isoDate: string): OrderSchedule[] {
  const dow = dowOf(isoDate)
  if (dow == null) return []
  return getOrderSchedules().filter((s) => s.days.includes(dow) && s.vendor.trim())
}

/** Which vendors DELIVER on the given date — what there is to receive. */
export function deliveriesOn(isoDate: string): OrderSchedule[] {
  const dow = dowOf(isoDate)
  if (dow == null) return []
  return getOrderSchedules().filter((s) => (s.deliveryDays ?? []).includes(dow) && s.vendor.trim())
}
