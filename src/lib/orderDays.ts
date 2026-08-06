import { load, save } from './store'
import { useScope } from './scope'

/**
 * Order-day schedule — which weekdays each vendor's order has to be PLACED.
 * Every store runs a different delivery calendar (and reps change them), so
 * this is editable per store in Stores & Concepts, and the Dashboard reads it
 * to remind a manager what has to go out today.
 */
export interface OrderSchedule {
  vendor: string
  /** Weekday numbers to place this order on. 0 = Sunday … 6 = Saturday. */
  days: number[]
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

/** Which orders have to be placed on the given date (defaults to today). */
export function ordersDueOn(isoDate: string): OrderSchedule[] {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return []
  const dow = new Date(y, m - 1, d).getDay()
  return getOrderSchedules().filter((s) => s.days.includes(dow) && s.vendor.trim())
}
