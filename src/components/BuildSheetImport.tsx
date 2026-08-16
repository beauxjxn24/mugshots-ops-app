import { useMemo, useState } from 'react'
import { FileCheck2, AlertTriangle } from 'lucide-react'
import { Card } from './ui'
import { parseBuildSheet, saveImported } from '../lib/buildsheet'
import { currentEditor } from '../lib/settings'
import { toast } from '../lib/toast'

/**
 * A dropped build sheet, shown before it is believed.
 *
 * These are scans, so the text is OCR and OCR is confidently wrong sometimes.
 * Everything it read is on screen next to an editable dish name, and nothing
 * reaches the menu until someone presses the button. A spec card is what a cook
 * follows on a busy line; a card nobody checked is worse than no card.
 */
export function BuildSheetImport({
  text,
  fileName,
  onImported,
}: {
  text: string
  fileName: string
  onImported?: (name: string) => void
}) {
  const parsed = useMemo(() => parseBuildSheet(text), [text])
  const [name, setName] = useState(parsed?.sheetName ?? '')
  const [saved, setSaved] = useState(false)

  if (!parsed) return null

  const commit = () => {
    const dish = name.trim()
    if (!dish) return
    saveImported({
      sheetName: dish,
      sections: parsed.sections,
      sheet: fileName,
      at: new Date().toISOString(),
      by: currentEditor(),
    })
    setSaved(true)
    onImported?.(dish)
    toast(`${dish} imported — check it on Specs`)
  }

  if (saved) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-up/30 bg-up/5 p-3 text-sm font-semibold text-up">
        <FileCheck2 size={16} /> {name} imported. It replaces the shipped build for that dish —
        delete the import to put the old one back.
      </div>
    )
  }

  return (
    <Card className="mt-3 overflow-hidden border-brand/30">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-brand/[0.06] px-4 py-2.5">
        <FileCheck2 size={15} className="shrink-0 text-brand-600" />
        <span className="font-display text-sm font-semibold text-ink">Build sheet</span>
        <span className="text-xs text-muted">{parsed.sections.length} stages read</span>
      </div>

      <div className="space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-muted">
            Dish name — fix it if the scan misread it
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dish name"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-brand"
          />
        </label>

        <div className="overflow-hidden rounded-xl border border-black/10">
          {parsed.sections.map((sec, i) => (
            <div key={i} className="flex gap-3 border-b border-black/5 px-3 py-2 last:border-0">
              <span className="w-28 shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-muted">
                {sec.label}
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                {sec.lines.map((l, j) => (
                  <span key={j} className="block text-[13px] text-ink">
                    {l}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>

        {parsed.stray.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn/[0.07] p-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
            <span className="text-[11.5px] text-ink/80">
              {parsed.stray.length} line{parsed.stray.length === 1 ? '' : 's'} came before any stage
              and {parsed.stray.length === 1 ? 'was' : 'were'} left out — usually the header, but
              worth a look: <i>{parsed.stray.slice(0, 3).join(' · ')}</i>
            </span>
          </div>
        )}

        <p className="text-[11.5px] text-muted text-pretty">
          Read from a scan, so check it against the sheet before importing — this becomes what the
          line cooks from.
        </p>

        <button
          onClick={commit}
          disabled={!name.trim()}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          Import {name.trim() || 'this build'}
        </button>
      </div>
    </Card>
  )
}
