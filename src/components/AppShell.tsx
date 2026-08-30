import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV, NAV_FLAT, STAFF_SECTIONS, SHIFT_ITEM, ROLLUP_SECTIONS, bottomItems, type NavSection } from '../lib/nav'
import { StoreSwitcher } from './StoreSwitcher'
import { RoleToggle } from './RoleToggle'
import { ShiftBadge } from './ShiftBadge'
import { SyncBadge } from './SyncBadge'
import { useRole } from '../lib/role'
import { useRollupLevel, useScope, useCurrentNames } from '../lib/scope'
import { ConciergeBell, UtensilsCrossed, Search, ChevronDown } from 'lucide-react'
import { Toaster } from './Toaster'
import { CommandPalette, openCommandPalette } from './CommandPalette'
import { DropCatcher, DropBoxPill } from './DropBox'

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

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_1fr]">
      <Toaster />
      <CommandPalette />
      {/* Catches a file dropped anywhere in the app and lands it on Imports —
          and, on every screen, stops the browser navigating away to open a
          stray drop, which looks exactly like the app falling over. */}
      <DropCatcher />
      {/* ---- Desktop rail ---- */}
      <aside className="hidden lg:flex sticky top-0 h-[100dvh] flex-col overflow-y-auto bg-navy px-3 py-5 text-white/70">
        <Brand />
        {/* What's left in the rail: who you are, and where to drop things.
            The shift and the store moved to the top right — both are facts you
            glance at rather than controls you reach for, and as full-width
            blocks they were spending ~100px of menu height to say two words.
            The Drop Box stays because it's a target: it has to be big, and it
            has to be somewhere your eye already is. */}
        <div className="mb-4 space-y-2">
          <RoleToggle />
          {role !== 'staff' && <DropBoxPill />}
        </div>
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
        <span className="ml-auto flex items-center gap-2">
          <SyncBadge compact />
          <ShiftBadge compact />
          <span className="text-xs text-white/50">{current?.label}</span>
        </span>
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
            {/* Same order as the rail — Drop Box directly under the role
                switch. The phone keeps the full-size shift and store below it
                rather than in a corner: there is no top-right here, and its
                top bar has room for the shift but not the store's name. */}
            <div className="mb-4 space-y-2">
              <RoleToggle />
              {role !== 'staff' && <DropBoxPill onNavigate={() => setOpen(false)} />}
              <ShiftBadge />
              <SyncBadge />
              {isAdmin ? <StoreSwitcher /> : role === 'manager' ? <StoreLabel /> : null}
            </div>
            <DrawerNav sections={sections} onNavigate={() => setOpen(false)} />
            <BuildStamp />
          </div>
          <style>{`@keyframes slidein{from{transform:translateX(-105%)}to{transform:translateX(0)}}`}</style>
        </div>
      )}

      {/* ---- Main ---- */}
      <main className="min-w-0 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
        {/* Which shift, which store, and whether anything is still going up.
            Desktop only — the phone already carries all three in its top bar.

            Sticky, because "which store am I looking at" is the question you
            ask halfway down a page of numbers, not at the top of it. It sits
            above the page's own header rather than adding a band of its own:
            a second full-width strip on every screen would cost more room
            than the rail just gave back. */}
        <div className="sticky top-0 z-20 hidden items-center justify-end gap-2 bg-navy/70 px-6 py-1.5 backdrop-blur-md lg:flex">
          <SyncBadge compact />
          <ShiftBadge compact />
          {isAdmin ? <StoreSwitcher compact /> : role === 'manager' ? <StoreLabel compact /> : null}
        </div>
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
                {/* One icon set, one stroke weight, no colour and no motion.
                    Twenty-nine of these destinations used to render a bespoke
                    two-tone SVG with an idle pulse on it, and the rest a plain
                    Lucide glyph — so the bar was two icon sets at once, each
                    in its own hue, several of them twitching. An icon in a nav
                    is there to be recognised, not looked at. It inherits the
                    link's colour: muted at rest, accent when active. */}
                <i.icon size={18} strokeWidth={2} className="shrink-0" />
                {i.label.split(' ')[0]}
              </NavLink>
            ),
        )}
      </nav>
    </div>
  )
}

