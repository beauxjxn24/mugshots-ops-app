// Custom animated SVG icons — these actually move (see keyframes in index.css).
// Design DNA (set by the flame + sparkle): filled organic silhouettes with a
// lighter inner "core" layer and tiny accents — never chunky 2px outlines.
import type { CSSProperties } from 'react'

export function FlameIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`ico-flame ${className}`}
      style={{ display: 'inline-flex', width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* outer flame */}
        <path
          className="flame-outer"
          d="M12 2 C 13 7, 17 9, 16 14.5 C 15.3 18.4, 13 20.6, 12 20.6 C 11 20.6, 8.7 18.4, 8 14.5 C 7.2 10, 11 8, 12 2 Z"
          fill="#F97316"
        />
        {/* inner flame */}
        <path
          className="flame-inner"
          d="M12 8 C 12.6 10.6, 14 11.6, 13.5 14.6 C 13.1 17, 12.6 18.6, 12 18.6 C 11.4 18.6, 10.6 17, 10.5 14.6 C 10.3 12, 11.4 11, 12 8 Z"
          fill="#FDE047"
        />
      </svg>
    </span>
  )
}

export function SparkleIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="#2DD4BF" overflow="visible">
        {/* big four-point star */}
        <path
          className="spark-1"
          d="M12 3 C 12.6 8.2, 15.8 11.4, 21 12 C 15.8 12.6, 12.6 15.8, 12 21 C 11.4 15.8, 8.2 12.6, 3 12 C 8.2 11.4, 11.4 8.2, 12 3 Z"
        />
        {/* small twinkles */}
        <path className="spark-2" d="M19 3.5 C 19.2 5, 20 5.8, 21.5 6 C 20 6.2, 19.2 7, 19 8.5 C 18.8 7, 18 6.2, 16.5 6 C 18 5.8, 18.8 5, 19 3.5 Z" />
        <path className="spark-3" d="M5 15.5 C 5.15 16.6, 5.7 17.15, 6.8 17.3 C 5.7 17.45, 5.15 18, 5 19.1 C 4.85 18, 4.3 17.45, 3.2 17.3 C 4.3 17.15, 4.85 16.6, 5 15.5 Z" />
      </svg>
    </span>
  )
}

type P = { size?: number; className?: string }
const wrap = (size: number): CSSProperties => ({ display: 'inline-flex', width: size, height: size })
const cvar = (dx: string, dy: string) => ({ ['--dx']: dx, ['--dy']: dy }) as CSSProperties

export function MoonZIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled crescent with soft craters */}
        <path d="M10.5 3.5 A 8.6 8.6 0 1 0 20.5 13.5 A 7 7 0 0 1 10.5 3.5 Z" fill="#818CF8" />
        <circle cx="8.4" cy="13.5" r="1.25" fill="#C7D2FE" opacity=".85" />
        <circle cx="11.8" cy="17" r=".85" fill="#C7D2FE" opacity=".6" />
        <text className="zzz z1" x="14.5" y="9" fill="#C7D2FE" fontSize="6" fontWeight="800">z</text>
        <text className="zzz z2" x="17" y="6.5" fill="#C7D2FE" fontSize="5" fontWeight="800">z</text>
        <text className="zzz z3" x="19" y="4.5" fill="#C7D2FE" fontSize="4" fontWeight="800">z</text>
      </svg>
    </span>
  )
}

export function ClockIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled dial with a lighter face; hands cut in navy */}
        <circle cx="12" cy="12" r="9.5" fill="#60A5FA" />
        <circle cx="12" cy="12" r="7.2" fill="#BFDBFE" />
        <line className="clock-hour" x1="12" y1="12" x2="12" y2="7.8" stroke="#1C2740" strokeWidth="2" strokeLinecap="round" />
        <line className="clock-min" x1="12" y1="12" x2="15.4" y2="12" stroke="#1C2740" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.15" fill="#1C2740" />
      </svg>
    </span>
  )
}

