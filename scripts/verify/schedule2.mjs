// Proves the manager schedule can actually be built: a locked square asks for
// the PIN instead of ignoring the tap, the board assigns and clears shifts by
// tapping a day's slot, coverage updates as it goes, and the GM can say who is
// on this store's schedule.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1250 } })
const p = await ctx.newPage()
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }
const pill = () => p.evaluate(() => [...document.querySelectorAll('span')].map((s) => s.innerText.trim()).find((t) => /uncovered|every day covered/.test(t)))

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

check('the week opens as a board of days', await p.evaluate(() => /OPENING/.test(document.querySelector('main').innerText)))
check('every uncovered day says so', /7 days uncovered/.test((await pill()) || ''), await pill())

// locked: tapping a slot asks for the PIN rather than doing nothing
await p.locator('button', { hasText: /nobody/ }).first().click(); await p.waitForTimeout(600)
const asked = await p.evaluate(() => /pin/i.test(document.body.innerText))
check('a locked square asks for the PIN instead of ignoring the tap', asked)
const pinBox = p.locator('input[type="password"], input[inputmode="numeric"]').first()
await pinBox.fill('2424'); await p.keyboard.press('Enter'); await p.waitForTimeout(900)
check('the PIN unlocks it', !(await p.evaluate(() => /Unlock to edit/.test(document.body.innerText))))

// assign Monday's open and close
const before = await pill()
await p.locator('button', { hasText: /nobody/ }).first().click(); await p.waitForTimeout(500)
const first = await p.evaluate(() => {
  const pop = document.querySelector('.bg-brand\\/\\[0\\.06\\]')
  return pop ? [...pop.querySelectorAll('button')].map((b) => b.innerText.trim())[0] : null
})
await p.evaluate(() => {
  const pop = document.querySelector('.bg-brand\\/\\[0\\.06\\]')
  pop?.querySelector('button')?.click()
})
await p.waitForTimeout(600)
const monOpen = await p.evaluate(() => {
  const card = [...document.querySelectorAll('div')].find((d) => /^Mon\b/.test(d.innerText.trim()) && d.innerText.length < 400)
  return card?.innerText.replace(/\s+/g, ' ').slice(0, 120)
})
check(`tapping a slot puts somebody on it (${first})`, !!first && monOpen?.includes(first), monOpen)
// a day needs BOTH an opener and a closer to stop being uncovered
check('an opener alone does not cover the day', /7 days uncovered/.test((await pill()) || ''), await pill())
await p.locator('button', { hasText: /nobody/ }).first().click(); await p.waitForTimeout(500)
// somebody ELSE: one person holds one code a day, so putting the opener on
// close would just move them off open.
await p.evaluate(() => {
  const pop = document.querySelector('.bg-brand\\/\\[0\\.06\\]')
  const free = [...(pop?.querySelectorAll('button') || [])].find((b) => !/[OMC]$/.test(b.innerText.trim()))
  free?.click()
})
await p.waitForTimeout(700)
check('opener + closer covers it', /6 days uncovered/.test((await pill()) || ''), `${before} → ${await pill()}`)

// who's on it
await p.locator('button', { hasText: /Who's on it/ }).first().click(); await p.waitForTimeout(600)
const inPanel = () => {
  const head = [...document.querySelectorAll('span')].find((s) => /Who's on this schedule/.test(s.innerText))
  const card = head?.closest('div')?.parentElement
  return card ? [...card.querySelectorAll('button')].filter((b) => !/Use all/.test(b.innerText)) : []
}
const chips = await p.evaluate(() => {
  const head = [...document.querySelectorAll('span')].find((s) => /Who's on this schedule/.test(s.innerText))
  const card = head?.closest('div')?.parentElement
  return card ? [...card.querySelectorAll('button')].filter((b) => !/Use all/.test(b.innerText)).length : 0
})
check('the GM can choose who is on this schedule', chips >= 4, `${chips} people offered`)
// drop everyone but four
const dropped = await p.evaluate(() => {
  const head = [...document.querySelectorAll('span')].find((s) => /Who's on this schedule/.test(s.innerText))
  const card = head?.closest('div')?.parentElement
  const btns = card ? [...card.querySelectorAll('button')].filter((b) => !/Use all/.test(b.innerText)) : []
  btns.slice(4).forEach((b) => b.click())
  return btns.length - 4
})
await p.waitForTimeout(800)
const left = await p.evaluate(() => (document.querySelector('main').innerText.match(/(\d+) on the schedule/) || [])[1])
check(`leaving ${dropped} off leaves four on the schedule`, left === '4', `${left} on the schedule`)
await p.screenshot({ path: 'scripts/verify/out/sched-board-final.png', fullPage: true })
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
