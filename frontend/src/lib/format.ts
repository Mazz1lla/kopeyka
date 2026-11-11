const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const fullDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
const shortMonthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short' })

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : 0
}

/** "−1 234,5 ₽" with a real minus sign; "+" is added for income when asked. */
export function formatMoney(value: string | number, options: { sign?: boolean } = {}): string {
  const amount = toNumber(value)
  const text = moneyFormatter.format(Math.abs(amount))
  if (amount < 0) return `−${text}`
  if (options.sign && amount > 0) return `+${text}`
  return text
}

export function formatCompact(value: number): string {
  return compactFormatter.format(value)
}

/** Parses "2026-10-31" as a local date (new Date("2026-10-31") would be UTC). */
export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function formatDate(value: string, withYear = false): string {
  const date = parseIsoDate(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return (withYear || !sameYear ? fullDateFormatter : dateFormatter).format(date)
}

export function formatMonth(month: string): string {
  const text = monthFormatter.format(parseIsoDate(`${month.slice(0, 7)}-01`))
  return text.charAt(0).toUpperCase() + text.slice(1).replace(' г.', '')
}

export function formatShortMonth(month: string): string {
  return shortMonthFormatter.format(parseIsoDate(month)).replace('.', '')
}

/** "2026-10" for the current month. */
export function currentMonth(today = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

/** shiftMonth("2026-01", -1) === "2025-12" */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = (year ?? 1970) * 12 + (monthNumber ?? 1) - 1 + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** First and last day of a "2026-10" month as ISO dates. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year ?? 1970, monthNumber ?? 1, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/** Russian plural: plural(5, ['операция', 'операции', 'операций']) -> 'операций' */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export function countLabel(count: number, forms: [string, string, string]): string {
  return `${count.toLocaleString('ru-RU')} ${plural(count, forms)}`
}

export const TRANSACTION_FORMS: [string, string, string] = ['операция', 'операции', 'операций']