export function BarsIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* rounded bars in a violet family — shortest is lightest */}
        <rect className="bar-g b1" x="3.5" y="10" width="4.6" height="10.5" rx="2.3" fill="#C4B5FD" />
        <rect className="bar-g b2" x="9.7" y="6.5" width="4.6" height="14" rx="2.3" fill="#A78BFA" />
        <rect className="bar-g b3" x="15.9" y="3.5" width="4.6" height="17" rx="2.3" fill="#8B5CF6" />
      </svg>
    </span>
  )
}

export function ShakerIcon({ size = 18, className = '' }: P) {
  return (
    <span className={`ico-shaker ${className}`} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled cocktail tin: lighter cap, pink body, glossy band */}
        <path d="M9.2 2.6 h5.6 a.8.8 0 0 1 .78 1 l-.5 2.4 h-6.2 l-.5-2.4 a.8.8 0 0 1 .78-1 Z" fill="#F9A8D4" />
        <path d="M9 6.8 h6 l1.25 11.4 a2 2 0 0 1-2 2.2 h-4.5 a2 2 0 0 1-2-2.2 Z" fill="#F472B6" />
        <path d="M9.2 8.6 h5.6 l.22 2 H9 Z" fill="#FBCFE8" />
        <ellipse cx="10.4" cy="15" rx="1" ry="2.6" fill="#F9A8D4" opacity=".5" />
      </svg>
    </span>
  )
}

export function PopperIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled party cone with a lighter stripe */}
        <g className="pop-cone">
          <path d="M3.4 20.6 L10.8 10.2 L13.8 13.2 Z" fill="#E0559B" />
          <path d="M6 17 L11.9 11.3 L13.2 12.6 L7.6 18.4 Z" fill="#F9A8D4" opacity=".9" />
          <path d="M3.4 20.6 L6.2 19.7 L4.3 17.8 Z" fill="#BE3B7E" />
        </g>
        <circle className="confetti" style={cvar('4px', '-8px')} cx="15" cy="8" r="1.4" fill="#4ADE80" />
        <rect className="confetti" style={cvar('8px', '-3px')} x="17" y="9.5" width="2.2" height="2.2" rx=".6" fill="#60A5FA" />
        <circle className="confetti" style={cvar('2px', '-10px')} cx="12.5" cy="6.5" r="1.3" fill="#FBBF24" />
        <rect className="confetti" style={cvar('9px', '2px')} x="18" y="14" width="2.2" height="2.2" rx=".6" fill="#F472B6" />
      </svg>
    </span>
  )
}

export function CheckBoxIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* solid rounded badge with a drawing white check */}
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="#34D399" />
        <rect x="5.5" y="5.5" width="13" height="6" rx="3" fill="#6EE7B7" opacity=".5" />
        <path className="check-draw" d="M8 12.5 l3 3 l5.2-6.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function ChefIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* rising steam */}
        <path className="steam s1" d="M9 6 q1.4-1.4 0-3" fill="none" stroke="#FDA4AF" strokeWidth="1.4" strokeLinecap="round" />
        <path className="steam s2" d="M12 5.5 q1.4-1.4 0-3" fill="none" stroke="#FDA4AF" strokeWidth="1.4" strokeLinecap="round" />
        <path className="steam s3" d="M15 6 q1.4-1.4 0-3" fill="none" stroke="#FDA4AF" strokeWidth="1.4" strokeLinecap="round" />
        {/* filled toque: puffy crown + band */}
        <path d="M6.8 14.6 a3.6 3.6 0 0 1-1.2-7 3.4 3.4 0 0 1 5.3-2.4 3.4 3.4 0 0 1 4.2 0 3.4 3.4 0 0 1 5.3 2.4 3.6 3.6 0 0 1-1.2 7 Z" fill="#FB7185" />
        <path d="M6.8 15.6 h10.4 v2.6 a1.3 1.3 0 0 1-1.3 1.3 H8.1 a1.3 1.3 0 0 1-1.3-1.3 Z" fill="#FDA4AF" />
        <circle cx="9.3" cy="10" r="1" fill="#FECDD3" opacity=".8" />
      </svg>
    </span>
  )
}

