import { useMemo, useState } from 'react'
import { GitMerge, Check, FilePlus2 } from 'lucide-react'
import { Card } from './ui'
import { LineBuildCard } from './LineBuildCard'
import { pendingMatches, decide } from '../lib/buildmatch'
import { buildFor } from '../lib/linebuilds'
import { currentEditor } from '../lib/settings'
import { requirePin } from '../lib/pin'
import { toast } from '../lib/toast'

/**
 * "Update this one, or make a new card?"
 *
 * A sheet arrives naming a dish the way the kitchen writes it. When that name
 * is close to a menu item already in the app but not certainly the same one,
 * guessing is the worst option — it either hides a new dish or puts the wrong
 * build on an existing card. So it asks, once, showing the sheet's own build
 * next to the item it might belong to.
 *
 * Nothing is pending in the normal case: an exact name, or one differing only
 * by a category word, is resolved without a question.
 */
export function BuildReconcile() {
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pending = useMemo(() => pendingMatches(), [tick])
  const [open, setOpen] = useState(false)
  if (pending.length === 0) return null

  const answer = async (sheetName: string, spec: string) => {
    if (!(await requirePin('Match a line build', 'catalog'))) return
    decide(sheetName, spec, currentEditor())
    toast(spec ? `✓ ${sheetName} → ${spec}` : `✓ ${sheetName} kept as its own card`, 'success')
    setTick((t) => t + 1)
  }

  return (
    // Loud on purpose. At warn/5% with a text-link "Review" this read as a
    // status banner rather than a job, and got scrolled past for weeks --
    // "i dont see where the 7 items that need to be adressed are". Solid tint,
    // a counted badge, and a real button, because it IS a job: until it's
    // answered these sheets aren't attached to any card.
    <Card className="border-warn/40 bg-warn/[0.12] p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warn/20 text-warn">
          <GitMerge size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold text-ink">
            {pending.length} new build{pending.length === 1 ? '' : 's'} need{pending.length === 1 ? 's' : ''} a home
          </span>
          <span className="block text-xs text-muted">
            Each reads like a dish you already have. Until you answer, its sheet isn’t on any card.
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
            open ? 'bg-white/10 text-ink' : 'bg-warn text-navy'
          }`}
        >
          {open ? 'Hide' : `Review ${pending.length}`}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {pending.map(({ build, candidates }) => (
            <div key={build.sheetName} className="rounded-xl border border-white/10 bg-black/[0.15] p-3">
              <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                From {build.sheet}
              </div>
              <LineBuildCard build={build} />

              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="mb-2 text-xs text-muted">
                  Is <b className="text-ink">{build.sheetName}</b> the same dish as…
                </div>
                <div className="flex flex-wrap gap-2">
                  {candidates.map((c) => {
                    // Say plainly when the menu item already has a build, since
                    // answering "same" replaces what a cook reads today.
                    const has = !!buildFor(c.name)
                    return (
                      <button
                        key={c.name}
                        onClick={() => answer(build.sheetName, c.name)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-bold text-signal hover:bg-signal/20"
                      >
                        <Check size={12} /> {c.name}
                        {has && <span className="font-normal opacity-70">· replaces its build</span>}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => answer(build.sheetName, '')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-muted hover:border-brand/50 hover:text-brand"
                  >
                    <FilePlus2 size={12} /> No — it's its own dish
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
