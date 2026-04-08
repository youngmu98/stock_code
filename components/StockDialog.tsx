'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useStocks } from './StockProvider'

interface Props {
  ticker: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SIGNAL_BADGE = {
  BUY:  'bg-blue-500 text-white',
  SELL: 'bg-red-500 text-white',
  HOLD: 'bg-zinc-500 text-white',
}

const SIGNAL_LABEL = {
  BUY:  '매수',
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

export function StockDialog({ ticker, open, onOpenChange }: Props) {
  const { stocks, analyzing, refresh } = useStocks()
  const stock = stocks.get(ticker)
  const isAnalyzing = analyzing.has(ticker)

  // 데이터 없으면 다이얼로그 자체를 열지 않음
  if (!stock) return null

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

          {/* MA 이동평균 지표 */}
          {(stock.ma20 !== null || stock.ma50 !== null) && (
            <div className="bg-zinc-800/30 rounded-lg p-3 space-y-2">
              <p className="text-xs text-zinc-500 font-medium mb-1">이동평균 (이전 거래일 기준)</p>
              <div className="grid grid-cols-2 gap-2">
                {stock.ma20 !== null && (
                  <MaRow
                    label="MA20"
                    value={stock.ma20}
                    price={stock.currentPrice}
                  />
                )}
                {stock.ma50 !== null && (
                  <MaRow
                    label="MA50"
                    value={stock.ma50}
                    price={stock.currentPrice}
                  />
                )}
              </div>
              {stock.ma20 !== null && stock.ma50 !== null && (
                <p className="text-xs mt-1">
                  {stock.ma20 > stock.ma50 ? (
                    <span className="text-blue-400">↑ 단기MA &gt; 장기MA (골든크로스 구조)</span>
                  ) : (
                    <span className="text-red-400">↓ 단기MA &lt; 장기MA (데드크로스 구조)</span>
                  )}
                  {stock.volumeRatio !== null && stock.volumeRatio >= 1.5 && (
                    <span className="text-yellow-400 ml-2">· 거래량 {stock.volumeRatio.toFixed(1)}× 급증</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* AI 분석 */}
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-400 font-medium">AI 분석 및 전망</p>
              {!isAnalyzing && (
                <button
                  onClick={() => refresh(ticker)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  ↻ 갱신
                </button>
              )}
            </div>
            {isAnalyzing && !stock.reasoning ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full bg-zinc-700" />
                <Skeleton className="h-3 w-4/5 bg-zinc-700" />
                <Skeleton className="h-3 w-3/5 bg-zinc-700" />
              </div>
            ) : (
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
                {stock.reasoning || 'AI 분석을 불러오는 중...'}
                {isAnalyzing && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse align-middle" />
                )}
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

          <div className="pt-1 border-t border-zinc-800 space-y-1">
            <p className="text-xs text-zinc-500 text-right">
              {updatedAt} (한국시간) 기준 · 데이터: Finnhub · Polygon.io
            </p>
            <p className="text-xs text-zinc-600 text-right">
              ⚠ 투자 판단의 최종 책임은 본인에게 있습니다. 참고용으로만 활용하세요.
            </p>
          </div>
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

function MaRow({ label, value, price }: { label: string; value: number; price: number }) {
  const diff = ((price / value - 1) * 100).toFixed(1)
  const above = price >= value
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-mono text-zinc-300">
        ${value.toFixed(2)}{' '}
        <span className={above ? 'text-blue-400' : 'text-red-400'}>
          {above ? '▲' : '▼'}{Math.abs(parseFloat(diff))}%
        </span>
      </span>
    </div>
  )
}
