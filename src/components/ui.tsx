import type { ReactNode } from 'react'

/**
 * How wide a page's content runs.
 *
 * Four, and only four. There were seven — 2xl, 3xl, 4xl, 5xl, 6xl, 7xl and
 * three pages with no limit at all — which is why moving between screens felt
 * like moving between apps: the column jumped width at almost every click.
 *
 * Pick by what the page IS, not by how much happens to be on it today:
 *   narrow  — one column you read or fill in (a checklist, a form, a sheet)
 *   default — the house width. If you're unsure, it's this.
 *   wide    — a data table that genuinely needs the room.
 *   full    — the content is edge-to-edge (a board that scrolls sideways, a
 *             sticky tab strip); the title has to run edge-to-edge with it.
 */
export type PageWidth = 'narrow' | 'default' | 'wide' | 'full'
const WIDTH: Record<PageWidth, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
}

/**
 * The gutter goes on the OUTER element, the max-width on the inner one, in that
 * order, in both the header and the body.
 *
 * Not interchangeable. Tailwind's box-sizing is border-box, so `max-w-6xl p-8`
 * on one element makes 1152px INCLUDING the padding, while `px-8` outside a
 * `max-w-6xl` makes 1152px of content. The header did it the second way and the
 * body the first, which left every title 20px out from the card beneath it —
 * close enough to look like a mistake rather than a choice, on every page.
 */
const GUTTER = 'px-4 sm:px-6 lg:px-8'
const box = (w: PageWidth) => `mx-auto w-full ${WIDTH[w]}`

/**
 * The page frame: title block and body, sharing one container.
 *
 * Sharing it is the point. The header used to run full-bleed while the body was
 * centred in a max-width column, so on any screen wider than the column the
 * title sat out to the left of the first card it was naming — on every page in
 * the app. Nothing looks less deliberate than a heading that doesn't line up
 * with the thing under it.
 *
 * Padding and vertical rhythm live here too, for the same reason the width
 * does: eleven pages had already converged on `p-4 sm:p-6 lg:p-8` with
 * `space-y-5`, and the rest had drifted a notch either side of it. Now there is
 * one copy to drift from.
 */
export function Page({
  title,
  subtitle,
  right,
  width = 'default',
  children,
  /** Extra classes on the body — use for a grid, not for width or padding. */
  className = '',
  /** Opt out of the default vertical rhythm when the body lays itself out. */
  flush = false,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  width?: PageWidth
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <>
      <div className={`border-b border-white/10 bg-white/[0.03] py-4 backdrop-blur-xl ${GUTTER}`}>
        <div className={`${box(width)} flex flex-wrap items-end justify-between gap-3`}>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink text-balance">
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted text-pretty">{subtitle}</p>}
          </div>
          {right}
        </div>
      </div>
      <div className={`py-4 sm:py-6 lg:py-8 ${GUTTER}`}>
        <div className={`${box(width)} ${flush ? '' : 'space-y-5'} ${className}`}>{children}</div>
      </div>
    </>
  )
}

/**
 * The title block on its own.
 *
 * Kept for the few screens that put something full-bleed directly beneath it —
 * a sticky tab strip, a board that scrolls sideways — where the body can't sit
 * inside `Page`'s container. Everything else should use `Page`, which is this
 * plus the body container that lines up with it.
 */
export function PageHeader({
  title,
  subtitle,
  right,
  width = 'default',
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  width?: PageWidth
}) {
  return (
    <div className={`border-b border-white/10 bg-white/[0.03] py-4 backdrop-blur-xl ${GUTTER}`}>
      <div className={`${box(width)} flex flex-wrap items-end justify-between gap-3`}>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink text-balance">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted text-pretty">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  )
}

export function Card({
  children,
  className = '',
  id,
  onMouseEnter,
  onMouseLeave,
}: {
  children: ReactNode
  className?: string
  id?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  return (
    <div
      id={id}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  )
}

export function Stat({
  value,
  label,
  sub,
  tone = 'default',
}: {
  value: ReactNode
  label: string
  sub?: string
  tone?: 'default' | 'up' | 'down'
}) {
  const toneCls =
    tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-brand'
  return (
    <Card className="p-4">
      <div className={`font-display text-3xl font-semibold ${toneCls}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  )
}
