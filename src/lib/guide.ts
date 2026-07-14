// Order-guide layout — mirrors the owner's paper guides: named sections in a
// fixed order (Vodka, Rum, Whiskey…), items draggable within and across
// sections. The layout is per store; the items themselves live once in the
// Item Catalog. Flowood's liquor guide seeds from the owner's 2025 sheet.

import { load, save } from './store'
import { useScope } from './scope'
import { getCatalog, getFlags, getPars, setPars, setOnGuide, registerItem } from './catalog'
import LIQUOR_SEED from '../data/liquor-guide-flowood.json'

export interface GuideSection {
  title: string
  ids: string[]
}

export const GUIDE_SHELVES = ['Liquor', 'Beer', 'Produce'] as const
export type GuideShelf = (typeof GUIDE_SHELVES)[number] | 'Other'

const scoped = (k: string) => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}
const layoutKey = (shelf: GuideShelf) => scoped(`guide:sections:${shelf}`)

/** One-time: build Flowood's liquor guide from the owner's 2025 order sheet. */
export function seedLiquorGuide(): void {
  const s = useScope.getState()
  if (s.currentLocation !== 'flowood') return
  if (load<string>(scoped('guide:seeded:liquor'), '') === 'v1') return
  const sections: GuideSection[] = []
  const pars = getPars()
  for (const sec of LIQUOR_SEED as Array<{ title: string; items: Array<{ name: string; par: number }> }>) {
    const ids: string[] = []
    for (const it of sec.items) {
      const ci = registerItem({ name: it.name, unit: 'btl', category: 'Liquor' })
      setOnGuide(ci.id, true)
      const cur = pars[ci.id] ?? { par: 0, onHand: 0 }
      pars[ci.id] = { ...cur, par: it.par || cur.par }
      ids.push(ci.id)
    }
    sections.push({ title: sec.title, ids })
  }
  setPars(pars)
  save(layoutKey('Liquor'), sections)
  save(scoped('guide:seeded:liquor'), 'v1')
}

/** Does this catalog item belong on the given shelf tab? */
export function onShelf(category: string, shelf: GuideShelf): boolean {
  if (shelf === 'Other') return !GUIDE_SHELVES.includes(category as (typeof GUIDE_SHELVES)[number])
  return category === shelf
}

/**
 * The shelf's sections, reconciled with the catalog: items flipped off the
 * guide disappear, new on-guide items (e.g. from a received invoice) append
 * to the last section, and a missing layout becomes one "Items" section.
 */
export function getGuideSections(shelf: GuideShelf): GuideSection[] {
  const flags = getFlags()
  const live = new Map(getCatalog().filter((ci) => flags[ci.id] && onShelf(ci.category, shelf)).map((ci) => [ci.id, ci]))
  const stored = load<GuideSection[]>(layoutKey(shelf), [])
  const seen = new Set<string>()
  const sections: GuideSection[] = stored
    .map((sec) => ({
      title: sec.title,
      ids: sec.ids.filter((id) => {
        if (!live.has(id) || seen.has(id)) return false
        seen.add(id)
        return true
      }),
    }))
    .filter((sec) => sec.ids.length > 0 || stored.length <= 3)
  const missing = [...live.keys()].filter((id) => !seen.has(id))
  if (missing.length) {
    if (sections.length === 0) sections.push({ title: 'Items', ids: [] })
    sections[sections.length - 1].ids.push(...missing)
  }
  return sections
}

export function setGuideSections(shelf: GuideShelf, sections: GuideSection[]): void {
  save(layoutKey(shelf), sections)
}

/** Move an item between positions (possibly across sections) and persist. */
export function moveGuideItem(
  shelf: GuideShelf,
  from: { sec: number; idx: number },
  to: { sec: number; idx: number },
): GuideSection[] {
  const sections = getGuideSections(shelf).map((s) => ({ ...s, ids: [...s.ids] }))
  const src = sections[from.sec]
  const dst = sections[to.sec]
  if (!src || !dst) return sections
  const [id] = src.ids.splice(from.idx, 1)
  if (!id) return sections
  dst.ids.splice(Math.min(to.idx, dst.ids.length), 0, id)
  setGuideSections(shelf, sections)
  return sections
}

