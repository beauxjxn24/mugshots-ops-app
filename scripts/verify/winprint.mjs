import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1180, height: 900 } })
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
}, bd)
await p.goto('http://localhost:4180/#/checklists', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.locator('button', { hasText: /^AM/ }).first().click(); await p.waitForTimeout(400)

const lum = (rgb) => { const [r, g, bl] = rgb.match(/\d+/g).slice(0, 3).map(Number).map((v) => v / 255)
  .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * bl }
const onWhite = (rgb) => ((1.05) / (lum(rgb) + 0.05)).toFixed(2)

await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300)
const r = await p.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  const item = [...d.querySelectorAll('button span')].find((s) => /Enter Building/.test(s.textContent))
  const vis0 = (el) => !!el && el.getClientRects().length > 0
  const heading = [...d.querySelectorAll('.font-display')].find((h) => /AM checklist/i.test(h.textContent) && vis0(h))
  // getClientRects is empty when the element OR any ancestor is display:none — computed display isn't.
  const vis = (el) => !!el && el.getClientRects().length > 0
  const pageBehind = [...document.querySelectorAll('main h1, main .font-display')].filter((h) => /^Checklists$/.test(h.textContent.trim()) && vis(h)).length
  const banner = [...document.querySelectorAll('main *')].filter((e) => /lists still owed/i.test(e.textContent || '') && e.children.length === 0 && vis(e)).length
  const doors = [...document.querySelectorAll('main button')].filter((x) => /tap to open/i.test(x.textContent) && vis(x)).length
  return {
    itemInk: getComputedStyle(item).color, headingInk: heading ? getComputedStyle(heading).color : 'none',
    overlayBg: getComputedStyle(d).backgroundColor, position: getComputedStyle(d).position,
    pageTitleBehindPrints: pageBehind, bannerPrints: banner, doorsPrint: doors,
    screenHeaderHidden: !vis(d.querySelector('.bg-navy')),
  }
})
console.log('window under print media:')
console.log('  item ink      :', r.itemInk, '=', onWhite(r.itemInk) + ':1 on white')
console.log('  heading ink   :', r.headingInk, r.headingInk !== 'none' ? '= ' + onWhite(r.headingInk) + ':1' : '')
console.log('  overlay bg    :', r.overlayBg, '| position:', r.position)
console.log('  page behind   : title', r.pageTitleBehindPrints, '| banner', r.bannerPrints, '| doors', r.doorsPrint, '(all should be 0)')
console.log('  screen hdr hid:', r.screenHeaderHidden)
await p.pdf({ path: SP + '/win.pdf', format: 'Letter', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
const fs = await import('node:fs')
console.log('  pdf pages     :', (fs.readFileSync(SP + '/win.pdf').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length)
await b.close()
