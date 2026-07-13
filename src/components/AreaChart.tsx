import { useLayoutEffect, useRef, useState } from 'react'

export interface Point {
  label: string
  value: number
  forecast?: boolean
}

/**
 * Single-series area chart in the brand hue: gradient fill, 2px non-distorting
 * line (solid for actuals, dashed for forecast), dots, and a hover crosshair +
 * tooltip. Width is measured so marks never distort.
 */
export function AreaChart({
  data,
  height = 180,
  format = (n) => String(n),
}: {
  data: Point[]
  height?: number
  format?: (n: number) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const padL = 10
  const padR = 10
  const padT = 12
  const padB = 26
  const iw = Math.max(1, w - padL - padR)
  const ih = Math.max(1, height - padT - padB)
  const max = Math.max(...data.map((d) => d.value), 1) * 1.12
  const x = (i: number) => padL + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const y = (v: number) => padT + ih - (v / max) * ih

  const linePts = data.map((d, i) => [x(i), y(d.value)] as const)
  const firstForecast = data.findIndex((d) => d.forecast)
  const actualEnd = firstForecast === -1 ? data.length : firstForecast

  const areaPath =
    `M ${x(0)} ${padT + ih} ` +
    linePts.map(([px, py]) => `L ${px} ${py}`).join(' ') +
    ` L ${x(data.length - 1)} ${padT + ih} Z`
  const solidLine = linePts.slice(0, actualEnd).map(([px, py], i) => `${i ? 'L' : 'M'} ${px} ${py}`).join(' ')
  const dashLine = linePts
    .slice(Math.max(0, actualEnd - 1))
    .map(([px, py], i) => `${i ? 'L' : 'M'} ${px} ${py}`)
    .join(' ')

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * w
    let best = 0
    let bd = Infinity
    data.forEach((_, i) => {
      const d = Math.abs(x(i) - px)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    setHover(best)
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg
        width={w}
        height={height}
        className="block touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line x1={padL} y1={padT + ih} x2={w - padR} y2={padT + ih} stroke="currentColor" className="text-black/10" />

        <path d={areaPath} fill="url(#areaFill)" />
        <path
          d={solidLine}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {actualEnd < data.length && (
          <path
            d={dashLine}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={2}
            strokeDasharray="2 5"
            strokeOpacity={0.6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* dots */}
        {linePts.map(([px, py], i) => (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={hover === i ? 5 : 3.5}
            fill={data[i].forecast ? '#fff' : 'var(--color-brand)'}
            stroke="var(--color-brand)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* crosshair */}
        {hover !== null && (
          <line
            x1={x(hover)}
            y1={padT}
            x2={x(hover)}
            y2={padT + ih}
            stroke="var(--color-brand)"
            strokeOpacity={0.4}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* x labels (edge labels anchored inward so they don't clip) */}
        {data.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            className={`fill-current text-[10px] font-bold ${d.forecast ? 'text-ink/30' : 'text-muted'}`}
          >
            {d.label}
          </text>
        ))}
      </svg>

      {/* tooltip */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-navy px-2.5 py-1.5 text-center text-white shadow-lg"
          style={{ left: x(hover), top: Math.max(0, y(data[hover].value) - 46) }}
        >
          <div className="font-mono text-sm font-bold leading-none">{format(data[hover].value)}</div>
          <div className="mt-0.5 text-[10px] text-white/60">
            {data[hover].label}
            {data[hover].forecast ? ' · forecast' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
