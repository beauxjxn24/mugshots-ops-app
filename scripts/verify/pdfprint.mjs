import pw from 'playwright-core'
const { chromium } = pw
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } })

// Record who print() was called ON — parent vs frame. That is the whole bug:
// a display:none frame fell through and printed the (empty) parent.
await p.addInitScript(() => {
  window.__parentPrints = 0
  const real = window.print.bind(window)
  window.print = () => { window.__parentPrints++; return real && undefined }
})
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
}, bd)
await p.goto('http://localhost:4180/#/printables', { waitUntil: 'networkidle' })
await p.waitForTimeout(1000)

const box = await p.evaluate(() => {
  const f = document.querySelector('iframe[title="Printing"]')
  const cs = getComputedStyle(f)
  const r = f.getBoundingClientRect()
  return { display: cs.display, w: Math.round(r.width), h: Math.round(r.height), opacity: cs.opacity, left: Math.round(r.left) }
})
console.log('frame:', box)
console.log('  laid out (the fix):', box.display !== 'none' && box.w > 100 && box.h > 100)
console.log('  invisible:', box.opacity === '0' && box.left < -1000)

// tap the PDF row and watch the frame actually load the document
await p.locator('button', { hasText: 'Mini Mugs kids menu 2026' }).first().click()
await p.waitForTimeout(2500)
const after = await p.evaluate(() => {
  const f = document.querySelector('iframe[title="Printing"]')
  return { src: f.getAttribute('src'), parentPrints: window.__parentPrints }
})
console.log('after tap:', after)
console.log('  frame pointed at the pdf:', /mini-mugs-2026\.pdf$/.test(after.src || ''))
console.log('  did NOT print the empty parent:', after.parentPrints === 0)
await b.close()
