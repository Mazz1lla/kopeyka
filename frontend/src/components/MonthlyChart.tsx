import { useEffect, useRef, useState } from 'react'

import type { MonthlyPoint } from '../api/types'
import { niceMax } from '../lib/chart'
import { formatCompact, formatMoney, formatMonth, formatShortMonth, toNumber } from '../lib/format'

const HEIGHT = 220
const PAD = { top: 10, right: 4, bottom: 24, left: 56 }
const INCOME = '#00bc8c'
const EXPENSE = '#666'

export function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)

  // рисую в реальных пикселях, чтобы подписи не масштабировались вместе с viewBox
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)))
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const max = niceMax(Math.max(...data.flatMap((p) => [toNumber(p.income), toNumber(p.expense)])))
  const innerWidth = width - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom
  const slot = innerWidth / Math.max(data.length, 1)
  const bar = Math.min(16, slot / 3)
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight
  const labelEvery = slot < 34 ? 2 : 1
  const point = active === null ? null : data[active]

  return (
    <div ref={ref}>
      <div className="small" style={{ minHeight: 20 }}>
        <span className="swatch" style={{ background: INCOME }} />
        доходы{point && <b> {formatMoney(point.income)}</b>}
        <span className="swatch" style={{ background: EXPENSE, marginLeft: 16 }} />
        расходы{point && <b> {formatMoney(point.expense)}</b>}
        {point && <span className="text-muted"> · {formatMonth(point.month)}</span>}
      </div>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Доходы и расходы по месяцам"
        onMouseLeave={() => setActive(null)}
        style={{ display: 'block', marginTop: 6 }}
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#383838" />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#999">
              {formatCompact(tick)}
            </text>
          </g>
        ))}
        {data.map((p, i) => {
          const x = PAD.left + slot * i + slot / 2
          const income = toNumber(p.income)
          const expense = toNumber(p.expense)
          return (
            <g key={p.month} onMouseEnter={() => setActive(i)}>
              <rect x={x - slot / 2} y={PAD.top} width={slot} height={innerHeight} fill={active === i ? '#2c2c2c' : 'transparent'} />
              <rect x={x - bar - 1} y={y(income)} width={bar} height={y(0) - y(income)} fill={INCOME} />
              <rect x={x + 1} y={y(expense)} width={bar} height={y(0) - y(expense)} fill={EXPENSE} />
              {(data.length - 1 - i) % labelEvery === 0 && (
                <text x={x} y={HEIGHT - 6} textAnchor="middle" fontSize="11" fill="#999">
                  {formatShortMonth(p.month)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
