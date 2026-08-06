import { load, save } from './store'
import { useScope } from './scope'
import { SPECS } from './specs'
import { LINE_BUILDS, buildFor, norm, type LineBuild } from './linebuilds'
import type { Spec } from './types'

/**
 * Reconciling a new sheet against the menu already in the app.
 *
 * A sheet names a dish however the kitchen writes it, which is not always what
 * the app calls it. Some of those differences are the same dish — "Buffalo
 * Bleu" is "Buffalo Bleu Salad" — and some are two products that merely read
 * alike: "Texan" and "Texan SmashBurger" are different burgers, and putting one
 * build on the other's card hands a cook the wrong ticket.
 *
 * Name rules alone can't tell those apart, and guessing wrong is worse than
 * asking. So a close-but-not-certain pair becomes a question: update the
 * existing item, or keep it as its own card? The answer is recorded, so it is
 * asked once and never again.
 */
export interface BuildDecision {
  /** Name as printed on the sheet. */
  sheetName: string
  /** The menu item it belongs to — empty means "this is its own dish". */
  spec: string
  by: string
  at: string
}

const key = () => {
  const s = useScope.getState()
  // Concept-level, like the item catalog: the menu is the brand's, not one
  // store's, so a decision made at Flowood holds at Pearl too.
  return `${s.currentConcept}::linebuilds:decisions`
}

export const getDecisions = (): BuildDecision[] => {
  const r = load<BuildDecision[]>(key(), [])
  return Array.isArray(r) ? r.filter((d) => d && typeof d.sheetName === 'string') : []
}

/** Record an answer. One decision per sheet name; a later answer replaces it. */
export function decide(sheetName: string, spec: string, by = 'Manager'): void {
  const rest = getDecisions().filter((d) => norm(d.sheetName) !== norm(sheetName))
  save(key(), [...rest, { sheetName, spec, by, at: new Date().toISOString() }])
}

/** Undo an answer, so the pair is asked about again. */
export function unDecide(sheetName: string): void {
  save(
    key(),
    getDecisions().filter((d) => norm(d.sheetName) !== norm(sheetName)),
  )
}

/** The menu item a sheet has been pinned to, if one was chosen. */
export function decidedSpec(sheetName: string): string | undefined {
  const d = getDecisions().find((x) => norm(x.sheetName) === norm(sheetName))
  return d?.spec || undefined
}

/**
 * How alike two names are, 0–1. Compares the WORDS rather than the letters,
 * because that is what distinguishes these cases: "Texan" and "Texan
 * SmashBurger" share every letter of the shorter name yet differ by a whole
 * product word, while "Buffalo Bleu" and "Buffalo Bleu Salad" differ only by a
 * word that names a category.
 */
function similarity(a: string, b: string): number {
  const A = norm(a).split(' ').filter(Boolean)
  const B = norm(b).split(' ').filter(Boolean)
  if (!A.length || !B.length) return 0
  const shared = A.filter((w) => B.includes(w)).length
  return shared / Math.max(A.length, B.length)
}

export interface PendingMatch {
  build: LineBuild
  /** Menu items it might belong to, best first. */
  candidates: Spec[]
}

/**
 * Sheets that need an answer: close enough to a menu item to be worth asking
 * about, not close enough for the name rules to be sure, and not already
 * decided. An exact or generic-tail match ("… Salad", "… Burger") is certain
 * and never asked about.
 */
export function pendingMatches(): PendingMatch[] {
  const decided = new Set(getDecisions().map((d) => norm(d.sheetName)))
  // Which builds a menu item already claims. Asking whether the BUILD resolves
  // is meaningless — buildFor() looks builds up by name, so a build always
  // finds itself. What settles a sheet is a menu item pointing AT it.
  const claimed = new Set(
    SPECS.filter((s) => s.g !== 'Prep')
      .map((s) => buildFor(s.name))
      .filter((b): b is LineBuild => !!b)
      .map((b) => norm(b.sheetName)),
  )
  const out: PendingMatch[] = []
  for (const b of LINE_BUILDS) {
    if (decided.has(norm(b.sheetName))) continue
    if (claimed.has(norm(b.sheetName))) continue // a menu item already owns it
    const candidates = SPECS.filter((s) => s.g !== 'Prep')
      .map((s) => ({ s, score: similarity(s.name, b.sheetName) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, 3)
      .map((x) => x.s)
    if (candidates.length) out.push({ build: b, candidates })
  }
  return out
}

/**
 * Menu items whose build comes from a sheet, including ones pinned by an
 * answer. This is what the rest of the app reads.
 */
export function buildForSpec(specName: string): LineBuild | undefined {
  const pinned = getDecisions().find((d) => d.spec && norm(d.spec) === norm(specName))
  if (pinned) {
    const hit = LINE_BUILDS.find((b) => norm(b.sheetName) === norm(pinned.sheetName))
    if (hit) return hit
  }
  // A sheet answered as "its own dish" must not be claimed by the name rules.
  const own = new Set(getDecisions().filter((d) => !d.spec).map((d) => norm(d.sheetName)))
  const guess = buildFor(specName)
  return guess && !own.has(norm(guess.sheetName)) ? guess : undefined
}
