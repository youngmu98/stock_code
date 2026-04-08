import { NextResponse } from 'next/server'
import { TICKERS, type Ticker, COMPANIES } from '@/lib/constants'
import { getStockQuote } from '@/lib/polygon'
import { getStockNews } from '@/lib/news'
import { determineSignal } from '@/lib/determineSignal'
import { unstable_cache } from 'next/cache'
import { RSI } from 'technicalindicators'
import type { StockAnalysis } from '@/lib/types'

// RSI만으로 점수 계산 (Groq 없이)
function rsiScore(rsi: number): number {
  if (rsi < 30) return 75
  if (rsi < 45) return 62
  if (rsi < 55) return 50
  if (rsi < 70) return 38
  return 25
}

const getPriceData = unstable_cache(
  async (ticker: string): Promise<StockAnalysis> => {
    const [quoteResult, newsResult] = await Promise.allSettled([
      getStockQuote(ticker),
      getStockNews(ticker),
    ])

    if (quoteResult.status === 'rejected') {
      throw new Error(quoteResult.reason?.message ?? 'PRICE_FETCH_FAILED')
    }

    const quote = quoteResult.value
    const rsiValues = RSI.calculate({ values: quote.closes, period: 14 })
    const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50
    const score = rsiScore(rsi)
    const newsItems = newsResult.status === 'fulfilled' ? newsResult.value : []

    return {
      ticker,
      companyName: COMPANIES[ticker] ?? ticker,
      currentPrice: quote.currentPrice,
      changePercent: quote.changePercent,
      rsi,
      signal: determineSignal(score),
      score,
      reasoning: '', // 다이얼로그 열 때 채워짐
      newsItems,
      lastUpdated: new Date().toISOString(),
      isStale: false,
    }
  },
  ['price-data'],
  { revalidate: 300 },
)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params
  const symbol = ticker.toUpperCase()

  if (!(TICKERS as readonly string[]).includes(symbol)) {
    return NextResponse.json({ error: 'Unknown ticker' }, { status: 404 })
  }

  try {
    const data = await getPriceData(symbol as Ticker)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
