// The sheet picker for Sidework — a spine for the page instead of three rows
// of buttons stacked above it.
//
// What it replaces: "Front of house" as four wide tabs, "Kitchen" as six more
// underneath, and the phase chips under those. Thirteen controls in three
// different shapes before you reached anything you could actually read, and
// none of them told you a thing about the state of the close.
//
// What it adds, which is the reason it's worth the room: every sheet carries
// its own progress and its sign-off. The old page could tell you about the one
// sheet you happened to be standing on; a manager closing a building wants to
// know which of the nine are finished without tapping through all nine.
import { Check, Lock, Plus } from 'lucide-react'
import { Card } from './ui'

export interface SheetState {
  /** Sheet name — a front-of-house job or a kitchen station. */
  name: string
  done: number
  total: number
  /** Initials of whoever signed it off, when someone has. */
  verifiedBy?: string
}

export function SheetRail({
  foh,
  kitchen,
  active,
  onPick,
  onAddStation,
  cleanActive,
  onPickClean,
  canEdit,
}: {
  foh: SheetState[]
  kitchen: SheetState[]
  active: string
  onPick: (name: string) => void
  onAddStation: () => void
  cleanActive: boolean
  onPickClean: () => void
  canEdit: boolean
}) {
  const all = [...foh, ...kitchen]
  const signed = all.filter((s) => s.verifiedBy).length

  return (
    <>
      {/* Phone: one scrolling row, not nine stacked rows.
          The vertical rail is right on a desktop and wrong on a handset, where
          it pushes the actual work a full screen down — the close is worked on
          a phone, and the first thing on it should be the cuts. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {all.map((s) => (
          <Chip
            key={s.name}
            s={s}
            on={!cleanActive && s.name === active}
            onClick={() => onPick(s.name)}
          />
        ))}
        <button
          onClick={onPickClean}
          className={`shrink-0 rounded-xl border px-3 py-2 text-[13px] font-bold ${
            cleanActive ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted'
          }`}
        >
          Deep clean
        </button>
        {canEdit && (
          <button
            onClick={onAddStation}
            aria-label="Add a station"
            className="shrink-0 rounded-xl border border-dashed border-black/20 px-3 py-2 text-[13px] font-bold text-muted"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <Card className="hidden overflow-hidden lg:block">
      <div className="flex items-baseline gap-2 border-b border-black/5 px-4 py-3">
        <span className="font-display text-sm font-semibold text-ink">Sheets</span>
        <span className="ml-auto text-[11px] font-semibold text-muted">
          {signed}/{all.length} signed off
        </span>
      </div>

      <Group label="Front of house">
        {foh.map((s) => (
          <Row key={s.name} s={s} on={!cleanActive && s.name === active} onClick={() => onPick(s.name)} />
        ))}
      </Group>

      <Group label="Kitchen">
        {kitchen.map((s) => (
          <Row key={s.name} s={s} on={!cleanActive && s.name === active} onClick={() => onPick(s.name)} />
        ))}
        {canEdit && (
          <button
            onClick={onAddStation}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] font-semibold text-muted hover:bg-black/[0.02] hover:text-ink"
          >
            <Plus size={13} className="shrink-0" />
            Add a station
          </button>
        )}
      </Group>

      {/* Its own block: the deep clean is the wall schedule, not a duty sheet —
          no phases, no cuts, nothing to sign off. Filing it under Kitchen as a
          tenth station said it was the same kind of thing, and it isn't. */}
      <Group label="Schedule">
        <button
          onClick={onPickClean}
          className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-semibold ${
            cleanActive ? 'bg-brand/[0.12] text-brand-600' : 'text-ink/85 hover:bg-black/[0.02]'
          }`}
        >
          <span
            className={`h-4 w-1 shrink-0 rounded-full ${cleanActive ? 'bg-brand' : 'bg-transparent'}`}
          />
          Deep clean
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-muted">
            weekly · monthly
          </span>
        </button>
      </Group>
      </Card>
    </>
  )
}

/** The phone's version of a rail row — same facts, one tap, no vertical cost. */
function Chip({ s, on, onClick }: { s: SheetState; on: boolean; onClick: () => void }) {
  const complete = s.total > 0 && s.done === s.total
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold ${
        on ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted'
      }`}
    >
      {s.name}
      {s.verifiedBy ? (
        <Check size={12} strokeWidth={3} className={on ? '' : 'text-up'} />
      ) : s.total > 0 ? (
        <span
          className={`font-mono text-[10px] ${
            on ? 'opacity-70' : complete ? 'text-up' : 'text-muted/60'
          }`}
        >
          {s.done}/{s.total}
        </span>
      ) : null}
    </button>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-black/5 last:border-0">
      <div className="px-4 pb-1 pt-2.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="pb-1.5">{children}</div>
    </div>
  )
}

