'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { StockAnalysis } from '@/lib/types'

interface Props {
  ticker: string
  initialStock: StockAnalysis
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

function formatKoreanTime(isoOrUnix: string | number): string {
  const date =
    typeof isoOrUnix === 'number'
      ? new Date(isoOrUnix * 1000)
      : new Date(isoOrUnix)
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StockDialog({ ticker, initialStock, open, onOpenChange }: Props) {
  const [stock, setStock] = useState<StockAnalysis>(initialStock)
  const [analyzing, setAnalyzing] = useState(false)

  const fetchAnalysis = useCallback(() => {
    setAnalyzing(true)
    fetch(`/api/analyze/${ticker}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: StockAnalysis) => {
        if (data?.ticker) setStock(data)
      })
      .catch(() => {})
      .finally(() => setAnalyzing(false))
  }, [ticker])

  // 다이얼로그 열릴 때 AI 분석 fetch
  useEffect(() => {
    if (open) {
      setStock(initialStock) // 가격 데이터 먼저 표시
      fetchAnalysis()
    }
  }, [open]) // eslint-disable-line

  const updatedAt = formatKoreanTime(stock.lastUpdated)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg">
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
              valueClass={stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-400 font-medium">AI 분석 및 전망</p>
              {!analyzing && (
                <button
                  onClick={fetchAnalysis}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ↻ 갱신
                </button>
              )}
            </div>
            {analyzing ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full bg-zinc-700" />
                <Skeleton className="h-3 w-4/5 bg-zinc-700" />
                <Skeleton className="h-3 w-3/5 bg-zinc-700" />
              </div>
            ) : (
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
                {stock.reasoning || 'AI 분석을 불러오는 중...'}
              </p>
            )}
          </div>

          {/* 관련 뉴스 */}
          {stock.newsItems.length > 0 && (
            <div>
              <p className="text-xs text-zinc-400 mb-2 font-medium">
                관련 뉴스 ({stock.newsItems.length}건)
              </p>
              <ul className="space-y-3">
                {stock.newsItems.map((news, i) => (
                  <li key={i} className="border-l-2 border-zinc-700 pl-3">
                    <p className="text-xs text-zinc-500 mb-0.5">
                      {formatKoreanTime(news.datetime)} (한국시간)
                    </p>
                    {news.koreanSummary ? (
                      <>
                        <p className="text-xs text-zinc-200 leading-relaxed">
                          {news.koreanSummary}
                        </p>
                        {news.url && news.url !== '#' && (
                          <a
                            href={news.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-0.5 block truncate"
                          >
                            {news.headline}
                          </a>
                        )}
                      </>
                    ) : news.url && news.url !== '#' ? (
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-300 leading-relaxed hover:text-blue-400 transition-colors"
                      >
                        {news.headline}
                      </a>
                    ) : (
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {news.headline}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-zinc-500 text-right">
            {updatedAt} (한국시간) 기준
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
