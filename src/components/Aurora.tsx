import { useEffect, useRef } from 'react'

/**
 * Command Deck — a living aurora painted on a canvas behind the whole app.
 * A handful of large, drifting radial-gradient "blobs" (cyan + gold) at low
 * opacity under heavy CSS blur. Cheap (one low-res canvas), reduced-motion
 * aware (renders a single static frame), and purely decorative (pointer-events
 * off, aria-hidden), so it never interferes with the UI.
 */
export function Aurora() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const COLORS = ['#1fb89a', '#e4b84c', '#123a5a', '#0e5f6e', '#4fe3c1']
    let W = 0, H = 0, t = 0, raf = 0
    type Blob = { x: number; y: number; r: number; dx: number; dy: number; c: string; ph: number }
    let blobs: Blob[] = []

    const resize = () => {
      W = cv.width = Math.max(1, (innerWidth * 0.55) | 0)
      H = cv.height = Math.max(1, (innerHeight * 0.55) | 0)
    }
    const seed = () => {
      blobs = Array.from({ length: 5 }, (_, i) => ({
        x: Math.random(), y: Math.random(), r: 0.3 + Math.random() * 0.3,
        dx: (Math.random() - 0.5) * 0.0002, dy: (Math.random() - 0.5) * 0.0002,
        c: COLORS[i % COLORS.length], ph: Math.random() * 6.28,
      }))
    }
    const draw = () => {
      t += 0.005
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#05070c'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      for (const b of blobs) {
        const bx = (b.x + Math.sin(t + b.ph) * 0.05) * W
        const by = (b.y + Math.cos(t * 0.9 + b.ph) * 0.05) * H
        const rad = b.r * Math.min(W, H) * (0.9 + Math.sin(t + b.ph) * 0.12)
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad)
        g.addColorStop(0, b.c + 'cc'); g.addColorStop(0.5, b.c + '3a'); g.addColorStop(1, b.c + '00')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(bx, by, rad, 0, 6.2832); ctx.fill()
        if (!reduce) {
          b.x += b.dx; b.y += b.dy
          if (b.x < -0.2 || b.x > 1.2) b.dx *= -1
          if (b.y < -0.2 || b.y > 1.2) b.dy *= -1
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw)
    }

    resize(); seed(); draw()
    addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} id="app-aurora" aria-hidden="true" />
}
