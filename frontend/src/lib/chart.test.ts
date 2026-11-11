import { describe, expect, it } from 'vitest'

import { niceMax } from './chart'

describe('niceMax', () => {
  it.each([
    [37_400, 40_000],
    [120_500, 150_000],
    [100_000, 100_000],
    [61, 80],
    [0.4, 0.4],
  ])('%d -> %d', (value, expected) => {
    expect(niceMax(value)).toBeCloseTo(expected)
  })

  it('never returns zero, so the chart never divides by it', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(-5)).toBe(1)
    expect(niceMax(Number.NaN)).toBe(1)
  })
})
