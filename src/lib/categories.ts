import type { Spec } from './types'

// Single source of truth for "is this a drink?" so Specs and Signature Drinks
// never disagree. Whole drink groups always count; inside the mixed Summer LTO
// group we detect drinks by name (the rest of that group is food).
const DRINK_GROUPS = new Set(['Frozen Drinks', 'Shakes', 'Pairings'])
const LTO_DRINK = /\b(rita|margarita|daiquiri|shake|cocktail|mule|buck|spritz|sangria|mojito|punch)\b/i
/**
 * A float is a drink.
 *
 * It was filed as a dessert build and then hand-listed onto the drinks page as
 * well, so the same card turned up in two places under two headings — which is
 * confusing to read and worse to maintain, because "which one is the real one"
 * has no answer. It's made at the same station as a shake, out of the same
 * things, so it lives where the shakes live and only there.
 */
const FLOAT = /\bfloat\b/i

export function isDrink(s: Spec): boolean {
  if (DRINK_GROUPS.has(s.g)) return true
  if (FLOAT.test(s.name)) return true
  if (s.g === 'Summer LTO' && LTO_DRINK.test(s.name)) return true
  return false
}

export const isFood = (s: Spec): boolean => !isDrink(s)
