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
  /**
   * Set when the item has left the live menu — the reason, not just a flag,
   * because "gone" and "moved to the OG menu" are different facts and the
   * kitchen asks which one. Archived rather than deleted: the build is still
   * wanted for catering, for the OG menu, and for the next time it comes back.
   */
  off?: string
  /**
   * OG — off the printed menu but still made on request, product allowing.
   * Distinct from retired: a retired build is not coming back, an OG one is
   * cooked the moment a guest asks for it, so the line still needs the card
   * within reach rather than buried in an archive.
   */
  og?: boolean
  /**
   * An intermediate prep — it feeds other prep, not a dish directly.
   *
   * Brined chicken becomes the fried tenders and the blackened breast; the
   * queso portions come out of the queso dip. Asking which menu item uses them
   * is the wrong question, and leaving them looking unlinked reads as a fault
   * when it isn't one.
   */
  prepOnly?: boolean
  /**
   * Menu items this prep feeds, set by hand.
   *
   * The sheets phrase some things in ways no matcher should be asked to read —
   * "3 Mozzarella or Pepperjack" is one line offering two preps, and the caesar
   * romaine is named on cards that have no sheet yet. Owner-confirmed, and
   * merged with whatever the sheets themselves say.
   */
  usedIn?: string[]
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
