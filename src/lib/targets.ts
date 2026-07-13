// Weekly targets — Admin-set per store (handoff spec: Store setup → Weekly
// targets). Feed every goal pill: Nightly labor flag, Dashboard, Period,
// Forecast labor budgets. Defaults per the prototype: Labor ≤ 14.2%, Growth +3%.
export interface Targets {
  laborPct: number
  growthPct: number
}
export const DEFAULT_TARGETS: Targets = { laborPct: 14.2, growthPct: 3 }
export const TARGETS_KEY = 'setup:targets'
