// What a catering order does to the prep list.
//
// The app already knows two things separately: the line builds say which prep
// goes into which dish, and a dropped catering order says which dishes are
// going out and how many. Nobody had put them together, so a manager counting
// a cooler on a catering morning was still working it out in their head —
// thirty pulled pork means more slaw, more pickles, more sauce, and which
// sauce was it.
//
// ── Why this is arithmetic and not a model ───────────────────────────────────
//
// It is a lookup and a multiply. The build sheet says what a portion takes and
// the order says how many portions; there is exactly one right answer and it
// is the same every time. A model asked the same question would be right most
// of the time, which is worse than useless for a number somebody preps to.
//
// The place a model genuinely earns its keep here is one step upstream: an
// ezCater ticket says "Pulled Pork Sandwich Tray (serves 25)" and the menu
// says "Pulled Pork Sandwich", and matching those is fuzzy, messy, human work.
// The matching below is deliberately literal — it finds what it can be sure
// of and stays quiet about the rest, rather than guessing and being trusted.
import { allBuilds, norm, readLine, usageIndex } from './linebuilds'
import { prepItemNames, barPrepNames, getCatalog } from './catalog'
import type { Booking } from './catering'

export interface OrderDish {
  dish: string
  /** How many were ordered, where the ticket said so. 0 = it didn't. */
  qty: number
  /** The booking it came off, for the label. */
  event: string
  date: string
}

/**
 * Dishes named in a booking's ticket text.
 *
 * Matched line by line against the build sheet's own names. A dish is only
 * counted when its full name appears — a partial hit on "Chicken" would rope in
 * every chicken on the menu, and a prep sheet that cries wolf gets ignored.
 */
export function dishesIn(b: Booking): OrderDish[] {
  const text = `${b.raw ?? ''}\n${b.notes ?? ''}`
  if (!text.trim()) return []
  const names = allBuilds().map((x) => x.sheetName)
  const out = new Map<string, OrderDish>()

  for (const raw of text.split(/\r?\n/)) {
    const line = norm(raw)
    if (!line) continue
    for (const dish of names) {
      const needle = norm(dish)
      if (needle.length < 4 || !line.includes(needle)) continue
      // "30x Pulled Pork Sandwich", "30 x ...", "Qty 30 ..." — the count is
      // whatever number sits before the dish on its own line.
      const before = line.slice(0, line.indexOf(needle))
      const m = before.match(/(\d+)\s*x?\s*$/) ?? before.match(/(\d+)/)
      const qty = m ? parseInt(m[1], 10) : 0
      const prev = out.get(dish)
      if (!prev || qty > prev.qty) out.set(dish, { dish, qty, event: b.event, date: b.date })
    }
  }
  return [...out.values()]
}

/**
 * Prep item → the ordered dishes that eat it.
 *
 * Built once for a set of bookings; the index above walks every build sheet
 * line, which is not something to do forty-nine times on a render.
 */
export function prepHitsFor(bookings: Booking[]): Map<string, OrderDish[]> {
  const hits = new Map<string, OrderDish[]>()
  const ordered = bookings.flatMap(dishesIn)
  if (ordered.length === 0) return hits

  // usageIndex is prep -> dishes; this question runs the other way. It knows
  // to skip plateware and pick-one sauce lists now, so the two false positives
  // this feature found — a wings tray asking for BURGERS off "Lined Burger
  // Basket", and "Sweet Chili" putting Chili on the list — are gone at source
  // rather than filtered again here.
  const idx = usageIndex(
    [...prepItemNames(), ...barPrepNames()],
    getCatalog().map((i) => i.name),
  )
  const byDish = new Map<string, string[]>()
  for (const [prep, dishes] of idx) {
    for (const d of dishes) byDish.set(d, [...(byDish.get(d) ?? []), prep])
  }

  for (const o of ordered) {
    for (const prep of byDish.get(o.dish) ?? []) {
      const list = hits.get(prep) ?? []
      if (!list.some((x) => x.dish === o.dish && x.event === o.event)) list.push(o)
      hits.set(prep, list)
    }
  }
  return hits
}

/** "30 Pulled Pork Sandwich" / "Pulled Pork Sandwich" when no count was given. */
export const hitLabel = (o: OrderDish): string => (o.qty > 0 ? `${o.qty} ${o.dish}` : o.dish)

/**
 * Whether a prep line was actually readable enough to be worth linking.
 *
 * A build line with no quantity on it tells you the dish uses the prep but not
 * how much, so the app can say "this is on the order" and must not pretend to
 * a number. Kept as its own question so the screen can be honest about which
 * of the two it's showing.
 */
export function portionKnown(prep: string, dish: string): boolean {
  const b = allBuilds().find((x) => x.sheetName === dish)
  if (!b) return false
  const names = [...prepItemNames(), ...barPrepNames()]
  const stock = getCatalog().map((i) => i.name)
  for (const s of b.sections)
    for (const raw of s.lines) {
      const r = readLine(raw, names, stock)
      if (r.links.some((l) => l.name === prep) && r.qty) return true
    }
  return false
}