export function BoxIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled carton, lighter lid pops open */}
        <path d="M5 10.5 h14 v8.4 a1.4 1.4 0 0 1-1.4 1.4 H6.4 A1.4 1.4 0 0 1 5 18.9 Z" fill="#F0A94C" />
        <rect x="11" y="10.5" width="2" height="9.8" fill="#C77E22" opacity=".55" />
        <rect className="lid" x="4" y="6.8" width="16" height="3.4" rx="1.2" fill="#FCD34D" />
        <rect x="9.5" y="14" width="5" height="2" rx="1" fill="#FCD34D" opacity=".7" />
      </svg>
    </span>
  )
}

export function ScanDocIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled document with folded corner; white beam sweeps */}
        <path d="M5.5 5.5 a2 2 0 0 1 2-2 H15 l3.5 3.5 V18.5 a2 2 0 0 1-2 2 h-9 a2 2 0 0 1-2-2 Z" fill="#38BDF8" />
        <path d="M15 3.5 l3.5 3.5 H16 a1 1 0 0 1-1-1 Z" fill="#BAE6FD" />
        <rect x="8" y="10.5" width="8" height="1.5" rx=".75" fill="#0C4A6E" opacity=".45" />
        <rect x="8" y="14" width="5.5" height="1.5" rx=".75" fill="#0C4A6E" opacity=".45" />
        <line className="scan-line" x1="6.5" y1="7" x2="17.5" y2="7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function GraphIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* area chart: soft fill under a drawing line with a pulsing tip */}
        <path d="M4 17 L9.5 12 L13.5 14 L20 5.5 V20 H4 Z" fill="#4ADE80" opacity=".3" />
        <polyline className="graph-line" points="4,17 9.5,12 13.5,14 20,5.5" fill="none" stroke="#4ADE80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="graph-tip" cx="20" cy="5.5" r="2.1" fill="#BBF7D0" />
      </svg>
    </span>
  )
}

export function PieSpinIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* solid pie, one slice pops */}
        <circle cx="12" cy="12" r="8.5" fill="#FDBA74" />
        <path d="M12 12 L12 3.5 A8.5 8.5 0 0 1 20.5 12 Z" fill="#FED7AA" />
        <path className="pie-slice" d="M12 12 L3.5 12 A8.5 8.5 0 0 0 8.8 19.9 Z" fill="#F97316" />
      </svg>
    </span>
  )
}

export function CoinIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        <g className="coin">
          {/* solid coin with a lighter inner face */}
          <circle cx="12" cy="12" r="8.6" fill="#4ADE80" />
          <circle cx="12" cy="12" r="6.3" fill="#86EFAC" />
          <text x="12" y="15.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#166534">$</text>
        </g>
      </svg>
    </span>
  )
}

export function BoltIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        <g className="bolt">
          {/* solid hex nut with a navy bore */}
          <polygon points="12,3.4 19.4,7.7 19.4,16.3 12,20.6 4.6,16.3 4.6,7.7" fill="#94A3B8" />
          <polygon points="12,3.4 19.4,7.7 12,7.7" fill="#CBD5E1" opacity=".75" />
          <circle cx="12" cy="12" r="3.4" fill="#1C2740" />
          <circle cx="12" cy="12" r="3.4" fill="none" stroke="#CBD5E1" strokeWidth=".9" opacity=".55" />
        </g>
      </svg>
    </span>
  )
}

