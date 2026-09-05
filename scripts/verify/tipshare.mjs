// Proves a name on the tip sheet can be fixed after it is added — in the
// servers list and in the support-staff lists — without losing the hours or
// the tip-out already keyed against it.
import pw from 'playwright-core'
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
const p = await ctx.newPage()
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }
const live = () => p.evaluate(() => JSON.parse(localStorage.getItem('mugops:mugshots|flowood::tips:live') || '{}'))

await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
await p.evaluate((bd) => {
  localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role', JSON.stringify('admin'))
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: 'flowood' }))
}, bd)
await p.goto('http://localhost:4180/#/tipshare', { waitUntil: 'networkidle' })
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500)

// a server, misspelled, with a tip-out against it
await p.locator('input[placeholder="Server name"]').fill('Kaite Smith')
await p.locator('input[placeholder="$·later"]').fill('42')
await p.locator('button', { hasText: /^Add/ }).last().click(); await p.waitForTimeout(600)
let l = await live()
check('the server lands on the sheet', l.servers?.[0]?.name === 'Kaite Smith' && l.servers?.[0]?.amount === 42, JSON.stringify(l.servers))

await p.locator('button', { hasText: 'Kaite Smith' }).first().click(); await p.waitForTimeout(300)
const box = p.locator('input[aria-label="Name — Kaite Smith"]')
check('tapping the name opens an editor', (await box.count()) === 1)
await box.fill('Katie Smith'); await p.keyboard.press('Enter'); await p.waitForTimeout(600)
l = await live()
check('the name is fixed', l.servers?.[0]?.name === 'Katie Smith', JSON.stringify(l.servers))
check('and the tip-out survived the edit', l.servers?.[0]?.amount === 42, String(l.servers?.[0]?.amount))

// a bartender, misspelled, with hours against it
const barAdd = p.locator('input[placeholder="Name"]').first()
await barAdd.fill('Vitoria Allen')
await p.locator('input[placeholder="Hrs·later"]').first().fill('7')
await p.locator('button', { hasText: /^Add/ }).first().click(); await p.waitForTimeout(600)
l = await live()
const e0 = l.entries?.[0]
check('the bartender lands on the sheet', !!e0 && e0.name === 'Vitoria Allen', JSON.stringify(l.entries))
await p.locator('button', { hasText: 'Vitoria Allen' }).first().click(); await p.waitForTimeout(300)
await p.locator('input[aria-label="Name — Vitoria Allen"]').fill('Victoria Allen')
await p.keyboard.press('Enter'); await p.waitForTimeout(600)
l = await live()
check('a support-staff name is editable too', l.entries?.[0]?.name === 'Victoria Allen', JSON.stringify(l.entries))
check('their hours survived', l.entries?.[0]?.hours === e0?.hours, `${e0?.hours} → ${l.entries?.[0]?.hours}`)
await p.screenshot({ path: 'scripts/verify/out/tipshare-edit.png' })
await ctx.close()
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
