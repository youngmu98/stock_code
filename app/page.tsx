import { TICKERS } from '@/lib/constants'
import { StockCard } from '@/components/StockCard'
import { AutoRefresh } from '@/components/AutoRefresh'

export default function Home() {
  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* 5분마다 자동 새로고침 */}
      <AutoRefresh intervalMs={300_000} />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              주식 시그널 대시보드
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              AI + RSI 기반 매수/매도 시그널 · 카드 클릭 시 뉴스 요약 및 전망 확인
            </p>
          </div>
          <p className="text-xs text-zinc-500">{now} (한국시간) 기준</p>
        </div>

        {/* 종목 카드 그리드 — 각 카드가 독립적으로 API 호출 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {/* 300ms 간격으로 순차 요청 → Gemini 15 RPM 제한 내 유지 */}
          {TICKERS.map((ticker, i) => (
            <StockCard key={ticker} ticker={ticker} delay={i * 300} />
          ))}
        </div>

        {/* 범례 */}
        <div className="mt-8 flex items-center gap-6 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            매수 (AI 점수 &gt; 60)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
            관망 (AI 점수 40–60)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            매도 (AI 점수 &lt; 40)
          </span>
          <span className="ml-auto">5분 캐시 · RSI(14) + Claude Haiku 4.5 분석</span>
        </div>
      </div>
    </main>
  )
}
