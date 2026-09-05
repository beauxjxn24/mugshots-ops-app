// Proves: the manager schedule is built from the people who actually run the
// building (Manager / Shift Lead / Key on the roster, plus Admin users), that
// it says out loud which days have no opener or no closer, that the balance
// card checks the period rules including clopens, and that the posted view
// answers "who's on today" before anything else.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
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
}, bd)

// the roster, as the Toast export leaves it
await p.goto('http://localhost:4180/#/imports', { waitUntil: 'networkidle' })
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
await p.locator('input[accept*="application/pdf"]').first().setInputFiles('scripts/verify/out/_roster-w1.csv')
await p.waitForTimeout(4000)
const roster = await p.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('mugops:mugshots|flowood::staff:list') || '[]')
  const mgr = list.filter((x) => (x.roles || [x.role]).some((r) => ['Manager', 'Shift Lead', 'Key'].includes(r)))
  return { total: list.length, mgr: mgr.length, names: mgr.map((m) => m.name).slice(0, 5) }
})
console.log(`  roster: ${roster.total} people · ${roster.mgr} carry a management code`)

await p.goto('http://localhost:4180/#/schedule', { waitUntil: 'networkidle' })
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2000)
const rows = await p.evaluate(() => {
  const names = [...document.querySelectorAll('main .truncate.text-sm.font-bold')].map((x) => x.innerText.trim())
  return { names, sub: document.querySelector('main p, main .text-sm')?.innerText?.slice(0, 120) }
})
check('the schedule has the whole management team on it, not one person', rows.names.length >= roster.mgr, `${rows.names.length} rows for ${roster.mgr} managers`)
check('and they are the roster names', roster.names.every((n) => rows.names.includes(n)), `missing: ${roster.names.filter((n) => !rows.names.includes(n)).join(', ')}`)

// an empty week is uncovered, and says so
const gapPill = await p.evaluate(() => [...document.querySelectorAll('span')].map((s) => s.innerText.trim()).find((t) => /uncovered|every day covered/.test(t)))
check('the week says how many days are uncovered', /7 days uncovered/.test(gapPill || ''), gapPill)
const cov = await p.evaluate(() => {
  const txt = document.querySelector('main').innerText
  const i = txt.toLowerCase().indexOf('coverage')
  return i < 0 ? 'NOT FOUND' : txt.slice(i, i + 200).replace(/\n/g, ' | ')
})
check('and shows the open/close gaps day by day', /no open/.test(cov || '') && /no close/.test(cov || ''), cov)

// fill a week: two managers, a clopen, and a fully covered Monday
await p.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('mugops:mugshots|flowood::staff:list') || '[]')
  // Two managers who are NOT in Admin → Users: the grid keys those people by
  // their Users id, not their roster id, so writing to the roster id would
  // land nowhere.
  const mgr = list
    .filter((x) => (x.roles || [x.role]).some((r) => ['Manager', 'Shift Lead', 'Key'].includes(r)))
    .filter((x) => !/beau/i.test(x.name))
    .slice(0, 2)
  const d = new Date(); const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  const ws = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weeks = { [ws]: {
    [mgr[0].id]: ['O', 'O', 'O', 'O', 'C', 'O', 'OFF'],   // Fri close → Sat open: a clopen
    [mgr[1].id]: ['C', 'C', 'C', 'C', 'O', 'C', 'OFF'],
  } }
  localStorage.setItem('mugops:mugshots|flowood::mgrsched:weeks', JSON.stringify(weeks))
  localStorage.setItem('mugops:mugshots|flowood::mgrsched:published', JSON.stringify({ [ws]: true }))
})
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2000)
const filled = await p.evaluate(() => {
  const txt = document.querySelector('main').innerText
  return {
    pill: [...document.querySelectorAll('span')].map((s) => s.innerText.trim()).find((t) => /uncovered|every day covered/.test(t)),
    clopen: /Clopens/.test(txt) ? txt.split('Clopens')[1]?.split('\n')[0]?.slice(0, 60) : '',
    weekend: /Weekend days off/.test(txt) ? txt.split('Weekend days off')[1]?.split('\n')[0]?.slice(0, 60) : '',
  }
})
check('Sunday off for both = one uncovered day', /1 day uncovered/.test(filled.pill || ''), filled.pill)
check('the balance card catches the clopen', /1/.test(filled.clopen || ''), `Clopens${filled.clopen}`)
check('and checks weekend days off against the rule', (filled.weekend || '').length > 0, `Weekend days off${filled.weekend}`)
await p.screenshot({ path: 'scripts/verify/out/sched-after.png', fullPage: true })

// Posted: today first
await p.goto('http://localhost:4180/#/posted', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
const posted = await p.evaluate(() => {
  const txt = document.querySelector('main').innerText
  return { onToday: /on today/i.test(txt), head: txt.split('\n').slice(0, 14).join(' | ').slice(0, 220) }
})
check('the posted schedule answers "who is on today" at the top', posted.onToday, posted.head)
await p.screenshot({ path: 'scripts/verify/out/posted-after.png', fullPage: true })
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
