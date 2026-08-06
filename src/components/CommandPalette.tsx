import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { NAV, NAV_FLAT, SHIFT_ITEM, type NavItem } from '../lib/nav'

/**
 * Jump-to — ⌘K (Ctrl+K) opens a search over every screen in the app.
 *
 * The command rail deliberately shows one area at a time, which keeps the menu
 * short but puts a second click between you and a screen in another area. This
 * is the escape hatch: three letters and Enter beats any amount of clicking,
 * and it's how anyone who knows where they're going will actually navigate.
 */
/** Open the palette from anywhere (the rail's visible button uses this). */
export const openCommandPalette = (): void => {
  window.dispatchEvent(new CustomEvent('mugops:palette'))
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  // Which area each screen lives in, so a result says where it's taking you.
  const areaOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const sec of NAV) for (const it of sec.items) m.set(it.to, sec.title || 'Dashboard')
    return m
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onAsk = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mugops:palette', onAsk)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mugops:palette', onAsk)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const hits = useMemo(() => {
    const all: NavItem[] = [...NAV_FLAT, SHIFT_ITEM]
    const s = q.trim().toLowerCase()
    if (!s) return all.slice(0, 8)
    // Anything starting with what you typed comes first — "pre" should offer
    // Prep before Period Review.
    const starts = all.filter((i) => i.label.toLowerCase().startsWith(s))
    const rest = all.filter((i) => !i.label.toLowerCase().startsWith(s) && i.label.toLowerCase().includes(s))
    return [...starts, ...rest].slice(0, 8)
  }, [q])

  if (!open) return null
  const go = (to: string) => {
    setOpen(false)
    nav(to)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((i) => Math.min(i + 1, hits.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((i) => Math.max(i - 1, 0))
              }
              if (e.key === 'Enter' && hits[sel]) go(hits[sel].to)
            }}
            placeholder="Jump to a screen…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-muted">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nothing matches “{q}”.</p>}
          {hits.map((it, i) => (
            <button
              key={it.to}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(it.to)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${
                i === sel ? 'bg-signal/12 text-ink' : 'text-ink/80'
              }`}
            >
              <it.icon size={15} className="shrink-0 text-muted" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
              <span className="shrink-0 text-[11px] text-muted">{areaOf.get(it.to) ?? ''}</span>
              {i === sel && <CornerDownLeft size={13} className="shrink-0 text-signal" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
