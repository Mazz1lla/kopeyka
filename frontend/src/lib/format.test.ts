import { describe, expect, it } from 'vitest'

import {
  countLabel,
  currentMonth,
  formatMoney,
  formatMonth,
  monthRange,
  parseIsoDate,
  plural,
  shiftMonth,
  toNumber,
} from './format'

// Intl uses non-breaking spaces; normalize them to make assertions readable.
const clean = (value: string) => value.replace(/\s/g, ' ')

describe('formatMoney', () => {
  it('uses a real minus sign for expenses', () => {
    expect(clean(formatMoney('-1234.5'))).toBe('−1 234,5 ₽')
  })

  it('adds plus only when asked', () => {
    expect(clean(formatMoney('500'))).toBe('500 ₽')
    expect(clean(formatMoney('500', { sign: true }))).toBe('+500 ₽')
    expect(clean(formatMoney('0', { sign: true }))).toBe('0 ₽')
  })

  it('treats garbage as zero instead of printing NaN', () => {
    expect(clean(formatMoney('abc'))).toBe('0 ₽')
    expect(toNumber(undefined)).toBe(0)
  })
})

describe('months', () => {
  it('shifts across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-05', -17)).toBe('2024-12')
  })

  it('knows the last day of the month, including leap years', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })

  it('formats current month and month names', () => {
    expect(currentMonth(new Date(2026, 0, 31))).toBe('2026-01')
    expect(formatMonth('2026-10-01')).toBe('Октябрь 2026')
  })

  it('parses ISO dates in local time', () => {
    const date = parseIsoDate('2026-10-01')
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 1])
  })
})

describe('plural', () => {
  const forms: [string, string, string] = ['операция', 'операции', 'операций']

  it.each([
    [1, 'операция'],
    [2, 'операции'],
    [5, 'операций'],
    [11, 'операций'],
    [12, 'операций'],
    [21, 'операция'],
    [104, 'операции'],
    [111, 'операций'],
  ])('%i -> %s', (count, expected) => {
    expect(plural(count, forms)).toBe(expected)
  })

  it('formats large counts', () => {
    expect(clean(countLabel(1234, forms))).toBe('1 234 операции')
  })
})
