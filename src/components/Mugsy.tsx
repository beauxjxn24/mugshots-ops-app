import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Settings2, Send } from 'lucide-react'
import { askMugsy, getAiKey, setAiKey, type ChatMsg } from '../lib/mugsy'

const GREETING =
  'Hey — I can read everything in the app right now: your sales & labor history, product mix, order guides, inventory, tips, bookings, and your shift notes. Ask me anything, or tap a starter below.'

const SUGGESTIONS = [
  'Summarize last week',
  'Any maintenance issues logged?',
  'What should I reorder in produce?',
  "Draft tonight's nightly email",
]

/** Render Mugsy's markdown-ish replies: **bold** + bullet lists (prototype's formatter). */
function fmt(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const bolded = esc.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  let html = ''
  let inList = false
  for (const ln of bolded.split(/\n/)) {
    const m = ln.match(/^\s*[-*•]\s+(.*)$/)
    if (m) {
      if (!inList) {
        html += '<ul class="my-1.5 list-disc pl-4">'
        inList = true
      }
      html += `<li class="my-0.5">${m[1]}</li>`
    } else {
      if (inList) {
        html += '</ul>'
        inList = false
      }
      if (ln.trim()) html += `<div class="my-1">${ln}</div>`
    }
  }
  if (inList) html += '</ul>'
  return html
}

/**
 * Mugsy — floating "Ask Mugsy" pill (prototype spec) + slide-in chat panel.
 * Read-only: it sees a snapshot of this store's data and advises; it never
 * changes anything. Runs on the owner's own Claude API key, kept on-device.
 */
export function Mugsy() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [hasKey, setHasKey] = useState(() => !!getAiKey())
  const [showKeySetup, setShowKeySetup] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [msgs, busy])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 320)
  }, [open])

  const saveKey = () => {
    if (!keyDraft.trim()) return
    setAiKey(keyDraft)
    setKeyDraft('')
    setHasKey(true)
    setShowKeySetup(false)
  }

  const submit = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    const next: ChatMsg[] = [...msgs, { role: 'user', content: q }]
    setMsgs(next)
    if (!hasKey) {
      setMsgs([...next, { role: 'assistant', content: 'I need a Claude API key before I can read the data and answer — tap the ⚙ gear up top and paste one in (it stays on this device only).' }])
      setShowKeySetup(true)
      return
    }
    setBusy(true)
    try {
      const out = await askMugsy(next)
      setMsgs([...next, { role: 'assistant', content: out }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong — try again.'
      setMsgs([...next, { role: 'assistant', content: msg === 'no-key' ? 'Add your API key first (⚙ gear up top).' : msg }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Floating pill — prototype's red "✦ Ask Mugsy" */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-full border border-white/20 bg-[#B3202C] px-[18px] py-[13px] text-sm font-semibold text-white shadow-[0_14px_34px_-12px_rgba(179,32,44,0.55)] transition-colors hover:bg-[#9C1B26] print:hidden"
        >
          <Sparkles size={15} /> Ask Mugsy
        </button>
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed right-0 top-0 z-[101] flex h-dvh w-[min(440px,94vw)] flex-col bg-[#FBFAF7] text-ink shadow-[-24px_0_60px_-30px_rgba(23,32,55,0.5)] transition-transform duration-300 print:hidden ${
          open ? 'translate-x-0' : 'translate-x-[105%]'
        }`}
      >
        <div className="flex items-center justify-between bg-navy px-5 pb-4 pt-5 text-[#F7F3E8]">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-semibold">
              <Sparkles size={16} className="text-brand" /> Ask Mugsy
            </div>
            <div className="mt-0.5 text-[11.5px] text-white/55">Reads your live app · advice only, no changes</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowKeySetup((v) => !v)}
              title={hasKey ? 'Change the API key' : 'Connect Mugsy — paste a Claude API key'}
              className={`grid size-[30px] place-items-center rounded-lg ${hasKey ? 'bg-white/10 text-white' : 'bg-brand text-white'}`}
            >
              <Settings2 size={15} />
            </button>
            <button onClick={() => setOpen(false)} className="grid size-[30px] place-items-center rounded-lg bg-white/10 text-white">
              <X size={15} />
            </button>
          </div>
        </div>

        {showKeySetup && (
          <div className="border-b border-black/10 bg-brand/[0.07] px-5 py-3">
            <div className="text-xs font-bold text-ink">{hasKey ? 'Replace the Claude API key' : 'Connect Mugsy'}</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Paste a Claude API key from console.anthropic.com. It's saved on THIS device only — never sent
              anywhere except to Claude.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                placeholder="sk-ant-…"
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs outline-none focus:border-brand"
              />
              <button onClick={saveKey} className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white">
                Save
              </button>
            </div>
          </div>
        )}

        <div ref={logRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-2 pt-4">
          <Bubble role="assistant" html={fmt(hasKey ? GREETING : GREETING + '\n\nFirst time here: tap the ⚙ gear and paste your Claude API key to switch me on.')} />
          {msgs.map((m, i) => (
            <Bubble key={i} role={m.role} html={m.role === 'user' ? m.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') : fmt(m.content)} />
          ))}
          {busy && <Bubble role="assistant" html="Thinking…" />}
        </div>

        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="rounded-full border border-[#E2DCCD] bg-[#F1ECE0] px-3 py-1.5 text-[11.5px] font-medium text-navy"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-[#ECE7DC] bg-[#FBFAF7] px-4 pb-4 pt-3">
          <div className="flex items-end gap-2 rounded-2xl border-[1.5px] border-[#DED8CB] bg-white py-2 pl-3.5 pr-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              placeholder="Ask about your numbers, notes, orders…"
              className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent text-sm leading-relaxed text-ink outline-none"
            />
            <button
              onClick={() => void submit()}
              disabled={busy}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
          <div className="mt-2 text-center text-[10.5px] text-[#A8A090]">
            Claude can be wrong — double-check anything that matters.
          </div>
        </div>
      </div>
    </>
  )
}

function Bubble({ role, html }: { role: 'user' | 'assistant'; html: string }) {
  const mine = role === 'user'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-normal ${
          mine
            ? 'rounded-br-md bg-navy text-[#F4F2EC]'
            : 'rounded-bl-md border border-[#ECE7DC] bg-white text-[#26303F]'
        }`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
