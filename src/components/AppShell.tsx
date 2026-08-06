import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV, NAV_FLAT, STAFF_SECTIONS, SHIFT_ITEM, ROLLUP_SECTIONS, bottomItems, type NavSection } from '../lib/nav'
import { StoreSwitcher } from './StoreSwitcher'
import { RoleToggle } from './RoleToggle'
import { useRole } from '../lib/role'
import { useRollupLevel, useScope, useCurrentNames } from '../lib/scope'
import { ConciergeBell, UtensilsCrossed, Search } from 'lucide-react'
import { Aurora } from './Aurora'
import { Toaster } from './Toaster'
import { CommandPalette, openCommandPalette } from './CommandPalette'

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
      <Aurora />
      <Toaster />
      <CommandPalette />
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
        <span className="font-display font-semibold">The Pass</span>
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
                    isActive ? 'text-signal' : 'text-muted'
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
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white">
        <UtensilsCrossed size={16} />
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
    <div className="mt-auto px-3 pt-6">
      <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold tracking-wide text-white/70">
        Build {__BUILD_DATE__}
      </span>
    </div>
  )
}

/** Product brand — the store itself shows in the switcher right below. */
function Brand() {
  return (
    <div className="mb-4 flex items-center gap-2.5 px-2">
      {/* Free-floating bell — no box; a cyan glow keeps it feeling digital. */}
      <ConciergeBell
        size={26}
        aria-hidden
        className="shrink-0 text-signal drop-shadow-[0_0_10px_rgba(79,227,193,0.65)]"
        strokeWidth={2}
      />
      <div className="leading-tight">
        <div className="font-display text-[15px] font-bold tracking-wide text-white">THE PASS</div>
        <div className="text-[9.5px] uppercase tracking-wider text-white/45">Daily Ops</div>
      </div>
    </div>
  )
}

/**
 * Command rail — the areas down the left, that area's screens beside them.
 *
 * The menu carries 27 destinations, which no icon set can make short. So the
 * rail shows the five AREAS and the panel shows only the screens inside the one
 * you are in: never more than a dozen items on screen, however far the app
 * grows. The cost is a second click to cross areas, which is what the Cmd-K
 * jump-to is for.
 *
 * The area follows the route, so arriving from a link or a deep link opens that
 * screen's area instead of leaving the rail pointing somewhere else.
 */
function Rail({ sections, onNavigate }: { sections: NavSection[]; onNavigate: () => void }) {
  const loc = useLocation()
  // A section with no title holds a single destination (Dashboard, My Shift) —
  // it IS its own rail button and has no panel.
  const areas = useMemo(() => sections.filter((s) => s.title), [sections])
  const solo = useMemo(() => sections.filter((s) => !s.title).flatMap((s) => s.items), [sections])

  const [picked, setPicked] = useState(0)
  useEffect(() => {
    const i = areas.findIndex((a) => a.items.some((x) => x.to === loc.pathname))
    if (i >= 0) setPicked(i)
  }, [loc.pathname, areas])

  const onSolo = solo.some((i) => i.to === loc.pathname)
  const area = areas[Math.min(picked, Math.max(0, areas.length - 1))]
  const btn = (active: boolean) =>
    `grid size-10 place-items-center rounded-xl transition-colors ${
      active
        ? 'bg-signal/15 text-signal ring-1 ring-inset ring-signal/35'
        : 'text-white/55 hover:bg-white/5 hover:text-white'
    }`

  return (
    <div className="flex min-h-0 flex-1 gap-1.5">
      <div className="flex shrink-0 flex-col gap-1.5 border-r border-white/10 pr-1.5">
        {solo.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            title={it.label}
            aria-label={it.label}
            className={btn(onSolo && loc.pathname === it.to)}
          >
            <it.icon size={18} strokeWidth={2} />
          </NavLink>
        ))}
        {areas.map((sec, i) => {
          const Icon = sec.areaIcon
          return (
            <button
              key={sec.title}
              onClick={() => setPicked(i)}
              title={sec.title}
              aria-label={sec.title}
              aria-current={!onSolo && i === picked ? 'true' : undefined}
              className={btn(!onSolo && i === picked)}
            >
              {Icon ? <Icon size={18} strokeWidth={2} /> : <span className="text-xs font-bold">{sec.title[0]}</span>}
            </button>
          )
        })}
      </div>

      <div className="min-w-0 flex-1">
        {/* The shortcut has to be visible to be discovered — a rail that hides
            its escape hatch just costs you the extra click. */}
        <button
          onClick={openCommandPalette}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[12px] text-white/45 hover:border-signal/40 hover:text-white/70"
        >
          <Search size={13} className="shrink-0" />
          Jump to…
          <kbd className="ml-auto rounded border border-white/15 px-1 py-px font-mono text-[9px]">⌘K</kbd>
        </button>
        {area && (
          <>
            <div className="px-3 pb-1.5 pt-1 text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-white/35">
              {area.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {area.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-signal/12 font-semibold text-signal shadow-[inset_2px_0_0_var(--color-signal)]'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {it.label}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
