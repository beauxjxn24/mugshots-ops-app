// Proves: each store's US Foods guide seeds from ITS OWN sheet in sheet-to-shelf
// order with product numbers; the copy-out carries the numbers; US Foods items
// do not also land on "Food & other"; adding an item on the tab lands it in the
// section it was added to (with its product number and the vendor set — it
// used to vanish); an item moves by tap, a step up and to the end of another
// section; the Printables sheet prints multi-page, landscape, in black ink with
// the storage bands, at the page's full width so nothing wraps mid-number; and
// a Flowood device that seeded Pearl's list before Flowood had its own sheet
// migrates: Pearl-only lines come off Flowood's guide, the layout becomes
// Flowood's, pars and hand-added items survive, Pearl's guide is untouched.
import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const fs = await import('node:fs')
fs.mkdirSync(SP, { recursive: true })
const pages = (f) => (fs.readFileSync(f).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }

// The sheets the app ships, so the expectations come from the data, not from
// a copy of it typed in here.
// Both stores run Flowood's list — Beau asked for Pearl to mirror it. Pearl's
// own sheet stays in the repo and is what the migration test seeds the "old
// device" from.
const FLOWOOD = JSON.parse(fs.readFileSync('src/data/usfoods-guide-flowood.json', 'utf8'))
const PEARL_ARCHIVE = JSON.parse(fs.readFileSync('src/data/usfoods-guide-pearl.json', 'utf8'))
const SHEETS = { pearl: FLOWOOD, flowood: FLOWOOD }
const walk = (rows) => [...new Set(rows.map((r) => r.group))]
// A section to add into and the one to move to, per store.
const ADD_IN = { pearl: 'Liquor Closet', flowood: 'Liquor Closet' }
const MAX_PAGES = { pearl: 10, flowood: 10 }

const unlock = async (p, store) => {
  await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(({ bd, store }) => {
    localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
    localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
    localStorage.setItem('mugops:__role', JSON.stringify('admin'))
    const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
    localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: store }))
  }, { bd, store })
}
const setStore = (p, store) => p.evaluate((store) => {
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: store }))
}, store)
// Always a full reload: a hash-router goto to the route already open is not a
// navigation, and localStorage written by the test (pars, scope) is only read
// at boot.
const openUsFoods = async (p) => {
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' })
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.locator('button', { hasText: /^US Foods$/ }).first().click(); await p.waitForTimeout(700)
}
// What the tab shows: section bands in order, the header count, which codes are on it.
const guide = (p, codes) => p.evaluate((codes) => {
  const t = document.body.innerText
  const bands = [...document.querySelectorAll('span.tracking-wider.text-brand-600')].map((s) => s.firstChild.textContent.trim())
  return { bands, items: (t.match(/\d+ items/) || [])[0], has: Object.fromEntries(codes.map((c) => [c, t.includes(`#${c}`)])) }
}, codes)
const whereIs = (p, code) => p.evaluate((code) => {
  const chip = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === `#${code}`)
  if (!chip) return null
  const row = chip.closest('.group')
  const section = row.parentElement.parentElement
  const band = section.querySelector('span').firstChild.textContent.trim()
  const rows = [...section.querySelectorAll('.group')]
  return { band, idx: rows.indexOf(row), count: rows.length }
}, code)
const newContext = async () => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => {
    window.__copied = ''
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t } }, configurable: true })
    window.__prints = 0; window.print = () => { window.__prints++ }
  })
  return { ctx, p }
}

