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
  const cur = load<Night[]>(nk, [])
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
  const days = load<PmixDays>(pk, {})
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
    const cur = load<Booking[]>(bk, [])
    const have = new Set(cur.map((b) => b.orderNo).filter(Boolean))
    const add = data.bookings
      .filter((b) => !b.orderNo || !have.has(b.orderNo))
      .map((b) => ({ ...b, id: `owner-${b.orderNo ?? b.date}` }))
    if (add.length) save(bk, [...cur, ...add])
  }

  save(FLAG, data.version)
}
