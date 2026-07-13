import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { usePin } from '../lib/pin'

/** Rendered once at the app root; opens whenever requirePin(...) is awaited. */
export function PinDialog() {
  const { open, action, submit, cancel } = usePin()
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPin('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, cancel])

  if (!open) return null

  const tryPin = (value: string) => {
    setPin(value)
    if (value.length === 4) {
      if (!submit(value)) {
        setShake(true)
        setTimeout(() => {
          setShake(false)
          setPin('')
        }, 400)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={cancel} />
      <div className={`relative w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-2xl ${shake ? 'animate-[pinshake_.4s]' : ''}`}>
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-brand/10 text-brand">
          <Lock size={20} />
        </span>
        <div className="font-display text-lg font-semibold text-ink">Manager PIN</div>
        <p className="mt-0.5 text-sm text-muted">{action}</p>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => tryPin(e.target.value.replace(/\D/g, ''))}
          className="mx-auto mt-4 block w-32 rounded-xl border-2 border-black/10 bg-white py-2.5 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-brand"
          aria-label="4-digit PIN"
        />
        <p className="mt-2 text-[11px] text-muted">GM, Area Director, or Admin PIN · unlocks for 20 min</p>
        <button onClick={cancel} className="mt-3 text-sm font-semibold text-muted hover:text-ink">
          Cancel
        </button>
        <style>{`@keyframes pinshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}`}</style>
      </div>
    </div>
  )
}
