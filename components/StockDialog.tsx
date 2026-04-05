'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { StockAnalysis } from '@/lib/types'

interface Props {
  stock: StockAnalysis
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SIGNAL_BADGE = {
  BUY: 'bg-blue-500 text-white',
  SELL: 'bg-red-500 text-white',
  HOLD: 'bg-zinc-500 text-white',
}

const SIGNAL_LABEL = {
  BUY: '매수',
  SELL: '매도',
  HOLD: '관망',
}

export function StockDialog({ stock, open, onOpenChange }: Props) {
  const updatedAt = new Date(stock.lastUpdated).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div>
              <DialogTitle className="text-lg">
                {stock.ticker}
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  {stock.companyName}
                </span>
              </DialogTitle>
            </div>
            <Badge className={`ml-auto ${SIGNAL_BADGE[stock.signal]}`}>
              {SIGNAL_LABEL[stock.signal]} {stock.score}%
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 기술 지표 */}
          <div className="grid grid-cols-3 gap-3">
            <Metric label="현재가" value={`$${stock.currentPrice.toFixed(2)}`} />
            <Metric
              label="일간 변동"
              value={`${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`}
              valueClass={
                stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
              }
            />
            <Metric
              label="RSI(14)"
              value={stock.rsi.toFixed(1)}
              valueClass={
                stock.rsi < 30
                  ? 'text-blue-400'
                  : stock.rsi > 70
                    ? 'text-red-400'
                    : 'text-zinc-200'
              }
            />
          </div>

          {/* AI 분석 */}
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <p className="text-xs text-zinc-400 mb-2 font-medium">AI 분석 근거</p>
            <p className="text-sm text-zinc-200 leading-relaxed">
              {stock.reasoning}
            </p>
          </div>

          {/* 관련 뉴스 */}
          {stock.newsItems.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 mb-2 font-medium">관련 뉴스</p>
              <ul className="space-y-2">
                {stock.newsItems.map((news, i) => (
                  <li key={i} className="text-xs text-zinc-300 leading-relaxed">
                    <span className="text-zinc-500 mr-1">•</span>
                    {news.url && news.url !== '#' ? (
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400 transition-colors"
                      >
                        {news.headline}
                      </a>
                    ) : (
                      news.headline
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 업데이트 시간 */}
          <p className="text-xs text-zinc-500 text-right">
            {stock.isStale ? '⚠ 캐시된 데이터 · ' : ''}
            {updatedAt} 기준
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Metric({
  label,
  value,
  valueClass = 'text-zinc-200',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className={`text-sm font-mono font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}
