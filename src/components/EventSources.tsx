// What the local-events tracker will watch — set up now, fed when there's a
// server to feed it.
//
// It lives on Connections rather than getting its own screen because that is
// what it is: an integration this store has configured, sitting with the rest
// of them. And because a nav item for something that doesn't fetch yet is one
// more place to look and nothing to find there.
//
// The panel is honest about that in the first line. A screen that lists sources
// as though they were live is worse than no screen — the manager stops typing
// events in, and nothing replaces them.
import { useMemo, useState } from 'react'
import { Megaphone, ExternalLink, Plus, X } from 'lucide-react'
import { Card } from './ui'
import {
  getSources,
  toggleSource,
  addSource,
  removeSource,
  byKind,
  KIND_LABEL,
  KINDS,
  type SourceKind,
} from '../lib/eventsources'

export function EventSources() {
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sources = useMemo(() => getSources(), [tick])
  const bump = () => setTick((n) => n + 1)
  const groups = byKind(sources)
  const on = sources.filter((s) => !s.off).length

  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', city: '', url: '', kind: 'chamber' as SourceKind })
  const save = () => {
    if (!f.name.trim()) return
    addSource(f.name, f.kind, f.city, f.url)
    setF({ name: '', city: '', url: '', kind: 'chamber' })
    setAdding(false)
    bump()
  }
  const input =
    'min-w-0 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-l-4 border-signal bg-signal/[0.06] px-4 py-2.5">
        <Megaphone size={15} className="shrink-0 text-signal" />
        <span className="text-sm font-bold text-ink">Local events tracker</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-muted">
          {on} watching
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-bold text-ink hover:border-signal/50"
        >
          <Plus size={12} /> Add a source
        </button>
      </div>

      <p className="border-b border-black/5 px-4 py-3 text-xs leading-relaxed text-ink/75">
        <b className="text-warn">None of these are being read yet</b> — there's no server to read
        them from, so the ticker on the Dashboard is still a list you type. This is the list that
        server will work from: turn off anything you don't want watched, and add what's missing.
        When it goes live, events land on the ticker tagged with where they came from, and anything
        you take off stays off.
      </p>

      {adding && (
        <div className="grid grid-cols-2 gap-2 border-b border-black/5 bg-signal/[0.04] p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
          <input
            autoFocus
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Name"
            className={input}
          />
          <select
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value as SourceKind })}
            className={input}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            value={f.city}
            onChange={(e) => setF({ ...f, city: e.target.value })}
            placeholder="Town"
            className={input}
          />
          <input
            value={f.url}
            onChange={(e) => setF({ ...f, url: e.target.value })}
            placeholder="Link to their calendar"
            className={input}
          />
          <button
            onClick={save}
            className="rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white"
          >
            Add
          </button>
        </div>
      )}

      {sources.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">
          Nothing set up for this store yet — add the chambers, venues and schools around you.
        </p>
      ) : (
        groups.map(({ kind, items }) => (
          <div key={kind}>
            <div className="border-b border-black/5 bg-black/[0.02] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              {KIND_LABEL[kind]}
              <span className="ml-1.5 font-bold text-muted/60">{items.length}</span>
            </div>
            {items.map((s) => (
              <div
                key={s.id}
                className={`flex items-start gap-3 border-b border-black/5 px-4 py-2.5 last:border-0 ${
                  s.off ? 'opacity-45' : ''
                }`}
              >
                {/* A checkbox, not a switch: this is a list you tick down, and a
                    row of switches reads as a settings screen. */}
                <input
                  type="checkbox"
                  checked={!s.off}
                  onChange={() => {
                    toggleSource(s.id)
                    bump()
                  }}
                  aria-label={`Watch ${s.name}`}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-signal)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-bold text-ink">{s.name}</span>
                    <span className="text-[11px] text-muted">
                      {s.city}
                      {s.miles != null && s.miles > 0 && ` · ${s.miles} mi`}
                      {s.miles === 0 && ' · here'}
                    </span>
                    {s.own && (
                      <span className="rounded bg-black/5 px-1.5 py-px text-[9px] font-extrabold uppercase text-muted">
                        yours
                      </span>
                    )}
                  </div>
                  {s.how && <p className="mt-0.5 text-[11px] leading-snug text-ink/60">{s.how}</p>}
                </div>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${s.name}'s calendar`}
                    title="Open their calendar"
                    className="mt-0.5 shrink-0 text-muted hover:text-signal"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
                {s.own && (
                  <button
                    onClick={() => {
                      removeSource(s.id)
                      bump()
                    }}
                    aria-label={`Remove ${s.name}`}
                    className="mt-0.5 shrink-0 text-muted hover:text-down"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </Card>
  )
}
