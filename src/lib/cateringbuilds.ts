// The catering build cards — how a platter or a boxed lunch is actually packed.
//
// Transcribed from the store's Catering Builds packet: ten cards, each with the
// packaging and product numbers it takes, the procedure, and the photo of the
// finished thing.
//
// ── Why it lives on the Catering page ────────────────────────────────────────
//
// Because that's where the order is. A cook packing a Mombo Platter at ten in
// the morning has the ticket open; making them go to Specs and search for it is
// the same hunt that keeps a laminated packet in a drawer instead of on the
// line. The order and the build sit together.
//
// The dish builds on Specs are a different job — one plate, one guest. These
// are trays: how many liners, which squat cups, where the sauces go, which
// sticker goes on the lid.
import CARDS from '../data/catering-builds.json'

export interface PackLine {
  /** What it is — "16\" Black Plastic Platter". */
  item: string
  /** Vendor and product number, exactly as the packet prints it. */
  sku: string
}
export interface BuildStep {
  /**
   * A variant within the card, where the packet indents under one.
   *
   * The Salad Boxed Lunch is really three builds — Blackened Chicken, Grilled
   * Chicken Caesar, and the shrimp substitution — printed as headings with
   * their own steps under them. Flattening those into one list would have a
   * cook building a Caesar with ranch.
   */
  head?: string
  body: string[]
}
export interface CateringBuild {
  name: string
  packaging: PackLine[]
  /** The packet's own heading — "Procedure", "Burger/Sandwich Packing Procedure". */
  procHead: string
  steps: BuildStep[]
  photos: string[]
}

export const CATERING_BUILDS = CARDS as CateringBuild[]

// Bundled the same way the dish photos are, so they're offline with everything
// else — a kitchen tablet on a dead wifi still packs the tray.
const PHOTOS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/catering/*.jpg', { eager: true, query: '?url', import: 'default' }),
  ).map(([p, url]) => [p.split('/').pop() as string, url as string]),
)

export const buildPhoto = (file: string): string | undefined => PHOTOS[file]

/** Platters and boxed lunches read as two different jobs, so they group. */
export function groupOf(name: string): string {
  if (/boxed lunch/i.test(name)) return 'Boxed lunches'
  if (/platter|tray/i.test(name)) return 'Platters'
  return 'Other'
}

export const GROUP_ORDER = ['Platters', 'Boxed lunches', 'Other']

export function findBuild(name: string): CateringBuild | undefined {
  const n = name.trim().toLowerCase()
  return CATERING_BUILDS.find((b) => b.name.toLowerCase() === n)
}
