// Which recipes are archived — one answer, for every screen that lists them.
//
// The archive list used to be private to the Specs screen, so archiving a card
// there hid it on Specs and nowhere else: Line Builds is a view of the SAME
// specs, and it kept printing the pulled item onto the line's board. A cook
// reading the board had no way to know the card had been retired.
//
// Two things retire a card, and both belong in the same set:
//   - `off` in specs.json — pulled in a menu rollout, so it's archived on every
//     device without anyone tapping anything.
//   - the stored list — archived by hand on this device.
import { useMemo } from 'react'
import { SPECS } from './specs'
import { usePersistentState } from './store'

export const ARCHIVED_KEY = 'recipes:archived'

/**
 * The archived set, plus a setter for the hand-archived half.
 *
 * `off` items are data, not device state, so they're in the set but not in the
 * stored list — un-archiving one by hand isn't a thing, and shouldn't be.
 */
export function useArchived(): {
  archived: string[]
  setArchived: (v: string[] | ((p: string[]) => string[])) => void
  archivedSet: Set<string>
} {
  const [archived, setArchived] = usePersistentState<string[]>(ARCHIVED_KEY, [])
  const archivedSet = useMemo(
    () => new Set([...archived, ...SPECS.filter((s) => s.off).map((s) => s.name)]),
    [archived],
  )
  return { archived, setArchived, archivedSet }
}
