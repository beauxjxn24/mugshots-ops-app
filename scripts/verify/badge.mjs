import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
}, bd)

// Walk a few screens; the pill used to ride along on all of them.
for (const r of ['/', '/prep', '/specs', '/sidework']) {
  await p.goto('http://localhost:4180/#' + r, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  const rail = await p.evaluate(() => {
    const a = document.querySelector('aside')
    if (!a) return { text: '', pills: 0 }
    // any small round/red count chip left in the rail
    const pills = [...a.querySelectorAll('span,div')].filter((e) => {
      const t = e.textContent.trim()
      if (!/^\d{1,3}$/.test(t)) return false
      const cs = getComputedStyle(e)
      return cs.borderRadius !== '0px' && e.children.length === 0
    }).length
    return { text: a.innerText.replace(/\n+/g, ' | '), pills }
  })
  console.log(r.padEnd(10), 'count pills in rail:', rail.pills)
  if (r === '/') console.log('   rail reads:', rail.text.slice(0, 200))
}

// The Checklists screen must still say what's owed.
await p.goto('http://localhost:4180/#/checklists', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
const t = await p.evaluate(() => document.body.innerText)
console.log('Checklists page still reports due state:', /day|due|left|reset/i.test(t))
await p.screenshot({ path: SP + '/nobadge.png' })
await b.close()
