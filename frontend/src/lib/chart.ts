/** Picks a "nice" axis maximum: 37 400 -> 40 000, 120 500 -> 150 000. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const step = steps.find((s) => s * magnitude >= value) ?? 10
  return step * magnitude
}
