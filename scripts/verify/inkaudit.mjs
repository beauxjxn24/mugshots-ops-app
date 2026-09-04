import pw from 'playwright-core'
const { chromium } = pw
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1280, height: 1100 } })
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
}, bd)
// give the checklists real content so the sheet isn't empty
await p.goto('http://localhost:4180/#/checklists', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
await p.goto('http://localhost:4180/#/printables', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)

const lum = (rgb) => {
  const [r, g, bl] = rgb.match(/\d+/g).slice(0, 3).map(Number).map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}
const contrastOnWhite = (rgb) => ((1.05) / (lum(rgb) + 0.05)).toFixed(2)

// Row names as Printables shows them today (the checklists became AM/PM; a
// row's button also carries its note — "34 tasks" — so match the start only).
for (const sheet of ['AM checklist', 'Bar sidework', 'Inventory count', 'Prep card', 'Produce order guide', 'US Foods order guide']) {
  await p.emulateMedia({ media: 'screen' })
  await p.locator('button', { hasText: new RegExp(`^${sheet}`) }).first().click()
  await p.waitForTimeout(500)
  await p.emulateMedia({ media: 'print' })
  await p.waitForTimeout(300)
  const r = await p.evaluate(() => {
    // The print sheet is the .sheet-paper block (the old preview card with
    // print:shadow-none is gone — Printables no longer previews).
    const card = document.querySelector('.prep-print.sheet-paper')
      || [...document.querySelectorAll('div')].find((d) => d.className.includes('print:shadow-none'))
    if (!card) return null
    const texts = [...card.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim())
    const colors = {}
    for (const e of texts.slice(0, 40)) {
      const c = getComputedStyle(e).color
      colors[c] = (colors[c] || 0) + 1
    }
    return { sample: texts.length, colors }
  })
  if (!r) { console.log(sheet.padEnd(22), 'no card'); continue }
  const worst = Object.entries(r.colors).sort((a, b) => b[1] - a[1])
  const line = worst.map(([c, n]) => `${c} x${n} = ${contrastOnWhite(c)}:1`).join('  |  ')
  console.log(sheet.padEnd(22), line)
}
await b.close()
