import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV, NAV_FLAT, STAFF_SECTIONS, SHIFT_ITEM, ROLLUP_SECTIONS, bottomItems, type NavSection } from '../lib/nav'
import { StoreSwitcher } from './StoreSwitcher'
import { RoleToggle } from './RoleToggle'
import { useRole } from '../lib/role'
import { useRollupLevel, useScope, useCurrentNames } from '../lib/scope'

/**
 * Responsive app shell — one layout, three form factors:
 *  - desktop (lg+): persistent left rail
 *  - tablet/phone: top bar + slide-in drawer, plus a bottom quick-nav
 * No fixed pixel canvas: everything is fluid + container-friendly.
 */
export function AppShell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const role = useRole((s) => s.role)
  const level = useRollupLevel()
  const isAdmin = role === 'admin'
  // Only the admin sees roll-ups (whole concept / company). A manager or staff
  // account is always pinned to a single store.
  const rollup = isAdmin && level !== 'single'
  // Managers run one store: full ops, but Stores & Concepts is admin-only.
  const managerSections = useMemo(
    () => NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.to !== '/stores') })),
    [],
  )
  const sections = role === 'staff' ? STAFF_SECTIONS : rollup ? ROLLUP_SECTIONS : isAdmin ? NAV : managerSections
  const current = [...NAV_FLAT, SHIFT_ITEM].find((i) => i.to === loc.pathname)
  const bottom = rollup ? ROLLUP_SECTIONS.flatMap((s) => s.items) : bottomItems(role)

  // A non-admin must never sit on a roll-up scope (e.g. left over from an admin
  // session). Snap them back to a concrete store so their data stays real.
  const concepts = useScope((s) => s.concepts)
  const setCurrent = useScope((s) => s.setCurrent)
  useEffect(() => {
    if (!isAdmin && level !== 'single') {
      const c = concepts.find((x) => x.locations.length > 0) ?? concepts[0]
      if (c && c.locations[0]) setCurrent(c.id, c.locations[0].id)
    }
  }, [isAdmin, level, concepts, setCurrent])

  // Prevent the browser from navigating away to open a file when one is dropped
  // outside a drop zone (that "print preview" behavior). The Imports screen adds
  // its own handler to actually read files dropped anywhere on that page.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_1fr]">
      {/* ---- Desktop rail ---- */}
      <aside className="hidden lg:flex sticky top-0 h-[100dvh] flex-col overflow-y-auto bg-navy px-3 py-5 text-white/70">
        <Brand />
        <RoleToggle />
        {isAdmin ? (
          <div className="mb-3">
            <StoreSwitcher />
          </div>
        ) : role === 'manager' ? (
          <div className="mb-3">
            <StoreLabel />
          </div>
        ) : null}
        <Rail sections={sections} onNavigate={() => setOpen(false)} />
        <BuildStamp />
      </aside>

      {/* ---- Mobile top bar ---- */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-navy/95 backdrop-blur-md px-3 text-white [padding-top:env(safe-area-inset-top)] h-[calc(52px+env(safe-area-inset-top))]">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="grid size-9 place-items-center rounded-lg bg-brand text-white text-lg"
        >
          ☰
        </button>
        <span className="font-display font-semibold">Mugshots Ops</span>
        <span className="ml-auto text-xs text-white/50">{current?.label}</span>
      </header>

      {/* ---- Mobile drawer ---- */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[82%] max-w-[300px] overflow-y-auto overscroll-contain bg-navy px-3 py-4 text-white/70 shadow-2xl [padding-top:env(safe-area-inset-top)] animate-[slidein_.25s_ease]">
            <Brand />
            <RoleToggle />
            {isAdmin ? (
              <div className="mb-3">
                <StoreSwitcher />
              </div>
            ) : role === 'manager' ? (
              <div className="mb-3">
                <StoreLabel />
              </div>
            ) : null}
            <Rail sections={sections} onNavigate={() => setOpen(false)} />
            <BuildStamp />
          </div>
          <style>{`@keyframes slidein{from{transform:translateX(-105%)}to{transform:translateX(0)}}`}</style>
        </div>
      )}

      {/* ---- Main ---- */}
      <main className="min-w-0 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
        <Outlet />
      </main>

      {/* ---- Mobile bottom quick-nav ---- */}
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-black/10 bg-white/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)]">
        {bottom.map(
          (i, idx) =>
            i && (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${
                    isActive ? 'text-brand' : 'text-muted'
                  }`
                }
              >
                {i.anim ? (
                  <i.anim size={20} className="shrink-0" />
                ) : (
                  <i.icon
                    size={18}
                    strokeWidth={2.2}
                    className={`nav-ico ${i.idle ?? 'idle-pulse'}`}
                    style={{ animationDelay: `${(idx * 0.1).toFixed(2)}s`, color: i.color }}
                  />
                )}
                {i.label.split(' ')[0]}
              </NavLink>
            ),
        )}
      </nav>
    </div>
  )
}

/** Locked store display for managers — shows their store, no switching. */
function StoreLabel() {
  const { concept, location } = useCurrentNames()
  return (
    <div className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-left">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
        {concept.slice(0, 1) || 'M'}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold text-white">{location || 'Your store'}</span>
        <span className="block truncate text-[10px] text-white/50">{concept}</span>
      </span>
      <span className="shrink-0 text-white/40" title="Only an admin can switch stores">🔒</span>
    </div>
  )
}

function BuildStamp() {
  return (
    <div className="mt-auto px-3 pt-6 text-[9.5px] tracking-wide text-white/30">
      Updated {__BUILD_DATE__}
    </div>
  )
}

function Brand() {
  return (
    <div className="mb-4 flex items-center gap-2.5 px-2">
      <div className="grid size-9 place-items-center rounded-lg bg-brand font-display text-lg font-semibold text-white">
        M
      </div>
      <div className="leading-tight">
        <div className="font-display text-[13px] font-semibold tracking-wide text-white">
          MUGSHOTS GRILL &amp; BAR
        </div>
        <div className="text-[9.5px] uppercase tracking-wider text-white/45">Flowood, MS</div>
      </div>
    </div>
  )
}

function Rail({ sections, onNavigate }: { sections: NavSection[]; onNavigate: () => void }) {
  let n = 0
  return (
    <div className="flex flex-col gap-0.5">
      {sections.map((sec, i) => (
        <div key={i}>
          {sec.title && (
            <div className="px-3 pb-1 pt-4 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-white/35">
              {sec.title}
            </div>
          )}
          {sec.items.map((it) => {
            const idle = it.idle ?? 'idle-pulse'
            const delay = `${(n * 0.13).toFixed(2)}s`
            n++
            return (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-brand text-white shadow-[0_6px_16px_-8px_rgba(184,134,11,0.9)]'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {({ isActive }) =>
                  it.anim ? (
                    <>
                      <it.anim size={18} className="shrink-0" />
                      {it.label}
                    </>
                  ) : (
                    <>
                      <it.icon
                        size={17}
                        strokeWidth={2.2}
                        className={`nav-ico shrink-0 ${idle}`}
                        style={{ animationDelay: delay, color: isActive ? '#fff' : it.color }}
                      />
                      {it.label}
                    </>
                  )
                }
              </NavLink>
            )
          })}
        </div>
      ))}
    </div>
  )
}
