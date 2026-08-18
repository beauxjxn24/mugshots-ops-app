import { useState } from 'react'
import { Sun, Moon, ChevronDown, RotateCcw } from 'lucide-react'
import { useShift, shiftLabel, type Shift } from '../lib/shift'

/**
 * Which shift the app thinks it's on, and a way to say otherwise.
 *
 * Shown rather than inferred silently: when Tipshare opens on dinner or the
 * sidework sheet opens on the close, this is the thing that explains why. Tap
 * to pin the other one — a manager setting up the close at two in the afternoon
 * needs dinner, and the clock can't know that. The pin lasts until the business
 * day rolls over, so nobody has to remember to undo it.
 */
export function ShiftBadge({ compact = false }: { compact?: boolean }) {
  const { shift, auto, overridden, setShift } = useShift()
  const other: Shift = shift === 'AM' ? 'PM' : 'AM'
  const Icon = shift === 'AM' ? Sun : Moon

  if (compact) {
    return (
      <button
        onClick={() => setShift(other === auto ? null : other)}
        title={`${shiftLabel(shift)} shift${overridden ? ' · set by hand' : ''} — tap for ${shiftLabel(other).toLowerCase()}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold text-white/85"
      >
        <Icon size={12} />
        {shiftLabel(shift)}
        {overridden && <span className="text-white/45">·</span>}
      </button>
    )
  }

  return <ShiftReadout />
}

/**
 * The shift, stated once — with the switch behind a tap.
 *
 * It was a two-button toggle sitting permanently in the rail, which read as a
 * setting waiting to be chosen. It isn't one: the clock is right nearly every
 * day, and the override exists for the afternoon a manager sets up the close
 * early. So the normal state is a label that says what the app is on, and the
 * switch appears only when someone goes looking for it.
 */
function ShiftReadout() {
  const { shift, auto, overridden, setShift } = useShift()
  const [open, setOpen] = useState(false)
  const other: Shift = shift === 'AM' ? 'PM' : 'AM'
  const Icon = shift === 'AM' ? Sun : Moon
  const OtherIcon = other === 'AM' ? Sun : Moon

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={overridden ? 'Set by hand — clears overnight' : 'Following the clock'}
        className="flex w-full items-center gap-2 rounded-xl bg-white/[0.07] px-2.5 py-2 text-left hover:bg-white/10"
      >
        <Icon size={14} className="shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-white/90">{shiftLabel(shift)} shift</span>
          <span className="block text-[10px] leading-tight text-white/40">
            {overridden ? 'Set by hand · clears overnight' : 'On the clock'}
          </span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-white/35 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-1 rounded-xl bg-white/[0.05] p-1">
          <button
            // Choosing the shift the clock already wants clears the pin rather
            // than setting a redundant one, so it goes back to keeping itself
            // right at the next changeover.
            onClick={() => {
              setShift(other === auto ? null : other)
              setOpen(false)
            }}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white"
          >
            <OtherIcon size={13} />
            Switch to {shiftLabel(other).toLowerCase()}
          </button>
          {overridden && (
            <button
              onClick={() => {
                setShift(null)
                setOpen(false)
              }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-white/45 hover:bg-white/10 hover:text-white"
            >
              <RotateCcw size={12} />
              Back to the clock ({shiftLabel(auto).toLowerCase()})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
