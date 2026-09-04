import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const fs = await import('node:fs')
const pages = (f) => (fs.readFileSync(f).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } })
await p.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints++ } })
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
}, bd)
// seed the produce guide (Orders visit) — checklists need no visit: Printables falls back to DEFAULTS
await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.goto('http://localhost:4180/#/printables', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)

const rows = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.replace(/\n/g, ' · ')).filter((t) => /checklist/i.test(t)))
console.log('checklist rows:'); for (const r of rows) console.log('   ', r)

// AM + PM: tap, then measure what would print
for (const ph of ['AM', 'PM']) {
  await p.emulateMedia({ media: 'screen' })
  await p.locator('button', { hasText: new RegExp(`^${ph} checklist`) }).first().click(); await p.waitForTimeout(400)
  await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(250)
  const r = await p.evaluate(() => {
    const el = document.querySelector('.sheet-paper')
    const vis = (e) => !!e && e.getClientRects().length > 0
    const boxes = [...el.querySelectorAll('span.size-4')].filter(vis).length
    const sections = [...el.querySelectorAll('.border-b-2')].filter(vis).map((e) => e.textContent.trim()).filter((t) => !/checklist/i.test(t))
    const item = [...el.querySelectorAll('div')].find((d) => d.children.length === 1 && /Enter Building|Turn on TV|walk-in|Count/i.test(d.textContent))
    return { boxes, firstSections: sections.slice(0, 3), ink: item ? getComputedStyle(item).color : 'n/a', title: el.querySelector('.font-display')?.textContent }
  })
  console.log(`${ph} print → title "${r.title}" · ${r.boxes} checkboxes · sections ${JSON.stringify(r.firstSections)} · ink ${r.ink}`)
  await p.pdf({ path: `${SP}/${ph}.pdf`, format: 'Letter', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } })
  console.log(`   pages: ${pages(`${SP}/${ph}.pdf`)}`)
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await p.waitForTimeout(150)
}

// Produce: landscape and exactly one page, with generous margins to mimic a real printer
await p.emulateMedia({ media: 'screen' })
await p.locator('button', { hasText: /^Produce order guide/ }).first().click(); await p.waitForTimeout(400)
await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(250)
const pg = await p.evaluate(() => {
  const st = [...document.querySelectorAll('style')].map((s) => s.textContent).find((t) => /@page/.test(t) && /landscape/.test(t))
  return { landscapeRule: !!st, rows: document.querySelectorAll('.produce-guide tbody tr').length }
})
console.log('produce: @page landscape present:', pg.landscapeRule, '| rows:', pg.rows, '(expect 20)')
await p.pdf({ path: `${SP}/produce-land.pdf`, format: 'Letter', landscape: true, printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } })
console.log('   landscape @15mm margins → pages:', pages(`${SP}/produce-land.pdf`), '(must be 1)')
await p.pdf({ path: `${SP}/produce-land-tight.pdf`, format: 'Letter', landscape: true, printBackground: true, preferCSSPageSize: true })
console.log('   using the sheet\'s own @page  → pages:', pages(`${SP}/produce-land-tight.pdf`), '(must be 1)')
await b.close()
