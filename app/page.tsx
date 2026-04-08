'use client'

import { useState } from 'react'
import { TICKERS } from '@/lib/constants'
import { KR_TICKERS, KR_TICKERS_PER_PAGE, KR_TOTAL_PAGES, getKrTickersForPage } from '@/lib/kr-constants'
import { StockCard } from '@/components/StockCard'
import { KrStockCard } from '@/components/KrStockCard'
import { KrStockProvider, useKrStocks } from '@/components/KrStockProvider'

type Tab = 'US' | 'KR'

// 한국 탭 내부 (페이지네이션)
function KrTab() {
  const [page, setPage] = useState(1)
  const { hasApiKey } = useKrStocks()
  const tickers = getKrTickersForPage(page)

  if (!hasApiKey) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <p className="text-zinc-400 text-lg font-medium">한국투자증권 API 키가 필요합니다</p>
        <div className="text-sm text-zinc-500 space-y-1">
          <p>1. <a href="https://apiportal.koreainvestment.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">apiportal.koreainvestment.com</a> 에서 앱 등록</p>
          <p>2. Vercel 환경변수에 <code className="bg-zinc-800 px-1 rounded">KIS_APP_KEY</code>, <code className="bg-zinc-800 px-1 rounded">KIS_APP_SECRET</code> 추가</p>
          <p>3. 재배포 후 사용 가능</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 종목 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {tickers.map((ticker) => (
          <KrStockCard key={ticker} ticker={ticker} />
        ))}
      </div>

      {/* 페이지네이션 */}
      <div className="mt-8 flex items-center justify-center gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 disabled:opacity-30 hover:bg-zinc-700 transition-colors"
        >
          ←
        </button>
        {Array.from({ length: KR_TOTAL_PAGES }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              p === page
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => setPage((p) => Math.min(KR_TOTAL_PAGES, p + 1))}
          disabled={page === KR_TOTAL_PAGES}
          className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 disabled:opacity-30 hover:bg-zinc-700 transition-colors"
        >
          →
        </button>
        <span className="ml-2 text-xs text-zinc-500">
          {(page - 1) * KR_TICKERS_PER_PAGE + 1}–{Math.min(page * KR_TICKERS_PER_PAGE, KR_TICKERS.length)} / {KR_TICKERS.length}개
        </span>
      </div>
    </>
  )
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('US')

  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <KrStockProvider>
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">주식 시그널 대시보드</h1>
              <p className="text-sm text-zinc-400 mt-1">
                AI + RSI 기반 매수/매도 시그널 · 카드 클릭 시 상세 분석 확인
              </p>
            </div>
            <p className="text-xs text-zinc-500">{now} (한국시간)</p>
          </div>

          {/* 탭 */}
          <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-xl w-fit">
            <button
              onClick={() => setTab('US')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'US'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              🇺🇸 미국 주식
            </button>
            <button
              onClick={() => setTab('KR')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'KR'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              🇰🇷 한국 주식
            </button>
          </div>

          {/* 미국 탭 */}
          {tab === 'US' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {TICKERS.map((ticker) => (
                  <StockCard key={ticker} ticker={ticker} />
                ))}
              </div>
              <div className="mt-8 flex items-center gap-6 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  매수 (점수 &gt; 60)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
                  관망 (점수 40–60)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  매도 (점수 &lt; 40)
                </span>
                <span className="ml-auto">5분 캐시 · RSI(14) + MA20/50 + Groq 분석</span>
              </div>
            </>
          )}

          {/* 한국 탭 */}
          {tab === 'KR' && (
            <>
              <KrTab />
              <div className="mt-6 flex items-center gap-6 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  매수 (점수 &gt; 60)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
                  관망 (점수 40–60)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  매도 (점수 &lt; 40)
                </span>
                <span className="ml-auto">5분 캐시 · KIS API · RSI(14) + MA20/50 + Groq 분석</span>
              </div>
            </>
          )}
        </div>
      </main>
    </KrStockProvider>
  )
}
