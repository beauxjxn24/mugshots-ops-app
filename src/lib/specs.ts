import raw from '../data/specs.json'
import type { Spec } from './types'

export const SPECS = raw as Spec[]

/** Stable category order for the Specs screen. */
export const GROUP_ORDER = [
  'Burger Builds',
  'Line Builds',
  'Sandwich & Wrap Builds',
  'Hot Dog Builds',
  'Salad & Bowl Builds',
  'Pasta & Plate Builds',
  'Appetizer Builds',
  'Kids Builds',
  'Dessert Builds',
  'Summer LTO',
  'Pairings',
  'Shakes',
  'Frozen Drinks',
  'Prep',
]

export function groups(): string[] {
  const seen = new Set(SPECS.map((s) => s.g))
  const ordered = GROUP_ORDER.filter((g) => seen.has(g))
  const extras = [...seen].filter((g) => !GROUP_ORDER.includes(g))
  return [...ordered, ...extras]
}

export function slug(g: string): string {
  return g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function search(query: string): Spec[] {
  const q = query.trim().toLowerCase()
  if (!q) return SPECS
  return SPECS.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.g.toLowerCase().includes(q) ||
      s.ing.some(([n]) => n.toLowerCase().includes(q)),
  )
}
