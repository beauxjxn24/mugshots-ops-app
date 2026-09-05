// A PDF's pages as images, so the app can PRINT the caterer's own page.
//
// Chrome will print a PDF out of an <iframe>; an iPad will not — it won't even
// show one, and `contentWindow.print()` on a PDF viewer is blocked or silently
// does nothing in several browsers. The kitchen's tablets are exactly where
// that fails, so the printed order stops being the order.
//
// Rendering each page with pdf.js and printing the images works the same
// everywhere: what comes out of the printer is the caterer's page, pixel for
// pixel, not our reading of it.

import * as pdfjs from 'pdfjs-dist'

// Same worker and font setup the reader uses — without standardFontDataUrl and
// disableFontFace, ezCater's non-embedded digit font renders as blanks, which
// is how you get a printed order with no quantities on it.
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdfjs/worker-polyfilled.mjs`

/**
 * Render a PDF blob's pages to PNG data URLs.
 *
 * `scale: 2` is about 150 DPI on US Letter — crisp on paper, and small enough
 * that a three-page order doesn't stall a tablet. Throws if the file isn't a
 * readable PDF; callers fall back to their own sheet.
 */
export async function renderPdfPages(blob: Blob, maxPages = 10, scale = 2): Promise<string[]> {
  const data = new Uint8Array(await blob.arrayBuffer())
  const pdf = await pdfjs.getDocument({
    data,
    standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`,
    disableFontFace: true,
  }).promise
  const out: string[] = []
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) break
    // Paper is white; a transparent PNG prints as whatever is behind it.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    out.push(canvas.toDataURL('image/png'))
  }
  return out
}

/**
 * Browsers that won't show or print a PDF inside a frame: every iOS browser
 * (all WebKit under the hood) and desktop Safari.
 */
export function framePdfIsReliable(ua = navigator.userAgent): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return false
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return false
  return true
}
