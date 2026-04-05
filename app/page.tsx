import { Suspense } from 'react'
import { StockCard } from '@/components/StockCard'
import { Skeleton } from '@/components/ui/skeleton'
import { TICKERS } from '@/lib/constants'
import { MOCK_STOCKS } from '@/lib/mock-data'
import type { StockAnalysis } from '@/lib/types'

// API 키가 있으면 실제 데이터, 없으면 mock 사용
async function getStocks(): Promise<StockAnalysis[]> {
  if (!process.env.POLYGON_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return MOCK_STOCKS
  }

  const { analyzeStock } = await import('@/lib/analyzeStock')

  const results = await Promise.allSettled(
    TICKERS.map((ticker) => analyzeStock(ticker)),
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    // 개별 종목 실패 시 mock 데이터로 폴백
    return MOCK_STOCKS[i]
  })
}

function StockSkeleton() {
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

async function StockGrid() {
  const stocks = await getStocks()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {stocks.map((stock) => (
        <StockCard key={stock.ticker} stock={stock} />
      ))}
    </div>
  )
}

export default function Home() {
  const now = new Date().toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              주식 시그널 대시보드
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              AI + RSI 기반 매수/매도 시그널 · 카드 클릭 시 분석 근거 확인
            </p>
          </div>
          <p className="text-xs text-zinc-500">{now} 기준</p>
        </div>

        {/* 종목 카드 그리드 */}
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <StockSkeleton key={i} />
              ))}
            </div>
          }
        >
          <StockGrid />
        </Suspense>

        {/* 범례 */}
        <div className="mt-8 flex items-center gap-6 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            매수 (score &gt; 60)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
            관망 (score 40–60)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            매도 (score &lt; 40)
          </span>
          <span className="ml-auto">1시간 캐시 · RSI(14) + AI 뉴스 분석</span>
        </div>
      </div>
    </main>
  )
}
