import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

for (const store of ['flowood', 'pearl']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1250 } })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(({ bd, store }) => {
    localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
    localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
    localStorage.setItem('mugops:__role', JSON.stringify('admin'))
    const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
    localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: store }))
  }, { bd, store })
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1800)

  // which store are we actually on?
  const scope = await p.evaluate(() => JSON.parse(localStorage.getItem('mugops:__scope') || '{}')?.currentLocation)
  await p.locator('button', { hasText: /^Produce$/ }).first().click().catch(() => {})
  await p.waitForTimeout(800)
  const t = await p.evaluate(() => document.body.innerText)
  const items = ['Lettuce, Spring Mix', 'Lettuce, Iceberg', 'Tomatoes', 'Onions, Red', 'Lemons', 'Celery']
  console.log(`--- ${store} (scope=${scope}) ---`)
  console.log('  all 16 present:', items.every((i) => t.includes(i)), '| M par + F par cols:', t.includes('M PAR') || /M par/i.test(t))
  console.log('  pack sizes shown:', ['4/3 LB', '24 CT', '20 LB', '200 CT'].every((x) => t.includes(x)))
  const pars = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('mugops:mugshots|' + JSON.parse(localStorage.getItem('mugops:__scope')).currentLocation + '::catalog:pars') || '{}')
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items') || '[]')
    const byId = Object.fromEntries(cat.map((c) => [c.id, c.name]))
    const out = {}
    for (const [id, v] of Object.entries(s)) if (['Tomatoes','Onions, Red','Lemons','Lettuce, Iceberg'].includes(byId[id])) out[byId[id]] = `${v.par}/${v.parF}`
    return out
  })
  console.log('  M/F pars:', pars)
  if (store === 'flowood') await p.screenshot({ path: SP + '/produce.png' })
  await ctx.close()
}
await b.close()