// Which section a NEW item belongs in — so invoice adds don't pile up at the
// bottom of the guide. Score every section by title keywords and by word
// overlap with the items already living there; best score wins.
const SECTION_HINTS: Array<[RegExp, RegExp]> = [
  [/vodka/i, /vodka|tito|goose|absolut|ketel|deep eddy|cathead|pinnacle/i],
  [/rum/i, /rum|bacardi|morgan|malibu|don q/i],
  [/whiskey|bourbon/i, /whiskey|bourbon|rye|crown|jack|jim beam|jameson|maker|fireball|woodford|evan williams|elijah|screw ball|ancient age/i],
  [/scotch/i, /scotch|dewar|johnn?ie? walker/i],
  [/tequila/i, /tequila|patron|don julio|lunazul|casamigos|two fingers|reposado|blanco|anejo/i],
  [/gin/i, /\bgin\b|tanqueray|bombay|amsterdam/i],
  [/liqueur/i, /liqueur|jager|goldschlager|amaretto|schnapps|triple sec|cointreau|grand marnier|curacao|razzmataz|pama|boston/i],
  [/cream|coffee/i, /baileys|kahlua|cream/i],
  [/flavor|pur|bitter|mix/i, /puree|purée|bitters|grenadine|ginger beer|finest call|mix\b|juice/i],
  [/red wine/i, /cab|pinot noir|merlot|malbec/i],
  [/white wine/i, /grigio|grigo|chardonnay|moscato|riesling|zin|sauv/i],
  [/champagne/i, /champagne|tott|brut|prosecco/i],
]

export function bestSectionFor(shelf: GuideShelf, name: string): number {
  const sections = getGuideSections(shelf)
  if (sections.length <= 1) return Math.max(0, sections.length - 1)
  const items = new Map(getCatalog().map((ci) => [ci.id, ci.name]))
  const words = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  let best = sections.length - 1
  let bestScore = 0
  sections.forEach((sec, si) => {
    let score = 0
    for (const [titleRe, nameRe] of SECTION_HINTS) {
      if (titleRe.test(sec.title) && nameRe.test(name)) score += 3
    }
    for (const id of sec.ids) {
      const other = (items.get(id) ?? '').toLowerCase().split(/[^a-z0-9]+/)
      let shared = 0
      for (const w of other) if (w.length > 2 && words.has(w)) shared++
      score = Math.max(score, score + (shared >= 2 ? 2 : shared))
    }
    if (score > bestScore) {
      bestScore = score
      best = si
    }
  })
  return best
}

/** Put an (already-registered) item into the right section of its shelf. */
export function placeItemInGuide(shelf: GuideShelf, id: string, name: string): void {
  const si = bestSectionFor(shelf, name)
  const sections = getGuideSections(shelf).map((s) => ({ ...s, ids: [...s.ids] }))
  for (const s of sections) s.ids = s.ids.filter((x) => x !== id)
  if (sections.length === 0) sections.push({ title: 'Items', ids: [] })
  sections[Math.min(si, sections.length - 1)].ids.push(id)
  setGuideSections(shelf, sections)
}

/** Register a new item straight into a specific section of a shelf's guide. */
export function addGuideItem(shelf: GuideShelf, secIdx: number, name: string, unit = 'btl'): void {
  const ci = registerItem({ name, unit, category: shelf === 'Other' ? 'Food' : shelf })
  setOnGuide(ci.id, true)
  const sections = getGuideSections(shelf).map((s) => ({ ...s, ids: [...s.ids] }))
  // getGuideSections may have already appended the fresh item to the last
  // section — pull it out and drop it where the owner actually asked.
  for (const s of sections) s.ids = s.ids.filter((x) => x !== ci.id)
  if (sections.length === 0) sections.push({ title: 'Items', ids: [] })
  const target = sections[Math.min(secIdx, sections.length - 1)]
  target.ids.push(ci.id)
  setGuideSections(shelf, sections)
}
