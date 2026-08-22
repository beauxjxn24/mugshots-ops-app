// A PDF, rendered into the app.
//
// Handing a phone a link to a .pdf works on a laptop and is a mess on a shift:
// iOS opens it in a separate viewer, a home-screen install loses the app
// chrome entirely, and getting back means finding your way back. So the pages
// are drawn here, at the width of the screen, and the back button is still the
// app's.
//
// pdf.js is already in this app for reading invoices, self-hosted worker and
// all. The two font options below came out of that work and are not optional:
// without them, pages using non-embedded fonts paint blank.
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { Loader2, TriangleAlert } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdfjs/worker-polyfilled.mjs`

export function PdfPages({ url, className = '' }: { url: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    const box = host.current
    if (!box) return
    box.replaceChildren()
    setState('loading')
    setDone(0)

    ;(async () => {
      try {
        const pdf = await pdfjs.getDocument({
          url,
          standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`,
          disableFontFace: true,
        }).promise
        if (cancelled) return
        setTotal(pdf.numPages)

        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          // Fit the width of whatever is holding this, then draw at the
          // device's real pixel density so the small print stays readable —
          // these pages are dense, and a blurry build test is useless.
          const width = box.clientWidth || 360
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          const viewport = page.getViewport({ scale: (width / base.width) * dpr })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.className = 'mb-3 rounded-xl border border-black/10 bg-white shadow-sm'
          canvas.setAttribute('aria-label', `Page ${n} of ${pdf.numPages}`)
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          if (cancelled) return
          box.append(canvas)
          setDone(n)
          setState('ready')
        }
      } catch {
        if (!cancelled) setState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className={className}>
      {state === 'error' && (
        <div className="flex items-start gap-2 rounded-xl bg-warn/[0.08] px-3 py-2.5 text-sm">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          <span className="text-muted">
            Couldn’t open this one.{' '}
            <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
              Open it in the browser instead
            </a>
            .
          </span>
        </div>
      )}
      {state === 'loading' && (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Opening…
        </p>
      )}
      <div ref={host} />
      {/* Pages appear as they finish rather than after the whole file, so a
          nine-page packet is readable while the rest is still drawing. */}
      {state === 'ready' && total > 0 && done < total && (
        <p className="flex items-center gap-2 px-1 py-3 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" /> page {done + 1} of {total}…
        </p>
      )}
    </div>
  )
}
