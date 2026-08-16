// Reading a build sheet the kitchen already prints.
//
// The rollout sheets are one dish per page, laid out as a two-column table: a
// stage label on the left ("Plateware", "On Bottom", "Procedure", "Portion
// Size / Prep", "On Top", "On Side") and what to do on the right. That is the
// same shape as a LineBuild, so a sheet doesn't need translating — it needs
// reading.
//
// These arrive as scans, so the text comes from OCR and is imperfect: a stray
// character, a wrapped line, a label read as "0n Top". Everything below is
// built to fail visibly rather than quietly — an unrecognised line is kept
// verbatim under the last label it saw, and the importer shows what it read
// before anything is written. A card nobody checked is worse than no card.
import { load, save } from './store'
import { useScope } from './scope'
import type { BuildSection, LineBuild } from './linebuilds'

/**
 * Stage labels seen on the sheets, loosely matched.
 *
 * Loose because OCR mangles them and because the sheets are not perfectly
 * consistent with each other — "Portion Size/ Prep" on one, "Portion Size &
 * Prep" on another, "Veggie/Build" and "Veggies/Build" on two salads.
 */
const LABELS: { key: string; label: string; re: RegExp }[] = [
  { key: 'plateware', label: 'Plateware', re: /^p[lI1]ateware\b/i },
  { key: 'bread', label: 'Bread', re: /^bread\b/i },
  { key: 'base', label: 'Base', re: /^base\b/i },
  { key: 'bottom', label: 'On Bottom', re: /^[o0]n\s*bottom\b/i },
  { key: 'bun', label: 'Bun', re: /^bun\b/i },
  { key: 'veggies', label: 'Sauce & Veggies', re: /^(sauce\s*[&+]?\s*veg\w*|veggies?\s*\/?\s*build)/i },
  { key: 'meat', label: 'Meat', re: /^meat\b/i },
  { key: 'procedure', label: 'Procedure', re: /^proce(d|cl)ure\b/i },
  { key: 'portion', label: 'Portion Size / Prep', re: /^portion\s*size(\s*[/&+]?\s*prep)?\b/i },
  { key: 'top', label: 'On Top', re: /^[o0]n\s*top\b/i },
  { key: 'side', label: 'On Side', re: /^[o0]n\s*side\b/i },
  { key: 'note', label: 'Note', re: /^note\b/i },
]

/** Does this text look like one of the kitchen's build sheets? */
export function isBuildSheet(text: string): boolean {
  const t = text.slice(0, 4000)
  const hits = LABELS.filter((l) => new RegExp(l.re.source, 'im').test(t)).length
  // Plateware plus two other stages. One label alone shows up in prose; three
  // together is a table.
  return /p[lI1]ateware/i.test(t) && hits >= 3
}

/**
 * Pull a dish name off the top of the sheet.
 *
 * The title sits above the table in a yellow band and is the first line of any
 * substance. "New", "NEW -" and "Build" are how the kitchen labels a revision
 * and are not part of the dish's name.
 */
function readTitle(lines: string[]): { name: string; at: number } {
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const l = lines[i].trim()
    if (!l || LABELS.some((x) => x.re.test(l))) continue
    if (/^(mugshots|grill\s*&?\s*bar)$/i.test(l)) continue
    return {
      name: l
        .replace(/^new\s*[-–—:]?\s*/i, '')
        .replace(/\s*\bbuild\b\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
      at: i,
    }
  }
  return { name: '', at: -1 }
}

export interface ParsedSheet {
  sheetName: string
  sections: BuildSection[]
  /** Lines that arrived before any label — kept so nothing is silently lost. */
  stray: string[]
}

/** Read one sheet's text into the shape a LineBuild uses. */
export function parseBuildSheet(text: string): ParsedSheet | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const { name: sheetName, at: titleAt } = readTitle(lines)
  const sections: BuildSection[] = []
  const stray: string[] = []
  let current: BuildSection | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip the title by position — "Pow Pow Build" is trimmed to "Pow Pow", so
    // comparing against the cleaned name leaves the raw line looking stray.
    if (i === titleAt) continue
    const hit = LABELS.find((l) => l.re.test(line))
    if (hit) {
      // The value often sits on the same line as its label.
      const rest = line.replace(hit.re, '').replace(/^[\s:–—-]+/, '').trim()
      current = { key: hit.key, label: hit.label, lines: rest ? [rest] : [] }
      sections.push(current)
      continue
    }
    // Not a label — it belongs to whatever stage we're inside. Kept verbatim,
    // wrapping and all, because a spec card is quoted, not paraphrased.
    if (current) current.lines.push(line)
    else stray.push(line)
  }

  const kept = sections.filter((s) => s.lines.length > 0)
  if (!sheetName || kept.length < 2) return null
  return { sheetName, sections: kept, stray }
}

// ---- storage -------------------------------------------------------------
// Imported sheets live beside the ones shipped with the app rather than
// replacing them, so an import can always be undone by deleting it.

export interface ImportedBuild extends LineBuild {
  /** When it was brought in, and by whom, so a wrong card can be traced. */
  at: string
  by: string
}

const key = (): string => {
  const s = useScope.getState()
  // Concept-level, like the build decisions: a sheet is the brand's menu, not
  // one store's.
  return `${s.currentConcept}::linebuilds:imported`
}

export function getImported(): ImportedBuild[] {
  const r = load<ImportedBuild[]>(key(), [])
  return Array.isArray(r) ? r.filter((b) => b && typeof b.sheetName === 'string') : []
}

/** Save a sheet, replacing any earlier import of the same dish. */
export function saveImported(b: ImportedBuild): void {
  const cur = getImported().filter(
    (x) => x.sheetName.toLowerCase() !== b.sheetName.toLowerCase(),
  )
  save(key(), [...cur, b])
}

export function removeImported(sheetName: string): void {
  save(
    key(),
    getImported().filter((x) => x.sheetName.toLowerCase() !== sheetName.toLowerCase()),
  )
}
