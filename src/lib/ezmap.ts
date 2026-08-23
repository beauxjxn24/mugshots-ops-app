// ezCater's names for things, and ours.
//
// They are not the same vocabulary and there is no reason they would be.
// ezCater sells what a customer picks off a marketplace listing — "Savell
// Boxed Lunch", "Caitlin's Cajun Box" — and the kitchen packs off a build card
// called "Sandwich or Burger Boxed Lunch". Same box, two languages, and
// nothing in between them until now.
//
// ── Why a table and not a clever matcher ─────────────────────────────────────
//
// Because the two names often share no words at all. "Caitlin's Cajun Box" and
// "Sandwich or Burger Boxed Lunch" have nothing in common but the word "box",
// and a fuzzy matcher confident enough to link those is confident enough to
// link the wrong things. The listing names change when marketing changes them,
// not when the kitchen does, so this is a list somebody maintains — small,
// readable, and wrong in an obvious way when it's wrong.
//
// The dish a listing puts ON the tray is what the prep sheet needs: "Savell
// Boxed Lunch" is a Savell burger in a box, so an order for seven of them is
// seven Savells' worth of prep.
import { CATERING_BUILDS } from './cateringbuilds'
import type { OrderItem } from './catering'

export interface EzListing {
  /** How ezCater prints it. Matched case- and punctuation-insensitively. */
  ez: string
  /** The build card that gets packed. */
  build?: string
  /**
   * The menu items it actually puts on the tray, so prep can be worked out.
   *
   * One entry per portion of the listing — a boxed lunch is one sandwich, a
   * platter is however many the card says.
   */
  dishes?: { dish: string; per: number }[]
  /** Anything the listing carries that the build card doesn't say. */
  note?: string
}

/**
 * Seeded from a real ticket (order K73-10U) plus the build packet's own names.
 *
 * Deliberately short. Every line here was seen on a ticket or read off a build
 * card; nothing is guessed, because a guessed row is worse than a missing one —
 * a missing row shows up as "not mapped" and gets fixed, a wrong one quietly
 * preps the wrong food.
 */
export const EZ_LISTINGS: EzListing[] = [
  {
    ez: 'Savell Boxed Lunch',
    build: 'Sandwich or Burger Boxed Lunch',
    dishes: [{ dish: 'Savell', per: 1 }],
    note: 'Burger box — bacon, cheddar, pickles, onion, lettuce, tomato, sourdough.',
  },
  {
    ez: "Caitlin's Cajun Box",
    build: 'Sandwich or Burger Boxed Lunch',
    // "Caitlin's Cajun" is what the build sheets call it — checked against
    // them rather than described from the listing's blurb, because a dish name
    // that doesn't exist maps to nothing and fails silently.
    dishes: [{ dish: "Caitlin's Cajun", per: 1 }],
    note: 'Blackened chicken sandwich — bacon, pepper jack, lettuce, tomato.',
  },
  { ez: 'Gallon Sweet Tea', build: 'Beverages', note: 'With ice and lemons.' },
  { ez: 'Gallon Unsweet Tea', build: 'Beverages', note: 'With ice and lemons.' },
  { ez: 'Gallon Lemonade', build: 'Beverages', note: 'With ice.' },
  // Straight off the build packet — these are listed the same both sides.
  { ez: 'Mombo Platter', build: 'Mombo Platter' },
  { ez: 'Appetizer Platter', build: 'Appetizer Platter' },
  { ez: 'Burger or Sandwich Platter', build: 'Burger or Sandwich Platter' },
  { ez: 'Burger and Tender Platter', build: 'Burger and Tender Platter' },
  { ez: "Katie's Kickin' Chicken Platter", build: "Katie's Kickin' Chicken Platter" },
  { ez: 'Salad Platter', build: 'Salad Platter' },
  { ez: 'Sandwich or Burger Boxed Lunch', build: 'Sandwich or Burger Boxed Lunch' },
  { ez: "Katie's Kickin' Chicken Boxed Lunch", build: "Katie's Kickin' Chicken Boxed Lunch" },
  { ez: 'Salad Boxed Lunch', build: 'Salad Boxed Lunch' },
]

/** Punctuation and case are noise; an apostrophe shouldn't decide a match. */
const key = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const BY_KEY = new Map(EZ_LISTINGS.map((l) => [key(l.ez), l]))

/**
 * The listing an ordered line refers to.
 *
 * Exact on the normalised name first. Failing that, a listing whose whole name
 * appears inside the ticket line — ezCater sometimes suffixes a size or a
 * serving count — but never the other way round, because "Salad Platter"
 * containing "Salad" must not match a listing called "Salad".
 */
export function listingFor(name: string): EzListing | undefined {
  const k = key(name)
  const exact = BY_KEY.get(k)
  if (exact) return exact
  return EZ_LISTINGS.find((l) => {
    const lk = key(l.ez)
    return lk.length >= 6 && k.includes(lk)
  })
}

export interface MappedItem extends OrderItem {
  listing?: EzListing
  /** The build card to pack it from, when one is known. */
  build?: string
}

/** An order's lines, each with its build card where we know it. */
export function mapItems(items: OrderItem[] = []): MappedItem[] {
  return items.map((i) => {
    const listing = listingFor(i.name)
    const build = listing?.build && CATERING_BUILDS.some((b) => b.name === listing.build)
      ? listing.build
      : undefined
    return { ...i, listing, build }
  })
}

/** Lines nothing on the table matches — the list to fix, said out loud. */
export const unmapped = (items: OrderItem[] = []): OrderItem[] =>
  items.filter((i) => !listingFor(i.name))

/**
 * Menu items an order puts on trays, with counts.
 *
 * This is what the prep sheet wants: seven Savell Boxed Lunches is seven
 * Savells, and a Savell is a burger the build sheets already know how to take
 * apart into prep.
 */
export function dishesOrdered(items: OrderItem[] = []): { dish: string; qty: number }[] {
  const out = new Map<string, number>()
  for (const i of items) {
    for (const d of listingFor(i.name)?.dishes ?? []) {
      out.set(d.dish, (out.get(d.dish) ?? 0) + d.per * i.qty)
    }
  }
  return [...out].map(([dish, qty]) => ({ dish, qty }))
}

/**
 * Rows pointing at a dish no build sheet has.
 *
 * A mapping that names a dish which doesn't exist maps to nothing and says
 * nothing — the prep flag simply never fires and looks like a quiet day. This
 * is checked in a test so the failure is loud instead.
 */
export function brokenRows(buildNames: string[]): string[] {
  const have = new Set(buildNames.map((n) => n.toLowerCase()))
  const bad: string[] = []
  for (const l of EZ_LISTINGS) {
    for (const d of l.dishes ?? []) {
      if (!have.has(d.dish.toLowerCase())) bad.push(`${l.ez} → ${d.dish}`)
    }
    if (l.build && !CATERING_BUILDS.some((b) => b.name === l.build)) {
      bad.push(`${l.ez} → build card "${l.build}"`)
    }
  }
  return bad
}
