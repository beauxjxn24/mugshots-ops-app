// Roll-up reporting — read-only aggregation across stores. A single store is
// namespaced `${concept}|${location}`; a roll-up reads that key across every
// store in scope and combines the numbers. Nothing here writes.
import { load } from './store'
import { ALL, type Concept } from './scope'
import type { Night } from './nightly'
import type { Booking } from './catering'
import { sanitizePmix, type MixItem } from './pmix'

export interface StoreRef {
  concept: string
  location: string
  conceptName: string
  locationName: string
  /** `${concept}|${location}` — the namespace prefix for this store's keys. */
  ns: string
}

/** The concrete stores a (concept, location) selection covers. */
export function storesForScope(
  concepts: Concept[],
  currentConcept: string,
  currentLocation: string,
): StoreRef[] {
  const list = Array.isArray(concepts) ? concepts : []
  const refs: StoreRef[] = []
  const push = (c: Concept, l: { id: string; name: string }) =>
    refs.push({
      concept: c.id,
      location: l.id,
      conceptName: c.name,
      locationName: l.name,
      ns: `${c.id}|${l.id}`,
    })
  if (currentConcept === ALL) {
    for (const c of list) for (const l of c.locations ?? []) push(c, l)
  } else if (currentLocation === ALL) {
    const c = list.find((x) => x.id === currentConcept)
    if (c) for (const l of c.locations ?? []) push(c, l)
  } else {
    const c = list.find((x) => x.id === currentConcept)
    const l = c?.locations.find((x) => x.id === currentLocation)
    if (c && l) push(c, l)
  }
  return refs
}

/** Read one store's value for a data key. */
export function loadFor<T>(ref: StoreRef, key: string, fallback: T): T {
  return load<T>(`${ref.ns}::${key}`, fallback)
}

