import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudUpload } from 'lucide-react'
import { stageFiles } from '../lib/dropstage'

/**
 * Drop a report where you already are.
 *
 * Reports arrive while someone is looking at the dashboard. Making them find
 * the Imports screen first is three navigations between a file and the app
 * knowing about it, and it's why reports sit unimported.
 *
 * The file is taken here and handed to Imports, which does the reading and
 * shows the review — same one place as before, reached in one drop instead of
 * a hunt. Clicking works too; a lot of this happens on a tablet with no
 * drag to speak of.
 */
export function DashDrop() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const take = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    stageFiles(files)
    navigate('/imports')
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        take(e.dataTransfer.files)
      }}
      onClick={() => fileRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
      className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
        over ? 'border-brand bg-brand/10' : 'border-black/15 bg-black/[0.02] hover:border-brand/50 hover:bg-brand/5'
      }`}
    >
      <span
        className={`grid size-11 place-items-center rounded-xl transition-colors ${
          over ? 'bg-brand text-white' : 'bg-brand/10 text-brand-600'
        }`}
      >
        <CloudUpload size={22} />
      </span>
      <span className="font-display text-[15px] font-semibold text-ink">Drop a report</span>
      <span className="max-w-[22rem] text-[11.5px] leading-snug text-muted text-pretty">
        Sales, labor, PMIX, invoices, count sheets, catering, the employee export, a build sheet —
        it works out which and shows you before anything lands.
      </span>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => take(e.target.files)}
      />
    </div>
  )
}
