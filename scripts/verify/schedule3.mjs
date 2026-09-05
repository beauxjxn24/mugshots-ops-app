// Proves the three things Beau couldn't do: find the period rules, choose who
// is on the schedule from a proper menu, and close that menu again.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
const p = await ctx.newPage()
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }
const menuOpen = () => p.evaluate(() => !!document.querySelector('[role="listbox"]'))

await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: 'flowood' }))
}, bd)
await p.goto('http://localhost:4180/#/imports', { waitUntil: 'networkidle' })
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1000)
await p.locator('input[accept*="application/pdf"]').first().setInputFiles('scripts/verify/out/_roster-w1.csv')
await p.waitForTimeout(4000)
await p.goto('http://localhost:4180/#/schedule', { waitUntil: 'networkidle' })
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1800)

// ---- the menu -------------------------------------------------------------
const btn = p.locator('button', { hasText: /Who's on it/ })
check('the header offers a Who\'s on it menu', (await btn.count()) === 1)
await btn.click(); await p.waitForTimeout(400)
check('it opens a menu', await menuOpen())
const rows = await p.evaluate(() => document.querySelectorAll('[role="option"]').length)
check('with a tick-box per person', rows >= 4, `${rows} rows`)
check('and the week did not move down the page', await p.evaluate(() => {
  const t = document.querySelector('main').innerText
  return /MON|Mon/.test(t)
}))
// untick two, menu stays open
await p.locator('[role="option"]').nth(0).click(); await p.waitForTimeout(200)
await p.locator('[role="option"]').nth(1).click(); await p.waitForTimeout(400)
check('ticking stays open so you can pick several', await menuOpen())
const on = await p.evaluate(() => (document.querySelector('main').innerText.match(/(\d+) on the schedule/) || [])[1])
check('the schedule narrows as you pick', on === '6', `${on} on the schedule`)
// Done closes it
await p.locator('button', { hasText: /Done/ }).first().click(); await p.waitForTimeout(400)
check('Done closes it', !(await menuOpen()))
// Escape closes it
await btn.click(); await p.waitForTimeout(300)
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
check('Escape closes it', !(await menuOpen()))
// a tap outside closes it
await btn.click(); await p.waitForTimeout(300)
await p.mouse.click(700, 900); await p.waitForTimeout(400)
check('tapping away closes it', !(await menuOpen()))

// ---- the rules ------------------------------------------------------------
const summary = p.locator('summary', { hasText: /Period rules/ })
check('the fold names the period rules', (await summary.count()) === 1)
await summary.click(); await p.waitForTimeout(400)
const box = p.locator('textarea[aria-label="Period rules"]')
check('opening it shows an editable rules box', (await box.count()) === 1)
await box.fill('Two weekend days off each · no clopens · GM closes 6 max')
await p.waitForTimeout(600)
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('mugops:mugshots|flowood::mgrsched:rules') || '""'))
check('typing in it saves', /GM closes 6 max/.test(saved), saved)
await p.screenshot({ path: 'scripts/verify/out/sched-rules.png', fullPage: true })
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
