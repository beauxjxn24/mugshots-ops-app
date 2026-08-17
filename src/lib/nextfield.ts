// Enter drops to the next row's box instead of doing nothing.
//
// Every counting screen in this app is the same job: one pass down a list,
// typing a number per line — bottles on hand, hours worked, tip-outs. Reaching
// for each next box by hand is what makes that pass slow, and it is always
// being done standing up, one thumb, at the end of a shift.
//
// Mark the container with `entryColumn` and each box with `entryField('name')`.
// The name keeps columns apart: on a sheet with both a par and an on-hand
// column, Enter in on-hand goes to the next on-hand, not sideways into par.
import type { KeyboardEvent } from 'react'

/** Put this on whatever wraps the rows. */
export const entryColumn = { 'data-entrycol': '' }

/**
 * Put this on each input. `name` groups boxes into a column — Enter walks down
 * the boxes sharing a name, in document order.
 */
export const entryField = (name: string) => ({
  'data-entry': name,
  onKeyDown: enterMovesDown,
})

export function enterMovesDown(ev: KeyboardEvent<HTMLInputElement>): void {
  if (ev.key !== 'Enter') return
  const name = ev.currentTarget.dataset.entry
  if (name == null) return
  ev.preventDefault()
  const column = ev.currentTarget.closest('[data-entrycol]')
  if (!column) return
  const boxes = Array.from(
    column.querySelectorAll<HTMLInputElement>(`input[data-entry="${CSS.escape(name)}"]`),
  ).filter((el) => !el.disabled && el.offsetParent !== null)
  const next = boxes[boxes.indexOf(ev.currentTarget) + 1]
  if (next) {
    next.focus()
    // Selected, so the next number types straight over the old one.
    next.select()
  } else {
    // End of the list — let the keyboard go rather than leaving it up over a
    // sheet with nothing left to type into.
    ev.currentTarget.blur()
  }
}