// ---- Date-window helpers (mirror the Dashboard's Monday/period logic) ----
export function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
export function mondayOf(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
export function periodStartOf(iso: string): string {
  const d = new Date((iso ?? '') + 'T12:00:00')
  const start = new Date(d.getFullYear(), 0, 1)
  const doy = Math.floor((d.getTime() - start.getTime()) / 86400000)
  const p = Math.min(13, Math.floor(doy / 28) + 1)
  const ps = new Date(d.getFullYear(), 0, 1 + (p - 1) * 28)
  return `${ps.getFullYear()}-${String(ps.getMonth() + 1).padStart(2, '0')}-${String(ps.getDate()).padStart(2, '0')}`
}

export type Scope = 'day' | 'week' | 'period'

/** Inclusive [from, to] window for a scope, anchored on `anchor` (an ISO date). */
export function windowFor(scope: Scope, anchor: string): { from: string; to: string } {
  if (!anchor) return { from: '', to: '' }
  if (scope === 'day') return { from: anchor, to: anchor }
  if (scope === 'week') {
    const from = mondayOf(anchor)
    return { from, to: shiftDays(from, 6) }
  }
  const from = periodStartOf(anchor)
  return { from, to: shiftDays(from, 27) }
}

const nightsOf = (ref: StoreRef): Night[] => {
  const raw = loadFor<Night[]>(ref, 'nightly:log', [])
  return Array.isArray(raw) ? raw.filter((n) => n && typeof n.date === 'string') : []
}

export interface StoreSales {
  ref: StoreRef
  net: number
  labor: number
  laborPct: number | null
  covers: number
  cats: { food: number; beer: number; liquor: number; wine: number; na: number }
  days: number
}

/** Combined sales/labor/category totals for a window, with per-store breakdown.
 *  `anchor` is the latest logged date across ALL stores in scope. */
export function rollupSales(refs: StoreRef[], scope: Scope): {
  anchor: string
  total: StoreSales
  perStore: StoreSales[]
} {
  // Anchor = the most recent night any store logged, so "day/week/period" all
  // frame the freshest data even if stores logged on different days.
  let anchor = ''
  const byStore = refs.map((ref) => ({ ref, nights: nightsOf(ref) }))
  for (const { nights } of byStore)
    for (const n of nights) if (n.date > anchor) anchor = n.date

  const { from, to } = windowFor(scope, anchor)
  const blank = (ref: StoreRef): StoreSales => ({
    ref,
    net: 0,
    labor: 0,
    laborPct: null,
    covers: 0,
    cats: { food: 0, beer: 0, liquor: 0, wine: 0, na: 0 },
    days: 0,
  })

  const perStore = byStore.map(({ ref, nights }) => {
    const s = blank(ref)
    for (const n of nights) {
      if (!(n.date >= from && n.date <= to)) continue
      s.net += n.netSales ?? 0
      s.labor += n.labor ?? 0
      s.covers += n.covers ?? 0
      s.cats.food += n.food ?? 0
      s.cats.beer += n.beer ?? 0
      s.cats.liquor += n.liquor ?? 0
      s.cats.wine += n.wine ?? 0
      s.cats.na += n.na ?? 0
      s.days += 1
    }
    s.laborPct = s.labor > 0 && s.net > 0 ? (s.labor / s.net) * 100 : null
    return s
  })

  const total = perStore.reduce<StoreSales>((acc, s) => {
    acc.net += s.net
    acc.labor += s.labor
    acc.covers += s.covers
    acc.cats.food += s.cats.food
    acc.cats.beer += s.cats.beer
    acc.cats.liquor += s.cats.liquor
    acc.cats.wine += s.cats.wine
    acc.cats.na += s.cats.na
    acc.days = Math.max(acc.days, s.days)
    return acc
  }, blank({ concept: '', location: '', conceptName: 'All', locationName: 'Combined', ns: '' }))
  total.laborPct = total.labor > 0 && total.net > 0 ? (total.labor / total.net) * 100 : null

  return { anchor, total, perStore }
}

/** Summed product mix across each store's latest PMIX day. */
export function rollupPmix(refs: StoreRef[]): { name: string; qty: number; sales: number }[] {
  const byName = new Map<string, { name: string; qty: number; sales: number }>()
  for (const ref of refs) {
    const days = sanitizePmix(loadFor(ref, 'pmix:days', {}))
    const latest = Object.keys(days).sort().pop()
    const items: MixItem[] = latest ? days[latest].items : []
    for (const it of items) {
      const k = it.name.toLowerCase()
      const cur = byName.get(k)
      if (cur) {
        cur.qty += it.qty
        cur.sales += it.sales
      } else byName.set(k, { name: it.name, qty: it.qty, sales: it.sales })
    }
  }
  return [...byName.values()].sort((a, b) => b.qty - a.qty)
}

/** Every store's tracked items, summed against each store's latest PMIX. */
export function rollupTracked(refs: StoreRef[]): { name: string; qty: number; sales: number }[] {
  const wanted = new Map<string, { name: string; qty: number; sales: number }>()
  for (const ref of refs) {
    const raw = loadFor<string[]>(ref, 'tracked:items', [])
    const tracked = Array.isArray(raw) ? raw.filter((t) => typeof t === 'string') : []
    if (!tracked.length) continue
    const days = sanitizePmix(loadFor(ref, 'pmix:days', {}))
    const latest = Object.keys(days).sort().pop()
    const items: MixItem[] = latest ? days[latest].items : []
    for (const name of tracked) {
      const key = name.toLowerCase()
      if (!wanted.has(key)) wanted.set(key, { name, qty: 0, sales: 0 })
      const slot = wanted.get(key)!
      for (const it of items)
        if (it.name.toLowerCase().includes(key.slice(0, 12)) || key.includes(it.name.toLowerCase().slice(0, 12))) {
          slot.qty += it.qty
          slot.sales += it.sales
        }
    }
  }
  return [...wanted.values()]
}

export interface RollBooking extends Booking {
  storeName: string
}

/** Upcoming catering across all stores, each tagged with its store. */
export function rollupCatering(refs: StoreRef[], fromIso: string): RollBooking[] {
  const out: RollBooking[] = []
  for (const ref of refs) {
    const raw = loadFor<Booking[]>(ref, 'catering:bookings', [])
    const list = Array.isArray(raw) ? raw : []
    for (const b of list)
      if (b && typeof b.date === 'string' && b.date >= fromIso && !b.completedAt)
        out.push({ ...b, storeName: refs.length > 1 ? ref.locationName : '' })
  }
  return out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
}

/** Combined open-invoice + tipshare-pool totals, with per-store split. */
export function rollupMoney(refs: StoreRef[]): {
  invoiceTotal: number
  invoiceOpen: number
  tipsTotal: number
  perStore: { ref: StoreRef; invoiceTotal: number; tipsTotal: number }[]
} {
  interface Inv { total?: number; paid?: boolean }
  interface Shift { pool?: number }
  let invoiceTotal = 0
  let invoiceOpen = 0
  let tipsTotal = 0
  const perStore = refs.map((ref) => {
    const invs = loadFor<Inv[]>(ref, 'invoices:list', [])
    const shifts = loadFor<Shift[]>(ref, 'tips:shifts', [])
    let it = 0
    let open = 0
    let tp = 0
    if (Array.isArray(invs))
      for (const i of invs) {
        it += i.total ?? 0
        if (!i.paid) open += i.total ?? 0
      }
    if (Array.isArray(shifts)) for (const s of shifts) tp += s.pool ?? 0
    invoiceTotal += it
    invoiceOpen += open
    tipsTotal += tp
    return { ref, invoiceTotal: it, tipsTotal: tp }
  })
  return { invoiceTotal, invoiceOpen, tipsTotal, perStore }
}
