// Proves: an ezCater PDF dropped on Imports keeps its original file, the
// booking it creates points at that file, and opening the order shows the
// caterer's own page — with Print aimed at the PDF, not at our reading of it.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true })
const p = await ctx.newPage()
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }
p.on('console', (m) => { if (m.type() === 'error') console.log('   [console error]', m.text().slice(0, 140)) })

await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: 'pearl' }))
}, bd)

// ---- drop the order on Imports -------------------------------------------
await p.goto('http://localhost:4180/#/imports', { waitUntil: 'networkidle' })
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
await p.locator('input[accept*="application/pdf"]').first().setInputFiles('scripts/verify/out/_ezcater-test.pdf')
await p.waitForTimeout(6000)
const read = await p.evaluate(() => document.body.innerText.slice(0, 900).replace(/\n+/g, ' | '))
check('the drop was read as a catering order', /catering|ezCater|Add to Catering|Savell/i.test(read), read.slice(0, 200))
// add it to Catering
const addBtn = p.locator('button', { hasText: /Add to Catering/i })
if (await addBtn.count()) { await addBtn.first().click(); await p.waitForTimeout(1200) }
const stored = await p.evaluate(async () => {
  const key = 'mugops:mugshots|pearl::catering:bookings'
  const bs = JSON.parse(localStorage.getItem(key) || '[]')
  const bk = bs[bs.length - 1]
  // is the original file really in IndexedDB?
  const rec = await new Promise((res) => {
    const r = indexedDB.open('mugops-docs', 1)
    r.onsuccess = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('docs')) return res(null)
      const g = db.transaction('docs').objectStore('docs').get(bk?.docId)
      g.onsuccess = () => res(g.result ? { name: g.result.name, type: g.result.type, size: g.result.blob?.size } : null)
      g.onerror = () => res(null)
    }
    r.onerror = () => res(null)
  })
  return { count: bs.length, docId: bk?.docId, source: bk?.source, orderNo: bk?.orderNo, items: bk?.items?.length, rec }
})
check('a booking was created', stored.count === 1, JSON.stringify({ source: stored.source, orderNo: stored.orderNo, items: stored.items }))
check('the booking points at the imported file', !!stored.docId, String(stored.docId))
check('the original PDF is in IndexedDB', !!stored.rec && stored.rec.type === 'application/pdf', JSON.stringify(stored.rec))

// ---- open it on Catering --------------------------------------------------
await p.goto('http://localhost:4180/#/catering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
const open = p.locator('button', { hasText: /Order/ })
check('the order row offers Order', (await open.count()) > 0, `${await open.count()}`)
await open.first().click(); await p.waitForTimeout(2500)
const dialog = await p.evaluate(() => {
  const frames = [...document.querySelectorAll('.order-panel iframe')]
  const f = frames[0]
  return {
    dialog: !!document.querySelector('.order-panel'),
    frames: frames.length,
    src: f?.src?.slice(0, 12),
    buttons: [...document.querySelectorAll('.order-panel button')].map((x) => x.innerText.trim()).filter(Boolean),
    saysFallback: /our reading|app's own sheet|not on this device/i.test(document.querySelector('.order-panel')?.innerText || ''),
  }
})
check('the order opens as a window', dialog.dialog)
check('the caterer\'s PDF is what fills it', dialog.frames === 1 && dialog.src === 'blob:http://', JSON.stringify(dialog))
check('no "PDF is not here" fallback', !dialog.saysFallback)
await p.screenshot({ path: 'scripts/verify/out/ezcater-order.png' })

// the caterer's pages, rendered, are what a print job contains
await p.waitForTimeout(4000)
const rendered = await p.evaluate(() => {
  const blk = document.querySelector('.order-pdf-print')
  const imgs = [...(blk?.querySelectorAll('img') || [])]
  return { block: !!blk, imgs: imgs.length, src: imgs[0]?.src?.slice(0, 22), w: imgs[0]?.naturalWidth, h: imgs[0]?.naturalHeight }
})
check("the caterer's pages are rendered for the printer", rendered.imgs >= 1 && rendered.w > 600, JSON.stringify(rendered))
await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(400)
const onPaper = await p.evaluate(() => {
  const vis = (el) => !!el && el.getClientRects().length > 0
  return {
    pages: [...document.querySelectorAll('.order-pdf-print img')].filter(vis).length,
    frame: vis(document.querySelector('.order-panel iframe')),
    ourSheet: vis(document.querySelector('.order-print:not(.order-pdf-print)')),
    root: vis(document.querySelector('#root')),
  }
})
check('on paper: the PDF pages, and only those', onPaper.pages >= 1 && !onPaper.frame && !onPaper.ourSheet, JSON.stringify(onPaper))
await p.pdf({ path: 'scripts/verify/out/ezcater-print.pdf', format: 'Letter', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
await p.emulateMedia({ media: 'screen' }); await p.waitForTimeout(300)

// what does Print actually target?
const printed = await p.evaluate(async () => {
  const out = { framePrint: 0, windowPrint: 0, opened: 0 }
  const f = document.querySelector('.order-panel iframe')
  window.print = () => { out.windowPrint++ }
  const openOrig = window.open
  window.open = (...a) => { out.opened++; return null }
  try { if (f?.contentWindow) f.contentWindow.print = () => { out.framePrint++ } } catch { out.frameBlocked = true }
  const btn = [...document.querySelectorAll('.order-panel button')].find((b) => /print/i.test(b.innerText))
  btn?.click()
  await new Promise((s) => setTimeout(s, 800))
  window.open = openOrig
  return out
})
check('Print prints the rendered pages, not our sheet', printed.windowPrint === 1 && printed.framePrint === 0, JSON.stringify(printed))
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
