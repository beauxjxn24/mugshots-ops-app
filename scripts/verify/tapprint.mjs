import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1280, height: 1050 } })

// window.print() has no dialog in headless — record the calls instead.
await p.addInitScript(() => {
  window.__prints = 0
  window.print = () => { window.__prints++ }
})
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
}, bd)
await p.goto('http://localhost:4180/#/checklists', { waitUntil: 'networkidle' }); await p.waitForTimeout(1300)
await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.goto('http://localhost:4180/#/printables', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)

const names = await p.evaluate(() =>
  [...document.querySelectorAll('button')].map((b) => b.querySelector('span')?.textContent?.trim()).filter(Boolean))
console.log('rows on the page:')
for (const n of names) console.log('   ', n)

console.log('\nno preview on screen:', (await p.locator('.sheet-paper').count()) === 0)
console.log('attach panel is shut:', await p.evaluate(() => !document.querySelector('details')?.open))

// tap a name → print fires, and the right sheet is what would go to paper
for (const name of ['PM checklist', 'Bar sidework', 'Produce order guide', 'US Foods order guide']) {
  await p.evaluate(() => { window.__prints = 0 })
  await p.locator('button', { hasText: new RegExp(`^${name}`) }).first().click()
  await p.waitForTimeout(500)
  const n = await p.evaluate(() => window.__prints)
  await p.emulateMedia({ media: 'print' })
  await p.waitForTimeout(250)
  const printed = await p.evaluate(() => {
    const el = document.querySelector('.sheet-paper')
    return el ? { visible: getComputedStyle(el).display !== 'none', text: el.innerText.slice(0, 60).replace(/\n/g, ' / ') } : null
  })
  await p.emulateMedia({ media: 'screen' })
  console.log(`\ntap "${name}" → print() called ${n}x`)
  console.log('   what prints:', printed)
  // reset the job the way afterprint would
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await p.waitForTimeout(200)
}
await p.screenshot({ path: SP + '/tapprint.png' })
await b.close()
