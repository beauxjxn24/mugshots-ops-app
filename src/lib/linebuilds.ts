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
  link?: { name: string; kind: 'prep' | 'build' }
}

/** Everything the app already knows by name, longest first so "Diced Tomatoes"
 *  wins over "Tomatoes". */
function knownItems(extra: string[] = []): { name: string; kind: 'prep' | 'build'; key: string }[] {
  const out = [
    ...SPECS.filter((s) => s.g === 'Prep').map((s) => ({ name: s.name, kind: 'prep' as const })),
    ...extra.map((n) => ({ name: n, kind: 'prep' as const })),
    ...SPECS.filter((s) => s.g !== 'Prep').map((s) => ({ name: s.name, kind: 'build' as const })),
  ].map((x) => ({ ...x, key: componentKey(x.name) }))
  return out.filter((x) => x.key.length >= 3).sort((a, b) => b.key.length - a.key.length)
}

/**
 * Read one printed line: split off its quantity, and find the prep recipe it
 * uses. The search runs over the WHOLE line, not just the part after the
 * quantity, so an instruction still links — "Toss with 1 oz Comeback Sauce"
 * points at Comeback Sauce the same as a plain "1 oz Comeback Sauce" would.
 */
export function readLine(raw: string, prepNames: string[] = []): ReadLine {
  const m = raw.match(QTY)
  const qty = m && m[0].trim() ? m[0].trim().replace(/\s+of$/i, '') : undefined
  const body = (m ? raw.slice(m[0].length) : raw).trim() || raw
  const hay = componentKey(raw)
  const hit = knownItems(prepNames).find(
    (k) => hay === k.key || hay.includes(` ${k.key} `) || hay.startsWith(`${k.key} `) || hay.endsWith(` ${k.key}`),
  )
  return { raw, qty, body, link: hit ? { name: hit.name, kind: hit.kind } : undefined }
}

/** The build for a menu item, matched on name. */
export function buildFor(name: string): LineBuild | undefined {
  const n = norm(name)
  return (
    LINE_BUILDS.find((b) => norm(b.sheetName) === n) ??
    // "Buffalo Bleu" on the sheet is "Buffalo Bleu Salad" in the app.
    LINE_BUILDS.find((b) => n.startsWith(`${norm(b.sheetName)} `) || norm(b.sheetName).startsWith(`${n} `))
  )
}

/** Which builds use a given prep item — the reverse trail, for the prep card. */
export function usedIn(prepName: string, prepNames: string[] = []): string[] {
  const key = componentKey(prepName)
  if (key.length < 3) return []
  return LINE_BUILDS.filter((b) =>
    b.sections.some((s) => s.lines.some((l) => readLine(l, prepNames).link?.name === prepName)),
  ).map((b) => b.sheetName)
}

export const buildPhoto = (b: LineBuild): string | undefined =>
  b.photo ? PHOTOS[b.photo.replace(/\.jpg$/, '')] : PHOTOS[slugify(b.sheetName)]

const PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/lto/*.jpg', { eager: true, query: '?url', import: 'default' }),
  ).map(([p, url]) => [p.split('/').pop()!.replace('.jpg', ''), url as string]),
)