/**
 * One sheet.
 *
 * The bar is the point — a glance down the rail is meant to answer "what's
 * left?" without opening anything. It only appears once there's something on
 * it, so a sheet nobody has touched reads as untouched rather than as zero.
 */
function Row({ s, on, onClick }: { s: SheetState; on: boolean; onClick: () => void }) {
  const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
  const complete = s.total > 0 && s.done === s.total
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left ${
        on ? 'bg-brand/[0.12]' : 'hover:bg-black/[0.02]'
      }`}
    >
      <span className={`h-4 w-1 shrink-0 rounded-full ${on ? 'bg-brand' : 'bg-transparent'}`} />
      <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${on ? 'text-brand-600' : 'text-ink/85'}`}>
        {s.name}
      </span>
      {s.verifiedBy ? (
        <span
          title={`Signed off by ${s.verifiedBy}`}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-up/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-up"
        >
          <Check size={10} strokeWidth={3} />
          {s.verifiedBy}
        </span>
      ) : s.total === 0 ? (
        <span className="shrink-0 text-[10px] font-semibold text-muted/60">empty</span>
      ) : s.done === 0 ? (
        <span className="shrink-0 font-mono text-[10px] font-bold text-muted/60">{s.total}</span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="h-1 w-8 overflow-hidden rounded-full bg-white/10">
            <span
              className={`block h-full rounded-full ${complete ? 'bg-up' : 'bg-brand'}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right font-mono text-[10px] font-bold text-muted">
            {s.done}/{s.total}
          </span>
        </span>
      )}
    </button>
  )
}

const Tag = ({ k, v }: { k: string; v?: string }) => (
  <span className="inline-flex items-center gap-1">
    <span className="rounded bg-black/10 px-1.5 py-px text-[9px] font-extrabold uppercase text-muted">
      {k}
    </span>
    <span className={v ? 'font-semibold text-ink' : 'text-muted/70'}>{v || 'nobody yet'}</span>
  </span>
)

/**
 * Who is staying, as one line.
 *
 * The closer panel used to be the biggest thing above the fold — two columns
 * of tick boxes, half of it empty because front of house has five jobs and the
 * kitchen has ten. It's decided once at the start of a night and read at the
 * end of one, so it opens on the answer and unfolds when there's a reason.
 */
export function ClosersStrip({
  foh,
  boh,
  open,
  onToggle,
  left,
}: {
  foh?: string
  boh?: string
  open: boolean
  onToggle: () => void
  /** Closing duties still unticked across both lists. */
  left: number
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left ${
        open ? 'border-b border-black/5' : ''
      }`}
    >
      <Lock size={13} className="shrink-0 text-muted" />
      <span className="font-display text-sm font-semibold text-ink">Closers</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <Tag k="FOH" v={foh} />
        <Tag k="BOH" v={boh} />
      </span>
      <span className="ml-auto flex items-center gap-2 text-[11px] font-semibold text-muted">
        {left > 0 ? `${left} to do` : 'all done'}
        <span className="text-muted/60">{open ? 'hide' : 'open'}</span>
      </span>
    </button>
  )
}
