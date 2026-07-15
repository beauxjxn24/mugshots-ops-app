import { useEffect, useState } from 'react'

/**
 * True on phone-width screens (< 768px). Components use it to render a
 * touch-first, single-column variant — the desktop layout stays the default.
 */
export function useIsPhone(): boolean {
  const query = '(max-width: 767px)'
  const [phone, setPhone] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}
