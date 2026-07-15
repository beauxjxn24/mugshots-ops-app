// Mugsy — the app's AI assistant (prototype spec: "Reads your live app ·
// advice only, no changes"). It builds a READ-ONLY snapshot of this store's
// data and asks Claude. The API key is the owner's own, pasted once and kept
// only on this device.

import { load, save } from './store'
import { useScope } from './scope'
import { TARGETS_KEY, DEFAULT_TARGETS, type Targets } from './targets'
import type { Night } from './nightly'
import type { Booking } from './catering'
import { getCatalog, getFlags, getPars, getPriceLog } from './catalog'
import type { Invoice } from './invoices'

const KEY = '__aiKey' // global (not store-scoped) — one key per device

export const getAiKey = (): string => load<string>(KEY, '')
export const setAiKey = (k: string): void => save(KEY, k.trim())

const scoped = (k: string) => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::${k}`
}

function names(): { concept: string; location: string } {
  const s = useScope.getState()
  const c = s.concepts.find((x) => x.id === s.currentConcept)
  return { concept: c?.name ?? 'Mugshots', location: c?.locations.find((x) => x.id === s.currentLocation)?.name ?? '' }
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Compact, capped text snapshot of everything Mugsy is allowed to read. */
export function buildSnapshot(): string {
  const parts: string[] = []
  const { concept, location } = names()
  parts.push(`STORE: ${concept} — ${location}`)
  parts.push(`TODAY: ${new Date().toDateString()}`)

  try {
    const t = load<Targets>(scoped(TARGETS_KEY), DEFAULT_TARGETS)
    parts.push(`TARGETS: labor ≤ ${t.laborPct}% · growth +${t.growthPct}% vs LY`)
  } catch { /* skip */ }

  try {
    const nights = load<Night[]>(scoped('nightly:log'), [])
    if (nights.length) {
      const recent = [...nights].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 45)
      parts.push('\nDAILY SALES & LABOR (newest first):')
      for (const n of recent) {
        const b = [`net $${Math.round(n.netSales)}`]
        if (n.gross != null) b.push(`gross $${Math.round(n.gross)}`)
        if (n.labor != null) b.push(`labor $${Math.round(n.labor)}`)
        const lp = n.laborPct ?? (n.labor && n.netSales ? (n.labor / n.netSales) * 100 : null)
        if (lp) b.push(`labor ${lp.toFixed(1)}%`)
        if (n.covers) b.push(`${n.covers} covers`)
        if (n.deposit) b.push(`deposit $${Math.round(n.deposit)}`)
        parts.push(`  ${n.date}: ${b.join(', ')}${n.notes ? ` — ${n.notes.slice(0, 80)}` : ''}`)
      }
    }
  } catch { /* skip */ }

  try {
    const bookings = load<Booking[]>(scoped('catering:bookings'), [])
    const t = todayIso()
    const upcoming = bookings.filter((b) => b.date >= t).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).slice(0, 10)
    if (upcoming.length) {
      parts.push('\nUPCOMING CATERING:')
      for (const b of upcoming)
        parts.push(`  ${b.date}${b.time ? ` ${b.time}` : ''}: ${b.event} · ${b.guests || '?'} guests${b.estimate ? ` · est $${b.estimate}` : ''}${b.status ? ` · ${b.status}` : ''}`)
    }
  } catch { /* skip */ }

  try {
    const items = getCatalog()
    const flags = getFlags()
    const pars = getPars()
    const on = items.filter((i) => flags[i.id]).slice(0, 120)
    if (on.length) {
      parts.push('\nORDER GUIDE (item · case cost · par / on hand):')
      for (const i of on) {
        const p = pars[i.id] ?? {}
        parts.push(`  ${i.name} (${i.category}${i.vendor ? `, ${i.vendor}` : ''})${i.cost != null ? ` $${i.cost.toFixed(2)}` : ''} · par ${p.par ?? '—'} / on hand ${p.onHand ?? '—'}`)
      }
    }
  } catch { /* skip */ }

  try {
    const logp = getPriceLog().slice(0, 15)
    if (logp.length) {
      parts.push('\nRECENT PRICE CHANGES:')
      for (const p of logp) parts.push(`  ${p.name}: ${p.oldCost != null ? `$${p.oldCost.toFixed(2)} → ` : ''}$${p.newCost.toFixed(2)} (${p.date}${p.vendor ? `, ${p.vendor}` : ''})`)
    }
  } catch { /* skip */ }

  try {
    const invs = load<Invoice[]>(scoped('invoices:list'), []).slice(0, 12)
    if (invs.length) {
      parts.push('\nRECENT INVOICES:')
      for (const i of invs) parts.push(`  ${i.date} ${i.vendor} $${i.total.toFixed(2)}${i.number ? ` #${i.number}` : ''} ${i.paid ? 'PAID' : 'open'}`)
    }
  } catch { /* skip */ }

  try {
    interface PrepIt { name: string; unit: string; pars: number[] }
    const items = load<PrepIt[]>(scoped('prep:items'), [])
    const onHand = load<Record<string, number>>(scoped(`prep:onhand:${todayIso()}`), {})
    const [y, m, d] = todayIso().split('-').map(Number)
    const di = (new Date(y, m - 1, d).getDay() + 6) % 7
    const need = items
      .map((it) => ({ name: it.name, unit: it.unit, need: Math.max(0, (it.pars[di] ?? 0) - (onHand[it.name] ?? 0)) }))
      .filter((x) => x.need > 0)
      .slice(0, 60)
    if (need.length) {
      parts.push("\nTODAY'S PREP NEEDS:")
      for (const x of need) parts.push(`  ${x.name}: ${x.need} ${x.unit}`)
    }
  } catch { /* skip */ }

  try {
    interface Ticket { equipment: string; issue: string; date: string; priority: string; resolved: boolean }
    const rows = load<Ticket[]>(scoped('maint:log'), [])
    const open = rows.filter((r) => !r.resolved).slice(0, 20)
    if (open.length) {
      parts.push('\nOPEN MAINTENANCE:')
      for (const r of open) parts.push(`  [${r.priority}] ${r.equipment}: ${r.issue} (${r.date})`)
    }
  } catch { /* skip */ }

  try {
    interface LogEntry { mod: string; recap: string; kitchen: string; staffing: string; maintenance: string; comps: string; wins: string }
    const entries = load<Record<string, LogEntry>>(scoped('nightlog:entries'), {})
    const dates = Object.keys(entries).sort().slice(-7).reverse()
    const withText = dates.filter((d) => Object.values(entries[d]).some((v) => v && v.trim()))
    if (withText.length) {
      parts.push('\nSHIFT NOTES (newest first):')
      for (const d of withText) {
        const e = entries[d]
        const bits = (Object.keys(e) as Array<keyof LogEntry>)
          .filter((k) => e[k] && e[k].trim())
          .map((k) => `${k}: ${e[k].trim().slice(0, 120)}`)
        parts.push(`  ${d} — ${bits.join(' · ')}`)
      }
    }
  } catch { /* skip */ }

  try {
    interface Shift { date: string; meal?: string; pool: number }
    const shifts = load<Shift[]>(scoped('tips:shifts'), []).slice(-5).reverse()
    if (shifts.length) {
      parts.push('\nRECENT TIPSHARE POOLS:')
      for (const s of shifts) parts.push(`  ${s.date}${s.meal ? ` ${s.meal}` : ''}: $${(s.pool ?? 0).toFixed(2)}`)
    }
  } catch { /* skip */ }

  try {
    // pmix:days is { [date]: { items: MixItem[] } } and each item carries
    // `sales`, not `net` — read the real shape so Mugsy sees product mix.
    interface MixRow { name: string; qty: number; sales: number }
    interface PmixDay { items: MixRow[] }
    const days = load<Record<string, PmixDay>>(scoped('pmix:days'), {})
    const latest = Object.keys(days).sort().pop()
    const items = latest ? days[latest]?.items : undefined
    if (items && items.length) {
      const top = [...items].sort((a, b) => b.qty - a.qty).slice(0, 15)
      parts.push(`\nPRODUCT MIX (${latest}, top sellers):`)
      for (const r of top) parts.push(`  ${r.name}: ${r.qty} sold · $${Math.round(r.sales ?? 0)}`)
    }
  } catch { /* skip */ }

  return parts.join('\n').slice(0, 24000)
}

const SYSTEM =
  'You are "Mugsy", an assistant embedded in the Mugshots Ops app used by restaurant managers. ' +
  "You have READ-ONLY access to a snapshot of the app's live data, given below. Use it to answer questions, search, summarize, and advise. " +
  'You cannot take actions, change data, place orders, or send anything — if asked to, explain you can only read and advise, and offer to draft text they can copy. ' +
  'Be concise and concrete: cite the actual numbers, dates, item names, and notes from the snapshot. Prefer short paragraphs and bullet lists. ' +
  "If the snapshot does not contain what they asked about (a store, a date, a note that isn't there), say so plainly. NEVER invent data, numbers, or notes that are not in the snapshot."

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

/** Ask Claude as Mugsy. Throws Error with a user-facing message on failure. */
export async function askMugsy(messages: ChatMsg[]): Promise<string> {
  const key = getAiKey()
  if (!key) throw new Error('no-key')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1400,
      system: `${SYSTEM}\n\n=== LIVE APP SNAPSHOT (read-only) ===\n${buildSnapshot()}`,
      messages: messages.slice(-8),
    }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error("That API key doesn't look right — tap the gear and paste it again.")
    if (res.status === 429) throw new Error('Claude is rate-limited right now — give it a moment and ask again.')
    throw new Error(`Couldn't reach Claude (HTTP ${res.status}). Check the connection and try again.`)
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim() || 'No response.'
}