export function PlugIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* socket-side cable */}
        <path d="M21 4.5 v4 a4.5 4.5 0 0 1-4.5 4.5 h-2" fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" />
        <g className="plug">
          {/* filled plug head with light prongs, cable trailing */}
          <path d="M3 19.5 v-3.5 a4.5 4.5 0 0 1 4.5-4.5 h1.5" fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="5.6" y="8.2" width="6.8" height="5.6" rx="2" fill="#38BDF8" />
          <rect x="6.9" y="4.6" width="1.9" height="4" rx=".95" fill="#BAE6FD" />
          <rect x="9.2" y="4.6" width="1.9" height="4" rx=".95" fill="#BAE6FD" />
        </g>
        <path className="spark" d="M14.5 11.5 l2.2-2.8 -.8 2.4 2.2 0 -3 3.9 .8-2.4 Z" fill="#FBBF24" />
      </svg>
    </span>
  )
}

export function GridIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* dashboard tiles in a gold family, lighting up in turn */}
        <rect className="tile t1" x="3.5" y="3.5" width="8" height="8" rx="2.4" fill="#F5DFA0" />
        <rect className="tile t2" x="12.5" y="3.5" width="8" height="8" rx="2.4" fill="#E4B84C" />
        <rect className="tile t3" x="3.5" y="12.5" width="8" height="8" rx="2.4" fill="#E4B84C" />
        <rect className="tile t4" x="12.5" y="12.5" width="8" height="8" rx="2.4" fill="#C99B33" />
      </svg>
    </span>
  )
}

export function ReceiptIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled receipt with torn zigzag bottom; items print line by line */}
        <path d="M6 3 h12 v17.6 l-2-1.4 -2 1.4 -2-1.4 -2 1.4 -2-1.4 -2 1.4 Z" fill="#A78BFA" />
        <path d="M6 3 h12 v3.4 H6 Z" fill="#C4B5FD" />
        <line className="rline r1" x1="9" y1="9.4" x2="15" y2="9.4" stroke="#2E1065" strokeWidth="1.5" strokeLinecap="round" opacity=".55" />
        <line className="rline r2" x1="9" y1="12.6" x2="15" y2="12.6" stroke="#2E1065" strokeWidth="1.5" strokeLinecap="round" opacity=".55" />
        <line className="rline r3" x1="9" y1="15.8" x2="12.6" y2="15.8" stroke="#2E1065" strokeWidth="1.5" strokeLinecap="round" opacity=".55" />
      </svg>
    </span>
  )
}

export function BookIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled open cookbook; right page flips */}
        <path d="M12 5.2 C 10 3.8 7 3.8 4 4.2 V18.2 C 7 17.8 10 17.8 12 19.2 Z" fill="#E4B84C" />
        <path d="M12 5.2 C 14 3.8 17 3.8 20 4.2 V18.2 C 17 17.8 14 17.8 12 19.2 Z" fill="#C99B33" />
        <path className="page" d="M12 5.2 C 14 3.8 17 3.8 20 4.2 V18.2 C 17 17.8 14 17.8 12 19.2 Z" fill="#F5DFA0" />
        <rect x="11.4" y="4.6" width="1.2" height="14.6" rx=".6" fill="#8A6A1B" opacity=".6" />
      </svg>
    </span>
  )
}

export function StackIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled crates; top one bounces */}
        <rect x="3.5" y="13.5" width="8" height="7" rx="1.6" fill="#14B8A6" />
        <rect x="12.5" y="13.5" width="8" height="7" rx="1.6" fill="#2DD4BF" />
        <rect className="stack-top" x="8" y="5.6" width="8" height="7" rx="1.6" fill="#5EEAD4" />
        <rect x="10.6" y="5.6" width="2.8" height="2.2" rx="1" fill="#0F766E" opacity=".5" />
      </svg>
    </span>
  )
}

export function WalletIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* light bill peeks out of a solid wallet */}
        <rect className="bill" x="8" y="4.6" width="8" height="7" rx="1.2" fill="#D9F99D" />
        <path d="M4 9.4 h16 a1.4 1.4 0 0 1 1.4 1.4 v7.4 a1.4 1.4 0 0 1-1.4 1.4 H4 a1.4 1.4 0 0 1-1.4-1.4 v-7.4 A1.4 1.4 0 0 1 4 9.4 Z" fill="#4ADE80" />
        <path d="M15.2 12.6 h6.2 v3.8 h-6.2 a1.9 1.9 0 0 1 0-3.8 Z" fill="#22C55E" />
        <circle cx="16.6" cy="14.5" r="1.05" fill="#DCFCE7" />
      </svg>
    </span>
  )
}

