import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV, NAV_FLAT, STAFF_SECTIONS, SHIFT_ITEM, ROLLUP_SECTIONS, bottomItems, type NavSection } from '../lib/nav'
import { StoreSwitcher } from './StoreSwitcher'
import { RoleToggle } from './RoleToggle'
import { useRole } from '../lib/role'
import { useRollupLevel, useScope, useCurrentNames } from '../lib/scope'
import { ConciergeBell, UtensilsCrossed, Search, ChevronDown } from 'lucide-react'
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

  // The Mugsy launcher floats above everything so it can be dragged anywhere,
  // which means it also floats above the drawer's scrim. Tell it to stand down
  // while the menu is open rather than glowing through the blur.
  useEffect(() => {
    if (open) document.body.dataset.navOpen = '1'
    else delete document.body.dataset.navOpen
  }, [open])

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
            <DrawerNav sections={sections} onNavigate={() => setOpen(false)} />
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
 * Phone drawer — every screen, labelled, in one scroll.
 *
 * The desktop rail collapses to one area at a time because a sidebar is always
 * on screen and space is the scarce thing. A drawer is the opposite: it is
 * summoned, used once and dismissed, and it scrolls. Showing one area there
 * costs a tap to reach an unlabelled glyph and hides the other four behind it —
 * which is exactly why the app read as "limited" on a phone when it isn't.
 *
 * So: no icon column, no collapsing. Areas as headings, screens as rows, the
 * whole menu under your thumb.
 */
function DrawerNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate: () => void }) {
  const row = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition-colors ${
      isActive
        ? 'bg-signal/12 font-semibold text-signal shadow-[inset_2px_0_0_var(--color-signal)]'
        : 'font-medium text-white/70 active:bg-white/10'
    }`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No ⌘K on a phone — there is no keyboard to press it on. */}
      <button
        onClick={() => {
          onNavigate()
          openCommandPalette()
        }}
        className="mb-3 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/45"
      >
        <Search size={14} className="shrink-0" />
        Search screens
      </button>

      {sections.map((sec, i) => (
        <div key={sec.title || `solo-${i}`} className="mb-2">
          {sec.title && (
            <div className="px-3 pb-1 pt-2 text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-white/35">
              {sec.title}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {sec.items.map((it) => (
              <NavLink key={it.to} to={it.to} onClick={onNavigate} className={row}>
                <it.icon size={16} strokeWidth={2} className="shrink-0 opacity-70" />
                {it.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Command rail — the areas listed by name, each opening to its own screens.
 *
 * The menu carries 27 destinations, which no icon set can make short, and an
 * icon strip made you read a picture to guess the area. So the rail names the
 * areas outright and only ever opens one: hovering an area shows what is inside
 * it, and moving away falls back to the area you are actually in. Never more
 * than a dozen items on screen, however far the app grows.
 *
 * The open area follows the route, so arriving from a link or a deep link shows
 * that screen's area instead of leaving the rail pointing somewhere else.
 */
function Rail({ sections, onNavigate }: { sections: NavSection[]; onNavigate: () => void }) {
  const loc = useLocation()
  // A section with no title holds a single destination (Dashboard, My Shift) —
  // it IS its own rail row and never expands.
  const areas = useMemo(() => sections.filter((s) => s.title), [sections])
  const solo = useMemo(() => sections.filter((s) => !s.title).flatMap((s) => s.items), [sections])

  // The area holding the current route — the resting state the rail returns to.
  const routeArea = useMemo(
    () => areas.findIndex((a) => a.items.some((x) => x.to === loc.pathname)),
    [areas, loc.pathname],
  )
  // Which area is open, as one value rather than a hover state layered over a
  // click state: layering them meant a click could not close what the pointer
  // was still hovering, so the header appeared dead. -1 is "all closed".
  const [open, setOpen] = useState(routeArea)
  // Follow the route, including on first paint and after navigating.
  useEffect(() => setOpen(routeArea), [routeArea])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      // Leaving the rail drops any hover-opened area and goes back to showing
      // wherever you actually are.
      onMouseLeave={() => setOpen(routeArea)}
    >
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

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {solo.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            onMouseEnter={() => setOpen(-1)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                isActive
                  ? 'bg-signal/12 text-signal shadow-[inset_2px_0_0_var(--color-signal)]'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <it.icon size={15} strokeWidth={2} className="shrink-0 opacity-70" />
            {it.label}
          </NavLink>
        ))}

        {areas.map((sec, i) => {
          const Icon = sec.areaIcon
          const isOpen = i === open
          // An area wrapping a single screen is that screen — expanding to one
          // row would just be a second click to reach it.
          const only = sec.items.length === 1 ? sec.items[0] : null
          const here = sec.items.some((x) => x.to === loc.pathname)

          if (only) {
            return (
              <NavLink
                key={sec.title}
                to={only.to}
                onClick={onNavigate}
                onMouseEnter={() => setOpen(-1)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-signal/12 text-signal shadow-[inset_2px_0_0_var(--color-signal)]'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {Icon && <Icon size={15} strokeWidth={2} className="shrink-0 opacity-70" />}
                {sec.title}
              </NavLink>
            )
          }

          return (
            <div key={sec.title} onMouseEnter={() => setOpen(i)}>
              <button
                // Toggle, so the same header that opens an area also closes it.
                // mouseEnter does not re-fire while the pointer sits still, so
                // closing sticks until you leave the area and come back.
                onClick={() => setOpen((o) => (o === i ? -1 : i))}
                aria-expanded={isOpen}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors ${
                  isOpen || here ? 'text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {Icon && <Icon size={15} strokeWidth={2} className="shrink-0 opacity-70" />}
                <span className="truncate">{sec.title}</span>
                <ChevronDown
                  size={13}
                  className={`ml-auto shrink-0 opacity-45 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="mb-1 ml-[7px] flex flex-col gap-0.5 border-l border-white/10 pl-2">
                  {sec.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors ${
                          isActive
                            ? 'bg-signal/12 font-semibold text-signal shadow-[inset_2px_0_0_var(--color-signal)]'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      {it.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
