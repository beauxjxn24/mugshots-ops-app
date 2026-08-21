// Putting a name on something — a cut, a closer — by typing it.
//
// This replaces a native <select>. Two things were wrong with that: an empty
// one was styled dashed-and-grey to read as "nothing here yet" and instead read
// as DISABLED, and picking anyone meant opening a list and scrolling it, which
// is the slowest thing you can do on a tablet with fifteen servers on the
// roster.
//
// So: type two letters, take the match. The full list is there on focus too,
// because a control that shows nothing until you type isn't a picker, it's a
// search box — the same note the Food Focus box got.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'

export function NamePicker({
  value,
  options,
  onChange,
  placeholder = 'Add a name…',
  taken = [],
}: {
  value: string
  options: string[]
  onChange: (name: string) => void
  placeholder?: string
  /** Already on another cut — still offered, but marked, so nobody is put on two. */
  taken?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  /**
   * The list is drawn in a PORTAL, pinned to the box's position on screen.
   *
   * Rendered inline it was clipped away: the cut card sets overflow-hidden and
   * so does the card around the whole planner. An expanded cut is tall enough
   * to hide that, so the list only vanished on a COLLAPSED row -- which reads
   * as the control being broken rather than as a layout bug.
   *
   * A portal escapes every overflow ancestor there is, present and future, so
   * this holds wherever the picker gets used next.
   */
  const list = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{
    top: number
    left: number
    width: number
    up: boolean
    max: number
  } | null>(null)
  const place = useCallback(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    // Flip above when there isn't room below -- the last cut in a long list is
    // exactly where a downward list would go off the bottom of the screen.
    const up = below < 240 && r.top > below
    const room = (up ? r.top : below) - 12
    setAt({
      top: up ? r.top : r.bottom,
      left: r.left,
      width: r.width,
      up,
      // Never taller than the room it has, never so short it shows one name.
      max: Math.max(140, Math.min(224, room)),
    })
  }, [])

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    // Starts-with first: typing "ma" should reach Marcus before Tamara.
    return options
      .filter((n) => n.toLowerCase().includes(needle))
      .sort((a, b) => {
        const A = a.toLowerCase().startsWith(needle) ? 0 : 1
        const B = b.toLowerCase().startsWith(needle) ? 0 : 1
        return A - B || a.localeCompare(b)
      })
  }, [q, options])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, q, place])

  // Anything that moves the box moves the list with it.
  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  // Clicking anywhere else puts it away without choosing. The list has to be
  // checked separately now that it's a portal: it is no longer INSIDE the box,
  // so "not in the box" would close it on mousedown and the name you were
  // reaching for would be gone before the click landed.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || list.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const pick = (name: string) => {
    onChange(name)
    setQ('')
    setSel(0)
    setOpen(false)
  }

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      {value && !open ? (
        <button
          onClick={() => {
            setOpen(true)
            setQ('')
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-2 text-left text-sm font-semibold text-ink"
        >
          <span className="min-w-0 flex-1 truncate">{value}</span>
          <span
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            aria-label={`Take ${value} off`}
            className="shrink-0 text-muted hover:text-down"
          >
            <X size={14} />
          </span>
        </button>
      ) : (
        <input
          autoFocus={open}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setSel(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((i) => Math.min(i + 1, hits.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && hits[sel]) {
              e.preventDefault()
              pick(hits[sel])
            } else if (e.key === 'Escape') {
              setOpen(false)
              setQ('')
            }
          }}
          placeholder={value || placeholder}
          // Never styled as disabled. An empty one is an invitation, not a
          // dead control.
          className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-brand"
        />
      )}

      {open &&
        at &&
        createPortal(
          <div
            ref={list}
            style={{
              position: 'fixed',
              top: at.up ? at.top - 4 : at.top + 4,
              left: at.left,
              width: at.width,
              maxHeight: at.max,
              transform: at.up ? 'translateY(-100%)' : undefined,
            }}
            className="z-50 overflow-y-auto overscroll-contain rounded-xl border border-black/10 bg-white shadow-lg"
          >
            {hits.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-muted">
                {options.length === 0
                  ? // An empty roster is a different problem from a bad search,
                    // and saying nothing matches “” is how you send someone
                    // hunting for a typo they didn't make.
                    'Nobody on the roster for this job yet — a manager can add them on the Staff screen.'
                  : `Nobody on the roster matches “${q.trim()}”.`}
              </p>
            ) : (
              hits.map((n, i) => {
                const already = taken.includes(n) && n !== value
                return (
                  <button
                    key={n}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => pick(n)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      i === sel ? 'bg-brand/10' : ''
                    } ${already ? 'text-muted' : 'text-ink'}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{n}</span>
                    {already && (
                      <span className="shrink-0 text-[10px] font-bold uppercase">on another cut</span>
                    )}
                    {n === value && <Check size={14} className="shrink-0 text-brand" />}
                  </button>
                )
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
