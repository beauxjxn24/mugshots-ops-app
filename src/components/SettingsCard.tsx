import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Lock, Pencil, Check } from 'lucide-react'
import { Card } from './ui'
import { requirePin } from '../lib/pin'
import { lastChangeFor, logSettingChange, stampLabel, type SettingChange } from '../lib/settings'

/**
 * One settings card, with the same contract everywhere in the app:
 *
 *   locked → Edit (manager PIN) → change freely → Save (stamped) or Discard
 *
 * Nothing saves as you type and nothing saves on blur, so a stray tap can't
 * quietly change a delivery day. While unlocked the card is visibly live and
 * the footer counts your unsaved changes; after a save it re-locks and shows
 * who saved it and when. That stamp is the visible half of the settings audit.
 */
export function SettingsCard<T>({
  area,
  title,
  hint,
  value,
  onSave,
  summarize,
  children,
  className = '',
}: {
  /** Audit label — also the card's identity in the change log. */
  area: string
  title: ReactNode
  hint?: ReactNode
  /** The saved value. Edits work on a draft copy of it. */
  value: T
  /** Commit the draft. Only called after a PIN unlock and an explicit Save. */
  onSave: (draft: T) => void
  /** Optional plain-English description of the change, for the log. */
  summarize?: (draft: T, saved: T) => string | undefined
  children: (draft: T, setDraft: (updater: T | ((prev: T) => T)) => void, unlocked: boolean) => ReactNode
  className?: string
}) {
  const [unlocked, setUnlocked] = useState(false)
  const [draft, setDraft] = useState<T>(value)
  const [justSaved, setJustSaved] = useState(false)
  const [stamp, setStamp] = useState<SettingChange | null>(() => lastChangeFor(area))
  const saveTimer = useRef<number | undefined>(undefined)

  const savedJson = JSON.stringify(value)
  // While locked, follow the saved value (another screen may have changed it).
  // While unlocked, the draft is the user's — never yank it out from under them.
  useEffect(() => {
    if (!unlocked) setDraft(JSON.parse(savedJson))
  }, [savedJson, unlocked])
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  const dirty = useMemo(() => JSON.stringify(draft) !== savedJson, [draft, savedJson])

  const edit = async () => {
    if (!(await requirePin(`Edit ${area.toLowerCase()}`))) return
    setDraft(JSON.parse(savedJson))
    setJustSaved(false)
    setUnlocked(true)
  }
  const discard = () => {
    setDraft(JSON.parse(savedJson))
    setUnlocked(false)
  }
  const commit = () => {
    if (!dirty) {
      setUnlocked(false)
      return
    }
    onSave(draft)
    setStamp(logSettingChange(area, summarize?.(draft, value)))
    setUnlocked(false)
    setJustSaved(true)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => setJustSaved(false), 4000)
  }

  return (
    <Card className={`overflow-hidden ${unlocked ? 'ring-1 ring-brand/40' : ''} ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-black/[0.02] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-muted">
            {!unlocked && <Lock size={12} aria-hidden />}
            {title}
          </div>
          {hint && <p className="mt-1 text-xs text-muted text-pretty">{hint}</p>}
        </div>
        {unlocked ? (
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-brand">
            Editing
          </span>
        ) : (
          <button
            onClick={edit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-ink"
          >
            <Pencil size={12} /> Edit
          </button>
        )}
      </div>

      {/* Disabling the fieldset makes "locked" real, not a suggestion — every
          input and button inside stops responding until Edit is pressed. */}
      <fieldset disabled={!unlocked} className={unlocked ? 'p-4' : 'p-4 opacity-70'}>
        {children(draft, setDraft as (u: T | ((p: T) => T)) => void, unlocked)}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-black/5 bg-black/[0.02] px-4 py-2.5">
        {unlocked ? (
          <>
            <span className={`text-xs font-semibold ${dirty ? 'text-warn' : 'text-muted'}`}>
              {dirty ? 'Unsaved changes' : 'No changes yet'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={discard} className="rounded-lg px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">
                Discard
              </button>
              <button
                onClick={commit}
                disabled={!dirty}
                className="rounded-lg bg-brand px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Save changes
              </button>
            </div>
          </>
        ) : justSaved ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-up">
            <Check size={13} /> Saved
            {stamp ? ` · ${stamp.by} · ${stampLabel(stamp.at)}` : ''}
          </span>
        ) : (
          <span className="text-xs text-muted">
            {stamp ? `Last saved by ${stamp.by} · ${stampLabel(stamp.at)}` : 'Locked — tap Edit to change.'}
          </span>
        )}
      </div>
    </Card>
  )
}
