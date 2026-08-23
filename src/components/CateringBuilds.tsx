// The build cards, on the page where the orders are.
//
// Collapsed to a row of names until one is opened: the page's job is the
// bookings log, and ten platters unfolded above it would bury the thing the
// screen is for. One tap opens the card over the page — the same shape as an
// order — because packing a tray is a stand-at-the-line job and it wants the
// photo big.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChefHat, Package } from 'lucide-react'
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
      <div className="flex flex-wrap items-center gap-2 border-l-4 border-signal bg-signal/[0.06] px-4 py-2.5">
        <ChefHat size={15} className="shrink-0 text-signal" />
        <span className="text-sm font-bold text-ink">Build cards</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-muted">
          {CATERING_BUILDS.length}
        </span>
        <span className="ml-auto text-[11px] text-muted">how the tray gets packed</span>
      </div>
      {groups.map(({ g, items }) => (
        <div key={g}>
          <div className="border-b border-black/5 bg-black/[0.02] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
            {g}
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {items.map((b) => {
              const photo = b.photos[0] ? buildPhoto(b.photos[0]) : undefined
              return (
                <button
                  key={b.name}
                  onClick={() => setOpen(b)}
                  className="flex min-w-[13rem] flex-1 items-center gap-2.5 rounded-xl border border-black/10 bg-white p-2 text-left hover:border-signal/50"
                >
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      loading="lazy"
                      className="size-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-black/5 text-muted">
                      <Package size={17} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-ink">{b.name}</span>
                    <span className="block text-[10px] text-muted">
                      {b.packaging.length} items to pack
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <BuildSheet build={open} onClose={() => setOpen(null)} />
    </Card>
  )
}

const Head = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1.5 mt-4 text-[10px] font-extrabold uppercase tracking-wider text-muted first:mt-0">
    {children}
  </div>
)

function BuildSheet({ build, onClose }: { build: CateringBuild | null; onClose: () => void }) {
  useEffect(() => {
    if (!build) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [build, onClose])

  if (!build) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Build card — ${build.name}`}
    >
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-black/5 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Catering build
            </div>
            <div className="font-display text-base font-semibold text-ink">{build.name}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {/* The photo first and big — it's what somebody checks their tray
              against, and a thumbnail answers nothing. */}
          {build.photos.length > 0 && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {build.photos.map((f) => {
                const src = buildPhoto(f)
                return src ? (
                  <img
                    key={f}
                    src={src}
                    alt={`${build.name} build`}
                    loading="lazy"
                    className="w-full rounded-xl object-cover"
                  />
                ) : null
              })}
            </div>
          )}

          {build.steps.length > 0 && (
            <>
              <Head>{build.procHead}</Head>
              <div className="space-y-3">
                {build.steps.map((s, i) => (
                  <div key={i}>
                    {s.head && (
                      <div className="mb-1 text-sm font-bold text-brand-600">{s.head}</div>
                    )}
                    {s.body.map((p, j) => (
                      <p key={j} className={`text-sm leading-relaxed text-ink/85 ${s.head ? 'pl-3' : ''}`}>
                        {p}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {build.packaging.length > 0 && (
            <>
              <Head>Packaging &amp; accompaniments</Head>
              <div className="overflow-hidden rounded-xl border border-black/10">
                {build.packaging.map((p, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-black/5 px-3 py-2 last:border-0"
                  >
                    <span className="min-w-0 flex-1 text-sm text-ink">{p.item || '—'}</span>
                    {/* The product number is what gets ordered, so it reads as
                        a number: mono, not prose. */}
                    <span className="shrink-0 font-mono text-[11px] text-muted">{p.sku}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
