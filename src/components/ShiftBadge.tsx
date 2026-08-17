import { Sun, Moon } from 'lucide-react'
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

  return (
    <div className="mb-3 rounded-xl bg-white/[0.07] p-1">
      <div className="grid grid-cols-2 gap-1">
        {(['AM', 'PM'] as Shift[]).map((s) => {
          const on = s === shift
          const SIcon = s === 'AM' ? Sun : Moon
          return (
            <button
              key={s}
              // Choosing the shift the clock already wants clears the pin rather
              // than setting a redundant one, so the badge goes back to keeping
              // itself right at the next changeover.
              onClick={() => setShift(s === auto ? null : s)}
              aria-pressed={on}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                on ? 'bg-brand text-white' : 'text-white/55 hover:text-white'
              }`}
            >
              <SIcon size={13} />
              {shiftLabel(s)}
            </button>
          )
        })}
      </div>
      <div className="px-1.5 pb-0.5 pt-1 text-center text-[10px] text-white/40">
        {overridden ? 'Set by hand · clears overnight' : 'On the clock'}
      </div>
    </div>
  )
}
