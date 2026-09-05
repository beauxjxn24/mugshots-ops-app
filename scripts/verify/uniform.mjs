// Walks every screen and measures what it is made of: page backgrounds, card
// treatments, corner radii, type scale, button shapes, and any colour that
// isn't in the theme. A page that reads as "a different app" shows up here as
// numbers rather than as a feeling.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } })
const p = await ctx.newPage()
await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: 'flowood' }))
}, bd)

const ROUTES = ['dashboard', 'imports', 'catalog', 'catering', 'nightly', 'checklists', 'sidework', 'tipshare', 'prep',
  'ordering', 'invoices', 'pettycash', 'maintenance', 'printables', 'specs', 'drinks', 'lto', 'training',
  'period', 'schedule', 'posted', 'staff', 'users', 'stores', 'connections', 'forecast', 'mix', 'costs', 'inventory', 'shift', 'combined']

const norm = (c) => (c || '').replace(/\s/g, '')
const rows = []
for (const r of ROUTES) {
  await p.goto(`http://localhost:4180/#/${r}`, { waitUntil: 'networkidle' }).catch(() => {})
  await p.waitForTimeout(700)
  const m = await p.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return null
    const all = [...main.querySelectorAll('*')]
    const tally = (fn) => {
      const t = {}
      for (const el of all) {
        if (!el.getClientRects().length) continue
        const v = fn(el, getComputedStyle(el))
        if (v) t[v] = (t[v] || 0) + 1
      }
      return t
    }
    const top = (t, n = 4) => Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, n)
    // A PANEL: a rounded box big enough to be a container, that isn't inside
    // another one. Rows and chips inside a card are not cards.
    const boxes = all.filter((el) => {
      if (!el.getClientRects().length) return false
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return parseFloat(s.borderTopLeftRadius) >= 8 && r.width >= 280 && r.height >= 64
    })
    const panels = boxes.filter((el) => !boxes.some((o) => o !== el && o.contains(el)))
    const cardRadii = {}
    const cardBgs = {}
    for (const c of panels) {
      const s = getComputedStyle(c)
      cardRadii[s.borderTopLeftRadius] = (cardRadii[s.borderTopLeftRadius] || 0) + 1
      cardBgs[s.backgroundColor] = (cardBgs[s.backgroundColor] || 0) + 1
    }
    const cards = panels
    const btns = [...main.querySelectorAll('button')].filter((el) => el.getClientRects().length)
    const btnRadii = {}
    const btnHeights = {}
    for (const el of btns) {
      const st = getComputedStyle(el)
      btnRadii[st.borderTopLeftRadius] = (btnRadii[st.borderTopLeftRadius] || 0) + 1
      const h = Math.round(el.getBoundingClientRect().height / 4) * 4
      if (h > 16) btnHeights[h] = (btnHeights[h] || 0) + 1
    }
    const h1 = document.querySelector('main h1, h1')
    return {
      title: (h1?.innerText || '').slice(0, 28),
      bg: getComputedStyle(document.body).backgroundColor,
      cards: cards.length,
      cardRadii: top(cardRadii, 3),
      cardBgs: top(cardBgs, 3),
      surfaces: Object.keys(cardBgs).length,
      btnRadii: top(btnRadii, 3),
      btnHeights: top(btnHeights, 3),
      fonts: top(tally((el, s) => (el.children.length === 0 && el.innerText?.trim() ? s.fontFamily.split(',')[0] : '')), 3),
      colors: top(tally((el, s) => (el.children.length === 0 && el.innerText?.trim() ? s.color : '')), 5),
    }
  })
  if (m) rows.push({ r, ...m })
}

// The theme, as the majority of the app renders it.
const modeOf = (key) => {
  const t = {}
  for (const row of rows) for (const [v, n] of row[key] ?? []) t[norm(v)] = (t[norm(v)] || 0) + n
  return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0]
}
const themeCardRadius = modeOf('cardRadii')
const themeCardBg = modeOf('cardBgs')
const themeBtnRadius = modeOf('btnRadii')
console.log(`theme: card radius ${themeCardRadius} · card background ${themeCardBg} · button radius ${themeBtnRadius}\n`)
console.log('page             panels  radius     background                  mixed?')
for (const row of rows) {
  const cr = (row.cardRadii[0] || ['—'])[0]
  const cb = (row.cardBgs[0] || ['—'])[0]
  const br = (row.btnRadii[0] || ['—'])[0]
  const odd = []
  if (row.cards && norm(cr) !== themeCardRadius) odd.push('radius')
  if (row.cards && norm(cb) !== themeCardBg) odd.push('surface')

  if (row.fonts.length > 2) odd.push(`${row.fonts.length} fonts`)
  if (row.surfaces > 2) odd.push(`${row.surfaces} surfaces`)
  const bg = String(cb).replace('oklab(0.999994 0.0000455678 0.0000200868 / 0.045)', 'app surface').replace('oklab(1 0 5.96046e-8 / 0.045)', 'app surface')
  console.log(
    `${row.r.padEnd(16)} ${String(row.cards).padStart(4)}  ${String(cr).padEnd(9)} ${bg.padEnd(26)} ${odd.length ? '⚠ ' + odd.join(', ') : ''}`,
  )
}
await ctx.close()
await b.close()
