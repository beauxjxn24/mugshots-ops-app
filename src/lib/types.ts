// Core domain types. Kept deliberately small and serialization-friendly so the
// same shapes flow through local storage today and POS/vendor adapters later.

export type Ingredient = [name: string, qty: string]

export interface Spec {
  /** Display name, e.g. "Classic Smash" */
  name: string
  /** Group / category, e.g. "Burger Builds", "Prep" */
  g: string
  storage: string
  shelf: string
  yields: string
  ing: Ingredient[]
  steps: string[]
}

/** A source the app can sync from — file import today, live API later. */
export interface IntegrationSource {
  id: string
  kind: 'pos' | 'vendor'
  /** e.g. "toast", "square", "us-foods", "sysco" */
  provider: string
  label: string
  /** 'file' = CSV/PDF import; 'api' = live connection (needs backend + creds). */
  mode: 'file' | 'api'
  connected: boolean
}
