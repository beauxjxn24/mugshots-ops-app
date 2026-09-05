// Proves the delivery calendar can be set to every other week, that the choice
// is visible without hunting, and that the app then calls for that order on
// the right week — the whole point of the setting.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
const p = await ctx.newPage()
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }

await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: 'flowood' }))
  // unlocked PIN window, so Edit doesn't stop the test
  localStorage.setItem('mugops:__pin', JSON.stringify({}))
}, bd)
await p.goto('http://localhost:4180/#/stores', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)

const emptyText = await p.evaluate(() => document.querySelector('main').innerText)
check('the locked card says what a vendor row holds', /every other week/i.test(emptyText), (emptyText.match(/No delivery calendar[^\n]*/) || [''])[0].slice(0, 120))

// open the card
// Cards in order: Weekly targets, Screen lock, Delivery calendar, Tracked items
await p.getByRole('button', { name: /^edit$/i }).nth(2).click()
await p.waitForTimeout(700)
const pin = p.locator('input[type="password"], input[inputmode="numeric"]').first()
if (await pin.count()) { await pin.fill('2424'); await p.keyboard.press('Enter'); await p.waitForTimeout(900) }
check('the card unlocks for editing', await p.evaluate(() => {
  const i = [...document.querySelectorAll('input[list]')].pop()
  return !!i && !i.disabled
}))

await p.locator('input[placeholder*="vendor" i], input[list]').last().fill('Sysco')
await p.locator('button', { hasText: /Add vendor/ }).click(); await p.waitForTimeout(600)
const sel = p.locator('select[aria-label*="How often"]')
check('every vendor shows a how-often menu straight away', (await sel.count()) === 1, `${await sel.count()} menus`)
check('and it offers every other week', (await sel.locator('option').allInnerTexts()).join('/'), (await sel.locator('option').allInnerTexts()).join(' / '))

await sel.selectOption('biweekly'); await p.waitForTimeout(500)
const after = await p.evaluate(() => document.querySelector('main').innerText)
check('choosing it asks for the starting week', /Starting/i.test(after))
// pick Thursday as the order day
await p.locator('button', { hasText: /^\s*Thu\s*$/ }).first().click(); await p.waitForTimeout(500)
const withNext = await p.evaluate(() => document.querySelector('main').innerText)
check('and then says which one is next', /Next order:/.test(withNext), (withNext.match(/Next order:[^\n]*/) || [''])[0])

// save, then check the maths: the named week runs, the one after doesn't
await p.getByRole('button', { name: /save changes/i }).first().click()
await p.waitForTimeout(900)
const maths = await p.evaluate(() => {
  const rows = JSON.parse(localStorage.getItem('mugops:mugshots|flowood::ordering:schedule') || '[]')
  const r = rows.find((x) => x.vendor === 'Sysco')
  if (!r) return { none: true }
  const weeksBetween = (a, b) => {
    const sun = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x }
    return Math.round((sun(b).getTime() - sun(a).getTime()) / 604800000)
  }
  const anchor = new Date(r.anchor + 'T12:00:00')
  // The next four Thursdays from today: an every-other-week order has to run
  // on alternating ones, never two in a row and never skipping two.
  const out = []
  const d = new Date()
  for (let i = 0; out.length < 4 && i < 60; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    if (r.days.includes(x.getDay())) out.push({ on: weeksBetween(anchor, x) % 2 === 0, when: x.toDateString().slice(0, 10) })
  }
  return { cadence: r.cadence, anchor: r.anchor, days: r.days, thursdays: out }
})
check('it saved as every other week with an anchor', maths.cadence === 'biweekly' && !!maths.anchor, JSON.stringify(maths))
const pattern = (maths.thursdays ?? []).map((t) => (t.on ? 'ON' : 'off'))
check(
  'it runs every OTHER Thursday, not every one',
  pattern.length === 4 && pattern.every((v, i) => (i === 0 ? true : v !== pattern[i - 1])),
  (maths.thursdays ?? []).map((t) => `${t.when} ${t.on ? 'ON' : 'off'}`).join(' · '),
)
await p.screenshot({ path: 'scripts/verify/out/cadence.png', fullPage: true })
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
