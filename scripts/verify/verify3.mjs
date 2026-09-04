import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
// A tablet-ish width — the width the catering card was actually failing at.
const p = await b.newPage({ viewport: { width: 1180, height: 900 } })
await p.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints++ } })
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  localStorage.setItem('mugops:mugshots|flowood::catering:bookings', JSON.stringify([
    { id: 'b1', event: 'Trustmark lunch', date: bd, time: '11:30', guests: 40, notes: 'Deliver to back dock', deposit: 200, depositPaid: true, estimate: 640, status: 'confirmed' },
    { id: 'b2', event: 'Flowood HS Boosters', date: bd, time: '17:00', guests: 25, estimate: 180, status: 'confirmed' },
  ]))
  // one night with sales but no Toast cash summary, so the manual deposit card shows
  localStorage.setItem('mugops:mugshots|flowood::nightly:log', JSON.stringify([
    { id: 'n1', date: bd, netSales: 18420, gross: 19100, labor: 4560, expected: 1240.5 },
  ]))
}, bd)

// ---------- 1. Catering ----------
await p.goto('http://localhost:4180/#/catering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
const cat = await p.evaluate(() => {
  const row = document.getElementById('booking-b1')
  const card = row.closest('.overflow-hidden') || row.parentElement
  const btn = [...row.querySelectorAll('button')].find((x) => /complete/i.test(x.getAttribute('aria-label') || ''))
  const r = btn.getBoundingClientRect()
  return {
    cardScrollsSideways: card.scrollWidth > card.clientWidth + 1,
    completeVisible: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
    completeX: Math.round(r.right), viewport: window.innerWidth,
  }
})
console.log('CATERING  no sideways scroll:', !cat.cardScrollsSideways, '| Complete on screen without scrolling:', cat.completeVisible, `(right edge ${cat.completeX} of ${cat.viewport})`)
await p.locator('#booking-b1 button[aria-label*="complete" i]').click(); await p.waitForTimeout(400)
const gone = await p.evaluate(() => !document.getElementById('booking-b1'))
console.log('          tapping Complete closes the booking out:', gone)
await p.screenshot({ path: SP + '/v-catering.png' })

// ---------- 2. Nightly ----------
await p.goto('http://localhost:4180/#/nightly', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
const night = await p.evaluate(() => {
  const main = document.querySelector('main')
  const fields = [...main.querySelectorAll('input, textarea, select')].map((e) => ({
    tag: e.tagName.toLowerCase(), type: e.getAttribute('type') || '', label: (e.getAttribute('placeholder') || e.getAttribute('aria-label') || e.getAttribute('title') || e.closest('label')?.textContent?.trim().slice(0, 30) || '').slice(0, 40),
  }))
  return { fields, textareas: main.querySelectorAll('textarea').length, log: /shift recap|nightly log/i.test(main.innerText) }
})
console.log('NIGHTLY   textareas:', night.textareas, '| Nightly Log gone:', !night.log)
for (const f of night.fields) console.log('          field:', f.tag, f.type, '—', f.label)
await p.screenshot({ path: SP + '/v-nightly.png' })

// ---------- 3. Checklists ----------
await p.goto('http://localhost:4180/#/checklists', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
console.log('CHECKLISTS window closed on arrival:', (await p.locator('[role="dialog"]').count()) === 0)
await p.locator('button', { hasText: /^AM/ }).first().click(); await p.waitForTimeout(400)
const win = await p.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  if (!d) return null
  const r = d.getBoundingClientRect()
  return { label: d.getAttribute('aria-label'), fullScreen: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
           title: d.querySelector('.font-display')?.textContent, bodyLocked: document.body.style.overflow === 'hidden',
           items: d.querySelectorAll('button span.size-5').length }
})
console.log('          tap AM → window:', win)
await p.screenshot({ path: SP + '/v-checklists.png' })
await p.getByRole('button', { name: 'Close', exact: true }).click(); await p.waitForTimeout(300)
console.log('          Close button closes it:', (await p.locator('[role="dialog"]').count()) === 0)
await p.locator('button', { hasText: /^PM/ }).first().click(); await p.waitForTimeout(300)
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
console.log('          Escape closes it:', (await p.locator('[role="dialog"]').count()) === 0)
console.log('          body scroll restored:', await p.evaluate(() => document.body.style.overflow !== 'hidden'))
await b.close()