/** Locked store display for managers — shows their store, no switching. */
function StoreLabel({ compact = false }: { compact?: boolean }) {
  const { concept, location } = useCurrentNames()
  if (compact) {
    // Matches the shift pill beside it. Still padlocked, because a manager who
    // taps it should learn why nothing happens rather than tap it again.
    return (
      <span
        title={`${location} · ${concept} — only an admin can switch stores`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/85"
      >
        <UtensilsCrossed size={12} className="shrink-0 text-brand" />
        <span className="max-w-[9rem] truncate">{location || 'Your store'}</span>
        <span className="text-white/40">🔒</span>
      </span>
    )
  }
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
function DrawerNav({
  sections,
  onNavigate,
}: {
  sections: NavSection[]
  onNavigate: () => void
}) {
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
          {/* A heading only earns its place over more than one row. A section
              holding a single screen was printing "IMPORTS" above a row called
              "Imports" — the same word twice, and a whole heading's worth of
              space to say nothing. */}
          {sec.title && sec.items.length > 1 && (
            <div className="px-3 pb-1 pt-2 text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-white/35">
              {sec.title}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {sec.items.map((it) => (
              <NavLink key={it.to} to={it.to} onClick={onNavigate} className={row}>
                <it.icon size={16} strokeWidth={2} className="shrink-0 opacity-70" />
                {/* Labelled by its section when the section IS the screen —
                    the menu has always called this one "Imports", not
                    whatever the route inside it is named. */}
                {sec.items.length === 1 && sec.title ? sec.title : it.label}
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
function Rail({
  sections,
  onNavigate,
}: {
  sections: NavSection[]
  onNavigate: () => void
}) {
  const loc = useLocation()
  /**
   * Places, then folders — never mixed.
   *
   * A section with no title holds a single destination (Dashboard, My Shift),
   * and a section holding exactly ONE screen *is* that screen: unfolding it to
   * a single row is just a second click to arrive. Both are rows you tap to go
   * somewhere, so both belong in one list.
   *
   * Left in source order they interleaved — Dashboard, Imports, Daily Ops,
   * Training, Item Catalog, Management — so the rail alternated place, place,
   * folder, folder, place, folder. That is the order that read as random, and
   * no amount of styling fixes an arbitrary sequence.
   */
  const groups = useMemo(() => sections.filter((s) => s.title && s.items.length > 1), [sections])
  const links = useMemo(
    () =>
      sections.flatMap((s) =>
        // A one-screen section is labelled by the SECTION, not the item inside
        // it: the menu says "Imports", the route inside it is called something
        // else, and the rail has always shown the former.
        !s.title ? s.items : s.items.length === 1 ? [{ ...s.items[0], label: s.title }] : [],
      ),
    [sections],
  )

  // The area holding the current route — the resting state the rail returns to.
  const routeArea = useMemo(
    () => groups.findIndex((a) => a.items.some((x) => x.to === loc.pathname)),
    [groups, loc.pathname],
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
        // Same surface as the blocks above it — it was a fifth fill (4%) and a
        // fifth radius sitting directly under four others.
        className="rail-block mb-2 flex w-full items-center gap-2 px-2.5 py-2 text-[12px] text-white/45 hover:text-white/70"
      >
        <Search size={13} className="shrink-0" />
        {/* It finds dishes now, not just screens, and nobody taps a box to go
            looking for a burger build if the box says "jump to". */}
        Search dishes & screens
        <kbd className="ml-auto rounded border border-white/15 px-1 py-px font-mono text-[9px]">⌘K</kbd>
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {links.map((it) => (
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

        {/* Somewhere to go, above; things that open, below. Without the rule
            the two ran together as one list of six, half of which navigated
            and half of which unfolded, with nothing saying which was which. */}
        {links.length > 0 && groups.length > 0 && (
          <div className="my-2 border-t border-white/[0.07]" />
        )}

        {groups.map((sec, i) => {
          const isOpen = i === open
          const here = sec.items.some((x) => x.to === loc.pathname)
          return (
            <div key={sec.title} onMouseEnter={() => setOpen(i)}>
              <button
                // Toggle, so the same header that opens an area also closes it.
                // mouseEnter does not re-fire while the pointer sits still, so
                // closing sticks until you leave the area and come back.
                onClick={() => setOpen((o) => (o === i ? -1 : i))}
                aria-expanded={isOpen}
                // A folder, styled like one. It used to be pixel-identical to
                // Dashboard and Imports — same size, weight, colour and indent
                // — with a 45%-opacity chevron as the only clue that one of
                // them took you somewhere and the other unfolded. Small, wide-
                // tracked caps read as a heading; the destinations keep their
                // icons and sentence case.
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[10.5px] font-extrabold uppercase tracking-[0.12em] transition-colors ${
                  isOpen || here ? 'text-white/75' : 'text-white/40 hover:bg-white/5 hover:text-white/70'
                }`}
              >
                <span className="flex-1 truncate text-left">{sec.title}</span>
                <ChevronDown
                  size={12}
                  className={`ml-1 shrink-0 opacity-70 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                // Aligned so a child's icon sits under the header's first
                // letter — the guide rule and the text used to disagree by a
                // couple of pixels, which is the sort of thing you feel
                // without being able to name it.
                <div className="mb-1.5 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                  {sec.items.map((it) => (
                    <NavLink
                      key={it.to}
                      to={it.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors ${
                          isActive
                            ? 'bg-signal/12 font-semibold text-signal shadow-[inset_2px_0_0_var(--color-signal)]'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      <it.icon size={14} strokeWidth={2} className="shrink-0 opacity-60" />
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
