// The catering build cards.
//
// This is a card somebody reads standing up, holding a tray, with the order on
// the screen next to them. So it's built around the three things that job
// actually needs, in the order it needs them:
//
//   The photo, big.       It's the target. You build until the tray matches it,
//                         and a thumbnail answers nothing.
//   The steps, numbered.  A wall of paragraph is unreadable when you're looking
//                         up and down between a screen and a bench — you lose
//                         your place. A number holds it.
//   The packing list,     because gathering is its own pass. You walk once with
//   tickable.             the list and come back with everything.
//
// Variants get tabs rather than stacked headings. The Salad Boxed Lunch is
// three different builds; you are making ONE of them, and the other two are
// noise you have to read past to be sure you're on the right one.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Package, UtensilsCrossed } from 'lucide-react'
import { Card } from './ui'
import {
  CATERING_BUILDS,
  buildPhoto,
  groupOf,
  GROUP_ORDER,
  type CateringBuild,
} from '../lib/cateringbuilds'

export function CateringBuilds() {
  const [open, setOpen] = useState<CateringBuild | null>(null)
  const groups = GROUP_ORDER.map((g) => ({
    g,
    items: CATERING_BUILDS.filter((b) => groupOf(b.name) === g),
  })).filter((x) => x.items.length > 0)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-4 py-3">
        <UtensilsCrossed size={16} className="shrink-0 text-signal" />
        <span className="font-display text-lg font-semibold text-ink">Build cards</span>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold text-muted">
          {CATERING_BUILDS.length}
        </span>
        <span className="ml-auto text-xs text-muted">how each tray and box gets packed</span>
      </div>

      <div className="space-y-4 p-4">
        {groups.map(({ g, items }) => (
          <div key={g}>
            <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              {g}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((b) => {
                const photo = b.photos[0] ? buildPhoto(b.photos[0]) : undefined
                return (
                  <button
                    key={b.name}
                    onClick={() => setOpen(b)}
                    className="panel group overflow-hidden text-left transition-colors hover:border-signal/60"
                  >
                    <span className="block aspect-[4/3] overflow-hidden bg-black/20">
                      {photo ? (
                        <img
                          src={photo}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 can-hover:group-hover:scale-105"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-muted">
                          <Package size={26} />
                        </span>
                      )}
                    </span>
                    <span className="block p-2.5">
                      <span className="block text-[13px] font-bold leading-tight text-ink">
                        {b.name}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted">
                        {b.packaging.length} to pack
                        {b.steps.length > 0 && ` · ${b.steps.length} step${b.steps.length === 1 ? '' : 's'}`}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <BuildSheet build={open} onClose={() => setOpen(null)} />
    </Card>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 mt-5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-muted first:mt-0">
    {children}
  </div>
)

function BuildSheet({ build, onClose }: { build: CateringBuild | null; onClose: () => void }) {
  const [variant, setVariant] = useState(0)
  const [got, setGot] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setVariant(0)
    setGot({})
  }, [build?.name])
  useEffect(() => {
    if (!build) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [build, onClose])

  /** The named builds on this card — the Salad box is three of them. */
  const variants = useMemo(() => (build?.steps ?? []).filter((s) => s.head), [build])

  if (!build) return null
  const hero = build.photos[0] ? buildPhoto(build.photos[0]) : undefined
  const rest = build.photos.slice(1).map(buildPhoto).filter(Boolean) as string[]
  const shown = variants.length > 0 ? variants[Math.min(variant, variants.length - 1)] : null
  const packed = build.packaging.filter((_, i) => got[String(i)]).length

  // One numbered run, in the packet's own order.
  //
  // Not shared-first-then-variant: the sheet puts steps on BOTH sides of the
  // variant — line the box, build the salad you're making, then the cookie and
  // the cutlery. Hoisting all the shared ones to the top had "Cutlery Kit is
  // served on the side" as step 3 and the actual salad as step 4.
  const numbered = build.steps
    .filter((st) => !st.head || st.head === shown?.head)
    .flatMap((st) => st.body)

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Build card — ${build.name}`}
    >
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Hero. The name sits ON the photo so the first thing on screen is
            the thing you're building, not a heading about it. */}
        <div className="relative shrink-0">
          {hero ? (
            <img src={hero} alt={build.name} className="h-44 w-full object-cover sm:h-56" />
          ) : (
            <div className="grid h-32 w-full place-items-center bg-navy/40 text-muted">
              <Package size={30} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">
                Catering build
              </div>
              <div className="font-display text-xl font-bold leading-tight text-white sm:text-2xl">
                {build.name}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-navy/60 text-white backdrop-blur hover:bg-navy"
          >
            <X size={17} />
          </button>
        </div>

        {/* Which build — you're making one of these, not all of them. */}
        {variants.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-black/5 p-2">
            {variants.map((v, i) => (
              <button
                key={v.head}
                onClick={() => setVariant(i)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                  i === variant ? 'bg-brand text-navy' : 'text-muted hover:bg-black/5'
                }`}
              >
                {v.head}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Label>{build.procHead}</Label>
              <ol className="space-y-2.5">
                {numbered.map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-brand/15 font-mono text-[11px] font-extrabold text-brand-600">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink/90">{p}</span>
                  </li>
                ))}
              </ol>

              {rest.length > 0 && (
                <>
                  <Label>More shots</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {rest.map((src) => (
                      <img key={src} src={src} alt="" loading="lazy" className="w-full rounded-xl" />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Gathering is its own pass, so it's a list you tick. */}
            <div className="min-w-0">
              <Label>
                Pull it{' '}
                <span className="font-mono text-muted/70">
                  {packed}/{build.packaging.length}
                </span>
              </Label>
              <div className="overflow-hidden rounded-2xl border border-black/10">
                {build.packaging.map((p, i) => {
                  const on = !!got[String(i)]
                  return (
                    <button
                      key={i}
                      onClick={() => setGot((g) => ({ ...g, [String(i)]: !g[String(i)] }))}
                      className={`flex w-full items-start gap-2.5 border-b border-black/5 px-3 py-2.5 text-left last:border-0 ${
                        on ? 'bg-up/[0.06]' : ''
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 ${
                          on ? 'border-up bg-up text-white' : 'border-black/20 text-transparent'
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[13px] ${on ? 'text-muted line-through' : 'text-ink'}`}
                        >
                          {p.item || '—'}
                        </span>
                        {p.sku && (
                          <span className="mt-0.5 block font-mono text-[10px] text-muted">
                            {p.sku}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
