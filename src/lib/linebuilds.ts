import { SPECS, ACTIVE_SPECS } from './specs'
import { slugify } from './photos'
import { getImported } from './buildsheet'
import { prepItemNames, barPrepNames, getCatalog } from './catalog'

/**
 * Line builds — the kitchen's plating sheets, as data.
 *
 * A sheet is a table: one column per menu item, one labelled row per build
 * stage (Plateware → Greens → Vegetables/Build → Meat → On Top on the salads;
 * Plateware → Portion Size & Prep → On Side → Garnish on the appetizers). The
 * stage labels come off the sheet itself, so nothing here is hard-coded to one
 * menu section and a new sheet needs no code.
 *
 * Every printed line is kept verbatim in `lines`. The parsing below only adds
 * a reading of each line — its quantity, and which prep recipe or catalog item
 * it refers to — so a build can link to the prep that feeds it without ever
 * altering what the sheet says.
 */
export interface BuildSection {
  key: string
  label: string
  lines: string[]
}
export interface LineBuild {
  /** Name as printed on the sheet. */
  sheetName: string
  /** Photo filename, if the sheet carried one. */
  photo?: string | null
  sections: BuildSection[]
  /** Which sheet it came from — shown on the card. */
  sheet: string
}

interface SheetFile {
  sheet: string
  source: string
  dishes: { sheetName: string; photo?: string | null; sections: BuildSection[] }[]
}

// Every sheet dropped into src/data is picked up automatically — adding a new
// menu section is a data drop, not a code change.
const SHEETS = Object.values(
  import.meta.glob<SheetFile>('../data/linebuilds-*.json', { eager: true, import: 'default' }),
)

const SHIPPED: LineBuild[] = SHEETS.flatMap((s) =>
  s.dishes.map((d) => ({ ...d, sheet: s.sheet })),
).filter(
  // One card per item, first sheet wins. The sheets themselves no longer
  // overlap — a Burgers export that repeated a page of the Appetizers sheet is
  // extracted without it — but a future export could, and a dish appearing
  // twice on Specs would be worse than picking one.
  (d, i, all) => all.findIndex((x) => norm(x.sheetName) === norm(d.sheetName)) === i,
)

/**
 * Every build the app knows: the sheets shipped with it, plus any dropped on
 * the Imports screen.
 *
 * An imported sheet WINS over the shipped one of the same dish — a manager who
 * has just imported the new Pow Pow sheet means the new one, and a build that
 * quietly kept the old version would be worse than not importing at all. The
 * shipped copy stays underneath, so deleting the import restores it.
 *
 * A function rather than a constant because imports change while the app is
 * running; module-level data read once would go stale the moment a sheet lands.
 */
export function allBuilds(): LineBuild[] {
  const imported = getImported()
  if (imported.length === 0) return SHIPPED
  const overridden = new Set(imported.map((b) => norm(b.sheetName)))
  return [...imported, ...SHIPPED.filter((b) => !overridden.has(norm(b.sheetName)))]
}

/** @deprecated Reads only the shipped sheets — use allBuilds(). */
export const LINE_BUILDS = SHIPPED

/** Lowercase, punctuation-free, singular-ish — for name comparison only. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    // Accents come off before punctuation does. The sheets write both
    // "Jalapeños" and "Jalapenos" for the one prep, and the strip below reads
    // ñ as punctuation — turning the name into "jalape os", two words that
    // match nothing.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\bbleu\b/g, 'blue') // the sheets spell it both ways
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Words that describe a build rather than name a thing you keep on a shelf.
 *
 * "Sliced", "diced" and "chopped" are NOT noise — they are the whole
 * difference between two prep items. Stripping them collapsed Sliced Tomatoes
 * and Diced Tomatoes onto the same key, so one of them silently won every
 * match and the other looked unused.
 */
const NOISE = /\b(the|of|a|an|with|and|on|in|to|for|each|side|top|bottom|bun|per|into|thinly|fresh|prepped|portion)\b/g

/**
 * A word reduced to its singular.
 *
 * Both sides of a match go through this, so the sheets can write "Tomatoes"
 * where a prep card says "Sliced Tomatoes" and they still meet. Without it the
 * two never touched, and a fifth of the prep cards showed nothing under "used
 * in" purely because one side happened to be plural.
 */
