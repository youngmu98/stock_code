'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StockDialog } from './StockDialog'
import type { StockAnalysis } from '@/lib/types'

interface Props {
  ticker: string
  delay?: number // ms — 동시 요청 분산용
}

const SIGNAL_COLORS = {
  BUY: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20',
  SELL: 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20',
  HOLD: 'bg-zinc-500/10 border-zinc-500/30 hover:bg-zinc-500/20',
}

const SIGNAL_BADGE = {
  BUY: 'bg-blue-500 hover:bg-blue-500 text-white',
  SELL: 'bg-red-500 hover:bg-red-500 text-white',
  HOLD: 'bg-zinc-600 hover:bg-zinc-600 text-white',
}

const SIGNAL_LABEL = {
  BUY: '매수',
  SELL: '매도',
  HOLD: '관망',
}

// score(0~100)를 signal별 직관적인 강도로 변환
function getStrengthLabel(
  signal: 'BUY' | 'SELL' | 'HOLD',
  score: number,
): string {
  if (signal === 'BUY') {
    // score 60~100 → 매수 강도 표시
    const pct = Math.round(((score - 60) / 40) * 100)
    if (pct >= 75) return '강한 매수'
    if (pct >= 40) return '매수'
    return '약한 매수'
  }
  if (signal === 'SELL') {
    // score 0~40 → 매도 강도 표시
    const pct = Math.round(((40 - score) / 40) * 100)
    if (pct >= 75) return '강한 매도'
    if (pct >= 40) return '매도'
    return '약한 매도'
  }
  // HOLD: RSI 기반 중립 표현
  if (score >= 55) return '중립 (매수 우세)'
  if (score <= 45) return '중립 (매도 우세)'
  return '중립'
}

// 카드의 프로그레스 바 너비: BUY는 score 그대로, SELL은 반전
function getBarWidth(signal: 'BUY' | 'SELL' | 'HOLD', score: number): number {
  if (signal === 'SELL') return 100 - score // 매도 강도
  return score
}

function CardSkeleton() {
  return (
    <div className="p-5 rounded-xl border border-zinc-800">
      <div className="flex justify-between mb-3">
        <div className="space-y-1">
          <Skeleton className="h-3 w-10 bg-zinc-800" />
          <Skeleton className="h-4 w-28 bg-zinc-800" />
        </div>
        <Skeleton className="h-6 w-14 bg-zinc-800 rounded-full" />
      </div>
      <Skeleton className="h-1.5 w-full bg-zinc-800 rounded-full mb-3" />
      <div className="flex justify-between">
        <Skeleton className="h-6 w-20 bg-zinc-800" />
        <Skeleton className="h-4 w-12 bg-zinc-800" />
      </div>
    </div>
  )
}

export function StockCard({ ticker, delay = 0 }: Props) {
  const [stock, setStock] = useState<StockAnalysis | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/analyze/${ticker}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((data: StockAnalysis) => {
          // 필수 필드 검증 후 세팅
          if (data && typeof data.currentPrice === 'number' && data.ticker) {
            setStock(data)
          }
        })
        .catch(() => {})
    }, delay)
    return () => clearTimeout(timer)
  }, [ticker, delay])

  if (!stock) return <CardSkeleton />

  const barWidth = getBarWidth(stock.signal, stock.score)
  const strengthLabel = getStrengthLabel(stock.signal, stock.score)

  return (
    <>
      <Card
        className={`p-5 cursor-pointer border transition-colors ${SIGNAL_COLORS[stock.signal]}`}
        onClick={() => setOpen(true)}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-zinc-400 font-mono">{stock.ticker}</p>
            <p className="text-sm font-medium text-zinc-200 truncate max-w-[130px]">
              {stock.companyName}
            </p>
          </div>
          <Badge className={SIGNAL_BADGE[stock.signal]}>
            {SIGNAL_LABEL[stock.signal]}
          </Badge>
        </div>

        {/* 신호 강도 바 */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">{strengthLabel}</span>
            <span className="text-xs font-mono text-zinc-500">
              RSI {stock.rsi.toFixed(0)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                stock.signal === 'BUY'
                  ? 'bg-blue-500'
                  : stock.signal === 'SELL'
                    ? 'bg-red-500'
                    : 'bg-zinc-500'
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        {/* 가격 + 변동 */}
        <div className="flex items-center justify-between">
          <span className="text-lg font-mono font-semibold text-zinc-100">
            ${stock.currentPrice.toFixed(2)}
          </span>
          <span
            className={`text-sm font-mono ${
              stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {stock.changePercent >= 0 ? '+' : ''}
            {stock.changePercent.toFixed(2)}%
          </span>
        </div>
      </Card>

      <StockDialog stock={stock} open={open} onOpenChange={setOpen} />
    </>
  )
}
