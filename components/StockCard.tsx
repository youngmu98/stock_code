'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StockDialog } from './StockDialog'
import type { StockAnalysis } from '@/lib/types'

interface Props {
  stock: StockAnalysis
}

const SIGNAL_COLORS = {
  BUY: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20',
  SELL: 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20',
  HOLD: 'bg-zinc-500/10 border-zinc-500/30 hover:bg-zinc-500/20',
}

const SIGNAL_BADGE = {
  BUY: 'bg-blue-500 hover:bg-blue-500 text-white',
  SELL: 'bg-red-500 hover:bg-red-500 text-white',
  HOLD: 'bg-zinc-500 hover:bg-zinc-500 text-white',
}

const SIGNAL_LABEL = {
  BUY: '매수',
  SELL: '매도',
  HOLD: '관망',
}

export function StockCard({ stock }: Props) {
  const [open, setOpen] = useState(false)

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

        {/* 점수 바 */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">신호 강도</span>
            <span className="text-xs font-mono text-zinc-300">
              {stock.score}%
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
              style={{ width: `${stock.score}%` }}
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

        {/* 스테일 배지 */}
        {stock.isStale && (
          <p className="mt-2 text-xs text-amber-400/70">⚠ 캐시된 데이터</p>
        )}
      </Card>

      <StockDialog stock={stock} open={open} onOpenChange={setOpen} />
    </>
  )
}
