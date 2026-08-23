// The Drop Box — one place to put a file, reachable from every screen.
//
// Imports was a row nine deep in a menu, which is a fine place for a screen
// nobody has to think of and a bad place for the one thing that has to happen
// before the app knows anything. A report that never got imported is a
// dashboard full of last week.
//
// Two halves, and the second is the one that matters:
//
//  • The pill. Always in the rail, above the menu rather than inside it, so
//    it's somewhere to aim at rather than something to find. Tapping it opens
//    the file picker — a tablet has no drag worth the name, and the pill has to
//    work there too.
//
//  • The whole window. Drag a file anywhere in the app and the app says catch:
//    a full-screen target, and the drop lands on Imports with the file already
//    being read. You never have to find the screen at all.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CloudUpload } from 'lucide-react'
import { stageFiles } from '../lib/dropstage'

/**
 * The window-wide catcher. Mounted once by the shell.
 *
 * Not attached on Imports itself: that screen has its own drop path, and two
 * handlers on one drop reads every file twice.
 */
export function DropCatcher() {
  const navigate = useNavigate()
  const loc = useLocation()
  const [over, setOver] = useState(false)
  const here = loc.pathname === '/imports'

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout>
    // Always swallowed, on every screen: a file dropped on a browser that isn't
    // listening navigates away to open it, which looks like the app crashing.
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
      if (here) return
      // dragover repeats while the file hovers; a short timer clears the
      // highlight once the events stop, so there's no flicker and nothing
      // sticks on screen after the drag leaves the window.
      setOver(true)
      clearTimeout(hide)
      hide = setTimeout(() => setOver(false), 130)
    }
    const onDrop = (e: DragEvent) => {
      clearTimeout(hide)
      setOver(false)
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      if (here) return
      stageFiles(e.dataTransfer.files)
      navigate('/imports')
    }
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      clearTimeout(hide)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [navigate, here])

  if (!over) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[120] grid place-items-center bg-navy/60 backdrop-blur-sm">
      <div className="mx-4 flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-brand bg-white px-8 py-7 text-center shadow-2xl">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand text-white">
          <CloudUpload size={26} />
        </span>
        <span className="font-display text-lg font-semibold text-ink">Drop it anywhere</span>
        <span className="max-w-[24rem] text-xs leading-snug text-muted text-pretty">
          Sales, labor, PMIX, an invoice, a count sheet, a catering order, the employee export — the
          app works out which and shows you before anything lands.
        </span>
      </div>
    </div>
  )
}

/**
 * The pill in the rail.
 *
 * `dark` is the rail and the drawer, which are navy; the light one is there for
 * anywhere else it gets used later.
 */
export function DropBoxPill({ onNavigate, dark = true }: { onNavigate?: () => void; dark?: boolean }) {
  const navigate = useNavigate()
  const file = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const take = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    stageFiles(files)
    onNavigate?.()
    navigate('/imports')
  }

  return (
    <>
      <button
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
        onClick={() => file.current?.click()}
        title="Drop a file here, or tap to pick one — it lands on Imports"
        className={`mb-3 flex w-full items-center gap-2.5 rounded-xl border-2 border-dashed px-2.5 py-2.5 text-left transition-colors ${
          dark
            ? over
              ? 'border-brand bg-brand/20 text-white'
              : 'border-white/20 bg-white/[0.04] text-white/75 hover:border-brand/60 hover:bg-brand/10 hover:text-white'
            : over
              ? 'border-brand bg-brand/10 text-ink'
              : 'border-black/15 bg-black/[0.02] text-ink hover:border-brand/50'
        }`}
      >
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
            over ? 'bg-brand text-white' : dark ? 'bg-brand/20 text-brand' : 'bg-brand/10 text-brand-600'
          }`}
        >
          <CloudUpload size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold leading-tight">Drop Box</span>
          <span className={`block text-[10px] leading-tight ${dark ? 'text-white/45' : 'text-muted'}`}>
            reports · invoices · orders
          </span>
        </span>
      </button>
      <input
        ref={file}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => take(e.target.files)}
      />
    </>
  )
}
