// A drop-down list of tick-boxes.
//
// The first version of "who's on the schedule" was a wall of pill toggles that
// pushed the week down the page, and once it was open there was nothing that
// said how to put it away. A menu is the ordinary control for this: it opens
// under its button, it closes when you tap Done, press Escape, or tap
// anywhere else, and it doesn't move the page while it's open.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, X } from 'lucide-react'

export interface PickOption {
  id: string
  label: string
  hint?: string
}

export function PickList({
  label,
  icon,
  options,
  selected,
  onChange,
  onReset,
  resetLabel,
  empty = 'Nothing to choose from',
}: {
  label: string
  icon?: React.ReactNode
  options: PickOption[]
  /** The ids that are ticked. */
  selected: string[]
  onChange: (ids: string[]) => void
  /** Offered at the foot of the menu when the list has been narrowed. */
  onReset?: () => void
  resetLabel?: string
  empty?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ top: 0, left: 0, width: 260 })

  // Pinned to the button, in a portal — a menu inside a header gets clipped by
  // the first ancestor with overflow, and this page has several.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = btn.current?.getBoundingClientRect()
      if (!r) return
      const width = Math.max(260, Math.min(320, window.innerWidth - 24))
      setAt({
        top: Math.min(r.bottom + 6, window.innerHeight - 80),
        left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
        width,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Escape, and a tap anywhere outside. Both are how a menu is expected to
  // close; the old panel had neither.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <>
      <button
        ref={btn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
          open ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
        }`}
      >
        {icon}
        {label}
        <span className={open ? 'text-white/70' : 'text-muted'}>{selected.length}</span>
        <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="listbox"
            style={{ top: at.top, left: at.left, width: at.width }}
            className="fixed z-[120] max-h-[60vh] overflow-y-auto overscroll-contain rounded-2xl border border-black/10 bg-white p-1.5 shadow-2xl"
          >
            {options.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted">{empty}</p>
            ) : (
              options.map((o) => {
                const on = selected.includes(o.id)
                return (
                  <button
                    key={o.id}
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(o.id)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-black/[0.04]"
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${
                        on ? 'border-brand bg-brand text-white' : 'border-black/20'
                      }`}
                    >
                      {on && <Check size={12} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-[11px] text-muted">{o.hint}</span>}
                  </button>
                )
              })
            )}
            <div className="mt-1 flex items-center gap-2 border-t border-black/5 px-1 pt-1.5">
              {onReset && (
                <button onClick={onReset} className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-brand">
                  {resetLabel ?? 'Select all'}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-navy px-3 py-1.5 text-[11px] font-bold text-white"
              >
                <X size={11} /> Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
