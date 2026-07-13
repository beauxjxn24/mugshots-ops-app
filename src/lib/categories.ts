import type { Spec } from './types'

// Single source of truth for "is this a drink?" so Specs and Signature Drinks
// never disagree. Whole drink groups always count; inside the mixed Summer LTO
// group we detect drinks by name (the rest of that group is food).
const DRINK_GROUPS = new Set(['Frozen Drinks', 'Shakes', 'Pairings'])
const LTO_DRINK = /\b(rita|margarita|daiquiri|shake|cocktail|mule|buck|spritz|sangria|mojito|punch)\b/i

export function isDrink(s: Spec): boolean {
  if (DRINK_GROUPS.has(s.g)) return true
  if (s.g === 'Summer LTO' && LTO_DRINK.test(s.name)) return true
  return false
}

export const isFood = (s: Spec): boolean => !isDrink(s)