export function PeopleIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled duo; teammate bobs */}
        <g className="head-b">
          <circle cx="16.8" cy="8.8" r="2.9" fill="#F9A8D4" />
          <path d="M12.4 20 a4.7 4.7 0 0 1 9 0 Z" fill="#F9A8D4" />
        </g>
        <circle cx="8.2" cy="7.8" r="3.5" fill="#F472B6" />
        <path d="M2.6 20 a5.7 5.7 0 0 1 11.2 0 Z" fill="#F472B6" />
      </svg>
    </span>
  )
}

export function MartiniIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled martini glass that sways gently, olive bobbing on its pick */}
        <g className="martini">
          {/* bowl */}
          <path d="M4 4.5 h16 L13.4 11.8 v0 L10.6 11.8 Z" fill="#F472B6" />
          {/* liquid — lighter core layer */}
          <path d="M6.6 6.3 h10.8 L13 10.9 h-2 Z" fill="#F9A8D4" />
          {/* shine */}
          <path d="M7.6 6.9 l1.6 0 -2 2.1 Z" fill="#FCE7F3" opacity=".9" />
          {/* stem + foot */}
          <rect x="11.2" y="11.6" width="1.6" height="6.2" rx=".8" fill="#F472B6" />
          <path d="M8.2 19.6 a3.8 1.4 0 0 1 7.6 0 Z" fill="#F472B6" />
          {/* olive on a pick */}
          <g className="olive">
            <line x1="14.8" y1="3.2" x2="12.6" y2="7.6" stroke="#E4B84C" strokeWidth="1" strokeLinecap="round" />
            <circle cx="13.2" cy="6.4" r="1.5" fill="#4ADE80" />
            <circle cx="13.2" cy="6.4" r=".55" fill="#166534" />
          </g>
        </g>
      </svg>
    </span>
  )
}

export function KeyTurnIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled key that turns in place */}
        <g className="keyturn">
          <circle cx="8.4" cy="8.4" r="5" fill="#E4B84C" />
          <circle cx="8.4" cy="8.4" r="2" fill="#1C2740" />
          <path d="M11.6 11.6 L19.6 19.6 v1.6 h-2.6 v-2 h-2 v-2 l-1.9-1.9 Z" fill="#E4B84C" />
          <circle cx="7" cy="7" r="1.1" fill="#F5DFA0" opacity=".9" />
        </g>
      </svg>
    </span>
  )
}

export function StorefrontIcon({ size = 18, className = '' }: P) {
  return (
    <span className={className} style={wrap(size)} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} overflow="visible">
        {/* filled shop with a striped scalloped awning that waves */}
        <path d="M5 11.5 h14 v7.6 a1.4 1.4 0 0 1-1.4 1.4 H6.4 A1.4 1.4 0 0 1 5 19.1 Z" fill="#C99B33" />
        <path d="M9.8 20.5 v-4.6 a1 1 0 0 1 1-1 h2.4 a1 1 0 0 1 1 1 v4.6 Z" fill="#F5DFA0" />
        <g className="awning">
          <path d="M3 8.2 L5 3.8 h14 l2 4.4 a2.25 2.25 0 0 1-4.5 0 a2.25 2.25 0 0 1-4.5 0 a2.25 2.25 0 0 1-4.5 0 A2.25 2.25 0 0 1 3 8.2 Z" fill="#E4B84C" />
          <path d="M7.5 8.2 a2.25 2.25 0 0 0 4.5 0 L11.3 3.8 h-2.6 Z" fill="#F5DFA0" />
          <path d="M16.5 8.2 a2.25 2.25 0 0 0 4.5 0 L19 3.8 h-2.6 Z" fill="#F5DFA0" />
        </g>
      </svg>
    </span>
  )
}
