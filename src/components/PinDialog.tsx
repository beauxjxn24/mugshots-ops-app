import { useEffect, useRef, useState } from 'react'
import { Lock, Delete } from 'lucide-react'
import { usePin } from '../lib/pin'
import { PERMS } from '../lib/users'

/** Rendered once at the app root; opens whenever requirePin(...) is awaited. */
export function PinDialog() {
  const { open, action, perm, submit, cancel } = usePin()
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
        {/* Four dots and a keypad, the same instrument the day-code screen uses
            and for the same reason: this gets tapped one-handed, on a shared
            tablet, by someone who has just been handling food. A text field
            summons a keyboard over the top of the dialog on a phone, and it
            was showing the PIN in the clear while a room full of people
            watched. */}
        <div className="mt-4 flex justify-center gap-3" aria-label={`${pin.length} of 4 digits`}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-3 rounded-full transition-all duration-200 ${
                shake ? 'bg-down/70' : i < pin.length ? 'scale-110 bg-brand' : 'bg-black/15'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => tryPin((pin + d).slice(0, 4))}
              className="rounded-xl border border-black/10 bg-white py-3 font-mono text-xl font-semibold text-ink transition-colors active:bg-black/10"
            >
              {d}
            </button>
          ))}
          <span />
          <button
            onClick={() => tryPin((pin + '0').slice(0, 4))}
            className="rounded-xl border border-black/10 bg-white py-3 font-mono text-xl font-semibold text-ink transition-colors active:bg-black/10"
          >
            0
          </button>
          <button
            onClick={() => setPin((c) => c.slice(0, -1))}
            aria-label="Delete"
            className="grid place-items-center rounded-xl text-muted transition-colors active:bg-black/10"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Kept for hardware keyboards — visually hidden, still typeable. */}
        <input
          ref={inputRef}
          type="password"
          inputMode="none"
          maxLength={4}
          value={pin}
          onChange={(e) => tryPin(e.target.value.replace(/\D/g, ''))}
          className="sr-only"
          aria-label="4-digit PIN"
        />
        {/* Naming the right, not the rank — since an AGM can now be handed one
            grant on its own, "GM or above" would be a lie on that PIN. */}
        <p className="mt-2 text-[11px] text-muted">
          {perm === 'unlock'
            ? 'A PIN with Unlock all'
            : `A PIN with ${PERMS.find((p) => p.key === perm)?.label ?? perm} rights`}{' '}
          · unlocks for 20 min
        </p>
        <button onClick={cancel} className="mt-3 text-sm font-semibold text-muted hover:text-ink">
          Cancel
        </button>
        <style>{`@keyframes pinshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}`}</style>
      </div>
    </div>
  )
}