for (const store of ['pearl', 'flowood']) {
  const rows = SHEETS[store]
  const first = rows[0].code, last = rows[rows.length - 1].code
  const { ctx, p } = await newContext()
  await unlock(p, store)
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1800)

  const tabs = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /^(Liquor|Beer|Produce|US Foods|Food & other)$/.test(t)))
  console.log(`--- ${store} --- tabs: ${tabs.join(' | ')}`)
  check('US Foods tab present', tabs.includes('US Foods'))
  check('no "Food & other" (USF items not double-listed)', !tabs.includes('Food & other'))

  await p.locator('button', { hasText: /^US Foods$/ }).first().click(); await p.waitForTimeout(700)
  const g = await guide(p, [first, last])
  check(`sections in the ${store} sheet's walk order`, g.bands.join(' → ') === walk(rows).join(' → '), g.bands.join(' → '))
  check('header count', g.items === `${rows.length} items`, g.items)
  check('first and last product # shown', g.has[first] && g.has[last], `#${first} ${g.has[first]} · #${last} ${g.has[last]}`)
  check('brand on pack line', await p.evaluate(() => document.body.innerText.includes('MONOGRAM')))

  // give one item a par so the copy-out has a line, then copy
  await p.evaluate(() => {
    const sc = JSON.parse(localStorage.getItem('mugops:__scope'))
    const key = `mugops:mugshots|${sc.currentLocation}::catalog:pars`
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items') || '[]')
    const cup = cat.find((c) => c.code === '728865')
    const pars = JSON.parse(localStorage.getItem(key) || '{}')
    pars[cup.id] = { par: 3, onHand: 1 }
    localStorage.setItem(key, JSON.stringify(pars))
  })
  await openUsFoods(p)
  await p.locator('button', { hasText: /^Copy order/ }).first().click(); await p.waitForTimeout(400)
  const copied = await p.evaluate(() => window.__copied)
  check('copy-out carries product #', /2 cs · #728865 — Cup, Foam 12 Oz White/.test(copied), JSON.stringify(copied.split('\n').slice(0, 2).join(' / ')))
  if (store === 'pearl') await p.screenshot({ path: `${SP}/usfoods-orders.png` })

  // ---- add an item to a section, product number first ---------------------
  const sec = ADD_IN[store]
  await p.locator(`button[title="Add an item to ${sec}"]`).click(); await p.waitForTimeout(200)
  await p.locator('input[placeholder="product #"]').fill('9990001')
  await p.locator(`input[placeholder="New ${sec} item — Enter to add"]`).fill('Test Widget, Case Of Twelve')
  await p.keyboard.press('Enter'); await p.waitForTimeout(500)
  const added = await whereIs(p, '9990001')
  check(`added item lands at the end of ${sec} with its product #`, !!added && added.band === sec && added.idx === added.count - 1, JSON.stringify(added))
  const cat = await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items') || '[]').find((x) => x.code === '9990001')
    return c ? { vendor: c.vendor, category: c.category, unit: c.unit } : null
  })
  check('catalog item is US Foods', cat?.vendor === 'US Foods', JSON.stringify(cat))

  // ---- move it by tap: one up, then to the end of Office ------------------
  await p.locator('.group', { hasText: '#9990001' }).locator('button[title="Click to edit this item"]').click(); await p.waitForTimeout(300)
  await p.locator('button[title="Move up"]').click(); await p.waitForTimeout(400)
  const up = await whereIs(p, '9990001')
  check(`Move up steps it one row up inside ${sec}`, !!up && up.band === sec && up.idx === added.idx - 1, JSON.stringify(up))
  await p.locator('select[aria-label="Move to section"]').selectOption({ label: 'Office' }); await p.waitForTimeout(400)
  const moved = await whereIs(p, '9990001')
  check('Move to section puts it at the end of Office', !!moved && moved.band === 'Office' && moved.idx === moved.count - 1, JSON.stringify(moved))
  check('the edit panel followed the item', await p.locator('button[title="Move up"]').count() === 1)
  if (store === 'pearl') await p.screenshot({ path: `${SP}/usfoods-move.png`, fullPage: false })
  // the product # is editable on this guide
  const codeField = p.locator('label', { hasText: 'Product #' }).locator('input')
  check('edit panel offers the product #', (await codeField.inputValue()) === '9990001')
  await codeField.fill('9990002'); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
  check('product # edit saved', !!(await whereIs(p, '9990002')))
  // reload: the layout and the vendor persist
  await openUsFoods(p)
  const after = await whereIs(p, '9990002')
  check('survives reload in Office', !!after && after.band === 'Office', JSON.stringify(after))

  // ---- Printables ---------------------------------------------------------
  await p.goto('http://localhost:4180/#/printables', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
  await p.locator('button', { hasText: /^US Foods order guide/ }).first().click(); await p.waitForTimeout(500)
  // landscape letter at the sheet's 10mm margins ≈ 979px across
  await p.setViewportSize({ width: 979, height: 700 })
  await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300)
  const pr = await p.evaluate(() => {
    const el = document.querySelector('.produce-guide.usf')
    const table = el.querySelector('table')
    const cell = el.querySelector('tbody tr:not(.pg-section) td')
    const band = el.querySelector('.pg-section td')
    const overflowing = [...el.querySelectorAll('tbody tr:not(.pg-section)')].filter((tr) => {
      const [code, , , price] = tr.children
      return code.scrollWidth > code.clientWidth + 1 || price.scrollWidth > price.clientWidth + 1
    }).length
    return { rows: el.querySelectorAll('tbody tr:not(.pg-section)').length, bands: [...el.querySelectorAll('.pg-section')].map((s) => s.textContent.trim()),
             ink: getComputedStyle(cell).color, bandBg: getComputedStyle(band).backgroundColor,
             landscape: [...document.querySelectorAll('style')].some((s) => /landscape/.test(s.textContent)),
             width: Math.round(table.getBoundingClientRect().width), overflowing }
  })
  await p.pdf({ path: `${SP}/usfoods-${store}.pdf`, format: 'Letter', landscape: true, printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
  const n = pages(`${SP}/usfoods-${store}.pdf`)
  console.log(`  print: ${pr.rows} rows · ${pr.bands.length} bands · ink ${pr.ink} · band bg ${pr.bandBg} · landscape ${pr.landscape} · table ${pr.width}px · pages ${n}`)
  check(`${rows.length + 1} rows (the sheet + the added one) under the sheet's bands`, pr.rows === rows.length + 1 && pr.bands.join('|') === walk(rows).join('|'), pr.bands.join(' → '))
  check('black ink, grey bands, landscape', pr.ink === 'rgb(0, 0, 0)' && pr.bandBg === 'rgb(230, 230, 230)' && pr.landscape)
  check('table uses the landscape page', pr.width >= 900, `${pr.width}px`)
  check('no product # or price wraps', pr.overflowing === 0, `${pr.overflowing} rows overflow`)
  check(`at most ${MAX_PAGES[store]} pages`, n <= MAX_PAGES[store], `${n} pages`)
  await ctx.close()
}

// ---- migration: a Pearl device holding the old Pearl-only list -------------
// It seeded Pearl's own sheet under stamp 'v1'. Opening Orders now has to hand
// it Flowood's list, PARK the 14 lines only Pearl's sheet carried (they keep
// their price and history and can be brought back), keep its pars, and leave
// alone anything Beau added himself.
{
  console.log('--- pearl: device holding the old Pearl-only list ---')
  const fc = new Set(FLOWOOD.map((r) => r.code))
  const pearlOnly = PEARL_ARCHIVE.map((r) => r.code).filter((c) => !fc.has(c))
  const { ctx, p } = await newContext()
  await unlock(p, 'pearl')
  await p.goto('http://localhost:4180/', { waitUntil: 'networkidle' })
  const staged = await p.evaluate(({ rows, hand }) => {
    const k = (key) => `mugops:mugshots|pearl::${key}`
    // the catalog the old seed would have left behind
    const cat = rows.map((r, i) => ({
      id: `old${i}`, name: r.name, unit: r.uom.toLowerCase(), category: r.category,
      vendor: 'US Foods', cost: r.price, code: r.code, size: `${r.size} · ${r.brand}`,
    }))
    cat.push(hand)
    localStorage.setItem('mugops:mugshots|*::catalog:items', JSON.stringify(cat))
    localStorage.setItem(k('catalog:flags'), JSON.stringify(Object.fromEntries(cat.map((c) => [c.id, true]))))
    const byGroup = new Map()
    rows.forEach((r, i) => { if (!byGroup.has(r.group)) byGroup.set(r.group, []); byGroup.get(r.group).push(`old${i}`) })
    const layout = [...byGroup.entries()].map(([title, ids]) => ({ title, ids }))
    layout[0].ids.push(hand.id) // Beau's own line, in the first section
    localStorage.setItem(k('guide:sections:US Foods'), JSON.stringify(layout))
    localStorage.setItem(k('guide:seeded:usfoods'), JSON.stringify('v1'))
    const cup = cat.find((c) => c.code === '728865')
    localStorage.setItem(k('catalog:pars'), JSON.stringify({ [cup.id]: { par: 4, parF: 7, onHand: 1 } }))
    return { sections: layout.map((s) => s.title).join(' → '), items: cat.length }
  }, { rows: PEARL_ARCHIVE, hand: { id: 'hand1', name: 'Hand Added Thing', unit: 'cs', category: 'Food', vendor: 'US Foods', code: '5550001' } })
  console.log(`  staged: ${staged.items} catalog items · ${staged.sections}`)
  await openUsFoods(p)
  const g = await guide(p, [...pearlOnly.slice(0, 3), '5550001', '728865'])
  check('Pearl re-lays out from the mirrored sheet', g.bands.join(' → ') === walk(FLOWOOD).join(' → '), g.bands.join(' → '))
  check(`${FLOWOOD.length} sheet lines + the hand-added one`, g.items === `${FLOWOOD.length + 1} items`, g.items)
  check('the old Pearl-only lines are off the guide', pearlOnly.slice(0, 3).every((c) => !g.has[c]), JSON.stringify(g.has))
  const st = await p.evaluate((pearlOnly) => {
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items'))
    const cup = cat.find((c) => c.code === '728865')
    return {
      parked: pearlOnly.filter((c) => cat.find((x) => x.code === c)?.parked).length,
      handParked: !!cat.find((c) => c.code === '5550001')?.parked,
      keptPrice: cat.find((c) => c.code === pearlOnly[0])?.cost,
      par: JSON.parse(localStorage.getItem('mugops:mugshots|pearl::catalog:pars'))[cup.id],
      stamp: JSON.parse(localStorage.getItem('mugops:mugshots|pearl::guide:seeded:usfoods')),
    }
  }, pearlOnly)
  check(`all ${pearlOnly.length} Pearl-only lines are parked, not deleted`, st.parked === pearlOnly.length, `${st.parked} parked`)
  check('a parked line keeps its price', typeof st.keptPrice === 'number', String(st.keptPrice))
  check("Beau's own added line is NOT parked", !st.handParked)
  const hand = await whereIs(p, '5550001')
  check('and it survives on the guide', !!hand, JSON.stringify(hand))
  check('both pars survive on a shared line', st.par?.par === 4 && st.par?.parF === 7, JSON.stringify(st.par))
  check('stamp is now the mirrored one', st.stamp === 'mirror-flowood-v1', st.stamp)

  // ---- the Parked shelf in the Item Catalog ------------------------------
  await p.goto('http://localhost:4180/#/catalog', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
  const chip = p.locator('button', { hasText: /Parked\s*\d+/ })
  check('Item Catalog shows a Parked shelf', (await chip.count()) === 1, `${await chip.count()} chips · ${(await p.locator('button').allInnerTexts()).filter((t) => /park/i.test(t)).join(' | ')}`)
  await chip.first().click(); await p.waitForTimeout(600)
  const parkedList = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.grid > div')]
    return { n: cards.length, first: cards[0]?.innerText.split('\n').slice(0, 2).join(' · ') }
  })
  check(`the shelf lists all ${pearlOnly.length} parked items`, parkedList.n === pearlOnly.length, `${parkedList.n} · ${parkedList.first}`)
  await p.screenshot({ path: `${SP}/parked-shelf.png` })
  // un-park the first one and watch it come back
  await p.locator('button', { hasText: /Un-park/ }).first().click(); await p.waitForTimeout(700)
  const back = await p.evaluate(() => {
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items'))
    return { stillParked: cat.filter((c) => c.parked).length }
  })
  check('un-park takes it off the shelf', back.stillParked === pearlOnly.length - 1, `${back.stillParked} left`)
  await openUsFoods(p)
  const after = await guide(p, [])
  check('and it is back on the guide', after.items === `${FLOWOOD.length + 2} items`, after.items)
  await ctx.close()
}

