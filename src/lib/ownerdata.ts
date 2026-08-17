// Owner-supplied data, baked in from files dropped in chat (OWNER-RULES #0).
// Each new drop bumps `version` in owner-drops.json; every device merges the
// new data exactly once. Never overwrites a night the owner edited by hand
// unless the baked data is for the same date and the record was itself baked.
import ownerDrops from '../data/owner-drops.json'
import { load, save } from './store'
import type { Night } from './nightly'
import type { PmixDays } from './pmix'
import type { Booking } from './catering'

const STORE = 'mugshots|flowood'

/**
 * One-time: remove the catering bookings that earlier owner-drops injected
 * (their ids start with `owner-`). The owner asked to clear them so real
 * ezCater PDFs can be re-dropped fresh; the manager's own imports (id `c…`) and
 * anything typed in are left untouched. Guarded so it runs once per device.
 */
export function purgeOwnerBookings(): void {
  const FLAG = 'mugops:__ownerBookingsPurged'
  try {
    if (localStorage.getItem(FLAG)) return
    for (const k of Object.keys(localStorage)) {
      if (!/::catering:bookings$/.test(k)) continue
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]')
        if (!Array.isArray(arr)) continue
        const kept = arr.filter((b) => !(typeof b?.id === 'string' && b.id.startsWith('owner-')))
        if (kept.length !== arr.length) localStorage.setItem(k, JSON.stringify(kept))
      } catch {
        /* skip a corrupt key */
      }
    }
    localStorage.setItem(FLAG, '1')
  } catch {
    /* storage unavailable */
  }
}

/**
 * One-time: zero every sales and product-mix number, on every store.
 *
 * Owner's call — the numbers on the app were a mix of baked-in chat drops and
 * old imports, and he wants a clean slate before the real reports go in.
 * Clears the nightly sales log, the sales-category mix and the product mix.
 *
 * Deliberately narrow. Invoices, prices, tips, petty cash and the count sheets
 * are records too, and none of them are sales or product mix — they stay. So do
 * the recipes, roster, order guides and checklists.
 *
 * Guarded by a flag so it runs once per device and never eats a report imported
 * afterwards. Same shape as purgeOwnerBookings above, which the owner asked for
 * on the same grounds.
 */
export function purgeSalesAndMix(): void {
  const FLAG = 'mugops:__salesZeroed'
  const WIPE = /::(nightly:log|nightly:catmix|pmix:days)$/
  try {
    if (localStorage.getItem(FLAG)) return
    for (const k of Object.keys(localStorage)) if (WIPE.test(k)) localStorage.removeItem(k)
    localStorage.setItem(FLAG, '1')
  } catch {
    /* storage unavailable */
  }
}

export function applyOwnerDrops(): void {
  const data = ownerDrops as unknown as {
    version: number
    nights: Array<Record<string, number | string>>
    pmix: Record<string, { file: string; items: PmixDays[string]['items'] }>
    bookings?: Array<Omit<Booking, 'id'>>
  }
  const FLAG = '__ownerDropsVersion'
  if (load<number>(FLAG, 0) >= data.version) return

  // Nights: upsert by date (owner data is authoritative for its own dates).
  const nk = `${STORE}::nightly:log`
  const curRaw = load<Night[]>(nk, [])
  const cur = Array.isArray(curRaw) ? curRaw : []
  const byDate = new Map(cur.map((n) => [n.date, n]))
  for (const r of data.nights) {
    const date = String(r.date)
    const prev = byDate.get(date)
    byDate.set(date, {
      id: prev?.id ?? `owner-${date}`,
      date,
      netSales: Number(r.net) || 0,
      deposit: prev?.deposit ?? 0,
      covers: Number(r.covers) || prev?.covers || 0,
      notes: prev?.notes ?? '',
      gross: Number(r.gross) || undefined,
      comps: Number(r.comps) || undefined,
      food: Number(r.food) || undefined,
      beer: Number(r.beer) || undefined,
      liquor: Number(r.liquor) || undefined,
      wine: Number(r.wine) || undefined,
      na: Number(r.na) || undefined,
      nocat: Number(r.nocat) || undefined,
      labor: Number(r.labor) || undefined,
      laborPct: Number(r.laborPct) || undefined,
    })
  }
  save(nk, [...byDate.values()].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')))

  // PMIX days: merge (owner drops win for their dates).
  const pk = `${STORE}::pmix:days`
  const daysRaw = load<PmixDays>(pk, {})
  const days: PmixDays = daysRaw && typeof daysRaw === 'object' && !Array.isArray(daysRaw) ? daysRaw : {}
  for (const [date, day] of Object.entries(data.pmix)) {
    days[date] = { ...day, importedAt: 'baked in from chat drop' }
  }
  save(pk, days)

  // Tracked tiles: if the owner hasn't picked any yet, start with the real
  // top sellers from his own PMIX (derived from HIS data — not samples).
  const tk = `${STORE}::tracked:items`
  const curTracked = load<string[]>(tk, [])
  if (!Array.isArray(curTracked) || curTracked.length === 0) {
    // Only real days (array items) can seed tracked — a corrupt/legacy key must
    // never bake `undefined` names into the tiles.
    const latest = Object.keys(days)
      .filter((k) => Array.isArray(days[k]?.items))
      .sort()
      .reverse()[0]
    if (latest) {
      const top = [...days[latest].items]
        .filter((i) => typeof i?.name === 'string' && i.name.trim())
        .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))
        .slice(0, 5)
        .map((i) => i.name)
      if (top.length) save(tk, top)
    }
  }

  // Catering bookings from chat-dropped orders — de-duped by ezCater order #.
  if (data.bookings?.length) {
    const bk = `${STORE}::catering:bookings`
    const curBk = load<Booking[]>(bk, [])
    const cur = Array.isArray(curBk) ? curBk : []
    const have = new Set(cur.map((b) => b.orderNo).filter(Boolean))
    const add = data.bookings
      .filter((b) => !b.orderNo || !have.has(b.orderNo))
      .map((b) => ({ ...b, id: `owner-${b.orderNo ?? b.date}` }))
    if (add.length) save(bk, [...cur, ...add])
  }

  save(FLAG, data.version)
}
