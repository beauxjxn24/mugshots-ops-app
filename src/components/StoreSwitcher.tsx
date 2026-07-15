import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScope, useCurrentNames, ALL } from '../lib/scope'

/** Concept + location switcher. Lives in the nav so it's available everywhere.
 *  Includes read-only roll-up scopes: a whole concept (all its locations) and
 *  the whole company (every store), which open the combined reporting view. */
export function StoreSwitcher({ dark = true }: { dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const concepts = useScope((s) => s.concepts)
  const currentConcept = useScope((s) => s.currentConcept)
  const currentLocation = useScope((s) => s.currentLocation)
  const setCurrent = useScope((s) => s.setCurrent)
  const { concept, location } = useCurrentNames()
  const navigate = useNavigate()

  const totalStores = concepts.reduce((n, c) => n + c.locations.length, 0)
  const pick = (conceptId: string, locationId: string, rollup: boolean) => {
    setCurrent(conceptId, locationId)
    setOpen(false)
    if (rollup) navigate('/') // roll-up scopes land on the combined reporting view
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${
          dark ? 'bg-white/10 text-white hover:bg-white/15' : 'border border-black/10 bg-white text-ink'
        }`}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
          {concept.slice(0, 1) || 'M'}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-semibold">{location || 'Pick a store'}</span>
          <span className={`block truncate text-[10px] ${dark ? 'text-white/50' : 'text-muted'}`}>
            {concept}
          </span>
        </span>
        <span className={`text-xs ${dark ? 'text-white/60' : 'text-muted'}`}>▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-black/10 bg-white p-1.5 shadow-xl">
            {/* Company-wide roll-up — only when there's more than one store. */}
            {totalStores > 1 && (
              <button
                onClick={() => pick(ALL, ALL, true)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                  currentConcept === ALL ? 'bg-brand/10 font-semibold text-brand' : 'text-ink hover:bg-black/5'
                }`}
              >
                <span className={`grid size-4 place-items-center text-[11px] ${currentConcept === ALL ? 'text-brand' : 'text-muted'}`}>🏢</span>
                All stores · company roll-up
              </button>
            )}
            {concepts.map((c) => (
              <div key={c.id} className="mb-1">
                <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">
                  {c.name}
                </div>
                {/* Whole-concept roll-up — only when the concept has 2+ locations. */}
                {c.locations.length > 1 && (
                  <button
                    onClick={() => pick(c.id, ALL, true)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                      c.id === currentConcept && currentLocation === ALL
                        ? 'bg-brand/10 font-semibold text-brand'
                        : 'text-ink hover:bg-black/5'
                    }`}
                  >
                    <span className="grid size-2 place-items-center text-[9px] text-muted">◇</span>
                    All locations combined
                  </button>
                )}
                {c.locations.map((l) => {
                  const active = c.id === currentConcept && l.id === currentLocation
                  return (
                    <button
                      key={l.id}
                      onClick={() => pick(c.id, l.id, false)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                        active ? 'bg-brand/10 font-semibold text-brand' : 'text-ink hover:bg-black/5'
                      }`}
                    >
                      <span
                        className={`size-2 rounded-full ${active ? 'bg-brand' : 'bg-black/15'}`}
                      />
                      {l.name}
                    </button>
                  )
                })}
                {c.locations.length === 0 && (
                  <div className="px-2 py-1 text-xs text-muted">No locations yet</div>
                )}
              </div>
            ))}
            <button
              onClick={() => {
                setOpen(false)
                navigate('/stores')
              }}
              className="mt-1 w-full rounded-lg border-t border-black/5 px-2 py-2 text-left text-xs font-semibold text-muted hover:text-brand"
            >
              ⚙ Manage stores & concepts
            </button>
          </div>
        </>
      )}
    </div>
  )
}
