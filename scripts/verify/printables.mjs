// Audits EVERY printable: what is on the page, that it is black ink on white,
// that nothing wraps mid-number, that the app's chrome doesn't print, and how
// many sheets of paper it is. Prints a table — a row that reads wrong here is
// a sheet that comes out of the printer wrong.
import pw from 'playwright-core'
const fs = await import('node:fs')
const SP = 'scripts/verify/out'
fs.mkdirSync(SP, { recursive: true })
const pageCount = (f) => (fs.readFileSync(f).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
const p = await ctx.newPage()
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }

await p.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints++ } })
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: 'flowood' }))
}, bd)
// seed the guides
await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' })
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500)

await p.goto('http://localhost:4180/#/printables', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
// The printable rows are the buttons that carry a printer icon.
const rows = await p.evaluate(() =>
  [...document.querySelectorAll('main button')]
    .filter((b) => b.querySelector('svg') && b.querySelectorAll('span').length >= 1)
    .map((b) => b.querySelector('span')?.textContent?.trim())
    .filter((t) => t && !/^(Attach|Add|Open|Print|Lunch|Dinner)$/.test(t) && !/,\s*[A-Z]{2}$/.test(t)))
// The two shipped PDFs print from a frame, not by rendering a sheet.
const PDFS = ['Application for Employment', 'Mini Mugs kids menu 2026']
console.log(`printables listed: ${rows.length}\n  ${rows.join(' · ')}\n`)
check('an empty guide is not offered as a sheet', !rows.includes('Beer order guide'), rows.filter((r) => /order guide/.test(r)).join(' · '))

for (const name of rows) {
  await p.emulateMedia({ media: 'screen' })
  await p.evaluate(() => { window.__prints = 0 })
  await p.locator('main button', { hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click()
  await p.waitForTimeout(600)
  const fired = await p.evaluate(() => window.__prints)
  if (PDFS.includes(name)) {
    const src = await p.evaluate(() => document.querySelector('iframe')?.getAttribute('src') || '')
    check(`${name.padEnd(28)} prints the shipped PDF`, /\.pdf$/i.test(src), src.slice(-40) || 'no frame src')
    continue
  }
  await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(350)
  const shot = await p.evaluate(() => {
    const sheet = document.querySelector('.prep-print')
    if (!sheet) return { none: true }
    const vis = (el) => !!el && el.getClientRects().length > 0
    const texts = [...sheet.querySelectorAll('td, th, li, p, span, div')].filter((e) => e.children.length === 0 && e.innerText?.trim())
    const inks = {}
    for (const e of texts.slice(0, 400)) {
      const c = getComputedStyle(e).color
      inks[c] = (inks[c] || 0) + 1
    }
    const overflow = [...sheet.querySelectorAll('td')].filter((td) => td.scrollWidth > td.clientWidth + 1).length
    const landscape = [...document.querySelectorAll('style')].some((s) => /landscape/.test(s.textContent))
    return {
      words: sheet.innerText.trim().replace(/\s+/g, ' ').length,
      head: sheet.innerText.trim().split('\n')[0]?.slice(0, 48),
      inks: Object.entries(inks).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c}×${n}`),
      rail: vis(document.querySelector('aside')),
      overflow,
      landscape,
      width: Math.round(sheet.getBoundingClientRect().width),
    }
  })
  const file = `${SP}/pr-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
  await p.pdf({ path: file, format: 'Letter', landscape: shot.landscape, printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
  const n = pageCount(file)
  const bad = []
  if (shot.none) bad.push('nothing rendered')
  else {
    if (!shot.words || shot.words < 40) bad.push(`almost empty (${shot.words} chars)`)
    if (shot.inks.some((i) => !/rgb\(0, 0, 0\)|rgb\(85, 85, 85\)|rgb\(51, 51, 51\)/.test(i))) bad.push(`ink ${shot.inks.join(' ')}`)
    if (shot.rail) bad.push('the app rail prints')
    if (shot.overflow > 0) bad.push(`${shot.overflow} cells clipped`)
    if (n === 0) bad.push('no pages')
    if (n > 16) bad.push(`${n} pages`)
  }
  console.log(`  ${bad.length ? 'FAIL' : 'ok  '} ${name.padEnd(28)} ${String(n).padStart(2)}p ${shot.landscape ? 'landscape' : 'portrait '} · ${shot.head ?? ''}`)
  if (bad.length) { failed++; console.log(`        ↳ ${bad.join(' · ')}`) }
  if (fired !== 1) { failed++; console.log(`        ↳ print() fired ${fired}×`) }
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await p.waitForTimeout(250)
}

// The Orders screen's own Print button prints the sheet, not the screen.
console.log('\nOrders → Print')
for (const shelf of ['Liquor', 'Produce', 'US Foods']) {
  await p.emulateMedia({ media: 'screen' })
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
  await p.locator('button', { hasText: new RegExp(`^${shelf}$`) }).first().click(); await p.waitForTimeout(500)
  await p.evaluate(() => { window.__prints = 0 })
  await p.locator('main button', { hasText: /Print/ }).first().click(); await p.waitForTimeout(700)
  await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(350)
  const r = await p.evaluate(() => {
    const sheet = document.querySelector('.prep-print')
    const vis = (el) => !!el && el.getClientRects().length > 0
    return {
      sheet: !!sheet,
      title: sheet?.innerText?.trim().split('\n')[0]?.slice(0, 44),
      boxes: sheet ? sheet.querySelectorAll('tbody td').length : 0,
      screenGrid: vis(document.querySelector('main [data-entrycol]')),
    }
  })
  const file = `${SP}/pr-orders-${shelf.replace(/\s/g, '')}.pdf`
  await p.pdf({ path: file, format: 'Letter', landscape: true, printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
  check(`${shelf}: prints the ruled sheet, not the screen`, r.sheet && r.boxes > 20 && !r.screenGrid, `${r.title} · ${r.boxes} cells · ${pageCount(file)}p`)
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')))
}
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} problem(s)` : '\nevery printable checks out')
process.exit(failed ? 1 : 0)
