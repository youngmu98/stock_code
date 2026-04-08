'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
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
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[85vh] flex flex-col">
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

        <div className="space-y-4 mt-2 overflow-y-auto flex-1 pr-1">
          {/* 기술 지표 */}
          <div className="grid grid-cols-3 gap-3">
            <Metric
              label="현재가"
              value={`$${stock.currentPrice.toFixed(2)}`}
              tip="Finnhub 기준 15분 지연 시세입니다."
            />
            <Metric
              label="일간 변동"
              value={`${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`}
              valueClass={stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}
              tip="전일 종가 대비 오늘 현재가의 등락률입니다."
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
              tip="상대강도지수(RSI). 14일 기준 과매수·과매도를 나타냅니다. 30 이하는 과매도(매수 신호), 70 이상은 과매수(매도 신호)로 해석합니다."
            />
          </div>

          {/* MA 이동평균 지표 */}
          {(stock.ma20 !== null || stock.ma50 !== null) && (
            <div className="bg-zinc-800/30 rounded-lg p-3 space-y-2">
              <Tooltip>
                <TooltipTrigger>
                  <p className="text-xs text-zinc-500 font-medium mb-1 inline-flex items-center gap-1 cursor-help">
                    이동평균 (이전 거래일 기준)
                    <span className="text-zinc-600 text-[10px]">?</span>
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="max-w-[220px] leading-relaxed">
                    MA20: 최근 20거래일 종가 평균. 단기 추세를 나타냅니다.<br />
                    MA50: 최근 50거래일 종가 평균. 중기 추세를 나타냅니다.<br />
                    현재가가 이동평균선 위에 있으면 상승 추세, 아래면 하락 추세로 봅니다.
                  </p>
                </TooltipContent>
              </Tooltip>
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
                <p className="text-xs mt-1 flex items-center gap-1 flex-wrap">
                  {stock.ma20 > stock.ma50 ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-blue-400 cursor-help">↑ 단기MA &gt; 장기MA (골든크로스 구조)</span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="max-w-[200px] leading-relaxed">골든크로스: 단기 이동평균(MA20)이 장기(MA50)를 위로 돌파한 구조. 상승 추세 전환의 신호로 해석합니다.</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-red-400 cursor-help">↓ 단기MA &lt; 장기MA (데드크로스 구조)</span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="max-w-[200px] leading-relaxed">데드크로스: 단기 이동평균(MA20)이 장기(MA50) 아래로 떨어진 구조. 하락 추세의 신호로 해석합니다.</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {stock.volumeRatio !== null && stock.volumeRatio >= 1.5 && (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="text-yellow-400 cursor-help">· 거래량 {stock.volumeRatio.toFixed(1)}× 급증</span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="max-w-[200px] leading-relaxed">최근 20거래일 평균 거래량 대비 현재 거래량이 {stock.volumeRatio.toFixed(1)}배입니다. 거래량 급증은 가격 움직임의 신뢰도를 높입니다.</p>
                      </TooltipContent>
                    </Tooltip>
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
  tip,
}: {
  label: string
  value: string
  valueClass?: string
  tip?: string
}) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
      {tip ? (
        <Tooltip>
          <TooltipTrigger>
            <p className="text-xs text-zinc-400 mb-1 inline-flex items-center gap-1 cursor-help">
              {label}
              <span className="text-zinc-600 text-[10px]">?</span>
            </p>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="max-w-[200px] leading-relaxed">{tip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <p className="text-xs text-zinc-400 mb-1">{label}</p>
      )}
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