function singular(w: string): string {
  if (w.length <= 3) return w
  if (/(?:ch|sh|s|x|z|o)es$/.test(w)) return w.slice(0, -2) // tomatoes, glasses
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y` // fries
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1) // wings, crumbles
  return w
}

/** A component name reduced to its identity: "1/3 Cup of Diced Onions" → "onion". */
function componentKey(s: string): string {
  return norm(s)
    .replace(NOISE, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
    .trim()
}

/** Leading quantity on a build line, e.g. "1/3 Cup of", "4 oz", "3", "12\"". */
const QTY = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)\s*("|cups?|c\b|oz\.?|tbsp|tsp|slices?|packets?|scoops?|portions?|each)?\s*(?:of\s+)?/i

export interface ReadLine {
  raw: string
  qty?: string
  /** What the line refers to, once the quantity is stripped. */
  body: string
  /** A prep recipe or catalog item this line uses, if one is on file. */
  link?: { name: string; kind: LinkKind }
  /**
   * EVERY known item the line refers to.
   *
   * One line often names several: "Mashed Potatoes (gravy on top)" is both the
   * potatoes and the gravy, and "3 Mozzarella or Pepperjack" is two preps
   * offered as a choice. Taking only the first match meant the second item
   * looked like nothing used it — which is most of why prep cards were showing
   * an empty "used in".
   */
  links: { name: string; kind: LinkKind }[]
}

export type LinkKind = 'prep' | 'stock' | 'build'

/**
 * Everything the app already knows by name, longest first so "Diced Tomatoes"
 * wins over "Tomatoes".
 *
 * Three kinds, in the order they should win: a prep recipe (the kitchen makes
 * it), a stocked catalog item (it arrives on a truck), then another build (a
 * component that is itself a menu item, like the Philly inside a Philly Pasta).
 */
/**
 * What the sheets call a prep, where that differs from the prep's own name.
 *
 * Hand-checked, one at a time, against the live builds — a wrong entry points a
 * cook at the wrong recipe, which is worse than a card that links to nothing.
 * Anything genuinely ambiguous is left out: the sheets say "Tenders" for both
 * the brined and the blackened, and "Cheese Wedges" for both the mozzarella and
 * the pepper jack, so neither is guessed at.
 */
const SHEET_ALIASES: Record<string, string> = {
  // The sheets write "Alfredo Sauce" where the prep card is just "Alfredo".
  // Without this a longer catalog key ("Alfredo Sauce" as a stocked item) won
  // the match first and the prep card showed as used by nothing.
  'Alfredo Sauce': 'Alfredo',
  'Garlic Parm Sauce': 'Garlic Parmesan Sauce',
  Lettuce: 'Burger Lettuce',
  'Shredded Lettuce': 'Iceberg Lettuce (chopped)',
  Queso: 'Mugshots Queso Dip',
  Jalapeños: 'Sliced Jalapeños',
  Jalapenos: 'Sliced Jalapeños',
  Wings: 'Blanched Wings',
  'Monster Cookie: Cookie Crumble': 'Monster Cookie Prep',
  'Grilled Veggies': 'Veggie Mix',
  Mahi: 'Mahi Mahi',
  Penne: 'New Pasta',
  'Fried Shrimp': 'Pow Pow Shrimp',
  'Pow Pow Sauce': 'Pow Pow Shrimp Sauce',
  // What the sheets print, where it differs from the prep card's name.
  'Mozz Wedges': 'Mozzarella Wedges',
  // NOT a bare "Pepperjack" — that matched the pepper jack SLICE on Caitlin's
  // Cajun, the Comeback and the Patty Melt, which is a different product from
  // the breaded wedge. A wrong link is worse than none.
  'Slice Tomato': 'Sliced Tomatoes',
  Rotel: 'Rotel Cheese Sauce',
  Rolls: 'Egg Rolls',
  'Sauteed Mushrooms': 'Shrooms',
  'Sautéed Mushrooms': 'Shrooms',
  Mushrooms: 'Shrooms',
  'Monster Cookie': 'Monster Cookie Prep',
}

function knownItems(prep: string[] = [], stock: string[] = []) {
  const prepNames = new Set(ACTIVE_SPECS.filter((s) => s.g === 'Prep').map((s) => s.name))
  const out = [
    // Aliases first, so a sheet's own wording resolves to the prep card before
    // a looser name gets a chance at it.
    ...Object.entries(SHEET_ALIASES)
      .filter(([, target]) => prepNames.has(target))
      .map(([alias, target]) => ({ name: alias, kind: 'prep' as LinkKind, as: target })),
    ...ACTIVE_SPECS.filter((s) => s.g === 'Prep').map((s) => ({ name: s.name, kind: 'prep' as LinkKind })),
    ...prep.map((n) => ({ name: n, kind: 'prep' as LinkKind })),
    ...stock.map((n) => ({ name: n, kind: 'stock' as LinkKind })),
    ...ACTIVE_SPECS.filter((s) => s.g !== 'Prep').map((s) => ({ name: s.name, kind: 'build' as LinkKind })),
  ].map((x) => ({ ...x, key: componentKey(x.name) }))
  // First name wins per key, so a prep recipe beats a same-named stock item.
  const seen = new Set<string>()
  return out
    .filter((x) => x.key.length >= 3 && !seen.has(x.key) && seen.add(x.key))
    .sort((a, b) => b.key.length - a.key.length)
}

/**
 * Read one printed line: split off its quantity, and find the prep recipe it
 * uses. The search runs over the WHOLE line, not just the part after the
 * quantity, so an instruction still links — "Toss with 1 oz Comeback Sauce"
 * points at Comeback Sauce the same as a plain "1 oz Comeback Sauce" would.
 */
export function readLine(raw: string, prepNames: string[] = [], stockNames: string[] = []): ReadLine {
  const m = raw.match(QTY)
  const qty = m && m[0].trim() ? m[0].trim().replace(/\s+of$/i, '') : undefined
  const body = (m ? raw.slice(m[0].length) : raw).trim() || raw
  const hay = componentKey(raw)
  const matches = knownItems(prepNames, stockNames).filter(
    (k) => hay === k.key || hay.includes(` ${k.key} `) || hay.startsWith(`${k.key} `) || hay.endsWith(` ${k.key}`),
  )
  // An alias links to the prep card it stands for, not to its own wording —
  // "Grilled Veggies" on a sheet should open the Veggie Mix card.
  const seen = new Set<string>()
  const links = matches
    .map((k) => ({ name: (k as { as?: string }).as ?? k.name, kind: k.kind }))
    .filter((l) => !seen.has(l.name) && seen.add(l.name))
  return { raw, qty, body, links, link: links[0] }
}

/** Is this line a thing the kitchen stocks or preps, rather than a method? */
export function isComponent(body: string, qty?: string): boolean {
  if (!qty) return false
  if (body.split(/\s+/).length > 5 || body.includes('.')) return false
  return !/^(toss|drizzle|garnish|cut|combine|heat|place|mic|fry|serve|use|top|choose|portion)\b/i.test(body)
}

/**
 * Every portioned component across every build that has nothing behind it yet.
 * The owner wants each ingredient prepped or stocked in some form, so this is
 * the worklist for getting there — reviewed and added deliberately, never
 * created behind your back.
 */
export function missingComponents(prepNames: string[] = [], stockNames: string[] = []): string[] {
  const out = new Map<string, string>()
  for (const b of allBuilds())
    for (const s of b.sections)
      for (const raw of s.lines) {
        const r = readLine(raw, prepNames, stockNames)
        if (!r.link && isComponent(r.body, r.qty)) {
          const k = componentKey(r.body)
          if (k && !out.has(k)) out.set(k, r.body.replace(/,\s*$/, ''))
        }
      }
  return [...out.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Words a sheet drops from a dish's full name — "Buffalo Bleu" on the sheet is
 * "Buffalo Bleu Salad" in the app. A bare number counts too: the hot-dog sheet
 * titles one build "Firecracker Popper Dog 250", which is a menu code rather
 * than part of the dish's name.
 *
 * Only these may differ, because any OTHER extra word marks a different
 * product: "Texan" and "Texan SmashBurger" are two menu items, and showing
 * one's build on the other puts the wrong ticket in a cook's hands.
 */
const GENERIC_TAIL = /^(salad|bowl|burger|wrap|plate|basket|dog|sandwich|combo|build|\d+)$/

/**
 * Sheets the kitchen files under a different name than the menu prints.
 *
 * The name rules deliberately refuse to guess across a real difference in
 * wording — that's what keeps "Texan" and "Texan SmashBurger" apart. But some
 * pairs genuinely are one dish under two names, and there's no rule that can
 * know it: the menu says Katie's Kickin' Chicken, the line's sheet says
 * Chicken Basket, and it's the same six knuckled tenders and six ounces of
 * fries in the same lined basket.
 *
 * Recorded here rather than as a tapped answer because an answer lives in one
 * browser's storage — the office laptop would know and the kitchen tablet
 * would still be asking. Data ships to every device.
 *
 * menu item → sheet name
 */
const BUILD_ALIASES: Record<string, string> = {
  "katie's kickin' chicken": 'Chicken Basket',
  // The sheet writes "10 Root Beer Float"; the card says 10 oz, like its 22 oz
  // twin and like both milkshakes.
  '10 oz root beer float': '10 Root Beer Float',
}
const ALIAS_BY_NORM = new Map(Object.entries(BUILD_ALIASES).map(([k, v]) => [norm(k), norm(v)]))

// Sheets with no owner would go here; there are none right now.
const DETACHED_SHEETS = new Set<string>()

/** The build for a menu item, matched on name. */
export function buildFor(name: string): LineBuild | undefined {
  const n = norm(name)
  if (DETACHED_SHEETS.has(n)) return undefined
  const aliased = ALIAS_BY_NORM.get(n)
  if (aliased) {
    const hit = allBuilds().find((b) => norm(b.sheetName) === aliased)
    if (hit) return hit
  }
  const exact = allBuilds().find((b) => norm(b.sheetName) === n)
  if (exact) return exact
  return allBuilds().find((b) => {
    const s = norm(b.sheetName)
    const [long, short] = n.length > s.length ? [n, s] : [s, n]
    if (!long.startsWith(`${short} `)) return false
    return long
      .slice(short.length + 1)
      .split(' ')
      .every((w) => GENERIC_TAIL.test(w))
  })
}

/**
 * The reverse trail: for every prep recipe and stocked item, which dishes it
 * goes into. Diced Tomatoes lands on half the menu, so a cook changing that
 * prep — or a manager setting its par — can see what it feeds.
 *
 * Built once over every build rather than re-scanned per item, so a prep sheet
 * of a hundred rows costs one pass instead of a hundred.
 */
export function usageIndex(prepNames: string[] = [], stockNames: string[] = []): Map<string, string[]> {
  const idx = new Map<string, string[]>()
  for (const b of allBuilds())
    for (const s of b.sections)
      for (const raw of s.lines) {
        for (const link of readLine(raw, prepNames, stockNames).links) {
          const list = idx.get(link.name) ?? []
          if (!list.includes(b.sheetName)) list.push(b.sheetName)
          idx.set(link.name, list)
        }
      }
  for (const list of idx.values()) list.sort((a, b) => a.localeCompare(b))
  return idx
}

/** Which builds use a given item — the single-item form of usageIndex. */
export function usedIn(name: string, prepNames: string[] = [], stockNames: string[] = []): string[] {
  return usageIndex(prepNames, stockNames).get(name) ?? []
}

/**
 * What one item goes into, with the name lists filled in for you.
 *
 * Every caller was assembling the same three lists — the prep sheet, the bar
 * prep sheet, the stock catalog — before it could ask. The recipe card has no
 * business knowing a prep sheet exists, so it asks this instead.
 */
export function goesInto(name: string): string[] {
  return usageIndex([...prepItemNames(), ...barPrepNames()], getCatalog().map((i) => i.name)).get(name) ?? []
}

const PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/lto/*.jpg', { eager: true, query: '?url', import: 'default' }),
  ).map(([p, url]) => [p.split('/').pop()!.replace('.jpg', ''), url as string]),
)

export const buildPhoto = (b: LineBuild): string | undefined =>
  b.photo ? PHOTOS[b.photo.replace(/\.jpg$/, '')] : PHOTOS[slugify(b.sheetName)]
