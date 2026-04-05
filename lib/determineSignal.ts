import type { Signal } from './types'

// score: 0-100 (50 = 중립)
// score < 40 → SELL, 40-60 → HOLD, score > 60 → BUY
export function determineSignal(score: number): Signal {
  if (score < 40) return 'SELL'
  if (score > 60) return 'BUY'
  return 'HOLD'
}
