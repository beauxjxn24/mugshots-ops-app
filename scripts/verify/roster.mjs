// Proves: importing the employee roster every week updates people instead of
// duplicating them, and never removes anyone. Drops the real Toast export
// twice — the second time with a marriage (same GUID, new surname), a
// cross-trained job code, a new hire and somebody who has left — and checks
// the roster count, that the rename didn't make a second person, that the
// leaver is kept and reported, and that a straight re-drop of the same file
// changes nothing. Also: a multi-store export doesn't put Flowood's team on
// Pearl's roster.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
const p = await ctx.newPage()
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }

const roster = (store = 'flowood') => p.evaluate((store) => {
  const list = JSON.parse(localStorage.getItem(`mugops:mugshots|${store}::staff:list`) || '[]')
  const key = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const names = list.map((x) => key(x.name))
  return {
    n: list.length,
    dupeNames: names.filter((x, i) => names.indexOf(x) !== i),
    withGuid: list.filter((x) => x.extId).length,
    withEmpNo: list.filter((x) => x.empNo).length,
    find: (s) => 0, // placeholder
    names,
    berry: list.filter((x) => /berry|marchetti/.test(key(x.name))).map((x) => `${x.name}|${x.extId?.slice(0, 8)}`),
    bryant: list.filter((x) => /abram bryant/.test(key(x.name))).map((x) => (x.roles || [x.role]).join('+')),
    nancy: list.filter((x) => /nancy newperson/.test(key(x.name))).length,
    carrasco: list.filter((x) => /carrasco/.test(key(x.name))).length,
  }
}, store)

const drop = async (file) => {
  await p.goto('http://localhost:4180/#/imports', { waitUntil: 'networkidle' })
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
  await p.locator('input[accept*="application/pdf"]').first().setInputFiles(file)
  await p.waitForTimeout(4000)
  return p.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /added|updated|unchanged|already on the roster/i.test(d.innerText) && d.innerText.length < 220)
    const warn = [...document.querySelectorAll('div')].find((d) => /not in this export/i.test(d.innerText) && d.innerText.length < 400)
    return { said: el?.innerText.replace(/\s+/g, ' ').trim(), absent: warn?.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) }
  })
}

await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: 'flowood' }))
}, bd)

console.log('--- week 1: the Toast export ---')
const r1 = await drop('scripts/verify/out/_roster-w1.csv')
console.log('   panel:', r1.said)
const a = await roster()
check('the roster filled', a.n > 50, `${a.n} people`)
check('no duplicate names', a.dupeNames.length === 0, a.dupeNames.join(', '))
check("everyone carries Toast's GUID", a.withGuid === a.n, `${a.withGuid}/${a.n}`)
check('and the store employee number', a.withEmpNo > 0, `${a.withEmpNo}/${a.n}`)

console.log('--- the SAME file again (the thing that used to duplicate) ---')
const r2 = await drop('scripts/verify/out/_roster-w1.csv')
console.log('   panel:', r2.said)
const c = await roster()
check('not one person added', c.n === a.n, `${a.n} → ${c.n}`)
check('still no duplicate names', c.dupeNames.length === 0, c.dupeNames.join(', '))

console.log('--- week 2: a marriage, a cross-training, a new hire, a leaver ---')
const r3 = await drop('scripts/verify/out/_roster-w2.csv')
console.log('   panel:', r3.said)
console.log('   absent:', r3.absent)
const d = await roster()
check('exactly one person was added (the new hire)', d.n === a.n + 1, `${a.n} → ${d.n}`)
check('the renamed person is ONE person, not two', d.berry.length === 1, d.berry.join(' | '))
check('and she is under her new name', /Marchetti/.test(d.berry[0] || ''), d.berry.join(' | '))
check('the new job code landed', /Bartender/.test(d.bryant[0] || ''), d.bryant.join(' | '))
check('the new hire is on the roster', d.nancy === 1, String(d.nancy))
check('the person missing from the export was KEPT', d.carrasco === 1, String(d.carrasco))
check('and the import said who is missing', /not in this export/i.test(r3.absent || ''), r3.absent)
check('no duplicate names after all of it', d.dupeNames.length === 0, d.dupeNames.join(', '))

console.log('--- the same export dropped on the other store ---')
await p.evaluate(() => {
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentLocation: 'pearl' }))
})
await drop('scripts/verify/out/_roster-w1.csv')
const pe = await roster('pearl')
check("Flowood's export does not fill Pearl's roster", pe.n === 0, `${pe.n} people landed on Pearl`)
const saidWhy = await p.evaluate(() => /another store/i.test(document.body.innerText))
check('and it says why, instead of doing nothing quietly', saidWhy)
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