// ---- the shipped documents actually load ----------------------------------
// The service worker's SPA fallback used to answer the PDF's navigation with
// index.html, so Printables' documents opened the app and printed blank.
{
  console.log('--- shipped documents (service worker active) ---')
  const { ctx, p } = await newContext()
  await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(6000) // the app reloads itself when the new SW takes control
  await p.goto('http://localhost:4180/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  check('a service worker is in control', await p.evaluate(() => !!navigator.serviceWorker.controller))
  for (const href of ['sheets/employment-application.pdf', 'sheets/mini-mugs-2026.pdf']) {
    const what = await p.evaluate(async (href) => {
      const f = document.createElement('iframe')
      f.style.cssText = 'position:fixed;left:-9999px;width:794px;height:1123px'
      f.src = href
      document.body.appendChild(f)
      await new Promise((s) => { f.onload = s; setTimeout(s, 6000) })
      let out
      try {
        const d = f.contentDocument
        // A real PDF loads Chrome's viewer, whose document contentType is
        // application/pdf. The SPA fallback used to serve index.html here.
        out = !d ? 'the PDF' : d.contentType === 'application/pdf' ? 'the PDF' : `${d.contentType} — "${d.title}" WRONG`
      } catch { out = 'the PDF' }
      f.remove()
      return out
    }, href)
    check(`${href} loads the document`, what === 'the PDF', what)
  }
  await ctx.close()
}
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
