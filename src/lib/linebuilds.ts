import { SPECS } from './specs'
import { slugify } from './photos'

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

export const LINE_BUILDS: LineBuild[] = SHEETS.flatMap((s) =>
  s.dishes.map((d) => ({ ...d, sheet: s.sheet })),
).filter(
  // The owner's Burgers export repeats a page of the Appetizers sheet; one card
  // per item, first sheet wins.
  (d, i, all) => all.findIndex((x) => norm(x.sheetName) === norm(d.sheetName)) === i,
)

/** Lowercase, punctuation-free, singular-ish — for name comparison only. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bbleu\b/g, 'blue') // the sheets spell it both ways
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Words that describe a build rather than name a thing you keep on a shelf. */
const NOISE = /\b(the|of|a|an|with|and|on|in|to|for|each|side|top|bottom|bun|per|cut|into|thinly|sliced|chopped|diced|fresh|prepped|portion)\b/g

/** A component name reduced to its identity: "1/3 Cup of Diced Onions" → "onions". */
function componentKey(s: string): string {
  return norm(s).replace(NOISE, ' ').replace(/\s+/g, ' ').trim()
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
function knownItems(prep: string[] = [], stock: string[] = []) {
  const out = [
    ...SPECS.filter((s) => s.g === 'Prep').map((s) => ({ name: s.name, kind: 'prep' as LinkKind })),
    ...prep.map((n) => ({ name: n, kind: 'prep' as LinkKind })),
    ...stock.map((n) => ({ name: n, kind: 'stock' as LinkKind })),
    ...SPECS.filter((s) => s.g !== 'Prep').map((s) => ({ name: s.name, kind: 'build' as LinkKind })),
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
  const hit = knownItems(prepNames, stockNames).find(
    (k) => hay === k.key || hay.includes(` ${k.key} `) || hay.startsWith(`${k.key} `) || hay.endsWith(` ${k.key}`),
  )
  return { raw, qty, body, link: hit ? { name: hit.name, kind: hit.kind } : undefined }
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
  for (const b of LINE_BUILDS)
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
 * "Buffalo Bleu Salad" in the app. Only these may differ, because any OTHER
 * extra word marks a different product: "Texan" and "Texan SmashBurger" are two
 * menu items, and showing one's build on the other puts the wrong ticket in a
 * cook's hands.
 */
const GENERIC_TAIL = /^(salad|bowl|burger|wrap|plate|basket|dog|sandwich|combo)$/

/** The build for a menu item, matched on name. */
export function buildFor(name: string): LineBuild | undefined {
  const n = norm(name)
  const exact = LINE_BUILDS.find((b) => norm(b.sheetName) === n)
  if (exact) return exact
  return LINE_BUILDS.find((b) => {
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
  for (const b of LINE_BUILDS)
    for (const s of b.sections)
      for (const raw of s.lines) {
        const link = readLine(raw, prepNames, stockNames).link
        if (!link) continue
        const list = idx.get(link.name) ?? []
        if (!list.includes(b.sheetName)) list.push(b.sheetName)
        idx.set(link.name, list)
      }
  for (const list of idx.values()) list.sort((a, b) => a.localeCompare(b))
  return idx
}

/** Which builds use a given item — the single-item form of usageIndex. */
export function usedIn(name: string, prepNames: string[] = [], stockNames: string[] = []): string[] {
  return usageIndex(prepNames, stockNames).get(name) ?? []
}

export const buildPhoto = (b: LineBuild): string | undefined =>
  b.photo ? PHOTOS[b.photo.replace(/\.jpg$/, '')] : PHOTOS[slugify(b.sheetName)]

const PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/lto/*.jpg', { eager: true, query: '?url', import: 'default' }),
  ).map(([p, url]) => [p.split('/').pop()!.replace('.jpg', ''), url as string]),
)
