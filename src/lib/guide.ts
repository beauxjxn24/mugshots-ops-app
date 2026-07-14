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
